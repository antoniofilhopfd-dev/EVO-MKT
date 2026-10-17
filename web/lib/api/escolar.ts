import { Ctx } from '../ctx';
import { requireInternal, requireManager } from '../auth';
import { audit, getRow, insertRow, listRows, modifyRow, trashRow } from '../records';
import { addDays, fail, fmtDate, lower, now, parseLocal, Row, strv } from '../util';
import { json } from './handlers';
import { criarSolicitacaoInterna } from './solicitacoes';

/**
 * Calendário Escolar: eventos e atividades OFICIAIS do Colégio. Módulo próprio (`calescolar`), separado do Calendário de Marketing
 * e do futuro Calendário de Datas Comemorativas. Nenhum evento é criado pelo sistema: o calendário oficial é cadastrado pela Gerência.
 * Consulta: toda a equipe. Cadastro, edição, reagendamento e exclusão: só a Gerência/Administração.
 */
export const SEGMENTOS_ESCOLARES: [string, string][] = [
  ['TODOS', 'Toda a escola'],
  ['INFANTIL', 'Educação Infantil — Maternais e Jardins'],
  ['FUND1', 'Ensino Fundamental — Anos Iniciais (1º ao 5º ano)'],
  ['FUND2', 'Ensino Fundamental — Anos Finais (6º ao 9º ano)'],
  ['MEDIO', 'Ensino Médio (1ª à 3ª série)'],
  ['ADMIN', 'Administrativo'],
  ['DIRECAO', 'Direção'],
];
export const TIPOS_ESCOLARES: [string, string][] = [
  ['EVENTO', 'Evento escolar'], ['PROVA', 'Prova / avaliação'], ['PROJETO', 'Projeto pedagógico'], ['PASSEIO', 'Passeio / excursão'],
  ['REUNIAO_PAIS', 'Reunião de pais'], ['ESPORTIVA', 'Atividade esportiva'], ['CULTURAL', 'Apresentação cultural'],
  ['SOLENIDADE', 'Formatura / solenidade'], ['INSTITUCIONAL', 'Atividade institucional'], ['OUTRO', 'Outra atividade oficial'],
];
/** Segmento do módulo Solicitações correspondente (as que não têm correspondente ficam sem segmento). */
const SEGMENTO_SOLICITACAO: Record<string, string> = { INFANTIL: 'Infantil', FUND1: 'Anos Iniciais', FUND2: 'Anos Finais', MEDIO: 'Ensino Médio' };
const ACOES: Record<string, { rotulo: string; antecedenciaDias: number }> = {
  cobertura_foto: { rotulo: 'Cobertura fotográfica', antecedenciaDias: 0 },
  video: { rotulo: 'Produção de vídeo', antecedenciaDias: 0 },
  arte: { rotulo: 'Arte de divulgação', antecedenciaDias: 7 },
};
const MAX_DIAS = 120;

const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fmtDate(parseLocal(s + 'T12:00:00')) === s;
const horaValida = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const diasEntre = (a: string, b: string) => Math.round((parseLocal(b + 'T12:00:00').getTime() - parseLocal(a + 'T12:00:00').getTime()) / 86400000);
const soDias = (s: string, n: number) => fmtDate(addDays(parseLocal(s + 'T12:00:00'), n));
const listaSeg = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : strv(v).split(/[|,]/)).map((x) => x.trim().toUpperCase()).filter(Boolean);
const rotulo = (pares: [string, string][], k: string) => pares.find((p) => p[0] === k)?.[1] ?? k;

/** Valida e normaliza os campos de um evento. Lança 400 com a mensagem do primeiro problema. */
export function validarEvento(b: Row): Row {
  const titulo = strv(b.titulo).trim();
  if (titulo.length < 3 || titulo.length > 140) fail(400, 'O título deve ter de 3 a 140 letras.');
  const dataInicio = strv(b.dataInicio).trim();
  if (!dataValida(dataInicio)) fail(400, 'Data inválida.');
  const dataFim = strv(b.dataFim).trim() || dataInicio;
  if (!dataValida(dataFim)) fail(400, 'Data final inválida.');
  if (dataFim < dataInicio) fail(400, 'A data final não pode ser antes da inicial.');
  if (diasEntre(dataInicio, dataFim) > MAX_DIAS) fail(400, `Um evento pode durar no máximo ${MAX_DIAS} dias.`);
  const horaInicio = strv(b.horaInicio).trim(), horaFim = strv(b.horaFim).trim();
  if (horaInicio && !horaValida(horaInicio)) fail(400, 'Horário inicial inválido.');
  if (horaFim && !horaValida(horaFim)) fail(400, 'Horário final inválido.');
  if (horaFim && !horaInicio) fail(400, 'Informe o horário inicial antes do final.');
  if (horaInicio && horaFim && dataFim === dataInicio && horaFim <= horaInicio) fail(400, 'O horário final deve ser depois do inicial.');
  let segs = listaSeg(b.segmentos);
  for (const s of segs) if (!SEGMENTOS_ESCOLARES.some((x) => x[0] === s)) fail(400, `Segmento inválido: ${s}.`);
  if (!segs.length || segs.includes('TODOS')) segs = ['TODOS'];
  segs = [...new Set(segs)].sort();
  const tipoEvento = strv(b.tipoEvento).trim().toUpperCase() || 'EVENTO';
  if (!TIPOS_ESCOLARES.some((x) => x[0] === tipoEvento)) fail(400, 'Tipo de evento inválido.');
  const local = strv(b.local).trim(), descricao = strv(b.descricao).trim();
  if (local.length > 140) fail(400, 'O local deve ter até 140 letras.');
  if (descricao.length > 1000) fail(400, 'A descrição deve ter até 1000 letras.');
  return { titulo, dataInicio, dataFim, horaInicio, horaFim, segmentos: segs.join('|'), tipoEvento, local, descricao };
}

async function exigirSemDuplicata(r: Row, ignorarId = ''): Promise<void> {
  const chave = `${lower(strv(r.titulo))}|${r.dataInicio}|${r.segmentos}`;
  for (const e of await listRows('calescolar')) {
    if (String(e.id) === ignorarId) continue;
    if (`${lower(strv(e.titulo).trim())}|${e.dataInicio}|${e.segmentos}` === chave) fail(409, `Este evento já está cadastrado (${e.id}).`);
  }
}

export async function escolarRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  const u = await requireInternal(c);

  if (path === '/escolar/painel' && method === 'GET') {
    const acoes = (await listRows('projetos')).filter((p) => strv(p.eventoEscolarId));
    const sols = (await listRows('solicitacoes')).filter((s) => strv(s.eventoEscolarId));
    const vinc: Record<string, Row[]> = {};
    for (const s of sols) (vinc[String(s.eventoEscolarId)] ??= []).push({ id: s.id, titulo: s.titulo, acao: s.eventoEscolarAcao, status: s.status });
    return json({
      rows: (await listRows('calescolar')).map((e) => ({ ...e, solicitacoes: vinc[String(e.id)] ?? [], acoes: acoes.filter((p) => strv(p.eventoEscolarId) === String(e.id)).map((p) => ({ id: p.id, titulo: p.titulo, status: p.status })) })),
      opcoes: { segmentos: SEGMENTOS_ESCOLARES, tipos: TIPOS_ESCOLARES, acoes: Object.entries(ACOES).map(([k, v]) => [k, v.rotulo]) },
      eu: { nome: u.nome, role: u.role }, podeEditar: u.role === 'manager', hoje: fmtDate(new Date()),
    });
  }

  if (path === '/escolar/salvar' && method === 'POST') {
    await requireManager(c);
    const b = await c.body();
    const dados = validarEvento(b);
    const id = strv(b.id).trim();
    await exigirSemDuplicata(dados, id);
    if (!id) {
      const novo = await insertRow('calescolar', dados, u.codigo);
      return json(novo, 201);
    }
    if (!(await getRow('calescolar', id))) fail(404, 'Evento não encontrado.');
    const nw = await modifyRow('calescolar', id, (cur) => ({ ...cur, ...dados, atualizadoEm: now(), atualizadoPor: u.codigo }));
    await audit(String(u.codigo), 'editar', 'calescolar', id);
    return json(nw);
  }

  if (path === '/escolar/mover' && method === 'POST') {
    await requireManager(c);
    const b = await c.body();
    const id = strv(b.id), data = strv(b.data).trim();
    const cur = (await getRow('calescolar', id)) ?? fail(404, 'Evento não encontrado.');
    if (!dataValida(data)) fail(400, 'Data inválida.');
    const delta = diasEntre(String(cur.dataInicio), data);
    const dados = validarEvento({ ...cur, dataInicio: data, dataFim: soDias(String(cur.dataFim || cur.dataInicio), delta) });
    await exigirSemDuplicata({ ...dados }, id);
    const nw = await modifyRow('calescolar', id, (r) => ({ ...r, dataInicio: dados.dataInicio, dataFim: dados.dataFim, atualizadoEm: now(), atualizadoPor: u.codigo }));
    await audit(String(u.codigo), 'reagendar', 'calescolar', id);
    return json(nw);
  }

  if (path === '/escolar/excluir' && method === 'POST') {
    await requireManager(c);
    const id = strv((await c.body()).id);
    const r0 = (await getRow('calescolar', id)) ?? fail(404, 'Evento não encontrado.');
    // as ações de Planejamento e as solicitações ligadas a este evento continuam; só perdem o vínculo (guardam título e data para histórico)
    let soltos = 0;
    for (const mod of ['projetos', 'solicitacoes']) {
      for (const x of await listRows(mod)) if (strv(x.eventoEscolarId) === id) { await modifyRow(mod, String(x.id), (y) => ({ ...y, eventoEscolarId: '', eventoEscolarTitulo: strv(y.eventoEscolarTitulo) || strv(r0.titulo), eventoEscolarData: strv(y.eventoEscolarData) || strv(r0.dataInicio), atualizadoEm: now() })); soltos++; }
    }
    await trashRow('calescolar', id, u.codigo); // vai para a Lixeira, de onde pode ser restaurado
    return json({ ok: true, vinculosDesfeitos: soltos });
  }

  // Pedido opcional ao Marketing a partir de um evento: nunca é automático e fica ligado ao evento de origem.
  if (path === '/escolar/solicitar' && method === 'POST') {
    const b = await c.body();
    const ev = (await getRow('calescolar', strv(b.id))) ?? fail(404, 'Evento não encontrado.');
    const acao = strv(b.acao);
    const a = ACOES[acao] ?? fail(400, 'Escolha o que solicitar: cobertura fotográfica, vídeo ou arte de divulgação.');
    const hoje = fmtDate(new Date());
    if (String(ev.dataFim || ev.dataInicio) < hoje) fail(409, 'Este evento já passou.');
    for (const s of await listRows('solicitacoes')) {
      if (strv(s.eventoEscolarId) === String(ev.id) && strv(s.eventoEscolarAcao) === acao && !['CONCLUÍDA', 'CANCELADA'].includes(strv(s.status).toUpperCase()))
        fail(409, `Já existe um pedido de ${a.rotulo.toLowerCase()} para este evento (${s.id}).`);
    }
    let prazo = strv(b.prazo).trim();
    if (prazo && !dataValida(prazo)) fail(400, 'Prazo inválido.');
    if (!prazo) { const p = soDias(String(ev.dataInicio), -a.antecedenciaDias); prazo = p < hoje ? hoje : p; }
    const segs = listaSeg(ev.segmentos);
    const segmento = segs.length === 1 ? SEGMENTO_SOLICITACAO[segs[0]] ?? '' : '';
    const quando = `${String(ev.dataInicio).split('-').reverse().join('/')}${ev.dataFim && ev.dataFim !== ev.dataInicio ? ' a ' + String(ev.dataFim).split('-').reverse().join('/') : ''}${ev.horaInicio ? ', ' + ev.horaInicio + (ev.horaFim ? '–' + ev.horaFim : '') : ''}`;
    const linhas = [`Evento escolar: ${ev.titulo}`, `Quando: ${quando}`, ev.local ? `Local: ${ev.local}` : '', `Público: ${segs.map((s) => rotulo(SEGMENTOS_ESCOLARES, s)).join(', ')}`, strv(b.observacao).trim() ? `Observação: ${strv(b.observacao).trim()}` : ''].filter(Boolean);
    const nova = await criarSolicitacaoInterna(u, { titulo: `${a.rotulo} — ${ev.titulo}`, descricao: linhas.join('\n'), segmento, prazo, prioridade: 'MÉDIA', solicitante: String(u.nome) },
      { eventoEscolarId: String(ev.id), eventoEscolarTitulo: strv(ev.titulo), eventoEscolarData: strv(ev.dataInicio), eventoEscolarAcao: acao });
    await audit(String(u.codigo), 'solicitar-do-evento', 'calescolar', String(ev.id));
    return json(nova, 201);
  }

  return fail(404, 'Rota não encontrada.');
}
