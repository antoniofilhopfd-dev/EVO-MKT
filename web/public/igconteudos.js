/* Instagram › Conteúdos: da ideia à publicação, com revisão e aprovação internas (sem Portal e sem link externo).
   Fluxo: Ideia → Rascunho → Em produção → Em revisão → Aprovado → Agendado → Publicado. */
const IG_ETAPAS = ['IDEIA', 'RASCUNHO', 'EM PRODUÇÃO', 'EM REVISÃO', 'APROVADO', 'AGENDADO', 'PUBLICADO'];
/* Auxiliares que antes ficavam no Dashboard. */
const ESTADO_ROTULO = { IDEIA: 'Ideia', RASCUNHO: 'Rascunho', 'EM PRODUÇÃO': 'Em produção', 'EM REVISÃO': 'Em revisão', APROVADO: 'Aprovado', AGENDADO: 'Agendado', PUBLICADO: 'Publicado', ARQUIVADO: 'Arquivado' };
const estadoClasse = s => ({ APROVADO: 'ok', AGENDADO: 'info', PUBLICADO: 'ok', 'EM REVISÃO': 'warn', ARQUIVADO: 'mute' }[s] || '');
function abrirRegistros(ids, titulo) { window.IG_FOCO = { ids, titulo }; go('igconteudos'); }
const IG_ESTADO_ROTULO = { ...ESTADO_ROTULO };
const IG_PAPEIS = { referencia: 'Referência', producao: 'Arquivo em produção', final: 'Arquivo final', miniatura: 'Miniatura' };
const SEG_NOMES = SEG_LISTA.filter(s => s[0]).map(s => s[1]).concat(['Todos']);
const IGC = { rows: [], estados: new Map(), busca: '', status: '', resp: '', vista: pref('igVista', 'lista'), meta: [] };

const qDoPub = r => `${r.titulo || ''} ${r.legenda || ''} ${r.hashtags || ''}`.toLowerCase();
const stLimpo = s => ({ BRIEFING: 'RASCUNHO', 'PRODUÇÃO': 'EM PRODUÇÃO', 'REVISÃO': 'EM REVISÃO', PROGRAMADO: 'AGENDADO' }[String(s || '').toUpperCase()] || String(s || '').toUpperCase());
const materiaisAtivosDe = (r, papel) => (r.materiais || []).filter(m => !m.substituido && (!papel || m.papel === papel));
const urlMaterial = m => (m.tipo === 'arquivo' ? `${API}/file?path=${encodeURIComponent(m.caminho)}` : m.url);
const ehImagem = m => m.tipo === 'arquivo' && /\.(jpe?g|png|gif|webp)$/i.test(m.caminho || m.nome || '');

/** Botão "Nova publicação" presente nas quatro abas do Instagram. */
const botaoNova = () => '<button type="button" class="btn" data-nova>+ Nova publicação</button>';
function ligaNova(raiz = document) { $$('[data-nova]', raiz).forEach(b => { b.onclick = () => novaPublicacao(); }); }
/** O botão "+ Nova publicação" do cabeçalho vale para todo o Instagram; as abas não repetem o botão. */
function abasInstagramAcoes() { return ''; }

async function carregarConteudos(force = true) {
  const [d, est] = await Promise.all([getRows('conteudos', force), api('/content/states').catch(() => ({ rows: [] }))]);
  IGC.rows = d.rows || []; IGC.estados = new Map((est.rows || []).map(x => [x.id, x]));
}
function filtrarConteudos() {
  const f = Filtros.get(), foco = window.IG_FOCO, ids = foco ? new Set(foco.ids) : null;
  const b = IGC.busca.trim().toLowerCase();
  return IGC.rows.filter(r => (!ids || ids.has(String(r.id))) && calPubCabe(r, f) && (!IGC.status || stLimpo(r.status) === IGC.status) && (!IGC.resp || r.responsavel === IGC.resp) && (!b || qDoPub(r).includes(b)));
}
const badgeEstado = r => { const s = stLimpo(r.status); return `<span class="badge ${estadoClasse(s)}">${esc(IG_ESTADO_ROTULO[s] || s || '—')}</span>`; };
const faltasDe = r => (IGC.estados.get(r.id)?.pendencias || []).map(p => p.texto);

/** Situação simples da publicação, para a lista: Rascunho, Agendada, Publicada ou Falha. */
const IGC_SITUACOES = [['', 'Todos os status'], ['RASCUNHO', 'Rascunho'], ['AGENDADA', 'Agendada'], ['PUBLICADA', 'Publicada'], ['FALHA', 'Falha']];
const igcSituacao = r => {
  const e = IGC.estados.get(r.id), s = stLimpo(r.status);
  if (e && /FALHA/i.test(String(e.estado || ''))) return 'FALHA';
  return s === 'PUBLICADO' ? 'PUBLICADA' : s === 'AGENDADO' ? 'AGENDADA' : s === 'ARQUIVADO' ? 'ARQUIVADA' : 'RASCUNHO';
};
const igcBadge = sit => `<span class="badge ${{ PUBLICADA: 'ok', AGENDADA: 'info', FALHA: 'bad', ARQUIVADA: '' }[sit] ?? 'warn'}">${esc((IGC_SITUACOES.find(x => x[0] === sit) || [, sit === 'ARQUIVADA' ? 'Arquivada' : sit])[1])}</span>`;

/** Lista única: publicações do EVO MKT (rascunhos, agendadas e publicadas) e as já postadas que vieram da Meta, sem duplicar. */
function igcItens() {
  const f = Filtros.get(), b = IGC.busca.trim().toLowerCase(), [de, ate] = [f.de, f.ate];
  const ligadas = new Set(IGC.rows.map(r => String(r.instagramMediaId || '')).filter(Boolean));
  const dentro = dia => !dia || (dia >= de && dia <= ate);
  const foco = window.IG_FOCO ? new Set(window.IG_FOCO.ids.map(String)) : null, itens = [];
  IGC.rows.forEach(r => {
    if (foco && !foco.has(String(r.id))) return;
    const sit = igcSituacao(r), dia = String(r.publicacaoEm || '').slice(0, 10);
    /* o período vale para o histórico (publicadas); agendadas, rascunhos e falhas aparecem sempre, mesmo no futuro */
    if (sit === 'ARQUIVADA' || !calPubCabe(r, f) || (sit === 'PUBLICADA' && !dentro(dia))) return;
    if (IGC.status && sit !== IGC.status) return;
    if (b && !`${qDoPub(r)} ${r.perfil || ''}`.toLowerCase().includes(b)) return;
    itens.push({ origem: 'evo', id: r.id, dia, hora: String(r.publicacaoEm || '').slice(11, 16), legenda: r.legenda || r.titulo || '', perfil: r.perfil || '', formato: r.formato || '', mini: igcalMini(r), sit, link: r.instagramLink || r.linkPublicacao || '', registro: r });
  });
  (foco ? [] : IGC.meta).forEach(p => {
    if (ligadas.has(String(p.id))) return;
    const q = igcalQuando(p.quando);
    if (!dentro(q.dia) || (IGC.status && IGC.status !== 'PUBLICADA')) return;
    if (f.formato && String(p.formato).toLowerCase() !== f.formato.toLowerCase()) return;
    if (b && !`${p.legenda} ${p.perfil}`.toLowerCase().includes(b)) return;
    itens.push({ origem: 'meta', id: p.id, dia: q.dia, hora: q.hora, legenda: p.legenda || '', perfil: p.perfil, formato: p.formato, mini: p.miniatura, sit: 'PUBLICADA', link: p.link });
  });
  return itens.sort((a, b) => (b.dia ? b.dia + (b.hora || '') : '0').localeCompare(a.dia ? a.dia + (a.hora || '') : '0'));
}
function igcLinha(i) {
  const publicada = i.sit === 'PUBLICADA';
  const acoes = [
    i.origem === 'evo' ? `<button type="button" data-ac="editar" data-id="${attr(i.id)}">Editar</button>` : '',
    i.origem === 'evo' && !publicada ? `<button type="button" data-ac="agora" data-id="${attr(i.id)}">Publicar agora</button><button type="button" data-ac="agendar" data-id="${attr(i.id)}">${i.sit === 'AGENDADA' ? 'Reagendar' : 'Agendar'}</button>` : '',
    i.origem === 'evo' ? `<button type="button" data-ac="duplicar" data-id="${attr(i.id)}">Duplicar</button>` : '',
    i.link ? `<a href="${attr(i.link)}" target="_blank" rel="noopener noreferrer">Ver no Instagram</a>` : '',
  ].join('');
  return `<tr><td class="igl-mini">${i.mini ? `<img src="${attr(i.mini)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="igl-sem">◇</span>'}</td>
    <td class="igl-leg">${i.origem === 'evo' ? `<button type="button" class="igl-abrir" data-ac="editar" data-id="${attr(i.id)}">${esc(i.legenda || '(sem legenda)')}</button>` : `<span>${esc(i.legenda || '(sem legenda)')}</span>`}</td>
    <td>${esc(i.perfil || '—')}</td><td>${esc(i.formato || '—')}</td><td class="igl-data">${i.dia ? `${esc(fmtDate(i.dia))}${i.hora ? `<small>${esc(i.hora)}</small>` : ''}` : '<small>sem data</small>'}</td><td>${igcBadge(i.sit)}</td>
    <td class="igl-acoes"><details class="igl-menu"><summary aria-label="Ações da publicação">⋯</summary><div>${acoes}</div></details></td></tr>`;
}

PAGINAS.igconteudos = async function () {
  Object.assign(IGC, Filtros.localGet({ busca: '', status: '' }));
  await carregarConteudos();
  await igcCarregaMeta();
  const desenha = () => {
    const itens = igcItens();
    $('#igcLista').innerHTML = itens.length ? `<div class="tablewrap"><table class="datatable igl"><thead><tr><th></th><th>Legenda</th><th>Perfil</th><th>Formato</th><th>Data e hora</th><th>Status</th><th></th></tr></thead><tbody>${itens.map(igcLinha).join('')}</tbody></table></div>` : `<div class="empty-rich"><strong>Nenhuma publicação encontrada</strong><p>${IGC.rows.length || IGC.meta.length ? 'Nenhuma publicação combina com a busca e os filtros. Amplie o período ou limpe os filtros.' : 'Quando você publicar ou sincronizar o Instagram, as publicações aparecem aqui.'}</p></div>`;
    $('#igcCont').textContent = `${itens.length} publicação(ões) · ${Filtros.descricao()}`;
    $$('[data-ac]', $('#igcLista')).forEach(b => {
      b.onclick = async () => {
        const menu = b.closest('details'); if (menu) menu.open = false;
        const id = b.dataset.id, r = IGC.rows.find(x => String(x.id) === String(id));
        if (b.dataset.ac === 'editar') return editarPublicacao(id);
        if (b.dataset.ac === 'agora') return abrirPublicacao('agora', r);
        if (b.dataset.ac === 'agendar') return abrirPublicacao('agendar', r);
        if (b.dataset.ac === 'duplicar') { try { await post('/content/duplicate', { id }); invalidate('conteudos'); toast('Publicação duplicada como rascunho'); go('igconteudos'); } catch (e) { toast(e.message, 'bad'); } }
      };
    });
  };
  $('#content').innerHTML = `${window.IG_FOCO ? `<div class="foco-chip" role="status">Mostrando só: <b>${esc(window.IG_FOCO.titulo)}</b> <button class="btn soft" id="igcLimparFoco">Ver todas</button></div>` : ''}
    <div class="ig-barra igl-barra">
      <input type="search" class="control" id="igcBusca" placeholder="Buscar por legenda ou perfil" aria-label="Buscar publicações" value="${attr(IGC.busca)}">
      <select class="control" id="igcSt" aria-label="Status">${IGC_SITUACOES.map(([v, l]) => `<option value="${v}" ${IGC.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="kpi-note" id="igcCont" aria-live="polite"></span>
      <span class="igl-botoes"><button type="button" class="btn soft" id="igcAgendar">Agendar</button><button type="button" class="btn" id="igcAgora">Publicar agora</button></span>
    </div><div id="igcLista"></div>`;
  $('#igcBusca').oninput = debounce(e => { IGC.busca = e.target.value; Filtros.localSet({ busca: IGC.busca }); desenha(); }, 200);
  $('#igcSt').onchange = e => { IGC.status = e.target.value; Filtros.localSet({ status: IGC.status }); desenha(); };
  $('#igcAgora').onclick = () => abrirPublicacao('agora');
  $('#igcAgendar').onclick = () => abrirPublicacao('agendar');
  const lf = $('#igcLimparFoco'); if (lf) lf.onclick = () => { window.IG_FOCO = null; go('igconteudos'); };
  desenha();
  if (window.IG_ABRIR) { const id = window.IG_ABRIR; window.IG_ABRIR = null; editarPublicacao(id); }
};

/* ================= Estúdio: editor da publicação ================= */
/* Botão "+ Nova publicação": fluxo simples (Agendar / Publicar agora). O estúdio antigo fica só para editar e para pautas/ideias já preenchidas. */
function novaPublicacao(opc = {}) { return opc.dados ? abrirEstudio(null, opc) : escolherNovaPublicacao(opc); }
async function editarPublicacao(id) {
  let r;
  try { r = (await api(`/data?module=conteudos&id=${encodeURIComponent(id)}`)); } catch { /* cai para a lista */ }
  if (!r || !r.id) { const lista = (await getRows('conteudos', true)).rows || []; r = lista.find(x => String(x.id) === String(id)); }
  if (!r) return toast('Publicação não encontrada.', 'warn');
  return abrirEstudio(r);
}
const horasRoteiro = txt => { const palavras = (String(txt || '').trim().match(/\S+/g) || []).length; return Math.round(palavras / 2.5); }; // ~150 palavras por minuto
const contaTags = t => (String(t || '').match(/#[\p{L}\p{N}_]+/gu) || []).length;
const copiar = async (texto, ok) => { try { await navigator.clipboard.writeText(texto); toast(ok); } catch { const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast(ok); } catch { toast('Não foi possível copiar.', 'warn'); } t.remove(); } };

/** Diferença por palavras entre dois textos (para comparar versões). */
function diffPalavras(a, b) {
  const x = String(a || '').split(/(\s+)/), y = String(b || '').split(/(\s+)/);
  if (x.length * y.length > 250000) return [esc(a), esc(b)];
  const m = x.length, n = y.length, t = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  let i = 0, j = 0, ha = '', hb = '';
  while (i < m && j < n) {
    if (x[i] === y[j]) { ha += esc(x[i]); hb += esc(y[j]); i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) { ha += x[i].trim() ? `<del>${esc(x[i])}</del>` : esc(x[i]); i++; }
    else { hb += y[j].trim() ? `<ins>${esc(y[j])}</ins>` : esc(y[j]); j++; }
  }
  while (i < m) { ha += x[i].trim() ? `<del>${esc(x[i])}</del>` : esc(x[i]); i++; }
  while (j < n) { hb += y[j].trim() ? `<ins>${esc(y[j])}</ins>` : esc(y[j]); j++; }
  return [ha, hb];
}

async function abrirEstudio(row, opc = {}) {
  let r = row ? { ...row } : {}, edit = !!row;
  const equipe = (await api('/team').catch(() => ({ rows: [] }))).rows.map(x => x.nome);
  const camps = await Filtros.campanhasEditoriais();
  const [modelos, grupos, estado, ia] = await Promise.all([
    api('/studio/modelos').then(d => d.modelos || []).catch(() => []), api('/studio/hashtags').then(d => d.grupos || []).catch(() => []),
    edit ? api('/content/states').then(d => d.rows.find(x => x.id === r.id) || {}).catch(() => ({})) : {}, api('/ia/estado').catch(() => ({ ativa: false })),
  ]);
  const f = Filtros.get();
  const padrao = { perfil: f.perfil || '', segmento: f.segmento ? (SEG_LISTA.find(s => s[0] === f.segmento) || [, ''])[1] : '', formato: f.formato || 'Feed', campanhaId: f.campanha || '' };
  if (!edit) r = { status: 'RASCUNHO', canal: 'Instagram', publicarInstagram: 'NAO', ...padrao, ...(opc.data ? { publicacaoEm: `${opc.data}T09:00` } : {}), ...(opc.dados || {}) };
  const ro = edit && /PUBLICADO|ARQUIVADO/.test(stLimpo(r.status)) && stLimpo(r.status) === 'PUBLICADO';
  let sujo = false, formatoPrev = r.formato === 'Stories' ? 'Stories' : r.formato === 'Reels' ? 'Reels' : 'Feed';
  const campo = k => (r[k] === undefined || r[k] === null ? '' : String(r[k]));
  const dis = ro ? 'disabled' : '';
  const sel = (id, rot, atual, opcs, extra = '') => `<label>${rot}<select class="control" id="${id}" ${dis} ${extra}>${opcs.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${attr(v)}" ${String(atual) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`;
  const eleva = (html) => dialogo(html, { larga: true, aoFechar: () => { clearInterval(timer); } });
  let timer = null, dlg = null;

  const montar = () => {
    const st = stLimpo(r.status), idPub = r.id || '';
    const perfis = ['', '@evolucaopb', '@geracaoevolucao', 'Ambos'];
    const botoes = acoesDoEstado(st, !ro);
    return `<div class="est"><form id="estForm" class="est-form" novalidate>
      <div class="est-cab"><h3>${edit ? esc(r.titulo || 'Publicação') : 'Nova publicação'} ${edit ? badgeEstado(r) : ''}</h3><small class="kpi-note" id="estSalvo" aria-live="polite">${edit ? 'Salvo' : 'Ainda não salva'}</small></div>
      ${edit && (estado.pendencias || []).length ? `<div class="est-faltas" role="status"><b>Falta para publicar:</b> ${(estado.pendencias || []).map(p => `<span class="falta">${esc(p.texto)}</span>`).join(' ')}</div>` : ''}
      ${r.origemNome ? `<p class="kpi-note">Origem: ${esc(r.origemTipo === 'calescolar' ? 'calendário escolar' : r.origemTipo === 'datacom' ? 'data comemorativa' : r.origemTipo || '')} — ${esc(r.origemNome)}${r.origemData ? ' (' + esc(fmtDate(r.origemData)) + ')' : ''}</p>` : ''}
      <label class="wide">Título interno *<input class="control" id="fTitulo" maxlength="140" value="${attr(campo('titulo'))}" ${dis} placeholder="Ex.: Aula aberta — Ensino Médio"></label>
      <div class="est-grid">
        ${sel('fPerfil', 'Perfil', campo('perfil'), perfis.map(p => [p, p || 'Escolha o perfil']))}
        ${sel('fSeg', 'Segmento', campo('segmento'), [['', 'Escolha o segmento'], ...SEG_NOMES])}
        ${sel('fFmt', 'Formato', campo('formato') || 'Feed', FORMATO_LISTA)}
        ${sel('fCamp', 'Campanha editorial', campo('campanhaId'), [['', 'Nenhuma'], ...camps.map(c => [c.id, c.titulo || c.id])])}
        <label>Tema<input class="control" id="fTema" maxlength="80" value="${attr(campo('tema'))}" ${dis} placeholder="Ex.: Matrículas, Eventos, Bastidores"></label>
        <label>Objetivo<input class="control" id="fObj" maxlength="80" value="${attr(campo('objetivo'))}" ${dis} placeholder="Ex.: Engajar, Informar, Gerar conversas"></label>
        ${sel('fResp', 'Responsável', campo('responsavel'), [['', 'Sem responsável'], ...equipe.concat(campo('responsavel') && !equipe.includes(campo('responsavel')) ? [campo('responsavel')] : [])])}
        ${sel('fRev', 'Revisor (quem aprova)', campo('revisor'), [['', 'Sem revisor'], ...equipe.concat(campo('revisor') && !equipe.includes(campo('revisor')) ? [campo('revisor')] : [])])}
        <label>Data e hora de publicação<input class="control" type="datetime-local" id="fQuando" value="${attr(campo('publicacaoEm').slice(0, 16))}" ${dis}></label>
        ${sel('fCanal', 'Canal', campo('canal') || 'Instagram', ['Instagram', 'TikTok', 'YouTube'])}
      </div>
      <div class="est-modelos"><label>Modelo<select class="control" id="fModelo" ${dis}><option value="">Aplicar um modelo…</option>${modelos.map((m, i) => `<option value="${i}">${esc(m.nome)}</option>`).join('')}</select></label>${ia.ativa ? '<button type="button" class="btn soft" id="fIA" title="Gera variações como rascunho; nada é salvo sozinho">✎ Variações com IA (rascunho)</button>' : ''}</div>
      <label class="wide">Legenda <span class="est-cont" id="cLeg"></span><textarea class="control" id="fLeg" rows="7" ${dis} placeholder="Escreva a legenda…">${esc(campo('legenda'))}</textarea></label>
      <div class="est-linha"><button type="button" class="btn soft" id="fCopiar">Copiar legenda</button><small class="kpi-note">As 125 primeiras letras aparecem antes do “mais”.</small></div>
      <label class="wide">Hashtags <span class="est-cont" id="cTag"></span><textarea class="control" id="fTags" rows="2" ${dis} placeholder="#evolucao #colegio">${esc(campo('hashtags'))}</textarea></label>
      <div class="est-grupos">${grupos.map((g, i) => `<button type="button" class="badge" data-grupo="${i}" ${dis}>+ ${esc(g.nome)}</button>`).join('')}</div>
      <label class="wide">Chamada para ação (CTA)<input class="control" id="fCta" maxlength="160" value="${attr(campo('cta'))}" ${dis} placeholder="Ex.: Link na bio para agendar a visita"></label>
      <fieldset class="wide est-utm"><legend>Link de destino e UTM</legend>
        <label>Link de destino (https)<input class="control" id="fLink" value="${attr(campo('linkDestino'))}" ${dis} placeholder="https://colegioevolucao.com.br/…"></label>
        <div class="est-grid"><label>utm_source<input class="control" id="uSrc" value="${attr(campo('utmSource') || 'instagram')}" ${dis}></label><label>utm_medium<input class="control" id="uMed" value="${attr(campo('utmMedium') || 'organico')}" ${dis}></label><label>utm_campaign<input class="control" id="uCam" value="${attr(campo('utmCampaign'))}" ${dis}></label><label>utm_content<input class="control" id="uCon" value="${attr(campo('utmContent'))}" ${dis}></label></div>
        <div class="est-linha"><output id="uOut" class="est-url"></output><button type="button" class="btn soft" id="uCopiar">Copiar link com UTM</button></div>
      </fieldset>
      <label class="wide" id="roteiroL">Roteiro (Stories e Reels) <span class="est-cont" id="cRot"></span><textarea class="control" id="fRot" rows="4" ${dis} placeholder="Cena 1: …">${esc(campo('roteiro'))}</textarea></label>
      <label class="check-row wide"><input type="checkbox" id="fAuto" ${campo('publicarInstagram') === 'SIM' ? 'checked' : ''} ${dis}> Publicar no Instagram automaticamente na data e hora marcadas (só quando estiver Agendada, com arte final anexada)</label>
      ${edit ? materiaisHtml() : '<p class="kpi-note wide">Salve a publicação para anexar materiais (referência, arquivo em produção, arquivo final, miniatura ou link do Drive).</p>'}
      <div class="cm-erro wide" id="estErro" role="alert"></div>
      <div class="est-acoes">${botoes}</div>
      ${edit ? `<details class="est-det" id="estHist"><summary>Histórico e comentários</summary><div id="estHistCorpo"><div class="loading"><span></span><b>Carregando…</b></div></div></details>` : ''}
    </form>
    <aside class="est-prev" aria-label="Prévia"><div class="est-abas" role="tablist">${['Feed', 'Stories', 'Reels'].map(x => `<button type="button" role="tab" class="${formatoPrev === x ? 'on' : ''}" data-prev="${x}" aria-selected="${formatoPrev === x}">${x}</button>`).join('')}</div><div id="prevBox"></div></aside></div>`;
  };

  function acoesDoEstado(st, podeEditar) {
    const b = (id, rot, cls = 'btn soft') => `<button type="button" class="${cls}" id="${id}" ${id === 'aFechar' ? 'data-close' : ''}>${rot}</button>`;
    const out = [b('aFechar', 'Fechar')];
    if (!podeEditar) return `${out.join('')}${edit ? b('aDup', 'Duplicar') : ''}${r.linkPublicacao || r.instagramLink ? `<a class="btn soft" target="_blank" rel="noopener noreferrer" href="${attr(r.instagramLink || r.linkPublicacao)}">Ver no Instagram ↗</a>` : ''}`;
    out.push(b('aSalvar', edit ? 'Salvar' : 'Criar publicação', 'btn'));
    if (edit) {
      if (['IDEIA', 'RASCUNHO'].includes(st)) out.push(b('aProd', 'Enviar para produção'));
      if (['IDEIA', 'RASCUNHO', 'EM PRODUÇÃO'].includes(st)) out.push(b('aRev', 'Enviar para revisão'));
      if (st === 'EM REVISÃO') out.push(b('aAprovar', 'Aprovar', 'btn'), b('aAjuste', 'Pedir ajustes'));
      if (st === 'APROVADO') out.push(b('aAgendar', 'Agendar', 'btn'));
      if (st === 'AGENDADO') out.push(b('aDesagendar', 'Desfazer agendamento'));
      if (['APROVADO', 'AGENDADO'].includes(st)) out.push(b('aConfirmar', 'Confirmar publicação'));
      out.push(b('aDup', 'Duplicar'), b('aAdapt', 'Adaptar para o outro perfil'), b('aShare', r.compartilhado === 'SIM' ? 'Deixar de compartilhar' : 'Compartilhar nos dois perfis'), b('aVers', 'Comparar versões'));
      if (st !== 'ARQUIVADO') out.push(b('aArq', 'Arquivar', 'btn danger-soft'));
      out.push(b('aExcluir', 'Excluir', 'btn danger-soft'));
    }
    return out.join('');
  }

  function materiaisHtml() {
    const ativos = materiaisAtivosDe(r), antigos = (r.materiais || []).filter(m => m.substituido);
    const linha = m => `<li class="mat"><div class="mat-info"><span class="badge">${esc(IG_PAPEIS[m.papel] || m.papel)}</span> <b>${esc(m.nome)}</b> <small>v${m.versao || 1}${m.tipo === 'drive' ? ' · Google Drive' : m.tipo === 'link' ? ' · link' : ''}</small></div><div class="mat-acoes">${m.tipo === 'arquivo' || m.url ? `<a class="btn soft" target="_blank" rel="noopener noreferrer" href="${attr(urlMaterial(m))}">${m.tipo === 'drive' ? 'Abrir no Drive ↗' : 'Abrir'}</a>` : ''}${m.substituido ? '' : `<button type="button" class="btn soft" data-subst="${attr(m.grupo)}" data-papel="${attr(m.papel)}">Substituir versão</button>`}<button type="button" class="btn danger-soft" data-rmmat="${attr(m.id)}" aria-label="Remover ${attr(m.nome)}">Remover</button></div></li>`;
    return `<section class="wide est-mat"><h4>Materiais</h4>
      <ul class="mat-lista">${ativos.map(linha).join('') || '<li class="kpi-note">Nenhum material anexado ainda.</li>'}</ul>
      ${antigos.length ? `<details><summary>Versões anteriores (${antigos.length})</summary><ul class="mat-lista">${antigos.map(linha).join('')}</ul></details>` : ''}
      <div class="mat-novo"><select class="control" id="mPapel" aria-label="Tipo do material">${Object.entries(IG_PAPEIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><label class="btn soft mat-arq">Enviar arquivo<input type="file" id="mArq" multiple hidden></label><input class="control" id="mUrl" placeholder="ou cole um link https (Google Drive…)" aria-label="Link do material"><button type="button" class="btn soft" id="mUrlAdd">Adicionar link</button></div>
      <small class="kpi-note">O arquivo final (imagem, vídeo ou PDF) é o que o Instagram publica. Arquivos do Drive ficam só como link: o sistema não copia nada do seu Drive.</small></section>`;
  }

  /* ---- leitura do formulário e salvamento ---- */
  const val = id => { const e = $('#' + id, dlg.el); return e ? e.value : ''; };
  const montarUtm = () => {
    const base = val('fLink').trim(); if (!/^https:\/\//.test(base)) return '';
    try { const u = new URL(base); [['utm_source', 'uSrc'], ['utm_medium', 'uMed'], ['utm_campaign', 'uCam'], ['utm_content', 'uCon']].forEach(([k, id]) => { const v = val(id).trim(); if (v) u.searchParams.set(k, v); }); return u.toString(); } catch { return ''; }
  };
  const coletar = () => ({
    titulo: val('fTitulo').trim(), perfil: val('fPerfil'), segmento: val('fSeg'), formato: val('fFmt'), campanhaId: val('fCamp'), tema: val('fTema').trim(), objetivo: val('fObj').trim(),
    responsavel: val('fResp'), revisor: val('fRev'), publicacaoEm: val('fQuando'), canal: val('fCanal'), legenda: val('fLeg'), hashtags: val('fTags').trim(), cta: val('fCta').trim(),
    linkDestino: val('fLink').trim(), utmSource: val('uSrc').trim(), utmMedium: val('uMed').trim(), utmCampaign: val('uCam').trim(), utmContent: val('uCon').trim(), roteiro: val('fRot'),
    publicarInstagram: $('#fAuto', dlg.el)?.checked ? 'SIM' : 'NAO',
  });
  const marcaSalvo = (txt, cls = '') => { const e = $('#estSalvo', dlg.el); if (e) { e.textContent = txt; e.className = 'kpi-note ' + cls; } };
  let salvando = false;
  async function salvar({ silencioso = false } = {}) {
    if (salvando) return false; const erro = $('#estErro', dlg.el); if (erro) erro.textContent = '';
    const dados = coletar();
    if (dados.titulo.length < 3) { if (!silencioso && erro) { erro.textContent = 'Dê um título de pelo menos 3 letras.'; $('#fTitulo', dlg.el).focus(); } return false; }
    if (dados.linkDestino && !/^https:\/\/[^\s]{4,500}$/.test(dados.linkDestino)) { if (!silencioso && erro) erro.textContent = 'O link de destino precisa começar com https://'; return false; }
    salvando = true; marcaSalvo('Salvando…');
    try {
      if (edit) r = await put(`/data?module=conteudos&id=${encodeURIComponent(r.id)}`, dados);
      else { const extras = Object.fromEntries(Object.entries(opc.dados || {}).filter(([k]) => /^origem/.test(k))); r = await post('/data?module=conteudos', { ...extras, ...dados, status: r.status || 'RASCUNHO' }); edit = true; }
      invalidate('conteudos'); sujo = false; marcaSalvo('Salvo agora'); return true;
    } catch (e) { if (erro) erro.textContent = e.message; marcaSalvo('Não foi possível salvar', 'bad'); return false; }
    finally { salvando = false; }
  }
  const recarregarTela = async () => { if (state.page === 'igconteudos') { await carregarConteudos(); PAGINAS.igconteudos().catch(() => {}); } else if (state.page === 'hoje') go('hoje'); else if (state.page === 'calendario' && typeof CAL_UNICO !== 'undefined') CAL_UNICO.recarregar(); };
  const reabrir = async () => { const id = r.id; dlg.close(); await recarregarTela(); await editarPublicacao(id); };

  function prever() {
    const box = $('#prevBox', dlg.el); if (!box) return;
    const d = coletar(), finais = materiaisAtivosDe(r, 'final'), mini = materiaisAtivosDe(r, 'miniatura')[0];
    const capa = [...finais, ...(mini ? [mini] : [])].find(ehImagem);
    const perfil = d.perfil && d.perfil !== 'Ambos' ? d.perfil : '@evolucaopb';
    const proporcao = formatoPrev === 'Feed' ? 'p45' : 'p916';
    const midia = capa ? `<img src="${attr(urlMaterial(capa))}" alt="Arte da publicação">` : `<div class="prev-sem">${finais.length ? 'Arte final anexada (sem prévia)' : 'Sem arte final ainda'}</div>`;
    const leg = d.legenda || ''; const curta = leg.length > 125 ? leg.slice(0, 125) + '… <span class="prev-mais">mais</span>' : esc(leg);
    const dur = horasRoteiro(d.roteiro);
    box.innerHTML = `<div class="prev-fone"><div class="prev-topo"><i></i><b>${esc(perfil.replace('@', ''))}</b></div>
      <div class="prev-midia ${proporcao}">${midia}${formatoPrev !== 'Feed' ? `<div class="prev-over">${formatoPrev === 'Stories' ? `<span>${esc(d.titulo)}</span>` : `<span>${esc(leg.slice(0, 90))}</span>`}${d.cta ? `<em>${esc(d.cta)}</em>` : ''}</div>` : ''}</div>
      ${formatoPrev === 'Feed' ? `<div class="prev-leg"><b>${esc(perfil.replace('@', ''))}</b> ${leg ? (leg.length > 125 ? esc(leg.slice(0, 125)) + '… <span class="prev-mais">mais</span>' : esc(leg)) : '<span class="kpi-note">Sua legenda aparece aqui.</span>'}${d.hashtags ? `<div class="prev-tags">${esc(d.hashtags)}</div>` : ''}${d.cta ? `<div class="prev-cta">${esc(d.cta)}</div>` : ''}</div>` : ''}
    </div><p class="kpi-note">${formatoPrev === 'Feed' ? 'Prévia aproximada do Feed (4:5).' : `Prévia aproximada de ${formatoPrev} (9:16).`}${d.roteiro && formatoPrev !== 'Feed' ? ` Roteiro: cerca de ${dur}s.` : ''}</p>`;
    void curta;
  }
  function atualizaContadores() {
    const leg = val('fLeg'), tags = val('fTags'), rot = val('fRot'), fmt = val('fFmt');
    const c = (id, txt, ruim) => { const e = $('#' + id, dlg.el); if (e) { e.textContent = txt; e.classList.toggle('ruim', !!ruim); } };
    c('cLeg', `${leg.length}/2200`, leg.length > 2200); c('cTag', `${contaTags(tags)}/30`, contaTags(tags) > 30);
    c('cRot', rot ? `${(rot.match(/\S+/g) || []).length} palavras · ~${horasRoteiro(rot)}s` : '');
    const rl = $('#roteiroL', dlg.el); if (rl) rl.hidden = !['Stories', 'Reels', 'Vídeo'].includes(fmt);
    const out = montarUtm(); const o = $('#uOut', dlg.el); if (o) o.textContent = out || 'Preencha o link de destino (https) para ver o link com UTM.';
  }

  function ligar() {
    const raiz = dlg.el;
    const mudou = () => { sujo = true; marcaSalvo('Alterações não salvas', 'warn'); atualizaContadores(); prever(); };
    $$('#estForm input, #estForm textarea, #estForm select', raiz).forEach(e => { if (!/^(mArq|mUrl|mPapel|fModelo)$/.test(e.id)) { e.addEventListener('input', mudou); e.addEventListener('change', mudou); } });
    $$('[data-prev]', raiz).forEach(b => { b.onclick = () => { formatoPrev = b.dataset.prev; $$('[data-prev]', raiz).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); prever(); }; });
    $('#fFmt', raiz)?.addEventListener('change', () => { const v = val('fFmt'); if (['Stories', 'Reels'].includes(v)) formatoPrev = v; else formatoPrev = 'Feed'; $$('[data-prev]', raiz).forEach(x => { x.classList.toggle('on', x.dataset.prev === formatoPrev); x.setAttribute('aria-selected', x.dataset.prev === formatoPrev); }); prever(); });
    $('#fModelo', raiz)?.addEventListener('change', e => { const m = modelos[Number(e.target.value)]; if (!m) return; $('#fLeg', raiz).value = m.legenda || ''; $('#fCta', raiz).value = m.cta || $('#fCta', raiz).value; if (m.hashtags) $('#fTags', raiz).value = m.hashtags; e.target.value = ''; mudou(); });
    $$('[data-grupo]', raiz).forEach(b => { b.onclick = () => { const g = grupos[Number(b.dataset.grupo)]; const ta = $('#fTags', raiz); const tem = new Set((ta.value.match(/#[\p{L}\p{N}_]+/gu) || [])); const novos = (g.tags || []).filter(t => !tem.has(t)); ta.value = (ta.value.trim() + ' ' + novos.join(' ')).trim(); mudou(); }; });
    $('#fCopiar', raiz).onclick = () => copiar([val('fLeg'), val('fTags')].filter(Boolean).join('\n\n'), 'Legenda copiada');
    $('#uCopiar', raiz).onclick = () => { const u = montarUtm(); if (!u) return toast('Preencha o link de destino (https) primeiro.', 'warn'); copiar(u, 'Link com UTM copiado'); };
    $('#fIA', raiz)?.addEventListener('click', variacoesIA);
    const ligaAcao = (id, fn) => { const b = $('#' + id, raiz); if (b) b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { $('#estErro', raiz).textContent = e.message; toast(e.message, 'warn'); } finally { if (b.isConnected) b.disabled = false; } }; };
    ligaAcao('aSalvar', async () => { const era = edit; if (await salvar()) { toast(era ? 'Publicação salva' : 'Publicação criada'); if (!era) await reabrir(); else await recarregarTela(); } });
    const mudarStatus = async (status, msg) => { if (!(await salvar())) return; r = await put(`/data?module=conteudos&id=${encodeURIComponent(r.id)}`, { status }); invalidate('conteudos'); toast(msg); await reabrir(); };
    ligaAcao('aProd', () => mudarStatus('EM PRODUÇÃO', 'Enviada para produção'));
    ligaAcao('aRev', async () => { const falta = []; if (!val('fLeg').trim()) falta.push('a legenda'); if (!val('fRev') && !val('fResp')) { /* sem revisor definido: ainda assim pode revisar */ } if (falta.length && !await Dlg.confirmar({ titulo: 'Enviar para revisão', texto: `Ainda falta ${falta.join(' e ')}. Enviar mesmo assim?`, confirmar: 'Enviar' })) return; await mudarStatus('EM REVISÃO', 'Enviada para revisão'); });
    ligaAcao('aAprovar', async () => { if (!(await salvar())) return; const c = await Dlg.perguntar({ titulo: 'Aprovar publicação', rotulo: 'Comentário (opcional)', confirmar: 'Aprovar', longo: true, obrigatorio: false }); if (c === null) return; await post('/content/decision', { id: r.id, decisao: 'APROVADO', comentario: c }); toast('Publicação aprovada'); await reabrir(); });
    ligaAcao('aAjuste', async () => { const c = await Dlg.perguntar({ titulo: 'Pedir ajustes', rotulo: 'O que precisa mudar? *', confirmar: 'Pedir ajustes', longo: true }); if (c === null) return; await post('/content/decision', { id: r.id, decisao: 'AJUSTES SOLICITADOS', comentario: c }); toast('Ajustes solicitados'); await reabrir(); });
    ligaAcao('aAgendar', async () => { if (!(await salvar())) return; await post('/content/schedule', { id: r.id, quando: val('fQuando') }); toast('Publicação agendada'); await reabrir(); });
    ligaAcao('aDesagendar', async () => { await post('/content/schedule', { id: r.id, desagendar: true }); toast('Agendamento desfeito'); await reabrir(); });
    ligaAcao('aConfirmar', async () => { const l = await Dlg.perguntar({ titulo: 'Confirmar publicação', rotulo: 'Link da publicação no Instagram (https)', tipo: 'url', confirmar: 'Confirmar publicado', dica: 'Só confirme depois de ver a publicação no ar.' }); if (l === null) return; await post('/content/confirm', { id: r.id, link: l }); toast('Publicação confirmada'); await reabrir(); });
    ligaAcao('aDup', async () => { const n = await post('/content/duplicate', { id: r.id }); invalidate('conteudos'); toast('Cópia criada como rascunho'); dlg.close(); await recarregarTela(); await editarPublicacao(n.id); });
    ligaAcao('aAdapt', async () => { const alvo = campo('perfil') === '@evolucaopb' ? '@geracaoevolucao' : '@evolucaopb'; if (!await Dlg.confirmar({ titulo: 'Adaptar para outro perfil', texto: `Criar uma cópia deste conteúdo para ${alvo}? A arte final e a data não são copiadas.`, confirmar: 'Criar cópia' })) return; const n = await post('/content/adapt', { id: r.id, perfil: alvo }); invalidate('conteudos'); toast(`Cópia criada para ${alvo}`); dlg.close(); await recarregarTela(); await editarPublicacao(n.id); });
    ligaAcao('aShare', async () => { await post('/content/share', { id: r.id, compartilhado: r.compartilhado !== 'SIM' }); toast(r.compartilhado === 'SIM' ? 'Deixou de ser compartilhada' : 'Compartilhada nos dois perfis'); await reabrir(); });
    ligaAcao('aVers', compararVersoes);
    ligaAcao('aArq', async () => { if (!await Dlg.confirmar({ titulo: 'Arquivar publicação', texto: 'A publicação sai do fluxo. Dá para vê-la filtrando por “Arquivado”.', confirmar: 'Arquivar' })) return; await mudarStatus('ARQUIVADO', 'Publicação arquivada'); });
    ligaAcao('aExcluir', async () => { if (!await Dlg.confirmar({ titulo: 'Excluir publicação', texto: `Excluir “${r.titulo}” definitivamente? Os materiais anexados também saem.`, confirmar: 'Excluir', perigo: true })) return; await api(`/data?module=conteudos&id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }); invalidate('conteudos'); sujo = false; toast('Publicação excluída'); dlg.close(); await recarregarTela(); });
    // materiais
    const enviar = async (arquivos, papel, grupo = '') => {
      const fd = new FormData(); fd.append('id', r.id); fd.append('papel', papel); if (grupo) fd.append('grupo', grupo); [...arquivos].forEach(a => fd.append('files', a));
      const resp = await fetch(`${API}/content/material`, { method: 'POST', credentials: 'same-origin', headers: { 'X-EVO': '1' }, body: fd });
      const j = await resp.json().catch(() => ({})); if (!resp.ok) throw new Error(j.error || 'Não foi possível enviar o arquivo.');
      r.materiais = j.materiais; invalidate('conteudos'); toast('Material anexado'); await reabrir();
    };
    $('#mArq', raiz)?.addEventListener('change', async e => { if (!e.target.files.length) return; try { await enviar(e.target.files, $('#mPapel', raiz).value); } catch (er) { $('#estErro', raiz).textContent = er.message; toast(er.message, 'warn'); } });
    $('#mUrlAdd', raiz)?.addEventListener('click', async () => { const u = $('#mUrl', raiz).value.trim(); if (!u) return toast('Cole o link primeiro.', 'warn'); try { const j = await post('/content/material/link', { id: r.id, papel: $('#mPapel', raiz).value, url: u }); r.materiais = j.materiais; invalidate('conteudos'); toast('Link adicionado'); await reabrir(); } catch (er) { $('#estErro', raiz).textContent = er.message; } });
    $$('[data-rmmat]', raiz).forEach(b => b.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Remover material', texto: 'Remover este material da publicação?', confirmar: 'Remover', perigo: true })) return; try { const j = await post('/content/material/remove', { id: r.id, materialId: b.dataset.rmmat }); r.materiais = j.materiais; invalidate('conteudos'); toast('Material removido'); await reabrir(); } catch (er) { toast(er.message, 'warn'); } });
    $$('[data-subst]', raiz).forEach(b => b.onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.onchange = async () => { if (inp.files.length) try { await enviar(inp.files, b.dataset.papel, b.dataset.subst); } catch (er) { toast(er.message, 'warn'); } }; inp.click(); });
    if (edit) historico();
    atualizaContadores(); prever();
  }

  async function historico() {
    const corpo = $('#estHistCorpo', dlg.el); if (!corpo) return;
    $('#estHist', dlg.el).addEventListener('toggle', async function carregar() {
      if (!$('#estHist', dlg.el).open) return; $('#estHist', dlg.el).removeEventListener('toggle', carregar);
      const [com, tl] = await Promise.all([api(`/comments?module=conteudos&id=${encodeURIComponent(r.id)}`).catch(() => ({ rows: [] })), api(`/timeline?module=conteudos&id=${encodeURIComponent(r.id)}`).catch(() => ({ rows: [] }))]);
      corpo.innerHTML = `<h4>Comentários</h4><ul class="coment">${(com.rows || []).map(c => `<li><b>${esc(c.autor)}</b> <small>${esc(fmtDateTime(c.quando))}</small><div>${esc(c.texto)}</div></li>`).join('') || '<li class="kpi-note">Nenhum comentário.</li>'}</ul><div class="est-linha"><input class="control" id="comNovo" placeholder="Escreva um comentário" aria-label="Novo comentário" maxlength="1000"><button type="button" class="btn soft" id="comAdd">Comentar</button></div><h4>Linha do tempo</h4><ul class="coment">${(tl.rows || []).slice().reverse().map(t => `<li><small>${esc(fmtDateTime(t.quando))} · ${esc(t.ator || '')}</small><div>${esc(t.texto)}${t.motivo ? ` — ${esc(t.motivo)}` : ''}</div></li>`).join('') || '<li class="kpi-note">Sem eventos.</li>'}</ul>`;
      $('#comAdd', corpo).onclick = async () => { const t = $('#comNovo', corpo).value.trim(); if (!t) return; try { await post('/comments', { module: 'conteudos', id: r.id, texto: t }); toast('Comentário enviado'); $('#estHist', dlg.el).open = false; $('#estHist', dlg.el).addEventListener('toggle', carregar); $('#estHist', dlg.el).open = true; } catch (e) { toast(e.message, 'warn'); } };
    });
  }

  async function compararVersoes() {
    const v = await api(`/content/versions?id=${encodeURIComponent(r.id)}`);
    const lista = [...(v.versoes || []).map(x => ({ rot: `Versão ${x.n} · ${fmtDateTime(x.quando)} · ${x.autor || ''}`, ...x })), { rot: 'Texto atual (salvo)', titulo: v.atual.titulo, legenda: v.atual.legenda, hashtags: v.atual.hashtags, cta: v.atual.cta }];
    if (lista.length < 2) return Dlg.aviso({ titulo: 'Comparar versões', texto: 'Ainda não há duas versões do texto. A cada alteração de título, legenda, hashtags ou CTA o sistema guarda uma versão.' });
    const o = dialogo(`<h3>Comparar versões</h3><div class="est-grid"><label>Versão A<select class="control" id="vA">${lista.map((x, i) => `<option value="${i}" ${i === lista.length - 2 ? 'selected' : ''}>${esc(x.rot)}</option>`).join('')}</select></label><label>Versão B<select class="control" id="vB">${lista.map((x, i) => `<option value="${i}" ${i === lista.length - 1 ? 'selected' : ''}>${esc(x.rot)}</option>`).join('')}</select></label></div><div class="vers-cmp" id="vOut"></div><div class="actions"><span class="cm-esp"></span><button class="btn" data-close>Fechar</button></div>`, { larga: true });
    const pinta = () => {
      const a = lista[Number($('#vA', o.el).value)], b = lista[Number($('#vB', o.el).value)];
      const col = (rot, h) => `<div><h4>${rot}</h4>${h}</div>`;
      const blocos = [['Título', 'titulo'], ['Legenda', 'legenda'], ['Hashtags', 'hashtags'], ['CTA', 'cta']].map(([t, k]) => { const [ha, hb] = diffPalavras(a[k], b[k]); return `<div class="vers-par"><h5>${t}</h5><div class="vers-lados">${col('A', `<p>${ha || '<i>vazio</i>'}</p>`)}${col('B', `<p>${hb || '<i>vazio</i>'}</p>`)}</div></div>`; });
      $('#vOut', o.el).innerHTML = blocos.join('') + '<p class="kpi-note"><del>vermelho</del> = só na versão A · <ins>verde</ins> = só na versão B</p>';
    };
    $('#vA', o.el).onchange = pinta; $('#vB', o.el).onchange = pinta; pinta();
  }

  async function variacoesIA() {
    const b = $('#fIA', dlg.el); b.disabled = true;
    try {
      const j = await post('/ia/variacoes', { titulo: val('fTitulo'), legenda: val('fLeg'), formato: val('fFmt'), segmento: val('fSeg'), perfil: val('fPerfil'), objetivo: val('fObj') });
      const o = dialogo(`<h3>Variações sugeridas (rascunho)</h3><p class="kpi-note">Escolha uma para colocar na legenda. Nada é salvo nem publicado sozinho; revise antes.</p><ol class="ia-lista">${(j.variacoes || []).map((v, i) => `<li><p>${esc(v)}</p><button type="button" class="btn soft" data-usa="${i}">Usar na legenda</button></li>`).join('') || '<li class="kpi-note">Nenhuma sugestão veio. Tente de novo.</li>'}</ol><div class="actions"><span class="cm-esp"></span><button class="btn" data-close>Fechar</button></div>`, { larga: true });
      $$('[data-usa]', o.el).forEach(x => x.onclick = () => { $('#fLeg', dlg.el).value = j.variacoes[Number(x.dataset.usa)]; $('#fLeg', dlg.el).dispatchEvent(new Event('input')); o.close(); toast('Variação colocada na legenda (não salva)'); });
    } catch (e) { toast(e.message, 'warn'); } finally { b.disabled = false; }
  }

  async function tentarFechar() {
    if (sujo && !ro) { const ok = await Dlg.confirmar({ titulo: 'Alterações não salvas', texto: 'Você alterou esta publicação e ainda não salvou. Sair mesmo assim?', confirmar: 'Sair sem salvar', cancelar: 'Continuar editando', perigo: true }); if (!ok) return; }
    sujo = false; dlg.close();
  }

  dlg = eleva(montar());
  dlg.el.querySelector('.admin-box').classList.add('est-box');
  // fechar pelo fundo/Esc também avisa sobre alterações não salvas
  dlg.el.addEventListener('click', e => { if (e.target.closest('[data-close]') && sujo && !ro) { e.stopPropagation(); e.preventDefault(); tentarFechar(); } }, true);
  dlg.el.addEventListener('mousedown', e => { if (e.target === dlg.el && sujo && !ro) { e.stopImmediatePropagation(); tentarFechar(); } }, true);
  ligar();
  // salva sozinho a cada 20 s, só quando já existe e houve alteração
  timer = setInterval(() => { if (sujo && edit && !ro && dlg.el.isConnected) salvar({ silencioso: true }); }, 20000);
  window.addEventListener('beforeunload', e => { if (sujo && dlg.el.isConnected) { e.preventDefault(); e.returnValue = ''; } }, { once: true });
  setTimeout(() => $('#fTitulo', dlg.el)?.focus(), 40);
  return dlg;
}

/** Publicações já postadas no Instagram (sincronizadas com a Meta) que não foram criadas no EVO MKT. */
async function igcCarregaMeta() {
  try { IGC.meta = (await api('/instagram/ranking?' + Filtros.query(['periodo', 'perfil', 'formato']))).rows || []; } catch { IGC.meta = []; }
}
