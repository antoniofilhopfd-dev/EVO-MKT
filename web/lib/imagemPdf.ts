import PDFDocument from 'pdfkit';
import { createHash } from 'node:crypto';
import { cabecalho, carregarLogo, COR, limpa, PAGINA } from './pdf';

export interface TermoPdf { protocolo: string; texto: string; hash: string; versao: number; modelo: string; aluno: string; matricula: string; turma: string; responsavel: string; criadoEm: string }

/**
 * PDF do termo (A4): um por aluno, uma página por termo. Usa SEMPRE o texto congelado da solicitação, com datas fixas no arquivo,
 * então baixar de novo gera o mesmo conteúdo. Não contém assinatura, selo nem validação: é o documento para assinar.
 */
export async function termosPdf(termos: TermoPdf[]): Promise<Buffer> {
  const logo = await carregarLogo();
  const data = new Date(termos[0] ? Date.parse(termos[0].criadoEm) || 0 : 0);
  const doc = new PDFDocument({ size: 'A4', margin: PAGINA.m, bufferPages: true, info: { Title: limpa('Autorizacao para uso de imagem'), Author: 'Colegio Evolucao - EVO MKT', Creator: 'EVO MKT', CreationDate: data, ModDate: data } });
  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const fim = new Promise<void>((ok, no) => { doc.on('end', ok); doc.on('error', no); });
  const w = PAGINA.w - PAGINA.m * 2;
  termos.forEach((t, i) => {
    if (i) doc.addPage();
    let y = cabecalho(doc, logo, 'Autorização para uso de imagem', ['Colégio Evolução'], [`Protocolo ${t.protocolo}`]);
    y += 6;
    doc.roundedRect(PAGINA.m, y, w, 52, 6).lineWidth(0.6).fillAndStroke(COR.fundo, COR.linha);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COR.cinza);
    const campo = (rot: string, v: string, x: number, yy: number, lw: number) => { doc.font('Helvetica').fontSize(7.5).fillColor(COR.cinza).text(rot, x, yy, { width: lw, lineBreak: false }); doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COR.escuro).text(limpa(v) || '-', x, yy + 10, { width: lw, lineBreak: false, ellipsis: true }); };
    campo('Aluno', t.aluno, PAGINA.m + 10, y + 8, w * 0.5 - 14); campo('Matrícula', t.matricula, PAGINA.m + w * 0.5, y + 8, w * 0.22); campo('Turma', t.turma, PAGINA.m + w * 0.74, y + 8, w * 0.24 - 10);
    campo('Responsável legal', t.responsavel || '________________________________', PAGINA.m + 10, y + 30, w - 20);
    y += 70;
    doc.font('Helvetica').fontSize(10.5).fillColor('#1B2330');
    for (const bruto of t.texto.split(/\n{2,}/)) {
      const par = limpa(bruto.replace(/\n/g, ' '));
      doc.text(par, PAGINA.m, y, { width: w, align: 'justify', lineGap: 3 });
      y = doc.y + 9;
    }
    // áreas de assinatura (em branco: o documento é para assinar fora do sistema ou no portal)
    y = Math.max(y + 24, 590);
    doc.moveTo(PAGINA.m, y).lineTo(PAGINA.m + 250, y).lineWidth(0.7).strokeColor(COR.escuro).stroke();
    doc.moveTo(PAGINA.m + 290, y).lineTo(PAGINA.w - PAGINA.m, y).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(COR.cinza).text('Assinatura do responsável', PAGINA.m, y + 4, { width: 250, lineBreak: false }).text('Local e data', PAGINA.m + 290, y + 4, { width: 200, lineBreak: false });
    doc.page.margins.bottom = 0; // o rodapé fica abaixo da margem útil; sem isto o pdfkit abriria outra página
    doc.font('Helvetica').fontSize(7.2).fillColor(COR.cinza).text(`Documento gerado pelo EVO MKT. Termo versão ${t.versao} (${limpa(t.modelo)}). Protocolo ${t.protocolo}. SHA-256 do texto: ${t.hash}`, PAGINA.m, PAGINA.h - 44, { width: w, lineGap: 1.5 });
  });
  doc.end();
  await fim;
  return Buffer.concat(partes);
}

export const hashBytes = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
