import { fail } from './util';

/** Leitura segura de formato e dimensões de PNG e JPEG (só os cabeçalhos; nada é decodificado nem executado). */
export interface InfoImagem { mime: 'image/png' | 'image/jpeg'; largura: number; altura: number }
export function lerImagem(b: Buffer): InfoImagem {
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.subarray(12, 16).toString('latin1') === 'IHDR') {
    return { mime: 'image/png', largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { mime: 'image/jpeg', altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return fail(400, 'Formato não aceito. Envie a logo em PNG ou JPEG.');
}
export const LOGO = { maxBytes: 1_000_000, larguraMin: 300, larguraMax: 4000, alturaMin: 60, alturaMax: 2000, proporcaoMin: 1.5, proporcaoMax: 8 };
/** Regras da logo institucional: formato, tamanho e dimensões. Devolve a informação ou falha com a mensagem em português. */
export function validarLogo(b: Buffer): InfoImagem {
  if (!b.length) fail(400, 'Arquivo vazio.');
  if (b.length > LOGO.maxBytes) fail(400, `A logo tem ${(b.length / 1048576).toFixed(1).replace('.', ',')} MB; o máximo é 1 MB.`);
  const i = lerImagem(b);
  if (i.largura < LOGO.larguraMin || i.largura > LOGO.larguraMax || i.altura < LOGO.alturaMin || i.altura > LOGO.alturaMax) fail(400, `Dimensões ${i.largura}×${i.altura} px fora do aceito: largura de ${LOGO.larguraMin} a ${LOGO.larguraMax} px e altura de ${LOGO.alturaMin} a ${LOGO.alturaMax} px.`);
  const p = i.largura / i.altura;
  if (p < LOGO.proporcaoMin || p > LOGO.proporcaoMax) fail(400, 'A logo deve ser horizontal (largura entre 1,5 e 8 vezes a altura), como a logo atual.');
  return i;
}
