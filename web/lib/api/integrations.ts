import { Ctx } from '../ctx';
import { q, q1 } from '../db';
import { requireInternal, requireManager, stepUp } from '../auth';
import { audit, listRows, MODULES } from '../records';
import { intLog, setSetting, setting } from '../settings';
import { env, fail, now, Row, strv } from '../util';
import { checkState, publicUrl, verifySignedMedia } from '../integrations/http';
import { igMarkError, igPublish, igSaveMedia, igSync, metaConnectUrl, metaConnected, metaDiscoverAccount, metaFinishConnect, metaRefreshIfNeeded, metaUsarConta, MetaConta } from '../integrations/meta';
import { gCalendarSync, gConnectUrl, gConnected, gDriveSendEntregas, gFinishConnect, gSheetsExport, GSHEET_DEFAULT_MODULES } from '../integrations/google';
import { iaConfigurada, IA_MODELO } from '../ia';
import { adsPermitido, adsSnapshots, ContaAds, listarContasAds, adsSync, alertasTrafego, limitesAlerta } from '../integrations/metaads';
import { json } from './handlers';

const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });
const bad = (svc: string, e: any): never => {
  void intLog(svc, 'erro', e.message);
  return fail(502, e.message);
};

/** Rotas /integrations/* e /public/media. */
export async function integrationsRoute(c: Ctx): Promise<Response> {
  const { path, method } = c;
  switch (true) {
    case path === '/public/media': {
      const rel = verifySignedMedia(c.qs('p'), parseInt(c.qs('e'), 10) || 0, c.qs('s'));
      const f = await q1('SELECT mime,conteudo FROM arquivos WHERE caminho=?', [rel]);
      if (!f) fail(404, 'Arquivo não encontrado.');
      const buf = f.conteudo as Buffer;
      return new Response(new Uint8Array(buf), { headers: { 'Content-Type': f.mime, 'Content-Length': String(buf.length), 'Cache-Control': 'no-store' } });
    }
    case path === '/integrations/meta/callback' || path === '/integrations/google/callback': {
      const svc = path.includes('meta') ? 'meta' : 'google';
      const dest = '/?page=administracao&int=';
      try {
        if (!checkState(c.qs('state'), svc)) throw new Error('Sessão de conexão expirada. Tente de novo.');
        if (c.qs('error')) throw new Error('Autorização negada: ' + (c.qs('error_description') || c.qs('error')));
        if (svc === 'meta') await metaFinishConnect(c.qs('code'));
        else await gFinishConnect(c.qs('code'));
        await audit('integracao:' + svc, 'conectado');
        return redirect(dest + svc + '_ok');
      } catch (e: any) {
        await intLog(svc, 'erro', e.message);
        return redirect(`${dest}${svc}_erro&msg=${encodeURIComponent(String(e.message).slice(0, 200))}`);
      }
    }
    case path === '/integrations/status': {
      await requireManager(c);
      const exp = parseInt(await setting('meta_token_expira', '0'), 10) || 0;
      return json({
        instagram: {
          configurado: (await setting('meta_app_id')) !== '' && (await setting('meta_app_secret')) !== '',
          appId: await setting('meta_app_id'), conectado: await metaConnected(), usuario: await setting('ig_username'), pagina: await setting('meta_page_name'),
          expiraEm: exp ? now(new Date(exp * 1000)) : '', ultimaSync: await setting('ig_last_sync'),
          contas: JSON.parse((await setting('meta_contas')) || '[]'), igUserId: await setting('ig_user_id'), tokenInvalido: (await setting('meta_token_invalido')) === '1',
          permissoesFaltando: (await setting('meta_perm_faltando')).split(',').filter(Boolean),
        },
        google: {
          configurado: (await setting('g_client_id')) !== '' && (await setting('g_client_secret')) !== '',
          clientId: await setting('g_client_id'), conectado: await gConnected(), email: await setting('g_email'),
          ultimaAgenda: await setting('g_last_cal_sync'), planilhaUrl: await setting('g_sheet_url'), ultimaPlanilha: await setting('g_last_sheet_export'),
          driveAuto: (await setting('g_auto_drive_entregas')) === '1', driveFolder: await setting('g_drive_folder_id'),
          planilhaModulos: await setting('g_sheet_modules', GSHEET_DEFAULT_MODULES.join(',')),
        },
        ads: { limites: await limitesAlerta(), ativar: (await setting('meta_ads_ativar')) === '1', conta: await setting('meta_ads_conta'), contas: JSON.parse((await setting('meta_ads_contas')) || '[]'), ultimaSync: await setting('meta_ads_ultima_sync'), permitido: (await metaConnected()) ? await adsPermitido() : false },
        ia: { configurada: await iaConfigurada(), guiaVoz: await setting('ia_guia_voz'), modelo: IA_MODELO() },
        redirectUris: { meta: publicUrl(c.url.origin) + '/api/integrations/meta/callback', google: publicUrl(c.url.origin) + '/api/integrations/google/callback' },
        cron: 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" ' + publicUrl(c.url.origin) + '/api/cron/integracoes?tarefa=sincronizar',
      });
    }
    case path === '/integrations/prontidao': {
      await requireManager(c);
      const origin = publicUrl(c.url.origin);
      type Item = { id: string; ok: boolean; nivel: 'erro' | 'aviso'; titulo: string; como: string };
      const it: Item[] = [];
      const add = (id: string, ok: boolean, nivel: 'erro' | 'aviso', titulo: string, como: string) => it.push({ id, ok, nivel, titulo, como });
      const pub = env('PUBLIC_URL');
      // Atrás do proxy c.url.origin é o endereço interno (0.0.0.0:3000): usa o host encaminhado.
      const fwdHost = (c.req.headers.get('x-forwarded-host') || c.req.headers.get('host') || '').split(',').pop()!.trim();
      const hostOk = !fwdHost || /^(0\.0\.0\.0|127\.|localhost)/.test(fwdHost) || pub.replace(/\/+$/, '').toLowerCase().endsWith('//' + fwdHost.toLowerCase());
      add('public_url', /^https:\/\//.test(pub) && hostOk, 'erro', 'PUBLIC_URL é o endereço https do sistema', `Defina PUBLIC_URL=https://${fwdHost && !/^(0\.0\.0\.0|127\.|localhost)/.test(fwdHost) ? fwdHost : 'seu-dominio'} nas variáveis da Hostinger (precisa ser https e igual ao endereço de acesso).`);
      add('app_key', env('APP_KEY').length >= 32, 'erro', 'APP_KEY com 32+ caracteres (criptografa os tokens)', 'Gere com "npm run gerar:segredos" e não troque depois de conectar.');
      add('cron_secret', env('CRON_SECRET').length >= 16, 'erro', 'CRON_SECRET definido (protege o cron)', 'Defina CRON_SECRET (16+ caracteres) e use-o no cron da Hostinger.');
      add('setup_key', env('SETUP_KEY') === '', 'aviso', 'SETUP_KEY removida depois da instalação', 'Remova SETUP_KEY das variáveis da Hostinger depois de instalar: ela libera rotas de diagnóstico e instalação.');
      add('recovery_key', env('RECOVERY_KEY') === '', 'aviso', 'RECOVERY_KEY removida', 'Remova RECOVERY_KEY das variáveis depois de recuperar o acesso: ela permite gerar um novo código para a Gerência.');
      add('smtp', env('SMTP_HOST') !== '' && env('NOTIFY_TO') !== '', 'aviso', 'E-mail configurado (SMTP_* e NOTIFY_TO) para avisos de falha', 'Sem isso as falhas só aparecem na central de notificações.');
      const metaCred = (await setting('meta_app_id')) !== '' && (await setting('meta_app_secret')) !== '';
      add('meta_cred', metaCred, 'erro', 'Meta: App ID e App Secret salvos', 'Cole as credenciais na caixa Instagram (veja GUIA_INTEGRACOES.md).');
      const metaOn = await metaConnected();
      add('meta_conn', metaOn, 'erro', 'Meta: Instagram conectado', 'Clique em "Conectar com Facebook/Instagram" e aceite todas as permissões.');
      const exp = parseInt(await setting('meta_token_expira', '0'), 10) || 0;
      add('meta_valido', (await setting('meta_token_invalido')) !== '1', 'erro', 'Meta: acesso válido (não expirou nem foi revogado)', 'Reconecte o Instagram: o acesso expirou, foi revogado ou a senha do Facebook mudou.');
      add('meta_perm', !(await setting('meta_perm_faltando')), 'erro', 'Meta: todas as permissões foram aceitas', `Faltam: ${await setting('meta_perm_faltando')}. Reconecte e deixe todas marcadas.`);
      add('meta_token', !metaOn || (exp * 1000 - Date.now()) / 86400000 > 10, 'aviso', 'Meta: token com mais de 10 dias de validade', 'O cron renova sozinho; se faltar menos de 10 dias, o cron não está rodando — reconecte.');
      const gCred = (await setting('g_client_id')) !== '' && (await setting('g_client_secret')) !== '';
      add('g_cred', gCred, 'erro', 'Google: Client ID e Client Secret salvos', 'Cole as credenciais na caixa Google (veja GUIA_INTEGRACOES.md).');
      add('g_conn', await gConnected(), 'erro', 'Google: conta conectada (Agenda, Drive, Planilhas)', 'Clique em "Conectar com Google" e aceite as permissões.');
      const recente = async (k: string) => { const v = await setting(k); return v !== '' && Date.now() - new Date(v).getTime() < 2 * 86400000; };
      add('cron_roda', (!metaOn || (await recente('ig_last_sync'))) && (!(await gConnected()) || (await recente('g_last_cal_sync'))), 'aviso', 'Sincronização rodou nos últimos 2 dias', 'Crie o cron da Hostinger (comando abaixo) ou use os botões "Sincronizar agora".');
      return json({
        pronto: it.every((x) => x.ok || x.nivel === 'aviso'), itens: it,
        urls: { site: origin, privacidade: origin + '/privacidade.html', termos: origin + '/termos.html', metaRedirect: origin + '/api/integrations/meta/callback', googleRedirect: origin + '/api/integrations/google/callback' },
        cron: 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" ' + origin + '/api/cron/integracoes?tarefa=sincronizar',
      });
    }
    case path === '/integrations/settings' && method === 'POST': {
      const u = await requireManager(c);
      const input = await c.body();
      await stepUp(u, input);
      for (const k of ['meta_app_id', 'meta_app_secret', 'g_client_id', 'g_client_secret']) if (input[k] !== undefined && strv(input[k]).trim() !== '') await setSetting(k, strv(input[k]).trim());
      if (input.anthropic_key !== undefined && strv(input.anthropic_key).trim() !== '') await setSetting('anthropic_key', strv(input.anthropic_key).trim());
      if (input.ia_guia_voz !== undefined) await setSetting('ia_guia_voz', strv(input.ia_guia_voz).slice(0, 4000));
      if (input.g_auto_drive_entregas !== undefined) await setSetting('g_auto_drive_entregas', input.g_auto_drive_entregas ? '1' : '0');
      if (input.g_sheet_modules !== undefined) await setSetting('g_sheet_modules', strv(input.g_sheet_modules).split(',').map((m) => m.trim()).filter((m) => m in MODULES).join(','));
      await audit(u.codigo, 'integracoes-config');
      return json({ ok: true });
    }
    case path === '/integrations/meta/connect': {
      await requireManager(c);
      return redirect(await metaConnectUrl());
    }
    case path === '/integrations/google/connect': {
      await requireManager(c);
      try { return redirect(await gConnectUrl()); } catch (e: any) { return fail(400, e.message); }
    }
    case path === '/integrations/meta/token' && method === 'POST': {
      const u = await requireManager(c);
      const input = await c.body();
      await stepUp(u, input);
      const tok = strv(input.token).trim();
      if (!tok) fail(400, 'Informe o token.');
      await setSetting('meta_token', tok);
      await setSetting('meta_token_invalido', '');
      await setSetting('meta_token_expira', '0');
      try {
        if (strv(input.ig_user_id).trim()) await setSetting('ig_user_id', strv(input.ig_user_id).trim());
        else await metaDiscoverAccount();
      } catch (e: any) { fail(400, e.message); }
      await audit(u.codigo, 'instagram-token-manual');
      return json({ ok: true });
    }
    case path === '/integrations/ads/config' && method === 'POST': {
      const u = await requireManager(c);
      const b = await c.body();
      if ('ativar' in b) await setSetting('meta_ads_ativar', b.ativar ? '1' : '0');
      for (const [k, cfg] of [['ctrMin', 'ads_ctr_min'], ['frequenciaMax', 'ads_freq_max'], ['gastoSemResultado', 'ads_gasto_sem_resultado'], ['impressoesMin', 'ads_impr_min']] as const) {
        if (k in b) { const v = Number(b[k]); if (!Number.isFinite(v) || v <= 0 || v > 1_000_000) fail(400, `Valor inválido para ${k}.`); await setSetting(cfg, String(v)); }
      }
      await audit(u.codigo, 'ads-config', '', b.ativar ? 'ativado' : 'desativado');
      return json({ ok: true });
    }
    case path === '/integrations/ads/accounts': {
      await requireManager(c);
      try { return json({ contas: await listarContasAds() }); } catch (e: any) { return fail(502, e.message); }
    }
    case path === '/integrations/ads/account' && method === 'POST': {
      const u = await requireManager(c);
      const b = await c.body();
      const contas: ContaAds[] = JSON.parse((await setting('meta_ads_contas')) || '[]');
      const alvo = contas.find((x) => x.id === strv(b.conta)) ?? fail(400, 'Conta de anúncios não encontrada. Atualize a lista.');
      await setSetting('meta_ads_conta', alvo.id);
      await audit(u.codigo, 'ads-conta', '', alvo.id);
      return json({ ok: true });
    }
    case path === '/integrations/ads/sync' && method === 'POST': {
      await requireManager(c);
      try { return json({ linhas: await adsSync() }); } catch (e: any) { await intLog('instagram', 'erro', 'Meta Ads: ' + e.message); return fail(502, e.message); }
    }
    case path === '/traffic/snapshots': {
      await requireInternal(c);
      return json({ alertas: await alertasTrafego(), limites: await limitesAlerta(), rows: await adsSnapshots(c.qs('periodo') || undefined), ultimaSync: await setting('meta_ads_ultima_sync'), conta: await setting('meta_ads_conta'), fonte: 'Meta Ads (leitura)' });
    }
    case path === '/integrations/meta/account' && method === 'POST': {
      const u = await requireManager(c);
      const input = await c.body();
      const contas: MetaConta[] = JSON.parse((await setting('meta_contas')) || '[]');
      const alvo = contas.find((x) => x.ig === strv(input.ig_user_id)) ?? fail(400, 'Conta não encontrada nas Páginas deste usuário.');
      await metaUsarConta(alvo);
      await audit(u.codigo, 'instagram-conta', alvo.usuario);
      return json({ ok: true });
    }
    case path === '/integrations/meta/disconnect' && method === 'POST': {
      const u = await requireManager(c);
      await stepUp(u, await c.body());
      for (const k of ['meta_token', 'meta_token_expira', 'ig_user_id', 'ig_username', 'meta_page_name', 'meta_contas', 'meta_perm_faltando', 'meta_token_invalido', 'meta_ads_conta', 'meta_ads_contas', 'meta_ads_ultima_sync']) await setSetting(k, '');
      await audit(u.codigo, 'instagram-desconectado');
      return json({ ok: true });
    }
    case path === '/integrations/google/disconnect' && method === 'POST': {
      const u = await requireManager(c);
      await stepUp(u, await c.body());
      for (const k of ['g_refresh_token', 'g_access_token', 'g_access_expira', 'g_email']) await setSetting(k, '');
      await audit(u.codigo, 'google-desconectado');
      return json({ ok: true });
    }
    case path === '/integrations/instagram/sync' && method === 'POST': {
      await requireManager(c);
      try { await metaRefreshIfNeeded(); return json({ periodos: await igSync() }); } catch (e: any) { return bad('instagram', e); }
    }
    case path === '/integrations/instagram/queue': {
      await requireInternal(c);
      const st: Record<string, Row> = {};
      for (const s of await q('SELECT * FROM ig_publish')) st[s.conteudo_id] = s;
      const o: Row[] = [];
      for (const r of await listRows('conteudos')) {
        if ((r.publicarInstagram ?? '') !== 'SIM') continue;
        const s = st[r.id];
        o.push({ id: r.id, titulo: r.titulo ?? '', status: r.status ?? '', publicacaoEm: r.publicacaoEm ?? '', formato: r.formato ?? '', midia: r.midiaInstagram ?? '', publicado: !!r.instagramMediaId, link: r.instagramLink ?? '', estado: s?.status ?? '', erro: s?.erro ?? '' });
      }
      return json(o);
    }
    case path === '/integrations/instagram/media' && method === 'POST': {
      const u = await requireInternal(c);
      const form = await c.req.formData();
      const f = (form.getAll('files')[0] ?? form.get('file')) as File | string | null;
      const rel = await igSaveMedia(c.qs('id'), f && typeof f !== 'string' ? f : null);
      await audit(u.codigo, 'instagram-midia', 'conteudos', c.qs('id'));
      return json({ midia: rel });
    }
    case path === '/integrations/instagram/publish' && method === 'POST': {
      const u = await requireInternal(c);
      const id = strv((await c.body()).id);
      try {
        const r = await igPublish(id, u.codigo);
        await audit(u.codigo, 'instagram-publicado', 'conteudos', id);
        return json(r);
      } catch (e: any) {
        await igMarkError(id, e.message);
        return bad('instagram', e);
      }
    }
    case path === '/integrations/google/calendar/sync' && method === 'POST': {
      await requireManager(c);
      try { return json(await gCalendarSync()); } catch (e: any) { return bad('google', e); }
    }
    case path === '/integrations/google/sheets/export' && method === 'POST': {
      await requireManager(c);
      try { return json({ abas: await gSheetsExport(), url: await setting('g_sheet_url') }); } catch (e: any) { return bad('google', e); }
    }
    case path === '/integrations/google/drive/send-entregas' && method === 'POST': {
      await requireManager(c);
      let n = 0;
      try {
        for (const r of await listRows('solicitacoes')) if (r.arquivosEntrega) n += await gDriveSendEntregas(r.id);
      } catch (e: any) { return bad('google', e); }
      return json({ arquivos: n });
    }
    case path === '/integrations/log': {
      await requireManager(c);
      return json(await q('SELECT quando,servico,nivel,msg FROM integration_log ORDER BY id DESC LIMIT 40'));
    }
    default:
      return fail(404, 'Rota não encontrada.');
  }
}
