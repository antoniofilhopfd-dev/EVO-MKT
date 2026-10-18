import { Ctx } from '../ctx';
import { requireInternal, requireAdmin } from '../auth';
import { audit } from '../records';
import { setSetting, setting } from '../settings';
import { fail, Row, strv } from '../util';
import { metaConnected } from '../integrations/meta';
import { cfgRegras, enviarRelatorioSemanal, excluirRascunho, rascunhos, rodarRegras, salvarRascunho, salvarRegras } from '../integrations/metaadsExtras';
import { avaliarLimitesGasto, publicosConta, quebra, salvarLimitesGasto, saudeMeta, serieObjeto } from '../integrations/metaadsAnalise';
import { cfgGestao, gestaoPermitida, lancarImpulso, listarLancamentos, ORCAMENTO_MIN_DIA, PADRAO_GESTAO, whatsOk, numWhats, pausarLancamento, pausarTudo, previaImpulso, resolverCidade, retomarLancamento, PedidoImpulso } from '../integrations/metaadsGestao';
import { acoesRecentes, arvore, duplicarObjeto, editarObjeto, Nivel, vincularConteudo } from '../integrations/metaadsGerenciador';
import { addDays, fmtDate } from '../util';
import { lancarCampanha, opcoesCampanha, pesquisarInteresse, previaCampanha, Spec } from '../integrations/metaadsCampanha';
import { json } from './handlers';

/** Rotas do Gestor de Anúncios. Todas só da Gerência. */
function pedido(b: Row): PedidoImpulso {
  return { chave: strv(b.chave), midia: strv(b.midia), orcamentoDia: Number(b.orcamentoDia), dias: Number(b.dias), objetivo: strv(b.objetivo).toUpperCase() as PedidoImpulso['objetivo'] };
}
const faixa = (v: unknown, min: number, max: number, nome: string) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) fail(400, `${nome} deve estar entre ${min} e ${max}.`); return n; };

export async function gestaoAnunciosRoute(c: Ctx) {
  const { path, method } = c;
  const u = await requireInternal(c);
  // Modo do Tráfego: por padrão SOMENTE LEITURA (métricas). Criar/editar/pausar anúncios só com a chave ligada em Administração → Integrações.
  const completo = (await setting('trafego_gestao')) === '1';
  // ligar a escrita na Meta, mudar tetos e ligar automações são decisões de configuração: só o Administrador
  if (method === 'POST' && ['/ads/modo', '/ads/gestao/config', '/ads/regras', '/ads/relatorio-semanal'].includes(path)) await requireAdmin(c);
  if (path === '/ads/modo') {
    if (method === 'POST') {
      const b = await c.body();
      await setSetting('trafego_gestao', b.gestao === true ? '1' : '0');
      await audit(String(u.codigo), 'ads-modo', 'ads', b.gestao === true ? 'completo' : 'leitura');
      return json({ ok: true, gestao: b.gestao === true });
    }
    return json({ gestao: completo });
  }
  const ESCRITA = ['/ads/gestao/config', '/ads/previa', '/ads/impulsionar', '/ads/pausar', '/ads/retomar', '/ads/pausar-tudo', '/ads/editar', '/ads/duplicar', '/ads/campanha/opcoes', '/ads/campanha/interesses', '/ads/campanha/previa', '/ads/campanha/lancar', '/ads/regras', '/ads/regras/simular', '/ads/rascunhos'];
  if (!completo && ESCRITA.includes(path)) fail(403, 'O Tráfego está em modo somente leitura (só métricas). Para criar ou editar anúncios pelo sistema, ligue o modo completo em Administração → Integrações.');
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
    if ('whatsapp' in b) {
      const w = strv(b.whatsapp).trim();
      if (w && !whatsOk(w)) fail(400, 'Número de WhatsApp inválido. Use DDI e DDD (ex.: +55 83 99999-9999).');
      await setSetting('ads_whatsapp', w ? numWhats(w) : '');
    }
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
    if ((new Date(ate + 'T12:00:00').getTime() - new Date(de + 'T12:00:00').getTime()) / 86400000 > 400) fail(400, 'O período vai até 400 dias.');
    try { return json(await arvore(de, ate, c.qs('arquivados') === '1')); } catch (e: any) { return fail(502, e.message); }
  }
  if (path === '/ads/extras' && method === 'GET') {
    return json({ gestao: completo, regras: await cfgRegras(), relatorioSemanal: (await setting('ads_relatorio_semanal')) === '1', rascunhos: await rascunhos() });
  }
  if (path === '/ads/regras' && method === 'POST') {
    const b = await c.body();
    const r = await salvarRegras(b);
    await audit(String(u.codigo), 'ads-regras', 'ads', r.ativa ? 'ativa' : 'desligada');
    return json({ ok: true, regras: r });
  }
  if (path === '/ads/regras/simular' && method === 'POST') {
    try { return json(await rodarRegras(true)); } catch (e: any) { return fail(502, e.message); }
  }
  if (path === '/ads/relatorio-semanal' && method === 'POST') {
    const b = await c.body();
    if ('ativo' in b) await setSetting('ads_relatorio_semanal', b.ativo ? '1' : '0');
    if (b.enviarAgora === true) { try { await enviarRelatorioSemanal(true); } catch (e: any) { return fail(502, e.message); } }
    return json({ ok: true, ativo: (await setting('ads_relatorio_semanal')) === '1' });
  }
  if (path === '/ads/rascunhos' && method === 'POST') {
    const b = await c.body();
    if (strv(b.excluir)) { await excluirRascunho(strv(b.excluir)); return json({ ok: true, rascunhos: await rascunhos() }); }
    try { const r = await salvarRascunho(strv(b.nome), b.dados, strv(b.id) || undefined); return json({ ok: true, rascunho: r, rascunhos: await rascunhos() }); } catch (e: any) { return fail(400, e.message); }
  }
  if (path === '/ads/vinculo' && method === 'POST') { // metadado local do EVO MKT (não altera nada na Meta): liga um anúncio a um Conteúdo
    const b = await c.body();
    try { await vincularConteudo(strv(b.ad), strv(b.conteudo), String(u.nome || u.codigo)); } catch (e: any) { return fail(400, e.message); }
    await audit(String(u.codigo), 'ads-vinculo', 'ads', strv(b.ad));
    return json({ ok: true });
  }
  if (path === '/ads/acoes' && method === 'GET') return json({ rows: await acoesRecentes() });
  // ---- análises (somente leitura) ----
  const ymd = (v: string) => (/^\d{4}-\d\d-\d\d$/.test(v) ? v : '');
  if (path === '/ads/serie' && method === 'GET') {
    try { return json({ rows: await serieObjeto(c.qs('id'), ymd(c.qs('de')), ymd(c.qs('ate'))) }); } catch (e: any) { return fail(/Meta|conta/.test(e.message) ? 502 : 400, e.message); }
  }
  if (path === '/ads/quebra' && method === 'GET') {
    try { return json({ rows: await quebra(c.qs('por'), ymd(c.qs('de')), ymd(c.qs('ate'))) }); } catch (e: any) { return fail(/Meta|conta/.test(e.message) ? 502 : 400, e.message); }
  }
  if (path === '/ads/publicos' && method === 'GET') {
    try { return json({ rows: await publicosConta() }); } catch (e: any) { return fail(502, e.message); }
  }
  if (path === '/ads/saude' && method === 'GET') return json(await saudeMeta());
  if (path === '/ads/limites' && method === 'GET') return json({ rows: await avaliarLimitesGasto(false) });
  if (path === '/ads/limites' && method === 'POST') {
    try { const r = await salvarLimitesGasto((await c.body()).rows); await audit(String(u.codigo), 'ads-limites', 'ads', String(r.length)); return json({ ok: true, rows: await avaliarLimitesGasto(false) }); } catch (e: any) { return fail(400, e.message); }
  }
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
  if (path === '/ads/campanha/opcoes' && method === 'GET') { try { return json(await opcoesCampanha()); } catch (e: any) { return fail(502, e.message); } }
  if (path === '/ads/campanha/interesses' && method === 'GET') {
    const t = c.qs('q').trim();
    if (t.length < 2) return json({ rows: [] });
    try { return json({ rows: await pesquisarInteresse(t.slice(0, 60)) }); } catch (e: any) { return fail(502, e.message); }
  }
  if (path === '/ads/campanha/previa' && method === 'POST') return json(await previaCampanha((await c.body()) as unknown as Spec));
  if (path === '/ads/campanha/lancar' && method === 'POST') {
    const b = await c.body();
    if (b.confirmou !== true) fail(400, 'Confirme o lançamento na tela de resumo.');
    try {
      const r = await lancarCampanha(b.spec as Spec, String(u.nome || u.codigo));
      await audit(String(u.codigo), 'ads-campanha', 'ads', String(r.id));
      return json({ ok: true, lancamento: r });
    } catch (e: any) { return fail(502, e.message); }
  }
  if (path === '/ads/pausar-tudo' && method === 'POST') {
    const r = await pausarTudo();
    await audit(String(u.codigo), 'ads-pausar-tudo', 'ads', String(r.pausados));
    return json({ ok: true, ...r });
  }
  return fail(404, 'Rota não encontrada.');
}
