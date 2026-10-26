/**
 * Calendário Geral escolar: agendas do Google Agenda cadastradas no EVO MKT.
 * O Google é a fonte dos eventos. O EVO MKT só altera a agenda marcada como editável (a do Marketing) E em que a conta conectada
 * tem escrita de verdade; nas demais, nada é criado, editado, excluído nem movido (conferido no servidor, não só na tela).
 */
import { q, q1, run } from '../db';
import { listRows } from '../records';
import { intLog } from '../settings';
import { addDays, env, fail, fmtDate, now, parseLocal, Row, strv } from '../util';
import { gApiStatus, gConnected } from './google';
import { qsOf } from './http';

export const GRUPOS: [string, string, string][] = [
  ['INFANTIL', 'Educação Infantil (Maternais e Jardins)', '#00A1F3'],
  ['INICIAIS', 'Anos Iniciais (2º ao 5º ano)', '#FAB900'],
  ['FINAIS', 'Anos Finais (6º ao 9º ano)', '#FF7800'],
  ['MEDIO', 'Ensino Médio (1ª à 3ª série)', '#00275F'],
  ['GERAL', 'Geral / institucional', '#063996'],
];
const COR_GERAL = '#063996';
/** Cor fixa pelo segmento. Evento com mais de um segmento (ou sem segmento) usa a cor institucional. */
export const corDosGrupos = (gs: string[]) => (gs.length === 1 ? GRUPOS.find((g) => g[0] === gs[0])?.[2] ?? COR_GERAL : COR_GERAL);
const tz = () => env('TIMEZONE', 'America/Fortaleza');
const pad = (n: number) => String(n).padStart(2, '0');
const escreve = (papel: string) => ['owner', 'writer'].includes(papel);
/** A agenda do Marketing pode se chamar "Marketing", "AGENDA MKT" etc. */
export const ehAgendaMarketing = (nome: string) => /marketing|(^|[^a-z0-9])mkt([^a-z0-9]|$)/i.test(nome);

export class ErroAgenda extends Error {
  constructor(public http: number, message: string, public codigo = '') { super(message); }
}
/** Traduz a resposta do Google em erro claro. Nunca inclui tokens. */
function erroGoogle(st: number, j: any, ctx = ''): ErroAgenda {
  const motivo = String(j?.error?.errors?.[0]?.reason ?? j?.error?.status ?? '');
  if (st === 401) return new ErroAgenda(502, 'O acesso ao Google expirou ou foi revogado. Reconecte em Configurações › Google.', 'google_401');
  if (st === 403 && /rateLimit|quota/i.test(motivo)) return new ErroAgenda(429, 'O Google limitou as consultas. Tente de novo em instantes.', 'google_429');
  if (st === 403) return new ErroAgenda(403, 'A conta conectada não tem permissão para isto nesta agenda do Google.', 'google_403');
  if (st === 404 || st === 410) return new ErroAgenda(404, `${ctx || 'A agenda ou o evento'} não foi encontrado no Google (removido ou sem compartilhamento).`, 'google_404');
  if (st === 429) return new ErroAgenda(429, 'O Google limitou as consultas. Tente de novo em instantes.', 'google_429');
  if (st >= 500) return new ErroAgenda(502, 'O Google está instável agora. Tente de novo em instantes.', 'google_5xx');
  return new ErroAgenda(502, `O Google recusou o pedido (${st}${motivo ? ': ' + motivo : ''}).`, 'google_erro');
}
async function chamar(method: string, path: string, body: any = null, ctx = ''): Promise<any> {
  if (!(await gConnected())) throw new ErroAgenda(409, 'O Google não está conectado. Conecte em Configurações › Google.', 'google_off');
  let r: [number, any];
  try { r = await gApiStatus(method, path, body); } catch (e: any) {
    if (e instanceof ErroAgenda) throw e;
    throw new ErroAgenda(504, 'Não foi possível falar com o Google (rede ou tempo esgotado). Tente de novo.', 'google_rede');
  }
  if (r[0] >= 200 && r[0] < 300) return r[1];
  if (r[0] === 204) return {};
  throw erroGoogle(r[0], r[1], ctx);
}

// ---------- fuso e datas ----------
function offsetMin(dia: string): number {
  const d = new Date(dia + 'T12:00:00Z');
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: tz(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d)) p[x.type] = x.value;
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime()) / 60000);
}
/** Dia e hora locais (no fuso da escola) em formato RFC 3339 com o deslocamento correto daquele dia. */
export function rfc3339(dia: string, hora: string): string {
  const m = offsetMin(dia), a = Math.abs(m);
  return `${dia}T${hora}:00${m < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: tz(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function localDe(iso: string): { dia: string; hora: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { dia: String(iso).slice(0, 10), hora: String(iso).slice(11, 16) };
  const p: Record<string, string> = {};
  for (const x of FMT.formatToParts(d)) p[x.type] = x.value;
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fmtDate(parseLocal(s + 'T12:00:00')) === s;
const horaValida = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const soma = (s: string, n: number) => fmtDate(addDays(parseLocal(s + 'T12:00:00'), n));

// ---------- agendas cadastradas ----------
export interface Agenda { calendar_id: string; nome: string; grupo: string; papel: string; editavel: number; ativa: number; status: string; erro: string; ultima_sync: string }
export const agendasCadastradas = async (): Promise<Agenda[]> => (await q('SELECT * FROM google_agendas ORDER BY nome')) as unknown as Agenda[];
const agendaDe = async (id: string): Promise<Agenda> => ((await q1('SELECT * FROM google_agendas WHERE calendar_id=?', [id])) as unknown as Agenda) ?? (fail(404, 'Agenda não cadastrada no EVO MKT.') as never);
const podeAlterar = (a: Agenda) => !!a.ativa && !!a.editavel && escreve(a.papel);
export const agendaPublica = (a: Agenda) => ({ id: a.calendar_id, nome: a.nome, grupo: a.grupo, cor: corDosGrupos([a.grupo]), papel: a.papel, permissao: podeAlterar(a) ? 'edicao' : 'leitura', editavel: !!a.editavel, ativa: !!a.ativa, status: a.status, erro: a.erro, ultimaSync: a.ultima_sync });
const grupoPeloNome = (nome: string): string => {
  const t = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/matern|jardin|jardim|infantil/.test(t)) return 'INFANTIL';
  if (/iniciais/.test(t)) return 'INICIAIS';
  if (/finais/.test(t)) return 'FINAIS';
  if (/medio/.test(t)) return 'MEDIO';
  return 'GERAL';
};
/** Todas as agendas da conta Google conectada (todas as páginas). */
export async function agendasDaConta(): Promise<Row[]> {
  const out: Row[] = []; let tok = '';
  do {
    const j = await chamar('GET', '/calendar/v3/users/me/calendarList?' + qsOf({ maxResults: 250, showHidden: 'true', ...(tok ? { pageToken: tok } : {}) }), null, 'A lista de agendas');
    out.push(...((j.items ?? []) as Row[])); tok = String(j.nextPageToken ?? '');
  } while (tok);
  return out;
}
const nomeDe = (i: Row) => String(i.summaryOverride || i.summary || i.id);

export async function agendaAdicionar(id: string, ator: string): Promise<Agenda> {
  const cal = id.trim();
  if (!cal || cal.length > 190 || /[\s]/.test(cal)) fail(400, 'Informe o ID da agenda (ex.: algo@group.calendar.google.com).');
  if (await q1('SELECT 1 FROM google_agendas WHERE calendar_id=?', [cal])) fail(409, 'Esta agenda já está cadastrada.');
  let item: Row | null = null;
  try { item = (await chamar('GET', `/calendar/v3/users/me/calendarList/${encodeURIComponent(cal)}`, null, 'A agenda')) as Row; } catch (e: any) {
    if (!(e instanceof ErroAgenda) || e.http !== 404) throw e;
    // ainda não está na lista da conta: tenta incluí-la (só funciona se foi compartilhada com a conta conectada)
    try { item = (await chamar('POST', '/calendar/v3/users/me/calendarList', { id: cal }, 'A agenda')) as Row; } catch { throw new ErroAgenda(404, 'Não encontrei essa agenda. Confira o ID e se ela foi compartilhada com a conta Google conectada.', 'google_404'); }
  }
  const nome = nomeDe(item), papel = String(item.accessRole ?? 'reader');
  const editavel = ehAgendaMarketing(nome) && escreve(papel) ? 1 : 0;
  await run('INSERT INTO google_agendas(calendar_id,nome,grupo,papel,editavel,ativa,status,erro,ultima_sync,criado_em) VALUES(?,?,?,?,?,?,?,?,?,?)', [cal, nome.slice(0, 160), grupoPeloNome(nome), papel, editavel, 1, 'SINCRONIZADA', '', now(), now()]);
  await intLog('google', 'ok', `Agenda cadastrada: ${nome} (${papel}) por ${ator}`);
  return agendaDe(cal);
}
export async function agendaAtualizar(id: string, b: Row): Promise<Agenda> {
  const a = await agendaDe(id);
  const grupo = b.grupo === undefined ? a.grupo : strv(b.grupo).toUpperCase();
  if (!GRUPOS.some((g) => g[0] === grupo)) fail(400, 'Segmento inválido.');
  const editavel = b.editavel === undefined ? a.editavel : b.editavel ? 1 : 0;
  if (editavel && !escreve(a.papel)) fail(409, 'A conta conectada só lê esta agenda no Google; não dá para liberar a edição.');
  const ativa = b.ativa === undefined ? a.ativa : b.ativa ? 1 : 0;
  await run('UPDATE google_agendas SET grupo=?,editavel=?,ativa=? WHERE calendar_id=?', [grupo, editavel, ativa, id]);
  cacheEventos.clear(); falhasRecentes.clear();
  return agendaDe(id);
}
export async function agendaRemover(id: string): Promise<void> {
  await agendaDe(id);
  await run('DELETE FROM google_agendas WHERE calendar_id=?', [id]); // só o cadastro; nenhum evento é apagado no Google nem aqui
  cacheEventos.clear(); falhasRecentes.clear();
}
/** Confere no Google o papel e a existência de cada agenda cadastrada. Perdeu a escrita: a edição é desligada. */
export async function agendasVerificar(): Promise<Agenda[]> {
  const conta = new Map((await agendasDaConta()).map((i) => [String(i.id), i]));
  for (const a of await agendasCadastradas()) {
    const i = conta.get(a.calendar_id);
    if (!i) { await run('UPDATE google_agendas SET status=?,erro=?,editavel=0 WHERE calendar_id=?', ['SEM_ACESSO', 'A agenda foi removida ou deixou de ser compartilhada com a conta conectada.', a.calendar_id]); continue; }
    const papel = String(i.accessRole ?? 'reader');
    await run('UPDATE google_agendas SET nome=?,papel=?,editavel=?,status=?,erro=?,ultima_sync=? WHERE calendar_id=?', [nomeDe(i).slice(0, 160), papel, escreve(papel) ? a.editavel : 0, 'SINCRONIZADA', '', now(), a.calendar_id]);
  }
  cacheEventos.clear(); falhasRecentes.clear();
  return agendasCadastradas();
}

// ---------- eventos ----------
const cacheEventos = new Map<string, { em: number; itens: Row[]; avisos: Row[] }>();
/** Agenda que acabou de falhar não é consultada de novo por 60 s (evita esperar as tentativas do Google a cada troca de tela); o aviso continua visível. */
const falhasRecentes = new Map<string, { em: number; msg: string }>();
function normalizar(ev: Row, a: Agenda): Row {
  const diaInteiro = !!ev.start?.date;
  const ini = diaInteiro ? { dia: String(ev.start.date), hora: '' } : localDe(String(ev.start?.dateTime ?? ''));
  let fim: { dia: string; hora: string };
  if (diaInteiro) fim = { dia: soma(String(ev.end?.date ?? ev.start.date), -1), hora: '' };
  else fim = localDe(String(ev.end?.dateTime ?? ev.start?.dateTime ?? ''));
  if (fim.dia < ini.dia) fim = { ...fim, dia: ini.dia };
  const priv = (ev.extendedProperties?.private ?? {}) as Row;
  const segs = strv(priv.evoSegmentos).split(',').map((x) => x.trim()).filter((x) => GRUPOS.some((g) => g[0] === x));
  const grupos = segs.length ? segs : [a.grupo];
  return {
    id: `${a.calendar_id}|${ev.id}`, calendarId: a.calendar_id, eventId: String(ev.id), serieId: String(ev.recurringEventId ?? ''), recorrente: !!ev.recurringEventId || !!ev.recurrence,
    titulo: String(ev.summary ?? '(sem título)'), dia: ini.dia, diaFim: fim.dia, diaInteiro, horaInicio: ini.hora, horaFim: fim.hora,
    local: String(ev.location ?? ''), descricao: String(ev.description ?? ''), segmentos: grupos, cor: corDosGrupos(grupos),
    participantes: ((ev.attendees ?? []) as Row[]).map((x) => ({ nome: String(x.displayName ?? ''), email: String(x.email ?? '') })).slice(0, 50),
    anexos: ((ev.attachments ?? []) as Row[]).map((x) => ({ titulo: String(x.title ?? 'Anexo'), url: String(x.fileUrl ?? '') })).filter((x) => /^https:\/\//.test(x.url)),
    agenda: a.nome, agendaGrupo: a.grupo, podeAlterar: podeAlterar(a), link: String(ev.htmlLink ?? ''), criadoPor: strv(priv.evoCriadoPor),
  };
}
/** Eventos de todas as agendas ativas na janela [de, ate]: todas as páginas, fuso da escola, falha de uma agenda não derruba as outras. */
export async function eventosAgendas(de: string, ate: string): Promise<{ itens: Row[]; avisos: Row[] }> {
  if (!dataValida(de) || !dataValida(ate) || ate < de) fail(400, 'Período inválido.');
  if (soma(de, 400) < ate) fail(400, 'Peça no máximo 13 meses por vez.');
  const ags = (await agendasCadastradas()).filter((a) => a.ativa);
  const itens: Row[] = [], avisos: Row[] = [];
  if (!ags.length) return { itens, avisos };
  if (!(await gConnected())) return { itens, avisos: [{ agenda: '', mensagem: 'O Google não está conectado. Conecte em Configurações › Google.' }] };
  await Promise.all(ags.map(async (a) => {
    const chave = `${a.calendar_id}|${de}|${ate}`, c = cacheEventos.get(chave), fr = falhasRecentes.get(a.calendar_id);
    if (c && Date.now() - c.em < 60000) { itens.push(...c.itens); avisos.push(...c.avisos); return; }
    if (fr && Date.now() - fr.em < 60000) { avisos.push({ agenda: a.nome, mensagem: fr.msg }); return; }
    const meus: Row[] = [], meusAvisos: Row[] = [];
    try {
      let tok = '', paginas = 0;
      do {
        const j = await chamar('GET', `/calendar/v3/calendars/${encodeURIComponent(a.calendar_id)}/events?` + qsOf({ maxResults: 250, singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', timeZone: tz(), timeMin: rfc3339(de, '00:00'), timeMax: rfc3339(soma(ate, 1), '00:00'), ...(tok ? { pageToken: tok } : {}) }), null, 'A agenda');
        for (const ev of (j.items ?? []) as Row[]) if (ev.status !== 'cancelled' && ev.start) meus.push(normalizar(ev, a));
        tok = String(j.nextPageToken ?? '');
      } while (tok && ++paginas < 40);
      if (tok) meusAvisos.push({ agenda: a.nome, mensagem: 'Há eventos demais nesta janela; mostrando os primeiros. Reduza o período.' });
      await run('UPDATE google_agendas SET status=?,erro=?,ultima_sync=? WHERE calendar_id=?', ['SINCRONIZADA', '', now(), a.calendar_id]);
    } catch (e: any) {
      const msg = e instanceof ErroAgenda ? e.message : 'Falha ao ler a agenda.';
      await run('UPDATE google_agendas SET status=?,erro=? WHERE calendar_id=?', [e?.codigo === 'google_404' ? 'SEM_ACESSO' : 'ERRO', msg.slice(0, 400), a.calendar_id]);
      meusAvisos.push({ agenda: a.nome, mensagem: msg });
      falhasRecentes.set(a.calendar_id, { em: Date.now(), msg });
    }
    cacheEventos.set(chave, { em: Date.now(), itens: meus, avisos: meusAvisos });
    itens.push(...meus); avisos.push(...meusAvisos);
  }));
  itens.sort((x, y) => (String(x.dia) + (x.horaInicio || '00:00')).localeCompare(String(y.dia) + (y.horaInicio || '00:00')));
  return { itens, avisos };
}

// ---------- criar, editar e excluir (só agenda editável, com escrita real no Google) ----------
const RECORRENCIAS: Record<string, string> = { DIARIA: 'DAILY', SEMANAL: 'WEEKLY', MENSAL: 'MONTHLY', ANUAL: 'YEARLY' };
const LEMBRETES = [10, 30, 60, 1440, 2880];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export function validarEvento(b: Row, serie = false): Row {
  const titulo = strv(b.titulo).trim();
  if (titulo.length < 3 || titulo.length > 140) fail(400, 'O título deve ter de 3 a 140 letras.');
  const dia = strv(b.dia).trim(); if (!dataValida(dia)) fail(400, 'Data inválida.');
  const diaFim = strv(b.diaFim).trim() || dia; if (!dataValida(diaFim)) fail(400, 'Data final inválida.');
  if (diaFim < dia) fail(400, 'A data final não pode ser antes da inicial.');
  if (soma(dia, 120) < diaFim) fail(400, 'Um evento pode durar no máximo 120 dias.');
  const diaInteiro = !!b.diaInteiro;
  const horaInicio = strv(b.horaInicio).trim(), horaFim = strv(b.horaFim).trim();
  if (!diaInteiro) {
    if (!horaValida(horaInicio) || !horaValida(horaFim)) fail(400, 'Informe o horário inicial e o final (HH:MM).');
    if (diaFim === dia && horaFim <= horaInicio) fail(400, 'O horário final deve ser depois do inicial.');
  }
  const segmentos = [...new Set((Array.isArray(b.segmentos) ? b.segmentos : strv(b.segmentos).split(',')).map((x: unknown) => strv(x).trim().toUpperCase()).filter(Boolean))] as string[];
  if (!segmentos.length) fail(400, 'Escolha ao menos um segmento.');
  for (const s of segmentos) if (!GRUPOS.some((g) => g[0] === s)) fail(400, `Segmento inválido: ${s}.`);
  const descricao = strv(b.descricao).trim(), local = strv(b.local).trim();
  if (descricao.length > 1000) fail(400, 'A descrição deve ter até 1000 letras.');
  if (local.length > 140) fail(400, 'O local deve ter até 140 letras.');
  const participantes = [...new Set((Array.isArray(b.participantes) ? b.participantes : []).map((x: unknown) => strv(x).trim().toLowerCase()).filter(Boolean))] as string[];
  if (participantes.length > 30) fail(400, 'No máximo 30 participantes.');
  for (const e of participantes) if (!EMAIL.test(e)) fail(400, `E-mail de participante inválido: ${e}.`);
  const lembretes = [...new Set((Array.isArray(b.lembretes) ? b.lembretes : []).map((x: unknown) => Number(x)))] as number[];
  if (lembretes.length > 3 || lembretes.some((m) => !LEMBRETES.includes(m))) fail(400, 'Lembrete inválido.');
  const recorrencia = strv(b.recorrencia).toUpperCase();
  if (recorrencia && !RECORRENCIAS[recorrencia]) fail(400, 'Repetição inválida.');
  const vezes = Number(b.recorrenciaVezes || 0);
  if (recorrencia && (!Number.isInteger(vezes) || vezes < 2 || vezes > 60)) fail(400, 'Informe de 2 a 60 repetições.');
  return { titulo, dia, diaFim, diaInteiro, horaInicio: diaInteiro ? '' : horaInicio, horaFim: diaInteiro ? '' : horaFim, segmentos, descricao, local, participantes, lembretes, recorrencia, vezes, serie };
}
function corpoGoogle(v: Row, ator: string, criando: boolean, mestre?: Row): Row {
  const fuso = tz();
  let inicio: Row, fim: Row;
  const ini = strv(v.dia), fimDia = strv(v.diaFim);
  if (v.diaInteiro) { inicio = { date: ini, dateTime: null }; fim = { date: soma(fimDia, 1), dateTime: null }; }
  else { inicio = { dateTime: rfc3339(ini, strv(v.horaInicio)), timeZone: fuso, date: null }; fim = { dateTime: rfc3339(fimDia, strv(v.horaFim)), timeZone: fuso, date: null }; }
  const body: Row = {
    summary: v.titulo, description: v.descricao, location: v.local, start: inicio, end: fim,
    reminders: v.lembretes.length ? { useDefault: false, overrides: (v.lembretes as number[]).map((m) => ({ method: 'popup', minutes: m })) } : { useDefault: true },
    extendedProperties: { private: { evoSegmentos: (v.segmentos as string[]).join(','), ...(criando ? { evoCriadoPor: ator } : {}) } },
  };
  if (v.participantes.length || !criando) body.attendees = (v.participantes as string[]).map((email) => ({ email }));
  if (criando && v.recorrencia) body.recurrence = [`RRULE:FREQ=${RECORRENCIAS[v.recorrencia as string]};COUNT=${v.vezes}`];
  void mestre;
  return body;
}
/** Regra do servidor: agenda cadastrada, ativa, liberada para edição E com escrita confirmada agora no Google. */
async function exigirEscrita(calendarId: string): Promise<Agenda> {
  const a = await agendaDe(calendarId);
  if (!a.ativa) fail(409, 'Esta agenda está desativada no EVO MKT.');
  if (!a.editavel) fail(403, `A agenda “${a.nome}” é somente leitura no EVO MKT: aqui só se altera a agenda do Marketing.`);
  let item: Row;
  try { item = (await chamar('GET', `/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`, null, 'A agenda')) as Row; } catch (e: any) {
    if (e instanceof ErroAgenda && e.http === 404) await run('UPDATE google_agendas SET status=?,erro=?,editavel=0 WHERE calendar_id=?', ['SEM_ACESSO', e.message.slice(0, 400), calendarId]);
    throw e;
  }
  const papel = String(item.accessRole ?? '');
  if (papel !== a.papel) await run('UPDATE google_agendas SET papel=? WHERE calendar_id=?', [papel, calendarId]);
  if (!escreve(papel)) { await run('UPDATE google_agendas SET editavel=0 WHERE calendar_id=?', [calendarId]); fail(403, 'A conta conectada não tem mais escrita nesta agenda no Google. A edição foi desligada.'); }
  return { ...a, papel };
}
export async function eventoCriar(b: Row, ator: string): Promise<Row> {
  const a = await exigirEscrita(strv(b.calendarId));
  const v = validarEvento(b);
  const ev = await chamar('POST', `/calendar/v3/calendars/${encodeURIComponent(a.calendar_id)}/events?sendUpdates=none`, corpoGoogle(v, ator, true), 'A agenda');
  if (!ev?.id) throw new ErroAgenda(502, 'O Google não confirmou a criação do evento.', 'google_sem_id'); // nunca anuncia sucesso sem a confirmação
  await run('INSERT INTO agenda_eventos(calendar_id,event_id,criado_por,criado_em) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE criado_por=VALUES(criado_por)', [a.calendar_id, String(ev.id), ator.slice(0, 120), now()]);
  cacheEventos.clear(); falhasRecentes.clear();
  return normalizar(ev, a);
}
export async function eventoEditar(b: Row, ator: string): Promise<Row> {
  const a = await exigirEscrita(strv(b.calendarId));
  const eventId = strv(b.eventId); if (!eventId) fail(400, 'Evento inválido.');
  const v = validarEvento(b), serie = strv(b.escopo) === 'serie';
  let alvo = eventId;
  const cur = (await chamar('GET', `/calendar/v3/calendars/${encodeURIComponent(a.calendar_id)}/events/${encodeURIComponent(eventId)}`, null, 'O evento')) as Row;
  if (serie && cur.recurringEventId) alvo = String(cur.recurringEventId);
  const corpo = corpoGoogle(v, ator, false);
  if (serie && alvo !== eventId) {
    // na série mantém a data de início da série e muda só o que vale para todas as ocorrências (textos e horário)
    const mestre = (await chamar('GET', `/calendar/v3/calendars/${encodeURIComponent(a.calendar_id)}/events/${encodeURIComponent(alvo)}`, null, 'A série')) as Row;
    const d0 = mestre.start?.date ? String(mestre.start.date) : localDe(String(mestre.start?.dateTime)).dia;
    const dur = Math.max(0, Math.round((parseLocal(strv(v.diaFim) + 'T12:00:00').getTime() - parseLocal(strv(v.dia) + 'T12:00:00').getTime()) / 86400000));
    const vv = { ...v, dia: d0, diaFim: soma(d0, dur) };
    Object.assign(corpo, corpoGoogle(vv, ator, false));
  }
  const ev = await chamar('PATCH', `/calendar/v3/calendars/${encodeURIComponent(a.calendar_id)}/events/${encodeURIComponent(alvo)}?sendUpdates=none`, corpo, 'O evento');
  if (!ev?.id) throw new ErroAgenda(502, 'O Google não confirmou a alteração do evento.', 'google_sem_id');
  cacheEventos.clear(); falhasRecentes.clear();
  return normalizar(ev, a);
}
export async function eventoExcluir(b: Row): Promise<void> {
  const a = await exigirEscrita(strv(b.calendarId));
  if (b.confirmar !== true) fail(400, 'Confirme a exclusão: o evento também será excluído no Google Agenda.');
  const eventId = strv(b.eventId); if (!eventId) fail(400, 'Evento inválido.');
  let alvo = eventId;
  if (strv(b.escopo) === 'serie') {
    const cur = (await chamar('GET', `/calendar/v3/calendars/${encodeURIComponent(a.calendar_id)}/events/${encodeURIComponent(eventId)}`, null, 'O evento')) as Row;
    if (cur.recurringEventId) alvo = String(cur.recurringEventId);
  }
  await chamar('DELETE', `/calendar/v3/calendars/${encodeURIComponent(a.calendar_id)}/events/${encodeURIComponent(alvo)}?sendUpdates=none`, null, 'O evento');
  await run('DELETE FROM agenda_eventos WHERE calendar_id=? AND event_id=?', [a.calendar_id, alvo]);
  cacheEventos.clear(); falhasRecentes.clear();
}
