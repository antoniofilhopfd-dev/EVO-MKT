import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { setting } from '../settings';
import { fail, Row } from '../util';
import { saudeConta } from '../integrations/metaads';
import { metaConnected } from '../integrations/meta';
import { filtrarTabelaTrafego, validarFiltroStatus, hojeFortaleza, resumoTrafego, ultimaSincronizacao, versaoApi } from '../integrations/trafego';
import { json } from './handlers';

/**
 * Tráfego Pago: SOMENTE CONSULTA. Qualquer método diferente de GET devolve 405; rotas de criação/edição que existiram antes não existem mais (404).
 * Criar e administrar anúncios continua no Gerenciador de Anúncios da Meta.
 */
const csvCel = (v: unknown) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replaceAll('"', '""') + '"'; };
const br = (n: number | null, casas = 2) => (n === null ? '' : n.toFixed(casas).replace('.', ','));

export async function trafegoRoute(c: Ctx): Promise<Response> {
  await requireInternal(c);
  if (c.method !== 'GET') return fail(405, 'O Tráfego Pago é somente consulta. Para criar, editar, ativar ou pausar anúncios, use o Gerenciador de Anúncios da Meta.');
  const { path } = c;
  const filtrar = c.url.searchParams.has('status');
  const status = c.qs('status') || 'todos', nivel = c.qs('nivel') || 'campanhas';
  if (filtrar) validarFiltroStatus(status, nivel);
  const recortar = (d: Row) => filtrar ? filtrarTabelaTrafego(d, status, nivel) : d;
  if (path === '/trafego/estado') {
    return json({
      conectado: await metaConnected(), contaEscolhida: !!(await setting('meta_ads_conta')), tokenInvalido: (await setting('meta_token_invalido')) === '1',
      ultimaSincronizacao: await ultimaSincronizacao(), versaoApi: versaoApi(), hoje: hojeFortaleza(), fuso: 'America/Fortaleza',
    });
  }
  if (path === '/trafego/conta') {
    try { return json({ saude: await saudeConta() }); } catch (e: any) { return fail(502, e.message); }
  }
  if (path === '/trafego/resumo' || path === '/trafego/relatorio') {
    try { return json(recortar(await resumoTrafego(c.qs('de'), c.qs('ate'), c.qs('tipo'), c.qs('forcar') === '1'))); } catch (e: any) { if (e.status) throw e; return fail(502, String(e.message).replace(/access_token=[^&\s"]+/g, 'access_token=***')); }
  }
  if (path === '/trafego/csv') {
    let d: Row;
    try { d = recortar(await resumoTrafego(c.qs('de'), c.qs('ate'), c.qs('tipo'))); } catch (e: any) { if (e.status) throw e; return fail(502, String(e.message).replace(/access_token=[^&\s"]+/g, 'access_token=***')); }
    const nivelCsv = ['anuncios', 'conjuntos'].includes(c.qs('nivel')) ? c.qs('nivel') : 'campanhas', anuncios = nivelCsv !== 'campanhas';
    const cab = anuncios ? [nivelCsv === 'conjuntos' ? 'Conjunto' : 'Anúncio', 'Campanha', 'Status', 'Investimento', 'Impressões', 'Alcance', 'Cliques', 'CTR (%)', 'CPC', 'Conversas iniciadas', 'Custo por conversa'] : ['Campanha', 'Status', 'Investimento', 'Impressões', 'Alcance', 'Cliques', 'CTR (%)', 'CPC', 'Conversas iniciadas', 'Custo por conversa'];
    const linhas = ((d[nivelCsv] ?? []) as Row[]).map((x) => (anuncios ? [x.nome, x.campanha, x.statusRotulo] : [x.nome, x.statusRotulo]).concat([br(x.investimento), String(x.impressoes), x.alcance === null ? '' : String(x.alcance), String(x.cliques), br(x.ctr), br(x.cpc), String(x.conversas), br(x.custoConversa)]));
    const t = (d.tabela?.total || d.atual) as Row;
    linhas.push((anuncios ? ['TOTAL', '', ''] : ['TOTAL', '']).concat([br(t.investimento as number), String(t.impressoes), t.alcance === null ? '' : String(t.alcance), String(t.cliques), br(t.ctr as number | null), br(t.cpc as number | null), String(t.conversas), br(t.custoConversa as number | null)]));
    const p = d.periodo as Row;
    const csv = '﻿' + [cab, ...linhas].map((l) => l.map(csvCel).join(';')).join('\r\n') + '\r\n';
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="trafego_${nivelCsv}_${p.de}_${p.ate}.csv"`, 'Cache-Control': 'no-store' } });
  }
  return fail(404, 'Rota não encontrada.');
}
