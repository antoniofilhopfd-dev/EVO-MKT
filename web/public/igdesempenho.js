/* Instagram › Desempenho: o que funcionou, por perfil, segmento, formato, tema, objetivo, campanha editorial, dia e horário. */
const IGD_DIMS = [['formato', 'Formato'], ['perfil', 'Perfil'], ['segmento', 'Segmento'], ['tema', 'Tema'], ['objetivo', 'Objetivo'], ['campanha', 'Campanha editorial'], ['dia', 'Dia da semana'], ['horario', 'Horário']];
const IGD = { dim: pref('igdDim', 'formato'), todas: false, ordem: pref('igdOrdem', 'quando') };
const IGD_ORDEM = [['quando', 'Mais recentes'], ['interacoes', 'Interações'], ['alcance', 'Alcance'], ['engajamento', 'Engajamento'], ['visualizacoes', 'Visualizações']];
const igdN = v => (v === null || v === undefined ? '—' : fmtN(v));
/** Cartão de uma postagem com imagem e todas as métricas que a Meta informou. */
const igdCartao = p => `<article class="ig-card"><${p.link ? `a href="${attr(p.link)}" target="_blank" rel="noopener noreferrer"` : 'div'} class="ig-thumb" title="Abrir no Instagram">${p.miniatura ? `<img src="${attr(p.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${esc(p.formato)}</span>`}</${p.link ? 'a' : 'div'}><div class="ig-body"><div class="ig-meta"><b>${esc(p.formato)}</b><span>${esc(fmtDate(igcalQuando(p.quando).dia))} · ${esc(p.perfil)}</span></div><p>${esc(p.titulo || p.legenda || '(sem legenda)')}</p><dl><div><dt>Visualizações</dt><dd>${igdN(p.visualizacoes)}</dd></div><div><dt>Alcance</dt><dd>${igdN(p.alcance)}</dd></div><div><dt>Curtidas</dt><dd>${igdN(p.curtidas)}</dd></div><div><dt>Comentários</dt><dd>${igdN(p.comentarios)}</dd></div><div><dt>Salvamentos</dt><dd>${igdN(p.salvos)}</dd></div><div><dt>Compartilh.</dt><dd>${igdN(p.compartilhamentos)}</dd></div><div><dt>Interações</dt><dd><b>${igdN(p.interacoes)}</b></dd></div><div><dt>Engajamento</dt><dd>${p.engajamento === null ? '—' : String(p.engajamento).replace('.', ',') + '%'}</dd></div></dl></div></article>`;

PAGINAS.igdesempenho = async function () {
  const [d, posts, imp] = await Promise.all([api(`/instagram/desempenho?dim=${IGD.dim}&` + Filtros.query()), api('/instagram/ranking?' + Filtros.query()).catch(() => ({ rows: [] })), api('/instagram/impulsionados?' + Filtros.query()).catch(() => ({ rows: [] }))]);
  const minimo = d.minimo;
  const melhor = d.rows.filter(r => r.publicacoes >= minimo).sort((a, b) => b.mediaInteracoes - a.mediaInteracoes)[0];
  $('#content').innerHTML = `${abasInstagramAcoes()}
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
