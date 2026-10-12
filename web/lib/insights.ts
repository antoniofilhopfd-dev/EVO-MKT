import { q } from './db';
import { FINAL_SOLICITACAO } from './fluxo';
import { listRows } from './records';
import { HistRow, hojeLocal, slaInfo } from './sla';
import { addDays, env, fmtDate, Row } from './util';

const ymd = (s: unknown) => String(s ?? '').slice(0, 10);

/** Saúde (0–100) por segmento, só com dados reais: SLA vencido, devoluções, reaberturas e avaliação. */
export async function saudePorSegmento(): Promise<Row[]> {
  const hoje = hojeLocal();
  const desde = fmtDate(addDays(new Date(), -90));
  const sols = (await listRows('solicitacoes')).filter((r) => !String(r.segmento ?? '').trim() ? false : true);
  const hist = new Map<string, HistRow[]>();
  for (const h of await q("SELECT registro,campo,de,para,quando FROM status_history WHERE modulo='solicitacoes' ORDER BY id")) {
    if (!hist.has(h.registro)) hist.set(h.registro, []);
    hist.get(h.registro)!.push(h as HistRow);
  }
  const segs = [...new Set(sols.map((r) => String(r.segmento)))];
  return segs.map((seg) => {
    const rs = sols.filter((r) => r.segmento === seg && (ymd(r.criadoEm) >= desde || !FINAL_SOLICITACAO.includes(String(r.status).toUpperCase())));
    const abertas = rs.filter((r) => !FINAL_SOLICITACAO.includes(String(r.status).toUpperCase()));
    const vencidas = abertas.filter((r) => slaInfo(r, hist.get(r.id) ?? [], hoje).estado === 'vencido');
    const devolvidas = rs.filter((r) => (hist.get(r.id) ?? []).some((h) => h.campo === 'status' && h.para === 'AGUARDANDO SOLICITANTE'));
    const reabertas = rs.filter((r) => (hist.get(r.id) ?? []).some((h) => h.campo === 'status' && h.de === 'CONCLUÍDA'));
    const notas = rs.map((r) => Number(r.avaliacaoNota)).filter((n) => n > 0);
    const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
    let score = 100;
    const sinais: string[] = [];
    if (abertas.length && vencidas.length) { score -= Math.round((vencidas.length / abertas.length) * 40); sinais.push(`${vencidas.length} demanda(s) com SLA vencido`); }
    if (rs.length && devolvidas.length / rs.length > 0.3) { score -= Math.round((devolvidas.length / rs.length) * 15); sinais.push('Muitas demandas devolvidas para complementação'); }
    if (reabertas.length) { score -= Math.min(20, reabertas.length * 5); sinais.push(`${reabertas.length} demanda(s) reaberta(s)`); }
    if (media !== null && media < 3.5) { score -= 15; sinais.push(`Avaliação média baixa (${media.toFixed(1)} de 5)`); }
    return { segmento: seg, score: Math.max(0, Math.min(100, score)), sinais, demandas: rs.length, abertas: abertas.length, avaliacaoMedia: media === null ? null : Math.round(media * 10) / 10, ids: vencidas.map((r) => r.id).slice(0, 100) };
  }).sort((a, b) => a.score - b.score);
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MIN_AMOSTRA = 8, MIN_BUCKET = 3;

/** Melhor dia e horário a partir dos posts reais já sincronizados (nunca uma tabela genérica de mercado). */
export async function melhoresHorarios(): Promise<Row> {
  const posts = await q('SELECT publicado_em,curtidas,comentarios FROM ig_posts');
  if (posts.length < MIN_AMOSTRA) return { amostra: posts.length, minimo: MIN_AMOSTRA, melhor: null };
  const tz = env('TIMEZONE', 'America/Recife');
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  const w: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dias = new Map<number, number[]>(), horas = new Map<number, number[]>();
  for (const p of posts) {
    const d = new Date(String(p.publicado_em).replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
    if (isNaN(d.getTime())) continue;
    const parts = fmt.formatToParts(d);
    const dia = w[parts.find((x) => x.type === 'weekday')!.value], hora = +parts.find((x) => x.type === 'hour')!.value;
    const eng = Number(p.curtidas) + Number(p.comentarios);
    (dias.get(dia) ?? dias.set(dia, []).get(dia)!).push(eng);
    (horas.get(hora) ?? horas.set(hora, []).get(hora)!).push(eng);
  }
  const top = (m: Map<number, number[]>) => [...m.entries()].map(([k, v]) => ({ k, media: Math.round(v.reduce((a, b) => a + b, 0) / v.length), n: v.length })).sort((a, b) => b.media - a.media)[0];
  const d = top(dias), h = top(horas);
  return { amostra: posts.length, minimo: MIN_AMOSTRA, melhor: { dia: DIAS[d.k], mediaDia: d.media, hora: h.k, mediaHora: h.media, confianca: d.n >= MIN_BUCKET && h.n >= MIN_BUCKET ? 'alta' : 'baixa' } };
}

export async function rankingConteudos(limite = 8): Promise<Row[]> {
  return (await q('SELECT media_id,publicado_em,tipo,legenda,curtidas,comentarios,permalink FROM ig_posts ORDER BY (curtidas+comentarios) DESC, publicado_em DESC LIMIT ' + Math.min(30, limite)))
    .map((p) => ({ id: p.media_id, quando: p.publicado_em, tipo: p.tipo, legenda: p.legenda, interacoes: Number(p.curtidas) + Number(p.comentarios), curtidas: p.curtidas, comentarios: p.comentarios, link: p.permalink }));
}

// ---------- datas comemorativas (calendário escolar e nacional) ----------
interface Data { mes: number; dia: number; titulo: string; tema: string }
const FIXAS: Data[] = [
  [1, 1, 'Confraternização Universal', 'Nacional'], [3, 8, 'Dia Internacional da Mulher', 'Internacional'], [3, 21, 'Dia Internacional da Síndrome de Down', 'Inclusão'],
  [3, 22, 'Dia Mundial da Água', 'Meio ambiente'], [4, 2, 'Dia Mundial de Conscientização do Autismo', 'Inclusão'], [4, 18, 'Dia Nacional do Livro Infantil', 'Leitura'],
  [4, 19, 'Dia dos Povos Indígenas', 'Cultura'], [4, 22, 'Dia da Terra', 'Meio ambiente'], [4, 23, 'Dia Mundial do Livro', 'Leitura'], [5, 1, 'Dia do Trabalho', 'Nacional'],
  [6, 5, 'Dia Mundial do Meio Ambiente', 'Meio ambiente'], [6, 24, 'São João (Festa Junina)', 'Cultura'], [7, 20, 'Dia do Amigo', 'Comemorativa'],
  [8, 11, 'Dia do Estudante', 'Escolar'], [8, 22, 'Dia do Folclore', 'Cultura'], [9, 7, 'Independência do Brasil', 'Nacional'], [9, 21, 'Dia da Árvore', 'Meio ambiente'],
  [10, 12, 'Dia das Crianças', 'Escolar'], [10, 15, 'Dia do Professor', 'Escolar'], [11, 2, 'Finados', 'Nacional'], [11, 15, 'Proclamação da República', 'Nacional'],
  [11, 20, 'Dia da Consciência Negra', 'Cultura'], [12, 25, 'Natal', 'Comemorativa'],
].map(([mes, dia, titulo, tema]) => ({ mes: mes as number, dia: dia as number, titulo: titulo as string, tema: tema as string }));

function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}
const nesimoDomingo = (ano: number, mes: number, n: number) => { const d = new Date(Date.UTC(ano, mes - 1, 1)); d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7) + 7 * (n - 1)); return d; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function datasComemorativas(ano: number): { data: string; titulo: string; tema: string }[] {
  const out = FIXAS.map((x) => ({ data: `${ano}-${String(x.mes).padStart(2, '0')}-${String(x.dia).padStart(2, '0')}`, titulo: x.titulo, tema: x.tema }));
  const p = pascoa(ano);
  out.push({ data: iso(p), titulo: 'Páscoa', tema: 'Comemorativa' });
  out.push({ data: iso(new Date(p.getTime() - 47 * 86400000)), titulo: 'Carnaval', tema: 'Cultura' });
  out.push({ data: iso(nesimoDomingo(ano, 5, 2)), titulo: 'Dia das Mães', tema: 'Comemorativa' });
  out.push({ data: iso(nesimoDomingo(ano, 8, 2)), titulo: 'Dia dos Pais', tema: 'Comemorativa' });
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/** Datas dos próximos `dias` dias, com a antecedência sugerida de 30 dias para planejar a pauta. */
export function proximasDatas(dias = 60, hojeYmd = hojeLocal()): { data: string; titulo: string; tema: string; faltam: number; planejarAte: string }[] {
  const ano = +hojeYmd.slice(0, 4);
  const base = new Date(hojeYmd + 'T00:00:00Z').getTime();
  return [...datasComemorativas(ano), ...datasComemorativas(ano + 1)]
    .map((d) => ({ ...d, faltam: Math.round((new Date(d.data + 'T00:00:00Z').getTime() - base) / 86400000) }))
    .filter((d) => d.faltam >= 0 && d.faltam <= dias)
    .map((d) => ({ ...d, planejarAte: iso(new Date(new Date(d.data + 'T00:00:00Z').getTime() - 30 * 86400000)) }));
}

/** Linhas do resumo diário da Gerência (só o que tem algo a dizer). */
export async function resumoOperacional(): Promise<string[]> {
  const hoje = hojeLocal();
  const sols = await listRows('solicitacoes');
  const hist = new Map<string, HistRow[]>();
  for (const h of await q("SELECT registro,campo,de,para,quando FROM status_history WHERE modulo='solicitacoes' ORDER BY id")) {
    if (!hist.has(h.registro)) hist.set(h.registro, []);
    hist.get(h.registro)!.push(h as HistRow);
  }
  const abertas = sols.filter((r) => !FINAL_SOLICITACAO.includes(String(r.status).toUpperCase()));
  const est = (e: string) => abertas.filter((r) => slaInfo(r, hist.get(r.id) ?? [], hoje).estado === e).length;
  const triagem = abertas.filter((r) => ['AGUARDANDO TRIAGEM', 'NOVA'].includes(String(r.status).toUpperCase())).length;
  const aprov = abertas.filter((r) => String(r.status).toUpperCase() === 'AGUARDANDO APROVAÇÃO DO SOLICITANTE').length;
  const falhas = (await q("SELECT COUNT(*) n FROM notifications WHERE tipo='integracao_falha' AND quando >= ?", [fmtDate(addDays(new Date(), -1))]))[0]?.n ?? 0;
  const out: string[] = [];
  if (triagem) out.push(`- ${triagem} demanda(s) aguardando triagem`);
  if (est('vencido')) out.push(`- ${est('vencido')} demanda(s) com SLA vencido`);
  if (est('atencao')) out.push(`- ${est('atencao')} demanda(s) vencem em até 1 dia útil`);
  if (aprov) out.push(`- ${aprov} entrega(s) aguardando aprovação do solicitante`);
  if (Number(falhas)) out.push(`- ${falhas} falha(s) de integração nas últimas 24 h`);
  return out;
}
