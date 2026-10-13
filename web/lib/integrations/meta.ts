import { q, q1, run } from '../db';
import { audit, getRow, insertRow, listRows, saveRow, updateRow } from '../records';
import { intLog, setSetting, setting } from '../settings';
import { notifyMail } from '../mail';
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
export async function metaPost(path: string, params: Row = {}): Promise<Row> {
  params.access_token = await setting('meta_token');
  const r = await httpCall('POST', metaBase() + path, { 'Content-Type': 'application/x-www-form-urlencoded' }, qsOf(params));
  await checarTokenInvalido(r, `Meta POST ${path}`);
  return httpOk(r, `Meta POST ${path}`) as Row;
}
export async function metaConnected(): Promise<boolean> {
  return (await setting('meta_token')) !== '' && (await setting('ig_user_id')) !== '';
}
export async function metaConnectUrl(): Promise<string> {
  const id = await setting('meta_app_id');
  if (!id || !(await setting('meta_app_secret'))) fail(400, 'Informe o App ID e o App Secret da Meta primeiro.');
  return `${metaOauth()}?${qsOf({
    client_id: id, redirect_uri: publicUrl() + '/api/integrations/meta/callback', state: signState('meta'), response_type: 'code',
    scope: 'instagram_basic,instagram_manage_insights,instagram_content_publish,pages_show_list,pages_read_engagement,business_management' + ((await setting('meta_ads_ativar')) === '1' ? ',ads_read' : ''),
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

/** Sincroniza o mês atual e o anterior na tela Instagram. Devolve o nº de períodos gravados. */
export async function igSync(months = 2): Promise<number> {
  if (!(await metaConnected())) throw new Error('Instagram não conectado.');
  const ig = await setting('ig_user_id');
  const profile = await metaGet(`/${ig}`, { fields: 'followers_count,follows_count,media_count,username' });
  const media: Row[] = [];
  let after = '';
  for (let pg = 0; pg < 3; pg++) { // até 300 publicações mais recentes
    const r = await metaGet(`/${ig}/media`, { fields: 'id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink', limit: 100, ...(after ? { after } : {}) });
    media.push(...(r.data ?? []));
    after = String(r.paging?.cursors?.after ?? '');
    if (!r.paging?.next || !after) break;
  }
  for (const md of media) {
    await run('INSERT INTO ig_posts(media_id,publicado_em,tipo,legenda,curtidas,comentarios,permalink,atualizado_em) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE tipo=VALUES(tipo),legenda=VALUES(legenda),curtidas=VALUES(curtidas),comentarios=VALUES(comentarios),permalink=VALUES(permalink),atualizado_em=VALUES(atualizado_em)',
      [String(md.id), String(md.timestamp ?? ''), String(md.media_product_type ?? md.media_type ?? ''), String(md.caption ?? '').replace(/\s+/g, ' ').slice(0, 300), Number(md.like_count ?? 0), Number(md.comments_count ?? 0), String(md.permalink ?? '').slice(0, 300), now()]);
  }
  let n = 0;
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
      titulo: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} de ${y}`,
      periodo: per, dataInicio: fmtDate(first), origem: 'INSTAGRAM_API', idExterno: ig, status: 'ATIVO', ultimaSincronizacao: now(),
      seguidores: String(profile.followers_count ?? 0), alcance: String(ins.reach ?? 0), impressoes: String(ins.views ?? 0),
      visitasPerfil: String(ins.profile_views ?? 0), interacoes: String(ins.total_interactions ?? 0), curtidas: String(ins.likes ?? 0),
      comentarios: String(ins.comments ?? 0), compartilhamentos: String(ins.shares ?? 0), salvamentos: String(ins.saves ?? 0),
      posts: String(posts), reels: String(reels), melhoresConteudos: top.join('\n'),
    };
    const exist = (await listRows('instagram')).find((r) => r.origem === 'INSTAGRAM_API' && r.periodo === per);
    if (exist) await updateRow('instagram', exist.id, row, 'integracao:instagram');
    else await insertRow('instagram', row, 'integracao:instagram');
    n++;
  }
  await setSetting('ig_last_sync', now());
  await intLog('instagram', 'ok', `Métricas sincronizadas (${n} período(s)); seguidores: ${profile.followers_count ?? '?'}`);
  return n;
}

// ---------- mídia do conteúdo (guardada no MySQL) ----------
export async function igSaveMedia(conteudoId: string, file: File | null): Promise<string> {
  const row = (await getRow('conteudos', conteudoId)) ?? fail(404, 'Conteúdo não encontrado.');
  if (!file) fail(400, 'Envie um arquivo.');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['jpg', 'jpeg', 'mp4', 'mov'].includes(ext)) fail(400, 'O Instagram aceita imagem JPEG (.jpg) ou vídeo (.mp4/.mov).');
  if (file.size > Number(env('MAX_UPLOAD_MB', '15')) * 1048576) fail(413, 'Arquivo acima do limite de upload do servidor.');
  const rel = `ANEXOS/CONTEUDOS/${conteudoId.replace(/[^A-Za-z0-9._-]/g, '_')}/midia_${Math.random().toString(16).slice(2, 10)}.${ext}`;
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', mp4: 'video/mp4', mov: 'video/quicktime' }[ext]!;
  await run('INSERT INTO arquivos(caminho,mime,tamanho,conteudo,criado_em) VALUES(?,?,?,?,?)', [rel, mime, file.size, Buffer.from(await file.arrayBuffer()), now()]);
  row.midiaInstagram = rel;
  row.atualizadoEm = now();
  await saveRow('conteudos', row);
  return rel;
}
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
  if (fmt.includes('carrossel')) throw new Error('Carrossel ainda não é publicado automaticamente: publique manualmente.');
  const isVideo = ['mp4', 'mov'].includes((rel.split('.').pop() || '').toLowerCase());
  const ig = await setting('ig_user_id');
  const caption = String(r.legenda ?? r.titulo ?? '').trim() + (r.cta ? `\n\n${r.cta}` : '');
  const p: Row = { caption };
  const url = signedMediaUrl(rel, 7200);
  if (fmt.includes('stor')) {
    p.media_type = 'STORIES';
    p[isVideo ? 'video_url' : 'image_url'] = url;
  } else if (isVideo || fmt.includes('reel')) {
    p.media_type = 'REELS';
    p.video_url = url;
  } else p.image_url = url;
  const st = await q1('SELECT * FROM ig_publish WHERE conteudo_id=?', [id]);
  let container: string = st?.container_id ?? '';
  if (!container) {
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
  await updateRow('conteudos', id, { status: 'PUBLICADO', instagramMediaId: mediaId, instagramLink: link, publicadoEm: now() }, ator);
  await intLog('instagram', 'ok', `Publicado: ${id} → ${link}`);
  return { status: 'PUBLICADO', link };
}
/** Publica o que está programado e vencido (usado pelo cron). */
export async function igPublishDue(): Promise<number> {
  if (!(await metaConnected())) return 0;
  let n = 0;
  for (const r of await listRows('conteudos')) {
    if (r.publicarInstagram !== 'SIM' || r.instagramMediaId || !r.midiaInstagram) continue;
    if (!/APROVADO|PROGRAMADO/i.test(String(r.status ?? ''))) continue;
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
    }
  }
  return n;
}
export { audit, q, strv };
