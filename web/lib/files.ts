import { Ctx } from './ctx';
import { q, q1, run } from './db';
import { ALLOWED_EXT, audit, listRows } from './records';
import { allowedSegment } from './auth';
import { envInt, fail, now, Row, safePart } from './util';
import { randHex } from './crypto';

const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', txt: 'text/plain' };

/** Grava os arquivos do campo "files" (multipart) no MySQL e devolve os caminhos relativos. */
export async function saveUploads(c: Ctx, id: string, sub: string): Promise<string[]> {
  const ct = c.header('content-type');
  if (!ct.includes('multipart/form-data')) return [];
  const form = await c.req.formData();
  const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
  const max = envInt('MAX_UPLOAD_MB', 15) * 1048576;
  const rel = 'ANEXOS/SOLICITACOES/' + safePart(id) + (sub ? '/' + sub : '');
  const saved: string[] = [];
  for (const f of files) {
    if (f.size > max) fail(413, `Arquivo acima do limite de ${Math.floor(max / 1048576)} MB.`);
    const base = safePart(f.name.split(/[\\/]/).pop() || '') || 'arquivo';
    const ext = (base.includes('.') ? base.split('.').pop()! : '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) fail(400, `Tipo de arquivo não permitido: .${ext}`);
    let path = `${rel}/${base}`;
    if (await q1('SELECT 1 FROM arquivos WHERE caminho=?', [path])) path = `${rel}/${base.slice(0, base.length - ext.length - 1)}_${randHex(4)}.${ext}`;
    await run('INSERT INTO arquivos(caminho,mime,tamanho,conteudo,criado_em) VALUES(?,?,?,?,?)', [path, MIME[ext] ?? 'application/octet-stream', f.size, Buffer.from(await f.arrayBuffer()), now()]);
    saved.push(path);
  }
  return saved;
}

export async function serveFile(rel: string, portal: Row | null): Promise<Response> {
  rel = rel.replace(/\\/g, '/').trim();
  if (!rel || rel.includes('..') || !rel.startsWith('ANEXOS/SOLICITACOES/')) fail(400, 'Arquivo inválido.');
  if (portal) {
    let ok = false;
    for (const r of await listRows('solicitacoes')) {
      if (!allowedSegment(portal, r.segmento ?? '')) continue;
      for (const x of `${r.anexos ?? ''} | ${r.arquivosEntrega ?? ''}`.split('|')) if (x.replace(/\\/g, '/').trim() === rel) ok = true;
    }
    if (!ok) fail(403, 'Arquivo não autorizado.');
  }
  const f = await q1('SELECT mime,conteudo FROM arquivos WHERE caminho=?', [rel]);
  if (!f) fail(404, 'Arquivo não encontrado.');
  const name = rel.split('/').pop()!.replace(/"/g, '');
  return new Response(new Uint8Array(f.conteudo as Buffer), {
    headers: { 'Content-Type': f.mime, 'Content-Disposition': `inline; filename="${name}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'no-store' },
  });
}
export { audit, q };
