/* Instagram › Ranking: as melhores publicações do período (já postadas, lidas da Meta), com imagem e classificação por métrica. */
const IGR_ORDEM = [['alcance', 'Alcance'], ['interacoes', 'Interações'], ['engajamento', 'Engajamento'], ['visualizacoes', 'Visualizações'], ['curtidas', 'Curtidas'], ['comentarios', 'Comentários'], ['salvos', 'Salvamentos'], ['compartilhamentos', 'Compartilhamentos']];
const IGR = { ordem: pref('igrOrdem', 'interacoes'), visao: pref('igrVisao', 'mes') };
const IGR_COLS = [['seguidores', 'Seguidores'], ['variacao', 'Variação'], ['posts', 'Posts'], ['reels', 'Reels'], ['alcance', 'Alcance'], ['impressoes', 'Visualizações'], ['visitasPerfil', 'Visitas ao perfil'], ['interacoes', 'Interações'], ['curtidas', 'Curtidas'], ['comentarios', 'Comentários'], ['compartilhamentos', 'Compartilh.'], ['salvamentos', 'Salvamentos']];
const igrRotulo = per => (per.length === 4 ? per : new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(per + '-01T12:00:00Z')));
const igrEmAndamento = per => hojeBR().startsWith(per);
const igrN = v => (v === null || v === undefined ? '—' : fmtN(v));
const igrCorta = (t, n = 110) => { const s = String(t || '(sem legenda)').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; };

PAGINAS.igranking = async function () {
  const [d, mens] = await Promise.all([api('/instagram/ranking?' + Filtros.query()), api('/instagram/mensal?' + Filtros.query()).catch(() => null)]);
  const todas = d.rows || [];
  // só oferece a classificação por métricas que a Meta realmente informou para alguma publicação
  const disponivel = k => todas.some(p => p[k] !== null && p[k] !== undefined);
  const ordens = IGR_ORDEM.filter(([k]) => ['interacoes', 'curtidas'].includes(k) || disponivel(k));
  if (!ordens.some(([k]) => k === IGR.ordem)) IGR.ordem = 'interacoes';
  const k = IGR.ordem;
  const ranking = [...todas].sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1) || String(b.quando).localeCompare(String(a.quando))).slice(0, 100);
  const mini = p => (p.miniatura ? `<img src="${attr(p.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="db-sem-img">Sem imagem</span>');
  const link = (p, txt) => (p.link ? `<a href="${attr(p.link)}" target="_blank" rel="noopener noreferrer">${txt}</a>` : txt);
  const valor = (p, key) => (key === 'engajamento' ? (p.engajamento === null ? '—' : String(p.engajamento).replace('.', ',') + '%') : igrN(p[key]));
  const colunas = IGR_ORDEM.filter(([c]) => disponivel(c) || ['interacoes', 'curtidas'].includes(c));
  const podio = ranking.slice(0, 3).map((p, i) => `<article class="igr-podio"><b class="igr-pos">${i + 1}º</b><div class="igr-img">${link(p, mini(p))}</div><div><small>${esc(p.perfil)} · ${esc(p.formato)} · ${esc(fmtDate(igcalQuando(p.quando).dia))}</small><p>${esc(igrCorta(p.titulo || p.legenda, 90))}</p><strong>${valor(p, k)}</strong> <small>${esc((ordens.find(o => o[0] === k) || [])[1] || '')}</small></div></article>`).join('');
  $('#content').innerHTML = `<div class="ig-barra"><label class="igr-ord">Classificar por <select class="control" id="igrOrdem" aria-label="Classificar por">${ordens.map(([c, n]) => `<option value="${c}" ${c === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label><span class="kpi-note">${todas.length} publicação(ões) · ${esc(Filtros.descricao())}</span></div>
    ${d.aviso ? `<p class="foco-chip">${esc(d.aviso)}</p>` : ''}
    ${igrMensalHtml(mens)}
    ${todas.length ? `<div class="igr-podios">${podio}</div>
    <section class="card"><div class="db-tit"><h2>Ranking das publicações</h2>${origem(d.origem)}</div><div class="tablewrap"><table class="datatable igr-tab"><thead><tr><th>#</th><th></th><th>Publicação</th>${colunas.map(([c, n]) => `<th class="num ${c === k ? 'igr-sel' : ''}">${n}</th>`).join('')}</tr></thead><tbody>${ranking.map((p, i) => `<tr><td><b>${i + 1}º</b></td><td class="rk-thumb">${link(p, mini(p))}</td><td>${link(p, esc(igrCorta(p.titulo || p.legenda)))}<br><small>${esc(p.perfil)} · ${esc(p.formato)} · ${esc(fmtDate(igcalQuando(p.quando).dia))}</small></td>${colunas.map(([c]) => `<td class="num ${c === k ? 'igr-sel' : ''}">${valor(p, c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="kpi-note">Engajamento = interações ÷ alcance. Visualizações, alcance e salvamentos aparecem só quando a Meta os informa para a publicação; o que a Meta não informa fica “—”, nunca zero.</p></section>`
    : `<div class="empty-rich"><strong>Nenhuma publicação neste período</strong><p>Conecte o perfil em Configurações › Instagram e sincronize, ou amplie o período nos Filtros.</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>`}`;
  bindGoButtons(); igrMensalLiga(mens);
  const sel = $('#igrOrdem'); if (sel) sel.onchange = () => { IGR.ordem = sel.value; setPref('igrOrdem', IGR.ordem); PAGINAS.igranking(); };
};

/** Informações mensais e anuais da conta: seguidores, alcance, visualizações, interações e publicações de cada período. */
function igrMensalHtml(m) {
  if (!m) return '';
  const serie = IGR.visao === 'ano' ? m.anual : m.mensal;
  const celula = (x, k, i) => {
    const v = x[k];
    if (v === null || v === undefined) return '—';
    if (k === 'variacao') return `<span class="${v >= 0 ? 'tg-bom' : 'tg-ruim'}">${v > 0 ? '+' : ''}${fmtN(v)}</span>`;
    const ant = i > 0 ? serie[i - 1][k] : null;
    const dl = ant && !['posts', 'reels', 'seguidores'].includes(k) && !igrEmAndamento(x.periodo) ? Math.round(((v - ant) / ant) * 1000) / 10 : null;
    return fmtN(v) + (dl === null ? '' : `<br><small class="${dl >= 0 ? 'tg-bom' : 'tg-ruim'}">${dl >= 0 ? '▲' : '▼'} ${Math.abs(dl).toLocaleString('pt-BR')}%</small>`);
  };
  const linhas = serie.map((x, i) => `<tr><td><b>${esc(igrRotulo(x.periodo))}</b>${igrEmAndamento(x.periodo) ? '<br><small>em andamento (parcial)</small>' : ''}</td>${IGR_COLS.map(([k]) => `<td class="num">${celula(x, k, i)}</td>`).join('')}</tr>`).reverse().join('');
  return `<section class="card"><div class="db-tit"><h2>Informações mensais da conta</h2>${origem(m.origem)}</div>
    <div class="ig-barra"><span class="igcal-modos" role="group" aria-label="Agrupar por"><button type="button" class="btn ${IGR.visao === 'mes' ? '' : 'soft'}" data-igr-visao="mes">Por mês</button><button type="button" class="btn ${IGR.visao === 'ano' ? '' : 'soft'}" data-igr-visao="ano">Por ano</button></span>
      <button type="button" class="btn soft" id="igrHist">Carregar histórico (12 meses)</button><button type="button" class="btn soft" id="igrSegManual">Informar seguidores de um mês</button><a class="btn soft" href="/relatorio-instagram.html" target="_blank" rel="noopener">Relatório mensal (PDF)</a></div>
    <p class="kpi-note">${m.atual !== null && m.atual !== undefined ? `Seguidores hoje: <b>${fmtN(m.atual)}</b>. ` : ''}${esc(m.contas.map(c => '@' + c.replace(/^@/, '')).join(' e '))}</p>
    ${serie.length ? `<div class="tablewrap"><table class="datatable igr-mensal"><thead><tr><th>${IGR.visao === 'ano' ? 'Ano' : 'Mês'}</th>${IGR_COLS.map(([, n]) => `<th class="num">${n}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>` : '<div class="empty compact">Ainda sem dados mensais. Use “Carregar histórico (12 meses)”.</div>'}
    <p class="kpi-note">Alcance, visualizações e visitas somam os meses carregados; no ano, pessoas alcançadas em meses diferentes podem se repetir. Seguidores: a Meta não informa o passado; o sistema guarda uma foto por sincronização${m.primeiroRegistro ? ` desde ${esc(fmtDate(m.primeiroRegistro))}` : ''}, então meses anteriores ficam “—” até a primeira foto (ou até você informar o número). Posts e reels vêm das publicações lidas.</p></section>`;
}
function igrMensalLiga(m) {
  $$('[data-igr-visao]').forEach(b => { b.onclick = () => { IGR.visao = b.dataset.igrVisao; setPref('igrVisao', IGR.visao); PAGINAS.igranking(); }; });
  const h = $('#igrHist');
  if (h) h.onclick = async () => { h.disabled = true; h.textContent = 'Carregando… pode levar 1 minuto'; try { await post('/integrations/instagram/sync', { meses: 12 }); toast('Histórico carregado'); PAGINAS.igranking(); } catch (e) { toast(e.message, 'bad'); h.disabled = false; h.textContent = 'Carregar histórico (12 meses)'; } };
  const sm = $('#igrSegManual');
  if (sm) sm.onclick = async () => {
    const contas = (await api('/instagram/contas')).contas || [], perfil = Filtros.get().perfil.replace(/^@/, '').replace(/[._]/g, '').toLowerCase();
    const ov = adminOverlay(`<h3>Seguidores de um mês passado</h3><p class="kpi-note">Use o número que aparece no seu Instagram no fim daquele mês. Só vale para meses que o sistema ainda não registrou sozinho.</p>
      <div class="st-form"><div class="st-row"><label>Perfil<select id="igrSc" class="control">${contas.map(c => `<option value="${attr(c.ig)}" ${perfil && c.usuario.replace(/[._@]/g, '').toLowerCase() === perfil ? 'selected' : ''}>@${esc(c.usuario.replace(/^@/, ''))}</option>`).join('')}</select></label><label>Mês<input id="igrSm" type="month"></label><label>Seguidores<input id="igrSn" type="number" min="0"></label></div>
      <div class="st-acoes"><button class="btn soft" data-close type="button">Cancelar</button><button class="btn" id="igrSs" type="button">Salvar</button></div></div>`);
    $('#igrSs', ov.el).onclick = async () => { try { await post('/instagram/seguidores/manual', { conta: $('#igrSc', ov.el).value, mes: $('#igrSm', ov.el).value, seguidores: Number($('#igrSn', ov.el).value) }); ov.close(); toast('Seguidores registrados'); PAGINAS.igranking(); } catch (e) { toast(e.message, 'bad'); } };
  };
}
