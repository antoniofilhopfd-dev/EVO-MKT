/* EVO MKT — núcleo da interface: ajudantes, API, diálogos internos, entrada, menu e navegação das cinco áreas
   (Dashboard, Calendário, Instagram, Tráfego Pago e Configurações). Não usa alert/confirm/prompt do navegador. */
const API = '/api';
const VERSION = '6.0.0';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const attr = v => esc(v).replace(/`/g, '&#96;');
const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; let s = String(v ?? '').trim(); if (!s) return 0; if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); else if (s.includes(',')) s = s.replace(',', '.'); const n = Number(s); return Number.isFinite(n) ? n : 0; };
const money = v => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = v => `${(num(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const fmtN = v => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('pt-BR'));
const fmtDate = v => { if (!v) return '—'; const d = new Date(String(v).length === 10 ? `${v}T12:00:00` : v); return isNaN(d) ? String(v) : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d); };
const fmtDateTime = v => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? String(v) : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d); };
const isoDate = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
/** Hoje no fuso do Colégio (America/Fortaleza), não o do aparelho. */
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = hojeBR;
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const dmBR = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');

const state = { page: 'hoje', cache: new Map(), cacheAt: new Map() };
let internalSession = null;
const pref = (key, def = null) => { try { const v = localStorage.getItem(`evo.${key}`); return v === null ? def : JSON.parse(v); } catch { return def; } };
const setPref = (key, v) => { try { localStorage.setItem(`evo.${key}`, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } };

function toast(msg, type = 'ok') { const t = $('#toast'); if (!t) return; t.textContent = msg; t.className = `toast ${type}`; clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 3600); }
function setTitle(title, sub = '') { $('#pageTitle').textContent = title; $('#pageSub').textContent = sub; document.title = `${title} · EVO MKT`; }

/** Consultas de leitura de uma tela que já não é a atual (a pessoa mudou de aba ou de filtro) ficam sem resposta: nunca sobrescrevem a tela mais recente. */
const API_SEM_EPOCA = /^\/(notificacoes|auth|team|search|admin|integrations\/status)/;
async function api(path, opt = {}) {
  const leitura = !opt.method || String(opt.method).toUpperCase() === 'GET', epoca = state.epoca || 0;
  opt = { ...opt, credentials: 'same-origin', headers: { ...(opt.headers || {}), 'X-EVO': '1' } };
  const r = await fetch(API + path, opt);
  if (r.status === 401 && !path.startsWith('/auth/login')) { sessionStorage.removeItem('evo.internal.session'); toast('Sessão expirada. Entre novamente.', 'warn'); setTimeout(() => location.reload(), 900); throw new Error('Sessão expirada'); }
  if (!r.ok) { let msg = `Erro ${r.status}`; try { const j = await r.json(); msg = j.error || j.message || msg; } catch { /* sem corpo */ } const e = new Error(msg); e.status = r.status; throw e; }
  const ct = r.headers.get('content-type') || '';
  const corpo = ct.includes('json') ? await r.json() : await r.text();
  if (leitura && epoca !== (state.epoca || 0) && !API_SEM_EPOCA.test(path)) return new Promise(() => {});
  return corpo;
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
const put = (path, body) => api(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
async function getRows(m, force = false) {
  const at = state.cacheAt.get(m) || 0;
  if (!force && state.cache.has(m) && Date.now() - at < 15000) return state.cache.get(m);
  const d = await api(`/data?module=${m}`); state.cache.set(m, d); state.cacheAt.set(m, Date.now()); return d;
}
const invalidate = m => { state.cache.delete(m); state.cacheAt.delete(m); };
const adminApi = (p, body) => (body ? post(p, body) : api(p));

/* ---------------- diálogos internos ---------------- */
/** Abre um diálogo com o HTML dado; devolve { el, close }. Fecha com Esc, clique fora ou qualquer [data-close]. */
function dialogo(html, { larga = false, aoFechar } = {}) {
  const o = document.createElement('div');
  o.className = 'admin-overlay';
  o.innerHTML = `<div class="admin-box ${larga ? 'st-box' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { o.remove(); aoFechar && aoFechar(); };
  o.addEventListener('mousedown', e => { if (e.target === o) close(); });
  o.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  document.body.appendChild(o);
  return { el: o, close };
}
const adminOverlay = (html, onClose) => dialogo(html, { aoFechar: onClose });
const Dlg = {
  /** Pergunta de sim/não. Devolve uma promessa de true/false. */
  confirmar({ titulo = 'Confirmar', texto = '', confirmar = 'Confirmar', cancelar = 'Cancelar', perigo = false } = {}) {
    return new Promise(res => {
      let feito = false; const fim = v => { if (!feito) { feito = true; res(v); } };
      const d = dialogo(`<h3>${esc(titulo)}</h3>${texto ? `<p class="dlg-txt">${esc(texto)}</p>` : ''}<div class="actions dlg-acoes"><button type="button" class="btn soft" data-close>${esc(cancelar)}</button><button type="button" class="btn ${perigo ? 'danger' : ''}" id="dlgOk">${esc(confirmar)}</button></div>`, { aoFechar: () => fim(false) });
      d.el.querySelector('#dlgOk').onclick = () => { fim(true); d.close(); };
      d.el.querySelector('#dlgOk').focus();
    });
  },
  /** Pede um texto (ou número/data). Devolve a promessa do valor, ou null se cancelou. */
  perguntar({ titulo = '', rotulo = '', valor = '', tipo = 'text', dica = '', confirmar = 'Salvar', longo = false, obrigatorio = true } = {}) {
    return new Promise(res => {
      let feito = false; const fim = v => { if (!feito) { feito = true; res(v); } };
      const campo = longo ? `<textarea class="control" id="dlgIn" rows="4">${esc(valor)}</textarea>` : `<input class="control" id="dlgIn" type="${tipo}" value="${attr(valor)}" autocomplete="off">`;
      const d = dialogo(`<h3>${esc(titulo)}</h3><form id="dlgForm"><label class="dlg-lbl">${esc(rotulo)}${campo}</label>${dica ? `<small class="kpi-note">${esc(dica)}</small>` : ''}<div class="dlg-erro" id="dlgErro" role="alert"></div><div class="actions dlg-acoes"><button type="button" class="btn soft" data-close>Cancelar</button><button type="submit" class="btn">${esc(confirmar)}</button></div></form>`, { aoFechar: () => fim(null) });
      const inp = d.el.querySelector('#dlgIn'); setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 30);
      d.el.querySelector('#dlgForm').onsubmit = e => { e.preventDefault(); const v = inp.value.trim(); if (obrigatorio && !v) { d.el.querySelector('#dlgErro').textContent = 'Preencha este campo.'; return; } fim(v); d.close(); };
    });
  },
  aviso({ titulo = 'Aviso', texto = '', botao = 'Entendi' } = {}) {
    return new Promise(res => { const d = dialogo(`<h3>${esc(titulo)}</h3><p class="dlg-txt">${esc(texto)}</p><div class="actions dlg-acoes"><button type="button" class="btn" data-close>${esc(botao)}</button></div>`, { aoFechar: () => res() }); d.el.querySelector('.btn').focus(); });
  },
};

/* ---------------- entrada (login) ---------------- */
function renderInternalLogin() {
  document.body.classList.add('internal-login-mode');
  $('#app').style.display = 'none';
  let box = $('#internalLogin');
  if (!box) { box = document.createElement('div'); box.id = 'internalLogin'; document.body.appendChild(box); }
  box.innerHTML = `<div class="internal-login-wrap"><form class="internal-login-card" id="loginForm"><img class="login-logo" src="/api/public/logo" alt="Colégio Evolução" width="230" height="48"><h1>EVO MKT</h1><p>Acesso interno da equipe de Marketing</p><label for="internalCode">Código de acesso</label><input id="internalCode" autocomplete="username" placeholder="Ex.: ANT-3302"><label id="internalPassLbl" for="internalPass">Senha</label><input id="internalPass" type="password" autocomplete="current-password" placeholder="Sua senha"><div id="internalLoginError" role="alert"></div><button class="btn" id="internalLoginBtn" type="submit">Entrar</button><p class="forgot"><a href="#" id="forgotLink">Esqueci minha senha</a></p></form></div>`;
  let codeMode = false;
  fetch('/api/auth/mode').then(r => r.json()).then(m => { if (m.modo === 'codigo') { codeMode = true; const c = $('#internalCode'); c.maxLength = 10; c.placeholder = 'Seu código'; c.autocomplete = 'one-time-code'; $('#internalPass').style.display = 'none'; $('#internalPassLbl').style.display = 'none'; box.querySelector('.forgot').style.display = 'none'; } }).catch(() => {});
  const erro = (t, ok) => { $('#internalLoginError').innerHTML = `<div class="${ok ? 'login-ok' : 'login-error'}">${esc(t)}</div>`; };
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const code = $('#internalCode').value.trim().toUpperCase(), senha = $('#internalPass').value, btn = $('#internalLoginBtn');
    if (!code || (!senha && !codeMode)) return erro(codeMode ? 'Informe seu código.' : 'Informe código e senha.');
    btn.disabled = true;
    try {
      const x = await post('/auth/login', codeMode ? { codigo: code } : { codigo: code, senha });
      const u = x.user;
      if (x.mustChange) { const atual = codeMode ? await Dlg.perguntar({ titulo: 'Primeiro acesso', rotulo: 'Senha temporária recebida na instalação', tipo: 'password' }) : senha; if (atual === null) throw new Error('É necessário definir uma nova senha.'); await trocarSenhaObrigatoria(atual); }
      internalSession = { code: u.code, name: u.name, role: u.role, label: u.label, admin: !!u.admin, perfil: u.perfil };
      sessionStorage.setItem('evo.internal.session', JSON.stringify(internalSession));
      box.remove(); document.body.classList.remove('internal-login-mode'); $('#app').style.display = 'flex'; startApp();
    } catch (er) { erro(er.message || 'Falha no login'); btn.disabled = false; }
  };
  $('#forgotLink').onclick = async e => {
    e.preventDefault();
    const c = ($('#internalCode').value || (await Dlg.perguntar({ titulo: 'Esqueci minha senha', rotulo: 'Seu código de acesso (ex.: ANT-3302)', confirmar: 'Pedir nova senha' })) || '').trim();
    if (!c) return;
    try { const r = await post('/auth/forgot', { codigo: c, tipo: 'interno' }); erro(r.mensagem, true); } catch (er) { erro(er.message); }
  };
  setTimeout(() => $('#internalCode')?.focus(), 30);
}
async function trocarSenhaObrigatoria(atual) {
  for (;;) {
    const nova = await Dlg.perguntar({ titulo: 'Defina uma nova senha', rotulo: 'Nova senha', tipo: 'password', dica: 'De 6 a 8 caracteres, com letras e números.' });
    if (nova === null) throw new Error('É necessário definir uma nova senha.');
    try { await post('/auth/password', { atual, nova }); toast('Senha alterada com sucesso'); return; } catch (e) { await Dlg.aviso({ titulo: 'Senha não aceita', texto: e.message }); }
  }
}
async function changeMyPassword() {
  const atual = await Dlg.perguntar({ titulo: 'Alterar minha senha', rotulo: 'Senha atual', tipo: 'password', confirmar: 'Continuar' }); if (atual === null) return;
  const nova = await Dlg.perguntar({ titulo: 'Alterar minha senha', rotulo: 'Nova senha', tipo: 'password', dica: 'De 6 a 8 caracteres, com letras e números.' }); if (nova === null) return;
  try { await post('/auth/password', { atual, nova }); toast('Senha alterada com sucesso'); } catch (e) { toast(e.message, 'bad'); }
}
function logoutInternal() { fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-EVO': '1' } }).finally(() => { sessionStorage.removeItem('evo.internal.session'); internalSession = null; location.href = location.pathname; }); }
function renderInternalUser() {
  const el = $('#internalUser'); if (!el || !internalSession) return;
  el.innerHTML = `<div class="internal-avatar">${esc(internalSession.name[0])}</div><div><b>${esc(internalSession.name)}</b><small>${esc(internalSession.perfil || internalSession.label)}</small></div><button id="internalPwd" class="internal-logout" title="Alterar minha senha">Senha</button><button id="internalLogout" class="internal-logout" title="Sair">Sair</button>`;
  $('#internalPwd').onclick = changeMyPassword; $('#internalLogout').onclick = logoutInternal;
  fetch('/api/auth/mode').then(r => r.json()).then(m => { if (m.modo === 'codigo') $('#internalPwd')?.remove(); }).catch(() => {});
}

/* ---------------- áreas, menu e navegação ---------------- */
/** Os rótulos de cada página; as áreas agrupam as páginas. Só existem estas cinco áreas. */
const PAGINAS = {}; // página → função que desenha (registrada pelos outros arquivos)
const ROTULOS = {
  hoje: 'Dashboard', calendario: 'Calendário',
  igvisao: 'Visão geral', igconteudos: 'Publicações', igplan: 'Planejamento', igcalendario: 'Calendário', igdesempenho: 'Desempenho', igranking: 'Ranking',
  trafego: 'Visão Geral', tfdesempenho: 'Desempenho', tfrelatorios: 'Relatórios',
  uipainel: 'Painel', uialunos: 'Alunos', uimodelos: 'Modelos', uisolic: 'Solicitações', uirelat: 'Relatórios', uiconfig: 'Ajustes',
  configuracoes: 'Configurações',
};
const DESCRICOES = {
  hoje: 'Visão geral do marketing do Colégio Evolução: Instagram, Tráfego Pago, agenda escolar e integrações, somente consulta.',
  calendario: 'Eventos e atividades escolares do Colégio Evolução, lidos do Google Agenda.',
  igvisao: 'Desempenho orgânico dos perfis do Instagram.', igconteudos: 'Rascunhos, agendadas e já postadas no Instagram, com publicar agora e agendar.',
  igplan: 'Pauta do mês, ideias, campanhas editoriais e modelos.', igcalendario: 'Publicações programadas e já postadas no Instagram, com status, horário e perfil.', igranking: 'As melhores publicações do período, por alcance, interações, engajamento e visualizações.', igdesempenho: 'O que funcionou, por perfil, segmento, formato, tema e horário.',
  trafego: 'Anúncios da Meta: somente consulta. Criar e editar anúncios continua no Gerenciador de Anúncios da Meta.', tfdesempenho: 'Campanhas, conjuntos e anúncios, com fotos dos criativos e filtros.', tfrelatorios: 'Relatórios por período, com pré-visualização antes de imprimir ou salvar em PDF.',
  uipainel: 'Autorizações de uso de imagem dos alunos: visão geral e atividade recente.', uialunos: 'Alunos do colégio: importação, busca e seleção manual de quem precisa de autorização.', uimodelos: 'Modelos do termo de autorização de uso de imagem, com prévia e versão.', uisolic: 'Solicitações de autorização por aluno, com situação e PDF do termo.', uirelat: 'Relatórios de uso de imagem por segmento, turma, período e situação, em tela, PDF e Excel.', uiconfig: 'Ajustes do módulo: prazos, lembretes, mensagens, retenção e permissões.',
  configuracoes: 'Acessos, integrações, backup, auditoria e prontidão do sistema.',
};
const AREAS = [
  { k: 'visao', label: 'Dashboard', icon: '◉', pages: ['hoje'] },
  { k: 'calendario', label: 'Calendário', icon: '▤', pages: ['calendario'] },
  { k: 'instagramarea', label: 'Instagram', icon: '◎', pages: ['igvisao', 'igconteudos', 'igcalendario', 'igdesempenho', 'igranking'] },
  { k: 'trafego', label: 'Tráfego Pago', icon: '↗', pages: ['trafego', 'tfdesempenho', 'tfrelatorios'] },
  { k: 'imagem', label: 'Uso de Imagem', icon: '▣', pages: ['uipainel', 'uialunos', 'uimodelos', 'uisolic', 'uirelat', 'uiconfig'] },
  { k: 'configuracoes', label: 'Configurações', icon: '⚙', pages: ['configuracoes'] },
];
const areaOf = p => AREAS.find(a => a.pages.includes(p));
/** Endereços antigos que ainda podem estar salvos nos favoritos do navegador. */
const REDIRECIONA = { studio: 'igconteudos', conteudos: 'igconteudos', ideias: 'igconteudos', editorial: 'igconteudos', templates: 'igconteudos', igplan: 'igconteudos', instagram: 'igdesempenho', igposts: 'igdesempenho', gerenciador: 'tfdesempenho', tfcriativos: 'tfdesempenho', tfanalises: 'trafego', tfcampanhas: 'tfdesempenho', tfanuncios: 'tfdesempenho', calescolar: 'calendario', datacom: 'calendario', agenda: 'calendario', dashboard: 'hoje' };
const canAccess = p => !!internalSession && !!ROTULOS[p];

function renderNav() {
  const nav = $('#nav'), atual = areaOf(state.page); let html = '';
  AREAS.forEach(a => {
    const last = pref('areaLast.' + a.k, a.pages[0]), alvo = a.pages.includes(last) ? last : a.pages[0], act = atual && atual.k === a.k;
    html += `<button class="navitem ${act ? 'active' : ''}" data-page="${alvo}" data-area="${a.k}" title="${esc(a.label)}" ${act ? 'aria-current="page"' : ''}><span class="navico" aria-hidden="true">${a.icon}</span><span class="navlabel">${esc(a.label)}</span></button>`;
  });
  nav.innerHTML = html;
  $$('.navitem', nav).forEach(b => { b.onclick = () => { go(b.dataset.page); $('#sidebar').classList.remove('open'); }; });
  $('#version').textContent = `v${VERSION}`;
}
function montarSubtabs() {
  const box = $('#subtabs'); if (!box) return; const a = areaOf(state.page);
  if (!a || a.pages.length < 2) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false; box.setAttribute('aria-label', 'Seções de ' + a.label);
  box.innerHTML = a.pages.map(p => `<button class="subtab ${p === state.page ? 'active' : ''}" data-sub="${p}" ${p === state.page ? 'aria-current="page"' : ''}>${esc(ROTULOS[p])}</button>`).join('');
  $$('[data-sub]', box).forEach(btn => { btn.onclick = () => go(btn.dataset.sub); });
  setPref('areaLast.' + a.k, state.page);
}
function montarPerfilCabecalho() {
 const area = $('#headerIgProfile'); if (!area || typeof Filtros === 'undefined') return;
 area.hidden = !String(state.page).startsWith('ig');
 const opcoes = [['','Todos os perfis'],['@evolucaopb','@evolucaopb'],['@geracaoevolucao','@geracaoevolucao']];
 const perfil = Filtros.get().perfil;
 area.innerHTML = `<label for="igPerfilCabecalho">Perfil do Instagram</label><select class="control" id="igPerfilCabecalho" aria-label="Perfil do Instagram">${opcoes.map(([v,l])=>`<option value="${attr(v)}" ${perfil===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
 $('#igPerfilCabecalho',area).onchange = e => Filtros.set({perfil:e.target.value});
}
function updateHeader() { montarPerfilCabecalho(); montarSubtabs(); const a = areaOf(state.page); setTitle(a && a.pages.length > 1 ? `${a.label} · ${ROTULOS[state.page]}` : ROTULOS[state.page] || 'EVO MKT', DESCRICOES[state.page] || ''); }

async function go(page) {
  document.querySelectorAll('.tp-lateral').forEach(x => x.remove());
  if (REDIRECIONA[page]) page = REDIRECIONA[page];
  if (!ROTULOS[page] || !canAccess(page)) page = 'hoje';
  clearInterval(go._timer);
  state.page = page; state.epoca = (state.epoca || 0) + 1; history.replaceState(null, '', `?page=${encodeURIComponent(page)}`);
  renderNav(); updateHeader(); montarFiltros();
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  try {
    const fn = PAGINAS[page]; if (!fn) throw new Error('Esta tela não está disponível.');
    await fn();
  } catch (e) {
    $('#content').innerHTML = `<div class="error-state"><div>!</div><h2>Não foi possível carregar</h2><p>${esc(e.message)}</p><button class="btn" id="retryBtn">Tentar novamente</button></div>`;
    $('#retryBtn').onclick = () => go(page);
  }
}
const bindGoButtons = (raiz = document) => $$('[data-go]', raiz).forEach(b => { b.onclick = () => go(b.dataset.go); });

/* ---------------- notificações ---------------- */
const NOTIF_ROTULO = { responsavel: 'Atribuição', integracao_falha: 'Falha de integração', ig_falha: 'Falha no Instagram', ads_status: 'Anúncio' };
async function atualizarSino() {
  try { const d = await api('/notificacoes'); const b = $('#notifyBtn'); if (b) { b.classList.toggle('has-alerts', d.naoLidas > 0); b.title = d.naoLidas ? `${d.naoLidas} notificação(ões) não lida(s)` : 'Notificações'; } return d; } catch { return null; }
}
async function abrirNotificacoes() {
  const d = await atualizarSino(); if (!d) return toast('Não foi possível carregar as notificações.', 'warn');
  const o = dialogo(`<h3>Notificações</h3><div class="origem-list">${d.rows.map(n => `<div class="notif ${n.lida ? 'lida' : ''}"><b>${esc(n.titulo)}</b><small>${esc(NOTIF_ROTULO[n.tipo] || n.tipo)} · ${esc(fmtDateTime(n.quando))}</small><div>${esc(n.texto)}</div></div>`).join('') || '<div class="empty compact">Nenhuma notificação registrada.</div>'}</div><div class="actions"><button class="btn soft" id="notifAll">Marcar todas como lidas</button><span class="cm-esp"></span><button class="btn" data-close>Fechar</button></div>`);
  o.el.querySelector('#notifAll').onclick = async () => { await post('/notificacoes/lida', { todas: true }); o.close(); atualizarSino(); };
}

/* ---------------- busca e atalhos ---------------- */
async function buscaGlobal(q) {
  q = q.trim(); if (!q) return;
  const rows = await api('/search?q=' + encodeURIComponent(q));
  const ROT = { conteudos: 'Publicação', ideias: 'Ideia', calendario: 'Calendário', campanhas: 'Campanha editorial', templates: 'Modelo', calescolar: 'Calendário escolar', datacom: 'Data comemorativa' };
  const ALVO = { conteudos: 'igconteudos', ideias: 'igconteudos', campanhas: 'igconteudos', templates: 'igconteudos', calendario: 'calendario', calescolar: 'calendario', datacom: 'calendario' };
  const lista = rows.filter(r => ALVO[r.module]);
  setTitle('Busca', `${lista.length} resultado(s) para “${q}”`);
  $('#content').innerHTML = `<div class="search-results-head"><div><small>BUSCA</small><h1>${lista.length} resultado(s)</h1></div></div>` + (lista.length
    ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Onde</th><th>Título</th><th>Status</th><th>Responsável</th></tr></thead><tbody>${lista.map(x => `<tr><td><button class="badge search-go" data-go="${ALVO[x.module]}">${esc(ROT[x.module])}</button></td><td class="titlecell">${esc(x.titulo || '(sem título)')}</td><td>${esc(x.status || '—')}</td><td>${esc(x.responsavel || '—')}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty-rich"><strong>Nenhum resultado</strong><p>Tente outro termo.</p></div>');
  bindGoButtons();
}
function ajudaAtalhos() {
  dialogo(`<h3>Atalhos do EVO MKT</h3><div class="shortcut-grid"><span><kbd>Ctrl K</kbd> Busca</span><span><kbd>Alt H</kbd> Dashboard</span><span><kbd>Alt C</kbd> Calendário</span><span><kbd>Alt I</kbd> Instagram</span><span><kbd>Alt T</kbd> Tráfego Pago</span><span><kbd>Alt N</kbd> Nova publicação</span><span><kbd>?</kbd> Esta ajuda</span></div><div class="actions"><span class="cm-esp"></span><button class="btn" data-close>Fechar</button></div>`);
}

/* ---------------- início ---------------- */
let __ultimaAtividade = Date.now();
function travaAutomatica() {
  ['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { __ultimaAtividade = Date.now(); }, { passive: true }));
  setInterval(() => { const mins = Number(pref('autoLockMinutes', '0')); if (!mins || !internalSession) return; if (Date.now() - __ultimaAtividade >= mins * 60000) { sessionStorage.removeItem('evo.internal.session'); location.reload(); } }, 30000);
}
function startApp() {
  renderInternalUser(); renderNav();
  document.body.classList.toggle('compact', pref('compact', false));
  document.body.classList.toggle('reduced-motion', pref('reducedMotion', false));
  document.body.classList.toggle('high-contrast', pref('highContrast', false));
  document.documentElement.style.setProperty('--evo-font-scale', pref('fontScale', '1'));
  document.body.classList.toggle('sidebar-collapsed', pref('sidebarCollapsed', false));
  const urlPage = new URLSearchParams(location.search).get('page');
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  document.addEventListener('click', e => { const sb = $('#sidebar'); if (sb.classList.contains('open') && !e.target.closest('#sidebar') && !e.target.closest('#menuBtn')) sb.classList.remove('open'); });
  $('#collapseBtn').onclick = () => { const on = !document.body.classList.contains('sidebar-collapsed'); document.body.classList.toggle('sidebar-collapsed', on); setPref('sidebarCollapsed', on); };
  $('#notifyBtn').onclick = abrirNotificacoes;
  $('#newBtn').onclick = () => novaPublicacao();
  Filtros.aoMudar(() => { if (FILTROS_PAGINA[state.page]) go(state.page); });
  const busca = $('#globalSearch');
  busca.onkeydown = e => { if (e.key === 'Enter') buscaGlobal(busca.value).catch(er => toast(er.message, 'warn')); };
  document.addEventListener('keydown', e => {
    const campo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); busca.focus(); busca.select(); return; }
    if (e.altKey && !campo) { const m = { h: 'hoje', c: 'calendario', i: 'igvisao', t: 'trafego' }[e.key.toLowerCase()]; if (m) { e.preventDefault(); go(m); } if (e.key.toLowerCase() === 'n' && typeof novaPublicacao === 'function') { e.preventDefault(); novaPublicacao(); } }
    if (e.key === '?' && !campo) ajudaAtalhos();
  });
  atualizarSino(); setInterval(() => { if (internalSession) atualizarSino(); }, 90000);
  travaAutomatica();
  go(canAccess(urlPage) || REDIRECIONA[urlPage] ? urlPage : 'hoje');
}
async function init() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!r.ok) throw 0;
    const x = await r.json();
    internalSession = { code: x.user.code, name: x.user.name, role: x.user.role, label: x.user.label, admin: !!x.user.admin, perfil: x.user.perfil };
  } catch { sessionStorage.removeItem('evo.internal.session'); internalSession = null; return renderInternalLogin(); }
  $('#app').style.display = 'flex'; startApp();
}
window.addEventListener('DOMContentLoaded', () => { init(); });
