import { q, q1 } from '../db';
import { registrarNotificacao } from '../notificacoes';
import { setSetting, setting } from '../settings';
import { fmtDate, localParts, now, Row } from '../util';
import { metaGet } from './meta';
import { act, conferirObjeto } from './metaadsGerenciador';
import { gestaoPermitida } from './metaadsGestao';
import { adsPermitido, paginar, pacingMes, saudeConta } from './metaads';

/**
 * Análises do Tráfego Pago: série diária de um objeto, quebras (posicionamento, idade, gênero, região), públicos personalizados,
 * saúde da integração e limites de gasto configuráveis. Tudo lido da Meta (somente leitura); nada aqui altera anúncios.
 */
const num = (v: unknown) => Number(v ?? 0) || 0;
const acao = (l: Row, ...tipos: string[]) => (Array.isArray(l.actions) ? l.actions : []).filter((a: Row) => tipos.includes(String(a.action_type))).reduce((s: number, a: Row) => s + num(a.value), 0);
const YMD = /^\d{4}-\d\d-\d\d$/;
const faixa = (de: string, ate: string) => { if (!YMD.test(de) || !YMD.test(ate) || de > ate) throw new Error('Período inválido.'); return JSON.stringify({ since: de, until: ate }); };

/** Série diária de uma campanha, conjunto ou anúncio da conta escolhida. Dias sem entrega vêm sem linha (a Meta não os devolve). */
export async function serieObjeto(id: string, de: string, ate: string): Promise<Row[]> {
  const { id: conta } = await act();
  await conferirObjeto(id, conta, '');
  const linhas = await paginar(`/${id}/insights`, { fields: 'spend,impressions,reach,clicks,actions', time_increment: 1, time_range: faixa(de, ate), limit: 100 }, 6);
  return linhas.map((l) => ({ dia: String(l.date_start), gasto: num(l.spend), impressoes: num(l.impressions), alcance: num(l.reach), cliques: num(l.clicks), conversas: acao(l, 'onsite_conversion.messaging_conversation_started_7d'), leads: acao(l, 'lead', 'onsite_conversion.lead_grouped') })).sort((a, b) => a.dia.localeCompare(b.dia));
}

const POR = new Set(['publisher_platform', 'platform_position', 'age', 'gender', 'region', 'device_platform']);
/** Distribuição do investimento e dos resultados da conta por uma dimensão (somente as que a Meta oferece em /insights). */
export async function quebra(por: string, de: string, ate: string): Promise<Row[]> {
  const dims = por.split(',').map((x) => x.trim());
  if (!dims.length || dims.length > 2 || !dims.every((d) => POR.has(d))) throw new Error('Dimensão não permitida.');
  const { id: conta } = await act();
  const linhas = await paginar(`/act_${conta}/insights`, { level: 'account', fields: 'spend,impressions,reach,clicks,actions', breakdowns: dims.join(','), time_range: faixa(de, ate), limit: 200 }, 4);
  return linhas.map((l) => ({ chave: dims.map((d) => String(l[d] ?? '')).join(' · '), gasto: num(l.spend), impressoes: num(l.impressions), alcance: num(l.reach), cliques: num(l.clicks), conversas: acao(l, 'onsite_conversion.messaging_conversation_started_7d'), leads: acao(l, 'lead', 'onsite_conversion.lead_grouped') })).sort((a, b) => b.gasto - a.gasto);
}

/** Públicos personalizados e semelhantes da conta (só se a Meta liberar a leitura). Não traz nenhuma pessoa, só nome, tipo e tamanho aproximado. */
export async function publicosConta(): Promise<Row[]> {
  const { id: conta } = await act();
  const l = await paginar(`/act_${conta}/customaudiences`, { fields: 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,time_updated', limit: 100 }, 3);
  return l.map((a) => ({ id: String(a.id), nome: String(a.name ?? ''), tipo: String(a.subtype ?? ''), minimo: a.approximate_count_lower_bound ?? null, maximo: a.approximate_count_upper_bound ?? null, status: String(a.delivery_status?.description ?? a.delivery_status?.code ?? ''), atualizado: a.time_updated ? new Date(Number(a.time_updated) * 1000).toISOString() : '' }));
}

/** Saúde da integração com a Meta para anúncios: conta, permissões, última sincronização, falhas recentes e o que está liberado ou bloqueado. */
export async function saudeMeta(): Promise<Row> {
  const conta = await setting('meta_ads_conta');
  const token = (await setting('meta_token_invalido')) === '1';
  let leitura = false, gestao = false;
  try { leitura = await adsPermitido(); gestao = await gestaoPermitida(); } catch { /* sem Meta */ }
  const modoCompleto = (await setting('trafego_gestao')) === '1';
  const sc = await saudeConta().catch(() => null);
  const falhas = await q("SELECT quando,servico,msg AS mensagem FROM integration_log WHERE nivel='erro' ORDER BY id DESC LIMIT 5").catch(() => []);
  const permitidas = ['Ler campanhas, conjuntos, anúncios e métricas'];
  const bloqueadas: string[] = [];
  if (gestao && modoCompleto) permitidas.push('Criar, editar, duplicar, pausar e ativar (modo completo ligado)');
  else bloqueadas.push(!gestao ? 'Criar e editar anúncios: falta a permissão ads_management (reconecte a Meta)' : 'Criar e editar anúncios: o modo completo está desligado em Configurações → Integrações');
  if (!leitura) { bloqueadas.push('Leitura de anúncios: falta a permissão ads_read'); permitidas.length = 0; }
  return {
    conectado: !!conta && !token, conta, token, estadoConta: sc ? { rotulo: sc.rotulo, ok: sc.ok } : null,
    permissoes: [{ nome: 'ads_read', ok: leitura, para: 'Ler anúncios e métricas' }, { nome: 'ads_management', ok: gestao, para: 'Criar, editar, pausar e ativar anúncios' }],
    modoCompleto, ultimaSync: await setting('meta_ads_ultima_sync'), falhasRecentes: falhas, permitidas, bloqueadas,
  };
}

// ---------- limites de gasto configuráveis (ex.: avisar quando o investimento do dia chegar a R$ 20) ----------
export interface LimiteGasto { id: string; nome: string; escopo: 'conta' | 'campanha'; alvoId: string; alvoNome: string; periodo: 'dia' | 'mes'; tipo: 'valor' | 'percentual'; valor: number; ativo: boolean }
export async function limitesGasto(): Promise<LimiteGasto[]> {
  try { const l = JSON.parse((await setting('ads_limites_gasto')) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
export async function salvarLimitesGasto(lista: unknown): Promise<LimiteGasto[]> {
  if (!Array.isArray(lista) || lista.length > 50) throw new Error('Lista de limites inválida (até 50 regras).');
  const out: LimiteGasto[] = lista.map((x: Row, i) => {
    const valor = Number(x.valor);
    if (!Number.isFinite(valor) || valor <= 0 || valor > 1_000_000) throw new Error(`Regra ${i + 1}: informe um valor entre 0,01 e 1.000.000.`);
    const tipo = x.tipo === 'percentual' ? 'percentual' : 'valor';
    if (tipo === 'percentual' && valor > 1000) throw new Error(`Regra ${i + 1}: o percentual passa de 1000%.`);
    const escopo = x.escopo === 'campanha' ? 'campanha' : 'conta';
    const periodo = x.periodo === 'dia' ? 'dia' : 'mes';
    if (escopo === 'campanha' && periodo === 'dia') throw new Error(`Regra ${i + 1}: o gasto diário por campanha ainda não é lido; use o período do mês.`);
    if (escopo === 'conta' && tipo === 'percentual' && periodo === 'dia') throw new Error(`Regra ${i + 1}: percentual vale sobre o orçamento mensal; use o período do mês.`);
    return { id: String(x.id || `L${Date.now().toString(36)}${i}`).slice(0, 24), nome: String(x.nome || '').slice(0, 80) || 'Limite de investimento', escopo, alvoId: escopo === 'campanha' ? String(x.alvoId || '').slice(0, 40) : '', alvoNome: String(x.alvoNome || '').slice(0, 120), periodo, tipo, valor, ativo: x.ativo !== false };
  });
  await setSetting('ads_limites_gasto', JSON.stringify(out));
  return out;
}
/** Gasto atual de cada limite e se já passou (usado na tela e no cron; cada aviso sai uma vez por regra e por dia ou mês). */
export async function avaliarLimitesGasto(notificar = false): Promise<Row[]> {
  const hoje = fmtDate(new Date()), lp = localParts(new Date()), per = `${lp.y}-${String(lp.m).padStart(2, '0')}`;
  const orcMes = Number(await setting('ads_orcamento_mensal')) || 0;
  const out: Row[] = [];
  for (const l of await limitesGasto()) {
    let gasto: number | null = null, base = l.valor;
    if (l.escopo === 'conta') {
      const r = l.periodo === 'dia' ? await q1('SELECT COUNT(*) n, COALESCE(SUM(gasto),0) g FROM ads_diario WHERE dia=?', [hoje]) : await q1('SELECT COUNT(*) n, COALESCE(SUM(gasto),0) g FROM ads_diario WHERE dia LIKE ?', [per + '%']);
      gasto = num(r?.n) > 0 ? num(r?.g) : null;
      if (l.tipo === 'percentual') base = orcMes ? (orcMes * l.valor) / 100 : NaN;
    } else {
      const r = await q1('SELECT gasto FROM ads_snapshots WHERE campanha_id=? AND periodo=?', [l.alvoId, per]);
      gasto = r ? num(r.gasto) : null;
    }
    const chega = gasto !== null && Number.isFinite(base) && gasto >= base;
    out.push({ ...l, gasto, limite: Number.isFinite(base) ? base : null, atingido: chega, progresso: gasto !== null && Number.isFinite(base) && base > 0 ? gasto / base : null, semOrcamento: l.tipo === 'percentual' && !orcMes });
    if (notificar && l.ativo && chega) {
      const chave = `limite|${l.id}|${l.periodo === 'dia' ? hoje : per}`;
      if (!(await q1("SELECT 1 FROM notifications WHERE tipo='ads_limite' AND registro=?", [chave])))
        await registrarNotificacao('ads_limite', 'gerencia', `Tráfego: investimento chegou ao limite "${l.nome}"`, `Gasto de ${gasto!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (limite: ${base.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) ${l.periodo === 'dia' ? 'hoje' : 'neste mês'}${l.escopo === 'campanha' ? ` na campanha ${l.alvoNome}` : ' na conta'}. Nada foi alterado nos anúncios.`, 'trafego', chave);
    }
  }
  return out;
}
export { pacingMes, now };
