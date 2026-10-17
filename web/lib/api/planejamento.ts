import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { etapaDe } from '../fluxo';
import { audit, getRow, insertRow, listRows, modifyRow, notifyAssignment, trashRow, updateRow } from '../records';
import { addDays, fail, fmtDate, lower, now, parseLocal, Row, strv } from '../util';
import { json } from './handlers';
import { criarSolicitacaoInterna, prazoEfetivo } from './solicitacoes';

/**
 * Planejamento: o que o marketing pretende realizar (ações). As ações são registros do módulo `projetos` (os projetos que já existiam
 * passam a ser as ações de Planejamento: nada foi copiado nem apagado). Solicitações são os pedidos a executar e continuam sendo gerenciadas só em
 * Solicitações: aqui há apenas o vínculo (`planejamentoId`, guardado NA solicitação/conteúdo, nunca duplicado na ação).
 * Três situações simples: Planejado, Em execução, Finalizado (mapeadas sobre o campo status já existente). Arquivar é um sinalizador à parte.
 */
export const CATEGORIAS_PLANO: [string, string][] = [['CAMPANHAS', 'Campanhas'], ['CONTEUDOS', 'Conteúdos'], ['EVENTOS', 'Eventos'], ['PROJETOS', 'Projetos'], ['INSTITUCIONAL', 'Ações institucionais']];
export const SEGMENTOS_PLANO = ['Geral', 'Infantil', 'Anos Iniciais', 'Anos Finais', 'Ensino Médio', 'Administrativo', 'Direção'];
const STATUS_DA: Record<string, string> = { PLANEJADO: 'PLANEJAMENTO', EXECUCAO: 'EM ANDAMENTO', FINALIZADO: 'CONCLUÍDO' };
const SEG_SOLICITACAO: Record<string, string> = { Infantil: 'Infantil', 'Anos Iniciais': 'Anos Iniciais', 'Anos Finais': 'Anos Finais', 'Ensino Médio': 'Ensino Médio' };
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fmtDate(parseLocal(s + 'T12:00:00')) === s;
const dias = (a: string, b: string) => Math.round((parseLocal(b + 'T12:00:00').getTime() - parseLocal(a + 'T12:00:00').getTime()) / 86400000);
const somar = (s: string, n: number) => fmtDate(addDays(parseLocal(s + 'T12:00:00'), n));
const sim = (v: unknown) => ['SIM', '1', 'TRUE', 'S'].includes(strv(v).trim().toUpperCase());

export function situacaoDe(r: Row): 'PLANEJADO' | 'EXECUCAO' | 'FINALIZADO' {
  const s = strv(r.status).toUpperCase();
  if (['CONCLUÍDO', 'CONCLUIDO', 'ARQUIVADO'].includes(s)) return 'FINALIZADO';
  if (['EM ANDAMENTO', 'EM RISCO', 'PAUSADO'].includes(s)) return 'EXECUCAO';
  return 'PLANEJADO';
}
const arquivada = (r: Row) => sim(r.arquivada) || strv(r.status).toUpperCase() === 'ARQUIVADO';
const podeEditar = (u: Row, r: Row) => u.role === 'manager' || strv(r.criadoPor) === String(u.codigo) || (strv(r.responsavel).trim() !== '' && lower(strv(r.responsavel).trim()) === lower(String(u.nome)));

interface Vinculos { solicitacoes: Row[]; conteudos: Row[] }
function montar(r: Row, hoje: string, v: Vinculos, evento: Row | null): Row {
  const situacao = situacaoDe(r), fim = strv(r.prazo) || strv(r.dataInicio);
  const sols = v.solicitacoes.map((s) => ({ id: s.id, titulo: s.titulo, status: s.status, etapa: etapaDe(strv(s.status)), responsavel: s.responsavel ?? '', prazo: prazoEfetivo(s), atrasada: etapaDe(strv(s.status)) !== 'CONCLUIDO' && prazoEfetivo(s) !== '' && prazoEfetivo(s) < hoje }));
  const dentro7 = fim && fim >= hoje && fim <= somar(hoje, 7);
  return {
    id: r.id, titulo: r.titulo, objetivo: strv(r.objetivo), segmento: strv(r.segmento) || 'Geral', categoria: strv(r.categoriaPlano) || 'PROJETOS',
    dataInicio: strv(r.dataInicio), dataFim: fim, responsavel: strv(r.responsavel), observacoes: strv(r.observacoes), descricao: strv(r.descricao),
    situacao, statusOriginal: strv(r.status), arquivada: arquivada(r), calendarioMkt: sim(r.calendarioMkt),
    atrasada: situacao !== 'FINALIZADO' && fim !== '' && fim < hoje, proximaDoPrazo: situacao !== 'FINALIZADO' && !!dentro7,
    eventoEscolar: evento ? { id: evento.id, titulo: evento.titulo, data: evento.dataInicio } : (strv(r.eventoEscolarId) || strv(r.eventoEscolarTitulo)) ? { id: strv(r.eventoEscolarId), titulo: strv(r.eventoEscolarTitulo) || '(evento removido)', data: strv(r.eventoEscolarData), removido: true } : null,
    dataComemorativa: strv(r.dataComemorativaId) ? { id: strv(r.dataComemorativaId), nome: strv(r.dataComemorativaNome), data: strv(r.dataComemorativaData) } : null,
    solicitacoes: sols,
    // andamento = contagem real das solicitações vinculadas; sem porcentagem inventada
    andamento: { total: sols.length, concluidas: sols.filter((s) => s.etapa === 'CONCLUIDO').length, emAndamento: sols.filter((s) => s.etapa === 'EM_ANDAMENTO' || s.etapa === 'EM_APROVACAO').length, pendentes: sols.filter((s) => s.etapa === 'PENDENTE').length, atrasadas: sols.filter((s) => s.atrasada).length },
    conteudos: v.conteudos.map((c) => ({ id: c.id, titulo: c.titulo, status: c.status, publicacaoEm: c.publicacaoEm ?? '' })),
    criadoPor: r.criadoPor ?? '', editavel: false,
  };
}

async function carregar(u: Row): Promise<Row[]> {
  const hoje = fmtDate(new Date());
  const sols = (await listRows('solicitacoes')).filter((s) => strv(s.planejamentoId));
  const cons = (await listRows('conteudos')).filter((s) => strv(s.planejamentoId));
  const eventos = new Map((await listRows('calescolar')).map((e) => [String(e.id), e]));
  return (await listRows('projetos')).map((r) => {
    const m = montar(r, hoje, { solicitacoes: sols.filter((s) => strv(s.planejamentoId) === String(r.id)), conteudos: cons.filter((s) => strv(s.planejamentoId) === String(r.id)) }, eventos.get(strv(r.eventoEscolarId)) ?? null);
    m.editavel = podeEditar(u, r);
    return m;
  });
}

function validar(b: Row): Row {
  const titulo = strv(b.titulo).trim();
  if (titulo.length < 3 || titulo.length > 140) fail(400, 'O título deve ter de 3 a 140 letras.');
  const categoria = strv(b.categoria).trim().toUpperCase() || 'PROJETOS';
  if (!CATEGORIAS_PLANO.some((c) => c[0] === categoria)) fail(400, 'Categoria inválida.');
  const segmento = strv(b.segmento).trim() || 'Geral';
  if (!SEGMENTOS_PLANO.includes(segmento)) fail(400, 'Segmento inválido.');
  const dataInicio = strv(b.dataInicio).trim();
  if (!dataValida(dataInicio)) fail(400, 'Informe a data inicial.');
  const dataFim = strv(b.dataFim).trim() || dataInicio;
  if (!dataValida(dataFim)) fail(400, 'Data final inválida.');
  if (dataFim < dataInicio) fail(400, 'A data final não pode ser antes da inicial.');
  if (dias(dataInicio, dataFim) > 730) fail(400, 'Uma ação pode durar no máximo 2 anos.');
  const objetivo = strv(b.objetivo).trim(), observacoes = strv(b.observacoes).trim();
  if (objetivo.length > 1000) fail(400, 'O objetivo deve ter até 1000 letras.');
  if (observacoes.length > 1000) fail(400, 'As observações devem ter até 1000 letras.');
  return { titulo, categoriaPlano: categoria, segmento, dataInicio, prazo: dataFim, objetivo, observacoes, responsavel: strv(b.responsavel).trim(), calendarioMkt: sim(b.calendarioMkt) ? 'SIM' : 'NAO' };
}
async function semDuplicata(d: Row, ignorarId = ''): Promise<void> {
  for (const r of await listRows('projetos')) {
    if (String(r.id) === ignorarId || arquivada(r)) continue;
    if (lower(strv(r.titulo).trim()) === lower(strv(d.titulo)) && strv(r.dataInicio) === strv(d.dataInicio) && (strv(r.categoriaPlano) || 'PROJETOS') === strv(d.categoriaPlano)) fail(409, `Essa ação já está planejada (${r.id}).`);
  }
}

export async function planejamentoRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  const u = await requireInternal(c);
  const gerente = u.role === 'manager';
  const hoje = fmtDate(new Date());
  const acao = async (id: string): Promise<Row> => (await getRow('projetos', strv(id))) ?? fail(404, 'Ação não encontrada.');
  const soEditor = (r: Row) => { if (!podeEditar(u, r)) fail(403, 'Só a Gerência, o responsável ou quem criou a ação pode alterá-la.'); };
  const devolve = async (id: string) => json((await carregar(u)).find((x) => x.id === id));

  if (path === '/planejamento/painel' && method === 'GET') {
    const equipe = (await listRows('equipe')).map((e) => strv(e.titulo).trim()).filter(Boolean);
    const eventos = (await listRows('calescolar')).filter((e) => strv(e.dataFim || e.dataInicio) >= somar(hoje, -90)).map((e) => ({ id: e.id, titulo: e.titulo, data: e.dataInicio })).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    return json({ acoes: await carregar(u), opcoes: { categorias: CATEGORIAS_PLANO, segmentos: SEGMENTOS_PLANO, responsaveis: [...new Set(equipe)].sort((a, b) => a.localeCompare(b, 'pt-BR')), eventosEscolares: eventos }, eu: { nome: u.nome, role: u.role, codigo: u.codigo }, hoje });
  }

  if (path === '/planejamento/salvar' && method === 'POST') {
    const b = await c.body();
    const id = strv(b.id).trim();
    const d = validar(b);
    if (d.responsavel && !gerente && lower(String(d.responsavel)) !== lower(String(u.nome))) fail(403, 'Só a Gerente atribui a outra pessoa.');
    const ev = strv(b.eventoEscolarId).trim();
    if (ev && !(await getRow('calescolar', ev))) fail(400, 'O evento escolar escolhido não existe mais.');
    const evRow = ev ? await getRow('calescolar', ev) : null;
    d.eventoEscolarId = ev;
    d.eventoEscolarTitulo = evRow ? strv(evRow.titulo) : '';
    d.eventoEscolarData = evRow ? strv(evRow.dataInicio) : '';
    await semDuplicata(d, id);
    if (!id) {
      const novo = await insertRow('projetos', { ...d, status: 'PLANEJAMENTO', prioridade: 'MÉDIA', origem: 'PLANEJAMENTO' }, u.codigo);
      await notifyAssignment('projetos', novo, null, String(u.nome));
      return json(novo, 201);
    }
    const cur = await acao(id);
    soEditor(cur);
    if (!gerente && lower(String(d.responsavel)) !== lower(strv(cur.responsavel)) && strv(cur.responsavel) !== '') fail(403, 'Só a Gerente troca o responsável.');
    const nw = await modifyRow('projetos', id, (r) => ({ ...r, ...d, atualizadoEm: now(), atualizadoPor: u.codigo }));
    await audit(String(u.codigo), 'editar', 'projetos', id);
    await notifyAssignment('projetos', nw, cur, String(u.nome));
    return devolve(id);
  }

  if (path === '/planejamento/situacao' && method === 'POST') {
    const b = await c.body();
    const r = await acao(strv(b.id));
    soEditor(r);
    const novo = STATUS_DA[strv(b.situacao).toUpperCase()] ?? fail(400, 'Escolha Planejado, Em execução ou Finalizado.');
    await updateRow('projetos', String(r.id), { status: novo }, String(u.codigo));
    return devolve(String(r.id));
  }

  if (path === '/planejamento/mover' && method === 'POST') {
    const b = await c.body();
    const r = await acao(strv(b.id));
    soEditor(r);
    const data = strv(b.data).trim();
    if (!dataValida(data)) fail(400, 'Data inválida.');
    const ini = strv(r.dataInicio) || data, fim = strv(r.prazo) || ini;
    await modifyRow('projetos', String(r.id), (x) => ({ ...x, dataInicio: data, prazo: somar(data, Math.max(0, dias(ini, fim))), atualizadoEm: now(), atualizadoPor: u.codigo }));
    await audit(String(u.codigo), 'reagendar', 'projetos', String(r.id));
    return devolve(String(r.id));
  }

  if (path === '/planejamento/duplicar' && method === 'POST') {
    const b = await c.body();
    const r = await acao(strv(b.id));
    const ini = strv(b.dataInicio).trim();
    if (!dataValida(ini)) fail(400, 'Informe a data inicial da nova ação.');
    const antigoIni = strv(r.dataInicio) || ini, antigoFim = strv(r.prazo) || antigoIni;
    const d: Row = { titulo: strv(r.titulo), categoriaPlano: strv(r.categoriaPlano) || 'PROJETOS', segmento: strv(r.segmento) || 'Geral', dataInicio: ini, prazo: somar(ini, Math.max(0, dias(antigoIni, antigoFim))), objetivo: strv(r.objetivo), observacoes: strv(r.observacoes), responsavel: strv(r.responsavel), calendarioMkt: strv(r.calendarioMkt) || 'NAO' };
    if (d.responsavel && !gerente && lower(String(d.responsavel)) !== lower(String(u.nome))) d.responsavel = String(u.nome);
    await semDuplicata(d);
    // cópia limpa: situação Planejado e sem vínculos (solicitações, conteúdos, evento ou data comemorativa de outro período)
    const novo = await insertRow('projetos', { ...d, status: 'PLANEJAMENTO', prioridade: 'MÉDIA', origem: 'PLANEJAMENTO', duplicadaDe: String(r.id) }, u.codigo);
    return json(novo, 201);
  }

  if (path === '/planejamento/arquivar' && method === 'POST') {
    const b = await c.body();
    const r = await acao(strv(b.id));
    soEditor(r);
    const arq = b.arquivar !== false && b.arquivar !== 'false';
    await modifyRow('projetos', String(r.id), (x) => ({ ...x, arquivada: arq ? 'SIM' : 'NAO', atualizadoEm: now(), atualizadoPor: u.codigo }));
    await audit(String(u.codigo), arq ? 'arquivar' : 'desarquivar', 'projetos', String(r.id));
    return devolve(String(r.id));
  }

  if (path === '/planejamento/excluir' && method === 'POST') {
    const r = await acao(strv((await c.body()).id));
    if (!gerente && strv(r.criadoPor) !== String(u.codigo)) fail(403, 'Só a Gerência ou quem criou a ação pode excluí-la.');
    // as solicitações e os conteúdos continuam existindo: só perdem o vínculo (nada fica apontando para uma ação inexistente)
    let soltos = 0;
    for (const mod of ['solicitacoes', 'conteudos']) {
      for (const x of await listRows(mod)) {
        if (strv(x.planejamentoId) === String(r.id)) { await modifyRow(mod, String(x.id), (y) => ({ ...y, planejamentoId: '', atualizadoEm: now() })); soltos++; }
      }
    }
    await trashRow('projetos', String(r.id), u.codigo);
    return json({ ok: true, vinculosDesfeitos: soltos });
  }

  // Cria uma ou mais solicitações a partir da ação; cada uma tem responsável, prazo e status próprios e é gerida só em Solicitações.
  if (path === '/planejamento/solicitar' && method === 'POST') {
    const b = await c.body();
    const r = await acao(strv(b.id));
    const itens = Array.isArray(b.itens) ? (b.itens as Row[]) : [];
    if (!itens.length) fail(400, 'Informe ao menos uma solicitação.');
    if (itens.length > 10) fail(400, 'Crie até 10 solicitações por vez.');
    const abertas = (await listRows('solicitacoes')).filter((s) => strv(s.planejamentoId) === String(r.id) && etapaDe(strv(s.status)) !== 'CONCLUIDO');
    const preparadas = itens.map((it) => {
      const texto = strv(it.texto).trim();
      if (texto.length < 3 || texto.length > 120) fail(400, 'Cada solicitação precisa de um nome (3 a 120 letras).');
      const prazo = strv(it.prazo).trim() || strv(r.prazo);
      if (prazo && !dataValida(prazo)) fail(400, 'Prazo inválido.');
      const resp = strv(it.responsavel).trim();
      if (resp && !gerente && lower(resp) !== lower(String(u.nome))) fail(403, 'Só a Gerente distribui para outras pessoas.');
      return { titulo: `${texto} — ${strv(r.titulo)}`, prazo, resp };
    });
    const vistos = new Set<string>();
    for (const p of preparadas) {
      const k = lower(p.titulo);
      if (vistos.has(k) || abertas.some((s) => lower(strv(s.titulo)) === k)) fail(409, `Já existe a solicitação "${p.titulo}" nesta ação.`);
      vistos.add(k);
    }
    const criadas: Row[] = [];
    for (const p of preparadas) {
      criadas.push(await criarSolicitacaoInterna(u, { titulo: p.titulo, descricao: `Ação planejada: ${strv(r.titulo)}${strv(r.objetivo) ? `\nObjetivo: ${strv(r.objetivo)}` : ''}`, prazo: p.prazo, responsavel: p.resp, prioridade: 'MÉDIA', segmento: SEG_SOLICITACAO[strv(r.segmento)] ?? '', solicitante: String(u.nome) }, { planejamentoId: String(r.id) }));
    }
    await audit(String(u.codigo), 'solicitar-do-plano', 'projetos', String(r.id));
    return json({ criadas }, 201);
  }

  // Vincula (ou solta) uma solicitação ou um conteúdo que já existe. O vínculo mora no registro filho; ele só pode estar em uma ação.
  if (path === '/planejamento/vincular' && method === 'POST') {
    const b = await c.body();
    const r = await acao(strv(b.id));
    const mod = strv(b.tipo) === 'conteudo' ? 'conteudos' : strv(b.tipo) === 'solicitacao' ? 'solicitacoes' : fail(400, 'Tipo inválido.');
    const alvo = (await getRow(mod, strv(b.alvoId))) ?? fail(404, 'Registro não encontrado.');
    const dono = gerente || strv(alvo.criadoPor) === String(u.codigo) || (strv(alvo.responsavel).trim() !== '' && lower(strv(alvo.responsavel).trim()) === lower(String(u.nome)));
    if (!dono) fail(403, 'Só a Gerência, o responsável ou quem criou o registro pode vinculá-lo.');
    const soltar = b.desvincular === true || b.desvincular === 'true';
    if (soltar) {
      if (strv(alvo.planejamentoId) !== String(r.id)) fail(409, 'Esse registro não está vinculado a esta ação.');
      await modifyRow(mod, String(alvo.id), (y) => ({ ...y, planejamentoId: '', atualizadoEm: now() }));
    } else {
      const atual = strv(alvo.planejamentoId);
      if (atual && atual !== String(r.id)) fail(409, `Esse registro já está ligado à ação ${atual}. Solte-o primeiro.`);
      await modifyRow(mod, String(alvo.id), (y) => ({ ...y, planejamentoId: String(r.id), atualizadoEm: now() }));
    }
    await audit(String(u.codigo), soltar ? 'desvincular' : 'vincular', 'projetos', String(r.id));
    return devolve(String(r.id));
  }

  // Cria o conteúdo (rascunho) já ligado à ação; a produção segue toda no módulo Conteúdos.
  if (path === '/planejamento/conteudo' && method === 'POST') {
    const b = await c.body();
    const r = await acao(strv(b.id));
    const titulo = strv(b.titulo).trim() || `Conteúdo — ${strv(r.titulo)}`;
    if (titulo.length < 3 || titulo.length > 140) fail(400, 'O título do conteúdo deve ter de 3 a 140 letras.');
    for (const x of await listRows('conteudos')) if (strv(x.planejamentoId) === String(r.id) && lower(strv(x.titulo)) === lower(titulo)) fail(409, `Esse conteúdo já está ligado à ação (${x.id}).`);
    const novo = await insertRow('conteudos', { titulo, status: 'IDEIA', segmento: strv(r.segmento) === 'Geral' ? '' : strv(r.segmento), responsavel: strv(r.responsavel), planejamentoId: String(r.id), descricao: `Criado a partir da ação planejada "${strv(r.titulo)}".` }, u.codigo);
    return json(novo, 201);
  }

  return fail(404, 'Rota não encontrada.');
}
