/* Filtros globais do EVO MKT: período, perfil, segmento, formato e campanha editorial.
   Valem em todas as áreas, ficam guardados neste navegador, aparecem sempre com o intervalo de datas e podem ser limpos.
   Um filtro que a área não consegue aplicar NÃO é ignorado em silêncio: a barra o mostra desativado, com o motivo. */
const SEG_LISTA = [['', 'Todos os segmentos'], ['INFANTIL', 'Educação Infantil'], ['FUND1', 'Ensino Fundamental – Anos Iniciais'], ['FUND2', 'Ensino Fundamental – Anos Finais'], ['MEDIO', 'Ensino Médio'], ['ADMIN', 'Administrativo'], ['DIRECAO', 'Direção']];
const PERFIL_LISTA = [['', 'Todos os perfis'], ['@evolucaopb', '@evolucaopb'], ['@geracaoevolucao', '@geracaoevolucao']];
const FORMATO_LISTA = ['Feed', 'Stories', 'Reels', 'Carrossel', 'Vídeo', 'Foto', 'Outro'];
/** Os últimos 12 meses, um por um (Outubro de 2026, Setembro de 2026…), para olhar mês a mês. */
function PERIODOS_MESES() {
  const h = hojeBR(); let y = +h.slice(0, 4), m = +h.slice(5, 7); const out = [];
  for (let i = 0; i < 12; i++) {
    const nome = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1, 12)));
    out.push([`m:${y}-${String(m).padStart(2, '0')}`, nome.charAt(0).toUpperCase() + nome.slice(1)]);
    m--; if (m === 0) { m = 12; y--; }
  }
  return out;
}
const PERIODOS = [['hoje', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['365', 'Últimos 12 meses'], ['semana', 'Esta semana'], ['semana_ant', 'Semana anterior'], ['mes', 'Este mês'], ['mes_ant', 'Mês anterior'], ['ano', 'Este ano'], ['prox7', 'Próximos 7 dias'], ['prox30', 'Próximos 30 dias'], ...PERIODOS_MESES(), ['x', 'Personalizado…']];

const Filtros = (() => {
  /* Cada aba tem os próprios filtros, guardados à parte no navegador (`filtros.<aba>`). Só o perfil do Instagram é
     compartilhado entre as abas do Instagram (`filtros.instagram.perfil`). Mudar o filtro de uma aba não toca nas outras. */
  const CHAVES = { hoje: 'dashboard', calendario: 'calendario', igvisao: 'instagram.visao', igconteudos: 'instagram.conteudos', igplan: 'instagram.planejamento', igcalendario: 'instagram.calendario', igdesempenho: 'instagram.desempenho', igranking: 'instagram.ranking', trafego: 'trafego.visao', tfcampanhas: 'trafego.campanhas', tfanuncios: 'trafego.anuncios' };
  const chaveDe = pg => CHAVES[pg] || 'geral';
  const ehIg = chave => chave.startsWith('instagram.');
  const PADRAO = { p: '30', de: '', ate: '', perfil: '', segmento: '', formato: '', campanha: '' };
  const CAMPOS = Object.keys(PADRAO);
  const memoria = {};
  const ouvintes = [];
  let campanhas = null;
  /** Perfil do Instagram compartilhado. Na primeira vez aproveita o perfil que estava no filtro único antigo (que continua guardado, sem ser apagado). */
  let perfilIg = pref('filtros.instagram.perfil', null);
  if (perfilIg === null) { const antigo = pref('filtros', null); perfilIg = antigo && typeof antigo.perfil === 'string' ? antigo.perfil : ''; setPref('filtros.instagram.perfil', perfilIg); }

  function intervalo(p, de, ate) {
    const h = hojeBR();
    if (p === 'x' && de && ate) return [de, ate];
    if (p === 'prox7') return [h, somaDias(h, 6)];
    if (p === 'prox30') return [h, somaDias(h, 29)];
    if (p === 'hoje') return [h, h];
    if (p === 'semana') { const d = new Date(h + 'T12:00:00Z').getUTCDay(); return [somaDias(h, -d), h]; }
    if (p === 'semana_ant') { const d = new Date(h + 'T12:00:00Z').getUTCDay(); return [somaDias(h, -d - 7), somaDias(h, -d - 1)]; }
    if (/^a:\d{4}$/.test(p)) { const y = p.slice(2); return [y + '-01-01', y + '-12-31' > h ? h : y + '-12-31']; }
    if (/^m:\d{4}-\d{2}$/.test(p)) { const ym = p.slice(2), fim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10); return [ym + '-01', fim > h ? h : fim]; }
    if (p === 'mes') return [h.slice(0, 8) + '01', h];
    if (p === 'ano') return [h.slice(0, 4) + '-01-01', h];
    if (p === 'mes_ant') { const ult = somaDias(h.slice(0, 8) + '01', -1); return [ult.slice(0, 8) + '01', ult]; }
    const n = Number(p) || 30; return [somaDias(h, -(n - 1)), h];
  }

  const carregar = chave => {
    if (!memoria[chave]) { const g = pref('filtros.' + chave, null) || {}; memoria[chave] = Object.fromEntries(CAMPOS.map(k => [k, typeof g[k] === 'string' ? g[k] : PADRAO[k]])); }
    return memoria[chave];
  };
  const chaveAtual = () => chaveDe(typeof state !== 'undefined' ? state.page : '');
  const salvar = chave => setPref('filtros.' + chave, carregar(chave));
  /** Valores efetivos da aba atual (ou da aba `pg`). No Instagram o perfil é o compartilhado e segmento/campanha não existem. */
  const calc = pg => {
    const chave = pg ? chaveDe(pg) : chaveAtual(), e = carregar(chave), [de, ate] = intervalo(e.p, e.de, e.ate);
    return { ...e, de, ate, ...(ehIg(chave) ? { perfil: perfilIg, segmento: '', campanha: '' } : {}) };
  };
  const disparar = () => { if (typeof state !== 'undefined') state.epoca = (state.epoca || 0) + 1; ouvintes.forEach(f => f(calc())); };

  const api_ = {
    get: calc,
    chave: chaveAtual,
    /** Quantos filtros da aba atual fogem do padrão (o perfil compartilhado do Instagram não conta). */
    ativos: () => { const f = calc(), chave = chaveAtual(); return ['perfil', 'segmento', 'formato', 'campanha'].filter(k => f[k] && !(k === 'perfil' && ehIg(chave))).length + (carregar(chave).p !== PADRAO.p ? 1 : 0); },
    /** Parâmetros para a consulta ao servidor, da aba atual. `campos` limita aos filtros que a tela aceita. */
    query(campos = ['periodo', 'perfil', 'segmento', 'formato', 'campanha']) {
      const f = calc(), q = new URLSearchParams();
      if (campos.includes('periodo')) { q.set('de', f.de); q.set('ate', f.ate); }
      for (const k of ['perfil', 'segmento', 'formato', 'campanha']) if (campos.includes(k) && f[k]) q.set(k, f[k]);
      return q.toString();
    },
    descricao() { const f = calc(); return `${fmtDate(f.de)} a ${fmtDate(f.ate)}`; },
    set(patch) {
      const chave = chaveAtual(), e = carregar(chave), resto = { ...patch };
      if ('perfil' in resto && ehIg(chave)) { perfilIg = String(resto.perfil || ''); setPref('filtros.instagram.perfil', perfilIg); delete resto.perfil; }
      for (const k of CAMPOS) if (k in resto) e[k] = String(resto[k] ?? '');
      salvar(chave); disparar();
    },
    /** Restaura os padrões da aba atual. Não mexe nas outras abas nem no perfil compartilhado do Instagram. */
    limpar() { const chave = chaveAtual(); memoria[chave] = { ...PADRAO }; salvar(chave); setPref('filtros.' + chave + '.local', {}); disparar(); },
    /** Filtros próprios de uma tela (status, busca, ordenação…): ficam guardados na aba e voltam ao padrão em "Limpar filtros". */
    localGet(padrao) { const l = pref('filtros.' + chaveAtual() + '.local', null) || {}; return Object.fromEntries(Object.keys(padrao).map(k => [k, k in l ? l[k] : padrao[k]])); },
    localSet(patch) { const c = chaveAtual(); setPref('filtros.' + c + '.local', { ...(pref('filtros.' + c + '.local', null) || {}), ...patch }); },
    temLocal() { const l = pref('filtros.' + chaveAtual() + '.local', null) || {}; return Object.keys(l).length > 0; },
    aoMudar(fn) { ouvintes.push(fn); return () => { const i = ouvintes.indexOf(fn); if (i >= 0) ouvintes.splice(i, 1); }; },
    async campanhasEditoriais() { if (!campanhas) { try { campanhas = (await getRows('campanhas')).rows || []; } catch { campanhas = []; } } return campanhas; },
    esquecerCampanhas() { campanhas = null; },
  };
  return api_;
})();

/** Filtros que cada aba oferece. A barra só mostra os que funcionam na aba; o perfil do Instagram fica no cabeçalho. */
const FILTROS_PAGINA = {
  hoje: { aplica: ['periodo', 'perfil', 'segmento', 'formato', 'campanha'] },
  calendario: { aplica: ['perfil', 'segmento', 'formato', 'campanha'] },
  igvisao: { aplica: ['periodo', 'formato'] },
  igconteudos: { aplica: ['formato'] },
  igplan: { aplica: ['formato'] },
  igcalendario: { aplica: ['formato'] },
  igdesempenho: { aplica: ['periodo', 'formato'] },
  igranking: { aplica: ['periodo', 'formato'] },
  trafego: { aplica: ['periodo'] },
  tfcampanhas: { aplica: ['periodo'] },
  tfanuncios: { aplica: ['periodo'] },
  configuracoes: null,
};
const PERIODOS_RAPIDOS = [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['semana', 'Esta semana'], ['mes', 'Este mês']];

async function montarFiltros() {
  const box = $('#filtros'); if (!box) return;
  const pagina = state.page, cfg = FILTROS_PAGINA[pagina];
  if (!cfg || !cfg.aplica.length) { box.hidden = true; box.innerHTML = ''; return; }
  const tem = k => cfg.aplica.includes(k), ig = pagina.startsWith('ig');
  const camps = tem('campanha') ? await Filtros.campanhasEditoriais() : [];
  if (state.page !== pagina) return; // a pessoa já foi para outra aba
  box.hidden = false;
  const f = Filtros.get();
  const sel = (id, k, rot, opcoes) => `<label class="fb-campo"><span>${rot}</span><select class="control" id="${id}" aria-label="${rot}">${opcoes.map(([v, l]) => `<option value="${attr(v)}" ${String(f[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const rotP = f.p === 'x' ? `${fmtDate(f.de)} – ${fmtDate(f.ate)}` : (PERIODOS.find(p => p[0] === f.p) || [, ''])[1];
  /* Visão Geral do Instagram: Mês e Ano como seleção principal, mais quatro botões rápidos; o botão ativo é o período realmente aplicado. */
  const anoAtual = +hojeBR().slice(0, 4);
  const periodoVisao = () => `<label class="fb-campo"><span>Mês</span><select class="control" id="fbMes" aria-label="Mês"><option value="">Escolha o mês</option>${PERIODOS_MESES().map(([v, l]) => `<option value="${v}" ${f.p === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="fb-campo"><span>Ano</span><select class="control" id="fbAno" aria-label="Ano"><option value="">Escolha o ano</option>${[anoAtual, anoAtual - 1, anoAtual - 2].map(y => `<option value="a:${y}" ${f.p === 'a:' + y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
    <div class="fb-rapidos" role="group" aria-label="Períodos rápidos">${PERIODOS_RAPIDOS.map(([v, l]) => `<button type="button" class="pill ${f.p === v ? 'on' : ''}" data-fbp="${v}" aria-pressed="${f.p === v}">${l}</button>`).join('')}</div>`;
  const periodoLista = () => `<label class="fb-campo"><span>Período</span><select class="control" id="fbP" aria-label="Período">${PERIODOS.map(([v, l]) => `<option value="${v}" ${f.p === v ? 'selected' : ''}>${v === 'x' && f.p === 'x' ? esc(rotP) : esc(l)}</option>`).join('')}</select></label>`;
  const n = Filtros.ativos(), aberto = window.innerWidth >= 860;
  box.innerHTML = `<details class="fb-det" ${aberto ? 'open' : ''}><summary>Filtros${n ? ` · ${n} ativo(s)` : ''} ${tem('periodo') ? `<small>${esc(Filtros.descricao())}</small>` : ''}</summary><div class="fb-linha">
    ${tem('periodo') ? (pagina === 'igvisao' ? periodoVisao() : periodoLista()) : ''}
    ${tem('perfil') && !ig ? sel('fbPerfil', 'perfil', 'Perfil do Instagram', PERFIL_LISTA) : ''}${tem('segmento') ? sel('fbSeg', 'segmento', 'Segmento', SEG_LISTA) : ''}
    ${tem('formato') ? sel('fbFmt', 'formato', 'Formato', [['', 'Todos os formatos'], ...FORMATO_LISTA.map(x => [x, x])]) : ''}
    ${tem('campanha') ? sel('fbCamp', 'campanha', 'Campanha editorial', [['', 'Todas as campanhas'], ...camps.map(c => [c.id, c.titulo || c.id])]) : ''}
    <button type="button" class="btn soft fb-limpar" id="fbLimpar" ${n || Filtros.temLocal() ? '' : 'disabled'}>Limpar filtros</button>
  </div>
  ${tem('periodo') ? `<div class="fb-info" id="fbInfo"><b>Período: ${esc(Filtros.descricao())}</b></div>` : ''}</details>`;
  const liga = (id, k) => { const e = $('#' + id, box); if (e) e.onchange = () => Filtros.set({ [k]: e.value }); };
  liga('fbPerfil', 'perfil'); liga('fbSeg', 'segmento'); liga('fbFmt', 'formato'); liga('fbCamp', 'campanha');
  const mes = $('#fbMes', box), ano = $('#fbAno', box);
  if (mes) mes.onchange = () => { if (mes.value) Filtros.set({ p: mes.value, de: '', ate: '' }); };
  if (ano) ano.onchange = () => { if (ano.value) Filtros.set({ p: ano.value, de: '', ate: '' }); };
  $$('[data-fbp]', box).forEach(b => { b.onclick = () => Filtros.set({ p: b.dataset.fbp, de: '', ate: '' }); });
  const lista = $('#fbP', box);
  if (lista) lista.onchange = e => {
    const v = e.target.value;
    if (v === 'x') { e.target.value = f.p; PeriodoPicker.abrir({ de: f.de, ate: f.ate, titulo: 'Escolha o período', max: hojeBR() }, (a, b) => Filtros.set({ p: 'x', de: a, ate: b })); return; }
    Filtros.set({ p: v, de: '', ate: '' });
  };
  $('#fbLimpar', box).onclick = () => Filtros.limpar();
}

/* ---------------- origem dos dados ---------------- */
/** Botão "Origem" que explica de onde vem um indicador: fonte, período, atualização e natureza. */
function origem(o, rotulo = '') {
  if (!o) return '';
  return `<button type="button" class="origem-btn" data-origem="${attr(JSON.stringify(o))}" title="${attr(`${o.fonte || ''}${o.periodo ? ' · ' + o.periodo : ''}`)}" aria-label="Fonte dos dados: ${attr(o.fonte || '')}">ⓘ ${esc(rotulo)}</button>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('.origem-btn'); if (!b) return;
  let o; try { o = JSON.parse(b.dataset.origem); } catch { return; }
  const linha = (r, v) => (v ? `<div class="ori-lin"><b>${r}</b><span>${esc(v)}</span></div>` : '');
  dialogo(`<h3>Fonte dos dados</h3>${linha('Fonte', o.fonte)}${linha('Período', o.periodo)}${linha('Natureza', o.natureza)}${linha('Atualizado em', o.atualizadoEm ? fmtDateTime(o.atualizadoEm) : '')}${linha('Sincronização', o.sincronizacao)}${linha('Versão da API', o.versaoApi)}${o.aviso ? `<p class="kpi-note ori-aviso">${esc(o.aviso)}</p>` : ''}<div class="actions"><span class="cm-esp"></span><button class="btn" data-close>Fechar</button></div>`);
});

/** Pequena seta/variação de um indicador em relação ao período anterior. `bomSubir`: false quando subir é ruim (custos). */
function delta(v, { bomSubir = true } = {}) {
  if (!v || v.tipo === 'sem') return '<i class="kd flat">sem base de comparação</i>';
  if (v.tipo === 'novo') return '<i class="kd flat">novo no período</i>';
  if (v.tipo === 'estavel') return '<i class="kd flat">estável</i>';
  const sobe = v.tipo === 'subiu', bom = sobe === bomSubir;
  return `<i class="kd ${bom ? 'up' : 'down'}">${sobe ? '▲' : '▼'} ${Math.abs(v.percentual).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. período anterior</i>`;
}

/** A data é a da coleta, nunca a hora de abertura da tela. */
function avisoAtualizacao(o, limiteHoras = 48) {
  const raw = o?.atualizadoEm;
  const ms = raw ? Date.parse(raw) : NaN;
  const antiga = Number.isFinite(ms) && Date.now() - ms > limiteHoras * 3600000;
  const texto = !Number.isFinite(ms) ? 'Sem sincronização confirmada' : `Dados coletados em ${fmtDateTime(raw)}${antiga ? ' · atualização pendente' : ''}`;
  return `<p class="foco-chip" role="status">${esc(texto)} · ${esc(o?.periodo || 'período não informado')}${!Number.isFinite(ms) || antiga ? ' · Confira a conexão em Configurações.' : ''}${o?.aviso ? ' · ' + esc(o.aviso) : ''}</p>`;
}
