/* Instagram › Visão Geral: só desempenho ORGÂNICO (o pago fica em Tráfego Pago). Oito indicadores, evolução de seguidores,
   desempenho ao longo do período, formatos, interações, comparação das duas contas e melhores publicações.
   Dado que a Meta não informou aparece como “—” ou “Não disponível”, nunca como zero. */
const varPct = (a, b) => { if (a === null || a === undefined || b === null || b === undefined) return { tipo: 'sem' }; if (b === 0) return a === 0 ? { tipo: 'estavel', percentual: 0 } : { tipo: 'novo' }; const p = ((a - b) / b) * 100; return Math.abs(p) < 0.5 ? { tipo: 'estavel', percentual: 0 } : { tipo: p > 0 ? 'subiu' : 'caiu', percentual: p }; };
const igvN = v => (v === null || v === undefined ? '—' : fmtN(v));
const igvPct = v => (v === null || v === undefined ? '—' : String(v).replace('.', ',') + '%');

PAGINAS.igvisao = async function () {
  const d = await api('/instagram/geral?' + Filtros.query());
  const a = d.atual, ant = d.anterior, sg = d.seguidores, vazio = !a.publicacoes && sg.atual === null;
  const nota = d.naoDeduplicado ? 'soma dos 2 perfis, sem deduplicar' : '';
  const dif = (v, b) => delta(varPct(v, b));
  const card = (cor, rot, valor, rodape) => `<div class="kpi kpi-ig kpi-${cor}"><small>${rot}</small><strong>${valor}</strong>${rodape}</div>`;
  const nd = txt => `<i class="kd flat">${txt}</i>`;
  const ppEng = a.engajamento !== null && ant.engajamento !== null ? Math.round((a.engajamento - ant.engajamento) * 10) / 10 : null;
  const seguidoresRodape = sg.atual === null ? nd('Sem histórico ainda') : sg.base ? `${dif(sg.atual, sg.base)}${sg.completo ? '' : `<i class="kd flat">desde ${fmtDate(sg.desde)}</i>`}` : nd('sem base de comparação');
  const novosRodape = sg.novos === null ? nd('Não disponível') : nd(sg.completo ? 'no período' : `desde ${fmtDate(sg.desde)}`);
  const kpis = [
    card('roxo', 'Seguidores atuais', igvN(sg.atual), seguidoresRodape),
    card('verde', 'Novos seguidores', sg.novos === null ? '—' : (sg.novos > 0 ? '+' : '') + fmtN(sg.novos), novosRodape),
    card('azul', 'Alcance', igvN(a.alcance), a.alcance === null ? nd('a Meta não informou') : `${dif(a.alcance, ant.alcance)}${nota ? `<i class="kd flat">${nota}</i>` : ''}`),
    card('laranja', 'Visualizações', igvN(a.visualizacoes), a.visualizacoes === null ? nd('a Meta não informou') : dif(a.visualizacoes, ant.visualizacoes)),
    card('rosa', 'Visitas ao perfil', igvN(a.visitasPerfil), a.visitasPerfil === null ? nd('Não disponível') : `${dif(a.visitasPerfil, ant.visitasPerfil)}${nota ? `<i class="kd flat">${nota}</i>` : ''}`),
    card('roxo', 'Interações', igvN(a.interacoes), dif(a.interacoes, ant.interacoes)),
    card('ciano', 'Taxa de engajamento', igvPct(a.engajamento), ppEng === null ? nd('interações ÷ alcance') : `<i class="kd ${ppEng > 0 ? 'up' : ppEng < 0 ? 'down' : 'flat'}">${ppEng > 0 ? '▲ +' : ppEng < 0 ? '▼ ' : ''}${String(ppEng).replace('.', ',')} p.p. no período anterior</i>`),
    card('cinza', 'Publicações realizadas', fmtN(a.publicacoes), `<i class="kd flat">${d.formatos.map(f => `${f.publicacoes} ${esc(f.formato)}`).join(' · ') || 'nenhuma no período'}</i>`),
  ].join('');
  const detalhe = [['Curtidas', 'curtidas'], ['Comentários', 'comentarios'], ['Compartilhamentos', 'compartilhamentos'], ['Salvamentos', 'salvamentos']]
    .map(([r, k]) => `<div class="kpi"><small>${r}</small><strong>${igvN(a[k])}</strong>${a[k] === null ? nd('a Meta não informou') : dif(a[k], ant[k])}</div>`).join('');
  const linhasContas = [['Seguidores atuais', 'seguidores', true], ['Novos seguidores', 'novosSeguidores', true], ['Alcance', 'alcance', false], ['Visualizações', 'visualizacoes', true], ['Visitas ao perfil', 'visitasPerfil', false], ['Interações', 'interacoes', true], ['Taxa de engajamento', 'engajamento', null], ['Publicações', 'publicacoes', true]];
  const celulaTotal = (k, somavel) => {
    if (k === 'engajamento') return igvPct(a.engajamento);
    if (k === 'seguidores') return igvN(sg.atual);
    if (k === 'novosSeguidores') return sg.novos === null ? '—' : (sg.novos > 0 ? '+' : '') + fmtN(sg.novos);
    return igvN(a[k]) + (!somavel && d.contas.length > 1 && a[k] !== null ? '*' : '');
  };
  const comparacao = d.contas.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Indicador</th>${d.contas.map(c => `<th class="num">@${esc(c.usuario.replace(/^@/, ''))}</th>`).join('')}${d.contas.length > 1 ? '<th class="num">Total</th>' : ''}</tr></thead><tbody>${linhasContas.map(([r, k, somavel]) => `<tr><td>${r}</td>${d.contas.map(c => `<td class="num">${k === 'engajamento' ? igvPct(c[k]) : k === 'novosSeguidores' ? (c[k] === null ? '—' : (c[k] > 0 ? '+' : '') + fmtN(c[k])) : igvN(c[k])}</td>`).join('')}${d.contas.length > 1 ? `<td class="num"><b>${celulaTotal(k, somavel)}</b></td>` : ''}</tr>`).join('')}</tbody></table></div>${d.contas.length > 1 ? '<p class="kpi-note">*Soma simples dos dois perfis: pessoas alcançadas nos dois são contadas duas vezes (o alcance é único por conta).</p>' : ''}` : '<div class="empty compact">Nenhuma conta do Instagram conectada.</div>';
  const melhores = d.melhores.length ? d.melhores.map((p, i) => `<article class="ig-top"><b class="ig-top-pos">${i + 1}º</b>${p.miniatura ? `<img src="${attr(p.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="db-sem-img">Sem imagem</div>'}<div class="ig-top-txt"><b>${esc(p.titulo || p.legenda || '(sem legenda)')}</b><small>${esc(p.formato)} · ${esc(fmtDate(igcalQuando(p.quando).dia))}${p.perfil ? ' · @' + esc(p.perfil.replace(/^@/, '')) : ''}</small></div><dl class="ig-top-met"><div><dt>Alcance</dt><dd>${igvN(p.alcance)}</dd></div><div><dt>Interações</dt><dd>${igvN(p.interacoes)}</dd></div><div><dt>Comentários</dt><dd>${igvN(p.comentarios)}</dd></div><div><dt>Salvamentos</dt><dd>${igvN(p.salvamentos)}</dd></div></dl>${p.link ? `<a class="ig-top-link" href="${attr(p.link)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir no Instagram">↗</a>` : ''}</article>`).join('') : '<div class="empty compact">Nenhuma publicação no período com os filtros escolhidos.</div>';
  const sync = d.ultimaSync ? `Última sincronização com a Meta: <b>${esc(fmtDateTime(d.ultimaSync))}</b>` : 'Ainda não houve sincronização com a Meta';
  $('#content').innerHTML = `<div class="ig-acoes ig-sync"><span class="kpi-note">${sync} · dados do Instagram (API oficial da Meta) ${origem(d.origem)}</span><a class="btn soft" target="_blank" rel="noopener" href="/relatorio-instagram.html">Relatório mensal (PDF)</a></div>
    ${d.aviso ? `<p class="foco-chip">${esc(d.aviso)}</p>` : ''}
    ${vazio ? `<div class="empty-rich"><strong>Sem dados do Instagram neste período</strong><p>Conecte o perfil em Configurações › Instagram e sincronize, ou amplie o período.</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>` : `
    <div class="kpis kpis8">${kpis}</div>
    <div class="db-tres">
      <section class="card"><div class="db-tit"><h2>Evolução de seguidores</h2></div>${sg.serie.length > 1 ? '<div id="chSeg"></div>' : '<div class="empty compact">O histórico de seguidores começou na primeira sincronização; ainda há menos de 2 registros neste período.</div>'}</section>
      <section class="card"><div class="db-tit"><h2>Desempenho orgânico</h2><small>por data de publicação</small></div><div id="chOrg"></div></section>
      <section class="card"><div class="db-tit"><h2>Publicações por formato</h2></div><div id="chFmt"></div></section>
    </div>
    <div class="db-duas ig-cmp">
      <section class="card"><div class="db-tit"><h2>Detalhamento das interações</h2></div><div class="kpis kpis4">${detalhe}</div></section>
      <section class="card"><div class="db-tit"><h2>Comparação entre contas</h2></div>${comparacao}</section>
    </div>
    <section class="card"><div class="db-tit"><h2>Melhores publicações</h2><button class="btn soft" data-go="igranking">Ver ranking completo</button></div>${melhores}</section>`}`;
  bindGoButtons();
  if (vazio) return;
  if (sg.serie.length > 1 && $('#chSeg')) EvoCharts.linha($('#chSeg'), { dados: sg.serie.map(x => ({ x: x.dia, seguidores: x.seguidores })), series: [{ k: 'seguidores', nome: 'Seguidores' }], zero: false, altura: 220, rotuloAcessivel: 'Seguidores por dia' });
  if ($('#chOrg')) EvoCharts.linha($('#chOrg'), { dados: d.porDia.map(x => ({ x: x.dia, alcance: x.alcance, visualizacoes: x.visualizacoes, interacoes: x.interacoes })), series: [{ k: 'alcance', nome: 'Alcance' }, { k: 'visualizacoes', nome: 'Visualizações' }, { k: 'interacoes', nome: 'Interações' }], altura: 220, rotuloAcessivel: 'Alcance, visualizações e interações por data de publicação' });
  if ($('#chFmt')) EvoCharts.rosca($('#chFmt'), { itens: d.formatos.map(f => ({ nome: f.formato, v: f.publicacoes })), centro: String(a.publicacoes), sub: 'posts', rotuloAcessivel: 'Publicações por formato' });
};
