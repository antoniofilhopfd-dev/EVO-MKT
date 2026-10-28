/* Instagram › Desempenho: o que funcionou, por perfil, segmento, formato, tema, objetivo, campanha editorial, dia e horário. */
const IGD_DIMS = [['formato', 'Formato'], ['perfil', 'Perfil'], ['dia', 'Dia da semana'], ['horario', 'Horário']];
const IGD = { dim: 'formato', todas: false, ordem: 'quando', dir: 'desc' };
const IGD_ORDEM = [['quando', 'Mais recentes'], ['interacoes', 'Interações'], ['alcance', 'Alcance'], ['engajamento', 'Engajamento'], ['visualizacoes', 'Visualizações']];
const igdN = v => (v === null || v === undefined ? '—' : fmtN(v));
PAGINAS.igdesempenho = async function () {
  Object.assign(IGD, Filtros.localGet({ dim: 'formato', ordem: 'quando', dir: 'desc' }));
  if (!IGD_DIMS.some(x => x[0] === IGD.dim)) IGD.dim = 'formato';
  const [d, geral, posts, imp] = await Promise.all([api(`/instagram/desempenho?dim=${IGD.dim}&` + Filtros.query()), api('/instagram/geral?' + Filtros.query()), api('/instagram/ranking?' + Filtros.query()).catch(() => ({ rows: [] })), api('/instagram/impulsionados?' + Filtros.query()).catch(() => ({ rows: [] }))]);
  const minimo = d.minimo;
  const melhor = d.rows.filter(r => r.publicacoes >= minimo).sort((a, b) => b.mediaInteracoes - a.mediaInteracoes)[0];
  $('#content').innerHTML = `${abasInstagramAcoes()}
    <section class="card"><div class="db-tit"><h2>Histórico das planilhas</h2><small>Registros separados das métricas oficiais da Meta</small></div><button type="button" class="btn soft" id="igdHistoricoBtn">Consultar histórico importado</button> <button type="button" class="btn soft" id="igdImportarBtn">Importar planilhas (administrador)</button><input type="file" id="igdImportarArquivo" accept=".json,application/json" hidden><div id="igdImportarEstado" class="kpi-note"></div><div id="igdHistoricoConteudo"></div></section>
    ${igdComparativos(geral)}
    ${igdMesAMes(posts)}
    ${igdTabela(posts)}
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
  $$('[data-igd-ord]').forEach(h => { h.onclick = () => { const k = h.dataset.igdOrd; IGD.dir = IGD.ordem === k && IGD.dir === 'desc' ? 'asc' : 'desc'; IGD.ordem = k; Filtros.localSet({ ordem: IGD.ordem, dir: IGD.dir }); PAGINAS.igdesempenho(); }; });
  $('#igdHistoricoBtn')?.addEventListener('click', () => igdAbrirHistorico(1));
  $('#igdImportarBtn')?.addEventListener('click', () => $('#igdImportarArquivo')?.click());
  $('#igdImportarArquivo')?.addEventListener('change', async e => {
    const input=e.target, status=$('#igdImportarEstado'), file=input.files?.[0];
    if(!file || !status) return;
    try {
      if(file.size>15000000) throw Error('Arquivo maior que 15 MB.');
      const data=JSON.parse(await file.text());
      if(!Array.isArray(data.abas) || !data.conteudo || typeof data.conteudo!=='object') throw Error('Manifesto inválido.');
      const linhas=[];
      for(const [arquivo,abas] of Object.entries(data.conteudo)) for(const [aba,registros] of Object.entries(abas)){
        if(!Array.isArray(registros)) throw Error('Aba inválida: '+aba);
        for(const r of registros) linhas.push({arquivo,aba,row:r.row,cells:r.cells});
      }
      if(!linhas.length) throw Error('Nenhuma linha encontrada.');
      if(!window.confirm('Importar '+linhas.length+' linhas históricas? Um backup será criado primeiro. Dados oficiais da Meta não serão substituídos.')) return;
      status.textContent='Criando backup de segurança...';
      await api('/instagram/importar-historico',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'backup'})});
      let inseridas=0,existentes=0;
      for(let i=0;i<linhas.length;i+=100){
        const lote=await api('/instagram/importar-historico',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'lote',linhas:linhas.slice(i,i+100)})});
        inseridas+=lote.inseridas; existentes+=lote.existentes;
        status.textContent='Importando '+Math.min(i+100,linhas.length)+' de '+linhas.length+' linhas...';
      }
      status.textContent='Importação concluída: '+inseridas+' novas, '+existentes+' já existentes.';
      igdAbrirHistorico(1);
    } catch(err){status.textContent='Importação não concluída: '+(err.message||err);}
    finally{input.value='';}
  });
  igdComparativosLiga(geral);
  igdMesAMesLiga(posts);
  const mais = $('#igdMais'); if (mais) mais.onclick = () => { IGD.todas = true; PAGINAS.igdesempenho(); };
  $$('[data-dim]').forEach(b => { b.onclick = () => { IGD.dim = b.dataset.dim; Filtros.localSet({ dim: IGD.dim }); go('igdesempenho'); }; });
  if (d.rows.length) EvoCharts.barras($('#chDim'), { itens: d.rows.map(r => ({ nome: r.rotulo, v: r.mediaInteracoes, sub: `${r.publicacoes} publicação(ões)` })), fmt: v => fmtN(v) + ' interações', rotuloAcessivel: 'Média de interações por publicação' });
  $('#vincBtn').onclick = vincularAnuncio;
};
async function vincularAnuncio() {
  await carregarConteudos();
  const pubs = IGC.rows.filter(r => stLimpo(r.status) !== 'ARQUIVADO').sort((a, b) => String(b.publicacaoEm || '').localeCompare(String(a.publicacaoEm || '')));
  const o = dialogo(`<h3>Vincular anúncio a uma publicação</h3><form id="vForm" class="cm-form" novalidate><label class="wide">ID do anúncio (da Meta)<input class="control" id="vA" inputmode="numeric" placeholder="Copie o ID em Tráfego Pago › Anúncios"></label><label class="wide">Publicação<select class="control" id="vC">${pubs.map(p => `<option value="${attr(p.id)}">${esc(p.titulo)} · ${esc(p.perfil || '')}</option>`).join('')}</select></label><div class="cm-erro wide" id="vErr" role="alert"></div><div class="actions wide"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button class="btn" type="submit">Confirmar vínculo</button></div></form>`);
  $('#vForm', o.el).onsubmit = async e => { e.preventDefault(); try { await post('/instagram/vinculo', { anuncio: $('#vA', o.el).value.trim(), conteudo: $('#vC', o.el).value }); o.close(); toast('Vínculo confirmado'); go('igdesempenho'); } catch (er) { $('#vErr', o.el).textContent = er.message; } };
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

/** Comparativos com o período anterior, gráficos e comparação das contas. */
async function igdAbrirHistorico(pagina = 1) {
  const alvo = $('#igdHistoricoConteudo');
  if (!alvo) return;
  alvo.textContent = 'Carregando histórico...';
  try {
    const dados = await api('/instagram/historico-planilhas?pagina=' + pagina + '&limite=20');
    const rows = dados.rows || [];
    alvo.innerHTML = '<p class="kpi-note">' + fmtN(dados.total) + ' linhas históricas (incluindo possíveis cabeçalhos), não somadas à Meta.</p>' +
      (rows.length ? '<div class="tablewrap"><table class="datatable"><thead><tr><th>Arquivo / Aba</th><th>Linha</th><th>Conteúdo original</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + esc(r.arquivo) + '<br><small>' + esc(r.aba) + '</small></td><td>' + fmtN(r.linha) + '</td><td>' +
      Object.entries(r.celulas || {}).slice(0,8).map(([k,v]) => esc(k) + ': ' + esc(v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : v)).join(' · ') + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="empty compact">Nenhum registro histórico disponível.</div>') +
      '<div class="actions"><button class="btn soft" id="igdHistAnterior" ' + (pagina <= 1 ? 'disabled' : '') + '>Anterior</button> Página ' + pagina +
      ' <button class="btn soft" id="igdHistProximo" ' + (pagina*20 >= dados.total ? 'disabled' : '') + '>Próxima</button></div>';
    $('#igdHistAnterior')?.addEventListener('click', () => igdAbrirHistorico(pagina-1));
    $('#igdHistProximo')?.addEventListener('click', () => igdAbrirHistorico(pagina+1));
  } catch (e) { alvo.textContent = 'Histórico indisponível. Confira a migração 032 e a importação no banco. ' + (e.message || ''); }
}
function igdComparativos(g) {
  const a = g.atual, ant = g.anterior;
  const kpi = (rot, k) => `<div class="kpi"><small>${rot}</small><strong>${igvN(a[k])}</strong>${a[k] === null ? '<i class="kd flat">a Meta não informou</i>' : delta(varPct(a[k], ant[k]))}</div>`;
  const nota = g.naoDeduplicado ? ' · alcance somado dos 2 perfis, sem deduplicar' : '';
  return `<section class="card"><div class="db-tit"><h2>Comparativo com o período anterior</h2>${origem(g.origem)}<small>${esc(fmtDate(g.filtros.de))} a ${esc(fmtDate(g.filtros.ate))} × ${esc(fmtDate(g.anteriorPeriodo.de))} a ${esc(fmtDate(g.anteriorPeriodo.ate))}${nota}</small></div>
    <div class="kpis kpis4">${kpi('Alcance', 'alcance')}${kpi('Visualizações', 'visualizacoes')}${kpi('Interações', 'interacoes')}${kpi('Publicações', 'publicacoes')}</div>
    <div class="db-tres igd-graf"><div><h3>Alcance</h3><div id="chAlc"></div></div><div><h3>Visualizações</h3><div id="chVis"></div></div><div><h3>Interações</h3><div id="chInt"></div></div></div></section>
    <section class="card"><div class="db-tit"><h2>Comparação entre contas</h2></div>${igvComparacao(g)}</section>`;
}
function igdComparativosLiga(g) {
  [['chAlc', 'alcance', 'Alcance'], ['chVis', 'visualizacoes', 'Visualizações'], ['chInt', 'interacoes', 'Interações']].forEach(([id, k, nome]) => {
    const el = $('#' + id); if (!el) return;
    EvoCharts.linha(el, { dados: g.porDia.map(x => ({ x: x.dia, [k]: x[k] })), series: [{ k, nome }], altura: 170, rotuloAcessivel: nome + ' por data de publicação' });
  });
}
/** Tabela ordenável de todas as publicações do período, com miniatura. “Não disponível” quando a Meta não atribui o dado (nunca zero). */
const IGD_COLS = [['alcance', 'Alcance'], ['visualizacoes', 'Visualizações'], ['curtidas', 'Curtidas'], ['comentarios', 'Comentários'], ['compartilhamentos', 'Compartilh.'], ['salvos', 'Salvamentos'], ['engajamento', 'Engajamento'], ['seguidoresNovos', 'Novos seguidores'], ['visitasPerfil', 'Visitas ao perfil'], ['interacoes', 'Interações']];
function igdTabela(posts) {
  const rows = [...(posts.rows || [])].sort((a, b) => {
    const k = IGD.ordem, va = k === 'quando' ? String(a.quando) : (a[k] ?? -1), vb = k === 'quando' ? String(b.quando) : (b[k] ?? -1);
    const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb; return IGD.dir === 'asc' ? c : -c;
  });
  const lista = IGD.todas ? rows : rows.slice(0, 30);
  const celula = (p, k) => {
    const v = p[k];
    if (k === 'seguidoresNovos') return v === null || v === undefined ? '<span class="igd-nd" title="A Meta não atribui seguidores a esta publicação">Não disponível</span>' : '+' + fmtN(v);
    if (k === 'engajamento') return v === null || v === undefined ? '—' : String(v).replace('.', ',') + '%';
    return igdN(v);
  };
  const cab = (k, n) => `<th class="num"><button type="button" class="igd-ord ${IGD.ordem === k ? 'on' : ''}" data-igd-ord="${k}" aria-label="Ordenar por ${attr(n)}">${n}${IGD.ordem === k ? (IGD.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`;
  return `<section class="card"><div class="db-tit"><h2>Desempenho de cada publicação</h2>${origem(posts.origem)}<small>${rows.length} publicação(ões) · clique no título da coluna para ordenar</small></div>
    ${rows.length ? `<div class="tablewrap"><table class="datatable igd-tab"><thead><tr><th></th><th><button type="button" class="igd-ord ${IGD.ordem === 'quando' ? 'on' : ''}" data-igd-ord="quando">Publicação${IGD.ordem === 'quando' ? (IGD.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>${IGD_COLS.map(([k, n]) => cab(k, n)).join('')}</tr></thead><tbody>${lista.map(p => `<tr><td class="igd-mini">${p.miniatura ? `<img src="${attr(p.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="igl-sem">◇</span>'}</td><td class="igd-leg">${p.link ? `<a href="${attr(p.link)}" target="_blank" rel="noopener noreferrer">${esc(p.titulo || p.legenda || '(sem legenda)')}</a>` : esc(p.titulo || p.legenda || '(sem legenda)')}<small>${esc(p.perfil)} · ${esc(p.formato)} · ${esc(fmtDate(igcalQuando(p.quando).dia))}</small></td>${IGD_COLS.map(([k]) => `<td class="num">${celula(p, k)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${rows.length > lista.length ? `<button type="button" class="btn soft" id="igdMais">Ver todas as ${rows.length} publicações</button>` : ''}` : '<div class="empty compact">Nenhuma publicação neste período com os filtros escolhidos.</div>'}</section>`;
}
