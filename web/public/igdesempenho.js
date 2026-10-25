/* Instagram › Desempenho: o que funcionou, por perfil, segmento, formato, tema, objetivo, campanha editorial, dia e horário. */
const IGD_DIMS = [['formato', 'Formato'], ['perfil', 'Perfil'], ['dia', 'Dia da semana'], ['horario', 'Horário']];
const IGD = { dim: ['formato', 'perfil', 'dia', 'horario'].includes(pref('igdDim', 'formato')) ? pref('igdDim', 'formato') : 'formato', todas: false, ordem: pref('igdOrdem', 'quando') };
const IGD_ORDEM = [['quando', 'Mais recentes'], ['interacoes', 'Interações'], ['alcance', 'Alcance'], ['engajamento', 'Engajamento'], ['visualizacoes', 'Visualizações']];
const igdN = v => (v === null || v === undefined ? '—' : fmtN(v));
/** Cartão de uma postagem com imagem e todas as métricas que a Meta informou. */
const igdCartao = p => `<article class="ig-card"><${p.link ? `a href="${attr(p.link)}" target="_blank" rel="noopener noreferrer"` : 'div'} class="ig-thumb" title="Abrir no Instagram">${p.miniatura ? `<img src="${attr(p.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${esc(p.formato)}</span>`}</${p.link ? 'a' : 'div'}><div class="ig-body"><div class="ig-meta"><b>${esc(p.formato)}</b><span>${esc(fmtDate(igcalQuando(p.quando).dia))} · ${esc(p.perfil)}</span></div><p>${esc(p.titulo || p.legenda || '(sem legenda)')}</p><dl><div><dt>Visualizações</dt><dd>${igdN(p.visualizacoes)}</dd></div><div><dt>Alcance</dt><dd>${igdN(p.alcance)}</dd></div><div><dt>Curtidas</dt><dd>${igdN(p.curtidas)}</dd></div><div><dt>Comentários</dt><dd>${igdN(p.comentarios)}</dd></div><div><dt>Salvamentos</dt><dd>${igdN(p.salvos)}</dd></div><div><dt>Compartilh.</dt><dd>${igdN(p.compartilhamentos)}</dd></div><div><dt>Interações</dt><dd><b>${igdN(p.interacoes)}</b></dd></div><div><dt>Engajamento</dt><dd>${p.engajamento === null ? '—' : String(p.engajamento).replace('.', ',') + '%'}</dd></div></dl></div></article>`;

PAGINAS.igdesempenho = async function () {
  const [d, posts, imp] = await Promise.all([api(`/instagram/desempenho?dim=${IGD.dim}&` + Filtros.query()), api('/instagram/ranking?' + Filtros.query()).catch(() => ({ rows: [] })), api('/instagram/impulsionados?' + Filtros.query()).catch(() => ({ rows: [] }))]);
  const minimo = d.minimo;
  const melhor = d.rows.filter(r => r.publicacoes >= minimo).sort((a, b) => b.mediaInteracoes - a.mediaInteracoes)[0];
  $('#content').innerHTML = `${abasInstagramAcoes()}
    ${igdMesAMes(posts)}
    <div class="pills" role="tablist" aria-label="Analisar por">${IGD_DIMS.map(([k, l]) => `<button type="button" role="tab" class="pill ${IGD.dim === k ? 'on' : ''}" data-dim="${k}" aria-selected="${IGD.dim === k}">${l}</button>`).join('')}</div>
    <section class="card"><div class="db-tit"><h2>Desempenho por ${esc(IGD_DIMS.find(x => x[0] === IGD.dim)[1].toLowerCase())}</h2>${origem(d.origem)}<small>${esc(Filtros.descricao())}</small></div>
      ${d.aviso ? `<p class="foco-chip">${esc(d.aviso)}</p>` : ''}
      ${d.rows.length ? `<div id="chDim"></div><div class="tablewrap"><table class="datatable"><thead><tr><th>${esc(IGD_DIMS.find(x => x[0] === IGD.dim)[1])}</th><th class="num">Publicações</th><th class="num">Interações</th><th class="num">Média por publicação</th><th class="num">Alcance</th><th>Amostra</th></tr></thead><tbody>${d.rows.map(r => `<tr><td class="titlecell">${esc(r.rotulo)}</td><td class="num">${fmtN(r.publicacoes)}</td><td class="num">${fmtN(r.interacoes)}</td><td class="num">${fmtN(r.mediaInteracoes)}</td><td class="num">${r.alcance === null ? '—' : fmtN(r.alcance)}</td><td>${r.publicacoes < minimo ? `<span class="falta">poucas (${r.publicacoes}); mínimo ${minimo}</span>` : '<span class="ok-txt">suficiente</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${melhor ? `<p class="kpi-note">Melhor média entre os grupos com pelo menos ${minimo} publicações: <b>${esc(melhor.rotulo)}</b> (${fmtN(melhor.mediaInteracoes)} interações por publicação).</p>` : `<p class="kpi-note">Nenhum grupo tem ${minimo} publicações ainda; as médias abaixo disso não servem para decidir.</p>`}`
      : '<div class="empty-rich"><strong>Sem publicações neste recorte</strong><p>Amplie o período ou limpe os filtros.</p></div>'}
    </section>
    ${igdPostagens(posts)}
    <section class="card"><div class="db-tit"><h2>Orgânico × impulsionado</h2>${origem(imp.origem)}</div>
      ${imp.rows.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Publicação</th><th>Anúncio</th><th class="num">Interações (orgânico)</th><th class="num">Alcance (orgânico)</th><th class="num">Investimento</th><th class="num">Alcance (pago)</th><th class="num">Cliques</th><th class="num">Conversas</th></tr></thead><tbody>${imp.rows.map(r => `<tr><td class="titlecell">${esc(r.conteudo)}</td><td>${esc(r.anuncio)}<br><small>${esc(r.campanha)}</small></td><td class="num">${fmtN(r.organico.interacoes)}</td><td class="num">${r.organico.alcance === null ? '—' : fmtN(r.organico.alcance)}</td><td class="num">${money(r.pago.investimento)}</td><td class="num">${fmtN(r.pago.alcance)}</td><td class="num">${fmtN(r.pago.cliques)}</td><td class="num">${fmtN(r.pago.conversas)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty compact">${esc(imp.aviso || 'Sem anúncios vinculados a publicações.')}</div>`}
      <div class="est-linha"><button type="button" class="btn soft" id="vincBtn">Vincular um anúncio a uma publicação</button><small class="kpi-note">A comparação só existe quando uma pessoa confirma o vínculo; o sistema nunca adivinha qual anúncio impulsionou qual publicação.</small></div>
    </section>`;
  $$('[data-igd-ordem]').forEach(x => { x.onchange = () => { IGD.ordem = x.value; setPref('igdOrdem', IGD.ordem); PAGINAS.igdesempenho(); }; });
  igdMesAMesLiga(posts);
  const mais = $('#igdMais'); if (mais) mais.onclick = () => { IGD.todas = true; PAGINAS.igdesempenho(); };
  $$('[data-dim]').forEach(b => { b.onclick = () => { IGD.dim = b.dataset.dim; setPref('igdDim', IGD.dim); go('igdesempenho'); }; });
  if (d.rows.length) EvoCharts.barras($('#chDim'), { itens: d.rows.map(r => ({ nome: r.rotulo, v: r.mediaInteracoes, sub: `${r.publicacoes} publicação(ões)` })), fmt: v => fmtN(v) + ' interações', rotuloAcessivel: 'Média de interações por publicação' });
  $('#vincBtn').onclick = vincularAnuncio;
};
async function vincularAnuncio() {
  await carregarConteudos();
  const pubs = IGC.rows.filter(r => stLimpo(r.status) !== 'ARQUIVADO').sort((a, b) => String(b.publicacaoEm || '').localeCompare(String(a.publicacaoEm || '')));
  const o = dialogo(`<h3>Vincular anúncio a uma publicação</h3><form id="vForm" class="cm-form" novalidate><label class="wide">ID do anúncio (da Meta)<input class="control" id="vA" inputmode="numeric" placeholder="Copie o ID em Tráfego Pago › Anúncios"></label><label class="wide">Publicação<select class="control" id="vC">${pubs.map(p => `<option value="${attr(p.id)}">${esc(p.titulo)} · ${esc(p.perfil || '')}</option>`).join('')}</select></label><div class="cm-erro wide" id="vErr" role="alert"></div><div class="actions wide"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button class="btn" type="submit">Confirmar vínculo</button></div></form>`);
  $('#vForm', o.el).onsubmit = async e => { e.preventDefault(); try { await post('/instagram/vinculo', { anuncio: $('#vA', o.el).value.trim(), conteudo: $('#vC', o.el).value }); o.close(); toast('Vínculo confirmado'); go('igdesempenho'); } catch (er) { $('#vErr', o.el).textContent = er.message; } };
}

/** Todas as postagens do período, cada uma com seus dados. */
function igdPostagens(posts) {
  const rows = [...(posts.rows || [])].sort((a, b) => (IGD.ordem === 'quando' ? String(b.quando).localeCompare(String(a.quando)) : (b[IGD.ordem] ?? -1) - (a[IGD.ordem] ?? -1)));
  const lista = IGD.todas ? rows : rows.slice(0, 24);
  return `<section class="card"><div class="db-tit"><h2>Desempenho de cada postagem</h2>${origem(posts.origem)}<label class="igr-ord">Ordenar por <select class="control" data-igd-ordem aria-label="Ordenar postagens">${IGD_ORDEM.map(([k, l]) => `<option value="${k}" ${IGD.ordem === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    ${rows.length ? `<p class="kpi-note">${rows.length} postagem(ns) · ${esc(Filtros.descricao())}. O que a Meta não informa aparece como “—”, nunca como zero.</p><div class="ig-grade">${lista.map(igdCartao).join('')}</div>${rows.length > lista.length ? `<button type="button" class="btn soft" id="igdMais">Ver todas as ${rows.length} postagens</button>` : ''}` : '<div class="empty compact">Nenhuma postagem neste período com os filtros escolhidos. Amplie o período ou sincronize em Configurações › Instagram.</div>'}</section>`;
}

/** Mês a mês: interações de cada formato por mês e a tabela do mês com publicações, alcance, visualizações e seguidores adquiridos. */
function igdMeses(posts) {
  const meses = new Map();
  (posts.rows || []).forEach(p => {
    const m = igcalQuando(p.quando).dia.slice(0, 7), o = meses.get(m) || { periodo: m, publicacoes: 0, interacoes: 0, alcance: 0, visualizacoes: 0, visitas: 0, seguidores: 0, porFormato: {} };
    o.publicacoes++; o.interacoes += p.interacoes || 0; o.alcance += p.alcance || 0; o.visualizacoes += p.visualizacoes || 0; o.visitas += p.visitasPerfil || 0; o.seguidores += p.seguidoresNovos || 0;
    o.porFormato[p.formato] = (o.porFormato[p.formato] || 0) + (p.interacoes || 0);
    meses.set(m, o);
  });
  return [...meses.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}
function igdMesAMes(posts) {
  const meses = igdMeses(posts);
  if (!meses.length) return '';
  const rot = m => { const t = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(m + '-01T12:00:00Z')); return t.charAt(0).toUpperCase() + t.slice(1); };
  const linhas = [...meses].reverse().map(o => `<tr><td><b>${esc(rot(o.periodo))}</b></td><td class="num">${fmtN(o.publicacoes)}</td><td class="num">${fmtN(o.interacoes)}</td><td class="num">${fmtN(Math.round(o.interacoes / o.publicacoes))}</td><td class="num">${fmtN(o.alcance)}</td><td class="num">${fmtN(o.visualizacoes)}</td><td class="num">${fmtN(o.visitas)}</td><td class="num">+${fmtN(o.seguidores)}</td></tr>`).join('');
  return `<section class="card"><div class="db-tit"><h2>Mês a mês</h2>${origem(posts.origem)}<small>interações por formato · ${esc(Filtros.descricao())}</small></div>
    <div id="chMes"></div>${meses.length < 2 ? '<p class="kpi-note">Escolha “Últimos 12 meses” ou “Este ano” no filtro de período para comparar vários meses.</p>' : ''}
    <div class="tablewrap"><table class="datatable"><thead><tr><th>Mês</th><th class="num">Publicações</th><th class="num">Interações</th><th class="num">Média por publicação</th><th class="num">Alcance</th><th class="num">Visualizações</th><th class="num">Visitas ao perfil</th><th class="num">Seguidores adquiridos</th></tr></thead><tbody>${linhas}</tbody></table></div></section>`;
}
function igdMesAMesLiga(posts) {
  const meses = igdMeses(posts), el = $('#chMes');
  if (!el || !meses.length) return;
  const formatos = [...new Set(meses.flatMap(o => Object.keys(o.porFormato)))];
  EvoCharts.linha(el, { dados: meses.map(o => ({ x: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(o.periodo + '-01T12:00:00Z')).replace(/\.? de /, '/').replace('.', ''), ...Object.fromEntries(formatos.map(f => [f, o.porFormato[f] || 0])) })), series: formatos.map(f => ({ k: f, nome: f })), rotuloAcessivel: 'Interações por formato, mês a mês' });
}
