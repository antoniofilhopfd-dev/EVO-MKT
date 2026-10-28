import PDFDocument from 'pdfkit';
import { createHash } from 'node:crypto';
import { cabecalho, carregarLogo, COR, limpa, PAGINA } from './pdf';

export interface RegistroPdf { tipo: 'DESENHADA' | 'NAO_AUTORIZO'; nome: string; parentesco: string; em: string; png?: Buffer }
export interface TermoPdf { registro?: RegistroPdf; protocolo: string; texto: string; hash: string; versao: number; modelo: string; aluno: string; matricula: string; turma: string; responsavel: string; criadoEm: string }

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
    const recusa = t.registro?.tipo === 'NAO_AUTORIZO';
    let y = cabecalho(doc, logo, recusa ? 'Registro de não autorização de uso de imagem' : 'Autorização para uso de imagem', ['Colégio Evolução'], [`Protocolo ${t.protocolo}`]);
    y += 6;
    doc.roundedRect(PAGINA.m, y, w, 52, 6).lineWidth(0.6).fillAndStroke(COR.fundo, COR.linha);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COR.cinza);
    const campo = (rot: string, v: string, x: number, yy: number, lw: number) => { doc.font('Helvetica').fontSize(7.5).fillColor(COR.cinza).text(rot, x, yy, { width: lw, lineBreak: false }); doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COR.escuro).text(limpa(v) || '-', x, yy + 10, { width: lw, lineBreak: false, ellipsis: true }); };
    campo('Aluno', t.aluno, PAGINA.m + 10, y + 8, w * 0.5 - 14); campo('Matrícula', t.matricula, PAGINA.m + w * 0.5, y + 8, w * 0.22); campo('Turma', t.turma, PAGINA.m + w * 0.74, y + 8, w * 0.24 - 10);
    campo('Responsável legal', t.responsavel || '________________________________', PAGINA.m + 10, y + 30, w - 20);
    y += 70;
    if (recusa && t.registro) {
      doc.roundedRect(PAGINA.m, y, w, 62, 6).lineWidth(0.8).fillAndStroke('#FFF3F0', '#E5A599');
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#9B2C1F').text(limpa(`NÃO AUTORIZADO. Em ${t.registro.em}, ${t.registro.nome} (${t.registro.parentesco}) declarou, pelo link seguro do EVO MKT, que NÃO autoriza o uso de imagem do(a) aluno(a) ${t.aluno}, conforme o termo abaixo (versão ${t.versao}).`), PAGINA.m + 10, y + 9, { width: w - 20, lineGap: 2 });
      y += 76;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COR.cinza).text('Texto do termo apresentado ao responsável', PAGINA.m, y); y += 14;
    }
    doc.font('Helvetica').fontSize(10.5).fillColor('#1B2330');
    for (const bruto of t.texto.split(/\n{2,}/)) {
      const par = limpa(bruto.replace(/\n/g, ' '));
      doc.text(par, PAGINA.m, y, { width: w, align: 'justify', lineGap: 3 });
      y = doc.y + 9;
    }
    // áreas de assinatura: em branco no documento para assinar; preenchidas quando o responsável assinou pelo portal
    y = Math.max(y + 24, recusa ? y + 24 : 590);
    const rg = t.registro;
    if (rg && rg.tipo === 'DESENHADA' && rg.png) { try { doc.image(rg.png, PAGINA.m + 4, y - 66, { fit: [240, 62] }); } catch { /* sem imagem */ } }
    if (!recusa) {
      doc.moveTo(PAGINA.m, y).lineTo(PAGINA.m + 250, y).lineWidth(0.7).strokeColor(COR.escuro).stroke();
      doc.moveTo(PAGINA.m + 290, y).lineTo(PAGINA.w - PAGINA.m, y).stroke();
      if (rg) doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.escuro).text(limpa(rg.em), PAGINA.m + 290, y - 14, { width: 200, lineBreak: false });
      doc.font('Helvetica').fontSize(8.5).fillColor(COR.cinza).text(limpa(rg ? `Assinatura de ${rg.nome} (${rg.parentesco})` : 'Assinatura do responsável'), PAGINA.m, y + 4, { width: 270, lineBreak: false }).text('Local e data', PAGINA.m + 290, y + 4, { width: 200, lineBreak: false });
    }
    if (rg && rg.tipo === 'DESENHADA') {
      doc.roundedRect(PAGINA.m, y + 22, w, 40, 5).lineWidth(0.5).fillAndStroke(COR.fundo, COR.linha);
      doc.font('Helvetica').fontSize(7.6).fillColor(COR.cinza).text(limpa(`Assinatura manuscrita desenhada na tela e registrada no EVO MKT em ${rg.em}, por ${rg.nome} (${rg.parentesco}), pelo link seguro do protocolo ${t.protocolo}. Não é assinatura digital com certificado (ICP-Brasil ou GOV.BR): vale como registro eletrônico da manifestação do responsável, vinculado ao hash do texto acima.`), PAGINA.m + 8, y + 27, { width: w - 16, lineGap: 1.5 });
    }
    doc.page.margins.bottom = 0; // o rodapé fica abaixo da margem útil; sem isto o pdfkit abriria outra página
    doc.font('Helvetica').fontSize(7.2).fillColor(COR.cinza).text(`Documento gerado pelo EVO MKT. Termo versão ${t.versao} (${limpa(t.modelo)}). Protocolo ${t.protocolo}. SHA-256 do texto: ${t.hash}`, PAGINA.m, PAGINA.h - 44, { width: w, lineGap: 1.5 });
  });
  doc.end();
  await fim;
  return Buffer.concat(partes);
}

export const hashBytes = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
