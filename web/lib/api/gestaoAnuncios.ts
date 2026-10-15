import { Ctx } from '../ctx';
import { requireManager } from '../auth';
import { audit } from '../records';
import { setSetting, setting } from '../settings';
import { fail, Row, strv } from '../util';
import { metaConnected } from '../integrations/meta';
import { cfgGestao, gestaoPermitida, lancarImpulso, listarLancamentos, ORCAMENTO_MIN_DIA, PADRAO_GESTAO, pausarLancamento, pausarTudo, previaImpulso, resolverCidade, retomarLancamento, PedidoImpulso } from '../integrations/metaadsGestao';
import { acoesRecentes, arvore, duplicarObjeto, editarObjeto, Nivel } from '../integrations/metaadsGerenciador';
import { addDays, fmtDate } from '../util';
import { json } from './handlers';

/** Rotas do Gestor de Anúncios. Todas só da Gerência. */
function pedido(b: Row): PedidoImpulso {
  return { chave: strv(b.chave), midia: strv(b.midia), orcamentoDia: Number(b.orcamentoDia), dias: Number(b.dias), objetivo: strv(b.objetivo).toUpperCase() as PedidoImpulso['objetivo'] };
}
const faixa = (v: unknown, min: number, max: number, nome: string) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) fail(400, `${nome} deve estar entre ${min} e ${max}.`); return n; };

export async function gestaoAnunciosRoute(c: Ctx) {
  const { path, method } = c;
  const u = await requireManager(c);
  if (path === '/ads/gestao' && method === 'GET') {
    let permissao = false;
    try { permissao = (await metaConnected()) && (await gestaoPermitida()); } catch { /* sem Meta */ }
    return json({ config: await cfgGestao(), permissao, conta: await setting('meta_ads_conta'), minimoDia: ORCAMENTO_MIN_DIA, padrao: PADRAO_GESTAO, lancamentos: await listarLancamentos() });
  }
  if (path === '/ads/gestao/config' && method === 'POST') {
    const b = await c.body();
    if ('ativa' in b) await setSetting('meta_ads_gestao', b.ativa ? '1' : '0');
    if ('tetoDia' in b) await setSetting('ads_teto_dia', String(faixa(b.tetoDia, ORCAMENTO_MIN_DIA, 10000, 'O teto por dia')));
    if ('tetoMes' in b) await setSetting('ads_teto_mes', String(faixa(b.tetoMes, ORCAMENTO_MIN_DIA, 1_000_000, 'O teto mensal')));
    if ('diasMax' in b) await setSetting('ads_dias_max', String(Math.floor(faixa(b.diasMax, 1, 60, 'A duração máxima'))));
    if ('raioKm' in b) await setSetting('ads_raio_km', String(faixa(b.raioKm, 1, 80, 'O raio')));
    if ('idadeMin' in b || 'idadeMax' in b) {
      const a = faixa(b.idadeMin ?? (await cfgGestao()).publico.idadeMin, 18, 65, 'A idade mínima'), z = faixa(b.idadeMax ?? (await cfgGestao()).publico.idadeMax, 18, 65, 'A idade máxima');
      if (a > z) fail(400, 'A idade mínima não pode passar da máxima.');
      await setSetting('ads_idade_min', String(a));
      await setSetting('ads_idade_max', String(z));
    }
    if (strv(b.cidade).trim()) {
      if (!(await metaConnected())) fail(400, 'Conecte a Meta para procurar a cidade.');
      try { await setSetting('ads_cidade', JSON.stringify(await resolverCidade(strv(b.cidade).trim()))); } catch (e: any) { fail(400, e.message); }
    }
    await audit(String(u.codigo), 'ads-gestao-config');
    return json({ ok: true, config: await cfgGestao() });
  }
  if (path === '/ads/previa' && method === 'POST') return json(await previaImpulso(pedido(await c.body())));
  if (path === '/ads/impulsionar' && method === 'POST') {
    const b = await c.body();
    if (b.confirmou !== true) fail(400, 'Confirme o lançamento na tela de resumo.');
    try {
      const r = await lancarImpulso(pedido(b), String(u.nome || u.codigo));
      await audit(String(u.codigo), 'ads-lancamento', 'ads', String(r.id));
      return json({ ok: true, lancamento: r });
    } catch (e: any) { return fail(502, e.message); }
  }
  if ((path === '/ads/pausar' || path === '/ads/retomar') && method === 'POST') {
    const id = Number((await c.body()).id);
    if (!Number.isInteger(id)) fail(400, 'Informe o anúncio.');
    try {
      const r = await (path === '/ads/pausar' ? pausarLancamento(id) : retomarLancamento(id));
      await audit(String(u.codigo), path === '/ads/pausar' ? 'ads-pausar' : 'ads-retomar', 'ads', String(id));
      return json({ ok: true, lancamento: r });
    } catch (e: any) { return fail(409, e.message); }
  }
  if (path === '/ads/arvore' && method === 'GET') {
    const ymd = (v: string) => (/^\d{4}-\d\d-\d\d$/.test(v) ? v : '');
    const ate = ymd(c.qs('ate')) || fmtDate(new Date()), de = ymd(c.qs('de')) || fmtDate(addDays(new Date(), -6));
    if (de > ate) fail(400, 'A data inicial é depois da final.');
    if ((new Date(ate + 'T12:00:00').getTime() - new Date(de + 'T12:00:00').getTime()) / 86400000 > 93) fail(400, 'O período vai até 93 dias.');
    try { return json(await arvore(de, ate, c.qs('arquivados') === '1')); } catch (e: any) { return fail(502, e.message); }
  }
  if (path === '/ads/acoes' && method === 'GET') return json({ rows: await acoesRecentes() });
  if (path === '/ads/editar' && method === 'POST') {
    const b = await c.body();
    try {
      const r = await editarObjeto(strv(b.nivel) as Nivel, strv(b.id), (b.campos ?? {}) as Row, b.confirmou === true, String(u.nome || u.codigo));
      await audit(String(u.codigo), 'ads-editar', 'ads', strv(b.id));
      return json(r);
    } catch (e: any) { return fail(/Meta recusou/.test(e.message) ? 502 : 400, e.message); }
  }
  if (path === '/ads/duplicar' && method === 'POST') {
    const b = await c.body();
    try {
      const r = await duplicarObjeto(strv(b.nivel) as Nivel, strv(b.id), String(u.nome || u.codigo));
      await audit(String(u.codigo), 'ads-duplicar', 'ads', strv(b.id));
      return json(r);
    } catch (e: any) { return fail(/Meta recusou/.test(e.message) ? 502 : 400, e.message); }
  }
  if (path === '/ads/pausar-tudo' && method === 'POST') {
    const r = await pausarTudo();
    await audit(String(u.codigo), 'ads-pausar-tudo', 'ads', String(r.pausados));
    return json({ ok: true, ...r });
  }
  return fail(404, 'Rota não encontrada.');
}
