import { createHash } from 'node:crypto';
import { q, run } from '../db';
import { getRow, insertRow, listRows, updateRow } from '../records';
import { intLog, setSetting, setting } from '../settings';
import { addDays, env, fmtDate, fmtDateTimeLocal, now, parseLocal, Row } from '../util';
import { httpCall, httpOk, publicUrl, qsOf, signState } from './http';

const gUrl = (key: string, def: string) => env(key, def).replace(/\/+$/, '');
const tz = () => env('TIMEZONE', 'America/Recife');
const md5 = (o: unknown) => createHash('md5').update(JSON.stringify(o)).digest('hex');
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

export async function gConnected(): Promise<boolean> {
  return (await setting('g_refresh_token')) !== '';
}
export async function gConnectUrl(): Promise<string> {
  if (!(await setting('g_client_id')) || !(await setting('g_client_secret'))) throw new Error('Informe o Client ID e o Client Secret do Google primeiro.');
  return `${gUrl('GOOGLE_AUTH_URL', 'https://accounts.google.com/o/oauth2/v2/auth')}?${qsOf({
    client_id: await setting('g_client_id'), redirect_uri: publicUrl() + '/api/integrations/google/callback', response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar openid email',
    access_type: 'offline', prompt: 'consent', state: signState('google'),
  })}`;
}
export async function gFinishConnect(code: string): Promise<void> {
  const j = httpOk(await httpCall('POST', gUrl('GOOGLE_TOKEN_URL', 'https://oauth2.googleapis.com/token'), FORM, qsOf({
    code, client_id: await setting('g_client_id'), client_secret: await setting('g_client_secret'),
    redirect_uri: publicUrl() + '/api/integrations/google/callback', grant_type: 'authorization_code',
  })), 'Google token');
  if (!j.refresh_token) throw new Error('O Google não devolveu o refresh token. Remova o acesso do app em myaccount.google.com/permissions e conecte de novo.');
  await setSetting('g_refresh_token', String(j.refresh_token));
  await setSetting('g_access_token', String(j.access_token ?? ''));
  await setSetting('g_access_expira', String(Math.floor(Date.now() / 1000) + Number(j.expires_in ?? 3000)));
  if (j.id_token) {
    try {
      const pl = JSON.parse(Buffer.from(String(j.id_token).split('.')[1] ?? '', 'base64url').toString());
      await setSetting('g_email', String(pl.email ?? ''));
    } catch { /* sem e-mail */ }
  }
  const email = await setting('g_email');
  await intLog('google', 'ok', 'Conectado' + (email ? ' como ' + email : ''));
}
async function gToken(): Promise<string> {
  if (!(await gConnected())) throw new Error('Google não conectado.');
  const cur = await setting('g_access_token');
  if (cur && (parseInt(await setting('g_access_expira', '0'), 10) || 0) - 60 > Date.now() / 1000) return cur;
  const j = httpOk(await httpCall('POST', gUrl('GOOGLE_TOKEN_URL', 'https://oauth2.googleapis.com/token'), FORM, qsOf({
    client_id: await setting('g_client_id'), client_secret: await setting('g_client_secret'), refresh_token: await setting('g_refresh_token'), grant_type: 'refresh_token',
  })), 'Google renovar acesso');
  await setSetting('g_access_token', String(j.access_token));
  await setSetting('g_access_expira', String(Math.floor(Date.now() / 1000) + Number(j.expires_in ?? 3000)));
  return String(j.access_token);
}
async function gApi(method: string, path: string, body: any = null, extra: Record<string, string> = {}): Promise<Row> {
  const base = gUrl('GOOGLE_API_BASE', 'https://www.googleapis.com');
  const h: Record<string, string> = { Authorization: 'Bearer ' + (await gToken()), ...extra };
  let payload: BodyInit | null = null;
  if (body !== null) {
    if (typeof body === 'string' || body instanceof Uint8Array) payload = body as BodyInit;
    else { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
  }
  const [st, j] = await httpCall(method, base + path, h, payload, 40);
  if (method === 'DELETE' && [204, 410, 404].includes(st)) return {};
  return httpOk([st, j], `Google ${method} ${path}`) as Row;
}

// ---------- Agenda ----------
export const GCAL_MODULES = ['calendario', 'conteudos'];
async function gCalendarId(): Promise<string> {
  const id = await setting('g_calendar_id');
  if (!id) throw new Error('Escolha a agenda do Google em Administração → Integrações (o sistema não cria agenda sozinho).');
  return id;
}
/** Agendas da conta conectada em que o sistema pode gravar (para escolher uma já existente). */
export async function gCalendarList(): Promise<Row[]> {
  const r = await gApi('GET', '/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250');
  const atual = await setting('g_calendar_id');
  return (r.items ?? []).map((i: Row) => ({ id: String(i.id), nome: String(i.summaryOverride || i.summary || i.id), principal: !!i.primary, atual: String(i.id) === atual }));
}
/** Passa a usar uma agenda existente. Vazio = desliga a sincronização da Agenda. */
export async function gCalendarChoose(id: string): Promise<void> {
  const novo = id.trim();
  if (novo) await gApi('GET', `/calendar/v3/calendars/${encodeURIComponent(novo)}`); // falha se não existir ou sem acesso
  if (novo === (await setting('g_calendar_id'))) return;
  await setSetting('g_calendar_id', novo);
  await run('DELETE FROM google_event_map'); // os vínculos eram da agenda anterior; os eventos lá ficam como estão
}
function gEventFromRow(mod: string, r: Row): Row | null {
  const label: Record<string, string> = { calendario: '', conteudos: '[Publicação] ' };
  const title = (label[mod] ?? '') + (r.titulo ?? r.id);
  const desc = [`Status: ${r.status || '—'}`, `Responsável: ${r.responsavel || '—'}`, r.segmento ? `Segmento: ${r.segmento}` : '', `Origem: EVO MKT ${r.id}`].filter(Boolean).join('\n');
  const ext = { private: { evoModule: mod, evoId: r.id } };
  let timed = '', end = '';
  if (mod === 'calendario') { timed = r.inicioEm || ''; end = r.fimEm || ''; }
  else if (mod === 'conteudos') timed = r.publicacaoEm || '';
  const diaInteiro = (mod === 'calendario') && /^s/i.test(String(r.diaInteiro ?? ''));
  if (timed && timed.length >= 16 && !diaInteiro) {
    const s = parseLocal(timed);
    let e = end ? parseLocal(end) : new Date(s.getTime() + 30 * 60000);
    if (e <= s) e = new Date(s.getTime() + 30 * 60000);
    return { summary: title, description: desc, start: { dateTime: now(s), timeZone: tz() }, end: { dateTime: now(e), timeZone: tz() }, extendedProperties: ext };
  }
  let d = String((mod === 'conteudos' ? r.publicacaoEm : r.dataInicio) ?? r.prazo ?? (diaInteiro ? timed : '')).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  let endDay = d;
  if ((mod === 'calendario') && /^\d{4}-\d{2}-\d{2}/.test(String(r.dataFim ?? '')) && String(r.dataFim).slice(0, 10) >= d) endDay = String(r.dataFim).slice(0, 10); // evento de vários dias
  if (mod === 'campanhas' && /^\d{4}-\d{2}-\d{2}/.test(String(r.prazo ?? '')) && String(r.prazo).slice(0, 10) >= d) endDay = String(r.prazo).slice(0, 10);
  return { summary: title, description: desc, start: { date: d }, end: { date: fmtDate(addDays(parseLocal(endDay + 'T12:00:00'), 1)) }, extendedProperties: ext };
}
const stripLabel = (s: string) => s.replace(/^\[(Evento|Conteúdo|Tarefa|Campanha)\]\s*/u, '');
function gApplyEventToRow(mod: string, row: Row, ev: Row): Row {
  const patch: Row = { titulo: stripLabel(String(ev.summary ?? row.titulo ?? '')) };
  const sdt = ev.start?.dateTime, sd = ev.start?.date;
  if (sdt) {
    const s = new Date(sdt);
    const e = ev.end?.dateTime ? new Date(ev.end.dateTime) : new Date(s.getTime() + 30 * 60000);
    if (mod === 'calendario') { patch.inicioEm = fmtDateTimeLocal(s); patch.fimEm = fmtDateTimeLocal(e); patch.dataInicio = fmtDate(s); }
    else if (mod === 'conteudos') patch.publicacaoEm = fmtDateTimeLocal(s);
    else patch.dataInicio = fmtDate(s);
  } else if (sd) {
    patch[mod === 'conteudos' ? 'publicacaoEm' : 'dataInicio'] = sd;
    // dia inteiro de vários dias: o Google guarda o fim como o dia seguinte ao último
    if ((mod === 'calendario') && ev.end?.date) {
      const ultimo = fmtDate(addDays(parseLocal(String(ev.end.date) + 'T12:00:00'), -1));
      patch.dataFim = ultimo > sd ? ultimo : '';
    }
  }
  return patch;
}
const closed = /CONCLU|CANCEL|ARQUIV/i;

export async function gCalendarSync(): Promise<Row> {
  const cal = encodeURIComponent(await gCalendarId());
  // Eventos criados direto no Google entram no Calendário (ligado por padrão; dá para desligar em Integrações).
  const importar = (await setting('g_importar')) !== '0';
  const chaveEv = (r: Row) => `${String(r.titulo ?? '').trim().toLowerCase()}|${String(r.inicioEm || r.dataInicio || '').slice(0, 16)}`;
  const jaImportados = new Set<string>();
  if (importar) for (const r of await listRows('calendario')) if (r.origem === 'GOOGLE_AGENDA') jaImportados.add(chaveEv(r));
  const stat = { do_google: 0, para_google: 0, criados: 0, removidos: 0 };
  const map: Record<string, Row> = {};
  for (const m of await q('SELECT * FROM google_event_map')) map[`${m.modulo}|${m.id}`] = m;
  const byEvent: Record<string, Row> = {};
  for (const m of Object.values(map)) byEvent[m.event_id] = m;
  // 1) Google → EVO
  const events: Row[] = [];
  let page = '';
  do {
    const params: Row = { maxResults: 250, showDeleted: 'true', singleEvents: 'true', timeMin: now(addDays(new Date(), -60)) };
    if (page) params.pageToken = page;
    const r = await gApi('GET', `/calendar/v3/calendars/${cal}/events?${qsOf(params)}`);
    events.push(...(r.items ?? []));
    page = r.nextPageToken ?? '';
  } while (page);
  for (const ev of events) {
    const evId = String(ev.id);
    const priv = ev.extendedProperties?.private ?? {};
    const known = byEvent[evId] ?? null;
    const mod: string | null = priv.evoModule ?? known?.modulo ?? null;
    const id: string | null = priv.evoId ?? known?.id ?? null;
    if (ev.status === 'cancelled') {
      if (known) {
        await run('DELETE FROM google_event_map WHERE modulo=? AND id=?', [known.modulo, known.id]);
        delete map[`${known.modulo}|${known.id}`];
        await intLog('google', 'ok', `Evento removido no Google; item ${known.id} mantido no EVO`);
      }
      continue;
    }
    if (mod && id && GCAL_MODULES.includes(mod)) {
      let row = await getRow(mod, id);
      if (!row) continue;
      if (mod === 'calendario' && row.origem === 'GOOGLE_AGENDA' && ev.start?.date && ev.end?.date) {
        // evento de vários dias importado antes desta correção: completa o último dia
        const ultimo = fmtDate(addDays(parseLocal(String(ev.end.date) + 'T12:00:00'), -1));
        if (ultimo > String(ev.start.date) && String(row.dataFim ?? '') !== ultimo) {
          await updateRow(mod, id, { dataFim: ultimo }, 'integracao:google');
          row = (await getRow(mod, id))!;
          const nh = md5(gEventFromRow(mod, row) ?? []);
          await run('UPDATE google_event_map SET hash=? WHERE modulo=? AND id=?', [nh, mod, id]);
          if (map[`${mod}|${id}`]) map[`${mod}|${id}`].hash = nh;
          stat.do_google++;
          continue;
        }
      }
      const mine = gEventFromRow(mod, row);
      const hash = mine ? md5(mine) : '';
      const mapped = map[`${mod}|${id}`];
      const gUpdated = Date.parse(ev.updated ?? '1970-01-01') || 0;
      const rUpdated = Date.parse(row.atualizadoEm ?? '1970-01-01') || 0;
      const theirs = md5(gEventFromRow(mod, { ...row, ...gApplyEventToRow(mod, row, ev) }) ?? []);
      if (mapped && theirs !== mapped.hash && theirs !== hash && gUpdated > rUpdated) {
        await updateRow(mod, id, gApplyEventToRow(mod, row, ev), 'integracao:google');
        row = (await getRow(mod, id))!;
        const nh = md5(gEventFromRow(mod, row) ?? []);
        await run('UPDATE google_event_map SET hash=? WHERE modulo=? AND id=?', [nh, mod, id]);
        map[`${mod}|${id}`].hash = nh;
        stat.do_google++;
      }
    } else if (!known && ev.start && importar) {
      const patch = gApplyEventToRow('calendario', {}, ev);
      if (jaImportados.has(chaveEv(patch))) continue; // mesma data e título já importados: cópia duplicada na agenda do Google
      jaImportados.add(chaveEv(patch));
      const nw = await insertRow('calendario', { ...patch, status: 'NOVO', origem: 'GOOGLE_AGENDA', idExterno: evId, descricao: String(ev.description ?? '') }, 'integracao:google');
      const h = md5(gEventFromRow('calendario', nw) ?? []);
      await run('INSERT INTO google_event_map(modulo,id,event_id,hash) VALUES(?,?,?,?)', ['calendario', nw.id, evId, h]);
      map[`calendario|${nw.id}`] = { modulo: 'calendario', id: nw.id, event_id: evId, hash: h };
      stat.criados++;
    }
  }
  // 2) EVO → Google
  const seen = new Set<string>();
  for (const mod of GCAL_MODULES) {
    for (const r of await listRows(mod)) {
      if (mod === 'conteudos' && closed.test(String(r.status ?? ''))) continue;
      const ev = gEventFromRow(mod, r);
      const key = `${mod}|${r.id}`;
      if (!ev) continue;
      seen.add(key);
      const h = md5(ev);
      if (!map[key]) {
        const res = await gApi('POST', `/calendar/v3/calendars/${cal}/events`, ev);
        await run('INSERT INTO google_event_map(modulo,id,event_id,hash) VALUES(?,?,?,?)', [mod, r.id, res.id, h]);
        stat.para_google++;
      } else if (map[key].hash !== h) {
        await gApi('PUT', `/calendar/v3/calendars/${cal}/events/${encodeURIComponent(map[key].event_id)}`, ev);
        await run('UPDATE google_event_map SET hash=? WHERE modulo=? AND id=?', [h, mod, r.id]);
        stat.para_google++;
      }
    }
  }
  // 3) item apagado/concluído no EVO → remove o evento
  for (const [key, m] of Object.entries(map)) {
    if (seen.has(key)) continue;
    const row = await getRow(m.modulo, m.id);
    const gone = !row || (m.modulo === 'conteudos' && closed.test(String(row.status ?? '')));
    const noDate = !!row && !gEventFromRow(m.modulo, row);
    if (gone || noDate) {
      await gApi('DELETE', `/calendar/v3/calendars/${cal}/events/${encodeURIComponent(m.event_id)}`);
      await run('DELETE FROM google_event_map WHERE modulo=? AND id=?', [m.modulo, m.id]);
      stat.removidos++;
    }
  }
  await setSetting('g_last_cal_sync', now());
  await intLog('google', 'ok', 'Agenda sincronizada: ' + JSON.stringify(stat));
  return stat;
}

// ---------- Drive ----------
async function gDriveFolder(name: string, parent = ''): Promise<string> {
  const qq = `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${name.replace(/'/g, "\\'")}'` + (parent ? ` and '${parent}' in parents` : '');
  const r = await gApi('GET', '/drive/v3/files?' + qsOf({ q: qq, fields: 'files(id,name)', spaces: 'drive' }));
  if (r.files?.[0]?.id) return String(r.files[0].id);
  const meta: Row = { name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) };
  return String((await gApi('POST', '/drive/v3/files?fields=id', meta)).id);
}
/** Remove do sistema os eventos que vieram do Google. NÃO apaga nada no Google (os vínculos saem antes das linhas). */
export async function gLimparImportados(): Promise<number> {
  const like = '%"origem":"GOOGLE_AGENDA"%';
  await run("DELETE m FROM google_event_map m JOIN records r ON r.modulo=m.modulo AND r.id=m.id WHERE m.modulo='calendario' AND r.data LIKE ?", [like]);
  return run("DELETE FROM records WHERE modulo='calendario' AND data LIKE ?", [like]);
}

// Sincronização automática a cada mudança: junta várias mudanças seguidas (5 s) e roda uma vez, sem travar quem salvou.
let sincTimer: NodeJS.Timeout | null = null, sincRodando = false, sincUltima = 0;
export function gCalendarSyncLogo(): void {
  if (sincTimer) return;
  sincTimer = setTimeout(async () => {
    sincTimer = null;
    if (sincRodando) { gCalendarSyncLogo(); return; }
    sincRodando = true;
    try {
      if ((await gConnected()) && (await setting('g_calendar_id'))) { await gCalendarSync(); sincUltima = Date.now(); }
    } catch (e: any) {
      try { await intLog('google', 'erro', 'Sincronização automática: ' + String(e?.message ?? e).slice(0, 200)); } catch { /* sem log */ }
    } finally { sincRodando = false; }
  }, 5000);
}
/** Quem abre o Calendário puxa as mudanças feitas no Google; não repete se rodou há menos de `minSeg` segundos. */
export async function gCalendarSyncSeNecessario(minSeg: number): Promise<Row> {
  if (sincRodando || Date.now() - sincUltima < minSeg * 1000) return { pulou: true };
  if (!(await gConnected()) || !(await setting('g_calendar_id'))) return { pulou: true };
  sincRodando = true;
  try { const r = await gCalendarSync(); sincUltima = Date.now(); return r; } finally { sincRodando = false; }
}
