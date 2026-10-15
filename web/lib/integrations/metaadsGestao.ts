import { q, q1, run } from '../db';
import { notifyMail } from '../mail';
import { registrarNotificacao } from '../notificacoes';
import { intLog, setSetting, setting } from '../settings';
import { sha256 } from '../crypto';
import { fmtDate, localParts, now, Row } from '../util';
import { metaConnected, metaGet, metaPost } from './meta';
import { ContaAds } from './metaads';

/**
 * Gestor de Anúncios (Fase 1) — ÚNICO arquivo do sistema que ESCREVE na Meta Ads.
 * Tudo aqui é feito só pela Gerência, com tetos, confirmação e registro (ads_lancamentos). O que for criado vai ao ar ATIVO.
 * Os payloads (montarPayloads) seguem a documentação da Meta e foram validados só contra o simulador: o primeiro lançamento real é um teste supervisionado.
 */
export const PADRAO_GESTAO = { tetoDia: 50, tetoMes: 3000, diasMax: 14, raioKm: 20, idadeMin: 25, idadeMax: 55, orcamentoPadrao: 20, diasPadrao: 7 };
export const ORCAMENTO_MIN_DIA = 6;
export type Objetivo = 'CONVERSAS' | 'ALCANCE';
const OBJETIVOS: Record<Objetivo, { rotulo: string; objective: string; goal: string; destino?: string }> = {
  CONVERSAS: { rotulo: 'Conversas no Instagram Direct', objective: 'OUTCOME_ENGAGEMENT', goal: 'CONVERSATIONS', destino: 'INSTAGRAM_DIRECT' },
  ALCANCE: { rotulo: 'Alcance (mostrar para mais pessoas)', objective: 'OUTCOME_AWARENESS', goal: 'REACH' },
};
const SEM_CENTAVOS = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD']);
export const menorUnidade = (v: number, moeda: string) => String(Math.round(v * (SEM_CENTAVOS.has(moeda) ? 1 : 100)));
const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

export interface Publico { cidade: { key: string; nome: string; regiao: string } | null; raioKm: number; idadeMin: number; idadeMax: number }
export async function cfgGestao() {
  let cidade: Publico['cidade'] = null;
  try { cidade = JSON.parse((await setting('ads_cidade')) || 'null'); } catch { /* guardado inválido */ }
  return {
    ativa: (await setting('meta_ads_gestao')) === '1',
    tetoDia: num(await setting('ads_teto_dia'), PADRAO_GESTAO.tetoDia), tetoMes: num(await setting('ads_teto_mes'), PADRAO_GESTAO.tetoMes), diasMax: num(await setting('ads_dias_max'), PADRAO_GESTAO.diasMax),
    publico: { cidade, raioKm: num(await setting('ads_raio_km'), PADRAO_GESTAO.raioKm), idadeMin: num(await setting('ads_idade_min'), PADRAO_GESTAO.idadeMin), idadeMax: num(await setting('ads_idade_max'), PADRAO_GESTAO.idadeMax) } as Publico,
  };
}

export async function gestaoPermitida(): Promise<boolean> {
  try { return ((await metaGet('/me/permissions')).data ?? []).some((p: Row) => p.permission === 'ads_management' && p.status === 'granted'); } catch { return false; }
}

/** Procura a cidade na Meta (necessário para segmentar por localização). */
export async function resolverCidade(texto: string): Promise<NonNullable<Publico['cidade']>> {
  const r = await metaGet('/search', { type: 'adgeolocation', location_types: JSON.stringify(['city']), q: texto, country_code: 'BR', limit: 5 });
  const c = (r.data ?? [])[0];
  if (!c?.key) throw new Error(`Cidade "${texto}" não encontrada na Meta. Escreva o nome completo (ex.: João Pessoa).`);
  return { key: String(c.key), nome: String(c.name ?? texto), regiao: String(c.region ?? '') };
}

export async function contaAds(): Promise<{ id: string; moeda: string }> {
  const id = await setting('meta_ads_conta');
  if (!id) throw new Error('Escolha a conta de anúncios em Integrações.');
  const info = (JSON.parse((await setting('meta_ads_contas')) || '[]') as ContaAds[]).find((c) => c.id === id);
  return { id, moeda: info?.moeda || 'BRL' };
}
export async function paginaDoInstagram(): Promise<string> {
  const salvo = await setting('meta_page_id');
  if (salvo) return salvo;
  const ig = await setting('ig_user_id');
  const r = await metaGet('/me/accounts', { fields: 'id,name,instagram_business_account{id}', limit: 100 });
  const p = (r.data ?? []).find((x: Row) => String(x.instagram_business_account?.id ?? '') === ig);
  if (!p?.id) throw new Error('Não achei a Página do Facebook ligada ao Instagram conectado.');
  await setSetting('meta_page_id', String(p.id));
  return String(p.id);
}

/** Gasto do mês já lido da Meta + campanhas do sistema em andamento + a nova, contra o teto mensal. */
export async function limitesMes(compromisso: number, tetoMes: number): Promise<{ gastoMes: number; pendente: number; erros: string[]; avisos: string[] }> {
  const lp = localParts(new Date()), per = `${lp.y}-${String(lp.m).padStart(2, '0')}`;
  const gastoMes = Number((await q1('SELECT COALESCE(SUM(gasto),0) g FROM ads_snapshots WHERE periodo=?', [per]))?.g ?? 0);
  const ativos = await q("SELECT orcamento_dia,fim FROM ads_lancamentos WHERE estado='ATIVO' AND fim>?", [now()]);
  const pendente = ativos.reduce((s, r) => s + Number(r.orcamento_dia) * Math.max(0, Math.ceil((new Date(String(r.fim)).getTime() - Date.now()) / 86400000)), 0);
  const erros: string[] = [], avisos: string[] = [];
  if (gastoMes + pendente + compromisso > tetoMes) erros.push(`O compromisso total (gasto do mês ${gastoMes.toFixed(2)} + campanhas em andamento ${pendente.toFixed(2)} + esta ${compromisso.toFixed(2)}) passa do teto mensal (${tetoMes}).`);
  else if (gastoMes + pendente + compromisso > tetoMes * 0.8) avisos.push('Com esta campanha o mês passa de 80% do teto mensal.');
  return { gastoMes, pendente, erros, avisos };
}

export interface PedidoImpulso { chave: string; midia: string; orcamentoDia: number; dias: number; objetivo: Objetivo }

/** Confere TODAS as travas, sem escrever nada na Meta. */
export async function previaImpulso(p: PedidoImpulso) {
  const cfg = await cfgGestao();
  const erros: string[] = [], avisos: string[] = [];
  if (!cfg.ativa) erros.push('A gestão de anúncios está desligada. Ligue em Tráfego → Gestor de anúncios e reconecte a Meta.');
  if (!(p.objetivo in OBJETIVOS)) erros.push('Objetivo inválido.');
  const orc = Number(p.orcamentoDia), dias = Math.floor(Number(p.dias));
  if (!Number.isFinite(orc) || orc < ORCAMENTO_MIN_DIA) erros.push(`O orçamento diário mínimo é ${ORCAMENTO_MIN_DIA}.`);
  if (orc > cfg.tetoDia) erros.push(`O orçamento diário (${orc}) passa do teto por campanha (${cfg.tetoDia}).`);
  if (!Number.isFinite(dias) || dias < 1) erros.push('Informe a duração em dias.');
  if (dias > cfg.diasMax) erros.push(`A duração (${dias} dias) passa do máximo (${cfg.diasMax} dias).`);
  if (!cfg.publico.cidade) erros.push('Defina a cidade do público em Tráfego → Gestor de anúncios.');
  if (cfg.publico.idadeMin > cfg.publico.idadeMax) erros.push('Faixa de idade inválida no público padrão.');
  if (!(await q1('SELECT 1 FROM ig_posts WHERE media_id=?', [String(p.midia)]))) erros.push('Essa publicação não foi lida do Instagram conectado. Atualize o Desempenho e tente de novo.');
  let moeda = 'BRL';
  try { moeda = (await contaAds()).moeda; } catch (e: any) { erros.push(e.message); }
  const compromisso = Math.round(orc * dias * 100) / 100;
  const lm = await limitesMes(compromisso, cfg.tetoMes);
  const { gastoMes, pendente } = lm;
  erros.push(...lm.erros);
  avisos.push(...lm.avisos);
  const fim = new Date(Date.now() + dias * 86400000);
  return {
    ok: erros.length === 0, erros, avisos, moeda, compromisso, gastoMes, pendente, tetoDia: cfg.tetoDia, tetoMes: cfg.tetoMes, diasMax: cfg.diasMax, fim: now(fim),
    resumo: { objetivo: OBJETIVOS[p.objetivo]?.rotulo ?? '', orcamentoDia: orc, dias, publico: cfg.publico, posicionamento: 'Instagram', vaiAoArAtivo: true },
  };
}

/** Monta os 4 pedidos à Meta (campanha, conjunto, criativo, anúncio). É o único ponto a ajustar se a Meta recusar algum campo. */
function montarPayloads(p: PedidoImpulso, o: { moeda: string; pagina: string; ig: string; cidade: NonNullable<Publico['cidade']>; pub: Publico; titulo: string; fim: Date }) {
  const ob = OBJETIVOS[p.objetivo];
  const campanha = { name: `[EVO MKT] ${o.titulo}`, objective: ob.objective, status: 'ACTIVE', special_ad_categories: '[]', buying_type: 'AUCTION', is_adset_budget_sharing_enabled: 'false' };
  const conjunto = {
    name: `[EVO MKT] ${o.titulo} · público`, status: 'ACTIVE', daily_budget: menorUnidade(p.orcamentoDia, o.moeda), start_time: new Date(Date.now() + 120000).toISOString(), end_time: o.fim.toISOString(),
    billing_event: 'IMPRESSIONS', optimization_goal: ob.goal, bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    ...(ob.destino ? { destination_type: ob.destino, promoted_object: JSON.stringify({ page_id: o.pagina }) } : {}),
    targeting: JSON.stringify({ geo_locations: { cities: [{ key: o.cidade.key, radius: o.pub.raioKm, distance_unit: 'kilometer' }] }, age_min: o.pub.idadeMin, age_max: o.pub.idadeMax, publisher_platforms: ['instagram'] }),
  };
  const criativo = {
    name: `[EVO MKT] ${o.titulo} · criativo`, object_id: o.pagina, instagram_user_id: o.ig, source_instagram_media_id: p.midia,
    ...(ob.destino ? { call_to_action: JSON.stringify({ type: 'INSTAGRAM_MESSAGE', value: { app_destination: 'INSTAGRAM_DIRECT' } }) } : {}),
  };
  return { campanha, conjunto, criativo };
}

export async function marcar(id: number, estado: string, extra: { campanha_id?: string; conjunto_id?: string; anuncio_id?: string; erro?: string } = {}) {
  await run('UPDATE ads_lancamentos SET estado=?,atualizado_em=?,campanha_id=COALESCE(?,campanha_id),conjunto_id=COALESCE(?,conjunto_id),anuncio_id=COALESCE(?,anuncio_id),erro=COALESCE(?,erro) WHERE id=?',
    [estado, now(), extra.campanha_id ?? null, extra.conjunto_id ?? null, extra.anuncio_id ?? null, extra.erro ?? null, id]);
}

export async function lancarImpulso(p: PedidoImpulso, quem: string): Promise<Row> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(p.chave))) throw new Error('Pedido sem chave de segurança. Abra a confirmação de novo.');
  const chave = sha256('imp|' + p.chave).slice(0, 32);
  const ja = await q1('SELECT * FROM ads_lancamentos WHERE chave=?', [chave]);
  if (ja) return { ...ja, repetido: true }; // clique duplicado ou reenvio: devolve o que já foi lançado
  const pre = await previaImpulso(p);
  if (!pre.ok) throw new Error(pre.erros.join(' '));
  const cfg = await cfgGestao();
  if (!(await metaConnected())) throw new Error('Instagram/Meta não conectado.');
  if (!(await gestaoPermitida())) throw new Error('A permissão ads_management não foi concedida. Reconecte a Meta e aceite todas as permissões.');
  const { id: conta, moeda } = await contaAds();
  const post = await q1('SELECT legenda FROM ig_posts WHERE media_id=?', [String(p.midia)]);
  const titulo = String(post?.legenda || 'Publicação').replace(/\s+/g, ' ').trim().slice(0, 40) + ' · ' + fmtDate(new Date());
  const fim = new Date(pre.fim.replace(' ', 'T'));
  await run('INSERT INTO ads_lancamentos(chave,quem,quando,tipo,referencia,titulo,objetivo,orcamento_dia,dias,inicio,fim,compromisso,moeda,publico,estado,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [chave, quem.slice(0, 80), now(), 'IMPULSIONAR', String(p.midia), titulo, p.objetivo, p.orcamentoDia, p.dias, now(), pre.fim, pre.compromisso, moeda, JSON.stringify(cfg.publico).slice(0, 1000), 'CRIANDO', now()]);
  const row = (await q1('SELECT id FROM ads_lancamentos WHERE chave=?', [chave]))!;
  const id = Number(row.id);
  let campanhaId = '';
  try {
    const pay = montarPayloads(p, { moeda, pagina: await paginaDoInstagram(), ig: await setting('ig_user_id'), cidade: cfg.publico.cidade!, pub: cfg.publico, titulo, fim });
    campanhaId = String((await metaPost(`/act_${conta}/campaigns`, pay.campanha)).id);
    await marcar(id, 'CRIANDO', { campanha_id: campanhaId });
    const conjuntoId = String((await metaPost(`/act_${conta}/adsets`, { ...pay.conjunto, campaign_id: campanhaId })).id);
    await marcar(id, 'CRIANDO', { conjunto_id: conjuntoId });
    const criativoId = String((await metaPost(`/act_${conta}/adcreatives`, pay.criativo)).id);
    const anuncioId = String((await metaPost(`/act_${conta}/ads`, { name: `[EVO MKT] ${titulo}`, adset_id: conjuntoId, creative: JSON.stringify({ creative_id: criativoId }), status: 'ACTIVE' })).id);
    await marcar(id, 'ATIVO', { anuncio_id: anuncioId });
    await intLog('instagram', 'ok', `Gestor de anúncios: lançado "${titulo}" (campanha ${campanhaId}, ${p.orcamentoDia}/dia por ${p.dias} dia(s)) por ${quem}.`);
    await registrarNotificacao('ads_lancamento', 'gerencia', 'Anúncio lançado pelo sistema', `${titulo}: ${p.orcamentoDia}/dia por ${p.dias} dia(s), compromisso de até ${pre.compromisso}. Lançado por ${quem}.`, 'trafego', String(id));
    await notifyMail('Anúncio lançado pelo EVO MKT', `${titulo}\n${p.orcamentoDia}/dia por ${p.dias} dia(s), compromisso de até ${pre.compromisso}.\nPor: ${quem}`);
  } catch (e: any) {
    // compensação: não deixa campanha pela metade rodando (pausa e tenta apagar)
    if (campanhaId) {
      try { await metaPost(`/${campanhaId}`, { status: 'PAUSED' }); } catch { /* segue */ }
      try { await metaPost(`/${campanhaId}`, { status: 'DELETED' }); } catch { /* segue */ }
    }
    await marcar(id, 'ERRO', { erro: String(e.message).slice(0, 580) });
    await intLog('instagram', 'erro', `Gestor de anúncios: falha ao lançar "${titulo}": ${String(e.message).slice(0, 200)}`);
    throw new Error('A Meta recusou o lançamento: ' + e.message + (campanhaId ? ' (a campanha incompleta foi pausada e removida)' : ''));
  }
  return (await q1('SELECT * FROM ads_lancamentos WHERE id=?', [id]))!;
}

export async function listarLancamentos(): Promise<Row[]> {
  return q('SELECT id,quem,quando,tipo,referencia,titulo,objetivo,orcamento_dia,dias,fim,compromisso,moeda,campanha_id,anuncio_id,estado,erro FROM ads_lancamentos ORDER BY id DESC LIMIT 100');
}

async function mudarEstado(id: number, de: string[], para: 'ATIVO' | 'PAUSADO', statusMeta: 'ACTIVE' | 'PAUSED'): Promise<Row> {
  const l = (await q1('SELECT * FROM ads_lancamentos WHERE id=?', [id])) ?? (() => { throw new Error('Lançamento não encontrado.'); })();
  if (!de.includes(String(l.estado))) throw new Error(`Este anúncio está "${l.estado}"; não dá para ${para === 'PAUSADO' ? 'pausar' : 'retomar'}.`);
  if (para === 'ATIVO' && String(l.fim) < now()) throw new Error('A campanha já passou da data de término.');
  await metaPost(`/${l.campanha_id}`, { status: statusMeta });
  await marcar(id, para);
  return (await q1('SELECT * FROM ads_lancamentos WHERE id=?', [id]))!;
}
export const pausarLancamento = (id: number) => mudarEstado(id, ['ATIVO'], 'PAUSADO', 'PAUSED');
export const retomarLancamento = (id: number) => mudarEstado(id, ['PAUSADO'], 'ATIVO', 'ACTIVE');
/** Interruptor de emergência: pausa tudo que o sistema lançou e ainda está ativo. */
export async function pausarTudo(): Promise<{ pausados: number; falhas: string[] }> {
  let n = 0;
  const falhas: string[] = [];
  for (const l of await q("SELECT id,titulo FROM ads_lancamentos WHERE estado='ATIVO'")) {
    try { await pausarLancamento(Number(l.id)); n++; } catch (e: any) { falhas.push(`${l.titulo}: ${e.message}`); }
  }
  return { pausados: n, falhas };
}
