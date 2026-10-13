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
  if (files.length > 10) fail(400, 'Envie no máximo 10 arquivos por vez.');
  const max = envInt('MAX_UPLOAD_MB', 15) * 1048576;
  const rel = 'ANEXOS/SOLICITACOES/' + safePart(id) + (sub ? '/' + sub : '');
  const saved: string[] = [];
  for (const f of files) {
    if (f.size > max) fail(413, `Arquivo acima do limite de ${Math.floor(max / 1048576)} MB.`);
    const base = safePart(f.name.split(/[\\/]/).pop() || '') || 'arquivo';
    const ext = (base.includes('.') ? base.split('.').pop()! : '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) fail(400, `Tipo de arquivo não permitido: .${ext}`);
    const buf = Buffer.from(await f.arrayBuffer());
    if (!conteudoCoerente(ext, buf)) fail(400, `O conteúdo de "${base}" não corresponde ao tipo .${ext}.`);
    let path = `${rel}/${base}`;
    if (await q1('SELECT 1 FROM arquivos WHERE caminho=?', [path])) path = `${rel}/${base.slice(0, base.length - ext.length - 1)}_${randHex(4)}.${ext}`;
    await run('INSERT INTO arquivos(caminho,mime,tamanho,conteudo,criado_em) VALUES(?,?,?,?,?)', [path, MIME[ext] ?? 'application/octet-stream', f.size, buf, now()]);
    saved.push(path);
  }
  return saved;
}

/** Só formatos que o navegador mostra sem executar nada abrem na própria página; SVG, Office, ZIP etc. sempre baixam. */
const EXIBIR_NO_NAVEGADOR = /\.(pdf|png|jpe?g|gif|webp|mp4|mov|mp3|wav|txt|csv)$/i;
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
    headers: { 'Content-Type': f.mime, 'Content-Disposition': `${EXIBIR_NO_NAVEGADOR.test(name) ? 'inline' : 'attachment'}; filename="${name}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'no-store' },
  });
}
export { audit, q };

/** Confere a assinatura (primeiros bytes) dos formatos conhecidos e recusa SVG com script. Texto e formatos sem assinatura simples passam. */
export function conteudoCoerente(ext: string, b: Buffer): boolean {
  const at = (off: number, s: string) => b.subarray(off, off + s.length).toString('latin1') === s;
  switch (ext) {
    case 'pdf': return at(0, '%PDF');
    case 'png': return at(0, '\x89PNG');
    case 'jpg': case 'jpeg': return b[0] === 0xff && b[1] === 0xd8;
    case 'gif': return at(0, 'GIF8');
    case 'webp': return at(0, 'RIFF') && at(8, 'WEBP');
    case 'zip': case 'docx': case 'xlsx': case 'pptx': return at(0, 'PK');
    case 'mp4': case 'mov': return at(4, 'ftyp') || at(4, 'moov') || at(4, 'wide') || at(4, 'mdat');
    case 'svg': return !/<script|\son\w+\s*=|javascript:/i.test(b.toString('utf8'));
    default: return true;
  }
}
