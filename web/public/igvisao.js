/* Instagram › Visão geral: só desempenho ORGÂNICO (nada de anúncios aqui; o pago fica em Tráfego Pago). */
const varPct = (a, b) => { if (a === null || a === undefined || b === null || b === undefined) return { tipo: 'sem' }; if (b === 0) return a === 0 ? { tipo: 'estavel', percentual: 0 } : { tipo: 'novo' }; const p = ((a - b) / b) * 100; return Math.abs(p) < 0.5 ? { tipo: 'estavel', percentual: 0 } : { tipo: p > 0 ? 'subiu' : 'caiu', percentual: p }; };

PAGINAS.igvisao = async function () {
  const d = await api('/instagram/visao?' + Filtros.query());
  const s = d.resumo, a = d.resumoAnterior;
  const kpi = (rot, k) => `<div class="kpi"><small>${rot}</small><strong>${s[k] === null || s[k] === undefined ? '—' : fmtN(s[k])}</strong>${s[k] === null || s[k] === undefined ? '<i class="kd flat">a Meta ainda não informou</i>' : delta(varPct(s[k], a[k]))}</div>`;
  const seg = d.seguidores;
  const vazio = !s.publicacoes && !seg;
  $('#content').innerHTML = `<div class="ig-acoes"><a class="btn soft" target="_blank" rel="noopener" href="/relatorio-instagram.html">Relatório mensal (PDF)</a></div>
    <p class="kpi-note ig-escopo">Somente orgânico: publicações do ${esc(d.contas.map(c => '@' + c.replace(/^@/, '')).join(' e ') || 'perfil')} no período ${esc(Filtros.descricao())}, comparadas ao período anterior (${esc(fmtDate(d.anteriorPeriodo.de))} a ${esc(fmtDate(d.anteriorPeriodo.ate))}). ${origem(d.origem)}</p>
    ${avisoAtualizacao(d.origem)}
    ${d.somenteVinculadas ? '<p class="foco-chip">Com segmento ou campanha editorial escolhidos, só contam as publicações do Instagram ligadas a uma publicação do EVO MKT.</p>' : ''}
    ${vazio ? `<div class="empty-rich"><strong>Sem dados do Instagram neste período</strong><p>Conecte o perfil em Configurações › Instagram e sincronize, ou amplie o período.</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>` : `
    <div class="kpis kpis4">${kpi('Publicações', 'publicacoes')}${kpi('Interações', 'interacoes')}${kpi('Alcance', 'alcance')}${kpi('Visualizações', 'visualizacoes')}${kpi('Curtidas', 'curtidas')}${kpi('Comentários', 'comentarios')}${kpi('Salvamentos', 'salvamentos')}${kpi('Seguidores gerados', 'seguidoresGerados')}</div>
    <div class="db-duas">
      <section class="card"><div class="db-tit"><h2>Seguidores</h2>${origem(d.origem)}</div>${seg ? `<p><b>${fmtN(seg.atual)}</b> seguidores${seg.variacao !== null ? ` · ${seg.variacao >= 0 ? '+' : ''}${fmtN(seg.variacao)} no período` : ''}</p><div id="chSeg"></div>` : '<div class="empty compact">Sem histórico de seguidores no período (ou o filtro escolhido não tem esse dado).</div>'}</section>
      <section class="card"><div class="db-tit"><h2>Interações por dia</h2>${origem(d.origem)}</div><div id="chInt"></div></section>
    </div>
    <section class="card"><div class="db-tit"><h2>Publicações do período</h2><small>${d.recentes.length} mais recentes</small></div>${d.recentes.length ? `<div class="ig-grade">${d.recentes.map(p => `<article class="ig-post">${p.miniatura ? `<img src="${attr(p.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="db-sem-img">Sem imagem</div>'}<div><span class="badge">${esc(p.formato)}</span> <small>${esc(fmtDate(p.quando))}</small><p>${esc(p.titulo || p.legenda || '(sem legenda)')}</p><small>${fmtN(p.interacoes)} interações${p.alcance !== null ? ` · alcance ${fmtN(p.alcance)}` : ''}</small>${p.link ? `<a href="${attr(p.link)}" target="_blank" rel="noopener noreferrer">Ver no Instagram ↗</a>` : ''}</div></article>`).join('')}</div>` : '<div class="empty compact">Nenhuma publicação no período com os filtros escolhidos.</div>'}</section>`}`;
  bindGoButtons();
  if (seg && $('#chSeg')) EvoCharts.linha($('#chSeg'), { dados: seg.serie.map(x => ({ x: x.dia, seguidores: x.seguidores })), series: [{ k: 'seguidores', nome: 'Seguidores' }], zero: false, rotuloAcessivel: 'Seguidores por dia' });
  if ($('#chInt')) EvoCharts.linha($('#chInt'), { dados: d.interacoesPorDia.map(x => ({ x: x.dia, interacoes: x.interacoes })), series: [{ k: 'interacoes', nome: 'Interações' }], rotuloAcessivel: 'Interações por dia' });
};
