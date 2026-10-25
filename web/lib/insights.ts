import { q } from './db';
import { listRows } from './records';
import { addDays, env, fmtDate, Row } from './util';

export const hojeLocal = () => fmtDate(new Date());

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MIN_AMOSTRA = 8, MIN_BUCKET = 3;

/** Melhor dia e horário a partir dos posts reais já sincronizados (nunca uma tabela genérica de mercado). */
export async function melhoresHorarios(conta = ''): Promise<Row> {
  const posts = await q('SELECT publicado_em,curtidas,comentarios,tipo FROM ig_posts' + (conta ? ' WHERE conta=?' : ''), conta ? [conta] : []);
  if (posts.length < MIN_AMOSTRA) return { amostra: posts.length, minimo: MIN_AMOSTRA, melhor: null };
  const tz = env('TIMEZONE', 'America/Fortaleza');
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
  // melhor dia/hora para cada formato (Feed, Reels, Stories...) com pelo menos 4 posts do formato
  const porFormato: Record<string, { dia: string; hora: number; n: number }> = {};
  for (const tipo of new Set(posts.map((p) => String(p.tipo || 'Outro')))) {
    const ps = posts.filter((p) => String(p.tipo || 'Outro') === tipo);
    if (ps.length < 4) continue;
    const dm = new Map<number, number[]>(), hm = new Map<number, number[]>();
    for (const p of ps) {
      const dt = new Date(String(p.publicado_em).replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
      if (isNaN(dt.getTime())) continue;
      const pt = fmt.formatToParts(dt), dd = w[pt.find((x) => x.type === 'weekday')!.value], hh = +pt.find((x) => x.type === 'hour')!.value, e = Number(p.curtidas) + Number(p.comentarios);
      (dm.get(dd) ?? dm.set(dd, []).get(dd)!).push(e);
      (hm.get(hh) ?? hm.set(hh, []).get(hh)!).push(e);
    }
    if (dm.size && hm.size) porFormato[tipo] = { dia: DIAS[top(dm).k], hora: top(hm).k, n: ps.length };
  }
  return { amostra: posts.length, minimo: MIN_AMOSTRA, porFormato, melhor: { dia: DIAS[d.k], mediaDia: d.media, hora: h.k, mediaHora: h.media, confianca: d.n >= MIN_BUCKET && h.n >= MIN_BUCKET ? 'alta' : 'baixa' } };
}

export async function rankingConteudos(limite = 8, conta = ''): Promise<Row[]> {
  return (await q('SELECT media_id,publicado_em,tipo,legenda,curtidas,comentarios,permalink FROM ig_posts' + (conta ? ' WHERE conta=?' : '') + ' ORDER BY (curtidas+comentarios) DESC, publicado_em DESC LIMIT ' + Math.min(30, limite), conta ? [conta] : []))
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

/** Linhas do resumo diário do Marketing (só o que tem algo a dizer). */
export async function resumoOperacional(): Promise<string[]> {
  const hoje = hojeLocal();
  const pubs = (await listRows('conteudos')).filter((r) => !/PUBLICADO|ARQUIVADO/i.test(String(r.status ?? '')));
  const dia = (r: Row) => String(r.publicacaoEm ?? '').slice(0, 10);
  const emRevisao = pubs.filter((r) => /REVIS/i.test(String(r.status))).length;
  const atrasadas = pubs.filter((r) => dia(r) && dia(r) < hoje).length;
  const hoje0 = pubs.filter((r) => dia(r) === hoje).length;
  const falhas = (await q("SELECT COUNT(*) n FROM notifications WHERE tipo='integracao_falha' AND quando >= ?", [fmtDate(addDays(new Date(), -1))]))[0]?.n ?? 0;
  const out: string[] = [];
  if (hoje0) out.push(`- ${hoje0} publicação(ões) prevista(s) para hoje`);
  if (atrasadas) out.push(`- ${atrasadas} publicação(ões) com a data vencida e ainda não publicadas`);
  if (emRevisao) out.push(`- ${emRevisao} publicação(ões) aguardando revisão`);
  if (Number(falhas)) out.push(`- ${falhas} falha(s) de integração nas últimas 24 h`);
  return out;
}

// ---------- insights do Marketing (determinísticos, no máximo 3, sempre com amostra, fonte e atalho) ----------
import { Filtros } from './filtros';
import { organico, PostFiltrado } from './painel';
import { materiaisAtivos, statusAtual } from './conteudo';
import { conteudoCabe } from './filtros';
import { strv } from './util';

export interface Insight { id: string; prioridade: number; titulo: string; texto: string; fonte: string; amostra: string; link: { pagina: string; rotulo: string } }
const MIN_POSTS = 8, MIN_GRUPO = 3, DIFERENCA_MIN = 0.2;
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Pendências da produção nos próximos 7 dias (dado interno, sempre disponível). */
async function insightProducao(f: Filtros, hoje: string): Promise<Insight | null> {
  const lim = fmtDate(addDays(new Date(hoje + 'T12:00:00'), 7));
  const prox = (await listRows('conteudos')).filter((r) => conteudoCabe(r, f) && !/PUBLICADO|ARQUIVADO/.test(statusAtual(r.status)) && strv(r.publicacaoEm).slice(0, 10) >= hoje && strv(r.publicacaoEm).slice(0, 10) <= lim);
  const semArte = prox.filter((r) => !materiaisAtivos(r, 'final').length && !strv(r.midiaInstagram)).length;
  const semLegenda = prox.filter((r) => !strv(r.legenda).trim()).length;
  const naoAprovadas = prox.filter((r) => !/APROVADO|AGENDADO/.test(statusAtual(r.status))).length;
  if (!prox.length || !(semArte || semLegenda || naoAprovadas)) return null;
  const partes = [semArte && `${semArte} sem arte final`, semLegenda && `${semLegenda} sem legenda`, naoAprovadas && `${naoAprovadas} ainda não aprovada(s)`].filter(Boolean);
  return { id: 'producao', prioridade: 1, titulo: 'Publicações dos próximos 7 dias com pendências', texto: `Das ${prox.length} publicações previstas até ${lim.slice(8, 10)}/${lim.slice(5, 7)}: ${partes.join(', ')}.`, fonte: 'Publicações do EVO MKT (Instagram › Conteúdos)', amostra: `${prox.length} publicações`, link: { pagina: 'igconteudos', rotulo: 'Ver as publicações' } };
}

function insightFormato(posts: PostFiltrado[]): Insight | null {
  if (posts.length < MIN_POSTS) return null;
  const grupos = new Map<string, number[]>();
  for (const p of posts) (grupos.get(p.formato) ?? grupos.set(p.formato, []).get(p.formato)!).push(p.interacoes);
  const geral = media(posts.map((p) => p.interacoes));
  const lista = [...grupos.entries()].filter(([, v]) => v.length >= MIN_GRUPO).map(([k, v]) => ({ k, m: media(v), n: v.length })).sort((a, b) => b.m - a.m);
  if (lista.length < 2 || geral <= 0) return null;
  const top = lista[0];
  if (top.m < geral * (1 + DIFERENCA_MIN)) return null;
  return { id: 'formato', prioridade: 3, titulo: `${top.k} tem rendido mais interações`, texto: `Em média ${Math.round(top.m)} interações por publicação em ${top.k}, ${Math.round((top.m / geral - 1) * 100)}% acima da média geral (${Math.round(geral)}).`, fonte: 'Instagram (orgânico), publicações do período', amostra: `${top.n} de ${posts.length} publicações`, link: { pagina: 'igdesempenho', rotulo: 'Ver o desempenho' } };
}

async function insightHorario(f: Filtros, posts: PostFiltrado[], contasIds: string[]): Promise<Insight | null> {
  if (posts.length < MIN_POSTS || contasIds.length !== 1) return null; // o horário só faz sentido por perfil
  const h = await melhoresHorarios(contasIds[0]);
  const m = h.melhor as Row | null;
  if (!m || m.confianca !== 'alta') return null;
  return { id: 'horario', prioridade: 4, titulo: `${m.dia}, por volta das ${String(m.hora).padStart(2, '0')}h, tem funcionado melhor`, texto: `Melhor média de curtidas e comentários: ${m.dia} (${m.mediaDia}) e o horário das ${String(m.hora).padStart(2, '0')}h (${m.mediaHora}).`, fonte: 'Instagram (orgânico), histórico sincronizado do perfil', amostra: `${h.amostra} publicações`, link: { pagina: 'igdesempenho', rotulo: 'Ver por dia e horário' } };
}

function insightTrafego(t: Row | null): Insight | null {
  if (!t) return null;
  const camps = ((t.campanhas ?? []) as Row[]).filter((c) => c.conversas >= 5 && c.custoConversa !== null);
  const total = t.atual as Row;
  if (camps.length < 2 || !total?.custoConversa) return null;
  const melhor = [...camps].sort((a, b) => a.custoConversa - b.custoConversa)[0];
  if (melhor.custoConversa > total.custoConversa * (1 - DIFERENCA_MIN)) return null;
  const br = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return { id: 'trafego', prioridade: 2, titulo: 'Uma campanha converte mais barato em conversas', texto: `“${melhor.nome}” custou ${br(melhor.custoConversa)} por conversa, contra ${br(total.custoConversa)} na média de todas as campanhas.`, fonte: 'Meta Ads (somente leitura)', amostra: `${melhor.conversas} conversas em ${camps.length} campanhas`, link: { pagina: 'tfcampanhas', rotulo: 'Ver as campanhas' } };
}

export async function gerarInsights(f: Filtros, trafego: Row | null, hoje: string): Promise<Insight[]> {
  const o = await organico(f);
  const lista = (await Promise.all([insightProducao(f, hoje), Promise.resolve(insightFormato(o.posts)), insightHorario(f, o.posts, o.contas.map((c) => c.ig)), Promise.resolve(insightTrafego(trafego))])).filter((x): x is Insight => !!x);
  return lista.sort((a, b) => a.prioridade - b.prioridade).slice(0, 3);
}
