import { q, run } from '../db';
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

async function paginar(path: string, params: Row, max = 5): Promise<Row[]> {
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
  for (const c of await paginar(`/${act}/campaigns`, { fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget', limit: 100 })) campanhas.set(String(c.id), c);
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
      await run(
        `INSERT INTO ads_snapshots(conta,campanha_id,campanha,periodo,gasto,impressoes,alcance,cliques,resultados,moeda,status,objetivo,orcamento_diario,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE campanha=VALUES(campanha),gasto=VALUES(gasto),impressoes=VALUES(impressoes),alcance=VALUES(alcance),cliques=VALUES(cliques),resultados=VALUES(resultados),moeda=VALUES(moeda),status=VALUES(status),objetivo=VALUES(objetivo),orcamento_diario=VALUES(orcamento_diario),atualizado_em=VALUES(atualizado_em)`,
        [conta, String(l.campaign_id), String(l.campaign_name ?? camp.name ?? '').slice(0, 200), per, num(l.spend), num(l.impressions), num(l.reach), num(l.clicks), resultados, mo, String(camp.effective_status ?? camp.status ?? ''), String(camp.objective ?? ''), valorMenor(camp.daily_budget, mo), now()],
      );
      n++;
    }
  }
  await setSetting('meta_ads_ultima_sync', now());
  await intLog('instagram', 'ok', `Meta Ads: ${n} linha(s) de campanha/mês atualizadas (somente leitura).`);
  return n;
}

export async function adsSnapshots(periodo?: string): Promise<Row[]> {
  return q(`SELECT conta,campanha_id,campanha,periodo,gasto,impressoes,alcance,cliques,resultados,moeda,status,objetivo,orcamento_diario,atualizado_em FROM ads_snapshots ${periodo ? 'WHERE periodo=?' : ''} ORDER BY periodo DESC, gasto DESC LIMIT 1000`, periodo ? [periodo] : []);
}
