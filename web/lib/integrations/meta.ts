import { q, q1, run } from '../db';
import { audit, getRow, insertRow, listRows, saveRow, updateRow } from '../records';
import { intLog, setSetting, setting } from '../settings';
import { notifyMail } from '../mail';
import { registrarNotificacao } from '../notificacoes';
import { env, fail, fmtDate, localParts, now, parseLocal, Row, strv } from '../util';
import { httpCall, httpOk, publicUrl, qsOf, signState, signedMediaUrl } from './http';

const metaBase = () => env('META_GRAPH_BASE', 'https://graph.facebook.com/v21.0').replace(/\/+$/, '');
const metaOauth = () => env('META_OAUTH_BASE', 'https://www.facebook.com/v21.0/dialog/oauth').replace(/\/+$/, '');

/** Erro de autenticação da Meta (token expirado, revogado ou senha alterada): marca para reconectar e avisa a Gerência. */
async function checarTokenInvalido(r: [number, any], ctx: string): Promise<void> {
  const e = r[1]?.error;
  if (r[0] >= 400 && e && (Number(e.code) === 190 || Number(e.code) === 102 || /access token|session has expired/i.test(String(e.message ?? '')))) {
    if ((await setting('meta_token_invalido')) !== '1') {
      await setSetting('meta_token_invalido', '1');
      await intLog('instagram', 'erro', `${ctx}: o acesso à Meta expirou ou foi revogado. Reconecte o Instagram em Administração → Integrações.`);
    }
  }
}
export async function metaGet(path: string, params: Row = {}): Promise<Row> {
  params.access_token = await setting('meta_token');
  const r = await httpCall('GET', `${metaBase()}${path}?${qsOf(params)}`);
  await checarTokenInvalido(r, `Meta GET ${path}`);
  return httpOk(r, `Meta GET ${path}`) as Row;
}
export async function metaDelete(path: string): Promise<Row> {
  const r = await httpCall('DELETE', `${metaBase()}${path}?${qsOf({ access_token: await setting('meta_token') })}`);
  await checarTokenInvalido(r, `Meta DELETE ${path}`);
  return httpOk(r, `Meta DELETE ${path}`) as Row;
}
export async function metaPost(path: string, params: Row = {}): Promise<Row> {
  params.access_token = await setting('meta_token');
  const r = await httpCall('POST', metaBase() + path, { 'Content-Type': 'application/x-www-form-urlencoded' }, qsOf(params));
  await checarTokenInvalido(r, `Meta POST ${path}`);
  return httpOk(r, `Meta POST ${path}`) as Row;
}
/** Envia um arquivo (vídeo) em formulário multipart; a Meta não aceita vídeo no formato simples. */
export async function metaUpload(path: string, campo: string, nome: string, mime: string, dados: Buffer, params: Row = {}): Promise<Row> {
  const f = new FormData();
  f.append('access_token', await setting('meta_token'));
  for (const [k, v] of Object.entries(params)) f.append(k, String(v));
  f.append(campo, new Blob([new Uint8Array(dados)], { type: mime }), nome);
  const res = await fetch(metaBase() + path, { method: 'POST', body: f, signal: AbortSignal.timeout(300_000) });
  const txt = await res.text();
  let j: any = {}; try { j = JSON.parse(txt); } catch { /* resposta fora do padrão */ }
  if (!res.ok || j.error) throw new Error(`Meta upload ${path}: ${j?.error?.message ?? 'HTTP ' + res.status}`);
  return j as Row;
}
export async function metaConnected(): Promise<boolean> {
  return (await setting('meta_token')) !== '' && (await setting('ig_user_id')) !== '';
}
export async function metaConnectUrl(): Promise<string> {
  const id = await setting('meta_app_id');
  if (!id || !(await setting('meta_app_secret'))) fail(400, 'Informe o App ID e o App Secret da Meta primeiro.');
  return `${metaOauth()}?${qsOf({
    client_id: id, redirect_uri: publicUrl() + '/api/integrations/meta/callback', state: signState('meta'), response_type: 'code',
    scope: 'instagram_basic,instagram_manage_insights,instagram_content_publish,pages_show_list,pages_read_engagement,business_management' + ((await setting('meta_ads_ativar')) === '1' ? ',ads_read' : '') + ((await setting('meta_ads_gestao')) === '1' ? ',ads_management' : ''),
  })}`;
}
export async function metaFinishConnect(code: string): Promise<void> {
  const id = await setting('meta_app_id');
  const secret = await setting('meta_app_secret');
  const redirect = publicUrl() + '/api/integrations/meta/callback';
  const short = httpOk(await httpCall('GET', `${metaBase()}/oauth/access_token?${qsOf({ client_id: id, client_secret: secret, redirect_uri: redirect, code })}`), 'Meta token');
  const long = httpOk(await httpCall('GET', `${metaBase()}/oauth/access_token?${qsOf({ grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: short.access_token ?? '' })}`), 'Meta token longo');
  await setSetting('meta_token_invalido', '');
  await setSetting('meta_token', String(long.access_token ?? ''));
  await setSetting('meta_token_expira', String(Math.floor(Date.now() / 1000) + Number(long.expires_in ?? 5184000)));
  await metaDiscoverAccount();
}
export const META_PERMISSOES = ['instagram_basic', 'instagram_manage_insights', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management'];
export interface MetaConta { ig: string; usuario: string; pagina: string }
/** Lista as contas Instagram profissionais ligadas às Páginas do usuário. Se houver mais de uma, a Gerência escolhe qual usar. */
export async function metaDiscoverAccount(): Promise<void> {
  const r = await metaGet('/me/accounts', { fields: 'name,instagram_business_account{id,username}', limit: 100 });
  const contas: MetaConta[] = [];
  for (const page of r.data ?? []) if (page.instagram_business_account?.id) contas.push({ ig: String(page.instagram_business_account.id), usuario: String(page.instagram_business_account.username ?? ''), pagina: String(page.name ?? '') });
  if (!contas.length) throw new Error('Nenhuma conta Instagram profissional encontrada nas Páginas deste usuário. Ligue o Instagram à Página do Facebook.');
  await setSetting('meta_contas', JSON.stringify(contas));
  const atual = await setting('ig_user_id');
  await metaUsarConta(contas.find((c) => c.ig === atual) ?? contas[0]);
  if (contas.length > 1) await intLog('instagram', 'aviso', `${contas.length} contas Instagram encontradas; em uso: @${await setting('ig_username')}. Confira se é a conta do Colégio.`);
  await metaConferirPermissoes();
}
export async function metaUsarConta(c: MetaConta): Promise<void> {
  await setSetting('ig_user_id', c.ig);
  await setSetting('ig_username', c.usuario);
  await setSetting('meta_page_name', c.pagina);
  await intLog('instagram', 'ok', 'Conectado como @' + c.usuario);
}
/** Confere se a pessoa aceitou TODAS as permissões (desmarcar uma é a falha mais comum). */
export async function metaConferirPermissoes(): Promise<string[]> {
  try {
    const r = await metaGet('/me/permissions');
    const dadas = new Set((r.data ?? []).filter((p: Row) => p.status === 'granted').map((p: Row) => String(p.permission)));
    if (!dadas.size) return [];
    const faltam = META_PERMISSOES.filter((p) => !dadas.has(p));
    await setSetting('meta_perm_faltando', faltam.join(','));
    if (faltam.length) await intLog('instagram', 'aviso', 'Permissões não aceitas: ' + faltam.join(', ') + '. Reconecte e marque todas.');
    return faltam;
  } catch {
    return [];
  }
}
async function metaRefreshOnce(exp: number): Promise<void> {
  const j = httpOk(await httpCall('GET', `${metaBase()}/oauth/access_token?${qsOf({ grant_type: 'fb_exchange_token', client_id: await setting('meta_app_id'), client_secret: await setting('meta_app_secret'), fb_exchange_token: await setting('meta_token') })}`), 'Meta renovar token');
  await setSetting('meta_token', String(j.access_token));
  await setSetting('meta_token_expira', String(Math.floor(Date.now() / 1000) + Number(j.expires_in ?? 5184000)));
  await setSetting('meta_token_invalido', '');
  await intLog('instagram', 'ok', 'Token renovado');
}
export async function metaRefreshIfNeeded(): Promise<void> {
  const exp = parseInt(await setting('meta_token_expira', '0'), 10) || 0;
  if (!(await metaConnected()) || exp === 0 || exp - Date.now() / 1000 > 10 * 86400) return;
  try {
    await metaRefreshOnce(exp);
  } catch (e: any) {
    const dias = Math.max(0, Math.floor((exp - Date.now() / 1000) / 86400));
    if (dias <= 5) await intLog('instagram', 'erro', `O token da Meta expira em ${dias} dia(s) e a renovação automática falhou (${String(e.message).slice(0, 150)}). Reconecte o Instagram.`);
    throw e;
  }
}
/** Métricas da conta num intervalo de datas (AAAA-MM-DD), lidas ao vivo da Meta em janelas de até 30 dias (alcance de janelas diferentes se soma). */
export async function igMetricasJanela(ig: string, de: string, ate: string): Promise<Record<string, number>> {
  const soma: Record<string, number> = {};
  let ini = parseLocal(de + 'T00:00:00');
  const fim = Math.min(parseLocal(ate + 'T23:59:59').getTime(), Date.now());
  while (ini.getTime() <= fim) {
    const fimJ = Math.min(ini.getTime() + 30 * 86400000 - 1000, fim);
    const r = await metaInsightTotal(ig, ['reach', 'views', 'profile_views', 'total_interactions', 'likes', 'comments', 'shares', 'saves'], Math.floor(ini.getTime() / 1000), Math.floor(fimJ / 1000));
    for (const [k, v] of Object.entries(r)) soma[k] = (soma[k] ?? 0) + v;
    ini = new Date(fimJ + 1000);
  }
  return soma;
}
async function metaInsightTotal(ig: string, metrics: string[], since: number, until: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const pede = async (ms: string[]) => {
    const r = await metaGet(`/${ig}/insights`, { metric: ms.join(','), metric_type: 'total_value', period: 'day', since, until });
    for (const m of r.data ?? []) out[m.name] = Number(m.total_value?.value ?? 0);
  };
  try {
    await pede(metrics);
  } catch (e: any) {
    if ((await setting('meta_token_invalido')) === '1') throw e;
    // A Meta renomeia/retira métricas: se o pedido em lote falhar, tenta uma a uma e segue com as que existem.
    const falhas: string[] = [];
    for (const m of metrics) { try { await pede([m]); } catch { falhas.push(m); } }
    if (falhas.length === metrics.length) throw e;
    await intLog('instagram', 'aviso', 'Métricas indisponíveis nesta conta/versão: ' + falhas.join(', '));
  }
  return out;
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Contas Instagram acompanhadas pelo sistema (a em uso sempre entra). */
export async function contasOcultas(): Promise<string[]> {
  try { const l = JSON.parse((await setting('ig_contas_ocultas')) || '[]'); return Array.isArray(l) ? l.map(String) : []; } catch { return []; }
}
export async function contasMonitoradas(): Promise<MetaConta[]> {
  let todas: MetaConta[] = [], ids: string[] = [];
  try { todas = JSON.parse((await setting('meta_contas')) || '[]'); } catch { /* vazio */ }
  try { ids = JSON.parse((await setting('ig_contas_monitoradas')) || '[]'); } catch { /* vazio */ }
  const principal = await setting('ig_user_id');
  const ocultas = await contasOcultas();
  const sel = todas.filter((c) => c.ig === principal || (ids.includes(c.ig) && !ocultas.includes(c.ig)));
  return sel.length ? sel : principal ? [{ ig: principal, usuario: await setting('ig_username'), pagina: await setting('meta_page_name') }] : [];
}
export async function igContaValida(conta: string): Promise<string> {
  const cs = await contasMonitoradas();
  return cs.find((c) => c.ig === conta)?.ig ?? (await setting('ig_user_id'));
}
/** Posts marcados como "já agendados no Instagram" (feitos no aplicativo ou no Meta Business Suite): quando o post aparece no perfil,
 *  o conteúdo vira Publicado. Casa pelo horário (até 24 h de diferença) e pela legenda; nunca reutiliza um post já vinculado. */
async function conciliarAgendados(ig: string): Promise<void> {
  const principal = await setting('ig_user_id');
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const pendentes = (await listRows('conteudos')).filter((r) => strv(r.agendadoNoInstagram) === 'SIM' && !r.instagramMediaId && !/PUBLICADO|ARQUIVADO/i.test(strv(r.status)) && (strv(r.contaInstagram) || principal) === ig && strv(r.publicacaoEm));
  if (!pendentes.length) return;
  const posts = await q('SELECT media_id,publicado_em,legenda,permalink FROM ig_posts WHERE conta=? ORDER BY publicado_em DESC LIMIT 300', [ig]);
  const usados = new Set((await listRows('conteudos')).map((r) => strv(r.instagramMediaId)).filter(Boolean));
  for (const r of pendentes) {
    const alvo = parseLocal(strv(r.publicacaoEm)).getTime();
    if (!Number.isFinite(alvo)) continue;
    const base = norm(strv(r.legenda) || strv(r.titulo)).slice(0, 24);
    const cands = posts.filter((p) => !usados.has(strv(p.media_id)) && Math.abs(new Date(strv(p.publicado_em)).getTime() - alvo) <= 24 * 3600 * 1000)
      .map((p) => ({ p, ok: !!base && norm(strv(p.legenda)).includes(base), d: Math.abs(new Date(strv(p.publicado_em)).getTime() - alvo) }));
    const melhor = cands.filter((c) => c.ok).sort((a, b) => a.d - b.d)[0] ?? (!base && cands.length === 1 ? cands[0] : undefined);
    if (!melhor) continue;
    usados.add(strv(melhor.p.media_id));
    await updateRow('conteudos', String(r.id), { status: 'PUBLICADO', instagramMediaId: strv(melhor.p.media_id), instagramLink: strv(melhor.p.permalink), publicadoEm: strv(melhor.p.publicado_em) }, 'integracao:instagram', { interno: true });
  }
}

/** Sincroniza o mês atual e o anterior de TODAS as contas acompanhadas. Devolve o nº de períodos gravados. */
export async function igSync(months = 2): Promise<number> {
  if (!(await metaConnected())) throw new Error('Instagram não conectado.');
  const principal = await setting('ig_user_id');
  await run("UPDATE ig_posts SET conta=? WHERE conta=''", [principal]);
  await run("UPDATE ig_seguidores SET conta=? WHERE conta=''", [principal]).catch(() => {});
  const cs = await contasMonitoradas();
  let n = 0, ultimo: any = null, falhas = 0;
  for (const c of cs) {
    try { n += await igSyncConta(c.ig, c.usuario, months, cs.length > 1); } catch (e: any) {
      if ((await setting('meta_token_invalido')) === '1') throw e;
      falhas++; ultimo = e;
      await intLog('instagram', 'erro', `@${c.usuario}: ${e.message}`);
    }
  }
  if (cs.length && falhas === cs.length) throw ultimo;
  await setSetting('ig_last_sync', now());
  return n;
}
async function igSyncConta(ig: string, usuario: string, months: number, varias: boolean): Promise<number> {
  const profile = await metaGet(`/${ig}`, { fields: 'followers_count,follows_count,media_count,username' });
  await run('INSERT INTO ig_seguidores(conta,dia,seguidores,seguindo,midias,atualizado_em) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE seguidores=VALUES(seguidores),seguindo=VALUES(seguindo),midias=VALUES(midias),atualizado_em=VALUES(atualizado_em)',
    [ig, fmtDate(new Date()), Number(profile.followers_count ?? 0), Number(profile.follows_count ?? 0), Number(profile.media_count ?? 0), now()]);
  const media: Row[] = [];
  let after = '';
  for (let pg = 0; pg < 10; pg++) { // até 1000 publicações mais recentes
    const r = await metaGet(`/${ig}/media`, { fields: 'id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink,media_url,thumbnail_url', limit: 100, ...(after ? { after } : {}) });
    media.push(...(r.data ?? []));
    after = String(r.paging?.cursors?.after ?? '');
    if (!r.paging?.next || !after) break;
  }
  for (const md of media) {
    const mini = String(md.thumbnail_url || (md.media_type === 'IMAGE' || md.media_type === 'CAROUSEL_ALBUM' ? md.media_url : '') || '');
    await run('INSERT INTO ig_posts(conta,media_id,publicado_em,tipo,legenda,curtidas,comentarios,permalink,miniatura,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE conta=VALUES(conta),tipo=VALUES(tipo),legenda=VALUES(legenda),curtidas=VALUES(curtidas),comentarios=VALUES(comentarios),permalink=VALUES(permalink),miniatura=VALUES(miniatura),atualizado_em=VALUES(atualizado_em)',
      [ig, String(md.id), String(md.timestamp ?? ''), String(md.media_product_type ?? md.media_type ?? ''), String(md.caption ?? '').replace(/\s+/g, ' ').slice(0, 300), Number(md.like_count ?? 0), Number(md.comments_count ?? 0), String(md.permalink ?? '').slice(0, 300), /^https:\/\//.test(mini) ? mini.slice(0, 1000) : '', now()]);
  }
  // Alcance, salvamentos e compartilhamentos das 30 publicações mais recentes (a Meta não traz isso na lista). Falha numa publicação não derruba a sincronização.
  // Visualizações, seguidores gerados e visitas ao perfil de cada post vêm em chamadas separadas (nem todo formato aceita todas as métricas) e o motivo de cada falha fica guardado.
  const colunas = { views: 'visualizacoes', follows: 'seguidores_novos', profile_visits: 'visitas_perfil' } as const;
  const SQL_METRICA: Record<string, string> = { visualizacoes: 'UPDATE ig_posts SET visualizacoes=? WHERE media_id=?', seguidores_novos: 'UPDATE ig_posts SET seguidores_novos=? WHERE media_id=?', visitas_perfil: 'UPDATE ig_posts SET visitas_perfil=? WHERE media_id=?' };
  const st: Record<string, { ok: number; falhas: number; erro: string }> = { views: { ok: 0, falhas: 0, erro: '' }, follows: { ok: 0, falhas: 0, erro: '' }, profile_visits: { ok: 0, falhas: 0, erro: '' } };
  for (const md of media.slice(0, 30)) {
    try {
      const r = await metaGet(`/${md.id}/insights`, { metric: 'reach,saved,shares' });
      const v: Record<string, number> = {};
      for (const m of r.data ?? []) v[m.name] = Number(m.values?.[0]?.value ?? m.total_value?.value ?? 0);
      await run('UPDATE ig_posts SET alcance=?,salvos=?,compartilhamentos=? WHERE media_id=?', ['reach' in v ? v.reach : null, v.saved ?? 0, v.shares ?? 0, String(md.id)]);
    } catch (e: any) {
      if ((await setting('meta_token_invalido')) === '1') throw e;
    }
    for (const [metrica, coluna] of Object.entries(colunas)) {
      try {
        const rm = await metaGet(`/${md.id}/insights`, { metric: metrica });
        const x = (rm.data ?? []).find((m: Row) => m.name === metrica);
        const val = x ? Number(x.values?.[0]?.value ?? x.total_value?.value) : NaN;
        if (Number.isFinite(val)) { await run(SQL_METRICA[coluna], [val, String(md.id)]); st[metrica].ok++; }
        else { st[metrica].falhas++; if (!st[metrica].erro) st[metrica].erro = 'A Meta respondeu sem esse número para a publicação.'; }
      } catch (e3: any) {
        if ((await setting('meta_token_invalido')) === '1') throw e3;
        st[metrica].falhas++; if (!st[metrica].erro) st[metrica].erro = String(e3.message ?? e3).slice(0, 240);
      }
    }
  }
  await setSetting(`ig_metricas_${ig}`, JSON.stringify({ quando: now(), ...st })).catch(() => {});
  for (const [mt, x] of Object.entries(st)) if (x.falhas && !x.ok) await intLog('instagram', 'erro', `Métrica "${mt}" por publicação indisponível para @${usuario}: ${x.erro}`).catch(() => {});
  await conciliarAgendados(ig).catch(() => {});
  let n = 0;
  const listRowsSeg = (await listRows('instagram')).filter((r) => r.origem === 'INSTAGRAM_API' && String(r.idExterno ?? ig) === ig);
  const lp = localParts(new Date());
  for (let i = 0; i < months; i++) {
    let y = lp.y, m = lp.m - i;
    while (m < 1) { m += 12; y--; }
    const first = parseLocal(`${y}-${String(m).padStart(2, '0')}-01T00:00:00`);
    const nm = m === 12 ? [y + 1, 1] : [y, m + 1];
    const last = parseLocal(`${nm[0]}-${String(nm[1]).padStart(2, '0')}-01T00:00:00`);
    const per = `${y}-${String(m).padStart(2, '0')}`;
    const since = Math.floor(first.getTime() / 1000);
    const until = Math.min(Math.floor(last.getTime() / 1000), Math.floor(Date.now() / 1000));
    const ins = await metaInsightTotal(ig, ['reach', 'views', 'profile_views', 'total_interactions', 'likes', 'comments', 'shares', 'saves'], since, until);
    let posts = 0, reels = 0;
    const best: [number, Row][] = [];
    for (const md of media) {
      if (String(md.timestamp).slice(0, 7) !== per) continue;
      if (md.media_product_type === 'REELS') reels++; else posts++;
      best.push([Number(md.like_count ?? 0) + Number(md.comments_count ?? 0), md]);
    }
    best.sort((a, b) => b[0] - a[0]);
    const top = best.slice(0, 3).map(([k, md]) => `${String(md.caption ?? 'Sem legenda').replace(/\s+/g, ' ').trim().slice(0, 60)} — ${k} interações (${md.permalink ?? ''})`);
    const row: Row = {
      titulo: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} de ${y}${varias ? ' · @' + usuario : ''}`,
      periodo: per, dataInicio: fmtDate(first), origem: 'INSTAGRAM_API', idExterno: ig, status: 'ATIVO', ultimaSincronizacao: now(),
      seguidores: i === 0 ? String(profile.followers_count ?? 0) : String((await q1('SELECT seguidores FROM ig_seguidores WHERE conta=? AND dia LIKE ? ORDER BY dia DESC LIMIT 1', [ig, per + '%']))?.seguidores ?? (listRowsSeg.find((r) => r.periodo === per)?.seguidores ?? '')), alcance: String(ins.reach ?? 0), impressoes: String(ins.views ?? 0),
      visitasPerfil: String(ins.profile_views ?? 0), interacoes: String(ins.total_interactions ?? 0), curtidas: String(ins.likes ?? 0),
      comentarios: String(ins.comments ?? 0), compartilhamentos: String(ins.shares ?? 0), salvamentos: String(ins.saves ?? 0),
      posts: String(posts), reels: String(reels), melhoresConteudos: top.join('\n'),
    };
    const exist = (await listRows('instagram')).find((r) => r.origem === 'INSTAGRAM_API' && r.periodo === per && String(r.idExterno ?? ig) === ig);
    if (exist) await updateRow('instagram', exist.id, row, 'integracao:instagram');
    else await insertRow('instagram', row, 'integracao:instagram');
    n++;
  }
  await setSetting('ig_last_sync', now());
  await intLog('instagram', 'ok', `Métricas sincronizadas (${n} período(s)); seguidores: ${profile.followers_count ?? '?'}`);
  return n;
}

// ---------- mídia do conteúdo (guardada no MySQL) ----------
export const midiasDe = (r: Row): string[] => { try { const l = JSON.parse(String(r.midiasInstagram ?? '[]')); if (Array.isArray(l) && l.length) return l.map(String); } catch { /* lista inválida */ } return r.midiaInstagram ? [String(r.midiaInstagram)] : []; };
/** Registra falha de publicação (sem sobrescrever um conteúdo já PUBLICADO). */
export async function igMarkError(id: string, msg: string): Promise<void> {
  const cur = await q1('SELECT status FROM ig_publish WHERE conteudo_id=?', [id]);
  if (cur?.status === 'PUBLICADO') return;
  await run('DELETE FROM ig_publish WHERE conteudo_id=?', [id]);
  await run('INSERT INTO ig_publish(conteudo_id,status,container_id,media_id,erro,quando) VALUES(?,?,?,?,?,?)', [id, 'ERRO', '', '', msg.slice(0, 480), now()]);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Publica no Instagram. Devolve { status: 'PUBLICADO' | 'PROCESSANDO', link }. */
export async function igPublish(id: string, ator: string): Promise<{ status: string; link: string }> {
  if (!(await metaConnected())) throw new Error('Instagram não conectado.');
  const r = await getRow('conteudos', id);
  if (!r) throw new Error('Conteúdo não encontrado.');
  const rel = String(r.midiaInstagram ?? '');
  if (!rel) throw new Error('Anexe a mídia (JPEG ou vídeo) antes de publicar.');
  if (r.instagramMediaId) throw new Error('Este conteúdo já foi publicado.');
  const fmt = String(r.formato ?? 'feed').toLocaleLowerCase('pt-BR');
  const carrossel = fmt.includes('carrossel');
  const itens = midiasDe(r);
  if (carrossel && itens.length < 2) throw new Error('O carrossel precisa de 2 a 20 mídias. Anexe mais itens.');
  const isVideo = ['mp4', 'mov'].includes((rel.split('.').pop() || '').toLowerCase());
  const ig = await igContaValida(String(r.contaInstagram ?? ''));
  const tags = String(r.hashtags ?? '').trim();
  const tagsNoComentario = /SIM/i.test(String(r.hashtagsComentario ?? '')) && !!tags;
  let caption = String(r.legenda ?? r.titulo ?? '').trim() + (r.cta ? `\n\n${r.cta}` : '');
  if (tags && !tagsNoComentario) {
    const novas = (tags.match(/#[\p{L}\p{N}_]+/gu) ?? []).filter((t) => !caption.toLowerCase().includes(t.toLowerCase()));
    if (novas.length) caption += `\n\n${novas.join(' ')}`;
  }
  caption = caption.slice(0, 2200);
  const p: Row = { caption };
  const colab = String(r.colaboradores ?? '').split(/[\s,;]+/).map((x) => x.replace(/^@/, '').trim()).filter((x) => /^[A-Za-z0-9._]{1,30}$/.test(x)).slice(0, 3);
  const url = signedMediaUrl(rel, 7200);
  if (carrossel) {
    p.media_type = 'CAROUSEL';
  } else if (fmt.includes('stor')) {
    p.media_type = 'STORIES';
    p[isVideo ? 'video_url' : 'image_url'] = url;
  } else if (isVideo || fmt.includes('reel')) {
    p.media_type = 'REELS';
    p.video_url = url;
  } else p.image_url = url;
  if (colab.length && !fmt.includes('stor')) p.collaborators = JSON.stringify(colab); // convite de colab: o outro perfil precisa aceitar
  const st = await q1('SELECT * FROM ig_publish WHERE conteudo_id=?', [id]);
  let container: string = st?.container_id ?? '';
  if (!container) {
    if (carrossel) {
      const filhos: string[] = [];
      for (const m of itens) {
        const v = ['mp4', 'mov'].includes((m.split('.').pop() || '').toLowerCase());
        const f = String((await metaPost(`/${ig}/media`, { is_carousel_item: 'true', ...(v ? { media_type: 'VIDEO', video_url: signedMediaUrl(m, 7200) } : { image_url: signedMediaUrl(m, 7200) }) })).id);
        for (let i = 0; i < Number(env('IG_POLL_TRIES', '12')); i++) {
          const sc = String((await metaGet(`/${f}`, { fields: 'status_code' })).status_code ?? 'FINISHED');
          if (sc === 'FINISHED') break;
          if (sc === 'ERROR' || sc === 'EXPIRED') throw new Error(`O Instagram recusou um item do carrossel (${sc}).`);
          await sleep(Number(env('IG_POLL_MS', '5000')));
        }
        filhos.push(f);
      }
      p.children = filhos.join(',');
    }
    container = String((await metaPost(`/${ig}/media`, p)).id);
    await run('DELETE FROM ig_publish WHERE conteudo_id=?', [id]);
    await run('INSERT INTO ig_publish(conteudo_id,status,container_id,media_id,erro,quando) VALUES(?,?,?,?,?,?)', [id, 'PROCESSANDO', container, '', '', now()]);
  }
  let status = 'FINISHED';
  const polls = Number(env('IG_POLL_TRIES', '12')), wait = Number(env('IG_POLL_MS', '5000'));
  for (let i = 0; i < polls; i++) {
    status = String((await metaGet(`/${container}`, { fields: 'status_code' })).status_code ?? 'FINISHED');
    if (['FINISHED', 'ERROR', 'EXPIRED'].includes(status)) break;
    await sleep(wait);
  }
  if (status === 'ERROR' || status === 'EXPIRED') {
    await run('UPDATE ig_publish SET status=?,erro=?,quando=? WHERE conteudo_id=?', ['ERRO', `Instagram recusou a mídia (${status})`, now(), id]);
    throw new Error(`O Instagram recusou a mídia (${status}). Verifique formato, proporção e tamanho.`);
  }
  if (status !== 'FINISHED') {
    await run('UPDATE ig_publish SET quando=? WHERE conteudo_id=?', [now(), id]);
    return { status: 'PROCESSANDO', link: '' };
  }
  const mediaId = String((await metaPost(`/${ig}/media_publish`, { creation_id: container })).id);
  const link = String((await metaGet(`/${mediaId}`, { fields: 'permalink' })).permalink ?? '');
  await run('UPDATE ig_publish SET status=?,media_id=?,erro=?,quando=? WHERE conteudo_id=?', ['PUBLICADO', mediaId, '', now(), id]);
  if (tagsNoComentario) {
    try { await metaPost(`/${mediaId}/comments`, { message: (tags.match(/#[\p{L}\p{N}_]+/gu) ?? []).join(' ').slice(0, 2200) }); }
    catch (e: any) { await intLog('instagram', 'erro', `${id}: publicado, mas o comentário das hashtags falhou: ${e.message}`); }
  }
  await updateRow('conteudos', id, { status: 'PUBLICADO', instagramMediaId: mediaId, instagramLink: link, publicadoEm: now() }, ator, { interno: true });
  await intLog('instagram', 'ok', `Publicado: ${id} → ${link}`);
  return { status: 'PUBLICADO', link };
}
/** Publica o que está programado e vencido (usado pelo cron). */
export async function igPublishDue(): Promise<number> {
  await setSetting('ig_last_publish_run', now());
  if (!(await metaConnected())) return 0;
  let n = 0;
  for (const r of await listRows('conteudos')) {
    if (r.publicarInstagram !== 'SIM' || r.instagramMediaId || !r.midiaInstagram) continue;
    if (!/^AGENDADO$/i.test(String(r.status ?? ''))) continue;
    const prev = await q1('SELECT status FROM ig_publish WHERE conteudo_id=?', [r.id]);
    if (prev?.status === 'ERRO') continue; // falhou antes: só tenta de novo quando alguém clicar em "Publicar agora"
    const when = String(r.publicacaoEm ?? '');
    if (!when || parseLocal(when).getTime() > Date.now()) continue;
    try {
      if ((await igPublish(r.id, 'cron')).status === 'PUBLICADO') n++;
    } catch (e: any) {
      await igMarkError(r.id, e.message);
      await intLog('instagram', 'erro', `${r.id}: ${e.message}`);
      await notifyMail('Falha ao publicar no Instagram', `${r.titulo ?? r.id}\n${e.message}`);
      await registrarNotificacao('ig_falha', 'gerencia', 'Falha ao publicar no Instagram', `${r.titulo ?? r.id}: ${e.message}`, 'conteudos', String(r.id));
    }
  }
  return n;
}
export { audit, q, strv };
