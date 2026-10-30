import { q, q1 } from './db';
import PDFDocument from 'pdfkit';
import { cabecalho, carregarLogo, COR, Doc, imagemNaCaixa, limpa, PAGINA } from './pdf';
import { autorizacaoDe, compararTurmaCm } from './carometro';

/** PDF A4 do Carômetro: grade de fotos com o nome embaixo. Mesma função gera a prévia e o arquivo final. */
export interface OpcoesPdf { titulo: string; subtitulo: string; orientacao: 'retrato' | 'paisagem'; porLinha: 4 | 5 | 6; matricula: boolean; mostrarTurma: boolean }
export interface AlunoPdf { id: number; nome: string; matricula: string; turma: string; fotoId: number | null; autorizacao: string }

export async function carregarAlunosPdf(ids: number[]): Promise<AlunoPdf[]> {
  if (!ids.length) return [];
  const rows = await q(`SELECT a.id,a.nome,a.matricula,a.turma,
    (SELECT f.id FROM cm_fotos f WHERE f.aluno_id=a.id AND f.ativa=1 LIMIT 1) foto_id,
    (SELECT s.status FROM ui_solicitacoes s WHERE s.aluno_id=a.id AND s.status<>'CANCELADO' ORDER BY s.id DESC LIMIT 1) situacao
    FROM ui_alunos a WHERE a.ativo=1 AND a.id IN (${ids.map(() => '?').join(',')})`, ids);
  return rows.map((r) => ({ id: Number(r.id), nome: String(r.nome), matricula: String(r.matricula), turma: String(r.turma ?? ''), fotoId: r.foto_id ? Number(r.foto_id) : null, autorizacao: autorizacaoDe(r.situacao) }));
}
export const ordenarAlunosPdf = (a: AlunoPdf[]) => a.sort((x, y) => compararTurmaCm(x.turma, y.turma) || x.nome.localeCompare(y.nome, 'pt-BR'));

const iniciais = (n: string) => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** Nome sob a foto: reduz a fonte até o mínimo e quebra em até 3 linhas; só se ainda não couber é que termina em "..." (e o PDF avisa na nota final). */
function nomeNaCelula(doc: Doc, nome: string, x: number, y: number, w: number, maxLinhas = 2): { linhas: number; truncado: boolean } {
  const txt = limpa(nome);
  for (const tam of [8.5, 8, 7.5, 7, 6.5]) {
    doc.font('Helvetica-Bold').fontSize(tam);
    if (doc.heightOfString(txt, { width: w, align: 'center' }) <= tam * 1.18 * maxLinhas + 0.5) { doc.fillColor(COR.texto).text(txt, x, y, { width: w, align: 'center', lineGap: 0 }); return { linhas: maxLinhas, truncado: false }; }
  }
  doc.font('Helvetica-Bold').fontSize(6.5);
  let t = txt; while (t.length > 4 && doc.heightOfString(t + '...', { width: w, align: 'center' }) > 6.5 * 1.18 * maxLinhas + 0.5) t = t.slice(0, -1);
  doc.fillColor(COR.texto).text(t + '...', x, y, { width: w, align: 'center', lineGap: 0 });
  return { linhas: maxLinhas, truncado: true };
}

export async function carometroPdf(alunos: AlunoPdf[], o: OpcoesPdf, lerFoto: (fotoId: number) => Promise<Buffer | null>, quando: string): Promise<{ buf: Buffer; paginas: number; truncados: number }> {
  const logo = await carregarLogo();
  let truncados = 0;
  const paisagem = o.orientacao === 'paisagem';
  const W = paisagem ? PAGINA.h : PAGINA.w, H = paisagem ? PAGINA.w : PAGINA.h, m = PAGINA.m, gap = 8;
  const doc: Doc = new PDFDocument({ size: 'A4', layout: paisagem ? 'landscape' : 'portrait', margin: m, bufferPages: true, info: { Title: limpa(`Carometro - ${o.titulo}`), Author: 'Colegio Evolucao - EVO MKT', Creator: 'EVO MKT' } });
  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const fim = new Promise<void>((ok, no) => { doc.on('end', ok); doc.on('error', no); });
  const cw = (W - m * 2 - gap * (o.porLinha - 1)) / o.porLinha, fh = cw * 4 / 3;
  const linhasNome = 2, textoH = 8.5 * 1.18 * linhasNome + (o.matricula || o.mostrarTurma ? 10 : 2), ch = fh + 4 + textoH, rodape = 40;
  let y = cabecalho(doc, logo, 'Colégio Evolução - Carômetro', [o.titulo, o.subtitulo, `${alunos.length} aluno(s)`]), col = 0;
  for (const a of alunos) {
    if (y + ch > H - rodape) { doc.addPage(); y = m; col = 0; }
    const x = m + col * (cw + gap);
    const img = a.fotoId ? await lerFoto(a.fotoId) : null;
    if (!img || !imagemNaCaixa(doc, img, x, y, cw, fh, '#F3F5F9', true)) {
      doc.save().roundedRect(x, y, cw, fh, 3).fill('#EEF1F6').restore();
      doc.font('Helvetica-Bold').fontSize(Math.min(26, cw / 3)).fillColor('#8A95A8').text(limpa(iniciais(a.nome)), x, y + fh / 2 - 14, { width: cw, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(7).fillColor('#8A95A8').text('Sem foto', x, y + fh / 2 + 14, { width: cw, align: 'center', lineBreak: false });
    }
    if (nomeNaCelula(doc, a.nome, x, y + fh + 4, cw).truncado) truncados++;
    const extra = [o.mostrarTurma ? a.turma : '', o.matricula ? a.matricula : ''].filter(Boolean).join(' - ');
    if (extra) doc.font('Helvetica').fontSize(6.8).fillColor(COR.cinza).text(limpa(extra), x, y + fh + 4 + 8.5 * 1.18 * linhasNome + 1, { width: cw, align: 'center', lineBreak: false });
    col++; if (col >= o.porLinha) { col = 0; y += ch + gap; }
  }
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(start + i);
    doc.page.margins.bottom = 0;
    const yy = H - 28;
    doc.moveTo(m, yy - 6).lineTo(W - m, yy - 6).lineWidth(0.5).strokeColor(COR.linha).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(COR.cinza).text(limpa(`Colégio Evolução - uso interno. Contém imagens de menores: não publicar nem compartilhar fora da escola. ${quando}`), m, yy, { width: W - m * 2 - 90, lineBreak: false });
    doc.text(`Pagina ${i + 1} de ${count}`, W - m - 90, yy, { width: 90, align: 'right', lineBreak: false });
  }
  doc.end();
  await fim;
  const buf = Buffer.concat(partes);
  const paginas = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  return { buf, paginas, truncados };
}
export async function fotoPadrao(fotoId: number): Promise<Buffer | null> {
  const f = await q1('SELECT caminho_padrao FROM cm_fotos WHERE id=?', [fotoId]);
  if (!f) return null;
  const a = await q1('SELECT conteudo FROM arquivos WHERE caminho=?', [f.caminho_padrao]);
  return a ? Buffer.from(a.conteudo) : null;
}
