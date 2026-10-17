import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Ctx } from '../ctx';
import { q1 } from '../db';
import { requireAdmin } from '../auth';
import { audit } from '../records';
import { intLog } from '../settings';
import { definirPortal, MSG_PORTAL_OFF, portalAtivo } from '../portal';
import { fail, Row } from '../util';
import { json } from './handlers';

/** Arquivos da tela do Portal: só são entregues com o Portal ligado. */
const ARQUIVOS: Record<string, string> = {
  'solicitante.html': 'text/html; charset=utf-8',
  'portal.js': 'text/javascript; charset=utf-8',
  'manifest-portal.webmanifest': 'application/manifest+json; charset=utf-8',
};
const PAGINA_OFF = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Portal indisponível</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f5f6fa;color:#2b2d3a}main{max-width:460px;margin:24px;background:#fff;border:1px solid #e2e4ec;border-radius:20px;padding:28px;text-align:center}h1{color:#063996;margin:0 0 10px;font-size:22px}p{margin:0;color:#6b6f80;line-height:1.5}</style></head><body><main><h1>Portal temporariamente indisponível</h1><p>${MSG_PORTAL_OFF}</p></main></body></html>`;
const arquivoPublic = (f: string) => path.join(process.cwd(), 'public', f);

async function estado(): Promise<Row> {
  const n = async (sql: string) => Number((await q1(sql))?.n ?? 0);
  return {
    ativo: await portalAtivo(),
    codigos: await n('SELECT COUNT(*) n FROM portal_users'),
    solicitacoesDoPortal: await n("SELECT COUNT(*) n FROM records WHERE modulo='solicitacoes' AND data LIKE '%PORTAL_SOLICITANTE%'"),
  };
}

export async function portalRoute(c: Ctx): Promise<Response> {
  const { path: rota, method } = c;
  // entrega controlada das páginas do Portal (as URLs diretas são reescritas para cá)
  if (rota.startsWith('/portal/pagina/') && method === 'GET') {
    const f = rota.slice('/portal/pagina/'.length);
    if (!(f in ARQUIVOS)) fail(404, 'Não encontrado.');
    if (!(await portalAtivo())) {
      if (f === 'solicitante.html') return new Response(PAGINA_OFF, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Retry-After': '86400' } });
      return new Response('', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const buf = await readFile(arquivoPublic(f));
    return new Response(new Uint8Array(buf), { headers: { 'Content-Type': ARQUIVOS[f], 'Cache-Control': 'no-cache' } });
  }
  // interruptor (somente a Gerência / Administração)
  if (rota === '/admin/portal') {
    const u = await requireAdmin(c);
    if (method === 'POST') {
      const b = await c.body();
      const quer = b.ativo === true || b.ativo === '1' || b.ativo === 'true';
      if (quer && b.confirmar !== true && b.confirmar !== 'REATIVAR') fail(400, 'Confirme a reativação do Portal.');
      const antes = await portalAtivo();
      await definirPortal(quer);
      if (antes !== quer) {
        await audit(String(u.codigo), quer ? 'portal-reativado' : 'portal-suspenso', 'configuracoes', 'portal');
        await intLog('portal', quer ? 'ok' : 'aviso', quer ? 'Portal das Coordenações reativado.' : 'Portal das Coordenações suspenso.');
      }
    }
    return json(await estado());
  }
  return fail(404, 'Rota não encontrada.');
}
