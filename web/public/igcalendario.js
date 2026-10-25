/* Instagram › Calendário: publicações do EVO MKT (programadas e em preparação com data) e as já postadas, sincronizadas com a Meta.
   Não mistura com o Calendário Escolar. Visões Mês, Semana, Dia e Lista. */
const IGCAL = { ref: hojeBR(), modo: pref('igCalModo', 'mes'), posts: {} };
const IGCAL_MODOS = [['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia'], ['lista', 'Lista']];
const IGCAL_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const IGCAL_BR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Dia e hora (America/Fortaleza) de um horário vindo da Meta. */
function igcalQuando(iso) {
  const d = new Date(String(iso || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  if (isNaN(d)) return { dia: String(iso || '').slice(0, 10), hora: '' };
  const p = Object.fromEntries(IGCAL_BR.formatToParts(d).map(x => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
/** Intervalo visível: mês inteiro (mês e lista), semana (domingo a sábado) ou o próprio dia. */
function igcalIntervalo() {
  const ref = IGCAL.ref;
  if (IGCAL.modo === 'dia') return [ref, ref];
  if (IGCAL.modo === 'semana') { const ini = somaDias(ref, -new Date(ref + 'T12:00:00Z').getUTCDay()); return [ini, somaDias(ini, 6)]; }
  const ym = ref.slice(0, 7);
  return [ym + '-01', new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5), 0)).toISOString().slice(0, 10)];
}
function igcalQuery(de, ate) {
  const f = Filtros.get(), qs = new URLSearchParams({ de, ate });
  ['perfil', 'segmento', 'formato', 'campanha'].forEach(k => { if (f[k]) qs.set(k, f[k]); });
  return qs.toString();
}
const igcalMini = r => {
  const m = materiaisAtivosDe(r, 'miniatura')[0] || materiaisAtivosDe(r, 'final').find(ehImagem) || materiaisAtivosDe(r).find(ehImagem);
  return m ? urlMaterial(m) : '';
};

/** Reúne os itens do intervalo: publicações do EVO MKT com data + postagens da Meta que não estão ligadas a elas. */
function igcalItens(de, ate) {
  const f = Filtros.get();
  const ligadas = new Set(IGC.rows.map(r => String(r.instagramMediaId || '')).filter(Boolean));
  const itens = [];
  IGC.rows.forEach(r => {
    const estado = stLimpo(r.status), dia = String(r.publicacaoEm || '').slice(0, 10);
    if (!dia || dia < de || dia > ate || estado === 'ARQUIVADO' || !calPubCabe(r, f)) return;
    itens.push({ origem: 'evo', id: r.id, dia, hora: String(r.publicacaoEm).slice(11, 16), titulo: r.titulo || '(sem título)', perfil: r.perfil || '', formato: r.formato || '', mini: igcalMini(r), estado, rotulo: IG_ESTADO_ROTULO[estado] || estado || '—' });
  });
  (IGCAL.posts[igcalQuery(de, ate)] || []).forEach(p => {
    if (ligadas.has(String(p.id))) return;
    const q = igcalQuando(p.quando);
    itens.push({ origem: 'meta', id: p.id, dia: q.dia, hora: q.hora, titulo: p.titulo || p.legenda || '(sem legenda)', perfil: p.perfil || '', formato: p.formato || '', mini: p.miniatura || '', link: p.link || '', estado: 'PUBLICADO', rotulo: 'Publicado no Instagram' });
  });
  return itens.sort((a, b) => (a.dia + (a.hora || '99:99')).localeCompare(b.dia + (b.hora || '99:99')));
}
const igcalBadge = i => `<span class="badge ${estadoClasse(i.estado)}">${esc(i.rotulo)}</span>`;
const igcalAbrir = i => (i.origem === 'meta' ? `<a class="igcal-item igcal-meta" href="${attr(i.link || '#')}" target="_blank" rel="noopener noreferrer"` : `<button type="button" class="igcal-item ${estadoClasse(i.estado)}" data-pub="${attr(i.id)}"`);
const igcalFecha = i => (i.origem === 'meta' ? '</a>' : '</button>');
const igcalPerfilCurto = p => (p ? '@' + p.replace(/^@/, '').slice(0, 10) : '');

/** Item compacto (mês e semana): miniatura pequena, horário, título e perfil. */
function igcalChip(i) {
  return `${igcalAbrir(i)} title="${attr(`${i.rotulo} · ${i.perfil} · ${i.titulo}`)}">${i.mini ? `<img src="${attr(i.mini)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i aria-hidden="true">◇</i>'}<span><b>${esc(i.hora || '')}</b> ${esc(i.titulo)}<small>${esc(igcalPerfilCurto(i.perfil))} · ${esc(i.rotulo)}</small></span>${igcalFecha(i)}`;
}
/** Item em linha (dia e lista): miniatura maior, horário, título, perfil, formato e status. */
function igcalLinha(i, comData) {
  return `${igcalAbrir(i)}>${i.mini ? `<img class="igcal-img" src="${attr(i.mini)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i class="igcal-img" aria-hidden="true">◇</i>'}<span class="igcal-txt"><b>${comData ? esc(fmtDate(i.dia)) + ' · ' : ''}${esc(i.hora || 'sem horário')}</b> ${esc(i.titulo)}<small>${esc(i.perfil)}${i.formato ? ' · ' + esc(i.formato) : ''}</small></span>${igcalBadge(i)}${igcalFecha(i)}`;
}

function igcalCorpo(itens, de, ate) {
  const hoje = hojeBR(), porDia = new Map();
  itens.forEach(i => (porDia.get(i.dia) || porDia.set(i.dia, []).get(i.dia)).push(i));
  if (!itens.length && IGCAL.modo !== 'dia') return '<div class="empty compact">Nenhuma publicação neste período com os filtros escolhidos.</div>';
  if (IGCAL.modo === 'lista') return `<div class="igcal-lista">${itens.map(i => igcalLinha(i, true)).join('')}</div>`;
  if (IGCAL.modo === 'dia') return `<div class="igcal-lista">${itens.map(i => igcalLinha(i, false)).join('') || '<div class="empty compact">Nada programado nem postado neste dia.</div>'}</div>`;
  const celulas = [];
  const inicio = new Date(de + 'T12:00:00Z').getUTCDay();
  if (IGCAL.modo === 'mes') for (let i = 0; i < inicio; i++) celulas.push('<div class="igcal-dia vazio"></div>');
  for (let k = de; k <= ate; k = somaDias(k, 1)) {
    const lista = porDia.get(k) || [], max = IGCAL.modo === 'semana' ? 99 : 3;
    celulas.push(`<div class="igcal-dia ${k === hoje ? 'hoje' : ''} ${IGCAL.modo === 'semana' ? 'alto' : ''}"><button type="button" class="igcal-num" data-dia="${k}" aria-label="Abrir o dia ${attr(fmtDate(k))}">${IGCAL.modo === 'semana' ? esc(IGCAL_DIAS[new Date(k + 'T12:00:00Z').getUTCDay()].slice(0, 3)) + ' ' : ''}${+k.slice(8)}</button>${lista.slice(0, max).map(igcalChip).join('')}${lista.length > max ? `<button type="button" class="igcal-mais" data-dia="${k}">+${lista.length - max} mais</button>` : ''}</div>`);
  }
  return `<div class="igcal">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<div class="igcal-cab">${x}</div>`).join('')}${celulas.join('')}</div>`;
}

PAGINAS.igcalendario = async function () {
  IGCAL.posts = {};
  await carregarConteudos();
  const desenha = () => {
    const [de, ate] = igcalIntervalo(), itens = igcalItens(de, ate);
    const rot = IGCAL.modo === 'dia' ? `${IGCAL_DIAS[new Date(IGCAL.ref + 'T12:00:00Z').getUTCDay()]}, ${fmtDate(IGCAL.ref)}` : IGCAL.modo === 'semana' ? `${fmtDate(de)} a ${fmtDate(ate)}` : mesRotulo(de.slice(0, 7));
    const modos = IGCAL_MODOS.map(([k, n]) => `<button type="button" class="btn ${IGCAL.modo === k ? '' : 'soft'}" data-modo="${k}" aria-pressed="${IGCAL.modo === k}">${n}</button>`).join('');
    $('#content').innerHTML = `<div class="ig-barra"><button type="button" class="btn soft" data-nav="-1" aria-label="Anterior">‹</button><b class="mes-rot">${esc(rot)}</b><button type="button" class="btn soft" data-nav="1" aria-label="Próximo">›</button><button type="button" class="btn soft" data-nav="hoje">Hoje</button><span class="igcal-modos" role="group" aria-label="Visão do calendário">${modos}</span></div>
      <p class="kpi-note">Programadas e em preparação (com data definida) do EVO MKT e já postadas no Instagram, inclusive as sincronizadas com a Meta. Este calendário não inclui o Calendário Escolar. ${origem({ fonte: 'EVO MKT e Instagram (API oficial da Meta)', periodo: `${de} a ${ate}`, atualizadoEm: IGCAL.sync })}</p>
      <div id="igcalCorpo">${igcalCorpo(itens, de, ate)}</div>`;
    $$('[data-modo]').forEach(b => { b.onclick = () => { IGCAL.modo = b.dataset.modo; setPref('igCalModo', IGCAL.modo); desenha(); carrega(); }; });
    $$('[data-nav]').forEach(b => {
      b.onclick = () => {
        const v = b.dataset.nav;
        if (v === 'hoje') IGCAL.ref = hojeBR();
        else if (IGCAL.modo === 'dia') IGCAL.ref = somaDias(IGCAL.ref, +v);
        else if (IGCAL.modo === 'semana') IGCAL.ref = somaDias(IGCAL.ref, 7 * +v);
        else IGCAL.ref = somaMes(IGCAL.ref.slice(0, 7), +v) + '-01';
        desenha(); carrega();
      };
    });
    $$('[data-dia]').forEach(b => { b.onclick = () => { IGCAL.ref = b.dataset.dia; IGCAL.modo = 'dia'; setPref('igCalModo', 'dia'); desenha(); carrega(); }; });
    $$('[data-pub]', $('#igcalCorpo')).forEach(el => { el.onclick = () => editarPublicacao(el.dataset.pub); });
  };
  const carrega = async () => {
    const [de, ate] = igcalIntervalo(), chave = igcalQuery(de, ate);
    if (IGCAL.posts[chave]) return;
    try { const d = await api('/instagram/ranking?' + chave); IGCAL.posts[chave] = d.rows || []; IGCAL.sync = d.ultimaSync; } catch { IGCAL.posts[chave] = []; }
    if (state.page === 'igcalendario') desenha();
  };
  desenha(); carrega();
};
