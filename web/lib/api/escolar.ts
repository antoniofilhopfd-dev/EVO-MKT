import { Ctx } from '../ctx';
import { requireInternal, requireManager } from '../auth';
import { audit, deleteRow, getRow, insertRow, listRows, modifyRow } from '../records';
import { SEGMENTOS } from '../segmentos';
import { addDays, fail, fmtDate, lower, now, parseLocal, Row, strv } from '../util';
import { json } from './handlers';

/**
 * Calendário Escolar: eventos e atividades OFICIAIS do Colégio. Módulo próprio (`calescolar`), separado do Calendário de Marketing
 * e do futuro Calendário de Datas Comemorativas. Nenhum evento é criado pelo sistema: o calendário oficial é cadastrado pela Gerência.
 * SOMENTE LEITURA desde que o Calendário Geral passou a usar o Google Agenda: os eventos antigos continuam visíveis, mas ninguém cria, edita, move nem exclui por aqui.
 */
export const SEGMENTOS_ESCOLARES: [string, string][] = SEGMENTOS;
export const TIPOS_ESCOLARES: [string, string][] = [
  ['EVENTO', 'Evento escolar'], ['PROVA', 'Prova / avaliação'], ['PROJETO', 'Projeto pedagógico'], ['PASSEIO', 'Passeio / excursão'],
  ['REUNIAO_PAIS', 'Reunião de pais'], ['ESPORTIVA', 'Atividade esportiva'], ['CULTURAL', 'Apresentação cultural'],
  ['SOLENIDADE', 'Formatura / solenidade'], ['INSTITUCIONAL', 'Atividade institucional'], ['OUTRO', 'Outra atividade oficial'],
];
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
    const pubs = (await listRows('conteudos')).filter((p) => strv(p.origemTipo) === 'calescolar');
    const vinc: Record<string, Row[]> = {};
    for (const p of pubs) (vinc[String(p.origemId)] ??= []).push({ id: p.id, titulo: p.titulo, status: p.status });
    return json({
      rows: (await listRows('calescolar')).map((e) => ({ ...e, publicacoes: vinc[String(e.id)] ?? [] })),
      opcoes: { segmentos: SEGMENTOS_ESCOLARES, tipos: TIPOS_ESCOLARES },
      eu: { nome: u.nome, role: u.role }, podeEditar: false, hoje: fmtDate(new Date()),
    });
  }

  // Somente leitura: o Calendário Geral agora vive no Google Agenda e só a agenda do Marketing aceita alterações.
  if (['/escolar/salvar', '/escolar/mover', '/escolar/excluir'].includes(path) && method === 'POST') fail(403, 'Este calendário escolar anterior ficou somente leitura. Crie e edite eventos no Calendário Geral (agenda do Marketing no Google Agenda).');
  if (path === '/escolar/salvar' && method === 'POST') {
    await requireInternal(c);
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
    await requireInternal(c);
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
    await requireInternal(c);
    const id = strv((await c.body()).id);
    const r0 = (await getRow('calescolar', id)) ?? fail(404, 'Evento não encontrado.');
    // as publicações criadas a partir deste evento continuam; só perdem o vínculo (guardam título e data para histórico)
    let soltos = 0;
    for (const x of await listRows('conteudos')) {
      if (strv(x.origemTipo) === 'calescolar' && strv(x.origemId) === id) { await modifyRow('conteudos', String(x.id), (y) => ({ ...y, origemId: '', origemNome: strv(y.origemNome) || strv(r0.titulo), atualizadoEm: now() })); soltos++; }
    }
    await deleteRow('calescolar', id, u.codigo);
    return json({ ok: true, vinculosDesfeitos: soltos });
  }

  // Nova publicação a partir de um evento escolar: cria um Conteúdo (IDEIA) com título, data e origem; nunca é automático.
  if (path === '/escolar/publicacao' && method === 'POST') {
    const b = await c.body();
    const ev = (await getRow('calescolar', strv(b.id))) ?? fail(404, 'Evento não encontrado.');
    const titulo = (strv(b.titulo).trim() || `Publicação: ${ev.titulo}`).slice(0, 140);
    if (titulo.length < 3) fail(400, 'Dê um título à publicação.');
    for (const p of await listRows('conteudos')) {
      if (strv(p.origemTipo) === 'calescolar' && strv(p.origemId) === String(ev.id) && lower(strv(p.titulo)) === lower(titulo)) fail(409, `Essa publicação já existe (${p.id}).`);
    }
    const segs = listaSeg(ev.segmentos);
    const novo = await insertRow('conteudos', {
      titulo, status: 'IDEIA', canal: 'Instagram', publicacaoEm: strv(ev.dataInicio), segmento: segs.length === 1 ? rotulo(SEGMENTOS_ESCOLARES, segs[0]) : 'Todos',
      mensagem: `Evento escolar: ${ev.titulo} (${String(ev.dataInicio).split('-').reverse().join('/')}).`,
      origemTipo: 'calescolar', origemId: String(ev.id), origemData: strv(ev.dataInicio), origemNome: strv(ev.titulo), responsavel: strv(b.responsavel).trim(),
    }, u.codigo);
    await audit(String(u.codigo), 'publicacao-do-evento', 'calescolar', String(ev.id));
    return json(novo, 201);
  }

  return fail(404, 'Rota não encontrada.');
}
