import { Ctx } from '../ctx';
import { q, run } from '../db';
import { requireInternal } from '../auth';
import { audit, getRow, insertRow, listRows, modifyRow, notifyAssignment, trashRow } from '../records';
import { CATALOGO, CATALOGO_POR_ID, CATEGORIAS_FERIADO, CATEGORIAS_PADRAO, descreverRegra, ehMovel, normalizarRegra, ocorrencia, Regra } from '../datasComemorativas';
import { fail, fmtDate, lower, now, Row, strv } from '../util';
import { json } from './handlers';
import { criarSolicitacaoInterna } from './solicitacoes';

/**
 * Datas Comemorativas (terceiro calendário). O catálogo e as regras ficam em lib/datasComemorativas.ts; aqui:
 *  - painel: calcula as ocorrências do ano pedido (e dos vizinhos) a partir das regras, sem gravar cada ano no banco;
 *  - datas personalizadas: registros do módulo `datacom` (uma linha por data, com a regra de recorrência);
 *  - relevância e observações sobre o catálogo: tabela datacom_ajustes; categorias criadas pela equipe: datacom_categorias;
 *  - vínculos opcionais: solicitação interna (módulo Solicitações) e ação no Planejamento (projeto), ambos só guardam a referência.
 * Nada é criado automaticamente.
 */
const SIMNAO = (v: unknown) => (['SIM', 'S', '1', 'TRUE'].includes(strv(v).trim().toUpperCase()) ? 'SIM' : 'NAO');
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const brData = (iso: string) => iso.split('-').reverse().join('/');

async function categorias(): Promise<{ codigo: string; nome: string; personalizada: boolean }[]> {
  const extras = (await q('SELECT codigo,nome FROM datacom_categorias ORDER BY nome')).map((r) => ({ codigo: String(r.codigo), nome: String(r.nome), personalizada: true }));
  return [...CATEGORIAS_PADRAO.map(([codigo, nome]) => ({ codigo, nome, personalizada: false })), ...extras];
}
function regraDoRegistro(r: Row): Regra | null {
  const n = (v: unknown) => Number(v);
  const t = strv(r.regraTipo);
  if (t === 'fixa') return { tipo: 'fixa', mes: n(r.regraMes), dia: n(r.regraDia) };
  if (t === 'nesimo') return { tipo: 'nesimo', mes: n(r.regraMes), n: n(r.regraN), diaSemana: n(r.regraDiaSemana) };
  if (t === 'pascoa') return { tipo: 'pascoa', offset: n(r.regraOffset) };
  if (t === 'mes') return { tipo: 'mes', mes: n(r.regraMes) };
  return null;
}
function camposDaRegra(r: Regra): Row {
  return { regraTipo: r.tipo, regraMes: 'mes' in r ? String(r.mes) : '', regraDia: r.tipo === 'fixa' ? String(r.dia) : '', regraN: r.tipo === 'nesimo' ? String(r.n) : '', regraDiaSemana: r.tipo === 'nesimo' ? String(r.diaSemana) : '', regraOffset: r.tipo === 'pascoa' ? String(r.offset) : '' };
}

interface Item { uid: string; id: string; origem: 'catalogo' | 'personalizada'; nome: string; categoria: string; data: string; fim?: string; regra: string; movel: boolean; relevante: 'SIM' | 'NAO'; relevanteAjustado: boolean; status: 'confirmada' | 'pendente'; fonte: string; baseLegal: string; descricao: string; observacoes: string; repeteAnual: boolean; editavel: boolean; regraDados?: Row; vinculos: { solicitacoes: Row[]; planejamento: Row[] } }

export async function ocorrencias(anoBase: number, u: Row): Promise<Item[]> {
  const ajustes = new Map((await q('SELECT catalogo_id,relevante,observacoes FROM datacom_ajustes')).map((r) => [String(r.catalogo_id), r]));
  const sols = (await listRows('solicitacoes')).filter((s) => strv(s.dataComemorativaId));
  const projs = (await listRows('projetos')).filter((s) => strv(s.dataComemorativaId));
  const vinc = (id: string, data: string) => ({
    solicitacoes: sols.filter((s) => strv(s.dataComemorativaId) === id && strv(s.dataComemorativaData) === data).map((s) => ({ id: s.id, titulo: s.titulo, status: s.status })),
    planejamento: projs.filter((s) => strv(s.dataComemorativaId) === id && strv(s.dataComemorativaData) === data).map((s) => ({ id: s.id, titulo: s.titulo, modulo: 'projetos', status: s.status })),
  });
  const out: Item[] = [];
  const anos = [anoBase - 1, anoBase, anoBase + 1];
  for (const c of CATALOGO) {
    const aj = ajustes.get(c.id);
    const rel = aj && strv(aj.relevante) ? (strv(aj.relevante) as 'SIM' | 'NAO') : c.relevante ? 'SIM' : 'NAO';
    for (const y of anos) {
      const oc = ocorrencia(c.regra, y);
      if (!oc) continue;
      out.push({ uid: `${c.id}@${oc.data}`, id: c.id, origem: 'catalogo', nome: c.nome, categoria: c.categoria, data: oc.data, fim: oc.fim, regra: descreverRegra(c.regra), movel: ehMovel(c.regra), relevante: rel, relevanteAjustado: !!(aj && strv(aj.relevante)), status: c.status, fonte: c.fonte, baseLegal: c.baseLegal, descricao: c.descricao ?? '', observacoes: aj ? strv(aj.observacoes) : '', repeteAnual: true, editavel: false, vinculos: vinc(c.id, oc.data) });
    }
  }
  for (const r of await listRows('datacom')) {
    const regra = regraDoRegistro(r);
    if (!regra) continue;
    const repete = strv(r.repeteAnual) !== 'NAO';
    const dono = true;
    for (const y of anos) {
      if (!repete && Number(r.ano) !== y) continue;
      const oc = ocorrencia(regra, y);
      if (!oc) continue;
      out.push({ uid: `${r.id}@${oc.data}`, id: String(r.id), origem: 'personalizada', nome: strv(r.titulo), categoria: strv(r.categoria), data: oc.data, fim: oc.fim, regra: descreverRegra(regra) + (repete ? '' : ` de ${r.ano}`), movel: ehMovel(regra), relevante: strv(r.relevante) === 'NAO' ? 'NAO' : 'SIM', relevanteAjustado: true, status: 'confirmada', fonte: 'Cadastrada pela equipe do Colégio.', baseLegal: '', descricao: strv(r.descricao), observacoes: strv(r.observacoes), repeteAnual: repete, editavel: dono, regraDados: { ...camposDaRegra(regra), repeteAnual: repete ? 'SIM' : 'NAO', ano: strv(r.ano) }, vinculos: vinc(String(r.id), oc.data) });
    }
  }
  return out;
}

async function validarPersonalizada(b: Row, ignorarId = ''): Promise<Row> {
  const titulo = strv(b.nome).trim();
  if (titulo.length < 3 || titulo.length > 100) fail(400, 'O nome da data deve ter de 3 a 100 letras.');
  const cats = await categorias();
  const categoria = strv(b.categoria).trim();
  if (!cats.some((c) => c.codigo === categoria)) fail(400, 'Escolha uma categoria da lista.');
  const { regra, erro } = normalizarRegra((b.regra ?? {}) as Row);
  if (!regra) return fail(400, erro ?? 'Regra inválida.');
  const repeteAnual = SIMNAO(b.repeteAnual ?? 'SIM');
  let ano = '';
  if (repeteAnual === 'NAO') {
    ano = strv(b.ano).trim();
    if (!/^\d{4}$/.test(ano) || Number(ano) < 1900 || Number(ano) > 2100) fail(400, 'Informe o ano (4 dígitos) das datas que não se repetem.');
    if (!ocorrencia(regra, Number(ano))) fail(400, 'Essa regra não cai no ano informado (ex.: 29/02 só existe em ano bissexto).');
  }
  const descricao = strv(b.descricao).trim(), observacoes = strv(b.observacoes).trim();
  if (descricao.length > 500) fail(400, 'A descrição deve ter até 500 letras.');
  if (observacoes.length > 1000) fail(400, 'As observações devem ter até 1000 letras.');
  const dados: Row = { titulo, categoria, ...camposDaRegra(regra), repeteAnual, ano, relevante: SIMNAO(b.relevante ?? 'SIM'), descricao, observacoes };
  // duplicidade: mesmo nome e mesma regra (inclusive contra o catálogo)
  const chave = `${lower(titulo)}|${JSON.stringify(regra)}|${repeteAnual}|${ano}`;
  for (const c of CATALOGO) if (lower(c.nome) === lower(titulo) && JSON.stringify(c.regra) === JSON.stringify(regra)) fail(409, 'Essa data já existe no catálogo.');
  for (const r of await listRows('datacom')) {
    if (String(r.id) === ignorarId) continue;
    const rg = regraDoRegistro(r);
    if (rg && `${lower(strv(r.titulo))}|${JSON.stringify(rg)}|${strv(r.repeteAnual) || 'SIM'}|${strv(r.ano)}` === chave) fail(409, `Essa data já está cadastrada (${r.id}).`);
  }
  return dados;
}

export async function datacomRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  const u = await requireInternal(c);

  if (path === '/datacom/painel' && method === 'GET') {
    const hoje = fmtDate(new Date());
    const anoPedido = Number(c.qs('ano'));
    const ano = Number.isInteger(anoPedido) && anoPedido >= 1900 && anoPedido <= 2100 ? anoPedido : Number(hoje.slice(0, 4));
    return json({ ano, hoje, itens: await ocorrencias(ano, u), categorias: await categorias(), grupoFeriados: CATEGORIAS_FERIADO, eu: { nome: u.nome, role: u.role, codigo: u.codigo } });
  }

  if (path === '/datacom/salvar' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id).trim();
    const dados = await validarPersonalizada(b, id);
    if (!id) return json(await insertRow('datacom', dados, u.codigo), 201);
    const cur = (await getRow('datacom', id)) ?? fail(404, 'Data não encontrada.');
    
    const nw = await modifyRow('datacom', id, (r) => ({ ...r, ...dados, atualizadoEm: now(), atualizadoPor: u.codigo }));
    await audit(String(u.codigo), 'editar', 'datacom', id);
    return json(nw);
  }

  if (path === '/datacom/excluir' && method === 'POST') {
    const id = strv((await c.body()).id);
    const cur = (await getRow('datacom', id)) ?? fail(404, 'Só datas cadastradas pela equipe podem ser excluídas (as do catálogo não).');
    
    await trashRow('datacom', id, u.codigo); // Lixeira: pode ser restaurada
    return json({ ok: true });
  }

  if (path === '/datacom/relevancia' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id).trim(), valor = strv(b.relevante).trim().toUpperCase();
    if (!['SIM', 'NAO', ''].includes(valor)) fail(400, 'Use SIM, NAO ou vazio (voltar ao padrão).');
    if (CATALOGO_POR_ID.has(id)) {
      const obs = 'observacoes' in b ? strv(b.observacoes).trim().slice(0, 1000) : null;
      const atual = await q('SELECT observacoes FROM datacom_ajustes WHERE catalogo_id=?', [id]);
      await run('INSERT INTO datacom_ajustes(catalogo_id,relevante,observacoes,atualizado_em,atualizado_por) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE relevante=VALUES(relevante),observacoes=VALUES(observacoes),atualizado_em=VALUES(atualizado_em),atualizado_por=VALUES(atualizado_por)', [id, valor, obs ?? (atual[0] ? String(atual[0].observacoes) : ''), now(), String(u.codigo)]);
      await audit(String(u.codigo), 'relevancia', 'datacom', id);
      return json({ ok: true });
    }
    const cur = (await getRow('datacom', id)) ?? fail(404, 'Data não encontrada.');
    if (valor === '') fail(400, 'Datas cadastradas pela equipe são sempre Relevante ou Não relevante.');
    await modifyRow('datacom', id, (r) => ({ ...r, relevante: valor, ...('observacoes' in b ? { observacoes: strv(b.observacoes).trim().slice(0, 1000) } : {}), atualizadoEm: now(), atualizadoPor: u.codigo }));
    void cur;
    return json({ ok: true });
  }

  if (path === '/datacom/categoria' && method === 'POST') {
    const nome = strv((await c.body()).nome).trim();
    if (nome.length < 3 || nome.length > 60) fail(400, 'O nome da categoria deve ter de 3 a 60 letras.');
    const todas = await categorias();
    if (todas.some((x) => lower(x.nome) === lower(nome))) fail(409, 'Já existe uma categoria com esse nome.');
    if (todas.filter((x) => x.personalizada).length >= 20) fail(409, 'Limite de 20 categorias criadas pela equipe.');
    const base = 'CAT_' + nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
    let codigo = base, i = 2;
    while (todas.some((x) => x.codigo === codigo)) codigo = `${base}_${i++}`;
    await run('INSERT INTO datacom_categorias(codigo,nome,criado_em,criado_por) VALUES(?,?,?,?)', [codigo, nome, now(), String(u.codigo)]);
    await audit(String(u.codigo), 'criar', 'datacom_categoria', codigo);
    return json({ codigo, nome, personalizada: true }, 201);
  }

  // Referência a uma ocorrência: confere se a data pedida é mesmo a do ano (evita criar vínculo com data inventada)
  const ocorrenciaDe = async (id: string, data: string): Promise<Item> => {
    if (!dataValida(data)) fail(400, 'Data inválida.');
    const item = (await ocorrencias(Number(data.slice(0, 4)), u)).find((x) => x.id === id && x.data === data);
    if (!item) fail(404, 'Essa data comemorativa não ocorre nesse dia.');
    if (item.status !== 'confirmada') fail(409, 'Esta data ainda está pendente de validação: confirme-a antes de criar ações ou solicitações.');
    return item;
  };

  if (path === '/datacom/solicitar' && method === 'POST') {
    const b = await c.body();
    const item = await ocorrenciaDe(strv(b.id), strv(b.data));
    const texto = strv(b.texto).trim() || 'Produzir arte para o Instagram';
    if (texto.length < 3 || texto.length > 120) fail(400, 'Descreva o que solicitar (3 a 120 letras).');
    const hoje = fmtDate(new Date());
    let prazo = strv(b.prazo).trim();
    if (prazo && !dataValida(prazo)) fail(400, 'Prazo inválido.');
    if (!prazo) {
      if ((item.fim ?? item.data) < hoje) fail(409, 'Essa data já passou neste ano; escolha um prazo ou outro ano.');
      const d = new Date(item.data + 'T12:00:00');
      d.setDate(d.getDate() - 2);
      const sug = fmtDate(d);
      prazo = sug < hoje ? hoje : sug;
    }
    const titulo = `${texto} — ${item.nome}`;
    for (const s of await listRows('solicitacoes')) {
      if (strv(s.dataComemorativaId) === item.id && strv(s.dataComemorativaData) === item.data && lower(strv(s.titulo)) === lower(titulo) && !['CONCLUÍDA', 'CANCELADA'].includes(strv(s.status).toUpperCase()))
        fail(409, `Já existe essa solicitação para esta data (${s.id}).`);
    }
    const descricao = [`Data comemorativa: ${item.nome}`, `Data: ${brData(item.data)}`, strv(b.observacao).trim() ? `Observação: ${strv(b.observacao).trim()}` : ''].filter(Boolean).join('\n');
    const nova = await criarSolicitacaoInterna(u, { titulo, descricao, prazo, prioridade: 'MÉDIA', responsavel: strv(b.responsavel).trim(), solicitante: String(u.nome) },
      { dataComemorativaId: item.id, dataComemorativaNome: item.nome, dataComemorativaData: item.data });
    await audit(String(u.codigo), 'solicitar-da-data', 'datacom', item.id);
    return json(nova, 201);
  }

  // Ação no Planejamento: cria um Projeto (status PLANEJAMENTO) que só guarda a referência à data; o cadastro da comemoração não é copiado.
  if (path === '/datacom/planejar' && method === 'POST') {
    const b = await c.body();
    const item = await ocorrenciaDe(strv(b.id), strv(b.data));
    const acao = strv(b.acao).trim() || `Ação para ${item.nome}`;
    if (acao.length < 3 || acao.length > 140) fail(400, 'Descreva a ação planejada (3 a 140 letras).');
    const prazo = strv(b.prazo).trim() || item.data;
    if (!dataValida(prazo)) fail(400, 'Prazo inválido.');
    const resp = strv(b.responsavel).trim();
    
    for (const p of await listRows('projetos')) {
      if (strv(p.dataComemorativaId) === item.id && strv(p.dataComemorativaData) === item.data && lower(strv(p.titulo)) === lower(acao)) fail(409, `Essa ação já está no Planejamento (${p.id}).`);
    }
    const novo = await insertRow('projetos', {
      titulo: acao, status: 'PLANEJAMENTO', prioridade: 'MÉDIA', responsavel: resp, prazo, dataInicio: prazo, categoriaPlano: ['CAMPANHAS', 'CONTEUDOS', 'EVENTOS', 'PROJETOS', 'INSTITUCIONAL'].includes(strv(b.categoria).toUpperCase()) ? strv(b.categoria).toUpperCase() : 'CONTEUDOS', segmento: 'Geral',
      descricao: `Ação planejada a partir da data comemorativa "${item.nome}" (${brData(item.data)}).` + (strv(b.observacao).trim() ? `\n${strv(b.observacao).trim()}` : ''),
      origem: 'DATA_COMEMORATIVA', dataComemorativaId: item.id, dataComemorativaNome: item.nome, dataComemorativaData: item.data,
    }, u.codigo);
    await notifyAssignment('projetos', novo, null, String(u.nome));
    await audit(String(u.codigo), 'planejar-da-data', 'datacom', item.id);
    return json(novo, 201);
  }

  return fail(404, 'Rota não encontrada.');
}
