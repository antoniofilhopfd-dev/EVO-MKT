import { q, run } from '../db';
import { notifyMail } from '../mail';
import { registrarNotificacao } from '../notificacoes';
import { intLog, setting } from '../settings';
import { fmtDate, now, parseLocal, Row } from '../util';
import { ContaAds, paginar } from './metaads';
import { cfgGestao, resolverCidade } from './metaadsGestao';
import { metaConnected, metaGet, metaPost } from './meta';
import { aplicarPosicoes } from './metaadsCampanha';

/**
 * Gerenciador de Anúncios (Etapa A): lê TODA a conta (campanhas, conjuntos e anúncios, não só o que o sistema lançou) e permite editar.
 * Só a Gerência chega aqui. Toda alteração é conferida (o objeto precisa ser da conta escolhida), respeita os tetos e fica em ads_acoes.
 */
export type Nivel = 'campanha' | 'conjunto' | 'anuncio';
const num = (v: unknown) => Number(v ?? 0) || 0;
const SEM_CENTAVOS = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD']);
const deMenor = (v: unknown, m: string) => (v === undefined || v === null || v === '' ? 0 : Number(v) / (SEM_CENTAVOS.has(m) ? 1 : 100));
const paraMenor = (v: number, m: string) => String(Math.round(v * (SEM_CENTAVOS.has(m) ? 1 : 100)));
const ATIVOS = ['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'WITH_ISSUES', 'IN_PROCESS', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'PENDING_BILLING_INFO'];

export const act = async () => {
  if (!(await metaConnected())) throw new Error('Instagram/Meta não conectado.');
  const id = await setting('meta_ads_conta');
  if (!id) throw new Error('Escolha a conta de anúncios em Integrações.');
  const info = (JSON.parse((await setting('meta_ads_contas')) || '[]') as ContaAds[]).find((c) => c.id === id);
  return { id, moeda: info?.moeda || 'BRL' };
};

/** Resultado de cada objetivo (o que a Meta chama de "resultado" no Gerenciador). */
export function resultadoDe(objetivo: string, goal: string, actions: Row[], alcance: number): { valor: number; rotulo: string } {
  const soma = (...tipos: string[]) => (actions ?? []).filter((a) => tipos.includes(String(a.action_type))).reduce((s, a) => s + num(a.value), 0);
  const o = String(objetivo).toUpperCase(), g = String(goal).toUpperCase();
  if (g === 'CONVERSATIONS' || o === 'OUTCOME_ENGAGEMENT' && /CONVERSATION/.test(g)) return { valor: soma('onsite_conversion.messaging_conversation_started_7d'), rotulo: 'Conversas' };
  if (o === 'OUTCOME_LEADS') return { valor: soma('lead', 'onsite_conversion.lead_grouped', 'onsite_conversion.messaging_conversation_started_7d'), rotulo: 'Leads' };
  if (o === 'OUTCOME_TRAFFIC') return { valor: soma(g === 'LANDING_PAGE_VIEWS' ? 'landing_page_view' : 'link_click'), rotulo: g === 'LANDING_PAGE_VIEWS' ? 'Visualizações da página' : 'Cliques no link' };
  if (o === 'OUTCOME_AWARENESS') return { valor: alcance, rotulo: 'Alcance' };
  if (o === 'OUTCOME_SALES') return { valor: soma('purchase', 'offsite_conversion.fb_pixel_purchase'), rotulo: 'Compras' };
  if (o === 'OUTCOME_APP_PROMOTION') return { valor: soma('mobile_app_install', 'app_install'), rotulo: 'Instalações' };
  if (o === 'OUTCOME_ENGAGEMENT') return { valor: soma('post_engagement', 'page_engagement'), rotulo: 'Engajamentos' };
  return { valor: 0, rotulo: 'Resultados' };
}

const ins = (l: Row) => ({ gasto: num(l.spend), impressoes: num(l.impressions), alcance: num(l.reach), cliques: num(l.clicks), actions: Array.isArray(l.actions) ? l.actions : [] });
const metricas = (i: ReturnType<typeof ins> | undefined, objetivo: string, goal: string) => {
  const x = i ?? { gasto: 0, impressoes: 0, alcance: 0, cliques: 0, actions: [] };
  const r = resultadoDe(objetivo, goal, x.actions, x.alcance);
  const soma = (...t: string[]) => x.actions.filter((a: Row) => t.includes(String(a.action_type))).reduce((s: number, a: Row) => s + num(a.value), 0);
  const conversas = soma('onsite_conversion.messaging_conversation_started_7d'), leads = soma('lead', 'onsite_conversion.lead_grouped');
  return { gasto: x.gasto, impressoes: x.impressoes, alcance: x.alcance, frequencia: x.alcance ? x.impressoes / x.alcance : 0, cliques: x.cliques, ctr: x.impressoes ? (x.cliques / x.impressoes) * 100 : 0, cpc: x.cliques ? x.gasto / x.cliques : 0, cpm: x.impressoes ? (x.gasto / x.impressoes) * 1000 : 0, conversas, custoConversa: conversas ? x.gasto / conversas : null, leads, cpl: leads ? x.gasto / leads : null, resultados: r.valor, rotuloResultado: r.rotulo, custoResultado: r.valor ? x.gasto / r.valor : null };
};

/** Criativo do anúncio como a Meta devolve (nada inventado): textos, botão, formato, link e perfil/Página usados. */
function criativoDe(c: Row | undefined) {
  const cr: Row = c ?? {};
  const spec: Row = cr.object_story_spec ?? {};
  const link: Row = spec.link_data ?? spec.video_data ?? spec.photo_data ?? {};
  const url = String(link.link ?? link.call_to_action?.value?.link ?? '');
  const tipo = String(cr.object_type ?? '');
  return {
    id: String(cr.id ?? ''),
    titulo: String(cr.title ?? link.name ?? link.title ?? '').slice(0, 200), texto: String(cr.body ?? link.message ?? '').slice(0, 1000), descricao: String(link.description ?? '').slice(0, 300),
    cta: String(cr.call_to_action_type ?? link.call_to_action?.type ?? ''), formato: /VIDEO/i.test(tipo) || spec.video_data ? 'Vídeo' : /PHOTO|SHARE|STATUS/i.test(tipo) || spec.link_data || spec.photo_data ? 'Imagem' : tipo,
    url: /^https?:\/\//.test(url) ? url.slice(0, 500) : '', instagram: /^https:\/\//.test(String(cr.instagram_permalink_url ?? '')) ? String(cr.instagram_permalink_url) : '', paginaId: String(spec.page_id ?? ''), instagramId: String(spec.instagram_actor_id ?? spec.instagram_user_id ?? ''),
  };
}
const PREFIXO: Record<Nivel, string> = { campanha: 'CAM', conjunto: 'CJ', anuncio: 'AN' };
/** Código interno do EVO MKT (CAM-0001, CJ-0001, AN-0001) para cada objeto da Meta, estável entre leituras. Os IDs da Meta não mudam. */
export async function codigosInternos(itens: { id: string; nivel: Nivel }[]): Promise<Map<string, string>> {
  const m = new Map<string, string>((await q('SELECT meta_id,codigo FROM ads_ids')).map((r) => [String(r.meta_id), String(r.codigo)]));
  for (const nivel of ['campanha', 'conjunto', 'anuncio'] as Nivel[]) {
    const novos = itens.filter((i) => i.nivel === nivel && !m.has(i.id));
    if (!novos.length) continue;
    let n = Number((await q("SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(codigo,'-',-1) AS UNSIGNED)),0) n FROM ads_ids WHERE nivel=?", [nivel]))[0]?.n ?? 0);
    for (const it of novos) {
      const codigo = `${PREFIXO[nivel]}-${String(++n).padStart(4, '0')}`;
      await run('INSERT IGNORE INTO ads_ids(meta_id,nivel,codigo,criado_em) VALUES(?,?,?,?)', [it.id, nivel, codigo, now()]);
      m.set(it.id, codigo);
    }
  }
  return m;
}
export async function vincularConteudo(adId: string, conteudoId: string, quem: string): Promise<void> {
  if (!/^[A-Za-z0-9_]{2,40}$/.test(adId)) throw new Error('Anúncio inválido.');
  if (!conteudoId) { await run('DELETE FROM ads_vinculos WHERE ad_id=?', [adId]); return; }
  if (!(await q('SELECT 1 FROM records WHERE modulo=? AND id=?', ['conteudos', conteudoId])).length) throw new Error('Conteúdo não encontrado.');
  await run('INSERT INTO ads_vinculos(ad_id,conteudo_id,quem,quando) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE conteudo_id=VALUES(conteudo_id),quem=VALUES(quem),quando=VALUES(quando)', [adId, conteudoId, quem.slice(0, 80), now()]);
}

export async function arvore(de: string, ate: string, arquivados = false): Promise<Row> {
  const { id: conta, moeda } = await act();
  const a = `act_${conta}`, filtro = JSON.stringify([...ATIVOS, ...(arquivados ? ['ARCHIVED'] : [])]);
  const tr = JSON.stringify({ since: de, until: ate });
  const camp = await paginar(`/${a}/campaigns`, { fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,budget_remaining,created_time,updated_time', effective_status: filtro, limit: 200 }, 4);
  const conj = await paginar(`/${a}/adsets`, { fields: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,optimization_goal,destination_type,bid_strategy,bid_amount,targeting,promoted_object,created_time,updated_time', effective_status: filtro, limit: 200 }, 4);
  const anun = await paginar(`/${a}/ads`, { fields: 'id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time,creative.thumbnail_width(120).thumbnail_height(150){id,thumbnail_url,title,body,call_to_action_type,object_type,instagram_permalink_url,object_story_spec,url_tags}', effective_status: filtro, limit: 200 }, 6);
  const por = async (level: string, campo: string) => {
    const m = new Map<string, ReturnType<typeof ins>>();
    for (const l of await paginar(`/${a}/insights`, { level, fields: `${campo},spend,impressions,reach,clicks,actions`, time_range: tr, limit: 200 }, 5)) m.set(String(l[campo]), ins(l));
    return m;
  };
  const iCamp = await por('campaign', 'campaign_id'), iConj = await por('adset', 'adset_id'), iAn = await por('ad', 'ad_id');
  const objDe = new Map(camp.map((c) => [String(c.id), String(c.objective ?? '')]));
  const goalDe = new Map(conj.map((c) => [String(c.id), String(c.optimization_goal ?? '')]));
  const orc = (o: Row) => ({ diario: o.daily_budget ? deMenor(o.daily_budget, moeda) : null, total: o.lifetime_budget ? deMenor(o.lifetime_budget, moeda) : null });
  const pub = (t: Row) => ({ idadeMin: t?.age_min ?? null, idadeMax: t?.age_max ?? null, cidades: (t?.geo_locations?.cities ?? []).map((c: Row) => ({ key: String(c.key), nome: String(c.name ?? ''), raioKm: num(c.radius) })), plataformas: t?.publisher_platforms ?? [], posicionamentos: [...(t?.facebook_positions ?? []).map((x: string) => 'fb:' + x), ...(t?.instagram_positions ?? []).map((x: string) => 'ig:' + x), ...(t?.messenger_positions ?? []).map((x: string) => 'ms:' + x), ...(t?.audience_network_positions ?? []).map((x: string) => 'an:' + x)], posicoes: { facebook: t?.facebook_positions ?? [], instagram: t?.instagram_positions ?? [], messenger: t?.messenger_positions ?? [], audience_network: t?.audience_network_positions ?? [] }, generos: (t?.genders ?? []).map((g: number) => (g === 1 ? 'Homens' : g === 2 ? 'Mulheres' : String(g))), regioes: (t?.geo_locations?.regions ?? []).map((r: Row) => String(r.name ?? r.key ?? '')), paises: t?.geo_locations?.countries ?? [], interesses: (t?.flexible_spec ?? []).flatMap((f: Row) => f.interests ?? []).map((i: Row) => ({ id: String(i.id), nome: String(i.name ?? i.id) })), personalizados: (t?.custom_audiences ?? []).map((a: Row) => ({ id: String(a.id), nome: String(a.name ?? a.id) })) });
  const anuncios = anun.map((x) => ({ id: String(x.id), nome: String(x.name ?? ''), adset: String(x.adset_id ?? ''), campanha: String(x.campaign_id ?? ''), status: String(x.status ?? ''), estado: String(x.effective_status ?? x.status ?? ''), foto: /^https:\/\//.test(String(x.creative?.thumbnail_url ?? '')) ? String(x.creative.thumbnail_url) : '', criado: String(x.created_time ?? ''), atualizado: String(x.updated_time ?? ''), criativo: criativoDe(x.creative), ...metricas(iAn.get(String(x.id)), objDe.get(String(x.campaign_id)) ?? '', goalDe.get(String(x.adset_id)) ?? '') }));
  const conjuntos = conj.map((x) => ({
    id: String(x.id), nome: String(x.name ?? ''), campanha: String(x.campaign_id ?? ''), status: String(x.status ?? ''), estado: String(x.effective_status ?? x.status ?? ''), orcamento: orc(x), inicio: String(x.start_time ?? ''), fim: String(x.end_time ?? ''),
    criado: String(x.created_time ?? ''), atualizado: String(x.updated_time ?? ''), evento: String(x.promoted_object?.custom_event_type ?? ''), estrategiaLance: String(x.bid_strategy ?? ''), lanceValor: x.bid_amount ? deMenor(x.bid_amount, moeda) : null, otimizacao: String(x.optimization_goal ?? ''), destino: String(x.destination_type ?? ''), publico: pub(x.targeting ?? {}), ...metricas(iConj.get(String(x.id)), objDe.get(String(x.campaign_id)) ?? '', String(x.optimization_goal ?? '')),
    anuncios: anuncios.filter((n) => n.adset === String(x.id)),
  }));
  const campanhas = camp.map((x) => ({
    id: String(x.id), nome: String(x.name ?? ''), status: String(x.status ?? ''), estado: String(x.effective_status ?? x.status ?? ''), objetivo: String(x.objective ?? ''), orcamento: orc(x), criado: String(x.created_time ?? ''), atualizado: String(x.updated_time ?? ''), inicio: String(x.start_time ?? ''), fim: String(x.stop_time ?? ''),
    ...metricas(iCamp.get(String(x.id)), String(x.objective ?? ''), ''), conjuntos: conjuntos.filter((c) => c.campanha === String(x.id)),
  }));
  const todos: { id: string; nivel: Nivel }[] = [...campanhas.map((c) => ({ id: c.id, nivel: 'campanha' as Nivel })), ...conjuntos.map((c) => ({ id: c.id, nivel: 'conjunto' as Nivel })), ...anuncios.map((c) => ({ id: c.id, nivel: 'anuncio' as Nivel }))];
  const cods = await codigosInternos(todos);
  const vincs = new Map<string, string>((await q('SELECT ad_id,conteudo_id FROM ads_vinculos')).map((r) => [String(r.ad_id), String(r.conteudo_id)]));
  const titulos = new Map<string, string>((await q("SELECT id,data FROM records WHERE modulo='conteudos'")).map((r) => { let t = ''; try { t = String(JSON.parse(String(r.data)).titulo ?? ''); } catch { /* sem título */ } return [String(r.id), t]; }));
  const doEvo = new Set<string>();
  for (const l of await q('SELECT campanha_id,conjunto_id,anuncio_id FROM ads_lancamentos')) for (const k of ['campanha_id', 'conjunto_id', 'anuncio_id']) if (l[k]) doEvo.add(String(l[k]));
  const origemDe = (id: string) => (doEvo.has(id) ? 'EVO MKT' : 'Meta');
  for (const c of campanhas) { (c as Row).codigo = cods.get(c.id) ?? ''; (c as Row).origem = origemDe(c.id); for (const j of c.conjuntos) { (j as Row).codigo = cods.get(j.id) ?? ''; (j as Row).origem = origemDe(j.id); for (const a of j.anuncios) { (a as Row).codigo = cods.get(a.id) ?? ''; (a as Row).origem = origemDe(a.id); (a as Row).conteudo = vincs.has(a.id) ? { id: vincs.get(a.id), titulo: titulos.get(vincs.get(a.id)!) ?? '' } : null; } } }
  const lp = new Date(); const perMes = `${lp.getFullYear()}-${String(lp.getMonth() + 1).padStart(2, '0')}`;
  const diarioMeta = campanhas.filter((c) => c.status === 'ACTIVE').reduce((sm, c) => sm + (c.orcamento.diario ?? c.conjuntos.filter((j) => j.status === 'ACTIVE').reduce((s2, j) => s2 + (j.orcamento.diario ?? 0), 0)), 0);
  const orcamentoConta = { planejadoEvo: Number(await setting('ads_orcamento_mensal')) || 0, configuradoMetaDia: diarioMeta, gastoMes: Number((await q('SELECT COALESCE(SUM(gasto),0) g FROM ads_snapshots WHERE periodo=?', [perMes]))[0]?.g ?? 0) };
  const tot = campanhas.reduce((s, c) => ({ gasto: s.gasto + c.gasto, impressoes: s.impressoes + c.impressoes, alcance: s.alcance + c.alcance, cliques: s.cliques + c.cliques }), { gasto: 0, impressoes: 0, alcance: 0, cliques: 0 });
  return { conta, moeda, de, ate, lidoEm: now(), orcamentoConta, campanhas, totais: { ...tot, ctr: tot.impressoes ? (tot.cliques / tot.impressoes) * 100 : 0, cpc: tot.cliques ? tot.gasto / tot.cliques : 0 } };
}

export async function registrar(quem: string, nivel: string, id: string, nome: string, acao: string, antes: unknown, depois: unknown, erro = '') {
  await run('INSERT INTO ads_acoes(quando,quem,nivel,objeto_id,nome,acao,antes,depois,resultado,erro) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [now(), quem.slice(0, 80), nivel, id, nome.slice(0, 250), acao, JSON.stringify(antes).slice(0, 900), JSON.stringify(depois).slice(0, 900), erro ? 'ERRO' : 'OK', erro.slice(0, 500)]);
}
export async function acoesRecentes(): Promise<Row[]> {
  return q('SELECT id,quando,quem,nivel,objeto_id,nome,acao,antes,depois,resultado,erro FROM ads_acoes ORDER BY id DESC LIMIT 100');
}

const NIVEIS: Nivel[] = ['campanha', 'conjunto', 'anuncio'];
const ID_OK = /^[A-Za-z0-9_]{2,40}$/;
/** Confere que o objeto pertence à conta de anúncios escolhida (nunca mexe em ID de outra conta). */
export async function conferirObjeto(id: string, conta: string, campos: string): Promise<Row> {
  if (!ID_OK.test(id)) throw new Error('Identificador inválido.');
  const o = await metaGet(`/${id}`, { fields: 'account_id,name,' + campos });
  if (String(o.account_id ?? '').replace(/^act_/, '') !== conta) throw new Error('Este objeto não pertence à conta de anúncios escolhida.');
  return o;
}
const dataIso = (v: string, nome: string) => {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)) throw new Error(`${nome}: use data e hora (AAAA-MM-DDThh:mm).`);
  const d = parseLocal(v);
  if (isNaN(d.getTime())) throw new Error(`${nome}: data inválida.`);
  return d.toISOString();
};

export interface Campos { posicoes?: Record<string, string[]>; nome?: string; status?: string; orcamentoDia?: number; orcamentoTotal?: number; inicio?: string; fim?: string; idadeMin?: number; idadeMax?: number; raioKm?: number; cidade?: string; genero?: string; plataformas?: string[]; interesses?: { id: string; nome: string }[]; publicosPersonalizados?: string[]; lance?: { tipo?: string; valor?: number }; criativo?: { texto?: string; titulo?: string; descricao?: string; cta?: string; link?: string } }

export async function editarObjeto(nivel: Nivel, id: string, c: Campos, confirmou: boolean, quem: string): Promise<Row> {
  if (!NIVEIS.includes(nivel)) throw new Error('Nível inválido.');
  const { id: conta, moeda } = await act();
  const cfg = await cfgGestao();
  if (!cfg.ativa) throw new Error('A gestão de anúncios está desligada. Ligue em Tráfego → Gestor de anúncios e reconecte a Meta.');
  const pedido: Row = {};
  const campoOrc = nivel === 'anuncio' ? '' : 'daily_budget,lifetime_budget,';
  const campoData = nivel === 'campanha' ? 'start_time,stop_time,' : nivel === 'conjunto' ? 'start_time,end_time,targeting,bid_strategy,bid_amount,' : '';
  const campoCri = nivel === 'anuncio' ? 'creative{id,name,object_story_spec,instagram_user_id,source_instagram_media_id},' : '';
  const atual = await conferirObjeto(id, conta, `status,${campoOrc}${campoData}${campoCri}`.replace(/,$/, ''));
  const antes: Row = {}, depois: Row = {};
  if (c.nome !== undefined) {
    const n = String(c.nome).trim();
    if (!n || n.length > 400) throw new Error('O nome deve ter de 1 a 400 caracteres.');
    pedido.name = n; antes.nome = atual.name; depois.nome = n;
  }
  if (c.status !== undefined) {
    const s = String(c.status).toUpperCase();
    if (!['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'].includes(s)) throw new Error('Status inválido (use ACTIVE, PAUSED, ARCHIVED ou DELETED).');
    if (s === 'DELETED' && confirmou !== true) throw new Error('Excluir exige confirmação.');
    pedido.status = s; antes.status = atual.status; depois.status = s;
  }
  if (nivel !== 'anuncio') {
    if (c.orcamentoDia !== undefined) {
      const v = Number(c.orcamentoDia);
      if (!Number.isFinite(v) || v < 6) throw new Error('O orçamento diário mínimo é 6.');
      if (v > cfg.tetoDia) throw new Error(`O orçamento diário (${v}) passa do teto por campanha (${cfg.tetoDia}). Aumente o teto em Gestor de anúncios, se quiser.`);
      pedido.daily_budget = paraMenor(v, moeda); antes.orcamentoDia = atual.daily_budget ? deMenor(atual.daily_budget, moeda) : null; depois.orcamentoDia = v;
    }
    if (c.orcamentoTotal !== undefined) {
      const v = Number(c.orcamentoTotal);
      if (!Number.isFinite(v) || v < 6) throw new Error('O orçamento total mínimo é 6.');
      if (v > cfg.tetoMes) throw new Error(`O orçamento total (${v}) passa do teto mensal (${cfg.tetoMes}).`);
      pedido.lifetime_budget = paraMenor(v, moeda); antes.orcamentoTotal = atual.lifetime_budget ? deMenor(atual.lifetime_budget, moeda) : null; depois.orcamentoTotal = v;
    }
  }
  if (nivel !== 'anuncio' && (c.inicio !== undefined || c.fim !== undefined)) {
    if (c.inicio !== undefined) { pedido.start_time = dataIso(c.inicio, 'Início'); antes.inicio = atual.start_time; depois.inicio = pedido.start_time; }
    if (c.fim !== undefined) {
      const k = nivel === 'campanha' ? 'stop_time' : 'end_time';
      pedido[k] = dataIso(c.fim, 'Término'); antes.fim = atual[k]; depois.fim = pedido[k];
      if (new Date(String(pedido[k])).getTime() - Date.now() > cfg.diasMax * 86400000 + 86400000 && nivel === 'conjunto') throw new Error(`O término passa da duração máxima (${cfg.diasMax} dias).`);
    }
  }
  const mexeuPublico = c.idadeMin !== undefined || c.idadeMax !== undefined || c.raioKm !== undefined || c.cidade !== undefined || c.genero !== undefined || c.plataformas !== undefined || c.posicoes !== undefined || c.interesses !== undefined || c.publicosPersonalizados !== undefined;
  if (nivel === 'conjunto' && mexeuPublico) {
    const t: Row = JSON.parse(JSON.stringify(atual.targeting ?? {}));
    const a = c.idadeMin ?? t.age_min ?? cfg.publico.idadeMin, z = c.idadeMax ?? t.age_max ?? cfg.publico.idadeMax;
    if (!(a >= 18 && z <= 65 && a <= z)) throw new Error('Faixa de idade inválida (18 a 65, mínima ≤ máxima).');
    t.age_min = a; t.age_max = z;
    if (c.cidade !== undefined && String(c.cidade).trim()) {
      const nova = await resolverCidade(String(c.cidade));
      const raioAtual = t.geo_locations?.cities?.[0]?.radius ?? cfg.publico.raioKm;
      t.geo_locations = { ...(t.geo_locations ?? {}), cities: [{ key: nova.key, name: nova.nome, radius: c.raioKm ?? raioAtual, distance_unit: 'kilometer' }] };
    }
    if (c.raioKm !== undefined) {
      if (!(c.raioKm >= 1 && c.raioKm <= 80)) throw new Error('O raio deve estar entre 1 e 80 km.');
      if (!t.geo_locations?.cities?.length) throw new Error('Este conjunto não tem cidade para ajustar o raio.');
      t.geo_locations.cities = t.geo_locations.cities.map((x: Row) => ({ ...x, radius: c.raioKm, distance_unit: 'kilometer' }));
    }
    if (c.genero !== undefined) {
      if (!['todos', 'mulheres', 'homens'].includes(c.genero)) throw new Error('Gênero inválido.');
      if (c.genero === 'todos') delete t.genders; else t.genders = c.genero === 'mulheres' ? [2] : [1];
    }
    if (c.plataformas !== undefined) {
      if (!Array.isArray(c.plataformas) || c.plataformas.some((x) => !['instagram', 'facebook', 'messenger', 'audience_network'].includes(x))) throw new Error('Plataforma de veiculação inválida.');
      if (c.plataformas.length) t.publisher_platforms = c.plataformas; else { delete t.publisher_platforms; delete t.facebook_positions; delete t.instagram_positions; } // vazio = posicionamentos automáticos
    }
    if (c.posicoes !== undefined) aplicarPosicoes(t, c.posicoes);
    if (c.interesses !== undefined) {
      if (!Array.isArray(c.interesses) || c.interesses.length > 20) throw new Error('Até 20 interesses.');
      if (c.interesses.length) t.flexible_spec = [{ interests: c.interesses.map((i) => ({ id: String(i.id), name: String(i.nome ?? i.id) })) }]; else delete t.flexible_spec;
    }
    if (c.publicosPersonalizados !== undefined) {
      if (!Array.isArray(c.publicosPersonalizados) || c.publicosPersonalizados.length > 20 || c.publicosPersonalizados.some((x) => !ID_OK.test(String(x)))) throw new Error('Público personalizado inválido (até 20).');
      if (c.publicosPersonalizados.length) t.custom_audiences = c.publicosPersonalizados.map((id) => ({ id: String(id) })); else delete t.custom_audiences;
    }
    antes.publico = { idadeMin: atual.targeting?.age_min, idadeMax: atual.targeting?.age_max, raioKm: atual.targeting?.geo_locations?.cities?.[0]?.radius, cidade: atual.targeting?.geo_locations?.cities?.[0]?.name, genders: atual.targeting?.genders ?? null, plataformas: atual.targeting?.publisher_platforms ?? null };
    depois.publico = { idadeMin: a, idadeMax: z, raioKm: t.geo_locations?.cities?.[0]?.radius ?? null, cidade: t.geo_locations?.cities?.[0]?.name, genders: t.genders ?? null, plataformas: t.publisher_platforms ?? null, interesses: (t.flexible_spec?.[0]?.interests ?? []).length, personalizados: (t.custom_audiences ?? []).length };
    pedido.targeting = JSON.stringify(t);
  }
  if (nivel === 'conjunto' && c.lance !== undefined) {
    const tipo = String(c.lance.tipo ?? '');
    if (!['MENOR_CUSTO', 'LIMITE_CUSTO'].includes(tipo)) throw new Error('Estratégia de lance inválida.');
    if (tipo === 'LIMITE_CUSTO') {
      const v = Number(c.lance.valor);
      if (!(v > 0)) throw new Error('Informe o valor do limite de custo.');
      pedido.bid_strategy = 'COST_CAP'; pedido.bid_amount = paraMenor(v, moeda);
    } else pedido.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
    antes.lance = { estrategia: atual.bid_strategy ?? null, valor: atual.bid_amount ? deMenor(atual.bid_amount, moeda) : null }; depois.lance = { estrategia: pedido.bid_strategy, valor: c.lance.valor ?? null };
  }
  if (nivel === 'anuncio' && c.criativo !== undefined) {
    // criativo de anúncio não se edita na Meta: cria-se um novo criativo com os campos mudados e troca-se no anúncio
    const cr = atual.creative ?? {}, ld = cr.object_story_spec?.link_data;
    if (!ld) throw new Error('Este anúncio usa uma publicação do Instagram (ou vídeo): o texto vem da própria publicação. Edite a publicação, ou crie um anúncio novo.');
    const n = c.criativo, novoLd: Row = { ...ld };
    if (n.texto !== undefined) novoLd.message = String(n.texto).slice(0, 2000);
    if (n.titulo !== undefined) novoLd.name = String(n.titulo).slice(0, 255);
    if (n.descricao !== undefined) novoLd.description = String(n.descricao).slice(0, 255);
    if (n.link !== undefined) { if (!/^https:\/\/[^\s]{4,500}$/.test(String(n.link))) throw new Error('O link precisa começar com https://.'); novoLd.link = String(n.link); if (novoLd.call_to_action?.value) novoLd.call_to_action = { ...novoLd.call_to_action, value: { ...novoLd.call_to_action.value, link: String(n.link) } }; }
    if (n.cta !== undefined) { if (!['LEARN_MORE', 'SIGN_UP', 'CONTACT_US', 'APPLY_NOW', 'GET_QUOTE', 'SHOP_NOW', 'MESSAGE_PAGE', 'INSTAGRAM_MESSAGE', 'WHATSAPP_MESSAGE', 'NO_BUTTON'].includes(String(n.cta))) throw new Error('Botão de chamada inválido.'); if (n.cta === 'NO_BUTTON') delete novoLd.call_to_action; else novoLd.call_to_action = { type: String(n.cta), value: novoLd.call_to_action?.value ?? { link: String(novoLd.link ?? '') } }; }
    const spec = { ...cr.object_story_spec, link_data: novoLd };
    const novoCri = await metaPost(`/act_${conta}/adcreatives`, { name: `${String(cr.name ?? atual.name).slice(0, 200)} (editado)`, object_story_spec: JSON.stringify(spec), ...(cr.instagram_user_id ? { instagram_user_id: cr.instagram_user_id } : {}) });
    pedido.creative = JSON.stringify({ creative_id: String(novoCri.id) });
    antes.criativo = { texto: ld.message ?? null, titulo: ld.name ?? null, descricao: ld.description ?? null, cta: ld.call_to_action?.type ?? null, link: ld.link ?? null };
    depois.criativo = { texto: novoLd.message ?? null, titulo: novoLd.name ?? null, descricao: novoLd.description ?? null, cta: novoLd.call_to_action?.type ?? null, link: novoLd.link ?? null };
  }
  if (!Object.keys(pedido).length) throw new Error('Nada para alterar.');
  const nome = String(atual.name ?? id), acao = Object.keys(depois).join('+');
  try {
    await metaPost(`/${id}`, pedido);
  } catch (e: any) {
    await registrar(quem, nivel, id, nome, acao, antes, depois, e.message);
    await intLog('instagram', 'erro', `Gerenciador: falha ao alterar ${nivel} ${id}: ${String(e.message).slice(0, 200)}`);
    throw new Error('A Meta recusou a alteração: ' + e.message);
  }
  await registrar(quem, nivel, id, nome, acao, antes, depois);
  const grave = depois.status === 'DELETED' || depois.status === 'ARCHIVED' || depois.status === 'ACTIVE' || (depois.orcamentoDia && antes.orcamentoDia && Number(depois.orcamentoDia) > Number(antes.orcamentoDia));
  if (grave) {
    const txt = `${nivel} "${nome}": ${Object.entries(depois).map(([k, v]) => `${k} → ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ')}. Por ${quem}.`;
    await registrarNotificacao('ads_acao', 'gerencia', 'Anúncio alterado pelo sistema', txt, 'trafego', id);
    await notifyMail('Anúncio alterado pelo EVO MKT', txt);
  }
  return { ok: true, nivel, id, antes, depois };
}

/** Duplica como o Gerenciador da Meta: cópia PAUSADA (você revisa e liga). */
export async function duplicarObjeto(nivel: Nivel, id: string, quem: string): Promise<Row> {
  if (!NIVEIS.includes(nivel)) throw new Error('Nível inválido.');
  const { id: conta } = await act();
  if (!(await cfgGestao()).ativa) throw new Error('A gestão de anúncios está desligada. Ligue em Tráfego → Gestor de anúncios e reconecte a Meta.');
  const atual = await conferirObjeto(id, conta, '');
  let r: Row;
  try {
    r = await metaPost(`/${id}/copies`, { deep_copy: 'true', status_option: 'PAUSED', rename_options: JSON.stringify({ rename_suffix: ' – cópia' }) });
  } catch (e: any) {
    await registrar(quem, nivel, id, String(atual.name ?? id), 'duplicar', {}, {}, e.message);
    throw new Error('A Meta recusou a duplicação: ' + e.message);
  }
  await registrar(quem, nivel, id, String(atual.name ?? id), 'duplicar', {}, r);
  return { ok: true, copia: r, data: fmtDate(new Date()) };
}
