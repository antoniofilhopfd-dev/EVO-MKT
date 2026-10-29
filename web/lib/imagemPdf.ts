import PDFDocument from 'pdfkit';
import { createHash } from 'node:crypto';
import { cabecalho, carregarLogo, COR, limpa, PAGINA } from './pdf';
import { BRANCO_CPF, BRANCO_RESP, cpfFormatado } from './imagemTermo';

export interface RegistroPdf { tipo: 'DESENHADA' | 'NAO_AUTORIZO'; nome: string; parentesco: string; em: string; png?: Buffer; dataLonga?: string }
/** Dados já conhecidos que preenchem os espaços em branco do termo (nome, CPF, "X" na opção e a data). Antes da resposta do responsável, o termo sai em branco. */
export interface Preenche { nome?: string; cpf?: string; marcar?: boolean; dataLonga?: string }
export interface TermoPdf { registro?: RegistroPdf; preenche?: Preenche; protocolo: string; texto: string; hash: string; versao: number; modelo: string; aluno: string; matricula: string; turma: string; responsavel: string; criadoEm: string }

export const COLEGIO = { endereco: 'Rua Ovídio Mendonça, 130 – Miramar · CEP 58.043-210 – João Pessoa/PB', contato: '(83) 3244-7711 · evolucao@colegioevolucaopb.com.br · www.colegioevolucaopb.com.br' };

/** Troca os espaços em branco do texto congelado pelos dados reais. O texto guardado (e o hash) não mudam. */
export function preencherTexto(texto: string, p?: Preenche): string {
  let t = texto;
  if (p?.nome) t = t.split(BRANCO_RESP).join(p.nome);
  if (p?.cpf) t = t.split(BRANCO_CPF).join(cpfFormatado(p.cpf));
  if (p?.dataLonga) t = t.replace(/____ de ________________ de (\d{4})/, (_m, a) => `${p.dataLonga!.replace(/ de \d{4}$/, '')} de ${a}`);
  if (p?.marcar) t = t.replace('[   ]', '[ X ]');
  return t;
}

/**
 * PDF do termo (A4): um por aluno, uma página por termo, no layout do termo do colégio (título, seções, texto, assinatura e rodapé com os contatos).
 * Usa SEMPRE o texto congelado da solicitação, com datas fixas no arquivo: baixar de novo gera o mesmo conteúdo.
 * Linhas "# " viram o título (centralizado) e "## " viram o nome de uma seção. Não há selo nem validação digital: é o documento para assinar.
 */
export async function termosPdf(termos: TermoPdf[]): Promise<Buffer> {
  const logo = await carregarLogo();
  const data = new Date(termos[0] ? Date.parse(termos[0].criadoEm) || 0 : 0);
  const doc = new PDFDocument({ size: 'A4', margin: PAGINA.m, bufferPages: true, info: { Title: limpa('Termo de autorizacao de uso de imagem'), Author: 'Colegio Evolucao - EVO MKT', Creator: 'EVO MKT', CreationDate: data, ModDate: data } });
  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const fim = new Promise<void>((ok, no) => { doc.on('end', ok); doc.on('error', no); });
  const w = PAGINA.w - PAGINA.m * 2;
  termos.forEach((t, i) => {
    if (i) doc.addPage();
    const recusa = t.registro?.tipo === 'NAO_AUTORIZO';
    const texto = preencherTexto(t.texto, t.preenche);
    const temIdentificacao = /^##\s*Identifica/m.test(texto), temTitulo = /^# /m.test(texto);
    let y = cabecalho(doc, logo, recusa ? 'Registro de não autorização de uso de imagem' : 'Colégio Evolução', recusa ? ['Colégio Evolução'] : [], [`Protocolo ${t.protocolo}`]);
    y += 4;
    if (!temIdentificacao) {
      doc.roundedRect(PAGINA.m, y, w, 52, 6).lineWidth(0.6).fillAndStroke(COR.fundo, COR.linha);
      const campo = (rot: string, v: string, x: number, yy: number, lw: number) => { doc.font('Helvetica').fontSize(7.5).fillColor(COR.cinza).text(rot, x, yy, { width: lw, lineBreak: false }); doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COR.escuro).text(limpa(v) || '-', x, yy + 10, { width: lw, lineBreak: false, ellipsis: true }); };
      campo('Aluno', t.aluno, PAGINA.m + 10, y + 8, w * 0.5 - 14); campo('Matrícula', t.matricula, PAGINA.m + w * 0.5, y + 8, w * 0.22); campo('Turma', t.turma, PAGINA.m + w * 0.74, y + 8, w * 0.24 - 10);
      campo('Responsável legal', t.responsavel || BRANCO_RESP, PAGINA.m + 10, y + 30, w - 20);
      y += 66;
    }
    if (recusa && t.registro) {
      doc.roundedRect(PAGINA.m, y, w, 62, 6).lineWidth(0.8).fillAndStroke('#FFF3F0', '#E5A599');
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#9B2C1F').text(limpa(`NÃO AUTORIZADO. Em ${t.registro.em}, ${t.registro.nome} (${t.registro.parentesco}) declarou, pelo link seguro do EVO MKT, que NÃO autoriza o uso de imagem do(a) aluno(a) ${t.aluno}, conforme o termo abaixo (versão ${t.versao}).`), PAGINA.m + 10, y + 9, { width: w - 20, lineGap: 2 });
      y += 76;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COR.cinza).text('Texto do termo apresentado ao responsável', PAGINA.m, y); y += 14;
    }
    // corpo: título, seções e parágrafos; linhas soltas (como os dados de identificação) ficam uma por linha
    for (const bloco of texto.split(/\n{2,}/)) {
      for (const linha of bloco.split('\n')) {
        const l = limpa(linha);
        if (/^# /.test(linha)) { doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.escuro).text(l.replace(/^#\s*/, ''), PAGINA.m, y, { width: w, align: 'center', lineGap: 2 }); y = doc.y + 8; }
        else if (/^## /.test(linha)) { doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.escuro).text(l.replace(/^##\s*/, ''), PAGINA.m, y + 3, { width: w }); y = doc.y + 3; }
        else { const longa = l.length > 95; doc.font('Helvetica').fontSize(9.6).fillColor('#1B2330').text(l, PAGINA.m, y, { width: w, align: longa ? 'justify' : 'left', lineGap: 2.2 }); y = doc.y + (bloco.includes('\n') ? 2.5 : 0); }
      }
      y += 6;
    }
    // áreas de assinatura: em branco no documento para assinar; preenchidas quando o responsável assinou pelo portal
    y = Math.max(y + 78, 640);
    const rg = t.registro;
    if (rg && rg.tipo === 'DESENHADA' && rg.png) { try { doc.image(rg.png, PAGINA.m + 4, y - 62, { fit: [240, 58] }); } catch { /* sem imagem */ } }
    if (!recusa) {
      doc.moveTo(PAGINA.m + 40, y).lineTo(PAGINA.m + 300, y).lineWidth(0.7).strokeColor(COR.escuro).stroke();
      doc.font('Helvetica').fontSize(8.5).fillColor(COR.cinza).text(limpa(rg ? `Assinatura de ${rg.nome} (${rg.parentesco})` : 'Assinatura do(a) responsável legal'), PAGINA.m + 40, y + 4, { width: 300, lineBreak: false });
      if (rg?.dataLonga) doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.escuro).text(limpa(`${rg.dataLonga} · ${rg.em.slice(11)}`), PAGINA.m + 330, y - 12, { width: 200, lineBreak: false });
    }
    if (rg && rg.tipo === 'DESENHADA') {
      doc.roundedRect(PAGINA.m, y + 20, w, 34, 5).lineWidth(0.5).fillAndStroke(COR.fundo, COR.linha);
      doc.font('Helvetica').fontSize(7.2).fillColor(COR.cinza).text(limpa(`Assinatura manuscrita desenhada na tela e registrada no EVO MKT em ${rg.em}, por ${rg.nome} (${rg.parentesco}), pelo link seguro do protocolo ${t.protocolo}. Não é assinatura digital com certificado (ICP-Brasil ou GOV.BR): vale como registro eletrônico da manifestação do responsável, vinculado ao hash do texto.`), PAGINA.m + 8, y + 24, { width: w - 16, lineGap: 1.2 });
    }
    // rodapé do colégio e identificação do documento
    doc.page.margins.bottom = 0; // o rodapé fica abaixo da margem útil; sem isto o pdfkit abriria outra página
    doc.font('Helvetica').fontSize(6.6).fillColor(COR.cinza).text(limpa(`Documento gerado pelo EVO MKT. Termo versão ${t.versao} (${t.modelo}). Protocolo ${t.protocolo}. SHA-256 do texto: ${t.hash}`), PAGINA.m, PAGINA.h - 92, { width: w, lineGap: 1 });
    doc.moveTo(PAGINA.m, PAGINA.h - 70).lineTo(PAGINA.w - PAGINA.m, PAGINA.h - 70).lineWidth(1).strokeColor(COR.laranja).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(COR.escuro).text(limpa(COLEGIO.endereco), PAGINA.m, PAGINA.h - 62, { width: w, lineBreak: false }).text(limpa(COLEGIO.contato), PAGINA.m, PAGINA.h - 50, { width: w, lineBreak: false });
    doc.rect(0, PAGINA.h - 14, PAGINA.w, 14).fill(COR.laranja);
  });
  doc.end();
  await fim;
  return Buffer.concat(partes);
}

export const hashBytes = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

export interface ComprovanteDados {
  protocolo: string; aluno: string; turma: string; responsavel: string; cpfParcial: string; recebidoEm: string; arquivoNome: string; sha256: string; tamanho: number;
  assinaturaDetectada: boolean; contemOriginal: boolean; situacao: string; validadoPor: string; validadoEm: string; validacaoObs: string; termoHash: string; versao: number; geradoEm: string;
}

/**
 * Comprovante de recebimento do termo assinado no GOV.BR. O PDF assinado é guardado exatamente como foi enviado (alterá-lo quebraria a assinatura);
 * este comprovante, separado, registra a DATA E HORA em que o arquivo voltou para o colégio, a impressão digital (SHA-256) do arquivo e a validação da equipe.
 */
export async function comprovantePdf(c: ComprovanteDados): Promise<Buffer> {
  const logo = await carregarLogo();
  const data = new Date(Date.parse(c.geradoEm) || 0);
  const doc = new PDFDocument({ size: 'A4', margin: PAGINA.m, info: { Title: limpa('Comprovante de recebimento do termo assinado'), Author: 'Colegio Evolucao - EVO MKT', Creator: 'EVO MKT', CreationDate: data, ModDate: data } });
  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const fim = new Promise<void>((ok, no) => { doc.on('end', ok); doc.on('error', no); });
  const w = PAGINA.w - PAGINA.m * 2;
  let y = cabecalho(doc, logo, 'Colégio Evolução', [], [`Protocolo ${c.protocolo}`]) + 4;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COR.escuro).text('COMPROVANTE DE RECEBIMENTO DO TERMO ASSINADO', PAGINA.m, y, { width: w, align: 'center' }); y = doc.y + 4;
  doc.font('Helvetica').fontSize(9).fillColor(COR.cinza).text('Termo de autorização para uso de imagem em campanhas de mídia paga (tráfego pago) · assinatura pelo GOV.BR', PAGINA.m, y, { width: w, align: 'center' }); y = doc.y + 14;
  const linha = (rot: string, val: string, forte = false) => { doc.font('Helvetica').fontSize(8.5).fillColor(COR.cinza).text(limpa(rot), PAGINA.m, y, { width: 150, lineBreak: false }); doc.font(forte ? 'Helvetica-Bold' : 'Helvetica').fontSize(forte ? 11 : 9.6).fillColor(forte ? COR.escuro : '#1B2330').text(limpa(val || '-'), PAGINA.m + 155, y - (forte ? 1 : 0), { width: w - 155, lineGap: 1.5 }); y = Math.max(doc.y, y + 14) + 4; };
  const secao = (t: string) => { y += 6; doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.escuro).text(t, PAGINA.m, y); y = doc.y + 5; doc.moveTo(PAGINA.m, y - 2).lineTo(PAGINA.w - PAGINA.m, y - 2).lineWidth(0.5).strokeColor(COR.linha).stroke(); y += 4; };
  secao('Quem');
  linha('Aluno(a)', c.aluno); linha('Turma', c.turma); linha('Responsável legal', c.responsavel); linha('CPF (parcial)', c.cpfParcial);
  secao('Recebimento do arquivo assinado');
  linha('Data e hora do recebimento', c.recebidoEm, true);
  linha('Arquivo', c.arquivoNome); linha('Tamanho', `${c.tamanho.toLocaleString('pt-BR')} bytes`);
  linha('SHA-256 do arquivo', c.sha256);
  linha('Assinatura digital no arquivo', c.assinaturaDetectada ? 'Detectada (a validade só é confirmada na conferência abaixo)' : 'Não detectada');
  linha('Contém o termo original', c.contemOriginal ? 'Sim' : 'Não confirmado (arquivo reprocessado)');
  secao('Conferência da equipe (validar.iti.gov.br)');
  linha('Situação', c.situacao, true);
  linha('Validado por', c.validadoPor || 'Ainda não validado'); linha('Data e hora da validação', c.validadoEm); linha('Observação', c.validacaoObs);
  secao('Vínculo com o termo');
  linha('Versão do termo', String(c.versao)); linha('SHA-256 do texto do termo', c.termoHash);
  y += 10;
  doc.font('Helvetica').fontSize(8).fillColor(COR.cinza).text(limpa(`Este comprovante registra o recebimento e a conferência do arquivo assinado, que é guardado exatamente como foi enviado, sem alterações, para não perder a assinatura digital. A data oficial da assinatura é a do carimbo do GOV.BR. Emitido em ${c.geradoEm.slice(8, 10)}/${c.geradoEm.slice(5, 7)}/${c.geradoEm.slice(0, 4)} ${c.geradoEm.slice(11, 16)}.`), PAGINA.m, y, { width: w, lineGap: 1.5 });
  doc.page.margins.bottom = 0;
  doc.moveTo(PAGINA.m, PAGINA.h - 70).lineTo(PAGINA.w - PAGINA.m, PAGINA.h - 70).lineWidth(1).strokeColor(COR.laranja).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(COR.escuro).text(limpa(COLEGIO.endereco), PAGINA.m, PAGINA.h - 62, { width: w, lineBreak: false }).text(limpa(COLEGIO.contato), PAGINA.m, PAGINA.h - 50, { width: w, lineBreak: false });
  doc.rect(0, PAGINA.h - 14, PAGINA.w, 14).fill(COR.laranja);
  doc.end();
  await fim;
  return Buffer.concat(partes);
}
