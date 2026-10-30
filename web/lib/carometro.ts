import { compararTurma } from './imagemTurma';

/**
 * Carômetro Escolar (etapa 1). Segmentos do colégio e leitura da turma/série a partir do nome da turma.
 * Nada aqui grava dados: o cadastro de alunos é o do módulo Uso de Imagem (ui_alunos).
 */
export const SEGMENTOS_CM: { k: string; nome: string; detalhe: string }[] = [
  { k: 'MATERNAIS', nome: 'Maternais', detalhe: 'Turmas de Maternal' },
  { k: 'INFANTIL', nome: 'Infantil 1–3', detalhe: 'Infantil 1, 2 e 3' },
  { k: 'JARDINS', nome: 'Jardins', detalhe: 'Infantil 4, 5 e 1º ano' },
  { k: 'INICIAIS', nome: 'Anos Iniciais', detalhe: '2º ao 5º ano' },
  { k: 'FINAIS', nome: 'Anos Finais', detalhe: '6º ao 9º ano' },
  { k: 'MEDIO', nome: 'Ensino Médio', detalhe: '1ª a 3ª série' },
];
const semAcento = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[º°ª]/g, '').replace(/\s+/g, ' ').trim();

/** Segmento do carômetro pela turma; '' quando não reconhece (nunca chuta). */
export function segmentoCm(turma: string): string {
  const t = semAcento(turma);
  if (!t) return '';
  if (/materna[li]/.test(t)) return 'MATERNAIS';
  let m = /infantil\s*(\d)/.exec(t) ?? /(\d)\s*infantil/.exec(t);
  if (m) return +m[1] >= 1 && +m[1] <= 3 ? 'INFANTIL' : +m[1] >= 4 && +m[1] <= 5 ? 'JARDINS' : '';
  m = /(\d{1,2})\s*(?:o\s*)?serie\b/.exec(t) ?? /\bserie\s*(\d{1,2})/.exec(t);
  if (m) return +m[1] >= 1 && +m[1] <= 3 ? 'MEDIO' : '';
  m = /(\d{1,2})\s*(?:o\s*)?ano\b/.exec(t) ?? /\bano\s*(\d{1,2})/.exec(t);
  if (m) { const n = +m[1]; return n === 1 ? 'JARDINS' : n >= 2 && n <= 5 ? 'INICIAIS' : n >= 6 && n <= 9 ? 'FINAIS' : ''; }
  return '';
}
/** Série = turma sem a letra final ("3º Ano A" → "3º Ano"). */
/** "1º ANO B" e "1º Ano A" são a mesma série: padroniza a escrita (só quando segue o padrão conhecido). */
export const serieDe = (turma: string): string => {
  const s = String(turma ?? '').replace(/[\s\-/]+[A-Za-z]$/, '').trim();
  return /^(infantil\s*\d|maternal|\d{1,2}\s*[ºª°o]?\s*(ano|s[ée]rie))/i.test(s) ? s.replace(/\s+/g, ' ').replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()) : s;
};

export const compararTurmaCm = (a: string, b: string): number => {
  const ma = /maternal/.test(semAcento(a)), mb = /maternal/.test(semAcento(b));
  if (ma !== mb) return ma ? -1 : 1;
  return compararTurma(a, b);
};
export const normNome = (s: string) => semAcento(s).replace(/[^a-z0-9 ]/g, '');

export type Autorizacao = 'AUTORIZADO' | 'NAO_AUTORIZADO' | 'SEM_INFORMACAO';
/** Estado informativo vindo da última solicitação do módulo Uso de Imagem. Nunca inferido: sem solicitação concluída = sem informação. */
export function autorizacaoDe(status: string | null | undefined): Autorizacao {
  if (status === 'AUTORIZADO') return 'AUTORIZADO';
  if (status === 'NAO_AUTORIZADO' || status === 'VENCIDO' || status === 'REVOGADO') return 'NAO_AUTORIZADO';
  return 'SEM_INFORMACAO';
}
