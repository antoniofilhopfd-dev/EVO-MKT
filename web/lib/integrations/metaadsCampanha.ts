import { q, q1, run } from '../db';
import { sha256 } from '../crypto';
import { notifyMail } from '../mail';
import { registrarNotificacao } from '../notificacoes';
import { intLog, setting } from '../settings';
import { now, parseLocal, Row } from '../util';
import { metaConnected, metaGet, metaPost, metaUpload } from './meta';
import { paginar } from './metaads';
import { cfgGestao, contaAds, gestaoPermitida, limitesMes, marcar, menorUnidade, ORCAMENTO_MIN_DIA, paginaDoInstagram, igDoPost } from './metaadsGestao';

/**
 * Nova campanha completa (Etapa B), com todos os objetivos da Meta. Vai ao ar ATIVA. Só a Gerência.
 * As tabelas abaixo dizem, por objetivo, qual meta de otimização, destino e dados extras a Meta exige.
 * Os payloads foram escritos pela documentação e validados só contra o simulador: o primeiro uso real é um teste supervisionado.
 */
type Dado = 'site' | 'form' | 'pixel' | 'app';
interface Meta { rotulo: string; goal: string; destino?: string; exige: Dado[]; criativos: ('POST_IG' | 'IMAGEM')[]; cta?: string; ajuda: string }
interface Objetivo { objective: string; rotulo: string; ajuda: string; metas: Record<string, Meta> }
export const OBJETIVOS: Record<string, Objetivo> = {
  AWARENESS: { objective: 'OUTCOME_AWARENESS', rotulo: 'Reconhecimento', ajuda: 'Mostrar o Colégio para o maior número de pessoas.', metas: {
    REACH: { rotulo: 'Alcance', goal: 'REACH', exige: [], criativos: ['POST_IG', 'IMAGEM'], ajuda: 'Maximiza quantas pessoas diferentes veem.' },
    IMPRESSIONS: { rotulo: 'Impressões', goal: 'IMPRESSIONS', exige: [], criativos: ['POST_IG', 'IMAGEM'], ajuda: 'Maximiza o total de vezes que o anúncio aparece.' } } },
  TRAFFIC: { objective: 'OUTCOME_TRAFFIC', rotulo: 'Tráfego', ajuda: 'Levar pessoas ao site de matrícula ou ao perfil.', metas: {
    LINK_CLICKS: { rotulo: 'Cliques no link', goal: 'LINK_CLICKS', destino: 'WEBSITE', exige: ['site'], criativos: ['IMAGEM'], cta: 'LEARN_MORE', ajuda: 'Mais cliques para o site.' },
    LANDING_PAGE_VIEWS: { rotulo: 'Visualizações da página de destino', goal: 'LANDING_PAGE_VIEWS', destino: 'WEBSITE', exige: ['site'], criativos: ['IMAGEM'], cta: 'LEARN_MORE', ajuda: 'Pessoas que de fato carregam a página.' },
    PROFILE_VISIT: { rotulo: 'Visitas ao perfil do Instagram', goal: 'PROFILE_VISIT', destino: 'INSTAGRAM_PROFILE', exige: [], criativos: ['POST_IG', 'IMAGEM'], ajuda: 'Leva ao perfil @ do Colégio.' } } },
  ENGAGEMENT: { objective: 'OUTCOME_ENGAGEMENT', rotulo: 'Engajamento', ajuda: 'Curtidas, comentários, conversas e visualizações de vídeo.', metas: {
    POST_ENGAGEMENT: { rotulo: 'Engajamento com a publicação', goal: 'POST_ENGAGEMENT', destino: 'ON_POST', exige: [], criativos: ['POST_IG'], ajuda: 'Impulsiona uma publicação existente.' },
    CONVERSATIONS: { rotulo: 'Conversas por mensagem', goal: 'CONVERSATIONS', destino: 'INSTAGRAM_DIRECT', exige: [], criativos: ['POST_IG', 'IMAGEM'], cta: 'INSTAGRAM_MESSAGE', ajuda: 'Pessoas iniciam conversa no Direct (ou Messenger/WhatsApp).' },
    THRUPLAY: { rotulo: 'Visualizações de vídeo (ThruPlay)', goal: 'THRUPLAY', destino: 'ON_VIDEO', exige: [], criativos: ['POST_IG'], ajuda: 'Para um vídeo/Reel já publicado.' } } },
  LEADS: { objective: 'OUTCOME_LEADS', rotulo: 'Cadastros (leads)', ajuda: 'Captar contatos de famílias interessadas.', metas: {
    LEAD_GENERATION: { rotulo: 'Formulário instantâneo', goal: 'LEAD_GENERATION', destino: 'ON_AD', exige: ['form'], criativos: ['IMAGEM'], cta: 'SIGN_UP', ajuda: 'O formulário abre dentro do anúncio.' },
    CONVERSATIONS: { rotulo: 'Conversas por mensagem', goal: 'CONVERSATIONS', destino: 'INSTAGRAM_DIRECT', exige: [], criativos: ['POST_IG', 'IMAGEM'], cta: 'INSTAGRAM_MESSAGE', ajuda: 'Capta o contato numa conversa.' } } },
  SALES: { objective: 'OUTCOME_SALES', rotulo: 'Vendas', ajuda: 'Conversões no site (precisa do pixel da Meta instalado).', metas: {
    OFFSITE_CONVERSIONS: { rotulo: 'Conversões no site', goal: 'OFFSITE_CONVERSIONS', destino: 'WEBSITE', exige: ['site', 'pixel'], criativos: ['IMAGEM'], cta: 'LEARN_MORE', ajuda: 'Otimiza para um evento do pixel (compra, matrícula etc.).' } } },
  APP: { objective: 'OUTCOME_APP_PROMOTION', rotulo: 'Promoção do app', ajuda: 'Instalações de um aplicativo.', metas: {
    APP_INSTALLS: { rotulo: 'Instalações do app', goal: 'APP_INSTALLS', destino: 'APP', exige: ['app'], criativos: ['IMAGEM'], cta: 'INSTALL_MOBILE_APP', ajuda: 'Precisa do ID do app e do link da loja.' } } },
};
export const MENSAGENS: Record<string, string> = { DIRECT: 'INSTAGRAM_DIRECT', MESSENGER: 'MESSENGER', WHATSAPP: 'WHATSAPP' };
export const CTAS = ['LEARN_MORE', 'SIGN_UP', 'CONTACT_US', 'APPLY_NOW', 'GET_QUOTE', 'SHOP_NOW', 'INSTALL_MOBILE_APP', 'MESSAGE_PAGE', 'INSTAGRAM_MESSAGE', 'WHATSAPP_MESSAGE', 'NO_BUTTON'];
export const PLATAFORMAS = ['instagram', 'facebook', 'messenger', 'audience_network'];
export const EVENTOS = ['PURCHASE', 'LEAD', 'COMPLETE_REGISTRATION', 'CONTACT', 'SUBMIT_APPLICATION', 'ADD_TO_CART', 'INITIATE_CHECKOUT', 'VIEW_CONTENT', 'OTHER'];

export interface Spec {
  chave: string; objetivo: string; meta: string; nome?: string;
  publico?: { cidade?: { key: string; nome: string; regiao?: string }; raioKm?: number; idadeMin?: number; idadeMax?: number; genero?: string; interesses?: { id: string; nome: string }[]; publicosPersonalizados?: string[]; plataformas?: string[] };
  orcamento: { tipo: string; valor: number }; inicio?: string; fim?: string; dias?: number;
  lance?: { tipo?: string; valor?: number };
  criativo: { tipo: string; midia?: string; conteudoId?: string; texto?: string; titulo?: string; descricao?: string; cta?: string };
  destino?: { siteUrl?: string; formId?: string; mensagem?: string; whatsapp?: string; pixelId?: string; evento?: string; appId?: string; lojaUrl?: string };
}
const https = (u?: string) => /^https:\/\/[^\s]{4,500}$/.test(String(u ?? ''));
const ID = (v: unknown) => /^[A-Za-z0-9_.-]{3,64}$/.test(String(v ?? ''));

/** Confere TUDO sem escrever na Meta. */
export async function previaCampanha(sp: Spec) {
  const cfg = await cfgGestao();
  if (sp.destino && !String(sp.destino.whatsapp ?? '').trim() && cfg.whatsapp) sp.destino.whatsapp = cfg.whatsapp; // número padrão do Colégio
  const erros: string[] = [], avisos: string[] = [];
  if (!cfg.ativa) erros.push('A gestão de anúncios está desligada. Ligue em Tráfego → Gestor de anúncios e reconecte a Meta.');
  const ob = OBJETIVOS[sp.objetivo], mt = ob?.metas[sp.meta];
  if (!ob) erros.push('Escolha o objetivo da campanha.');
  else if (!mt) erros.push('Escolha o resultado que você quer para esse objetivo.');
  const d = sp.destino ?? {}, pb = sp.publico ?? {}, cr = sp.criativo ?? ({} as Spec['criativo']);
  const cidade = pb.cidade ?? cfg.publico.cidade, raio = Number(pb.raioKm ?? cfg.publico.raioKm), idMin = Number(pb.idadeMin ?? cfg.publico.idadeMin), idMax = Number(pb.idadeMax ?? cfg.publico.idadeMax);
  if (!cidade?.key) erros.push('Defina a cidade do público.');
  if (!(raio >= 1 && raio <= 80)) erros.push('O raio deve estar entre 1 e 80 km.');
  if (!(idMin >= 18 && idMax <= 65 && idMin <= idMax)) erros.push('Faixa de idade inválida (18 a 65, mínima ≤ máxima).');
  if (pb.genero && !['todos', 'mulheres', 'homens'].includes(pb.genero)) erros.push('Gênero inválido.');
  const plats = pb.plataformas?.length ? pb.plataformas : [];
  if (plats.some((x) => !PLATAFORMAS.includes(x))) erros.push('Plataforma de veiculação inválida.');
  if ((pb.interesses ?? []).length > 20 || (pb.publicosPersonalizados ?? []).length > 20) erros.push('Limite de 20 interesses e 20 públicos personalizados.');
  if ((pb.publicosPersonalizados ?? []).some((x) => !ID(x))) erros.push('Público personalizado inválido.');
  // orçamento e datas
  const tipo = String(sp.orcamento?.tipo ?? '').toUpperCase(), valor = Number(sp.orcamento?.valor);
  let inicio = new Date(Date.now() + 120000), fim: Date | null = null;
  try { if (sp.inicio) { inicio = parseLocal(sp.inicio); if (isNaN(inicio.getTime())) throw new Error(); if (inicio.getTime() < Date.now() - 60000) erros.push('O início já passou.'); } } catch { erros.push('Início: use data e hora (AAAA-MM-DDThh:mm).'); }
  try { if (sp.fim) { fim = parseLocal(sp.fim); if (isNaN(fim.getTime())) throw new Error(); } } catch { erros.push('Término: use data e hora (AAAA-MM-DDThh:mm).'); fim = null; }
  if (!fim && sp.dias && Number(sp.dias) >= 1) fim = new Date(inicio.getTime() + Math.floor(Number(sp.dias)) * 86400000);
  if (!fim) erros.push('Defina o término (data e hora) ou a duração em dias: nenhuma campanha fica aberta para sempre.');
  const dias = fim ? Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / 86400000)) : 0;
  if (fim && fim.getTime() <= inicio.getTime()) erros.push('O término precisa ser depois do início.');
  if (dias > cfg.diasMax) erros.push(`A duração (${dias} dias) passa do máximo (${cfg.diasMax} dias).`);
  let compromisso = 0, orcDia = 0;
  if (!['DIARIO', 'TOTAL'].includes(tipo)) erros.push('Escolha orçamento diário ou total.');
  else if (!Number.isFinite(valor) || valor < ORCAMENTO_MIN_DIA) erros.push(`O orçamento mínimo é ${ORCAMENTO_MIN_DIA}.`);
  else if (tipo === 'DIARIO') {
    if (valor > cfg.tetoDia) erros.push(`O orçamento diário (${valor}) passa do teto por campanha (${cfg.tetoDia}).`);
    compromisso = Math.round(valor * dias * 100) / 100; orcDia = valor;
  } else { compromisso = valor; orcDia = dias ? Math.round((valor / dias) * 100) / 100 : valor; if (valor > cfg.tetoMes) erros.push(`O orçamento total (${valor}) passa do teto mensal (${cfg.tetoMes}).`); if (orcDia > cfg.tetoDia) erros.push(`O orçamento total em ${dias} dia(s) dá ${orcDia}/dia, acima do teto por campanha (${cfg.tetoDia}).`); }
  if (sp.lance?.tipo === 'LIMITE_CUSTO' && !(Number(sp.lance.valor) > 0)) erros.push('Informe o valor do limite de custo.');
  // exigências do objetivo
  if (mt) {
    if (mt.exige.includes('site') && !https(d.siteUrl)) erros.push('Informe o endereço https do site de destino.');
    if (mt.exige.includes('form') && !ID(d.formId)) erros.push('Informe o ID do formulário instantâneo (Gerenciador de formulários da Página).');
    if (mt.exige.includes('pixel')) { if (!ID(d.pixelId)) erros.push('Escolha o pixel da Meta.'); if (!EVENTOS.includes(String(d.evento))) erros.push('Escolha o evento do pixel que conta como resultado.'); }
    if (mt.exige.includes('app')) { if (!ID(d.appId)) erros.push('Informe o ID do aplicativo.'); if (!https(d.lojaUrl)) erros.push('Informe o link https da loja (App Store/Google Play).'); }
    if (mt.goal === 'CONVERSATIONS') {
      const m = String(d.mensagem ?? 'DIRECT').toUpperCase();
      if (!MENSAGENS[m]) erros.push('Escolha onde a conversa acontece (Direct, Messenger ou WhatsApp).');
      if (m === 'WHATSAPP' && !/^\+?\d{10,15}$/.test(String(d.whatsapp ?? '').replace(/[\s()-]/g, ''))) erros.push('Informe o número do WhatsApp (com DDI e DDD).');
    }
    const tc = String(cr.tipo ?? '').toUpperCase();
    if (!mt.criativos.includes(tc as 'POST_IG' | 'IMAGEM')) erros.push(`Para esse resultado o anúncio deve usar ${mt.criativos.map((x) => (x === 'POST_IG' ? 'uma publicação do Instagram' : 'uma imagem nova')).join(' ou ')}.`);
    else if (tc === 'POST_IG') { if (!(await q1('SELECT 1 FROM ig_posts WHERE media_id=?', [String(cr.midia ?? '')]))) erros.push('Essa publicação não foi lida do Instagram conectado. Atualize o Desempenho e tente de novo.'); }
    else {
      const c = await q1('SELECT data FROM records WHERE modulo=? AND id=?', ['conteudos', String(cr.conteudoId ?? '')]);
      const rel = c ? String(JSON.parse(String(c.data)).midiaInstagram ?? '') : '';
      if (!/\.jpe?g$/i.test(rel)) erros.push('Escolha uma imagem JPEG anexada a um post do Estúdio.');
      if (!String(cr.texto ?? '').trim()) erros.push('Escreva o texto do anúncio.');
    }
    if (cr.cta && !CTAS.includes(String(cr.cta))) erros.push('Botão de chamada inválido.');
  }
  try { await contaAds(); } catch (e: any) { erros.push(e.message); }
  const moeda = await contaAds().then((c) => c.moeda).catch(() => 'BRL');
  const lm = await limitesMes(compromisso, cfg.tetoMes);
  erros.push(...lm.erros); avisos.push(...lm.avisos);
  return {
    ok: erros.length === 0, erros, avisos, moeda, compromisso, orcamentoDia: orcDia, dias, inicio: now(inicio), fim: fim ? now(fim) : '', gastoMes: lm.gastoMes, pendente: lm.pendente, tetoMes: cfg.tetoMes, tetoDia: cfg.tetoDia,
    resumo: { objetivo: ob?.rotulo ?? '', resultado: mt?.rotulo ?? '', publico: { cidade, raioKm: raio, idadeMin: idMin, idadeMax: idMax, genero: pb.genero ?? 'todos', interesses: (pb.interesses ?? []).map((i) => i.nome), publicosPersonalizados: (pb.publicosPersonalizados ?? []).length }, posicionamento: plats.length ? plats.join(', ') : 'Automático (Advantage+)', orcamento: `${tipo === 'TOTAL' ? 'total' : 'diário'} ${valor}`, lance: sp.lance?.tipo === 'LIMITE_CUSTO' ? `limite de custo ${sp.lance.valor}` : 'menor custo', vaiAoArAtivo: true },
  };
}

export async function enviarImagem(conta: string, conteudoId: string): Promise<string> {
  const c = await q1('SELECT data FROM records WHERE modulo=? AND id=?', ['conteudos', conteudoId]);
  const rel = c ? String(JSON.parse(String(c.data)).midiaInstagram ?? '') : '';
  const f = rel ? await q1('SELECT conteudo FROM arquivos WHERE caminho=?', [rel]) : null;
  if (!f) throw new Error('Não achei a imagem do post escolhido.');
  const r = await metaPost(`/act_${conta}/adimages`, { bytes: (f.conteudo as Buffer).toString('base64') });
  const hash = String(Object.values(r.images ?? {}).map((x: any) => x?.hash)[0] ?? '');
  if (!hash) throw new Error('A Meta não devolveu o código da imagem.');
  return hash;
}

export const EXT_IMAGEM = /\.(jpe?g|png)$/i, EXT_VIDEO = /\.(mp4|mov)$/i;
/** Peça enviada pela equipe (biblioteca de Arquivos): imagem vira `image_hash`; vídeo é enviado, processado e ganha uma miniatura. */
export async function enviarArquivo(conta: string, caminho: string): Promise<{ tipo: 'imagem' | 'video'; hash?: string; videoId?: string; miniatura?: string }> {
  const f = await q1('SELECT conteudo,mime FROM arquivos WHERE caminho=?', [caminho]);
  if (!f) throw new Error('Não achei o arquivo escolhido na biblioteca.');
  const buf = f.conteudo as Buffer, nome = caminho.split('/').pop() || 'arquivo';
  if (EXT_IMAGEM.test(caminho)) {
    const r = await metaPost(`/act_${conta}/adimages`, { bytes: buf.toString('base64') });
    const hash = String(Object.values(r.images ?? {}).map((x: any) => x?.hash)[0] ?? '');
    if (!hash) throw new Error('A Meta não devolveu o código da imagem.');
    return { tipo: 'imagem', hash };
  }
  const r = await metaUpload(`/act_${conta}/advideos`, 'source', nome, String(f.mime || 'video/mp4'), buf, { name: nome.slice(0, 100) });
  const videoId = String(r.id ?? '');
  if (!videoId) throw new Error('A Meta não devolveu o código do vídeo.');
  // o vídeo precisa terminar de ser processado antes de virar anúncio (até ~2 minutos)
  for (let i = 0; i < 24; i++) {
    const st = await metaGet(`/${videoId}`, { fields: 'status' });
    const s = String(st.status?.video_status ?? 'ready');
    if (s === 'ready') break;
    if (s === 'error') throw new Error('A Meta recusou o vídeo. Confira o formato (MP4 ou MOV) e tente outro arquivo.');
    if (i === 23) throw new Error('A Meta ainda está processando o vídeo. Aguarde alguns minutos e confira de novo.');
    await new Promise((x) => setTimeout(x, 5000));
  }
  const th = await metaGet(`/${videoId}/thumbnails`, {});
  const miniatura = String(((th.data ?? []) as Row[]).find((x) => x.is_preferred)?.uri ?? (th.data ?? [])[0]?.uri ?? '');
  return { tipo: 'video', videoId, miniatura };
}

/** Os pedidos à Meta. É o único ponto a ajustar se a Meta recusar algum campo. */
async function montar(sp: Spec, pre: Awaited<ReturnType<typeof previaCampanha>>, o: { conta: string; moeda: string; pagina: string; ig: string; titulo: string; cidade: { key: string } }) {
  const ob = OBJETIVOS[sp.objetivo], mt = ob.metas[sp.meta], d = sp.destino ?? {}, pb = sp.publico ?? {}, cfg = await cfgGestao();
  const campanha = { name: `[EVO MKT] ${o.titulo}`, objective: ob.objective, status: 'ACTIVE', special_ad_categories: '[]', buying_type: 'AUCTION', is_adset_budget_sharing_enabled: 'false' };
  const msg = MENSAGENS[String(d.mensagem ?? 'DIRECT').toUpperCase()];
  const destino = mt.goal === 'CONVERSATIONS' ? msg : mt.destino;
  const promoted: Row | null = mt.goal === 'CONVERSATIONS' ? { page_id: o.pagina, ...(msg === 'WHATSAPP' ? { whatsapp_phone_number: String(d.whatsapp).replace(/[\s()-]/g, '') } : {}) }
    : mt.goal === 'LEAD_GENERATION' ? { page_id: o.pagina }
    : mt.goal === 'OFFSITE_CONVERSIONS' ? { pixel_id: d.pixelId, custom_event_type: d.evento }
    : mt.goal === 'APP_INSTALLS' ? { application_id: d.appId, object_store_url: d.lojaUrl } : null;
  const genero = pb.genero === 'mulheres' ? [2] : pb.genero === 'homens' ? [1] : null;
  const targeting: Row = {
    geo_locations: { cities: [{ key: (pb.cidade ?? cfg.publico.cidade)!.key, radius: pre.resumo.publico.raioKm, distance_unit: 'kilometer' }] }, age_min: pre.resumo.publico.idadeMin, age_max: pre.resumo.publico.idadeMax,
    ...(genero ? { genders: genero } : {}), ...((pb.interesses ?? []).length ? { flexible_spec: [{ interests: (pb.interesses ?? []).map((i) => ({ id: i.id, name: i.nome })) }] } : {}),
    ...((pb.publicosPersonalizados ?? []).length ? { custom_audiences: (pb.publicosPersonalizados ?? []).map((id) => ({ id })) } : {}),
    ...((pb.plataformas ?? []).length ? { publisher_platforms: pb.plataformas } : mt.goal === 'CONVERSATIONS' && msg === 'INSTAGRAM_DIRECT' ? { publisher_platforms: ['instagram'] } : {}),
  };
  const cap = sp.lance?.tipo === 'LIMITE_CUSTO';
  const total = String(sp.orcamento.tipo).toUpperCase() === 'TOTAL';
  const conjunto = {
    name: `[EVO MKT] ${o.titulo} · público`, status: 'ACTIVE', start_time: new Date(Date.now() + 120000).toISOString(), end_time: parseLocal(pre.fim.replace(' ', 'T')).toISOString(),
    ...(total ? { lifetime_budget: menorUnidade(Number(sp.orcamento.valor), o.moeda) } : { daily_budget: menorUnidade(Number(sp.orcamento.valor), o.moeda) }),
    billing_event: 'IMPRESSIONS', optimization_goal: mt.goal, bid_strategy: cap ? 'COST_CAP' : 'LOWEST_COST_WITHOUT_CAP', ...(cap ? { bid_amount: menorUnidade(Number(sp.lance!.valor), o.moeda) } : {}),
    ...(destino ? { destination_type: destino } : {}), ...(promoted ? { promoted_object: JSON.stringify(promoted) } : {}), targeting: JSON.stringify(targeting),
  };
  const cta = sp.criativo.cta || mt.cta || 'LEARN_MORE';
  let criativo: Row;
  if (String(sp.criativo.tipo).toUpperCase() === 'POST_IG') {
    criativo = { name: `[EVO MKT] ${o.titulo} · criativo`, object_id: o.pagina, instagram_user_id: o.ig, source_instagram_media_id: sp.criativo.midia, ...(mt.goal === 'CONVERSATIONS' ? { call_to_action: JSON.stringify({ type: msg === 'WHATSAPP' ? 'WHATSAPP_MESSAGE' : msg === 'MESSENGER' ? 'MESSAGE_PAGE' : 'INSTAGRAM_MESSAGE', value: { app_destination: destino } }) } : {}) };
  } else {
    const hash = await enviarImagem(o.conta, String(sp.criativo.conteudoId));
    const link = mt.exige.includes('site') ? String(d.siteUrl) : mt.exige.includes('app') ? String(d.lojaUrl) : `https://www.facebook.com/${o.pagina}`;
    const valor: Row = mt.goal === 'LEAD_GENERATION' ? { lead_gen_form_id: d.formId } : mt.goal === 'CONVERSATIONS' ? { app_destination: destino } : { link };
    criativo = {
      name: `[EVO MKT] ${o.titulo} · criativo`, instagram_user_id: o.ig,
      object_story_spec: JSON.stringify({ page_id: o.pagina, link_data: { image_hash: hash, link, message: String(sp.criativo.texto ?? '').slice(0, 2000), ...(sp.criativo.titulo ? { name: String(sp.criativo.titulo).slice(0, 255) } : {}), ...(sp.criativo.descricao ? { description: String(sp.criativo.descricao).slice(0, 255) } : {}), ...(cta !== 'NO_BUTTON' ? { call_to_action: { type: cta, value: valor } } : {}) } }),
    };
  }
  return { campanha, conjunto, criativo };
}

export async function lancarCampanha(sp: Spec, quem: string): Promise<Row> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(sp.chave))) throw new Error('Pedido sem chave de segurança. Abra a confirmação de novo.');
  const chave = sha256('camp|' + sp.chave).slice(0, 32);
  const ja = await q1('SELECT * FROM ads_lancamentos WHERE chave=?', [chave]);
  if (ja) return { ...ja, repetido: true };
  const pre = await previaCampanha(sp);
  if (!pre.ok) throw new Error(pre.erros.join(' '));
  if (!(await metaConnected())) throw new Error('Instagram/Meta não conectado.');
  if (!(await gestaoPermitida())) throw new Error('A permissão ads_management não foi concedida. Reconecte a Meta e aceite todas as permissões.');
  const { id: conta, moeda } = await contaAds();
  const ob = OBJETIVOS[sp.objetivo], mt = ob.metas[sp.meta], cfg = await cfgGestao();
  const titulo = (String(sp.nome ?? '').trim() || `${ob.rotulo} · ${mt.rotulo}`).replace(/\s+/g, ' ').slice(0, 60) + ' · ' + now().slice(0, 10);
  await run('INSERT INTO ads_lancamentos(chave,quem,quando,tipo,referencia,titulo,objetivo,orcamento_dia,dias,inicio,fim,compromisso,moeda,publico,estado,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [chave, quem.slice(0, 80), now(), 'CAMPANHA', String(sp.criativo.midia ?? sp.criativo.conteudoId ?? ''), titulo, `${sp.objetivo}/${sp.meta}`.slice(0, 30), pre.orcamentoDia, pre.dias, pre.inicio, pre.fim, pre.compromisso, moeda, JSON.stringify(pre.resumo.publico).slice(0, 1000), 'CRIANDO', now()]);
  const id = Number((await q1('SELECT id FROM ads_lancamentos WHERE chave=?', [chave]))!.id);
  let campanhaId = '';
  try {
    const pay = await montar(sp, pre, { conta, moeda, pagina: await paginaDoInstagram(await igDoPost(sp.criativo?.tipo === 'POST_IG' ? sp.criativo.midia : '')), ig: await igDoPost(sp.criativo?.tipo === 'POST_IG' ? sp.criativo.midia : ''), titulo, cidade: (sp.publico?.cidade ?? cfg.publico.cidade)! });
    campanhaId = String((await metaPost(`/act_${conta}/campaigns`, pay.campanha)).id);
    await marcar(id, 'CRIANDO', { campanha_id: campanhaId });
    const conjuntoId = String((await metaPost(`/act_${conta}/adsets`, { ...pay.conjunto, campaign_id: campanhaId })).id);
    await marcar(id, 'CRIANDO', { conjunto_id: conjuntoId });
    const criativoId = String((await metaPost(`/act_${conta}/adcreatives`, pay.criativo)).id);
    const anuncioId = String((await metaPost(`/act_${conta}/ads`, { name: `[EVO MKT] ${titulo}`, adset_id: conjuntoId, creative: JSON.stringify({ creative_id: criativoId }), status: 'ACTIVE' })).id);
    await marcar(id, 'ATIVO', { anuncio_id: anuncioId });
    await intLog('instagram', 'ok', `Nova campanha: "${titulo}" (${ob.rotulo}/${mt.rotulo}, campanha ${campanhaId}) lançada por ${quem}.`);
    await registrarNotificacao('ads_lancamento', 'gerencia', 'Campanha lançada pelo sistema', `${titulo}: ${ob.rotulo} · ${mt.rotulo}, compromisso de até ${pre.compromisso}. Por ${quem}.`, 'trafego', String(id));
    await notifyMail('Campanha lançada pelo EVO MKT', `${titulo}\n${ob.rotulo} · ${mt.rotulo}\nCompromisso de até ${pre.compromisso}\nPor: ${quem}`);
  } catch (e: any) {
    if (campanhaId) {
      try { await metaPost(`/${campanhaId}`, { status: 'PAUSED' }); } catch { /* segue */ }
      try { await metaPost(`/${campanhaId}`, { status: 'DELETED' }); } catch { /* segue */ }
    }
    await marcar(id, 'ERRO', { erro: String(e.message).slice(0, 580) });
    await intLog('instagram', 'erro', `Nova campanha "${titulo}" falhou: ${String(e.message).slice(0, 200)}`);
    throw new Error('A Meta recusou o lançamento: ' + e.message + (campanhaId ? ' (a campanha incompleta foi pausada e removida)' : ''));
  }
  return (await q1('SELECT * FROM ads_lancamentos WHERE id=?', [id]))!;
}

/** Listas para o assistente (best-effort: cada busca pode falhar sem derrubar as outras). */
export async function opcoesCampanha(): Promise<Row> {
  const { id: conta } = await contaAds();
  const seguro = async <T>(f: () => Promise<T>, vazio: T): Promise<T> => { try { return await f(); } catch { return vazio; } };
  return {
    objetivos: Object.fromEntries(Object.entries(OBJETIVOS).map(([k, o]) => [k, { rotulo: o.rotulo, ajuda: o.ajuda, metas: Object.fromEntries(Object.entries(o.metas).map(([mk, m]) => [mk, { rotulo: m.rotulo, ajuda: m.ajuda, exige: m.exige, criativos: m.criativos, cta: m.cta ?? '' }])) }])),
    ctas: CTAS, eventos: EVENTOS, plataformas: PLATAFORMAS,
    pixels: await seguro(async () => (await paginar(`/act_${conta}/adspixels`, { fields: 'id,name', limit: 50 }, 2)).map((p) => ({ id: String(p.id), nome: String(p.name ?? p.id) })), []),
    publicos: await seguro(async () => (await paginar(`/act_${conta}/customaudiences`, { fields: 'id,name,approximate_count_lower_bound', limit: 100 }, 2)).map((p) => ({ id: String(p.id), nome: String(p.name ?? p.id) })), []),
    formularios: await seguro(async () => (await paginar(`/${await paginaDoInstagram()}/leadgen_forms`, { fields: 'id,name,status', limit: 100 }, 2)).filter((f) => !f.status || f.status === 'ACTIVE').map((f) => ({ id: String(f.id), nome: String(f.name ?? f.id) })), []),
    posts: (await q('SELECT media_id,legenda,tipo,miniatura FROM ig_posts ORDER BY publicado_em DESC LIMIT 60')).map((p) => ({ id: String(p.media_id), legenda: String(p.legenda), tipo: String(p.tipo), miniatura: String(p.miniatura) })),
    imagens: (await q("SELECT id,data FROM records WHERE modulo='conteudos' LIMIT 500")).map((r) => ({ id: String(r.id), d: JSON.parse(String(r.data)) })).filter((x) => /\.jpe?g$/i.test(String(x.d.midiaInstagram ?? ''))).map((x) => ({ id: x.id, titulo: String(x.d.titulo ?? x.id), legenda: String(x.d.legenda ?? '') })),
  };
}
export async function pesquisarInteresse(texto: string): Promise<Row[]> {
  const r = await metaGet('/search', { type: 'adinterest', q: texto, limit: 15 });
  return (r.data ?? []).map((i: Row) => ({ id: String(i.id), nome: String(i.name ?? ''), publico: num(i.audience_size_upper_bound ?? i.audience_size) })).filter((i: Row) => i.id && i.nome);
}
const num = (v: unknown) => Number(v ?? 0) || 0;
