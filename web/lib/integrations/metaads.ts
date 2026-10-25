import { q, q1, run } from '../db';
import { sha256 } from '../crypto';
import { registrarNotificacao } from '../notificacoes';
import { intLog, setSetting, setting } from '../settings';
import { fmtDate, localParts, now, Row } from '../util';
import { metaConnected, metaGet } from './meta';

/**
 * Meta Ads — SOMENTE LEITURA. O EVO MKT nunca cria, ativa, pausa, edita nem altera orçamento de campanhas:
 * lê gasto e resultados para relatórios. Qualquer gasto continua sendo decidido e executado no Gerenciador de Anúncios.
 */
export const META_PERMISSOES_ADS = ['ads_read'];
const SEM_CENTAVOS = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD']);

export interface ContaAds { id: string; nome: string; moeda: string; status: string }

export async function adsPermitido(): Promise<boolean> {
  try {
    const r = await metaGet('/me/permissions');
    return (r.data ?? []).some((p: Row) => p.permission === 'ads_read' && p.status === 'granted');
  } catch {
    return false;
  }
}

export async function listarContasAds(): Promise<ContaAds[]> {
  if (!(await metaConnected())) throw new Error('Instagram/Meta não conectado.');
  const r = await metaGet('/me/adaccounts', { fields: 'account_id,name,currency,account_status', limit: 100 });
  const contas = (r.data ?? []).map((a: Row) => ({ id: String(a.account_id ?? '').replace(/^act_/, ''), nome: String(a.name ?? ''), moeda: String(a.currency ?? ''), status: String(a.account_status ?? '') })).filter((a: ContaAds) => a.id);
  await setSetting('meta_ads_contas', JSON.stringify(contas));
  return contas;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const valorMenor = (v: unknown, moeda: string) => (v === undefined || v === null || v === '' ? 0 : Number(v) / (SEM_CENTAVOS.has(moeda) ? 1 : 100));
/** Resultados = leads + conversas iniciadas, exatamente como a Meta as relata em "actions". Outras ações (cliques no link etc.) não entram. */
const RESULTADO = ['lead', 'onsite_conversion.lead_grouped', 'onsite_conversion.messaging_conversation_started_7d'];
const CONVERSA = ['onsite_conversion.messaging_conversation_started_7d'];
const emVeiculacao = (a: Row) => ![a.status, a.adset?.status, a.campaign?.status].some((x) => x !== undefined && x !== 'ACTIVE'); // só vale como ativo se anúncio, conjunto e campanha estão ligados
const somaAcoes = (l: Row, tipos: string[]) => (Array.isArray(l.actions) ? l.actions : []).filter((a: Row) => tipos.includes(String(a.action_type))).reduce((x: number, a: Row) => x + num(a.value), 0);

export async function paginar(path: string, params: Row, max = 5): Promise<Row[]> {
  const out: Row[] = [];
  let after = '';
  for (let i = 0; i < max; i++) {
    const r = await metaGet(path, { ...params, ...(after ? { after } : {}) });
    out.push(...(r.data ?? []));
    after = String(r.paging?.cursors?.after ?? '');
    if (!r.paging?.next || !after) break;
  }
  return out;
}

/** Atualiza (upsert) o gasto e as métricas por campanha e mês dos últimos `meses` meses. Devolve quantos registros foram gravados. */
export async function adsSync(meses = 3): Promise<number> {
  if (!(await metaConnected())) throw new Error('Instagram/Meta não conectado.');
  const conta = await setting('meta_ads_conta');
  if (!conta) throw new Error('Escolha a conta de anúncios em Integrações.');
  if (!(await adsPermitido())) throw new Error('A permissão ads_read não foi concedida. Reconecte a Meta e aceite todas as permissões.');
  const info = (JSON.parse((await setting('meta_ads_contas')) || '[]') as ContaAds[]).find((c) => c.id === conta);
  const moeda = info?.moeda ?? '';
  const act = `act_${conta}`;
  const campanhas = new Map<string, Row>();
  for (const c of await paginar(`/${act}/campaigns`, { fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time', limit: 100 })) campanhas.set(String(c.id), c);
  const lp = localParts(new Date());
  let n = 0;
  for (let i = 0; i < meses; i++) {
    let y = lp.y, m = lp.m - i;
    while (m < 1) { m += 12; y--; }
    const per = `${y}-${String(m).padStart(2, '0')}`;
    const ate = i === 0 ? fmtDate(new Date()) : fmtDate(new Date(y, m, 0));
    const linhas = await paginar(`/${act}/insights`, { level: 'campaign', fields: 'campaign_id,campaign_name,spend,impressions,reach,clicks,actions,account_currency', time_range: JSON.stringify({ since: `${per}-01`, until: ate }), limit: 200 });
    for (const l of linhas) {
      const camp = campanhas.get(String(l.campaign_id)) ?? {};
      const mo = String(l.account_currency ?? moeda);
      const resultados = (Array.isArray(l.actions) ? l.actions : []).filter((a: Row) => RESULTADO.includes(String(a.action_type))).reduce((s: number, a: Row) => s + num(a.value), 0);
      const statusNovo = String(camp.effective_status ?? camp.status ?? '');
      const anterior = await q1('SELECT status FROM ads_snapshots WHERE conta=? AND campanha_id=? ORDER BY periodo DESC LIMIT 1', [conta, String(l.campaign_id)]);
      if (anterior && String(anterior.status) !== statusNovo && statusNovo) {
        const problema = /DISAPPROVED|WITH_ISSUES|PENDING_REVIEW|ERROR/i.test(statusNovo);
        await registrarNotificacao('ads_status', 'gerencia', problema ? 'Campanha com problema na Meta' : 'Status de campanha mudou na Meta', `"${String(l.campaign_name ?? camp.name ?? '')}": ${String(anterior.status) || '—'} → ${statusNovo}. O EVO MKT só lê; a decisão é no Gerenciador de Anúncios.`, 'trafego', String(l.campaign_id));
      }
      await run(
        `INSERT INTO ads_snapshots(conta,campanha_id,campanha,periodo,gasto,impressoes,alcance,cliques,resultados,conversas,inicio,moeda,status,objetivo,orcamento_diario,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE campanha=VALUES(campanha),gasto=VALUES(gasto),impressoes=VALUES(impressoes),alcance=VALUES(alcance),cliques=VALUES(cliques),resultados=VALUES(resultados),conversas=VALUES(conversas),inicio=VALUES(inicio),moeda=VALUES(moeda),status=VALUES(status),objetivo=VALUES(objetivo),orcamento_diario=VALUES(orcamento_diario),atualizado_em=VALUES(atualizado_em)`,
        [conta, String(l.campaign_id), String(l.campaign_name ?? camp.name ?? '').slice(0, 200), per, num(l.spend), num(l.impressions), num(l.reach), num(l.clicks), resultados, somaAcoes(l, CONVERSA), String(camp.start_time ?? '').slice(0, 40), mo, String(camp.effective_status ?? camp.status ?? ''), String(camp.objective ?? ''), valorMenor(camp.daily_budget, mo), now()],
      );
      n++;
    }
  }
  // Extras (saúde da conta, gasto por dia, anúncios): falhar aqui não pode derrubar a leitura principal.
  for (const [nome, fn] of [['saúde da conta', () => adsSaudeConta(conta, moeda)], ['gasto por dia', () => adsSyncDiario(conta, moeda)], ['anúncios', () => adsSyncAnuncios(conta, moeda)]] as const) {
    try { await fn(); } catch (e: any) {
      if ((await setting('meta_token_invalido')) === '1') throw e;
      await intLog('instagram', 'aviso', `Meta Ads (${nome}): ${String(e.message).slice(0, 160)}`);
    }
  }
  await setSetting('meta_ads_ultima_sync', now());
  await intLog('instagram', 'ok', `Meta Ads: ${n} linha(s) de campanha/mês atualizadas (somente leitura).`);
  return n;
}

export async function adsSnapshots(periodo?: string): Promise<Row[]> {
  return q(`SELECT conta,campanha_id,campanha,periodo,gasto,impressoes,alcance,cliques,resultados,conversas,inicio,moeda,status,objetivo,orcamento_diario,atualizado_em FROM ads_snapshots ${periodo ? 'WHERE periodo=?' : ''} ORDER BY periodo DESC, gasto DESC LIMIT 1000`, periodo ? [periodo] : []);
}

// ---------- extras (somente leitura) ----------
const STATUS_CONTA: Record<number, string> = { 1: 'Ativa', 2: 'Desativada', 3: 'Pagamento pendente', 7: 'Em análise de risco', 8: 'Aguardando liquidação', 9: 'Período de carência', 100: 'Encerramento pendente', 101: 'Encerrada' };
export interface SaudeConta { status: number; rotulo: string; ok: boolean; gastoTotal: number; tetoGasto: number; moeda: string; forma: string; lidoEm: string }

async function adsSaudeConta(conta: string, moeda: string): Promise<void> {
  const r = await metaGet(`/act_${conta}`, { fields: 'account_status,disable_reason,spend_cap,amount_spent,currency,funding_source_details' });
  const status = Number(r.account_status ?? 0), mo = String(r.currency ?? moeda);
  const s: SaudeConta = {
    status, rotulo: STATUS_CONTA[status] ?? `Status ${status}`, ok: status === 1, gastoTotal: valorMenor(r.amount_spent, mo), tetoGasto: valorMenor(r.spend_cap, mo), moeda: mo,
    forma: String(r.funding_source_details?.display_string ?? '').slice(0, 80), lidoEm: now(),
  };
  await setSetting('ads_conta_saude', JSON.stringify(s));
}
export async function saudeConta(): Promise<SaudeConta | null> {
  try { return JSON.parse((await setting('ads_conta_saude')) || 'null'); } catch { return null; }
}

/** Gasto e resultados por dia da conta (últimos 30 dias, inclusive hoje). */
async function adsSyncDiario(conta: string, moeda: string): Promise<void> {
  const ate = fmtDate(new Date()), de = fmtDate(new Date(Date.now() - 29 * 86400000));
  const linhas = await paginar(`/act_${conta}/insights`, { level: 'account', fields: 'spend,impressions,clicks,actions,account_currency,date_start', time_increment: 1, time_range: JSON.stringify({ since: de, until: ate }), limit: 60 });
  for (const l of linhas) {
    const dia = String(l.date_start ?? '').slice(0, 10);
    if (!/^\d{4}-\d\d-\d\d$/.test(dia)) continue;
    const resultados = (Array.isArray(l.actions) ? l.actions : []).filter((a: Row) => RESULTADO.includes(String(a.action_type))).reduce((x: number, a: Row) => x + num(a.value), 0);
    await run('INSERT INTO ads_diario(conta,dia,gasto,impressoes,cliques,resultados,conversas,moeda,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE gasto=VALUES(gasto),impressoes=VALUES(impressoes),cliques=VALUES(cliques),resultados=VALUES(resultados),conversas=VALUES(conversas),moeda=VALUES(moeda),atualizado_em=VALUES(atualizado_em)',
      [conta, dia, num(l.spend), num(l.impressions), num(l.clicks), resultados, somaAcoes(l, CONVERSA), String(l.account_currency ?? moeda), now()]);
  }
}

/** Desempenho por anúncio no mês atual + anúncios com problema de aprovação (motivo informado pela Meta). */
async function adsSyncAnuncios(conta: string, moeda: string): Promise<void> {
  const lp = localParts(new Date()), per = `${lp.y}-${String(lp.m).padStart(2, '0')}`;
  const estado = new Map<string, Row>();
  for (const a of await paginar(`/act_${conta}/ads`, { fields: 'id,status,effective_status,issues_info,created_time,adset{status},campaign{status}', limit: 200 }, 6)) estado.set(String(a.id), a);
  const linhas = await paginar(`/act_${conta}/insights`, { level: 'ad', fields: 'ad_id,ad_name,campaign_name,spend,impressions,reach,clicks,actions,account_currency', time_range: JSON.stringify({ since: `${per}-01`, until: fmtDate(new Date()) }), limit: 200 }, 6);
  const vistos = new Set<string>();
  for (const l of linhas) {
    const id = String(l.ad_id ?? '');
    if (!id) continue;
    vistos.add(id);
    const st = estado.get(id) ?? {};
    const problema = (Array.isArray(st.issues_info) ? st.issues_info : []).map((i: Row) => String(i.error_summary ?? i.error_message ?? '')).filter(Boolean).join('; ').slice(0, 500);
    const resultados = (Array.isArray(l.actions) ? l.actions : []).filter((a: Row) => RESULTADO.includes(String(a.action_type))).reduce((x: number, a: Row) => x + num(a.value), 0);
    await run(`INSERT INTO ads_anuncios(conta,anuncio_id,periodo,anuncio,campanha,gasto,impressoes,alcance,cliques,resultados,conversas,inicio,moeda,status,problema,ativo,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE anuncio=VALUES(anuncio),campanha=VALUES(campanha),gasto=VALUES(gasto),impressoes=VALUES(impressoes),alcance=VALUES(alcance),cliques=VALUES(cliques),resultados=VALUES(resultados),conversas=VALUES(conversas),inicio=VALUES(inicio),moeda=VALUES(moeda),status=VALUES(status),problema=VALUES(problema),ativo=VALUES(ativo),atualizado_em=VALUES(atualizado_em)`,
      [conta, id, per, String(l.ad_name ?? '').slice(0, 250), String(l.campaign_name ?? '').slice(0, 200), num(l.spend), num(l.impressions), num(l.reach), num(l.clicks), resultados, somaAcoes(l, CONVERSA), String(st.created_time ?? '').slice(0, 40), String(l.account_currency ?? moeda), String(st.effective_status ?? '').slice(0, 40), problema, emVeiculacao(st) ? 1 : 0, now()]);
  }
  // anúncio com problema que ainda não gastou no mês também precisa aparecer
  for (const [id, st] of estado) {
    if (vistos.has(id) || !/DISAPPROVED|WITH_ISSUES/i.test(String(st.effective_status ?? ''))) continue;
    const problema = (Array.isArray(st.issues_info) ? st.issues_info : []).map((i: Row) => String(i.error_summary ?? '')).filter(Boolean).join('; ').slice(0, 500);
    await run("INSERT INTO ads_anuncios(conta,anuncio_id,periodo,anuncio,campanha,moeda,status,problema,ativo,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),problema=VALUES(problema),ativo=VALUES(ativo),atualizado_em=VALUES(atualizado_em)",
      [conta, id, per, `Anúncio ${id}`, '', moeda, String(st.effective_status).slice(0, 40), problema, emVeiculacao(st) ? 1 : 0, now()]);
  }
}

export async function adsDiario(dias = 30): Promise<Row[]> {
  return q('SELECT dia,gasto,impressoes,cliques,resultados,conversas,moeda FROM ads_diario WHERE dia>=? ORDER BY dia', [fmtDate(new Date(Date.now() - (dias - 1) * 86400000))]);
}
export async function adsAnuncios(periodo: string): Promise<Row[]> {
  return q('SELECT anuncio_id,anuncio,campanha,gasto,impressoes,alcance,cliques,resultados,conversas,inicio,moeda,status,problema,ativo FROM ads_anuncios WHERE periodo=? ORDER BY gasto DESC LIMIT 200', [periodo]);
}
