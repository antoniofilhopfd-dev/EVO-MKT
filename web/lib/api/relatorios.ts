import { Ctx } from '../ctx';
import { q } from '../db';
import { requireInternal, requireManager } from '../auth';
import { adsSnapshots } from '../integrations/metaads';
import { audit, insertRow, listRows } from '../records';
import { setting } from '../settings';
import { fail, now, Row, strv } from '../util';
import { json } from './handlers';

const mes = (s: string) => (/^\d{4}-\d{2}$/.test(s) ? s : '');
const soma = (rows: Row[], k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const maxData = (xs: unknown[]) => xs.map(String).filter(Boolean).sort().pop() ?? '';

/**
 * Painel integrado de relatórios. Cada bloco informa FONTE, PERÍODO e ÚLTIMA ATUALIZAÇÃO.
 * Fontes diferentes nunca são somadas entre si (dado automático x registro manual, moedas diferentes).
 */
export async function visaoGeral(de: string, ate: string): Promise<Row> {
  const dentro = (p: unknown) => { const x = String(p ?? '').slice(0, 7); return x >= de && x <= ate; };
  // 1) redes sociais
  const ig = (await listRows('instagram')).filter((r) => dentro(r.periodo || r.dataInicio));
  const igApi = ig.filter((r) => r.origem === 'INSTAGRAM_API');
  const igManual = ig.filter((r) => r.origem !== 'INSTAGRAM_API');
  const posts = await q('SELECT COUNT(*) n, COALESCE(SUM(curtidas+comentarios),0) i, MAX(atualizado_em) u FROM ig_posts WHERE SUBSTRING(publicado_em,1,7) BETWEEN ? AND ?', [de, ate]);
  const redes = {
    fonte: 'Instagram (API oficial) e registros manuais, separados', periodo: { de, ate },
    instagramApi: { meses: igApi.map((r) => ({ periodo: r.periodo, seguidores: Number(r.seguidores) || 0, alcance: Number(r.alcance) || 0, impressoes: Number(r.impressoes) || 0, interacoes: Number(r.interacoes) || 0 })), atualizadoEm: maxData(igApi.map((r) => r.ultimaSincronizacao)), publicacoes: Number(posts[0]?.n ?? 0), interacoesPublicacoes: Number(posts[0]?.i ?? 0) },
    registrosManuais: { meses: igManual.map((r) => ({ periodo: r.periodo, titulo: r.titulo, seguidores: Number(r.seguidores) || 0, alcance: Number(r.alcance) || 0, interacoes: Number(r.interacoes) || 0 })), atualizadoEm: maxData(igManual.map((r) => r.atualizadoEm)) },
    aviso: igApi.length && igManual.length ? 'Há dados da API e registros manuais no período: use um ou outro para o mesmo mês, para não contar duas vezes.' : '',
    canaisSemIntegracao: ['TikTok', 'YouTube'],
  };
  // 2) tráfego pago
  const snaps = (await adsSnapshots()).filter((r) => dentro(r.periodo));
  const porMoeda = new Map<string, Row[]>();
  for (const s of snaps) (porMoeda.get(String(s.moeda) || '—') ?? porMoeda.set(String(s.moeda) || '—', []).get(String(s.moeda) || '—')!).push(s);
  const trafegoManual = (await listRows('trafego')).filter((r) => dentro(r.periodo || r.dataInicio));
  const trafego = {
    fonte: 'Meta Ads (leitura pela API) e registros manuais, separados', periodo: { de, ate }, conta: await setting('meta_ads_conta'),
    meta: {
      atualizadoEm: maxData(snaps.map((r) => r.atualizado_em)), moedas: [...porMoeda.entries()].map(([moeda, rs]) => ({ moeda, gasto: soma(rs, 'gasto'), impressoes: soma(rs, 'impressoes'), alcanceSomaPorCampanha: soma(rs, 'alcance'), cliques: soma(rs, 'cliques'), resultados: soma(rs, 'resultados') })),
      campanhas: snaps.map((r) => ({ campanha: r.campanha, periodo: r.periodo, status: r.status, objetivo: r.objetivo, gasto: Number(r.gasto), moeda: r.moeda, impressoes: Number(r.impressoes), cliques: Number(r.cliques), resultados: Number(r.resultados), orcamentoDiario: Number(r.orcamento_diario) })),
      observacao: 'Alcance não é somável entre campanhas (públicos se sobrepõem): o total é a soma simples e não equivale ao alcance único.',
    },
    registrosManuais: { atualizadoEm: maxData(trafegoManual.map((r) => r.atualizadoEm)), linhas: trafegoManual.map((r) => ({ titulo: r.titulo, periodo: r.periodo, investimento: Number(r.investimento) || 0, impressoes: Number(r.impressoes) || 0, cliques: Number(r.cliques) || 0, leads: Number(r.leads) || 0 })), moeda: 'não informada nos registros manuais' },
    aviso: snaps.length && trafegoManual.length ? 'Há dados da Meta e registros manuais no período: eles NÃO são somados. Confira para não contar o mesmo investimento duas vezes.' : '',
  };
  // 3) planejado x gasto por campanha vinculada (orçamento planejado fica em Campanhas; gasto real vem da Meta/registro)
  const campanhas = (await listRows('campanhas')).map((c) => ({ id: c.id, titulo: c.titulo, orcamentoPlanejado: Number(c.orcamento) || 0, metaAdsId: strv(c.metaAdsId), status: c.status }));
  const planejadoVsReal = campanhas.map((c) => {
    const reais = snaps.filter((s) => c.metaAdsId && String(s.campanha_id) === c.metaAdsId);
    return { ...c, gastoReal: reais.length ? soma(reais, 'gasto') : null, moeda: reais[0]?.moeda ?? '', fonteGasto: reais.length ? 'Meta Ads' : 'sem vínculo (informe o ID Meta Ads na campanha)' };
  });
  return {
    geradoEm: now(), periodo: { de, ate },
    redes, trafego: { ...trafego, planejadoVsReal },
    institucionais: { disponivel: false, motivo: 'Nenhuma fonte autorizada configurada para indicadores institucionais (ex.: matrículas). Nada é estimado.' },
    operacionais: { disponivel: true, ondeVer: 'Indicadores operacionais (SLA, carga, NPS) ficam em Visão geral → Central Operacional e usam /api/indicadores.' },
  };
}

export async function relatoriosRoute(c: Ctx) {
  const { path, method } = c;
  const u = await requireInternal(c);
  const hoje = new Date();
  const padrao = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  if (path === '/reports/overview') {
    const de = mes(c.qs('de')) || padrao, ate = mes(c.qs('ate')) || de;
    if (de > ate) fail(400, 'O mês inicial não pode ser depois do final.');
    return json(await visaoGeral(de, ate));
  }
  if (path === '/reports/save' && method === 'POST') {
    await requireManager(c);
    const b = await c.body();
    const de = mes(strv(b.de)) || padrao, ate = mes(strv(b.ate)) || de;
    const dados = await visaoGeral(de, ate);
    const rel = await insertRow('relatorios', { titulo: `Painel integrado ${de}${ate !== de ? ' a ' + ate : ''}`, tipoRelatorio: 'Painel integrado', periodo: de === ate ? de : `${de} a ${ate}`, status: 'GERADO', snapshot: JSON.stringify(dados).slice(0, 200000), descricao: 'Cópia fiel dos dados no momento da geração (fonte e data em cada bloco).' }, String(u.codigo));
    await audit(String(u.codigo), 'relatorio-salvo', 'relatorios', String(rel.id));
    return json({ ok: true, id: rel.id });
  }
  return fail(404, 'Rota não encontrada.');
}
