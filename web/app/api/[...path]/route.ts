import { makeCtx } from '../../../lib/ctx';
import { ensureMigrated } from '../../../lib/migrate';
import { HttpError, reqStore } from '../../../lib/util';
import { json, route } from '../../../lib/api/handlers';
import { diag } from '../../../lib/api/diag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(req: Request, ctx: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const c = makeCtx(req, '/' + (path ?? []).join('/'));
  return reqStore.run({ ip: c.ip }, async () => {
    let res: Response;
    try {
      if (c.path === '/diag') res = await diag(c);
      else {
        if (c.path !== '/heartbeat') await ensureMigrated();
        res = await route(c);
      }
    } catch (e) {
      if (e instanceof HttpError) res = json({ error: e.message }, e.status);
      else {
        console.error('[api] erro interno:', e);
        res = json({ error: 'Erro interno do servidor.' }, 500);
      }
    }
    if (c.setCookies.length) {
      const h = new Headers(res.headers);
      for (const sc of c.setCookies) h.append('Set-Cookie', sc);
      res = new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  });
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
