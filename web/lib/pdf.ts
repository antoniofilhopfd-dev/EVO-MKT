import PDFDocument from 'pdfkit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { q1 } from './db';
import { urlDeImagemMeta } from './integrations/trafego';
import { env } from './util';

/**
 * Caixa de ferramentas dos relatórios em PDF (A4, gerado no servidor, sem impressão do navegador).
 * Só desenha: nada aqui lê da Meta além de imagens permitidas nem grava dados.
 * Fontes padrão do PDF (Helvetica) cobrem o português; caracteres fora do Latin-1 (emojis, símbolos) são retirados do texto.
 */
export const COR = { azul: '#063996', escuro: '#00275F', laranja: '#FF7800', claro: '#00A1F3', amarelo: '#FAB900', roxo: '#793A8C', cinza: '#5E6678', linha: '#D9DEE8', fundo: '#F3F6FC', verde: '#2E9F5B', vermelho: '#C0392B', texto: '#1D2433' };
export const PAGINA = { w: 595.28, h: 841.89, m: 36 };
export type Doc = InstanceType<typeof PDFDocument>;

/** Texto seguro para as fontes padrão do PDF. */
export const limpa = (v: unknown): string => String(v ?? '').normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\u0009\u000A -~ -ÿ]/g, '').replace(/\s+/g, ' ').trim();
const pt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
export const n0 = (v: number | null | undefined) => (v === null || v === undefined ? '-' : pt.format(v));
export const brl = (v: number | null | undefined) => (v === null || v === undefined ? '-' : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pc = (v: number | null | undefined) => (v === null || v === undefined ? '-' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%');
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const varTxt = (v: { tipo: string; percentual: number | null } | null | undefined): { t: string; cor: string } => {
  if (!v || v.tipo === 'sem') return { t: 'sem base de comparacao', cor: COR.cinza };
  if (v.tipo === 'novo') return { t: 'novo no periodo', cor: COR.cinza };
  if (v.tipo === 'estavel') return { t: 'estavel', cor: COR.cinza };
  const p = Math.abs(v.percentual ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return { t: `${v.tipo === 'subiu' ? '+' : '-'}${p}%`, cor: v.tipo === 'subiu' ? COR.verde : COR.vermelho };
};

/** Cria o documento e devolve o PDF pronto (Buffer). `desenha` recebe o documento; o rodapé e a numeração são postos no fim. */
export async function gerarPdf(meta: { titulo: string; autor?: string }, rodapeEsq: string, desenha: (doc: Doc) => Promise<void> | void): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGINA.m, bufferPages: true, info: { Title: limpa(meta.titulo), Author: limpa(meta.autor || 'Colegio Evolucao - EVO MKT'), Creator: 'EVO MKT' } });
  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const fim = new Promise<void>((ok, no) => { doc.on('end', ok); doc.on('error', no); });
  await desenha(doc);
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(start + i);
    doc.page.margins.bottom = 0; // permite escrever no rodapé sem criar página nova
    const y = PAGINA.h - 28;
    doc.moveTo(PAGINA.m, y - 6).lineTo(PAGINA.w - PAGINA.m, y - 6).lineWidth(0.5).strokeColor(COR.linha).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(COR.cinza).text(limpa(rodapeEsq), PAGINA.m, y, { width: PAGINA.w - PAGINA.m * 2 - 90, lineBreak: false });
    doc.text(`Pagina ${i + 1} de ${count}`, PAGINA.w - PAGINA.m - 90, y, { width: 90, align: 'right', lineBreak: false });
  }
  doc.end();
  await fim;
  return Buffer.concat(partes);
}

/** Espaço livre até o fim útil da página; se `precisa` não couber, abre outra página e devolve o novo y. */
export const garanteEspaco = (doc: Doc, y: number, precisa: number): number => {
  if (y + precisa <= PAGINA.h - PAGINA.m - 18) return y;
  doc.addPage();
  return PAGINA.m;
};

/** Logo institucional (a enviada pelo Administrador ou a original), já em formato que o PDF aceita. */
export async function carregarLogo(): Promise<Buffer | null> {
  try {
    const f = await q1("SELECT conteudo FROM arquivos WHERE caminho='CONFIG/logo-colegio'");
    if (f?.conteudo) return f.conteudo as Buffer;
  } catch { /* usa a original */ }
  try { return await readFile(join(process.cwd(), 'public', 'img', 'logo-colegio.png')); } catch { return null; }
}

/** Baixa uma imagem da Meta/Instagram (só HTTPS dos endereços permitidos, tempo e tamanho limitados) e a converte para JPEG/PNG. */
export async function baixarImagem(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:image/')) {
      const m = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(url);
      return m ? await normalizaImagem(Buffer.from(m[2], 'base64')) : null;
    }
    const ok = urlDeImagemMeta(url);
    if (!ok) return null;
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    // META_IMG_BASE só existe em ambientes de teste (como META_GRAPH_BASE): troca o servidor das imagens, mantendo o caminho
    const base = env('META_IMG_BASE');
    const alvo = base ? base.replace(/\/$/, '') + new URL(ok).pathname : ok;
    const r = await fetch(alvo, { signal: ctl.signal, redirect: 'error', headers: { Accept: 'image/*' } }).finally(() => clearTimeout(t));
    if (!r.ok) return null;
    const len = Number(r.headers.get('content-length') || 0);
    if (len > 3_000_000) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > 3_000_000) return null;
    return await normalizaImagem(b);
  } catch { return null; }
}
async function normalizaImagem(b: Buffer): Promise<Buffer | null> {
  const png = b.length > 8 && b[0] === 0x89 && b[1] === 0x50, jpg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
  if (jpg || png) return b;
  try { const sharp = (await import('sharp')).default; return await sharp(b).jpeg({ quality: 85 }).toBuffer(); } catch { return null; }
}
/** Baixa várias imagens com no máximo `n` ao mesmo tempo. */
export async function baixarVarias(urls: string[], n = 4): Promise<(Buffer | null)[]> {
  const out: (Buffer | null)[] = urls.map(() => null);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, urls.length) }, async () => { while (i < urls.length) { const k = i++; out[k] = urls[k] ? await baixarImagem(urls[k]) : null; } }));
  return out;
}

/** Imagem dentro de uma caixa, mantendo a proporção (nunca distorce) e centralizada. */
export function imagemNaCaixa(doc: Doc, img: Buffer, x: number, y: number, w: number, h: number, fundo = '#F3F5F9'): boolean {
  try {
    doc.save().roundedRect(x, y, w, h, 3).fill(fundo).restore();
    doc.image(img, x + 1, y + 1, { fit: [w - 2, h - 2], align: 'center', valign: 'center' });
    return true;
  } catch { return false; }
}

/** Cabeçalho do relatório: logo pequena (altura máxima fixa), título, subtítulo e faixa laranja. */
export function cabecalho(doc: Doc, logo: Buffer | null, titulo: string, linhas: string[], direita?: string[]): number {
  const m = PAGINA.m, w = PAGINA.w - m * 2, altLogo = 34, maxLarg = 130;
  let xTxt = m;
  if (logo) { try { doc.image(logo, m, m, { fit: [maxLarg, altLogo] }); xTxt = m + maxLarg + 14; } catch { /* sem logo */ } }
  if (logo && xTxt > m) doc.moveTo(xTxt - 8, m + 2).lineTo(xTxt - 8, m + altLogo - 2).lineWidth(0.8).strokeColor(COR.linha).stroke();
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COR.escuro).text(limpa(titulo), xTxt, m + 1, { width: w - (xTxt - m) - (direita ? 110 : 0), lineBreak: false });
  let y = m + 18;
  doc.font('Helvetica').fontSize(7.8).fillColor(COR.cinza);
  for (const l of linhas) { doc.text(limpa(l), xTxt, y, { width: w - (xTxt - m) - (direita ? 110 : 0), lineBreak: false }); y += 10; }
  if (direita) { let yd = m + 2; doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.escuro); for (const d of direita) { doc.text(limpa(d), PAGINA.w - m - 105, yd, { width: 105, align: 'right', lineBreak: false }); yd += 12; doc.font('Helvetica').fontSize(8).fillColor(COR.cinza); } }
  const yl = Math.max(y, m + altLogo) + 6;
  doc.rect(m, yl, w, 2.2).fill(COR.laranja);
  return yl + 14;
}

export function titulo(doc: Doc, y: number, texto: string, etiqueta?: string): number {
  const w = PAGINA.w - PAGINA.m * 2;
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(COR.azul).text(limpa(texto), PAGINA.m, y, { width: w - 150, lineBreak: false, ellipsis: true });
  if (etiqueta) { const t = limpa(etiqueta); doc.font('Helvetica-Bold').fontSize(7.5); const tw = doc.widthOfString(t) + 14; doc.roundedRect(PAGINA.w - PAGINA.m - tw, y - 2, tw, 15, 3).fill('#00798C'); doc.fillColor('#fff').text(t, PAGINA.w - PAGINA.m - tw + 7, y + 2, { lineBreak: false }); }
  return y + 20;
}

export interface Cartao { rot: string; valor: string; var?: { t: string; cor: string }; nota?: string }
/** Grade de indicadores (cartões) em `cols` colunas. Devolve o y logo abaixo. */
export function cartoes(doc: Doc, y: number, itens: Cartao[], cols = 4, altura = 54): number {
  const w = PAGINA.w - PAGINA.m * 2, gap = 6, cw = (w - gap * (cols - 1)) / cols;
  itens.forEach((c, i) => {
    const x = PAGINA.m + (i % cols) * (cw + gap), yy = y + Math.floor(i / cols) * (altura + gap);
    doc.roundedRect(x, yy, cw, altura, 5).lineWidth(0.6).fillAndStroke('#FFFFFF', COR.linha);
    doc.rect(x, yy + 6, 2.5, altura - 12).fill(COR.azul);
    doc.font('Helvetica').fontSize(7.5).fillColor(COR.cinza).text(limpa(c.rot), x + 9, yy + 7, { width: cw - 14, lineBreak: false, ellipsis: true });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COR.escuro).text(limpa(c.valor), x + 9, yy + 18, { width: cw - 14, lineBreak: false, ellipsis: true });
    if (c.var) doc.font('Helvetica-Bold').fontSize(7.5).fillColor(c.var.cor).text(limpa(c.var.t), x + 9, yy + 38, { width: cw - 14, lineBreak: false, ellipsis: true });
    if (c.nota) doc.font('Helvetica').fontSize(6.8).fillColor(COR.cinza).text(limpa(c.nota), x + 9, yy + altura - 11, { width: cw - 14, lineBreak: false, ellipsis: true });
  });
  return y + Math.ceil(itens.length / cols) * (altura + gap);
}

const passoBonito = (max: number, ticks = 4) => { const bruto = max / ticks || 1, mag = 10 ** Math.floor(Math.log10(bruto)); return ([1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= bruto) ?? bruto); };

/** Gráfico de barras (uma série ou várias lado a lado). `rotulos` no eixo X; ticks do eixo Y em `fmt`. */
export function graficoBarras(doc: Doc, x: number, y: number, w: number, h: number, rotulos: string[], series: { nome: string; valores: number[]; cor: string }[], fmt: (v: number) => string, tituloGrafico?: string): void {
  doc.roundedRect(x, y, w, h, 5).lineWidth(0.6).fillAndStroke('#FFFFFF', COR.linha);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.escuro).text(limpa(tituloGrafico || ''), x + 8, y + 7, { width: w - 16, lineBreak: false });
  if (series.length > 1) { let lx = x + w - 8; for (const s of [...series].reverse()) { const tw = doc.font('Helvetica').fontSize(7.5).widthOfString(limpa(s.nome)); lx -= tw; doc.fillColor(COR.cinza).text(limpa(s.nome), lx, y + 8, { lineBreak: false }); lx -= 10; doc.rect(lx, y + 9, 7, 7).fill(s.cor); lx -= 8; } }
  const px = x + 44, pw = w - 44 - 10, py = y + 26, ph = h - 26 - 22;
  const todos = series.flatMap((s) => s.valores), max = Math.max(1e-9, ...todos), passo = passoBonito(max), topo = passo * 4;
  for (let i = 0; i <= 4; i++) {
    const yy = py + ph * (1 - i / 4);
    doc.moveTo(px, yy).lineTo(px + pw, yy).lineWidth(0.4).strokeColor('#E6E9F0').stroke();
    doc.font('Helvetica').fontSize(6.8).fillColor(COR.cinza).text(limpa(fmt(passo * i)), x + 2, yy - 3, { width: 40, align: 'right', lineBreak: false });
  }
  const n = rotulos.length || 1, gw = pw / n, bw = Math.min(26, (gw * 0.7) / series.length);
  rotulos.forEach((r, i) => {
    series.forEach((s, k) => {
      const v = Math.max(0, s.valores[i] ?? 0), bh = (v / topo) * ph, bx = px + gw * i + (gw - bw * series.length) / 2 + bw * k;
      if (bh > 0) doc.rect(bx, py + ph - bh, bw - (series.length > 1 ? 0.8 : 0), bh).fill(s.cor);
    });
    const cada = Math.max(1, Math.ceil(n / 10));
    if (i % cada === 0 || i === n - 1) doc.font('Helvetica').fontSize(6.5).fillColor(COR.cinza).text(limpa(r), px + gw * i - 8, py + ph + 4, { width: gw + 16, align: 'center', lineBreak: false });
  });
  if (!todos.some((v) => v > 0)) doc.font('Helvetica').fontSize(8).fillColor(COR.cinza).text('Sem dados no periodo.', px, py + ph / 2 - 4, { width: pw, align: 'center' });
}

/** Gráfico de linha simples com pontos. */
export function graficoLinha(doc: Doc, x: number, y: number, w: number, h: number, rotulos: string[], valores: number[], cor: string, fmt: (v: number) => string, tituloGrafico?: string, zero = false): void {
  doc.roundedRect(x, y, w, h, 5).lineWidth(0.6).fillAndStroke('#FFFFFF', COR.linha);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.escuro).text(limpa(tituloGrafico || ''), x + 8, y + 7, { width: w - 16, lineBreak: false });
  const px = x + 44, pw = w - 44 - 12, py = y + 26, ph = h - 26 - 22;
  const mx = Math.max(...valores, 1e-9), mn = zero ? 0 : Math.min(...valores), faixa = (mx - mn) || Math.max(1, mx * 0.1), passo = passoBonito(faixa), base = zero ? 0 : Math.floor(mn / passo) * passo, topo = Math.max(base + passo * 4, mx);
  for (let i = 0; i <= 4; i++) {
    const v = base + (topo - base) * i / 4, yy = py + ph * (1 - i / 4);
    doc.moveTo(px, yy).lineTo(px + pw, yy).lineWidth(0.4).strokeColor('#E6E9F0').stroke();
    doc.font('Helvetica').fontSize(6.8).fillColor(COR.cinza).text(limpa(fmt(v)), x + 2, yy - 3, { width: 40, align: 'right', lineBreak: false });
  }
  const n = valores.length, X = (i: number) => px + (n === 1 ? pw / 2 : (i * pw) / (n - 1)), Y = (v: number) => py + ph * (1 - (v - base) / ((topo - base) || 1));
  if (n > 1) { doc.moveTo(X(0), Y(valores[0])); valores.forEach((v, i) => { if (i) doc.lineTo(X(i), Y(v)); }); doc.lineWidth(1.6).strokeColor(cor).stroke(); }
  if (n <= 40) valores.forEach((v, i) => doc.circle(X(i), Y(v), 1.8).fill(cor));
  const cada = Math.max(1, Math.ceil(n / 8));
  rotulos.forEach((r, i) => { if (i % cada === 0 || i === n - 1) doc.font('Helvetica').fontSize(6.5).fillColor(COR.cinza).text(limpa(r), X(i) - 20, py + ph + 4, { width: 40, align: 'center', lineBreak: false }); });
  if (!n) doc.font('Helvetica').fontSize(8).fillColor(COR.cinza).text('Sem dados no periodo.', px, py + ph / 2 - 4, { width: pw, align: 'center' });
}

export interface Coluna { t: string; w: number; al?: 'left' | 'right' | 'center' }
export interface CelulaImg { img: Buffer | null; vazio?: string }
/** Tabela com cabeçalho repetido a cada página, linhas zebradas e linha de total opcional. Células podem ser texto ou imagem. */
export function tabela(doc: Doc, y: number, colunas: Coluna[], linhas: (string | CelulaImg)[][], opt: { alturaLinha?: number; total?: string[]; semMargem?: boolean } = {}): number {
  const m = PAGINA.m, alt = opt.alturaLinha ?? 18, somaW = colunas.reduce((s, c) => s + c.w, 0), esc = (PAGINA.w - m * 2) / somaW, ws = colunas.map((c) => c.w * esc);
  const cab = (yy: number) => {
    doc.rect(m, yy, PAGINA.w - m * 2, 17).fill(COR.azul);
    let x = m; colunas.forEach((c, i) => { doc.font('Helvetica-Bold').fontSize(7.2).fillColor('#fff').text(limpa(c.t), x + 3, yy + 5, { width: ws[i] - 6, align: c.al ?? 'left', lineBreak: false, ellipsis: true }); x += ws[i]; });
    return yy + 17;
  };
  y = garanteEspaco(doc, y, 17 + alt * 2); y = cab(y);
  const linha = (cels: (string | CelulaImg)[], yy: number, zebra: boolean, total = false) => {
    if (zebra) doc.rect(m, yy, PAGINA.w - m * 2, alt).fill('#F6F8FC');
    if (total) doc.rect(m, yy, PAGINA.w - m * 2, alt).fill('#E9EEF9');
    let x = m;
    cels.forEach((c, i) => {
      if (typeof c === 'string') doc.font(total ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.2).fillColor(COR.texto).text(limpa(c), x + 3, yy + (alt - 8) / 2, { width: ws[i] - 6, align: colunas[i].al ?? 'left', height: alt - 2, lineBreak: alt > 26, ellipsis: true });
      else if (c.img) imagemNaCaixa(doc, c.img, x + 3, yy + 2, ws[i] - 6, alt - 4);
      else doc.font('Helvetica').fontSize(6.3).fillColor(COR.cinza).text(c.vazio ?? 'Sem imagem', x + 2, yy + (alt - 8) / 2, { width: ws[i] - 4, align: 'center', lineBreak: false });
      x += ws[i];
    });
    doc.moveTo(m, yy + alt).lineTo(PAGINA.w - m, yy + alt).lineWidth(0.3).strokeColor(COR.linha).stroke();
  };
  linhas.forEach((l, k) => {
    if (y + alt > PAGINA.h - PAGINA.m - 18) { doc.addPage(); y = cab(PAGINA.m); }
    linha(l, y, k % 2 === 1); y += alt;
  });
  if (opt.total) { if (y + alt > PAGINA.h - PAGINA.m - 18) { doc.addPage(); y = cab(PAGINA.m); } linha(opt.total, y, false, true); y += alt; }
  return y + 8;
}

/** Texto corrido em bloco (notas e avisos). */
export function nota(doc: Doc, y: number, texto: string, cor = COR.cinza): number {
  const w = PAGINA.w - PAGINA.m * 2;
  doc.font('Helvetica').fontSize(7.5).fillColor(cor);
  const h = doc.heightOfString(limpa(texto), { width: w });
  y = garanteEspaco(doc, y, h + 4);
  doc.text(limpa(texto), PAGINA.m, y, { width: w });
  return y + h + 6;
}

export const nomeArquivo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');
export const respostaPdf = (buf: Buffer, nome: string): Response => new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nomeArquivo(nome)}"`, 'Content-Length': String(buf.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** Barras (eixo esquerdo) com uma linha de pontos em eixo próprio (direita): usado para impressões e cliques por dia. */
export function graficoBarrasELinha(doc: Doc, x: number, y: number, w: number, h: number, rotulos: string[], barras: { nome: string; valores: number[]; cor: string }, linha: { nome: string; valores: number[]; cor: string }, fmtB: (v: number) => string, fmtL: (v: number) => string, tituloGrafico: string): void {
  doc.roundedRect(x, y, w, h, 5).lineWidth(0.6).fillAndStroke('#FFFFFF', COR.linha);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.escuro).text(limpa(tituloGrafico), x + 8, y + 7, { width: w - 16, lineBreak: false });
  let lx = x + w - 8; for (const s of [linha, barras]) { const tw = doc.font('Helvetica').fontSize(7.5).widthOfString(limpa(s.nome)); lx -= tw; doc.fillColor(COR.cinza).text(limpa(s.nome), lx, y + 8, { lineBreak: false }); lx -= 10; doc.rect(lx, y + 9, 7, 7).fill(s.cor); lx -= 8; }
  const px = x + 44, pw = w - 44 - 40, py = y + 26, ph = h - 26 - 22;
  const mb = Math.max(1e-9, ...barras.valores), pb = passoBonito(mb), tb = pb * 4, ml = Math.max(1e-9, ...linha.valores), pl = passoBonito(ml), tl = pl * 4;
  for (let i = 0; i <= 4; i++) {
    const yy = py + ph * (1 - i / 4);
    doc.moveTo(px, yy).lineTo(px + pw, yy).lineWidth(0.4).strokeColor('#E6E9F0').stroke();
    doc.font('Helvetica').fontSize(6.8).fillColor(COR.cinza).text(limpa(fmtB(pb * i)), x + 2, yy - 3, { width: 40, align: 'right', lineBreak: false });
    doc.fillColor(linha.cor).text(limpa(fmtL(pl * i)), px + pw + 4, yy - 3, { width: 34, lineBreak: false });
  }
  const n = rotulos.length || 1, gw = pw / n, bw = Math.min(26, gw * 0.62);
  const pts: [number, number][] = [];
  rotulos.forEach((r, i) => {
    const bh = (Math.max(0, barras.valores[i] ?? 0) / tb) * ph, bx = px + gw * i + (gw - bw) / 2;
    if (bh > 0) doc.rect(bx, py + ph - bh, bw, bh).fill(barras.cor);
    pts.push([px + gw * i + gw / 2, py + ph - (Math.max(0, linha.valores[i] ?? 0) / tl) * ph]);
    const cada = Math.max(1, Math.ceil(n / 10));
    if (i % cada === 0 || i === n - 1) doc.font('Helvetica').fontSize(6.5).fillColor(COR.cinza).text(limpa(r), px + gw * i - 8, py + ph + 4, { width: gw + 16, align: 'center', lineBreak: false });
  });
  if (pts.length > 1) { doc.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(([a, b]) => doc.lineTo(a, b)); doc.lineWidth(1.4).strokeColor(linha.cor).stroke(); }
  pts.forEach(([a, b]) => doc.circle(a, b, 1.8).fill(linha.cor));
}
