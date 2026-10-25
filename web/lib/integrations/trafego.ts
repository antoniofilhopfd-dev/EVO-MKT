import { q1 } from '../db';
import { setting } from '../settings';
import { env, fail, now, Row } from '../util';
import { metaConnected, metaGet } from './meta';
import { adsPermitido } from './metaads';

/**
 * Tráfego Pago — SOMENTE LEITURA. Consulta a API oficial da Meta (insights) na hora do pedido, com cache curto,
 * e devolve indicadores recalculados a partir dos valores absolutos. Nada aqui cria, edita, ativa, pausa ou muda orçamento.
 * Leads, visitas, matrículas e funil comercial NÃO aparecem: pertencem ao EVO CRM.
 */
export const MAX_DIAS = 400;
const TTL_MS = 5 * 60 * 1000;
const CONVERSA_PRINCIPAL = 'onsite_conversion.messaging_conversation_started_7d';
const CONVERSA_ALTERNATIVA = 'messaging_conversation_started_7d';
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const DIA = 86400000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utc = (d: string) => Date.parse(d + 'T00:00:00Z');

/** Hoje na hora do Colégio (America/Fortaleza). */
export function hojeFortaleza(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env('TIMEZONE', 'America/Fortaleza'), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Conta SOMENTE "conversas iniciadas": a Meta devolve também variações do mesmo evento, e somar tudo repete as conversas. */
export function conversasIniciadas(actions: unknown): number {
  const lista = (Array.isArray(actions) ? actions : []) as Row[];
  const total = (tipo: string) => lista.filter((a) => a.action_type === tipo).reduce((s, a) => s + num(a.value), 0);
  return lista.some((a) => a.action_type === CONVERSA_PRINCIPAL) ? total(CONVERSA_PRINCIPAL) : total(CONVERSA_ALTERNATIVA);
}

export interface Totais { investimento: number; impressoes: number; alcance: number | null; cliques: number; ctr: number | null; cpc: number | null; conversas: number; custoConversa: number | null }
/** CTR, CPC e custo por conversa SEMPRE dos valores absolutos (nunca média das médias). `alcance` vem da consulta da conta (sem repetir pessoas). */
export function totais(linhas: Row[], alcanceConta: number | null): Totais {
  const investimento = linhas.reduce((s, l) => s + num(l.spend ?? l.investimento), 0);
  const impressoes = linhas.reduce((s, l) => s + num(l.impressions ?? l.impressoes), 0);
  const cliques = linhas.reduce((s, l) => s + num(l.clicks ?? l.cliques), 0);
  const conversas = linhas.reduce((s, l) => s + (l.actions !== undefined ? conversasIniciadas(l.actions) : num(l.conversas)), 0);
  return { investimento, impressoes, alcance: alcanceConta, cliques, ctr: impressoes ? (cliques / impressoes) * 100 : null, cpc: cliques ? investimento / cliques : null, conversas, custoConversa: conversas ? investimento / conversas : null };
}

export function validarPeriodo(de: string, ate: string): void {
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(utc(d)) && ymd(utc(d)) === d;
  if (!ok(de) || !ok(ate)) fail(400, 'Informe as duas datas (AAAA-MM-DD).');
  if (de > ate) fail(400, 'A data inicial não pode ser depois da final.');
  if (ate > hojeFortaleza()) fail(400, 'A data final não pode ser no futuro.');
  if (Math.round((utc(ate) - utc(de)) / DIA) + 1 > MAX_DIAS) fail(400, `O período máximo é de ${MAX_DIAS} dias.`);
}

/** Período anterior equivalente: semana → mesma janela 7 dias antes; mês até hoje → mesmo número de dias do mês anterior; demais → período de mesmo tamanho logo antes. */
export function periodoAnterior(de: string, ate: string, tipo = ''): { de: string; ate: string } {
  if (tipo === 'semana') return { de: ymd(utc(de) - 7 * DIA), ate: ymd(utc(ate) - 7 * DIA) };
  if (tipo === 'mes' && de.slice(8) === '01') {
    const y = Number(de.slice(0, 4)), m = Number(de.slice(5, 7));
    const ini = Date.UTC(y, m - 2, 1), ultimo = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
    const dia = Math.min(Number(ate.slice(8)), ultimo);
    return { de: ymd(ini), ate: ymd(Date.UTC(y, m - 2, dia)) };
  }
  if (tipo === 'mes_ant') {
    const y = Number(de.slice(0, 4)), m = Number(de.slice(5, 7));
    return { de: ymd(Date.UTC(y, m - 2, 1)), ate: ymd(Date.UTC(y, m - 1, 0)) };
  }
  if (tipo === 'semana_ant') return { de: ymd(utc(de) - 7 * DIA), ate: ymd(utc(ate) - 7 * DIA) };
  if (tipo === 'ano' || /^a:\d{4}$/.test(tipo)) {
    const y = Number(de.slice(0, 4)) - 1, fimAnt = ate.slice(5) === '02-29' ? '02-28' : ate.slice(5);
    return { de: `${y}-${de.slice(5)}`, ate: `${y}-${fimAnt}` };
  }
  const dias = Math.round((utc(ate) - utc(de)) / DIA) + 1;
  const fim = utc(de) - DIA;
  return { de: ymd(fim - (dias - 1) * DIA), ate: ymd(fim) };
}

export function variacao(atual: number | null, anterior: number | null): { tipo: 'subiu' | 'caiu' | 'estavel' | 'novo' | 'sem'; percentual: number | null } {
  if (atual === null || anterior === null || !Number.isFinite(atual) || !Number.isFinite(anterior)) return { tipo: 'sem', percentual: null };
  if (anterior === 0) return atual > 0 ? { tipo: 'novo', percentual: null } : { tipo: 'sem', percentual: null };
  const p = ((atual - anterior) / anterior) * 100;
  if (Math.abs(p) < 0.05) return { tipo: 'estavel', percentual: 0 };
  return { tipo: p > 0 ? 'subiu' : 'caiu', percentual: p };
}

/** Só imagens servidas pela Meta/Instagram, por HTTPS, sem credenciais na URL nem porta estranha. */
export function urlDeImagemMeta(u: unknown): string {
  try {
    const p = new URL(String(u ?? ''));
    if (p.protocol !== 'https:' || p.username || p.password || (p.port && p.port !== '443')) return '';
    const h = p.hostname.toLowerCase();
    const ok = h === 'fbcdn.net' || h.endsWith('.fbcdn.net') || h.endsWith('.facebook.com') || h === 'facebook.com' || h.endsWith('.cdninstagram.com') || h === 'cdninstagram.com';
    return ok && p.href.length <= 1500 ? p.href : '';
  } catch { return ''; }
}

const STATUS_ROTULO: Record<string, string> = { ACTIVE: 'Ativo', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campanha pausada', ADSET_PAUSED: 'Conjunto pausado', WITH_ISSUES: 'Com problema', DISAPPROVED: 'Reprovado', PENDING_REVIEW: 'Em análise', IN_PROCESS: 'Em processamento', PENDING_BILLING_INFO: 'Pendência de pagamento', PREAPPROVED: 'Pré-aprovado', ARCHIVED: 'Arquivado', DELETED: 'Excluído' };
export const rotuloStatus = (s: unknown) => { const t = String(s ?? ''); return t ? STATUS_ROTULO[t] ?? t.toLowerCase().replace(/_/g, ' ') : '—'; };
/** "03 - EM — Captação 2026" → "03 - EM". */
export function codigoCampanha(nome: unknown): string {
  const s = String(nome ?? '').trim();
  const m = s.match(/^(\d{1,2}\s*-\s*[A-Za-zÀ-ÿ]{2,4})(?![A-Za-zÀ-ÿ])/);
  if (m) return m[1].replace(/\s*-\s*/, ' - ');
  const corte = s.split(/\s[—–]\s/)[0];
  return corte.length > 16 ? corte.slice(0, 15) + '…' : corte || '—';
}
/** Segmento inferido do nome (a Meta não guarda segmento): nunca inventa, devolve '' quando não identifica. */
export function segmentoDoNome(nome: unknown): string {
  const t = String(nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const cod = t.match(/^\s*\d{1,2}\s*-\s*([A-Z]{2,4})\b/)?.[1] ?? '';
  const mapa: Record<string, string> = { EI: 'INFANTIL', AI: 'FUND1', AF: 'FUND2', EM: 'MEDIO' };
  if (mapa[cod]) return mapa[cod];
  if (/INFANTIL|MATERNAL|JARDIM/.test(t)) return 'INFANTIL';
  if (/ANOS INICIAIS/.test(t)) return 'FUND1';
  if (/ANOS FINAIS/.test(t)) return 'FUND2';
  if (/ENSINO MEDIO/.test(t)) return 'MEDIO';
  return '';
}

// ---------- chamadas à Meta (somente GET) ----------
const versaoGraph = () => (env('META_GRAPH_BASE', 'https://graph.facebook.com/v21.0').match(/\/(v\d+\.\d+)\/?$/) ?? [])[1] ?? '';
export const versaoApi = () => versaoGraph() || 'sem versão no endereço';

async function contaDeAnuncios(): Promise<string> {
  if (!(await metaConnected())) fail(409, 'A Meta não está conectada. Conecte em Configurações › Instagram.');
  if ((await setting('meta_token_invalido')) === '1') fail(409, 'O acesso à Meta expirou ou foi revogado. Reconecte em Configurações › Instagram.');
  const conta = (await setting('meta_ads_conta')).replace(/^act_/, '');
  if (!/^\d{5,20}$/.test(conta)) fail(409, 'Escolha a conta de anúncios em Configurações › Meta Ads.');
  if (!(await adsPermitido())) fail(403, 'A permissão ads_read não foi concedida. Reconecte a Meta e aceite todas as permissões.');
  return conta;
}

async function insights(conta: string, nivel: 'campaign' | 'adset' | 'ad' | 'account', de: string, ate: string, diario = false): Promise<{ linhas: Row[]; truncado: boolean }> {
  const campos = nivel === 'account' ? 'spend,impressions,reach,clicks,actions' : nivel === 'campaign' ? 'campaign_id,campaign_name,spend,impressions,reach,clicks,actions' : nivel === 'adset' ? 'adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,actions' : 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,actions';
  const linhas: Row[] = [];
  let after = '', truncado = false;
  for (let pagina = 0; pagina < 12; pagina++) {
    const r = await metaGet(`/act_${conta}/insights`, { level: nivel, fields: campos, time_range: JSON.stringify({ since: de, until: ate }), limit: 500, ...(diario ? { time_increment: 1 } : {}), ...(after ? { after } : {}) });
    linhas.push(...((r.data ?? []) as Row[]));
    after = String(r.paging?.cursors?.after ?? '');
    if (!r.paging?.next || !after) break;
    if (pagina === 11) truncado = true;
  }
  return { linhas, truncado };
}

async function anunciosDetalhe(conta: string, ids: string[], tipo: 'ads' | 'campaigns' | 'adsets' = 'ads'): Promise<Map<string, Row>> {
  const mapa = new Map<string, Row>();
  const campos = tipo !== 'ads' ? 'id,effective_status' : 'id,effective_status,creative.thumbnail_width(300).thumbnail_height(380){id,thumbnail_url,image_url}';
  try {
    for (let i = 0; i < ids.length; i += 40) {
      const r = await metaGet(`/act_${conta}/${tipo}`, { fields: campos, filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: ids.slice(i, i + 40) }]), limit: 100 });
      for (const a of (r.data ?? []) as Row[]) mapa.set(String(a.id), a);
    }
  } catch { /* sem foto/estado: o painel sai assim mesmo, com aviso */ }
  return mapa;
}

const cache = new Map<string, { em: number; dados: Row }>();
export function limparCacheTrafego(): void { cache.clear(); }

export interface ResumoTrafego extends Row { periodo: { de: string; ate: string; dias: number }; anterior: { de: string; ate: string }; atual: Totais; anteriorTotais: Totais | null }

/** Painel completo de um período (e do período anterior equivalente). */
export async function resumoTrafego(de: string, ate: string, tipo = '', forcar = false): Promise<Row> {
  validarPeriodo(de, ate);
  const chave = `${de}|${ate}|${tipo}`;
  const guardado = cache.get(chave);
  if (guardado && !forcar && Date.now() - guardado.em < TTL_MS) return guardado.dados;
  const conta = await contaDeAnuncios();
  const ant = periodoAnterior(de, ate, tipo);
  const avisos: string[] = [];
  const [camp, contaAtual, anunc, dia, campAnt, contaAnt, conj] = await Promise.all([
    insights(conta, 'campaign', de, ate), insights(conta, 'account', de, ate), insights(conta, 'ad', de, ate), insights(conta, 'campaign', de, ate, true),
    insights(conta, 'campaign', ant.de, ant.ate), insights(conta, 'account', ant.de, ant.ate), insights(conta, 'adset', de, ate),
  ]);
  if ([camp, contaAtual, anunc, dia, campAnt, contaAnt, conj].some((x) => x.truncado)) avisos.push('Há mais resultados do que o limite de consulta; os números podem estar incompletos. Reduza o período.');
  const alcance = contaAtual.linhas.length ? num(contaAtual.linhas[0].reach) : null;
  const alcanceAnt = contaAnt.linhas.length ? num(contaAnt.linhas[0].reach) : null;
  const atual = totais(camp.linhas, alcance), anterior = totais(campAnt.linhas, alcanceAnt);
  if (!camp.linhas.length) avisos.push('A Meta não devolveu campanhas com veiculação neste período.');
  const detalhe = await anunciosDetalhe(conta, [...new Set(anunc.linhas.map((l) => String(l.ad_id ?? '')).filter(Boolean))]);
  if (anunc.linhas.length && !detalhe.size) avisos.push('Não foi possível ler as miniaturas e o status dos anúncios agora.');
  const detalheCamp = await anunciosDetalhe(conta, [...new Set(camp.linhas.map(l => String(l.campaign_id ?? '')).filter(Boolean))], 'campaigns');
  if (camp.linhas.length && detalheCamp.size < new Set(camp.linhas.map(l => String(l.campaign_id))).size) avisos.push('O status de algumas campanhas não está disponível; elas aparecem em Todos ou Status indisponível.');
  const linhaCamp = (l: Row) => { const status = String(detalheCamp.get(String(l.campaign_id))?.effective_status ?? ''); const t = totais([l], num(l.reach)); return { id: String(l.campaign_id ?? ''), nome: String(l.campaign_name ?? ''), status, statusRotulo: rotuloStatus(status), codigo: codigoCampanha(l.campaign_name), segmento: segmentoDoNome(l.campaign_name), ...t }; };
  const campanhas = camp.linhas.map(linhaCamp).filter((c) => c.investimento > 0 || c.impressoes > 0).sort((a, b) => b.investimento - a.investimento);
  const detalheConj = await anunciosDetalhe(conta, [...new Set(conj.linhas.map((l) => String(l.adset_id ?? '')).filter(Boolean))], 'adsets');
  const conjuntos = conj.linhas.map((l) => {
    const t = totais([l], num(l.reach));
    return { id: String(l.adset_id ?? ''), nome: String(l.adset_name ?? ''), campanha: String(l.campaign_name ?? ''), campanhaId: String(l.campaign_id ?? ''), codigo: codigoCampanha(l.campaign_name), segmento: segmentoDoNome(l.campaign_name), status: String(detalheConj.get(String(l.adset_id))?.effective_status ?? ''), statusRotulo: rotuloStatus(detalheConj.get(String(l.adset_id))?.effective_status), ...t };
  }).filter((a) => a.investimento > 0 || a.impressoes > 0).sort((a, b) => b.investimento - a.investimento);
  const anuncios = anunc.linhas.map((l) => {
    const d = detalhe.get(String(l.ad_id)) ?? {};
    const t = totais([l], num(l.reach));
    return { id: String(l.ad_id ?? ''), nome: String(l.ad_name ?? ''), conjunto: String(l.adset_name ?? ''), conjuntoId: String(l.adset_id ?? ''), campanhaId: String(l.campaign_id ?? ''), criativoId: String(d.creative?.id ?? ''), campanha: String(l.campaign_name ?? ''), codigo: codigoCampanha(l.campaign_name), segmento: segmentoDoNome(l.campaign_name), status: String(d.effective_status ?? ''), statusRotulo: rotuloStatus(d.effective_status), miniatura: urlDeImagemMeta(d.creative?.thumbnail_url) || urlDeImagemMeta(d.creative?.image_url), imagem: urlDeImagemMeta(d.creative?.image_url) || urlDeImagemMeta(d.creative?.thumbnail_url), ...t };
  }).filter((a) => a.investimento > 0 || a.impressoes > 0).sort((a, b) => b.investimento - a.investimento);
  const pausadosComGasto = anuncios.filter((a) => /PAUSED/.test(a.status)).length;
  if (pausadosComGasto) avisos.push(`${pausadosComGasto} anúncio(s) estão pausados hoje, mas tiveram gasto no período.`);
  // evolução diária do investimento (todos os dias do período, dia sem gasto = 0), empilhada por campanha
  const dias: string[] = [];
  for (let t = utc(de); t <= utc(ate); t += DIA) dias.push(ymd(t));
  const nomes = [...new Set(dia.linhas.map((l) => String(l.campaign_name ?? l.campaign_id ?? 'Sem identificação')))].sort();
  const series = nomes.map((nome) => ({ nome, codigo: codigoCampanha(nome), valores: dias.map(() => 0) }));
  const idx = new Map(dias.map((d, i) => [d, i]));
  for (const l of dia.linhas) { const i = idx.get(String(l.date_start ?? '').slice(0, 10)); const s = series.find((x) => x.nome === String(l.campaign_name ?? l.campaign_id ?? 'Sem identificação')); if (i !== undefined && s) s.valores[i] += num(l.spend); }
  const total = dias.map((_, i) => series.reduce((s, x) => s + x.valores[i], 0));
  const conversasDia = dias.map(() => 0);
  for (const l of dia.linhas) { const i = idx.get(String(l.date_start ?? '').slice(0, 10)); if (i !== undefined) conversasDia[i] += conversasIniciadas(l.actions); }
  // investimento e resultado por segmento (o segmento é deduzido do nome da campanha; sem segmento reconhecido entra em "Sem segmento")
  const porSeg = new Map<string, { segmento: string; investimento: number; conversas: number; campanhas: number }>();
  for (const c of campanhas) { const k = c.segmento || 'SEM'; const x = porSeg.get(k) ?? { segmento: k, investimento: 0, conversas: 0, campanhas: 0 }; x.investimento += c.investimento; x.conversas += c.conversas; x.campanhas++; porSeg.set(k, x); }
  const segmentos = [...porSeg.values()].map((x) => ({ ...x, custoConversa: x.conversas ? x.investimento / x.conversas : null })).sort((a, b) => b.investimento - a.investimento);
  const comConversa = campanhas.filter((c) => c.conversas > 0);
  const dados: Row = {
    periodo: { de, ate, dias: dias.length }, anterior: ant, atual, anteriorTotais: anterior,
    variacoes: Object.fromEntries((['investimento', 'impressoes', 'alcance', 'cliques', 'ctr', 'cpc', 'conversas', 'custoConversa'] as const).map((k) => [k, variacao(atual[k], anterior[k])])),
    campanhas, conjuntos, anuncios, segmentos, diario: { dias, series, total, conversas: conversasDia },
    destaques: {
      melhorCampanha: comConversa.length ? [...comConversa].sort((a, b) => (a.custoConversa ?? 0) - (b.custoConversa ?? 0))[0] : null,
      piorCampanha: comConversa.length > 1 ? [...comConversa].sort((a, b) => (b.custoConversa ?? 0) - (a.custoConversa ?? 0))[0] : null,
      maisGastou: campanhas[0] ?? null,
    },
    avisos,
    origem: { fonte: 'Meta Ads (API oficial, somente leitura)', periodo: `${de} a ${ate}`, atualizadoEm: now(), sincronizacao: 'consulta direta (cache de 5 minutos)', natureza: 'acumulado do período', versaoApi: versaoApi(), aviso: 'A Meta pode atualizar números por até 72 horas (atribuição). Alcance do total não soma as campanhas: vem da conta, sem repetir pessoas.' },
  };
  cache.set(chave, { em: Date.now(), dados });
  return dados;
}

// ---------- apoio (cabeçalho e "dados da última sincronização") ----------
export async function ultimaSincronizacao(): Promise<string> { return setting('meta_ads_ultima_sync'); }
export async function resumoDaUltimaSincronizacao(de: string, ate: string): Promise<Totais | null> {
  const r = await q1('SELECT COALESCE(SUM(gasto),0) g,COALESCE(SUM(impressoes),0) i,COALESCE(SUM(cliques),0) c,COALESCE(SUM(conversas),0) v,COUNT(*) n FROM ads_diario WHERE dia>=? AND dia<=?', [de, ate]);
  if (!r || !Number(r.n)) return null;
  return totais([{ spend: r.g, impressions: r.i, clicks: r.c, conversas: r.v }], null);
}

/** O status é o efetivo ATUAL informado pela Meta, e não o status histórico no período. */
export const FILTROS_STATUS: Record<string, string> = { todos: 'Todos', ativos: 'Ativos', pausados: 'Pausados', analise: 'Em análise', problemas: 'Com problemas ou reprovados', arquivados: 'Arquivados ou excluídos', desconhecidos: 'Status indisponível' };
export function validarFiltroStatus(status: string, nivel: string): void {
  if (!Object.hasOwn(FILTROS_STATUS, status) || !['campanhas', 'conjuntos', 'anuncios'].includes(nivel)) fail(400, 'Filtro de status ou nível inválido.');
}
export function filtrarTabelaTrafego(d: Row, status = 'todos', nivel = 'campanhas'): Row {
  validarFiltroStatus(status, nivel);
  const cabe = (s: string) => status === 'todos' || (status === 'ativos' ? s === 'ACTIVE' : status === 'pausados' ? ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(s) : status === 'analise' ? ['PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED'].includes(s) : status === 'problemas' ? ['WITH_ISSUES', 'DISAPPROVED', 'PENDING_BILLING_INFO'].includes(s) : status === 'arquivados' ? ['ARCHIVED', 'DELETED'].includes(s) : !s);
  const rows = (d[nivel] as Row[]).filter(r => cabe(String(r.status || '')));
  // Alcance não é aditivo: a conta não informa alcance deduplicado para este recorte.
  const total = status === 'todos' ? d.atual : totais(rows, null);
  return { ...d, [nivel]: rows, tabela: { nivel, status, rotulo: FILTROS_STATUS[status], total }, avisos: [...(d.avisos || []), ...(status === 'todos' ? [] : ['Filtro pelo status atual na Meta. Os valores representam a veiculação no período escolhido; itens sem veiculação não aparecem. O alcance total deste recorte não é somado.'])] };
}
