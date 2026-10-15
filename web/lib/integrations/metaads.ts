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
  // Extras (saúde da conta, gasto por dia, anúncios): falhar aqui não pode derrubar a leitura principal.
  for (const [nome, fn] of [['saúde da conta', () => adsSaudeConta(conta, moeda)], ['gasto por dia', () => adsSyncDiario(conta, moeda)], ['anúncios', () => adsSyncAnuncios(conta, moeda)]] as const) {
    try { await fn(); } catch (e: any) {
      if ((await setting('meta_token_invalido')) === '1') throw e;
      await intLog('instagram', 'aviso', `Meta Ads (${nome}): ${String(e.message).slice(0, 160)}`);
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
  return [...out, ...(await alertasExtras())];
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
    await run('INSERT INTO ads_diario(conta,dia,gasto,impressoes,cliques,resultados,moeda,atualizado_em) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE gasto=VALUES(gasto),impressoes=VALUES(impressoes),cliques=VALUES(cliques),resultados=VALUES(resultados),moeda=VALUES(moeda),atualizado_em=VALUES(atualizado_em)',
      [conta, dia, num(l.spend), num(l.impressions), num(l.clicks), resultados, String(l.account_currency ?? moeda), now()]);
  }
}

/** Desempenho por anúncio no mês atual + anúncios com problema de aprovação (motivo informado pela Meta). */
async function adsSyncAnuncios(conta: string, moeda: string): Promise<void> {
  const lp = localParts(new Date()), per = `${lp.y}-${String(lp.m).padStart(2, '0')}`;
  const estado = new Map<string, Row>();
  for (const a of await paginar(`/act_${conta}/ads`, { fields: 'id,effective_status,issues_info', limit: 200 }, 6)) estado.set(String(a.id), a);
  const linhas = await paginar(`/act_${conta}/insights`, { level: 'ad', fields: 'ad_id,ad_name,campaign_name,spend,impressions,reach,clicks,actions,account_currency', time_range: JSON.stringify({ since: `${per}-01`, until: fmtDate(new Date()) }), limit: 200 }, 6);
  const vistos = new Set<string>();
  for (const l of linhas) {
    const id = String(l.ad_id ?? '');
    if (!id) continue;
    vistos.add(id);
    const st = estado.get(id) ?? {};
    const problema = (Array.isArray(st.issues_info) ? st.issues_info : []).map((i: Row) => String(i.error_summary ?? i.error_message ?? '')).filter(Boolean).join('; ').slice(0, 500);
    const resultados = (Array.isArray(l.actions) ? l.actions : []).filter((a: Row) => RESULTADO.includes(String(a.action_type))).reduce((x: number, a: Row) => x + num(a.value), 0);
    await run(`INSERT INTO ads_anuncios(conta,anuncio_id,periodo,anuncio,campanha,gasto,impressoes,alcance,cliques,resultados,moeda,status,problema,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE anuncio=VALUES(anuncio),campanha=VALUES(campanha),gasto=VALUES(gasto),impressoes=VALUES(impressoes),alcance=VALUES(alcance),cliques=VALUES(cliques),resultados=VALUES(resultados),moeda=VALUES(moeda),status=VALUES(status),problema=VALUES(problema),atualizado_em=VALUES(atualizado_em)`,
      [conta, id, per, String(l.ad_name ?? '').slice(0, 250), String(l.campaign_name ?? '').slice(0, 200), num(l.spend), num(l.impressions), num(l.reach), num(l.clicks), resultados, String(l.account_currency ?? moeda), String(st.effective_status ?? '').slice(0, 40), problema, now()]);
  }
  // anúncio com problema que ainda não gastou no mês também precisa aparecer
  for (const [id, st] of estado) {
    if (vistos.has(id) || !/DISAPPROVED|WITH_ISSUES/i.test(String(st.effective_status ?? ''))) continue;
    const problema = (Array.isArray(st.issues_info) ? st.issues_info : []).map((i: Row) => String(i.error_summary ?? '')).filter(Boolean).join('; ').slice(0, 500);
    await run("INSERT INTO ads_anuncios(conta,anuncio_id,periodo,anuncio,campanha,moeda,status,problema,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),problema=VALUES(problema),atualizado_em=VALUES(atualizado_em)",
      [conta, id, per, `Anúncio ${id}`, '', moeda, String(st.effective_status).slice(0, 40), problema, now()]);
  }
}

export async function adsDiario(dias = 30): Promise<Row[]> {
  return q('SELECT dia,gasto,impressoes,cliques,resultados,moeda FROM ads_diario WHERE dia>=? ORDER BY dia', [fmtDate(new Date(Date.now() - (dias - 1) * 86400000))]);
}
export async function adsAnuncios(periodo: string): Promise<Row[]> {
  return q('SELECT anuncio_id,anuncio,campanha,gasto,impressoes,alcance,cliques,resultados,moeda,status,problema FROM ads_anuncios WHERE periodo=? ORDER BY gasto DESC LIMIT 200', [periodo]);
}

/** Orçamento do mês (informado pela Gerência) × gasto acumulado, com projeção linear até o fim do mês. */
export async function pacingMes(): Promise<{ orcamento: number; gasto: number; projecao: number; diasPassados: number; diasMes: number; moeda: string } | null> {
  const orc = Number(await setting('ads_orcamento_mensal'));
  if (!Number.isFinite(orc) || orc <= 0) return null;
  const lp = localParts(new Date()), per = `${lp.y}-${String(lp.m).padStart(2, '0')}`;
  const r = await q1('SELECT COALESCE(SUM(gasto),0) g, MAX(moeda) m FROM ads_snapshots WHERE periodo=?', [per]);
  const gasto = Number(r?.g ?? 0), diasMes = new Date(lp.y, lp.m, 0).getDate(), diasPassados = Math.max(1, lp.d);
  return { orcamento: orc, gasto, projecao: Math.round((gasto / diasPassados) * diasMes * 100) / 100, diasPassados, diasMes, moeda: String(r?.m ?? '') };
}

/** Alertas de conta, orçamento, entrega e anúncios (regras objetivas; cada mensagem cita o número que a gerou). */
export async function alertasExtras(): Promise<AlertaTrafego[]> {
  const out: AlertaTrafego[] = [];
  const lp = localParts(new Date()), per = `${lp.y}-${String(lp.m).padStart(2, '0')}`;
  const add = (chave: string, regra: string, severidade: 'atencao' | 'critico', mensagem: string, campanha = 'Conta de anúncios') => out.push({ chave: `${chave}|${per}`, campanha_id: '', campanha, periodo: per, regra, severidade, mensagem });
  const saude = await saudeConta();
  if (saude && !saude.ok) add('conta-status', 'Conta de anúncios com problema', 'critico', `A Meta informa a conta como "${saude.rotulo}". Os anúncios podem parar de rodar: confira no Gerenciador de Anúncios.`);
  if (saude && saude.tetoGasto > 0 && saude.gastoTotal / saude.tetoGasto >= 0.9) add('conta-teto', 'Teto de gasto da conta perto do fim', 'atencao', `A conta já usou ${Math.round((saude.gastoTotal / saude.tetoGasto) * 100)}% do limite de gasto definido na Meta.`);
  const pc = await pacingMes();
  if (pc) {
    if (pc.gasto >= pc.orcamento) add('orc-estourou', 'Orçamento do mês estourado', 'critico', `Gasto de ${pc.gasto.toFixed(2)} já passou do orçamento do mês (${pc.orcamento.toFixed(2)}).`);
    else if (pc.diasPassados >= 5 && pc.projecao > pc.orcamento * 1.05) add('orc-projecao', 'Ritmo de gasto acima do orçamento', 'atencao', `No ritmo atual, o mês fecha em ${pc.projecao.toFixed(2)}, acima do orçamento de ${pc.orcamento.toFixed(2)} (gasto até hoje: ${pc.gasto.toFixed(2)}).`);
  }
  // entrega parada: os 3 últimos dias fechados sem gasto, mas a semana anterior teve gasto e há campanha ativa
  const dias = await adsDiario(14), hoje = fmtDate(new Date());
  const fechados = dias.filter((d) => String(d.dia) < hoje).slice(-10);
  if (fechados.length >= 6) {
    const ult3 = fechados.slice(-3), ant = fechados.slice(0, -3);
    const ativa = await q1("SELECT 1 FROM ads_snapshots WHERE periodo=(SELECT MAX(periodo) FROM ads_snapshots) AND status='ACTIVE' LIMIT 1");
    if (ativa && ult3.every((d) => Number(d.gasto) === 0) && ant.reduce((s, d) => s + Number(d.gasto), 0) > 0) add('entrega-parou', 'Entrega parou', 'critico', 'Os 3 últimos dias fechados não tiveram gasto, mas há campanha ativa e a semana anterior gastou. Verifique pagamento, aprovação e orçamento.');
  }
  // custo por resultado subindo: últimos 7 dias fechados contra os 7 anteriores
  if (fechados.length >= 10) {
    const u7 = dias.filter((d) => String(d.dia) < hoje).slice(-7), a7 = dias.filter((d) => String(d.dia) < hoje).slice(-14, -7);
    const sm = (l: Row[], k: string) => l.reduce((s, d) => s + Number(d[k]), 0);
    if (a7.length === 7 && sm(u7, 'resultados') > 0 && sm(a7, 'resultados') > 0) {
      const cu = sm(u7, 'gasto') / sm(u7, 'resultados'), ca = sm(a7, 'gasto') / sm(a7, 'resultados');
      if (cu > ca * 1.4 && sm(u7, 'gasto') >= 30) add('custo-sobe', 'Custo por resultado subindo', 'atencao', `O custo por resultado dos últimos 7 dias (${cu.toFixed(2)}) está ${Math.round((cu / ca - 1) * 100)}% acima da semana anterior (${ca.toFixed(2)}). Veja em Tráfego → Gerenciador → Comparar anúncios.`);
    }
  }
  // anúncios com problema, agrupados pelo motivo (um aviso por motivo, com a lista dos anúncios)
  const grupos = new Map<string, string[]>();
  for (const a of await adsAnuncios(per)) {
    if (!/DISAPPROVED|WITH_ISSUES/i.test(String(a.status))) continue;
    const motivo = String(a.problema || 'A Meta informa ' + a.status + '.').trim();
    (grupos.get(motivo) ?? grupos.set(motivo, []).get(motivo)!).push(String(a.anuncio));
  }
  for (const [motivo, nomes] of grupos) {
    const lista = nomes.slice(0, 5).join(', ') + (nomes.length > 5 ? ` e mais ${nomes.length - 5}` : '');
    add(`anuncio-${sha256(motivo).slice(0, 12)}`, 'Anúncio com problema', 'critico', `${nomes.length} anúncio(s): ${motivo.replace(/\.$/, '')}. Confira no Gerenciador de Anúncios.`, lista);
  }
  return out;
}
