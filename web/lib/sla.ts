import { env, fmtDate, Row } from './util';
import { PAUSA_SLA } from './fluxo';

/**
 * REGRAS DO SLA (documentadas em docs/INDICADORES_E_SLA.md)
 *  - Início: data de recebimento (criadoEm). Contagem em DIAS ÚTEIS (seg–sex), sem os feriados em FERIADOS (YYYY-MM-DD separados por vírgula).
 *  - Prazo: dias do tipo de demanda (tabela abaixo) ou `slaDias` da própria demanda.
 *  - Pausa: enquanto o status é AGUARDANDO SOLICITANTE o relógio para; ao voltar, o vencimento avança os dias úteis parados.
 *  - Exceção: `prazoNegociado` (acordado na triagem) substitui o cálculo e é FINAL (a pausa não o altera).
 *  - Fim: data da transição para CONCLUÍDA. CANCELADA não entra no cumprimento.
 */
export const SLA_PADRAO_DIAS: Record<string, number> = {
  'Stories': 2, 'Post': 3, 'Reels': 5, 'Arte impressa': 5, 'Material gráfico': 5, 'Aviso / comunicado': 2,
  'Foto': 5, 'Vídeo': 7, 'Evento': 7, 'Campanha': 10, 'Outro': 5,
};
export const SLA_DIAS_PADRAO_GERAL = 5;

const feriados = () => new Set(env('FERIADOS').split(',').map((s) => s.trim()).filter(Boolean));
const ymd = (s: string) => String(s || '').slice(0, 10);
const utc = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
const ehUtil = (d: string, fer: Set<string>) => { const w = new Date(utc(d)).getUTCDay(); return w !== 0 && w !== 6 && !fer.has(d); };
const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDiasUteis(inicio: string, n: number): string {
  const fer = feriados();
  let ms = utc(ymd(inicio));
  let k = 0;
  while (k < Math.max(0, n)) { ms += 86400000; if (ehUtil(dia(ms), fer)) k++; }
  return dia(ms);
}
/** Dias úteis de a (exclusive) até b (inclusive); negativo se b < a. */
export function diasUteisEntre(a: string, b: string): number {
  a = ymd(a); b = ymd(b);
  if (a === b) return 0;
  const fer = feriados();
  const sinal = a < b ? 1 : -1;
  let [x, y] = sinal === 1 ? [utc(a), utc(b)] : [utc(b), utc(a)];
  let n = 0;
  while (x < y) { x += 86400000; if (ehUtil(dia(x), fer)) n++; }
  return sinal * n;
}

export interface HistRow { campo: string; de: string; para: string; quando: string; ator?: string; motivo?: string }
export interface SlaInfo {
  inicio: string; vencimento: string; diasSla: number; diasPausados: number; negociado: boolean;
  restantesDiasUteis: number | null; fim: string; estado: 'ok' | 'atencao' | 'vencido' | 'pausado' | 'concluido_no_prazo' | 'concluido_atrasado' | 'cancelada';
}

/** Trechos de tempo (em datas) que a demanda passou em cada status, a partir do histórico. */
export function periodosPorStatus(row: Row, hist: HistRow[], hojeYmd: string): { status: string; de: string; ate: string; aberto: boolean }[] {
  const st = hist.filter((h) => h.campo === 'status').sort((a, b) => a.quando.localeCompare(b.quando));
  const out: { status: string; de: string; ate: string; aberto: boolean }[] = [];
  for (let i = 0; i < st.length; i++) {
    const prox = st[i + 1];
    out.push({ status: st[i].para, de: ymd(st[i].quando), ate: prox ? ymd(prox.quando) : hojeYmd, aberto: !prox });
  }
  return out;
}

export function slaInfo(row: Row, hist: HistRow[], hojeYmd: string): SlaInfo {
  const inicio = ymd(row.criadoEm || hojeYmd);
  const status = String(row.status ?? '').toUpperCase();
  const tipo = String(row.tipoSolicitacao ?? '');
  const diasSla = Number(row.slaDias) > 0 ? Number(row.slaDias) : SLA_PADRAO_DIAS[tipo] ?? SLA_DIAS_PADRAO_GERAL;
  const per = periodosPorStatus(row, hist, hojeYmd);
  const diasPausados = per.filter((p) => PAUSA_SLA.includes(p.status)).reduce((s, p) => s + Math.max(0, diasUteisEntre(p.de, p.ate)), 0);
  const negociado = !!ymd(row.prazoNegociado ?? '');
  const vencimento = negociado ? ymd(row.prazoNegociado) : addDiasUteis(inicio, diasSla + diasPausados);
  let fim = '';
  let estado: SlaInfo['estado'];
  let restantes: number | null = null;
  if (status === 'CANCELADA') estado = 'cancelada';
  else if (status === 'CONCLUÍDA') {
    const conc = [...hist].filter((h) => h.campo === 'status' && h.para === 'CONCLUÍDA').sort((a, b) => b.quando.localeCompare(a.quando))[0];
    fim = ymd(conc?.quando || row.aprovadoSolicitanteEm || row.atualizadoEm || hojeYmd);
    estado = fim <= vencimento ? 'concluido_no_prazo' : 'concluido_atrasado';
  } else {
    restantes = diasUteisEntre(hojeYmd, vencimento);
    estado = PAUSA_SLA.includes(status) ? 'pausado' : restantes < 0 ? 'vencido' : restantes <= 1 ? 'atencao' : 'ok';
  }
  return { inicio, vencimento, diasSla, diasPausados, negociado, restantesDiasUteis: restantes, fim, estado };
}

export const hojeLocal = () => fmtDate(new Date());
