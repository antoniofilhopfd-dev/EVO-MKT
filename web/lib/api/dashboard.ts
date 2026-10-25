import { Ctx } from '../ctx';
import { requireInternal } from '../auth';
import { listRows } from '../records';
import { setting } from '../settings';
import { fail, Row, strv } from '../util';
import { saudeConta } from '../integrations/metaads';
import { metaConnected } from '../integrations/meta';
import { hojeFortaleza, resumoDaUltimaSincronizacao, resumoTrafego } from '../integrations/trafego';
import { conteudoCabe, lerFiltros } from '../filtros';
import { materiaisAtivos, pendencias, statusAtual } from '../conteudo';
import { melhorPost, organico, resumoOrganico } from '../painel';
import { gerarInsights } from '../insights';
import { json } from './handlers';

/**
 * Dashboard: decisões do Marketing em uma tela. Só lê o que já está no sistema (publicações, Instagram sincronizado)
 * e o resumo do Tráfego (consulta somente leitura à Meta, com cache). Cada cartão devolve os `ids` que ele conta,
 * para abrir exatamente esses registros em Instagram › Conteúdos.
 */
const dia = (r: Row) => strv(r.publicacaoEm).slice(0, 10);
const pub = (r: Row) => ({ id: r.id, titulo: strv(r.titulo) || '(sem título)', quando: strv(r.publicacaoEm), perfil: strv(r.perfil), segmento: strv(r.segmento), formato: strv(r.formato), status: statusAtual(r.status), responsavel: strv(r.responsavel), faltas: pendencias(r).map((p) => p.texto) });

export async function dashboardRoute(c: Ctx): Promise<Response> {
  await requireInternal(c);
  if (c.path !== '/dashboard/resumo') return fail(404, 'Rota não encontrada.');
  const f = lerFiltros(c);
  const hoje = hojeFortaleza();
  // publicações olham para frente (planejadas, agendadas…); Instagram e Tráfego só existem até hoje
  const ateDados = f.ate > hoje ? hoje : f.ate;
  const fDados = { ...f, ate: ateDados < f.de ? f.de : ateDados };

  const todos = (await listRows('conteudos')).filter((r) => conteudoCabe(r, f) && statusAtual(r.status) !== 'ARQUIVADO');
  const noPeriodo = todos.filter((r) => dia(r) >= f.de && dia(r) <= f.ate);
  const ids = (xs: Row[]) => xs.map((r) => String(r.id)).slice(0, 200);
  const cartao = (xs: Row[]) => ({ total: xs.length, ids: ids(xs) });
  const abertas = (xs: Row[]) => xs.filter((r) => statusAtual(r.status) !== 'PUBLICADO');
  const publicacoes = {
    planejadas: cartao(noPeriodo),
    aprovadas: cartao(noPeriodo.filter((r) => statusAtual(r.status) === 'APROVADO')),
    agendadas: cartao(noPeriodo.filter((r) => statusAtual(r.status) === 'AGENDADO')),
    publicadas: cartao(noPeriodo.filter((r) => statusAtual(r.status) === 'PUBLICADO')),
    aguardandoRevisao: cartao(todos.filter((r) => statusAtual(r.status) === 'EM REVISÃO')),
    semArte: cartao(abertas(noPeriodo).filter((r) => !materiaisAtivos(r, 'final').length && !strv(r.midiaInstagram))),
    semLegenda: cartao(abertas(noPeriodo).filter((r) => !strv(r.legenda).trim())),
    semData: cartao(abertas(todos).filter((r) => !strv(r.publicacaoEm).trim())),
  };
  const proximas = abertas(todos).filter((r) => dia(r) >= hoje).sort((a, b) => strv(a.publicacaoEm).localeCompare(strv(b.publicacaoEm))).slice(0, 8).map(pub);

  const org = await organico(fDados);
  const ig = {
    conectado: (await metaConnected()) && (await setting('meta_token_invalido')) !== '1', ultimaSync: await setting('ig_last_sync'),
    contas: org.contas.map((x) => x.usuario), ...resumoOrganico(org), melhor: melhorPost(org),
    semEfeito: org.semEfeito,
    origem: { fonte: 'Instagram (API oficial da Meta, orgânico)', periodo: `${f.de} a ${fDados.ate}`, atualizadoEm: await setting('ig_last_sync'), natureza: 'publicações do período sincronizadas' },
  };

  // Tráfego: consulta somente leitura (o filtro de perfil/segmento/formato/campanha editorial não existe na Meta; o aviso diz isso)
  let trafego: Row;
  const semEfeito = (['perfil', 'segmento', 'formato', 'campanha'] as const).filter((k) => f[k]);
  try {
    if (f.de > hoje) throw Object.assign(new Error('O período escolhido ainda não começou: a Meta só informa dias que já passaram.'), { status: 409 });
    const t = await resumoTrafego(f.de, ateDados);
    trafego = { disponivel: true, ...pickTrafego(t), semEfeito, origem: t.origem, avisos: t.avisos, _completo: t };
  } catch (e: any) {
    const ult = f.de > hoje ? null : await resumoDaUltimaSincronizacao(f.de, ateDados).catch(() => null);
    trafego = ult
      ? { disponivel: true, atual: ult, anterior: null, variacoes: null, campanhas: [], semEfeito, avisos: ['Consulta direta indisponível agora (' + String(e.message).replace(/access_token=[^&\s"]+/g, '***') + '); mostrando o que foi guardado na última sincronização.'], origem: { fonte: 'Meta Ads (última sincronização guardada)', periodo: `${f.de} a ${ateDados}`, atualizadoEm: await setting('meta_ads_ultima_sync'), natureza: 'acumulado do período' } }
      : { disponivel: false, motivo: String(e.message).replace(/access_token=[^&\s"]+/g, '***'), status: e.status ?? 502, semEfeito };
  }
  const insights = await gerarInsights(fDados, (trafego as Row)._completo ?? null, hoje);
  delete (trafego as Row)._completo;

  const alertas: Row[] = [];
  if ((await setting('meta_token_invalido')) === '1') alertas.push({ nome: 'Meta (Instagram e anúncios)', msg: 'O acesso expirou ou foi revogado. Reconecte em Configurações › Instagram.', pagina: 'configuracoes' });
  const sync = await setting('ig_last_sync');
  if (sync && Date.now() - new Date(sync).getTime() > 36 * 3600 * 1000) alertas.push({ nome: 'Instagram', msg: `Última sincronização em ${sync.slice(0, 10)}.`, pagina: 'configuracoes' });
  const saude = await saudeConta().catch(() => null);
  if (saude && !saude.ok) alertas.push({ nome: 'Conta de anúncios', msg: `A Meta informa: ${saude.rotulo}.`, pagina: 'configuracoes' });
  const google = await setting('google_token_invalido');
  if (google === '1') alertas.push({ nome: 'Google Agenda', msg: 'O acesso ao Google expirou. Reconecte em Configurações › Google.', pagina: 'configuracoes' });

  return json({ hoje, filtros: f, publicacoes, proximas, instagram: ig, trafego, insights, alertas });
}

function pickTrafego(t: Row): Row {
  return { periodo: t.periodo, anterior: t.anterior, atual: t.atual, anteriorTotais: t.anteriorTotais, variacoes: t.variacoes, campanhas: (t.campanhas as Row[]).slice(0, 3), diario: t.diario };
}
