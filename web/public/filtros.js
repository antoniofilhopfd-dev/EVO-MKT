/* Filtros globais do EVO MKT: período, perfil, segmento, formato e campanha editorial.
   Valem em todas as áreas, ficam guardados neste navegador, aparecem sempre com o intervalo de datas e podem ser limpos.
   Um filtro que a área não consegue aplicar NÃO é ignorado em silêncio: a barra o mostra desativado, com o motivo. */
const SEG_LISTA = [['', 'Todos os segmentos'], ['INFANTIL', 'Educação Infantil'], ['FUND1', 'Ensino Fundamental – Anos Iniciais'], ['FUND2', 'Ensino Fundamental – Anos Finais'], ['MEDIO', 'Ensino Médio'], ['ADMIN', 'Administrativo'], ['DIRECAO', 'Direção']];
const PERFIL_LISTA = [['', 'Todos os perfis'], ['@evolucaopb', '@evolucaopb'], ['@geracaoevolucao', '@geracaoevolucao']];
const FORMATO_LISTA = ['Feed', 'Stories', 'Reels', 'Carrossel', 'Vídeo', 'Foto', 'Outro'];
const PERIODOS = [['hoje', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['semana', 'Esta semana'], ['semana_ant', 'Semana anterior'], ['mes', 'Este mês'], ['mes_ant', 'Mês anterior'], ['ano', 'Este ano'], ['prox7', 'Próximos 7 dias'], ['prox30', 'Próximos 30 dias'], ['x', 'Personalizado…']];

const Filtros = (() => {
  const PADRAO = { p: '30', de: '', ate: '', perfil: '', segmento: '', formato: '', campanha: '' };
  let est = { ...PADRAO, ...(pref('filtros', {}) || {}) };
  const ouvintes = [];
  let campanhas = null;

  function intervalo(p, de, ate) {
    const h = hojeBR();
    if (p === 'x' && de && ate) return [de, ate];
    if (p === 'prox7') return [h, somaDias(h, 6)];
    if (p === 'prox30') return [h, somaDias(h, 29)];
    if (p === 'hoje') return [h, h];
    if (p === 'semana') { const d = new Date(h + 'T12:00:00Z').getUTCDay(); return [somaDias(h, -d), h]; }
    if (p === 'semana_ant') { const d = new Date(h + 'T12:00:00Z').getUTCDay(); return [somaDias(h, -d - 7), somaDias(h, -d - 1)]; }
    if (p === 'mes') return [h.slice(0, 8) + '01', h];
    if (p === 'ano') return [h.slice(0, 4) + '-01-01', h];
    if (p === 'mes_ant') { const ult = somaDias(h.slice(0, 8) + '01', -1); return [ult.slice(0, 8) + '01', ult]; }
    const n = Number(p) || 30; return [somaDias(h, -(n - 1)), h];
  }
  const calc = () => { const [de, ate] = intervalo(est.p, est.de, est.ate); return { ...est, de, ate }; };
  const salvar = () => setPref('filtros', { p: est.p, de: est.de, ate: est.ate, perfil: est.perfil, segmento: est.segmento, formato: est.formato, campanha: est.campanha });
  const disparar = () => { salvar(); ouvintes.forEach(f => f(calc())); };

  const api_ = {
    get: calc,
    ativos: () => ['perfil', 'segmento', 'formato', 'campanha'].filter(k => est[k]).length + (est.p !== PADRAO.p ? 1 : 0),
    /** Parâmetros para a consulta ao servidor. `campos` limita aos filtros que a tela aceita. */
    query(campos = ['periodo', 'perfil', 'segmento', 'formato', 'campanha']) {
      const f = calc(), q = new URLSearchParams();
      if (campos.includes('periodo')) { q.set('de', f.de); q.set('ate', f.ate); }
      for (const k of ['perfil', 'segmento', 'formato', 'campanha']) if (campos.includes(k) && f[k]) q.set(k, f[k]);
      return q.toString();
    },
    descricao() { const f = calc(); return `${fmtDate(f.de)} a ${fmtDate(f.ate)}`; },
    set(patch) { est = { ...est, ...patch }; disparar(); },
    limpar() { est = { ...PADRAO }; disparar(); },
    aoMudar(fn) { ouvintes.push(fn); return () => { const i = ouvintes.indexOf(fn); if (i >= 0) ouvintes.splice(i, 1); }; },
    async campanhasEditoriais() { if (!campanhas) { try { campanhas = (await getRows('campanhas')).rows || []; } catch { campanhas = []; } } return campanhas; },
    esquecerCampanhas() { campanhas = null; },
  };
  return api_;
})();

/** Quais filtros cada página aceita e, para os que não aceita, por quê. */
const FILTROS_PAGINA = {
  hoje: { aplica: ['periodo', 'perfil', 'segmento', 'formato', 'campanha'], motivo: {} },
  calendario: { aplica: ['segmento'], motivo: { periodo: 'O calendário tem a própria navegação.', perfil: 'O calendário é exclusivamente escolar.', formato: 'O calendário é exclusivamente escolar.', campanha: 'O calendário é exclusivamente escolar.' } },
  igvisao: { aplica: ['periodo', 'perfil', 'segmento', 'formato', 'campanha'], motivo: {} },
  igconteudos: { aplica: ['perfil', 'segmento', 'formato', 'campanha'], motivo: { periodo: 'Esta lista mostra todas as publicações; use os filtros da lista para a data.' } },
  igplan: { aplica: ['perfil', 'segmento', 'formato', 'campanha'], motivo: { periodo: 'O planejamento navega por mês.' } },
  igdesempenho: { aplica: ['periodo', 'perfil', 'segmento', 'formato', 'campanha'], motivo: {} },
  igranking: { aplica: ['periodo', 'perfil', 'segmento', 'formato', 'campanha'], motivo: {} },
  trafego: { aplica: ['periodo'], motivo: { perfil: 'A Meta Ads não separa por perfil do Instagram.', segmento: 'A Meta Ads não informa o segmento (ele só aparece no nome da campanha).', formato: 'Os anúncios não têm o formato das publicações do EVO MKT.', campanha: 'A campanha editorial é do EVO MKT; a Meta tem as próprias campanhas.' } },
  tfcampanhas: { aplica: ['periodo'], motivo: { perfil: 'A Meta Ads não separa por perfil do Instagram.', segmento: 'A Meta Ads não informa o segmento.', formato: 'Os anúncios não têm o formato das publicações.', campanha: 'A campanha editorial é do EVO MKT; a Meta tem as próprias campanhas.' } },
  tfanuncios: { aplica: ['periodo'], motivo: { perfil: 'A Meta Ads não separa por perfil do Instagram.', segmento: 'A Meta Ads não informa o segmento.', formato: 'Os anúncios não têm o formato das publicações.', campanha: 'A campanha editorial é do EVO MKT; a Meta tem as próprias campanhas.' } },
  configuracoes: null,
};

async function montarFiltros() {
  const box = $('#filtros'); if (!box) return;
  const cfg = FILTROS_PAGINA[state.page];
  if (!cfg) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  const f = Filtros.get(), camps = await Filtros.campanhasEditoriais();
  const dis = k => !cfg.aplica.includes(k);
  const dica = k => (dis(k) ? ` title="${attr(cfg.motivo[k] || 'Não se aplica a esta tela.')}"` : '');
  const sel = (id, k, rot, opcoes) => `<label class="fb-campo ${dis(k) ? 'fb-off' : ''}"${dica(k)}><span>${rot}</span><select class="control" id="${id}" ${dis(k) ? 'disabled' : ''} aria-label="${rot}">${opcoes.map(([v, l]) => `<option value="${attr(v)}" ${String(f[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const rotP = f.p === 'x' ? `${fmtDate(f.de)} – ${fmtDate(f.ate)}` : (PERIODOS.find(p => p[0] === f.p) || [, ''])[1];
  const semEfeito = ['periodo', 'perfil', 'segmento', 'formato', 'campanha'].filter(k => dis(k) && (k === 'periodo' ? false : f[k]));
  const n = Filtros.ativos(), aberto = window.innerWidth >= 860;
  box.innerHTML = `<details class="fb-det" ${aberto ? 'open' : ''}><summary>Filtros${n ? ` · ${n} ativo(s)` : ''} <small>${esc(dis('periodo') ? 'período próprio da tela' : Filtros.descricao())}</small></summary><div class="fb-linha">
    <label class="fb-campo ${dis('periodo') ? 'fb-off' : ''}"${dica('periodo')}><span>Período</span><select class="control" id="fbP" ${dis('periodo') ? 'disabled' : ''} aria-label="Período">${PERIODOS.map(([v, l]) => `<option value="${v}" ${f.p === v ? 'selected' : ''}>${v === 'x' && f.p === 'x' ? esc(rotP) : esc(l)}</option>`).join('')}</select></label>
    ${sel('fbPerfil', 'perfil', 'Perfil do Instagram', PERFIL_LISTA)}${sel('fbSeg', 'segmento', 'Segmento', SEG_LISTA)}
    ${sel('fbFmt', 'formato', 'Formato', [['', 'Todos os formatos'], ...FORMATO_LISTA.map(x => [x, x])])}
    ${sel('fbCamp', 'campanha', 'Campanha editorial', [['', 'Todas as campanhas'], ...camps.map(c => [c.id, c.titulo || c.id])])}
    <button type="button" class="btn soft fb-limpar" id="fbLimpar" ${Filtros.ativos() ? '' : 'disabled'}>Limpar filtros</button>
  </div>
  <div class="fb-info" id="fbInfo">${state.page.startsWith('ig') ? `<span class="fb-perfil-atual">Perfil: <b>${esc((PERFIL_LISTA.find(x=>x[0]===f.perfil)||PERFIL_LISTA[0])[1])}</b></span> · ` : ''}<b>${dis('periodo') ? 'Período: navegação própria desta tela' : 'Período: ' + esc(Filtros.descricao())}</b>${f.p !== 'x' && !dis('periodo') ? ' · fuso America/Fortaleza' : ''}${semEfeito.length ? ` · <span class="fb-aviso">Sem efeito aqui: ${semEfeito.map(k => ({ perfil: 'perfil', segmento: 'segmento', formato: 'formato', campanha: 'campanha editorial' }[k])).join(', ')} (${esc(cfg.motivo[semEfeito[0]] || '')})</span>` : ''}</div></details>`;
  const liga = (id, k) => { const e = $('#' + id, box); if (e) e.onchange = () => Filtros.set({ [k]: e.value }); };
  liga('fbPerfil', 'perfil'); liga('fbSeg', 'segmento'); liga('fbFmt', 'formato'); liga('fbCamp', 'campanha');
  $('#fbP', box).onchange = e => {
    const v = e.target.value;
    if (v === 'x') { e.target.value = f.p; PeriodoPicker.abrir({ de: f.de, ate: f.ate, titulo: 'Escolha o período', max: hojeBR() }, (a, b) => Filtros.set({ p: 'x', de: a, ate: b })); return; }
    Filtros.set({ p: v, de: '', ate: '' });
  };
  $('#fbLimpar', box).onclick = () => Filtros.limpar();
}

/* ---------------- origem dos dados ---------------- */
/** Botão "Origem" que explica de onde vem um indicador: fonte, período, atualização e natureza. */
function origem(o, rotulo = 'Origem') {
  if (!o) return '';
  return `<button type="button" class="origem-btn" data-origem="${attr(JSON.stringify(o))}" title="${attr(`${o.fonte || ''}${o.periodo ? ' · ' + o.periodo : ''}`)}" aria-label="Origem dos dados: ${attr(o.fonte || '')}">ⓘ ${esc(rotulo)}</button>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('.origem-btn'); if (!b) return;
  let o; try { o = JSON.parse(b.dataset.origem); } catch { return; }
  const linha = (r, v) => (v ? `<div class="ori-lin"><b>${r}</b><span>${esc(v)}</span></div>` : '');
  dialogo(`<h3>Origem dos dados</h3>${linha('Fonte', o.fonte)}${linha('Período', o.periodo)}${linha('Natureza', o.natureza)}${linha('Atualizado em', o.atualizadoEm ? fmtDateTime(o.atualizadoEm) : '')}${linha('Sincronização', o.sincronizacao)}${linha('Versão da API', o.versaoApi)}${o.aviso ? `<p class="kpi-note ori-aviso">${esc(o.aviso)}</p>` : ''}<div class="actions"><span class="cm-esp"></span><button class="btn" data-close>Fechar</button></div>`);
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
