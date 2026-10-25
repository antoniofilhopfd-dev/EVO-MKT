/* Tráfego Pago › Desempenho: exploração Campanha → Conjunto de anúncios → Anúncio DENTRO da mesma aba (somente consulta).
   Os filtros (status, segmento, campanha, conjunto, busca) agem sobre os dados já lidos do período; nada é recalculado "por semelhança":
   a mesma peça usada em campanhas diferentes continua sendo anúncios diferentes, cada um com o seu resultado. */
const TF_DES = { nivel: 'campanhas', busca: '', status: 'todos', segmento: '', campanha: '', conjunto: '', ordem: 'investimento', dir: -1, pagina: 1, comparar: [] };
const TF_POR_PAGINA = 15;
const TF_NIVEIS = [['campanhas', 'Campanhas'], ['conjuntos', 'Conjuntos'], ['anuncios', 'Anúncios']];
const TF_COLUNAS = [['investimento', 'Investimento'], ['impressoes', 'Impressões'], ['alcance', 'Alcance'], ['cliques', 'Cliques'], ['ctr', 'CTR'], ['cpc', 'CPC'], ['conversas', 'Conversas'], ['custoConversa', 'Custo/conversa']];

function tfDesLinhas(d) {
  const r = tfFiltrar(d, TF_DES), base = r[TF_DES.nivel];
  const k = TF_DES.ordem, dir = TF_DES.dir;
  const valor = x => k === 'nome' ? String(x.nome || '') : k === 'status' ? String(x.statusRotulo || x.status || '') : x[k];
  const linhas = [...base].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'pt-BR') * dir;
    const na = va === null || va === undefined, nb = vb === null || vb === undefined;
    if (na || nb) return na === nb ? 0 : na ? 1 : -1; // "—" sempre no fim
    return (va - vb) * dir;
  });
  return { linhas, filtrado: r.filtrado };
}
const tfDesRotuloNivel = n => ({ campanhas: 'campanha', conjuntos: 'conjunto', anuncios: 'anúncio' })[n];
function tfDesCsv(d, linhas) {
  const n = TF_DES.nivel, cel = v => { let t = String(v === null || v === undefined ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const br = v => v === null || v === undefined ? '' : String(Number(v.toFixed ? v.toFixed(2) : v)).replace('.', ',');
  const cab = [tfDesRotuloNivel(n)[0].toUpperCase() + tfDesRotuloNivel(n).slice(1), ...(n !== 'campanhas' ? ['Campanha'] : []), ...(n === 'anuncios' ? ['Conjunto'] : []), 'Segmento', 'Status', 'Investimento', 'Impressões', 'Alcance', 'Cliques', 'CTR (%)', 'CPC', 'Conversas iniciadas', 'Custo por conversa'];
  const rows = linhas.map(r => [r.nome, ...(n !== 'campanhas' ? [r.campanha] : []), ...(n === 'anuncios' ? [r.conjunto] : []), tfSegRotulo(r.segmento), r.statusRotulo || '', br(r.investimento), r.impressoes, r.alcance === null ? '' : r.alcance, r.cliques, br(r.ctr), br(r.cpc), r.conversas, br(r.custoConversa)]);
  const t = tfTotais(linhas, null);
  rows.push(['TOTAL', ...(n !== 'campanhas' ? [''] : []), ...(n === 'anuncios' ? [''] : []), '', '', br(t.investimento), t.impressoes, '', t.cliques, br(t.ctr), br(t.cpc), t.conversas, br(t.custoConversa)]);
  const url = URL.createObjectURL(new Blob(['﻿' + [cab, ...rows].map(l => l.map(cel).join(';')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `evo-mkt-trafego-${n}-${d.periodo.de}-${d.periodo.ate}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function tfDesDetalhe(d, id) {
  const a = d.anuncios.find(x => x.id === id); if (!a) return;
  const mesmo = a.criativoId ? d.anuncios.filter(x => x.criativoId === a.criativoId && x.id !== a.id) : [];
  const metr = [['Investimento', money(a.investimento)], ['Impressões', fmtN(a.impressoes)], ['Alcance', tfN(a.alcance)], ['Cliques', fmtN(a.cliques)], ['CTR', tfPct(a.ctr)], ['CPC', tfMoney(a.cpc)], ['Conversas', fmtN(a.conversas)], ['Custo por conversa', tfMoney(a.custoConversa)]];
  const dlg = dialogo(`<h3>${esc(a.nome)}</h3><div class="tf-det">${a.miniatura ? `<img class="tf-foto-ampliada" src="${attr(a.imagem || a.miniatura)}" alt="Criativo: ${attr(a.nome)}" referrerpolicy="no-referrer">` : '<div class="tf-sem tf-sem-grande">Sem imagem disponível (a Meta não informou uma URL acessível)</div>'}
    <div><p><b>Campanha:</b> ${esc(a.campanha || '—')}</p><p><b>Conjunto:</b> ${esc(a.conjunto || '—')}</p><p><b>Status atual na Meta:</b> ${esc(a.statusRotulo || 'Status indisponível')}</p>
    <dl class="tf-det-met">${metr.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></div></div>
    ${mesmo.length ? `<h4>A mesma peça também roda em outras campanhas</h4><p class="kpi-note">São anúncios diferentes: cada um mantém o próprio resultado, sem somar nem misturar.</p><div class="tablewrap"><table class="datatable"><thead><tr><th>Anúncio</th><th>Campanha</th><th class="num">Investimento</th><th class="num">Conversas</th><th class="num">Custo/conversa</th></tr></thead><tbody>${mesmo.map(x => `<tr><td>${esc(x.nome)}</td><td>${esc(x.campanha)}</td><td class="num">${money(x.investimento)}</td><td class="num">${fmtN(x.conversas)}</td><td class="num">${tfMoney(x.custoConversa)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="actions"><button class="btn" data-close>Fechar</button></div>`, { larga: true });
  const img = dlg.el.querySelector('img.tf-foto-ampliada'); if (img) img.onerror = () => { img.replaceWith(Object.assign(document.createElement('p'), { textContent: 'A Meta não disponibilizou esta imagem agora. Atualize os dados e tente novamente.' })); };
}
function tfDesComparar(d) {
  const lista = TF_DES.comparar.map(id => d[TF_DES.nivel].find(x => x.id === id)).filter(Boolean);
  if (lista.length < 2) return;
  const campos = [['Investimento', r => money(r.investimento)], ['Impressões', r => fmtN(r.impressoes)], ['Alcance', r => tfN(r.alcance)], ['Cliques', r => fmtN(r.cliques)], ['CTR', r => tfPct(r.ctr)], ['CPC', r => tfMoney(r.cpc)], ['Conversas', r => fmtN(r.conversas)], ['Custo por conversa', r => tfMoney(r.custoConversa)], ['Status atual', r => r.statusRotulo || 'Status indisponível']];
  dialogo(`<h3>Comparação de ${TF_NIVEIS.find(x => x[0] === TF_DES.nivel)[1].toLowerCase()}</h3><div class="tablewrap"><table class="datatable tf-comp"><thead><tr><th></th>${lista.map(r => `<th class="num">${TF_DES.nivel === 'anuncios' && r.miniatura ? `<img class="tf-comp-img" src="${attr(r.miniatura)}" alt="" referrerpolicy="no-referrer"><br>` : ''}${esc(r.nome)}${TF_DES.nivel !== 'campanhas' ? `<br><small>${esc(r.campanha)}</small>` : ''}</th>`).join('')}</tr></thead><tbody>${campos.map(([k, f]) => `<tr><td>${k}</td>${lista.map(r => `<td class="num">${esc(f(r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="kpi-note">Resultados individuais: anúncios com a mesma imagem em campanhas diferentes não são somados.</p><div class="actions"><button class="btn" data-close>Fechar</button></div>`, { larga: true });
}
PAGINAS.tfdesempenho = async function () {
  const d = await tfPagina(() => '<div id="tfDes"></div>');
  if (!d) return;
  const raiz = $('#tfDes');
  const desenhar = () => {
    const n = TF_DES.nivel;
    // opções coerentes: conjunto só faz sentido dentro da campanha escolhida
    if (TF_DES.conjunto && !d.conjuntos.some(c => c.id === TF_DES.conjunto && (!TF_DES.campanha || c.campanhaId === TF_DES.campanha))) TF_DES.conjunto = '';
    const { linhas, filtrado } = tfDesLinhas(d);
    const paginas = Math.max(1, Math.ceil(linhas.length / TF_POR_PAGINA));
    if (TF_DES.pagina > paginas) TF_DES.pagina = paginas;
    const vis = linhas.slice((TF_DES.pagina - 1) * TF_POR_PAGINA, TF_DES.pagina * TF_POR_PAGINA);
    const t = tfTotais(linhas, filtrado || n !== 'campanhas' ? null : d.atual.alcance);
    const segs = [...new Set(d.campanhas.map(c => c.segmento || 'SEM'))];
    const opc = (v, l, atual) => `<option value="${attr(v)}" ${String(atual) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
    const camp = d.campanhas.find(c => c.id === TF_DES.campanha), conj = d.conjuntos.find(c => c.id === TF_DES.conjunto);
    const migalha = (TF_DES.campanha || TF_DES.conjunto) ? `<nav class="tf-migalha" aria-label="Caminho"><button type="button" data-tf-lim="tudo">Todas as campanhas</button>${camp ? ` › <button type="button" data-tf-lim="campanha">${esc(camp.nome)}</button>` : ''}${conj ? ` › <span>${esc(conj.nome)}</span>` : ''}</nav>` : '';
    const kpis = [['Investimento', money(t.investimento)], ['Impressões', fmtN(t.impressoes)], ['Alcance', t.alcance === null ? '—' : fmtN(t.alcance)], ['Cliques', fmtN(t.cliques)], ['CTR', tfPct(t.ctr)], ['CPC', tfMoney(t.cpc)], ['Conversas iniciadas', fmtN(t.conversas)], ['Custo por conversa', tfMoney(t.custoConversa)]].map(([k, v]) => `<div class="kpi tf-kpi"><small>${k}</small><strong>${v}</strong></div>`).join('');
    const th = (k, rot, num = true) => `<th class="${num ? 'num' : ''}" aria-sort="${TF_DES.ordem === k ? (TF_DES.dir === 1 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="tf-ord" data-tf-ord="${k}">${rot}${TF_DES.ordem === k ? (TF_DES.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>`;
    const linhaHtml = r => `<tr><td class="tf-chk"><input type="checkbox" data-tf-cmp="${attr(r.id)}" aria-label="Comparar ${attr(r.nome)}" ${TF_DES.comparar.includes(r.id) ? 'checked' : ''}></td>${n === 'anuncios' ? `<td class="tf-fotocel">${tfFotoAnuncio(r)}</td>` : ''}<td class="titlecell"><button type="button" class="tf-nome" data-tf-abre="${attr(r.id)}" title="${n === 'campanhas' ? 'Ver conjuntos desta campanha' : n === 'conjuntos' ? 'Ver anúncios deste conjunto' : 'Ver detalhes do anúncio'}">${esc(r.nome)}</button>${n !== 'campanhas' ? `<br><small>${esc(r.campanha)}${n === 'anuncios' && r.conjunto ? ' › ' + esc(r.conjunto) : ''}</small>` : r.segmento ? `<br><small>${esc(tfSegRotulo(r.segmento))}</small>` : ''}</td><td>${tfBadge(r)}</td>${tfCelulasMetricas(r)}</tr>`;
    raiz.innerHTML = `<div class="tf-barra"><div class="tf-nivel" role="group" aria-label="Visualizar por"><span>Visualizar por</span>${TF_NIVEIS.map(([k, l]) => `<button type="button" class="pill ${n === k ? 'on' : ''}" data-tf-nivel="${k}" aria-pressed="${n === k}">${l}</button>`).join('')}</div>
      <label class="fb-campo"><span>Status</span><select class="control" id="tfdStatus">${TF_STATUS_OPCOES.map(([v, l]) => opc(v, l, TF_DES.status)).join('')}</select></label>
      <label class="fb-campo"><span>Segmento</span><select class="control" id="tfdSeg">${opc('', 'Todos', TF_DES.segmento)}${segs.map(s => opc(s, tfSegRotulo(s), TF_DES.segmento)).join('')}</select></label>
      <label class="fb-campo"><span>Campanha</span><select class="control" id="tfdCamp">${opc('', 'Todas', TF_DES.campanha)}${d.campanhas.map(c => opc(c.id, c.codigo || c.nome, TF_DES.campanha)).join('')}</select></label>
      ${n !== 'campanhas' ? `<label class="fb-campo"><span>Conjunto</span><select class="control" id="tfdConj">${opc('', 'Todos', TF_DES.conjunto)}${d.conjuntos.filter(c => !TF_DES.campanha || c.campanhaId === TF_DES.campanha).map(c => opc(c.id, c.nome, TF_DES.conjunto)).join('')}</select></label>` : ''}
      <label class="fb-campo tf-busca"><span>Buscar</span><input class="control" id="tfdBusca" type="search" placeholder="Nome da campanha, conjunto ou anúncio" value="${attr(TF_DES.busca)}"></label>
      <button type="button" class="btn soft" id="tfdLimpar">Limpar filtros</button></div>
      ${migalha}<div class="kpis kpis4 tf-vis-kpis tf-kpis8">${kpis}</div>
      <section class="card"><div class="db-tit"><h2>${TF_NIVEIS.find(x => x[0] === n)[1]}</h2><small>${linhas.length} resultado(s)${filtrado ? ' com os filtros escolhidos' : ''} · status é o atual na Meta</small>
        <div class="tf-acoes">${TF_DES.comparar.length >= 2 ? `<button type="button" class="btn" id="tfdCmp">Comparar selecionados (${TF_DES.comparar.length})</button>` : '<small class="kpi-note">Marque 2 a 4 linhas para comparar</small>'}<button type="button" class="btn soft" id="tfdCsv" ${linhas.length ? '' : 'disabled'}>Exportar CSV</button></div></div>
        ${linhas.length ? `<div class="tablewrap"><table class="datatable tf-tab"><thead><tr><th></th>${n === 'anuncios' ? '<th>Foto</th>' : ''}${th('nome', TF_NIVEIS.find(x => x[0] === n)[1].slice(0, -1) === 'Campanha' ? 'Campanha' : n === 'conjuntos' ? 'Conjunto' : 'Anúncio', false)}${th('status', 'Status', false)}${TF_COLUNAS.map(([k, l]) => th(k, l)).join('')}</tr></thead><tbody>${vis.map(linhaHtml).join('')}</tbody><tfoot><tr><th colspan="${n === 'anuncios' ? 4 : 3}">Total (${linhas.length})</th><th class="num">${money(t.investimento)}</th><th class="num">${fmtN(t.impressoes)}</th><th class="num">${t.alcance === null ? '—' : fmtN(t.alcance)}</th><th class="num">${fmtN(t.cliques)}</th><th class="num">${tfPct(t.ctr)}</th><th class="num">${tfMoney(t.cpc)}</th><th class="num">${fmtN(t.conversas)}</th><th class="num">${tfMoney(t.custoConversa)}</th></tr></tfoot></table></div>
        <div class="tf-pag"><small class="kpi-note">${(TF_DES.pagina - 1) * TF_POR_PAGINA + 1}–${Math.min(linhas.length, TF_DES.pagina * TF_POR_PAGINA)} de ${linhas.length} · o alcance é único por consulta e não é somado entre linhas${t.alcance === null ? ' (por isso aparece “—” no total)' : ''}</small><span><button type="button" class="btn soft" data-tf-pg="-1" ${TF_DES.pagina <= 1 ? 'disabled' : ''}>Anterior</button> Página ${TF_DES.pagina} de ${paginas} <button type="button" class="btn soft" data-tf-pg="1" ${TF_DES.pagina >= paginas ? 'disabled' : ''}>Próxima</button></span></div>`
        : `<div class="empty-rich"><strong>${d[n].length ? 'Nenhum resultado com estes filtros' : `Nenhum ${tfDesRotuloNivel(n)} com veiculação neste período`}</strong><p>${d[n].length ? 'Mude ou limpe os filtros para ver mais.' : 'A Meta não devolveu veiculação para este nível no período. Escolha outro período.'}</p></div>`}</section>`;
    tfLigarFotos(raiz);
    const re = (alt = {}) => { if (alt.nivel && alt.nivel !== TF_DES.nivel) TF_DES.comparar = []; Object.assign(TF_DES, alt); TF_DES.pagina = alt.pagina ?? 1; desenhar(); };
    raiz.querySelectorAll('[data-tf-nivel]').forEach(b => { b.onclick = () => re({ nivel: b.dataset.tfNivel }); });
    $('#tfdStatus').onchange = e => re({ status: e.target.value });
    $('#tfdSeg').onchange = e => re({ segmento: e.target.value });
    $('#tfdCamp').onchange = e => re({ campanha: e.target.value, conjunto: '' });
    const cj = $('#tfdConj'); if (cj) cj.onchange = e => re({ conjunto: e.target.value });
    const bu = $('#tfdBusca'); bu.oninput = () => { clearTimeout(TF_DES._t); TF_DES._t = setTimeout(() => { TF_DES.busca = bu.value; TF_DES.pagina = 1; desenhar(); const novo = $('#tfdBusca'); novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }, 250); };
    $('#tfdLimpar').onclick = () => re({ status: 'todos', segmento: '', campanha: '', conjunto: '', busca: '' });
    raiz.querySelectorAll('[data-tf-lim]').forEach(b => { b.onclick = () => b.dataset.tfLim === 'tudo' ? re({ campanha: '', conjunto: '', nivel: 'campanhas' }) : re({ conjunto: '', nivel: 'conjuntos' }); });
    raiz.querySelectorAll('[data-tf-ord]').forEach(b => { b.onclick = () => { const k = b.dataset.tfOrd; re({ ordem: k, dir: TF_DES.ordem === k ? -TF_DES.dir : (k === 'nome' || k === 'status' ? 1 : -1) }); }; });
    raiz.querySelectorAll('[data-tf-pg]').forEach(b => { b.onclick = () => re({ pagina: TF_DES.pagina + Number(b.dataset.tfPg) }); });
    raiz.querySelectorAll('[data-tf-abre]').forEach(b => { b.onclick = () => { const id = b.dataset.tfAbre; if (n === 'campanhas') re({ campanha: id, conjunto: '', nivel: 'conjuntos' }); else if (n === 'conjuntos') { const c = d.conjuntos.find(x => x.id === id); re({ campanha: c ? c.campanhaId : TF_DES.campanha, conjunto: id, nivel: 'anuncios' }); } else tfDesDetalhe(d, id); }; });
    raiz.querySelectorAll('[data-tf-cmp]').forEach(c => { c.onchange = () => { const id = c.dataset.tfCmp, i = TF_DES.comparar.indexOf(id); if (i >= 0) TF_DES.comparar.splice(i, 1); else if (TF_DES.comparar.length >= 4) { c.checked = false; toast('Compare até 4 linhas por vez.', 'warn'); return; } else TF_DES.comparar.push(id); desenhar(); }; });
    const cmp = $('#tfdCmp'); if (cmp) cmp.onclick = () => tfDesComparar(d);
    $('#tfdCsv').onclick = () => tfDesCsv(d, linhas);
  };
  desenhar();
};
