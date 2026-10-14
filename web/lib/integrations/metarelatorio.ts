import { setting } from '../settings';
import { fmtDate, Row } from '../util';
import { metaConnected } from './meta';
import { adsPermitido, paginar } from './metaads';

/**
 * Relatório de tráfego por período (semana + mês até hoje), no formato do "Dashboard de Tráfego — Meta Ads".
 * SOMENTE LEITURA: lê a Meta na hora do pedido e não grava nada. Conversas = conversas iniciadas pelo anúncio (não inclui leads de formulário).
 */
const CONVERSA = ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d'];
const num = (v: unknown) => Number(v ?? 0) || 0;
const conversas = (l: Row) => (Array.isArray(l.actions) ? l.actions : []).filter((a: Row) => CONVERSA.includes(String(a.action_type))).reduce((s: number, a: Row) => s + num(a.value), 0);

/** "01 - EI | Captação" → "01 - EI". Sem o padrão, usa o nome (cortado). */
export function nomeCurto(nome: string): string {
  const m = String(nome).match(/^\s*(\d{1,2})\s*[-–]\s*([A-Za-zÀ-ÿ]{2,8})/);
  return m ? `${m[1]} - ${m[2].toUpperCase()}` : String(nome).trim().slice(0, 24);
}
const ROTULO_STATUS = (s: string) => /^ACTIVE$/i.test(s) ? 'Ativo' : /PAUSED/i.test(s) ? 'Pausado' : /DISAPPROVED/i.test(s) ? 'Reprovado' : /WITH_ISSUES/i.test(s) ? 'Com problema' : /PENDING/i.test(s) ? 'Em análise' : s ? s : '—';

function kpis(gasto: number, impressoes: number, alcance: number, cliques: number, conv: number) {
  return { investimento: gasto, impressoes, alcance, cliques, ctr: impressoes ? (cliques / impressoes) * 100 : 0, cpc: cliques ? gasto / cliques : 0, conversas: conv, custoConversa: conv ? gasto / conv : 0 };
}
const soma = (rows: Row[], k: string) => rows.reduce((s, r) => s + num(r[k]), 0);

export async function relatorioTrafego(de: string, ate: string): Promise<Row> {
  if (!(await metaConnected())) throw new Error('Instagram/Meta não conectado.');
  const conta = await setting('meta_ads_conta');
  if (!conta) throw new Error('Escolha a conta de anúncios em Integrações.');
  if (!(await adsPermitido())) throw new Error('A permissão ads_read não foi concedida. Reconecte a Meta e aceite todas as permissões.');
  const act = `act_${conta}`;
  const hoje = fmtDate(new Date());
  const mesIni = `${ate.slice(0, 7)}-01`;
  const fimMesCal = fmtDate(new Date(Number(ate.slice(0, 4)), Number(ate.slice(5, 7)), 0));
  const mesFim = fimMesCal > hoje ? hoje : fimMesCal; // mês em andamento: até hoje
  const parcial = mesFim < fimMesCal;
  const faixa = (since: string, until: string) => JSON.stringify({ since, until });
  const base = { fields: 'campaign_id,campaign_name,spend,impressions,reach,clicks,actions,account_currency', limit: 200 };

  const camSem = await paginar(`/${act}/insights`, { ...base, level: 'campaign', time_range: faixa(de, ate) });
  const camMes = await paginar(`/${act}/insights`, { ...base, level: 'campaign', time_range: faixa(mesIni, mesFim) });
  const dia = await paginar(`/${act}/insights`, { ...base, level: 'campaign', time_increment: 1, time_range: faixa(de, ate) }, 8);
  const adSem = await paginar(`/${act}/insights`, { fields: 'ad_id,ad_name,campaign_id,campaign_name,spend,impressions,reach,clicks,actions,account_currency', level: 'ad', time_range: faixa(de, ate), limit: 200 }, 6);
  const meta = new Map<string, Row>();
  try { for (const a of await paginar(`/${act}/ads`, { fields: 'id,effective_status,creative.thumbnail_width(220).thumbnail_height(280){thumbnail_url}', limit: 200 }, 8)) meta.set(String(a.id), a); } catch { /* sem foto/estado: o relatório sai assim mesmo */ }

  const moeda = String(camSem[0]?.account_currency ?? camMes[0]?.account_currency ?? 'BRL');
  const linha = (l: Row) => ({
    nome: String(l.campaign_name ?? ''), curto: nomeCurto(String(l.campaign_name ?? '')), investimento: num(l.spend), impressoes: num(l.impressions), alcance: num(l.reach), cliques: num(l.clicks), conversas: conversas(l),
  });
  const campanhas = camSem.map(linha).filter((c) => c.investimento > 0 || c.impressoes > 0).sort((a, b) => a.curto.localeCompare(b.curto)).map((c) => ({ ...c, ...kpis(c.investimento, c.impressoes, c.alcance, c.cliques, c.conversas) }));
  const totS = kpis(soma(campanhas, 'investimento'), soma(campanhas, 'impressoes'), soma(campanhas, 'alcance'), soma(campanhas, 'cliques'), soma(campanhas, 'conversas'));
  const mes = camMes.map(linha);
  const totM = kpis(soma(mes, 'investimento'), soma(mes, 'impressoes'), soma(mes, 'alcance'), soma(mes, 'cliques'), soma(mes, 'conversas'));

  // série diária por campanha (todas as datas do período, mesmo sem gasto)
  const datas: string[] = [];
  for (let d = new Date(de + 'T12:00:00'); fmtDate(d) <= ate && datas.length < 40; d.setDate(d.getDate() + 1)) datas.push(fmtDate(d));
  const porCamp = new Map<string, Map<string, number>>();
  for (const l of dia) {
    const c = nomeCurto(String(l.campaign_name ?? ''));
    const m = porCamp.get(c) ?? porCamp.set(c, new Map()).get(c)!;
    const k = String(l.date_start ?? '').slice(0, 10);
    m.set(k, (m.get(k) ?? 0) + num(l.spend));
  }
  const series = [...porCamp.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([curto, m]) => ({ curto, valores: datas.map((d) => Math.round((m.get(d) ?? 0) * 100) / 100) }));
  const total = datas.map((_, i) => Math.round(series.reduce((s, x) => s + x.valores[i], 0) * 100) / 100);

  const anuncios = adSem.map((l) => {
    const m = meta.get(String(l.ad_id)) ?? {};
    const thumb = String(m.creative?.thumbnail_url ?? '');
    const k = kpis(num(l.spend), num(l.impressions), num(l.reach), num(l.clicks), conversas(l));
    return { nome: String(l.ad_name ?? ''), camp: nomeCurto(String(l.campaign_name ?? '')), status: ROTULO_STATUS(String(m.effective_status ?? '')), foto: /^https:\/\//.test(thumb) ? thumb.slice(0, 1000) : '', ...k };
  }).filter((a) => a.investimento > 0 || a.impressoes > 0).sort((a, b) => b.investimento - a.investimento);
  const totA = kpis(soma(anuncios, 'investimento'), soma(anuncios, 'impressoes'), soma(anuncios, 'alcance'), soma(anuncios, 'cliques'), soma(anuncios, 'conversas'));
  const pausados = [...new Set(anuncios.filter((a) => a.status === 'Pausado').map((a) => a.nome))];

  return {
    conta, moeda, periodo: { de, ate }, mensal: { de: mesIni, ate: mesFim, parcial, ...totM }, semanal: totS, campanhas,
    diario: { datas, series, total }, anuncios, totalAnuncios: totA, anunciosPausadosComGasto: pausados,
  };
}
