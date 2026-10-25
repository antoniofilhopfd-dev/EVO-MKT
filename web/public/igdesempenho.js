/* Instagram › Desempenho: o que funcionou, por perfil, segmento, formato, tema, objetivo, campanha editorial, dia e horário. */
const IGD_DIMS = [['formato', 'Formato'], ['perfil', 'Perfil'], ['segmento', 'Segmento'], ['tema', 'Tema'], ['objetivo', 'Objetivo'], ['campanha', 'Campanha editorial'], ['dia', 'Dia da semana'], ['horario', 'Horário']];
const IGD = { dim: pref('igdDim', 'formato') };

PAGINAS.igdesempenho = async function () {
  const [d, imp] = await Promise.all([api(`/instagram/desempenho?dim=${IGD.dim}&` + Filtros.query()), api('/instagram/impulsionados?' + Filtros.query()).catch(() => ({ rows: [] }))]);
  const minimo = d.minimo;
  const melhor = d.rows.filter(r => r.publicacoes >= minimo).sort((a, b) => b.mediaInteracoes - a.mediaInteracoes)[0];
  $('#content').innerHTML = `${abasInstagramAcoes()}${avisoAtualizacao(d.origem)}
    <div class="pills" role="tablist" aria-label="Analisar por">${IGD_DIMS.map(([k, l]) => `<button type="button" role="tab" class="pill ${IGD.dim === k ? 'on' : ''}" data-dim="${k}" aria-selected="${IGD.dim === k}">${l}</button>`).join('')}</div>
    <section class="card"><div class="db-tit"><h2>Desempenho por ${esc(IGD_DIMS.find(x => x[0] === IGD.dim)[1].toLowerCase())}</h2>${origem(d.origem)}<small>${esc(Filtros.descricao())}</small></div>
      ${d.aviso ? `<p class="foco-chip">${esc(d.aviso)}</p>` : ''}
      ${d.rows.length ? `<div id="chDim"></div><div class="tablewrap"><table class="datatable"><thead><tr><th>${esc(IGD_DIMS.find(x => x[0] === IGD.dim)[1])}</th><th class="num">Publicações</th><th class="num">Interações</th><th class="num">Média por publicação</th><th class="num">Alcance</th><th>Amostra</th></tr></thead><tbody>${d.rows.map(r => `<tr><td class="titlecell">${esc(r.rotulo)}</td><td class="num">${fmtN(r.publicacoes)}</td><td class="num">${fmtN(r.interacoes)}</td><td class="num">${fmtN(r.mediaInteracoes)}</td><td class="num">${r.alcance === null ? '—' : fmtN(r.alcance)}</td><td>${r.publicacoes < minimo ? `<span class="falta">poucas (${r.publicacoes}); mínimo ${minimo}</span>` : '<span class="ok-txt">suficiente</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${melhor ? `<p class="kpi-note">Melhor média entre os grupos com pelo menos ${minimo} publicações: <b>${esc(melhor.rotulo)}</b> (${fmtN(melhor.mediaInteracoes)} interações por publicação).</p>` : `<p class="kpi-note">Nenhum grupo tem ${minimo} publicações ainda; as médias abaixo disso não servem para decidir.</p>`}`
      : '<div class="empty-rich"><strong>Sem publicações neste recorte</strong><p>Amplie o período ou limpe os filtros.</p></div>'}
    </section>
    <section class="card"><div class="db-tit"><h2>Orgânico × impulsionado</h2>${origem(imp.origem)}</div>
      ${imp.rows.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Publicação</th><th>Anúncio</th><th class="num">Interações (orgânico)</th><th class="num">Alcance (orgânico)</th><th class="num">Investimento</th><th class="num">Alcance (pago)</th><th class="num">Cliques</th><th class="num">Conversas</th></tr></thead><tbody>${imp.rows.map(r => `<tr><td class="titlecell">${esc(r.conteudo)}</td><td>${esc(r.anuncio)}<br><small>${esc(r.campanha)}</small></td><td class="num">${fmtN(r.organico.interacoes)}</td><td class="num">${r.organico.alcance === null ? '—' : fmtN(r.organico.alcance)}</td><td class="num">${money(r.pago.investimento)}</td><td class="num">${fmtN(r.pago.alcance)}</td><td class="num">${fmtN(r.pago.cliques)}</td><td class="num">${fmtN(r.pago.conversas)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty compact">${esc(imp.aviso || 'Sem anúncios vinculados a publicações.')}</div>`}
      <div class="est-linha"><button type="button" class="btn soft" id="vincBtn">Vincular um anúncio a uma publicação</button><small class="kpi-note">A comparação só existe quando uma pessoa confirma o vínculo; o sistema nunca adivinha qual anúncio impulsionou qual publicação.</small></div>
    </section>`;
  ligaNova();
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

/* Ranking orgânico: dados reais já consultados pela Visão Geral, nunca inventar métricas. */
PAGINAS.igranking = async function () {
  const d=await api('/instagram/visao?'+Filtros.query());
  const rows=[...(d.recentes||[])].filter(x=>x.interacoes!==null&&x.interacoes!==undefined)
    .sort((a,b)=>Number(b.interacoes)-Number(a.interacoes));
  const tabela=rows.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Posição</th><th>Publicação</th><th>Formato</th><th>Data</th><th class="num">Interações</th><th class="num">Alcance</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}º</td><td class="titlecell">${r.link?`<a href="${attr(r.link)}" target="_blank" rel="noopener noreferrer">${esc(r.titulo||r.legenda||'Publicação')}</a>`:esc(r.titulo||r.legenda||'Publicação')}</td><td>${esc(r.formato||'—')}</td><td>${esc(fmtDate(r.quando))}</td><td class="num">${fmtN(r.interacoes)}</td><td class="num">${fmtN(r.alcance)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-rich"><strong>Sem publicações para classificar</strong><p>Altere o período ou confira a sincronização do Instagram.</p></div>';
  $('#content').innerHTML=`<section class="card"><div class="db-tit"><h2>Ranking de publicações</h2>${origem(d.origem)}</div><p class="kpi-note">Classificação por interações orgânicas das publicações recentes disponibilizadas nesta consulta; não representa necessariamente todas as publicações do período. ${esc(Filtros.descricao())}</p>${avisoAtualizacao(d.origem)}${tabela}</section>`;
};
