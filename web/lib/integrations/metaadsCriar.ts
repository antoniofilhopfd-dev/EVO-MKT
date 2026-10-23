import { q1, run } from '../db';
import { sha256 } from '../crypto';
import { now, parseLocal, Row } from '../util';
import { metaConnected, metaPost } from './meta';
import { cfgGestao, contaAds, gestaoPermitida, igDoPost, limitesMes, menorUnidade, ORCAMENTO_MIN_DIA, paginaDoInstagram } from './metaadsGestao';
import { conferirObjeto, registrar } from './metaadsGerenciador';
import { CTAS, enviarArquivo, enviarImagem, EXT_IMAGEM, EXT_VIDEO, EVENTOS, MENSAGENS, OBJETIVOS, PLATAFORMAS, aplicarPosicoes } from './metaadsCampanha';

/**
 * Criação AVULSA, como no Gerenciador de Anúncios da Meta: uma campanha, um conjunto (dentro de uma campanha existente) ou um anúncio
 * (dentro de um conjunto existente), cada um por vez. Tudo nasce PAUSADO: a pessoa confere na Meta/Gerenciador e ativa quando quiser.
 * Os payloads foram escritos pela documentação e validados só contra o simulador; o primeiro uso real é um teste supervisionado.
 */
export type NivelCriar = 'campanha' | 'conjunto' | 'anuncio';
const https = (u?: string) => /^https:\/\/[^\s]{4,500}$/.test(String(u ?? ''));
const ID = (v: unknown) => /^[A-Za-z0-9_.-]{2,64}$/.test(String(v ?? ''));
const nome3 = (v: unknown, rot: string, erros: string[]) => { const n = String(v ?? '').replace(/\s+/g, ' ').trim(); if (n.length < 3 || n.length > 100) erros.push(`${rot}: escreva um nome de 3 a 100 letras.`); return n.slice(0, 100); };
const chaveDe = (v: unknown, nivel: string) => {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(v ?? ''))) throw new Error('Pedido sem chave de segurança. Abra a confirmação de novo.');
  return sha256(`criar|${nivel}|${v}`).slice(0, 32);
};
const chaveObjetivo = (obj: string) => Object.keys(OBJETIVOS).find((k) => OBJETIVOS[k].objective === obj) ?? '';

async function prontos(): Promise<{ conta: string; moeda: string }> {
  const cfg = await cfgGestao();
  if (!cfg.ativa) throw new Error('A gestão de anúncios está desligada. Ligue em Tráfego → Alertas e automações (Administrador) e reconecte a Meta.');
  if (!(await metaConnected())) throw new Error('Instagram/Meta não conectado.');
  if (!(await gestaoPermitida())) throw new Error('A permissão ads_management não foi concedida. Reconecte a Meta e aceite todas as permissões.');
  const { id, moeda } = await contaAds();
  return { conta: id, moeda };
}

/** O que a campanha/conjunto escolhido aceita (para a tela mostrar só os campos certos). */
export async function infoCriacao(nivel: 'campanha' | 'conjunto', id: string): Promise<Row> {
  const { id: conta } = await contaAds();
  if (nivel === 'campanha') {
    const c = await conferirObjeto(id, conta, 'objective,daily_budget,lifetime_budget,effective_status');
    const k = chaveObjetivo(String(c.objective ?? ''));
    const ob = OBJETIVOS[k];
    return { id, nome: String(c.name ?? ''), objetivo: k, objetivoRotulo: ob?.rotulo ?? String(c.objective ?? ''), comOrcamentoNaCampanha: !!(c.daily_budget || c.lifetime_budget),
      metas: ob ? Object.fromEntries(Object.entries(ob.metas).map(([mk, m]) => [mk, { rotulo: m.rotulo, ajuda: m.ajuda, exige: m.exige, cta: m.cta ?? '' }])) : {} };
  }
  const j = await conferirObjeto(id, conta, 'optimization_goal,destination_type,campaign{objective,name}');
  const k = chaveObjetivo(String(j.campaign?.objective ?? ''));
  const mt = OBJETIVOS[k]?.metas && Object.entries(OBJETIVOS[k].metas).find(([, m]) => m.goal === String(j.optimization_goal ?? ''));
  return { id, nome: String(j.name ?? ''), campanha: String(j.campaign?.name ?? ''), objetivo: k, meta: mt ? mt[0] : '', metaRotulo: mt ? mt[1].rotulo : String(j.optimization_goal ?? ''),
    exige: mt ? mt[1].exige : [], criativos: mt ? mt[1].criativos : ['POST_IG', 'IMAGEM'], cta: mt ? mt[1].cta ?? '' : '', destino: String(j.destination_type ?? '') };
}

type Pedido = Row & { chave?: string };
interface Plano { erros: string[]; avisos: string[]; resumo: Row; montar: () => Promise<{ id: string; nome: string; antes: unknown; depois: unknown }> }

async function planejarCampanha(b: Pedido, conta: string): Promise<Plano> {
  const erros: string[] = [], avisos: string[] = [];
  const nome = nome3(b.nome, 'Campanha', erros);
  const ob = OBJETIVOS[String(b.objetivo ?? '')];
  if (!ob) erros.push('Escolha o objetivo da campanha.');
  return {
    erros, avisos, resumo: { nivel: 'campanha', nome, objetivo: ob?.rotulo ?? '', estado: 'Pausada (você ativa depois de conferir)' },
    montar: async () => {
      const r = await metaPost(`/act_${conta}/campaigns`, { name: nome, objective: ob.objective, status: 'PAUSED', special_ad_categories: '[]', buying_type: 'AUCTION', is_adset_budget_sharing_enabled: 'false' });
      return { id: String(r.id), nome, antes: null, depois: { objetivo: ob.objective, status: 'PAUSED' } };
    },
  };
}

async function planejarConjunto(b: Pedido, conta: string, moeda: string): Promise<Plano> {
  const erros: string[] = [], avisos: string[] = [], cfg = await cfgGestao();
  const nome = nome3(b.nome, 'Conjunto', erros);
  let camp: Row = {}, obKey = '';
  if (!ID(b.campanhaId)) erros.push('Escolha a campanha onde o conjunto será criado.');
  else { try { camp = await conferirObjeto(String(b.campanhaId), conta, 'objective,daily_budget,lifetime_budget'); obKey = chaveObjetivo(String(camp.objective ?? '')); } catch (e: any) { erros.push(e.message); } }
  const ob = OBJETIVOS[obKey], mt = ob?.metas[String(b.meta ?? '')];
  if (camp.objective && !ob) erros.push('Esse objetivo de campanha ainda não é criado por aqui. Use o Gerenciador da Meta.');
  else if (ob && !mt) erros.push('Escolha o resultado desejado para esse conjunto.');
  const d = (b.destino ?? {}) as Row, pb = (b.publico ?? {}) as Row;
  const cidade = (pb.cidade ?? cfg.publico.cidade) as { key?: string } | null, raio = Number(pb.raioKm ?? cfg.publico.raioKm), idMin = Number(pb.idadeMin ?? cfg.publico.idadeMin), idMax = Number(pb.idadeMax ?? cfg.publico.idadeMax);
  if (!cidade?.key) erros.push('Defina a cidade do público.');
  if (!(raio >= 1 && raio <= 80)) erros.push('O raio deve estar entre 1 e 80 km.');
  if (!(idMin >= 18 && idMax <= 65 && idMin <= idMax)) erros.push('Faixa de idade inválida (18 a 65, mínima ≤ máxima).');
  if (pb.genero && !['todos', 'mulheres', 'homens'].includes(String(pb.genero))) erros.push('Gênero inválido.');
  const plats = Array.isArray(pb.plataformas) ? (pb.plataformas as string[]) : [];
  if (plats.some((x) => !PLATAFORMAS.includes(x))) erros.push('Plataforma de veiculação inválida.');
  if (pb.posicoes !== undefined) { try { aplicarPosicoes({}, pb.posicoes); } catch (e: any) { erros.push(e.message); } }
  // orçamento e datas
  const tipo = String((b.orcamento as Row | undefined)?.tipo ?? '').toUpperCase(), valor = Number((b.orcamento as Row | undefined)?.valor);
  const campanhaTemOrcamento = !!(camp.daily_budget || camp.lifetime_budget);
  let inicio = new Date(Date.now() + 120000), fim: Date | null = null;
  try { if (b.inicio) { inicio = parseLocal(String(b.inicio)); if (isNaN(inicio.getTime())) throw new Error(); if (inicio.getTime() < Date.now() - 60000) inicio = new Date(Date.now() + 120000); } } catch { erros.push('Início: use data e hora (AAAA-MM-DDThh:mm).'); }
  try { if (b.fim) { fim = parseLocal(String(b.fim)); if (isNaN(fim.getTime())) throw new Error(); } } catch { erros.push('Término: use data e hora (AAAA-MM-DDThh:mm).'); fim = null; }
  if (!fim && Number(b.dias) >= 1) fim = new Date(inicio.getTime() + Math.floor(Number(b.dias)) * 86400000);
  if (!fim) erros.push('Defina o término: nenhuma campanha fica aberta para sempre.');
  const dias = fim ? Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / 86400000)) : 0;
  if (fim && fim.getTime() <= inicio.getTime()) erros.push('O término precisa ser depois do início.');
  if (dias > cfg.diasMax) erros.push(`A duração (${dias} dias) passa do máximo (${cfg.diasMax} dias).`);
  let compromisso = 0;
  if (campanhaTemOrcamento) avisos.push('Esta campanha tem orçamento na própria campanha (CBO): o conjunto é criado sem orçamento próprio.');
  else if (!['DIARIO', 'TOTAL'].includes(tipo)) erros.push('Escolha orçamento diário ou total.');
  else if (!Number.isFinite(valor) || valor < ORCAMENTO_MIN_DIA) erros.push(`O orçamento mínimo é ${ORCAMENTO_MIN_DIA}.`);
  else if (tipo === 'DIARIO') { if (valor > cfg.tetoDia) erros.push(`O orçamento diário (${valor}) passa do teto (${cfg.tetoDia}).`); compromisso = Math.round(valor * dias * 100) / 100; }
  else { compromisso = valor; const porDia = dias ? valor / dias : valor; if (valor > cfg.tetoMes) erros.push(`O orçamento total (${valor}) passa do teto mensal (${cfg.tetoMes}).`); if (porDia > cfg.tetoDia) erros.push(`O orçamento total em ${dias} dia(s) dá ${porDia.toFixed(2)}/dia, acima do teto diário (${cfg.tetoDia}).`); }
  const lance = (b.lance ?? {}) as Row;
  if (lance.tipo === 'LIMITE_CUSTO' && !(Number(lance.valor) > 0)) erros.push('Informe o valor do limite de custo.');
  if (mt) {
    if (mt.exige.includes('site') && !https(d.siteUrl as string)) erros.push('Informe o endereço https do site de destino.');
    if (mt.exige.includes('form') && !ID(d.formId)) erros.push('Informe o ID do formulário instantâneo.');
    if (mt.exige.includes('pixel')) { if (!ID(d.pixelId)) erros.push('Escolha o pixel da Meta.'); if (!EVENTOS.includes(String(d.evento))) erros.push('Escolha o evento do pixel que conta como resultado.'); }
    if (mt.exige.includes('app')) { if (!ID(d.appId)) erros.push('Informe o ID do aplicativo.'); if (!https(d.lojaUrl as string)) erros.push('Informe o link https da loja.'); }
    if (mt.goal === 'CONVERSATIONS') {
      const m = String(d.mensagem ?? 'DIRECT').toUpperCase();
      if (!MENSAGENS[m]) erros.push('Escolha onde a conversa acontece (Direct, Messenger ou WhatsApp).');
      if (m === 'WHATSAPP' && !/^\+?\d{10,15}$/.test(String(d.whatsapp ?? cfg.whatsapp ?? '').replace(/[\s()-]/g, ''))) erros.push('Informe o número do WhatsApp (com DDI e DDD).');
    }
  }
  const lm = await limitesMes(compromisso, cfg.tetoMes);
  erros.push(...lm.erros); avisos.push(...lm.avisos);
  return {
    erros, avisos, resumo: { nivel: 'conjunto', nome, objetivo: ob?.rotulo ?? '', resultado: mt?.rotulo ?? '', orcamento: campanhaTemOrcamento ? 'na campanha' : `${tipo === 'TOTAL' ? 'total' : 'por dia'} ${valor}`, dias, compromisso, estado: 'Pausado (você ativa depois de conferir)' },
    montar: async () => {
      const m = mt!, msg = MENSAGENS[String(d.mensagem ?? 'DIRECT').toUpperCase()];
      const destino = m.goal === 'CONVERSATIONS' ? msg : m.destino;
      const pagina = await paginaDoInstagram();
      const wa = String(d.whatsapp ?? cfg.whatsapp ?? '').replace(/[\s()-]/g, '');
      const promoted: Row | null = m.goal === 'CONVERSATIONS' ? { page_id: pagina, ...(msg === 'WHATSAPP' ? { whatsapp_phone_number: wa } : {}) }
        : m.goal === 'LEAD_GENERATION' ? { page_id: pagina }
        : m.goal === 'OFFSITE_CONVERSIONS' ? { pixel_id: d.pixelId, custom_event_type: d.evento }
        : m.goal === 'APP_INSTALLS' ? { application_id: d.appId, object_store_url: d.lojaUrl } : null;
      const genero = pb.genero === 'mulheres' ? [2] : pb.genero === 'homens' ? [1] : null;
      const interesses = (Array.isArray(pb.interesses) ? pb.interesses : []) as { id: string; nome: string }[];
      const personalizados = (Array.isArray(pb.publicosPersonalizados) ? pb.publicosPersonalizados : []) as string[];
      const targeting: Row = {
        geo_locations: { cities: [{ key: cidade!.key, radius: raio, distance_unit: 'kilometer' }] }, age_min: idMin, age_max: idMax,
        ...(genero ? { genders: genero } : {}), ...(interesses.length ? { flexible_spec: [{ interests: interesses.slice(0, 20).map((i) => ({ id: i.id, name: i.nome })) }] } : {}),
        ...(personalizados.length ? { custom_audiences: personalizados.filter(ID).slice(0, 20).map((id) => ({ id })) } : {}),
        ...(plats.length ? { publisher_platforms: plats } : m.goal === 'CONVERSATIONS' && msg === 'INSTAGRAM_DIRECT' ? { publisher_platforms: ['instagram'] } : {}),
      };
      if (pb.posicoes && Object.keys(pb.posicoes as Row).length) aplicarPosicoes(targeting, pb.posicoes);
      const cap = lance.tipo === 'LIMITE_CUSTO';
      const payload: Row = {
        name: nome, campaign_id: String(b.campanhaId), status: 'PAUSED', start_time: inicio.toISOString(), end_time: fim!.toISOString(),
        billing_event: 'IMPRESSIONS', optimization_goal: m.goal, bid_strategy: cap ? 'COST_CAP' : 'LOWEST_COST_WITHOUT_CAP', ...(cap ? { bid_amount: menorUnidade(Number(lance.valor), moeda) } : {}),
        ...(campanhaTemOrcamento ? {} : tipo === 'TOTAL' ? { lifetime_budget: menorUnidade(valor, moeda) } : { daily_budget: menorUnidade(valor, moeda) }),
        ...(destino ? { destination_type: destino } : {}), ...(promoted ? { promoted_object: JSON.stringify(promoted) } : {}), targeting: JSON.stringify(targeting),
      };
      const r = await metaPost(`/act_${conta}/adsets`, payload);
      return { id: String(r.id), nome, antes: null, depois: { campanha: b.campanhaId, resultado: m.goal, status: 'PAUSED' } };
    },
  };
}

async function planejarAnuncio(b: Pedido, conta: string): Promise<Plano> {
  const erros: string[] = [], avisos: string[] = [];
  const nome = nome3(b.nome, 'Anúncio', erros);
  let info: Row = {};
  if (!ID(b.conjuntoId)) erros.push('Escolha o conjunto onde o anúncio será criado.');
  else { try { info = await infoCriacao('conjunto', String(b.conjuntoId)); } catch (e: any) { erros.push(e.message); } }
  const ob = OBJETIVOS[String(info.objetivo ?? '')], mt = ob?.metas[String(info.meta ?? '')];
  if (info.nome && !mt) erros.push('Não consegui identificar o resultado desse conjunto. Crie o anúncio pelo Gerenciador da Meta.');
  const cr = (b.criativo ?? {}) as Row, d = (b.destino ?? {}) as Row, tc = String(cr.tipo ?? '').toUpperCase();
  if (mt) {
    if (!mt.criativos.includes((tc === 'ARQUIVO' ? 'IMAGEM' : tc) as 'POST_IG' | 'IMAGEM')) erros.push(`Para esse conjunto o anúncio deve usar ${mt.criativos.map((x) => (x === 'POST_IG' ? 'uma publicação do Instagram' : 'uma imagem nova')).join(' ou ')}.`);
    else if (tc === 'POST_IG') { if (!(await q1('SELECT 1 FROM ig_posts WHERE media_id=?', [String(cr.midia ?? '')]))) erros.push('Essa publicação não foi lida do Instagram conectado. Atualize o Desempenho e tente de novo.'); }
    else if (tc === 'ARQUIVO') {
      const a = await q1('SELECT tamanho FROM arquivos WHERE caminho=?', [String(cr.arquivo ?? '')]);
      if (!a) erros.push('Escolha um arquivo da biblioteca ou envie um do computador.');
      else if (!EXT_IMAGEM.test(String(cr.arquivo)) && !EXT_VIDEO.test(String(cr.arquivo))) erros.push('O arquivo precisa ser imagem (JPG ou PNG) ou vídeo (MP4 ou MOV).');
      if (!String(cr.texto ?? '').trim()) erros.push('Escreva o texto do anúncio.');
    } else {
      const c = await q1('SELECT data FROM records WHERE modulo=? AND id=?', ['conteudos', String(cr.conteudoId ?? '')]);
      const rel = c ? String(JSON.parse(String(c.data)).midiaInstagram ?? '') : '';
      if (!/\.jpe?g$/i.test(rel)) erros.push('Escolha uma imagem JPEG anexada a um post do Estúdio.');
      if (!String(cr.texto ?? '').trim()) erros.push('Escreva o texto do anúncio.');
    }
    if (mt.exige.includes('site') && !https(d.siteUrl as string)) erros.push('Informe o endereço https do site de destino.');
    if (mt.exige.includes('form') && !ID(d.formId)) erros.push('Informe o ID do formulário instantâneo.');
    if (mt.exige.includes('app') && !https(d.lojaUrl as string)) erros.push('Informe o link https da loja.');
    if (cr.cta && !CTAS.includes(String(cr.cta))) erros.push('Botão de chamada inválido.');
  }
  return {
    erros, avisos, resumo: { nivel: 'anuncio', nome, conjunto: info.nome ?? '', campanha: info.campanha ?? '', resultado: info.metaRotulo ?? '', criativo: tc === 'POST_IG' ? 'Publicação do Instagram' : tc === 'ARQUIVO' ? (EXT_VIDEO.test(String(cr.arquivo ?? '')) ? 'Vídeo enviado' : 'Imagem enviada') : 'Imagem nova', estado: 'Pausado (você ativa depois de conferir)' },
    montar: async () => {
      const m = mt!, destino = String(info.destino ?? ''), msg = ['INSTAGRAM_DIRECT', 'MESSENGER', 'WHATSAPP'].includes(destino) ? destino : '';
      const ig = await igDoPost(tc === 'POST_IG' ? String(cr.midia) : ''), pagina = await paginaDoInstagram(ig);
      const cta = String(cr.cta || m.cta || 'LEARN_MORE');
      let criativo: Row;
      if (tc === 'POST_IG') {
        criativo = { name: `${nome} · criativo`, object_id: pagina, instagram_user_id: ig, source_instagram_media_id: cr.midia, ...(m.goal === 'CONVERSATIONS' ? { call_to_action: JSON.stringify({ type: msg === 'WHATSAPP' ? 'WHATSAPP_MESSAGE' : msg === 'MESSENGER' ? 'MESSAGE_PAGE' : 'INSTAGRAM_MESSAGE' }) } : {}) };
      } else if (tc === 'ARQUIVO') {
        const peca = await enviarArquivo(conta, String(cr.arquivo));
        const link = m.exige.includes('site') ? String(d.siteUrl) : m.exige.includes('app') ? String(d.lojaUrl) : `https://www.facebook.com/${pagina}`;
        const valor: Row = m.goal === 'LEAD_GENERATION' ? { lead_gen_form_id: d.formId } : m.goal === 'CONVERSATIONS' ? { app_destination: destino } : { link };
        const botao = cta !== 'NO_BUTTON' ? { call_to_action: { type: cta, value: valor } } : {};
        const spec = peca.tipo === 'video'
          ? { page_id: pagina, video_data: { video_id: peca.videoId, ...(peca.miniatura ? { image_url: peca.miniatura } : {}), message: String(cr.texto ?? '').slice(0, 2000), ...(cr.titulo ? { title: String(cr.titulo).slice(0, 255) } : {}), ...(cr.descricao ? { link_description: String(cr.descricao).slice(0, 255) } : {}), ...botao } }
          : { page_id: pagina, link_data: { image_hash: peca.hash, link, message: String(cr.texto ?? '').slice(0, 2000), ...(cr.titulo ? { name: String(cr.titulo).slice(0, 255) } : {}), ...(cr.descricao ? { description: String(cr.descricao).slice(0, 255) } : {}), ...botao } };
        criativo = { name: `${nome} · criativo`, instagram_user_id: ig, object_story_spec: JSON.stringify(spec) };
      } else {
        const hash = await enviarImagem(conta, String(cr.conteudoId));
        const link = m.exige.includes('site') ? String(d.siteUrl) : m.exige.includes('app') ? String(d.lojaUrl) : `https://www.facebook.com/${pagina}`;
        const valor: Row = m.goal === 'LEAD_GENERATION' ? { lead_gen_form_id: d.formId } : m.goal === 'CONVERSATIONS' ? { app_destination: destino } : { link };
        criativo = {
          name: `${nome} · criativo`, instagram_user_id: ig,
          object_story_spec: JSON.stringify({ page_id: pagina, link_data: { image_hash: hash, link, message: String(cr.texto ?? '').slice(0, 2000), ...(cr.titulo ? { name: String(cr.titulo).slice(0, 255) } : {}), ...(cr.descricao ? { description: String(cr.descricao).slice(0, 255) } : {}), ...(cta !== 'NO_BUTTON' ? { call_to_action: { type: cta, value: valor } } : {}) } }),
        };
      }
      const cid = String((await metaPost(`/act_${conta}/adcreatives`, criativo)).id);
      const r = await metaPost(`/act_${conta}/ads`, { name: nome, adset_id: String(b.conjuntoId), creative: JSON.stringify({ creative_id: cid }), status: 'PAUSED' });
      return { id: String(r.id), nome, antes: null, depois: { conjunto: b.conjuntoId, criativo: cid, status: 'PAUSED' } };
    },
  };
}

async function planejar(nivel: NivelCriar, b: Pedido) {
  const { conta, moeda } = await prontos();
  const p = nivel === 'campanha' ? await planejarCampanha(b, conta) : nivel === 'conjunto' ? await planejarConjunto(b, conta, moeda) : await planejarAnuncio(b, conta);
  return { ...p, ok: p.erros.length === 0 };
}

/** Confere tudo sem escrever na Meta. */
export async function previaCriar(nivel: NivelCriar, b: Pedido): Promise<Row> {
  try { const p = await planejar(nivel, b); return { ok: p.ok, erros: p.erros, avisos: p.avisos, resumo: p.resumo }; }
  catch (e: any) { return { ok: false, erros: [e.message], avisos: [], resumo: {} }; }
}

export async function criarObjeto(nivel: NivelCriar, b: Pedido, quem: string): Promise<Row> {
  const chave = chaveDe(b.chave, nivel);
  const ja = await q1('SELECT * FROM ads_criacoes WHERE chave=?', [chave]);
  if (ja) { if (ja.estado === 'ERRO') throw new Error('A Meta recusou a criação: ' + String(ja.erro)); return { ok: true, nivel, id: ja.objeto_id, nome: ja.nome, estado: 'PAUSED', repetido: true }; }
  const p = await planejar(nivel, b);
  if (!p.ok) throw new Error(p.erros.join(' '));
  await run('INSERT INTO ads_criacoes(chave,quem,quando,nivel,nome,estado) VALUES(?,?,?,?,?,?)', [chave, quem.slice(0, 80), now(), nivel, String(p.resumo.nome ?? '').slice(0, 250), 'CRIANDO']);
  try {
    const r = await p.montar();
    await run('UPDATE ads_criacoes SET objeto_id=?,estado=? WHERE chave=?', [r.id, 'CRIADO', chave]);
    await registrar(quem, nivel === 'anuncio' ? 'anuncio' : nivel, r.id, r.nome, 'criar', r.antes, r.depois);
    return { ok: true, nivel, id: r.id, nome: r.nome, estado: 'PAUSED' };
  } catch (e: any) {
    const msg = String(e.message ?? e).slice(0, 580);
    await run('UPDATE ads_criacoes SET estado=?,erro=? WHERE chave=?', ['ERRO', msg, chave]);
    await registrar(quem, nivel, '', String(p.resumo.nome ?? ''), 'criar', null, null, msg);
    throw new Error('A Meta recusou a criação: ' + msg);
  }
}
