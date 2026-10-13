import { q, q1, run } from '../db';
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
      const statusNovo = String(camp.effective_status ?? camp.status ?? '');
      const anterior = await q1('SELECT status FROM ads_snapshots WHERE conta=? AND campanha_id=? ORDER BY periodo DESC LIMIT 1', [conta, String(l.campaign_id)]);
      if (anterior && String(anterior.status) !== statusNovo && statusNovo) {
        const problema = /DISAPPROVED|WITH_ISSUES|PENDING_REVIEW|ERROR/i.test(statusNovo);
        await registrarNotificacao('ads_status', 'gerencia', problema ? 'Campanha com problema na Meta' : 'Status de campanha mudou na Meta', `"${String(l.campaign_name ?? camp.name ?? '')}": ${String(anterior.status) || '—'} → ${statusNovo}. O EVO MKT só lê; a decisão é no Gerenciador de Anúncios.`, 'trafego', String(l.campaign_id));
      }
      await run(
        `INSERT INTO ads_snapshots(conta,campanha_id,campanha,periodo,gasto,impressoes,alcance,cliques,resultados,moeda,status,objetivo,orcamento_diario,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE campanha=VALUES(campanha),gasto=VALUES(gasto),impressoes=VALUES(impressoes),alcance=VALUES(alcance),cliques=VALUES(cliques),resultados=VALUES(resultados),moeda=VALUES(moeda),status=VALUES(status),objetivo=VALUES(objetivo),orcamento_diario=VALUES(orcamento_diario),atualizado_em=VALUES(atualizado_em)`,
        [conta, String(l.campaign_id), String(l.campaign_name ?? camp.name ?? '').slice(0, 200), per, num(l.spend), num(l.impressions), num(l.reach), num(l.clicks), resultados, mo, String(camp.effective_status ?? camp.status ?? ''), String(camp.objective ?? ''), valorMenor(camp.daily_budget, mo), now()],
      );
      n++;
    }
  }
  await setSetting('meta_ads_ultima_sync', now());
  await notificarAlertasTrafego();
  await intLog('instagram', 'ok', `Meta Ads: ${n} linha(s) de campanha/mês atualizadas (somente leitura).`);
  return n;
}

export async function adsSnapshots(periodo?: string): Promise<Row[]> {
  return q(`SELECT conta,campanha_id,campanha,periodo,gasto,impressoes,alcance,cliques,resultados,moeda,status,objetivo,orcamento_diario,atualizado_em FROM ads_snapshots ${periodo ? 'WHERE periodo=?' : ''} ORDER BY periodo DESC, gasto DESC LIMIT 1000`, periodo ? [periodo] : []);
}

// ---------- alertas (regras objetivas, com limites visíveis e ajustáveis; só disparam com dados suficientes) ----------
export const LIMITES_PADRAO = { ctrMin: 0.9, frequenciaMax: 3.5, gastoSemResultado: 100, impressoesMin: 1000 };
export async function limitesAlerta() {
  const g = async (k: string, d: number) => { const v = Number(await setting(k)); return Number.isFinite(v) && v > 0 ? v : d; };
  return { ctrMin: await g('ads_ctr_min', LIMITES_PADRAO.ctrMin), frequenciaMax: await g('ads_freq_max', LIMITES_PADRAO.frequenciaMax), gastoSemResultado: await g('ads_gasto_sem_resultado', LIMITES_PADRAO.gastoSemResultado), impressoesMin: await g('ads_impr_min', LIMITES_PADRAO.impressoesMin) };
}
export interface AlertaTrafego { chave: string; campanha_id: string; campanha: string; periodo: string; regra: string; severidade: 'atencao' | 'critico'; mensagem: string }
const OBJETIVOS_COM_RESULTADO = /LEADS|SALES|CONVERSIONS|MESSAGES|ENGAGEMENT_MESSAGES/i;

/** Alertas do período mais recente de cada campanha. Cada regra cita o número que a disparou e o limite. */
export async function alertasTrafego(): Promise<AlertaTrafego[]> {
  const lim = await limitesAlerta();
  const rows = await q('SELECT campanha_id,campanha,periodo,gasto,impressoes,alcance,cliques,resultados,moeda,status,objetivo FROM ads_snapshots WHERE periodo=(SELECT MAX(periodo) FROM ads_snapshots)');
  const out: AlertaTrafego[] = [];
  const comCliques = rows.filter((r) => Number(r.impressoes) >= lim.impressoesMin && Number(r.cliques) > 0);
  const cpcs = comCliques.map((r) => ({ id: r.campanha_id, cpc: Number(r.gasto) / Number(r.cliques) }));
  for (const r of rows) {
    const imp = Number(r.impressoes), cli = Number(r.cliques), gasto = Number(r.gasto), alc = Number(r.alcance), res = Number(r.resultados);
    const add = (regra: string, severidade: 'atencao' | 'critico', mensagem: string) => out.push({ chave: `${r.campanha_id}|${regra}|${r.periodo}`, campanha_id: String(r.campanha_id), campanha: String(r.campanha), periodo: String(r.periodo), regra, severidade, mensagem });
    if (imp >= lim.impressoesMin) {
      const ctr = (cli / imp) * 100;
      if (ctr < lim.ctrMin) add('CTR baixo', 'atencao', `CTR de ${ctr.toFixed(2)}% com ${imp.toLocaleString('pt-BR')} impressões (limite: ${lim.ctrMin}%). Criativo ou público podem estar fracos.`);
      if (alc > 0 && imp / alc > lim.frequenciaMax) add('Frequência alta', 'atencao', `Frequência de ${(imp / alc).toFixed(1)} no período (limite: ${lim.frequenciaMax}). O público já viu o anúncio muitas vezes.`);
    }
    if (OBJETIVOS_COM_RESULTADO.test(String(r.objetivo)) && gasto >= lim.gastoSemResultado && res === 0) add('Gasto sem resultado', 'critico', `Gasto de ${gasto.toLocaleString('pt-BR', { style: 'currency', currency: r.moeda || 'BRL' })} sem nenhum lead/conversa registrado (limite: ${lim.gastoSemResultado}). Confira formulário, destino e rastreamento.`);
    if (cpcs.length >= 3 && imp >= lim.impressoesMin && cli > 0) {
      const outros = cpcs.filter((c) => c.id !== r.campanha_id).map((c) => c.cpc);
      const media = outros.reduce((a, b) => a + b, 0) / outros.length;
      if (outros.length >= 2 && gasto / cli > 2 * media) add('CPC acima do normal', 'atencao', `CPC de ${(gasto / cli).toFixed(2)} é mais que o dobro da média das outras campanhas (${media.toFixed(2)}).`);
    }
    if (/DISAPPROVED|WITH_ISSUES/i.test(String(r.status))) add('Problema de aprovação', 'critico', `A Meta informa o status ${r.status}. Veja o motivo no Gerenciador de Anúncios.`);
  }
  return out;
}

/** Avisa a Gerência (uma vez por campanha, regra e mês) sobre alertas novos. */
export async function notificarAlertasTrafego(): Promise<number> {
  let n = 0;
  for (const a of await alertasTrafego()) {
    if (await q1("SELECT 1 FROM notifications WHERE tipo='ads_alerta' AND registro=?", [a.chave])) continue;
    await registrarNotificacao('ads_alerta', 'gerencia', `Tráfego: ${a.regra} em "${a.campanha}"`, a.mensagem, 'trafego', a.chave);
    n++;
  }
  return n;
}
