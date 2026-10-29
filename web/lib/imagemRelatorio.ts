import { q } from './db';
import { escreverXlsx } from './xlsxEscrita';
import { cabecalho, carregarLogo, cartoes, COR, dmy, gerarPdf, nota, tabela, titulo } from './pdf';
import { Row } from './util';
import { compararTurma } from './imagemTurma';

export const ROTULO_STATUS: Record<string, string> = {
  AGUARDANDO_ENVIO: 'Aguardando envio', ENVIADO: 'Enviado', ABERTO: 'Aberto', AGUARDANDO_ASSINATURA: 'Aguardando assinatura', AGUARDANDO_VALIDACAO: 'Aguardando validação',
  AUTORIZADO: 'Autorizado', NAO_AUTORIZADO: 'Não autorizado', VENCIDO: 'Vencido', REVOGADO: 'Revogado', ERRO: 'Erro', CANCELADO: 'Cancelado',
};
export const SEG_ROTULO: Record<string, string> = { INFANTIL: 'Educação Infantil', FUND1: 'Anos Iniciais', FUND2: 'Anos Finais', MEDIO: 'Ensino Médio', '': 'Sem segmento' };
export interface FiltroRel { segmento: string; turma: string; status: string; modelo: number; de: string; ate: string }

export function lerFiltro(qs: (k: string) => string): FiltroRel {
  const data = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  return { segmento: ['INFANTIL', 'FUND1', 'FUND2', 'MEDIO'].includes(qs('segmento')) ? qs('segmento') : '', turma: qs('turma').slice(0, 60), status: ROTULO_STATUS[qs('status')] ? qs('status') : '', modelo: Number(qs('modelo')) || 0, de: data(qs('de')), ate: data(qs('ate')) };
}

export async function dadosRelatorio(f: FiltroRel) {
  const rows = await q(
    `SELECT s.id, s.protocolo, a.nome aluno, a.matricula, a.turma, a.segmento, s.modelo_nome, s.modelo_versao, s.status, s.criado_em, s.decisao_em, s.vence_em, s.modalidade, s.resp_confirmado, s.responsavel_nome
     FROM ui_solicitacoes s JOIN ui_alunos a ON a.id=s.aluno_id
     WHERE (?='' OR a.segmento=?) AND (?='' OR a.turma=?) AND (?='' OR s.status=?) AND (?=0 OR s.modelo_id=?) AND (?='' OR SUBSTRING(s.criado_em,1,10)>=?) AND (?='' OR SUBSTRING(s.criado_em,1,10)<=?)
     ORDER BY a.nome, s.id LIMIT 5000`,
    [f.segmento, f.segmento, f.turma, f.turma, f.status, f.status, f.modelo, f.modelo, f.de, f.de, f.ate, f.ate],
  );
  const porStatus: Record<string, number> = {}, porSeg: Record<string, Record<string, number>> = {}, porTurma: Record<string, Record<string, number>> = {};
  const soma = (m: Record<string, Record<string, number>>, k: string, st: string) => { (m[k] ??= {}); m[k][st] = (m[k][st] ?? 0) + 1; };
  for (const r of rows) { porStatus[r.status] = (porStatus[r.status] ?? 0) + 1; soma(porSeg, r.segmento || '', r.status); soma(porTurma, r.turma || '(sem turma)', r.status); }
  const turmasOrdenadas = Object.fromEntries(Object.entries(porTurma).sort((a, b) => compararTurma(a[0], b[0])));
  return { linhas: rows, total: rows.length, alunos: new Set(rows.map((r) => r.matricula)).size, porStatus, porSegmento: porSeg, porTurma: turmasOrdenadas };
}
type Dados = Awaited<ReturnType<typeof dadosRelatorio>>;

const dataBR = (iso: string) => (iso ? dmy(iso.slice(0, 10)) : '-');
const linhaTab = (r: Row) => [r.aluno, r.matricula, r.turma || '-', SEG_ROTULO[r.segmento || ''], r.modelo_nome + ' v' + r.modelo_versao, ROTULO_STATUS[r.status] ?? r.status, dataBR(r.criado_em), dataBR(r.decisao_em), r.vence_em ? dmy(r.vence_em) : '-'];

export function relatorioXlsx(d: Dados): Buffer {
  const cab = ['Aluno', 'Matrícula', 'Turma', 'Segmento', 'Modelo', 'Situação', 'Solicitada em', 'Respondida em', 'Vence em', 'Como assinou', 'Responsável', 'Protocolo'];
  const lin = d.linhas.map((r) => [...linhaTab(r), r.modalidade === 'GOVBR' ? 'GOV.BR' : r.modalidade === 'DESENHADA' ? 'Desenhada na tela' : '', r.resp_confirmado || r.responsavel_nome || '', r.protocolo]);
  return escreverXlsx('Uso de Imagem', cab, lin, [32, 12, 16, 18, 34, 22, 14, 14, 12, 18, 28, 16]);
}

export async function relatorioPdf(d: Dados, f: FiltroRel, quando: string): Promise<Buffer> {
  const logo = await carregarLogo();
  const filtros = [f.segmento && `Segmento: ${SEG_ROTULO[f.segmento]}`, f.turma && `Turma: ${f.turma}`, f.status && `Situação: ${ROTULO_STATUS[f.status]}`, f.de && `Desde ${dmy(f.de)}`, f.ate && `Até ${dmy(f.ate)}`].filter(Boolean).join(' · ') || 'Sem filtros';
  return gerarPdf({ titulo: 'Relatório de Uso de Imagem' }, 'EVO MKT - Uso de Imagem - dados de alunos: uso restrito ao Marketing', async (doc) => {
    let y = cabecalho(doc, logo, 'Relatório de Uso de Imagem', ['Colégio Evolução', filtros], [quando]);
    const n = (k: string) => String(d.porStatus[k] ?? 0);
    y = cartoes(doc, y, [{ rot: 'Solicitações', valor: String(d.total) }, { rot: 'Alunos', valor: String(d.alunos) }, { rot: 'Autorizadas', valor: n('AUTORIZADO') }, { rot: 'Não autorizadas', valor: n('NAO_AUTORIZADO') }, { rot: 'Pendentes', valor: String(['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_VALIDACAO'].reduce((a, k) => a + (d.porStatus[k] ?? 0), 0)) }, { rot: 'Vencidas', valor: n('VENCIDO') }, { rot: 'Revogadas', valor: n('REVOGADO') }, { rot: 'Canceladas', valor: n('CANCELADO') }], 4, 46);
    y += 6; y = titulo(doc, y, 'Por segmento');
    y = tabela(doc, y, [{ t: 'Segmento', w: 150 }, { t: 'Autorizado', w: 70, al: 'right' }, { t: 'Não autoriz.', w: 70, al: 'right' }, { t: 'Pendente', w: 70, al: 'right' }, { t: 'Vencido/Revog.', w: 80, al: 'right' }], Object.entries(d.porSegmento).map(([k, v]) => [SEG_ROTULO[k] ?? k, String(v.AUTORIZADO ?? 0), String(v.NAO_AUTORIZADO ?? 0), String(['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_VALIDACAO'].reduce((a, s) => a + (v[s] ?? 0), 0)), String((v.VENCIDO ?? 0) + (v.REVOGADO ?? 0))]), { alturaLinha: 16 });
    y = titulo(doc, y, 'Por turma');
    y = tabela(doc, y, [{ t: 'Turma', w: 150 }, { t: 'Autorizado', w: 70, al: 'right' }, { t: 'Não autoriz.', w: 70, al: 'right' }, { t: 'Pendente', w: 70, al: 'right' }, { t: 'Vencido/Revog.', w: 80, al: 'right' }], Object.entries(d.porTurma).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([k, v]) => [k, String(v.AUTORIZADO ?? 0), String(v.NAO_AUTORIZADO ?? 0), String(['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_VALIDACAO'].reduce((a, s) => a + (v[s] ?? 0), 0)), String((v.VENCIDO ?? 0) + (v.REVOGADO ?? 0))]), { alturaLinha: 16 });
    y = titulo(doc, y, 'Detalhamento por solicitação');
    y = tabela(doc, y, [{ t: 'Aluno', w: 120 }, { t: 'Turma', w: 60 }, { t: 'Situação', w: 80 }, { t: 'Solicitada', w: 52 }, { t: 'Respondida', w: 52 }, { t: 'Vence', w: 52 }], d.linhas.slice(0, 1500).map((r) => [r.aluno, r.turma || '-', ROTULO_STATUS[r.status] ?? r.status, dataBR(r.criado_em), dataBR(r.decisao_em), r.vence_em ? dmy(r.vence_em) : '-']), { alturaLinha: 15 });
    if (d.linhas.length > 1500) y = nota(doc, y, 'O PDF mostra as 1.500 primeiras linhas. Use a planilha para a lista completa.');
    nota(doc, y, `Imagem recusada, vencida ou revogada: não publicar. Documento com dados pessoais de menores: guardar e compartilhar somente para fins do uso de imagem. Gerado em ${quando}.`, COR.cinza);
  });
}

export async function fichaPdf(ficha: { aluno: Row; solicitacoes: Row[] }, quando: string): Promise<Buffer> {
  const logo = await carregarLogo(), a = ficha.aluno;
  return gerarPdf({ titulo: 'Ficha de uso de imagem' }, 'EVO MKT - Ficha de uso de imagem - dados de aluno: uso restrito ao Marketing', async (doc) => {
    let y = cabecalho(doc, logo, 'Ficha de uso de imagem', ['Colégio Evolução', `${a.nome} · Matrícula ${a.matricula} · ${a.turma || 'sem turma'} · ${SEG_ROTULO[a.segmento || '']}`], [quando]);
    y = titulo(doc, y, 'Histórico de autorizações');
    y = tabela(doc, y, [{ t: 'Protocolo', w: 70 }, { t: 'Modelo / versão', w: 120 }, { t: 'Situação', w: 70 }, { t: 'Responsável', w: 100 }, { t: 'Respondida', w: 52 }, { t: 'Vence', w: 52 }], ficha.solicitacoes.map((s) => [s.protocolo, `${s.modelo_nome} v${s.modelo_versao}`, ROTULO_STATUS[s.status] ?? s.status, s.resp_confirmado || s.responsavel_nome || '-', dataBR(s.decisao_em), s.vence_em ? dmy(s.vence_em) : '-']), { alturaLinha: 20 });
    for (const s of ficha.solicitacoes) {
      if (!s.eventos?.length) continue;
      y = titulo(doc, y, `Trilha de ${s.protocolo}`);
      y = tabela(doc, y, [{ t: 'Quando', w: 80 }, { t: 'Quem', w: 80 }, { t: 'O quê', w: 200 }], s.eventos.map((e: Row) => [dataBR(e.quando) + ' ' + String(e.quando).slice(11, 16), e.ator, `${e.acao}${e.detalhe ? ': ' + e.detalhe : ''}`]), { alturaLinha: 15 });
    }
    nota(doc, y, `Evidências guardadas: hash do texto do termo, data e hora, versão e quem registrou. Ficha gerada em ${quando}.`);
  });
}
