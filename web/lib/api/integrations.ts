import { Ctx } from '../ctx';
import { q, q1 } from '../db';
import { requireInternal, requireManager, stepUp } from '../auth';
import { audit, listRows, MODULES } from '../records';
import { setSetting, setting } from '../settings';
import { env, fail, now, Row, strv } from '../util';
import { json } from './handlers';

const GSHEET_DEFAULT = 'tarefas,conteudos,solicitacoes,campanhas,eventos,instagram,trafego';
const publicUrl = (c: Ctx) => (env('PUBLIC_URL') || `${c.url.protocol}//${c.url.host}`).replace(/\/+$/, '');

/** Estado e configurações das integrações. Conexão OAuth, sincronizações e publicações entram na etapa seguinte da migração. */
export async function integrationsRoute(c: Ctx) {
  const { path, method } = c;
  const todo = () => fail(501, 'Esta integração ainda está sendo migrada para a nova versão (próxima etapa).');
  switch (true) {
    case path === '/integrations/status': {
      await requireManager(c);
      const exp = parseInt(await setting('meta_token_expira', '0'), 10) || 0;
      return json({
        instagram: {
          configurado: (await setting('meta_app_id')) !== '' && (await setting('meta_app_secret')) !== '',
          appId: await setting('meta_app_id'),
          conectado: (await setting('meta_token')) !== '' && (await setting('ig_user_id')) !== '',
          usuario: await setting('ig_username'), pagina: await setting('meta_page_name'),
          expiraEm: exp ? now(new Date(exp * 1000)) : '', ultimaSync: await setting('ig_last_sync'),
        },
        google: {
          configurado: (await setting('g_client_id')) !== '' && (await setting('g_client_secret')) !== '',
          clientId: await setting('g_client_id'), conectado: (await setting('g_refresh_token')) !== '', email: await setting('g_email'),
          ultimaAgenda: await setting('g_last_cal_sync'), planilhaUrl: await setting('g_sheet_url'), ultimaPlanilha: await setting('g_last_sheet_export'),
          driveAuto: (await setting('g_auto_drive_entregas')) === '1', driveFolder: await setting('g_drive_folder_id'),
          planilhaModulos: await setting('g_sheet_modules', GSHEET_DEFAULT),
        },
        redirectUris: { meta: publicUrl(c) + '/api/integrations/meta/callback', google: publicUrl(c) + '/api/integrations/google/callback' },
        cron: 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" ' + publicUrl(c) + '/api/cron/integracoes',
      });
    }
    case path === '/integrations/settings' && method === 'POST': {
      const u = await requireManager(c);
      const input = await c.body();
      await stepUp(u, input);
      for (const k of ['meta_app_id', 'meta_app_secret', 'g_client_id', 'g_client_secret']) if (input[k] !== undefined && strv(input[k]).trim() !== '') await setSetting(k, strv(input[k]).trim());
      if (input.g_auto_drive_entregas !== undefined) await setSetting('g_auto_drive_entregas', input.g_auto_drive_entregas ? '1' : '0');
      if (input.g_sheet_modules !== undefined) await setSetting('g_sheet_modules', strv(input.g_sheet_modules).split(',').map((m) => m.trim()).filter((m) => m in MODULES).join(','));
      await audit(u.codigo, 'integracoes-config');
      return json({ ok: true });
    }
    case path === '/integrations/meta/disconnect' && method === 'POST': {
      const u = await requireManager(c);
      await stepUp(u, await c.body());
      for (const k of ['meta_token', 'meta_token_expira', 'ig_user_id', 'ig_username', 'meta_page_name']) await setSetting(k, '');
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
    case path === '/integrations/log': {
      await requireManager(c);
      return json(await q('SELECT quando,servico,nivel,msg FROM integration_log ORDER BY id DESC LIMIT 40'));
    }
    default:
      void q1;
      return todo();
  }
}
