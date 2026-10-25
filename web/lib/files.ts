import { q, q1 } from './db';
import { audit } from './records';
import { fail } from './util';

/** Só formatos que o navegador mostra sem executar nada abrem na própria página; SVG, Office, ZIP etc. sempre baixam. */
const EXIBIR_NO_NAVEGADOR = /\.(pdf|png|jpe?g|gif|webp|mp4|mov|mp3|wav|txt|csv)$/i;
export async function serveFile(rel: string, prefixos: string[] = ['ANEXOS/CONTEUDOS/', 'BIBLIOTECA/']): Promise<Response> {
  rel = rel.replace(/\\/g, '/').trim();
  if (!rel || rel.includes('..') || !prefixos.some((p) => rel.startsWith(p))) fail(400, 'Arquivo inválido.');
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
