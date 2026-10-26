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
    i.origem === 'evo' && !publicada ? `<button type="button" data-ac="excluir" data-id="${attr(i.id)}">Excluir</button>` : '',
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
        if (b.dataset.ac === 'excluir') { if (!await Dlg.confirmar({ titulo: 'Excluir publicação', texto: 'Excluir esta publicação definitivamente? A mídia anexada também sai.', confirmar: 'Excluir', perigo: true })) return; try { await api(`/data?module=conteudos&id=${encodeURIComponent(id)}`, { method: 'DELETE' }); invalidate('conteudos'); toast('Publicação excluída'); go('igconteudos'); } catch (e) { toast(e.message, 'bad'); } return; }
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
function novaPublicacao(opc = {}) { return escolherNovaPublicacao(opc); }
async function editarPublicacao(id) {
  let r;
  try { r = (await api(`/data?module=conteudos&id=${encodeURIComponent(id)}`)); } catch { /* cai para a lista */ }
  if (!r || !r.id) { const lista = (await getRows('conteudos', true)).rows || []; r = lista.find(x => String(x.id) === String(id)); }
  if (!r) return toast('Publicação não encontrada.', 'warn');
  if (r.status === 'PUBLICADO') return toast('Esta publicação já está no Instagram.', 'warn');
  return abrirPublicacao(r.publicacaoEm ? 'agendar' : 'agora', r);
}
const copiar = async (texto, ok) => { try { await navigator.clipboard.writeText(texto); toast(ok); } catch { const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast(ok); } catch { toast('Não foi possível copiar.', 'warn'); } t.remove(); } };

/** Publicações já postadas no Instagram (sincronizadas com a Meta) que não foram criadas no EVO MKT. */
async function igcCarregaMeta() {
  try { IGC.meta = (await api('/instagram/ranking?' + Filtros.query(['periodo', 'perfil', 'formato']))).rows || []; } catch { IGC.meta = []; }
}
