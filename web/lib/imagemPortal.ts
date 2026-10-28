import sharp from 'sharp';
import { createHash } from 'node:crypto';

/** Verificações do que o responsável envia pelo portal. Sem banco e sem rede. */

/** Lê uma assinatura desenhada (data URL PNG do canvas). Recusa vazia, minúscula, enorme ou que não seja PNG; devolve um PNG limpo (sem metadados). */
export async function validarAssinaturaDesenhada(dataUrl: string): Promise<{ ok: true; png: Buffer; hash: string } | { ok: false; erro: string }> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { ok: false, erro: 'Assinatura inválida. Desenhe de novo.' };
  if (m[1].length > 600_000) return { ok: false, erro: 'A assinatura ficou grande demais. Limpe e desenhe de novo.' };
  let bruto: Buffer;
  try { bruto = Buffer.from(m[1], 'base64'); } catch { return { ok: false, erro: 'Assinatura inválida. Desenhe de novo.' }; }
  if (bruto.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return { ok: false, erro: 'Assinatura inválida. Desenhe de novo.' };
  try {
    const img = sharp(bruto, { limitInputPixels: 4_000_000 });
    const meta = await img.metadata();
    if (!meta.width || !meta.height || meta.width < 150 || meta.height < 50 || meta.width > 2400 || meta.height > 1200) return { ok: false, erro: 'Assinatura inválida. Desenhe de novo.' };
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let tinta = 0, x0 = info.width, x1 = 0, y0 = info.height, y1 = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] > 80 && data[i] + data[i + 1] + data[i + 2] < 540) { tinta++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (tinta < 120 || x1 - x0 < info.width * 0.12) return { ok: false, erro: 'A assinatura está em branco ou curta demais. Desenhe o traço com o dedo, mouse ou caneta.' };
    const png = await sharp(bruto).flatten({ background: '#ffffff' }).png({ compressionLevel: 9 }).toBuffer();
    return { ok: true, png, hash: createHash('sha256').update(png).digest('hex') };
  } catch {
    return { ok: false, erro: 'Assinatura inválida. Desenhe de novo.' };
  }
}

/** Conferências rápidas de um PDF devolvido pelo GOV.BR. NÃO validam a assinatura: servem só para barrar arquivo errado e orientar quem valida. */
export function examinarPdfAssinado(buf: Buffer, original: Buffer | null): { pdf: boolean; temAssinatura: boolean; contemOriginal: boolean } {
  const pdf = buf.length > 1024 && buf.subarray(0, 5).toString('latin1') === '%PDF-' && buf.subarray(Math.max(0, buf.length - 2048)).toString('latin1').includes('%%EOF');
  const texto = buf.toString('latin1');
  const temAssinatura = /\/ByteRange\s*\[/.test(texto) && /\/Type\s*\/Sig\b|\/Filter\s*\/Adobe\.PPKLite|\/SubFilter\s*\/(adbe|ETSI)/.test(texto);
  const contemOriginal = !!original && original.length > 0 && buf.length > original.length && buf.subarray(0, original.length).equals(original);
  return { pdf, temAssinatura, contemOriginal };
}

export const PARENTESCOS = ['Mãe', 'Pai', 'Avó ou avô', 'Tutor(a) legal', 'Outro responsável legal'];
