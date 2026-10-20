import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { q, q1 } from '../db';
import { listRows } from '../records';
import { setting } from '../settings';
import { addDays, fail, fmtDate, parseLocal, Row, strv } from '../util';
import { alertasTrafego, saudeConta } from '../integrations/metaads';
import { contasMonitoradas, igContaValida } from '../integrations/meta';
import { ocorrencias } from './datacom';
import { json } from './handlers';

/**
 * Dashboard de marketing: resumo do Instagram, do Tráfego Pago e do calendário, só com dados já sincronizados no banco
 * (nenhuma chamada à Meta aqui, para abrir rápido e continuar funcionando se a Meta estiver fora do ar).
 * Métrica que a Meta não entregou volta como null (nunca como zero).
 */
const somar = (s: string, n: number) => fmtDate(addDays(parseLocal(s + 'T12:00:00'), n));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function instagram(de: string, ate: string, hoje: string, contaPedida = ''): Promise<Row> {
  const principal = await setting('ig_user_id');
  const conta = contaPedida ? await igContaValida(contaPedida) : principal;
  const varias = (await contasMonitoradas().catch(() => [])).length > 1;
  const conectado = !!conta && (await setting('meta_token_invalido')) !== '1';
  const seg = conta ? await q('SELECT dia,seguidores FROM ig_seguidores WHERE conta=? AND dia>=? AND dia<=? ORDER BY dia', [conta, somar(de, -1), ate]) : [];
  const serie = seg.map((r) => ({ dia: String(r.dia), seguidores: num(r.seguidores) }));
  const posts = conta ? await q('SELECT media_id,publicado_em,tipo,legenda,curtidas,comentarios,alcance,visualizacoes,salvos,permalink,miniatura FROM ig_posts WHERE conta=? AND SUBSTR(publicado_em,1,10)>=? AND SUBSTR(publicado_em,1,10)<=? ORDER BY publicado_em DESC', [conta, de, ate]) : [];
  const inter = (p: Row) => num(p.curtidas) + num(p.comentarios) + num(p.salvos);
  const melhor = [...posts].sort((a, b) => inter(b) - inter(a))[0];
  const comAlcance = posts.filter((p) => p.alcance !== null && p.alcance !== undefined);
  const programadas = (await listRows('conteudos'))
    .filter((r) => strv(r.publicacaoEm).slice(0, 10) >= hoje && !/PUBLICADO|ARQUIV/i.test(strv(r.status)) && (!varias || (strv(r.contaInstagram) || principal) === conta))
    .sort((a, b) => strv(a.publicacaoEm).localeCompare(strv(b.publicacaoEm))).slice(0, 5)
    .map((r) => ({ id: r.id, titulo: r.titulo, quando: strv(r.publicacaoEm), formato: strv(r.formato), canal: strv(r.canal), status: strv(r.status) }));
  return {
    conectado, ultimaSync: await setting('ig_last_sync'),
    seguidores: serie.length ? serie[serie.length - 1].seguidores : null,
    variacaoSeguidores: serie.length > 1 ? serie[serie.length - 1].seguidores - serie[0].seguidores : null,
    serieSeguidores: serie,
    publicacoes: posts.length, interacoes: posts.length ? posts.reduce((a, p) => a + inter(p), 0) : null,
    alcance: comAlcance.length ? comAlcance.reduce((a, p) => a + num(p.alcance), 0) : null,
    visualizacoes: posts.some((p) => p.visualizacoes !== null && p.visualizacoes !== undefined) ? posts.reduce((a, p) => a + num(p.visualizacoes), 0) : null,
    melhor: melhor ? { legenda: strv(melhor.legenda).slice(0, 90), interacoes: inter(melhor), visualizacoes: melhor.visualizacoes === null || melhor.visualizacoes === undefined ? null : num(melhor.visualizacoes), miniatura: strv(melhor.miniatura), link: strv(melhor.permalink), tipo: strv(melhor.tipo) } : null,
    programadas,
  };
}

async function trafego(de: string, ate: string, dias: number): Promise<Row> {
  const conta = await setting('meta_ads_conta');
  const antDe = somar(de, -dias), antAte = somar(de, -1);
  const soma = async (a: string, b: string) => q1('SELECT COUNT(*) n, COALESCE(SUM(gasto),0) gasto, COALESCE(SUM(impressoes),0) impressoes, COALESCE(SUM(cliques),0) cliques, COALESCE(SUM(resultados),0) resultados, COALESCE(SUM(conversas),0) conversas, MAX(moeda) moeda FROM ads_diario WHERE dia>=? AND dia<=?', [a, b]);
  const atual = await soma(de, ate), ant = await soma(antDe, antAte);
  const serie = (await q('SELECT dia,gasto,impressoes,cliques,resultados,conversas FROM ads_diario WHERE dia>=? AND dia<=? ORDER BY dia', [de, ate])).map((r) => ({ dia: String(r.dia), gasto: num(r.gasto), impressoes: num(r.impressoes), cliques: num(r.cliques), resultados: num(r.resultados), conversas: num(r.conversas) }));
  const per = ate.slice(0, 7);
  const camps = await q('SELECT campanha_id,campanha,gasto,resultados,conversas,status,moeda FROM ads_snapshots WHERE periodo=? ORDER BY gasto DESC', [per]);
  const ativas = camps.filter((c) => /ACTIVE/i.test(strv(c.status)));
  const tem = num(atual?.n) > 0;
  const fm = (r: Row | null | undefined) => r ? { investimento: num(r.gasto), impressoes: num(r.impressoes), cliques: num(r.cliques), conversas: num(r.conversas), resultados: num(r.resultados), dias: num(r.n) } : null;
  return {
    conectado: !!conta, conta, moeda: strv(atual?.moeda) || 'BRL', temDados: tem,
    atual: tem ? fm(atual) : null, anterior: num(ant?.n) > 0 ? fm(ant) : null, serie,
    campanhasAtivas: camps.length ? ativas.length : null,
    ctr: tem && num(atual?.impressoes) > 0 ? (num(atual?.cliques) / num(atual?.impressoes)) * 100 : null,
    custoPorConversa: tem && num(atual?.conversas) > 0 ? num(atual?.gasto) / num(atual?.conversas) : null,
    topCampanhas: camps.slice(0, 3).map((c) => ({ id: strv(c.campanha_id), nome: strv(c.campanha), gasto: num(c.gasto), conversas: num(c.conversas), status: strv(c.status) })),
  };
}

export async function dashboardRoute(c: Ctx): Promise<Response> {
  const u = await requireInternal(c);
  if (c.path !== '/dashboard/resumo') return fail(404, 'Rota não encontrada.');
  const hoje = fmtDate(new Date());
  const dias = [7, 14, 30, 90].includes(Number(c.qs('dias'))) ? Number(c.qs('dias')) : 30;
  const de = somar(hoje, -(dias - 1));
  const lim = somar(hoje, 30);

  // próximos eventos: calendário escolar e compromissos do marketing; datas comemorativas à parte
  const eventos: Row[] = [];
  for (const e of await listRows('calescolar')) if (strv(e.dataFim || e.dataInicio) >= hoje && strv(e.dataInicio) <= lim) eventos.push({ id: e.id, titulo: e.titulo, data: e.dataInicio, fim: e.dataFim, hora: e.horaInicio ?? '', categoria: 'Evento escolar' });
  for (const mod of ['calendario', 'agenda']) {
    for (const r of await listRows(mod)) {
      const bruto = strv(r.inicioEm || r.dataInicio), data = bruto.slice(0, 10);
      if (!data || data < hoje || data > lim || /CANCEL/i.test(strv(r.status))) continue;
      let hora = bruto.length > 10 ? bruto.slice(11, 16) : '';
      if (hora === '00:00' || /^s/i.test(strv(r.diaInteiro))) hora = '';
      eventos.push({ id: r.id, titulo: r.titulo, data, hora, categoria: strv(r.tipoItem) || 'Compromisso' });
    }
  }
  eventos.sort((a, b) => strv(a.data + (a.hora || '')).localeCompare(strv(b.data + (b.hora || ''))));
  const datas = (await ocorrencias(Number(hoje.slice(0, 4)), u))
    .filter((d) => d.data >= hoje && d.data <= lim && d.status !== 'pendente' && (d.relevante === 'SIM' || /FERIADO/.test(d.categoria)))
    .sort((a, b) => a.data.localeCompare(b.data)).slice(0, 5).map((d) => ({ id: d.id, nome: d.nome, data: d.data, categoria: d.categoria }));

  // alertas e integrações
  const alertas = (await alertasTrafego().catch(() => [])).slice(0, 5).map((a) => ({ regra: a.regra, campanha: a.campanha, severidade: a.severidade, mensagem: a.mensagem }));
  const integ: Row[] = [];
  if ((await setting('meta_token_invalido')) === '1') integ.push({ nome: 'Meta (Instagram e anúncios)', msg: 'O acesso expirou ou foi revogado. Reconecte em Configurações → Integrações.' });
  const sync = await setting('ig_last_sync');
  if (sync && Date.now() - new Date(sync).getTime() > 36 * 3600 * 1000) integ.push({ nome: 'Instagram', msg: `Última sincronização em ${sync.slice(0, 10)}.` });
  const saude = await saudeConta().catch(() => null);
  if (saude && !saude.ok) integ.push({ nome: 'Conta de anúncios', msg: `A Meta informa: ${saude.rotulo}.` });

  return json({ hoje, dias, de, ate: hoje, eu: { nome: u.nome, admin: !!Number(u.admin) }, instagram: await instagram(de, hoje, hoje, c.qs('conta')), trafego: await trafego(de, hoje, dias), eventos: eventos.slice(0, 6), datas, alertas, integracoes: integ });
}
