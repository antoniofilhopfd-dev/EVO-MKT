import { createHash, randomBytes } from 'node:crypto';
import { q, q1, run } from '../db';
import { getRow, headersOf, insertRow, listRows, MODULES, updateRow } from '../records';
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
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets openid email',
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
async function gApi(method: string, path: string, body: any = null, svc: 'api' | 'sheets' | 'upload' = 'api', extra: Record<string, string> = {}): Promise<Row> {
  const base = svc === 'sheets' ? gUrl('GOOGLE_SHEETS_BASE', 'https://sheets.googleapis.com') : gUrl('GOOGLE_API_BASE', 'https://www.googleapis.com');
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
export const GCAL_MODULES = ['agenda', 'calendario', 'eventos', 'conteudos', 'tarefas', 'campanhas'];
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
  const label: Record<string, string> = { agenda: '', calendario: '', eventos: '[Evento] ', conteudos: '[Conteúdo] ', tarefas: '[Tarefa] ', campanhas: '[Campanha] ' };
  const title = (label[mod] ?? '') + (r.titulo ?? r.id);
  const desc = [`Status: ${r.status || '—'}`, `Responsável: ${r.responsavel || '—'}`, r.segmento ? `Segmento: ${r.segmento}` : '', `Origem: EVO MKT ${r.id}`].filter(Boolean).join('\n');
  const ext = { private: { evoModule: mod, evoId: r.id } };
  let timed = '', end = '';
  if (mod === 'agenda' || mod === 'calendario') { timed = r.inicioEm || ''; end = r.fimEm || ''; }
  else if (mod === 'conteudos') timed = r.publicacaoEm || '';
  const diaInteiro = (mod === 'agenda' || mod === 'calendario') && /^s/i.test(String(r.diaInteiro ?? ''));
  if (timed && timed.length >= 16 && !diaInteiro) {
    const s = parseLocal(timed);
    let e = end ? parseLocal(end) : new Date(s.getTime() + 30 * 60000);
    if (e <= s) e = new Date(s.getTime() + 30 * 60000);
    return { summary: title, description: desc, start: { dateTime: now(s), timeZone: tz() }, end: { dateTime: now(e), timeZone: tz() }, extendedProperties: ext };
  }
  let d = String(mod === 'tarefas' ? r.prazo ?? '' : r.dataInicio ?? r.prazo ?? (diaInteiro ? timed : '')).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  let endDay = d;
  if ((mod === 'agenda' || mod === 'calendario') && /^\d{4}-\d{2}-\d{2}/.test(String(r.dataFim ?? '')) && String(r.dataFim).slice(0, 10) >= d) endDay = String(r.dataFim).slice(0, 10); // evento de vários dias
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
    if (mod === 'agenda' || mod === 'calendario') { patch.inicioEm = fmtDateTimeLocal(s); patch.fimEm = fmtDateTimeLocal(e); patch.dataInicio = fmtDate(s); }
    else if (mod === 'conteudos') patch.publicacaoEm = fmtDateTimeLocal(s);
    else if (mod === 'tarefas') patch.prazo = fmtDate(s);
    else patch.dataInicio = fmtDate(s);
  } else if (sd) {
    patch[mod === 'tarefas' ? 'prazo' : 'dataInicio'] = sd;
    // dia inteiro de vários dias: o Google guarda o fim como o dia seguinte ao último
    if ((mod === 'agenda' || mod === 'calendario') && ev.end?.date) {
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
      if (mod === 'tarefas' && closed.test(String(r.status ?? ''))) continue;
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
    const gone = !row || (m.modulo === 'tarefas' && closed.test(String(row.status ?? '')));
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
async function gDriveRoot(): Promise<string> {
  let id = await setting('g_drive_folder_id');
  if (!id) { id = await gDriveFolder('EVO MKT — Entregas'); await setSetting('g_drive_folder_id', id); }
  return id;
}
async function gDriveUpload(name: string, mime: string, data: Buffer, solId: string, solTitulo: string): Promise<string> {
  const sub = await gDriveFolder(`${solId} — ${solTitulo.slice(0, 60)}`, await gDriveRoot());
  const b = 'evo' + randomBytes(8).toString('hex');
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [sub] })}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`),
    data, Buffer.from(`\r\n--${b}--`),
  ]);
  const r = await gApi('POST', '/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', body, 'upload', { 'Content-Type': `multipart/related; boundary=${b}` });
  return String(r.webViewLink ?? `https://drive.google.com/file/d/${r.id}/view`);
}
/** Envia ao Drive os arquivos de ENTREGA da solicitação que ainda não foram. Devolve o nº de arquivos. */
export async function gDriveSendEntregas(solId: string): Promise<number> {
  const r = await getRow('solicitacoes', solId);
  if (!r) throw new Error(`Solicitação ${solId} não encontrada.`);
  const split = (s: unknown) => String(s ?? '').split('|').map((x) => x.trim()).filter(Boolean);
  const done = split(r.entregaDriveLinks), sent = split(r.entregaDriveEnviados);
  let n = 0;
  for (const rel of split(r.arquivosEntrega)) {
    if (sent.includes(rel)) continue;
    const f = await q1('SELECT mime,conteudo FROM arquivos WHERE caminho=?', [rel]);
    if (!f) continue;
    done.push(await gDriveUpload(rel.split('/').pop()!, f.mime, f.conteudo as Buffer, solId, String(r.titulo ?? '')));
    sent.push(rel);
    n++;
  }
  if (n) {
    await updateRow('solicitacoes', solId, { entregaDriveLinks: done.join(' | '), entregaDriveEnviados: sent.join(' | ') }, 'integracao:google');
    await intLog('google', 'ok', `Drive: ${n} arquivo(s) de ${solId} enviados`);
  }
  return n;
}

// ---------- Planilhas ----------
export const GSHEET_DEFAULT_MODULES = ['tarefas', 'conteudos', 'solicitacoes', 'campanhas', 'eventos', 'instagram', 'trafego'];
async function gSheetId(): Promise<string> {
  const id = await setting('g_sheet_id');
  if (id) return id;
  const r = await gApi('POST', '/v4/spreadsheets', { properties: { title: 'EVO MKT — Relatórios (automático)' } }, 'sheets');
  await setSetting('g_sheet_id', String(r.spreadsheetId));
  await setSetting('g_sheet_url', String(r.spreadsheetUrl ?? ''));
  return String(r.spreadsheetId);
}
export async function gSheetsExport(): Promise<Row> {
  const id = await gSheetId();
  const mods = (await setting('g_sheet_modules', GSHEET_DEFAULT_MODULES.join(','))).split(',').map((m) => m.trim()).filter((m) => m in MODULES);
  const meta = await gApi('GET', `/v4/spreadsheets/${id}?fields=sheets.properties.title`, null, 'sheets');
  const have: string[] = (meta.sheets ?? []).map((s: Row) => s.properties.title);
  const add = mods.filter((m) => !have.includes(m)).map((m) => ({ addSheet: { properties: { title: m } } }));
  if (add.length) await gApi('POST', `/v4/spreadsheets/${id}:batchUpdate`, { requests: add }, 'sheets');
  const out: Row = {};
  for (const m of mods) {
    const headers = await headersOf(m);
    const rows = (await listRows(m)).slice(0, 5000);
    const vals = [headers, ...rows.map((r) => headers.map((h) => String(r[h] ?? '')))];
    await gApi('POST', `/v4/spreadsheets/${id}/values/${encodeURIComponent(m)}:clear`, {}, 'sheets');
    await gApi('PUT', `/v4/spreadsheets/${id}/values/${encodeURIComponent(m + '!A1')}?valueInputOption=RAW`, { range: m + '!A1', majorDimension: 'ROWS', values: vals }, 'sheets');
    out[m] = rows.length;
  }
  await setSetting('g_last_sheet_export', now());
  await intLog('google', 'ok', 'Planilha atualizada: ' + JSON.stringify(out));
  return out;
}

/** Remove do sistema os eventos que vieram do Google. NÃO apaga nada no Google (os vínculos saem antes das linhas). */
export async function gLimparImportados(): Promise<number> {
  const like = '%"origem":"GOOGLE_AGENDA"%';
  await run("DELETE m FROM google_event_map m JOIN records r ON r.modulo=m.modulo AND r.id=m.id WHERE m.modulo='calendario' AND r.data LIKE ?", [like]);
  return run("DELETE FROM records WHERE modulo='calendario' AND data LIKE ?", [like]);
}
