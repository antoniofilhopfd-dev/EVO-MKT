/* Instagram › Ranking: as melhores publicações do período (já postadas, lidas da Meta), com imagem e classificação por métrica. */
const IGR_ORDEM = [['alcance', 'Alcance'], ['interacoes', 'Interações'], ['engajamento', 'Engajamento'], ['visualizacoes', 'Visualizações'], ['curtidas', 'Curtidas'], ['comentarios', 'Comentários'], ['salvos', 'Salvamentos'], ['compartilhamentos', 'Compartilhamentos']];
const IGR = { ordem: pref('igrOrdem', 'interacoes') };
const igrN = v => (v === null || v === undefined ? '—' : fmtN(v));
const igrCorta = (t, n = 110) => { const s = String(t || '(sem legenda)').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; };

PAGINAS.igranking = async function () {
  const d = await api('/instagram/ranking?' + Filtros.query());
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
    ${todas.length ? `<div class="igr-podios">${podio}</div>
    <section class="card"><div class="db-tit"><h2>Ranking das publicações</h2>${origem(d.origem)}</div><div class="tablewrap"><table class="datatable igr-tab"><thead><tr><th>#</th><th></th><th>Publicação</th>${colunas.map(([c, n]) => `<th class="num ${c === k ? 'igr-sel' : ''}">${n}</th>`).join('')}</tr></thead><tbody>${ranking.map((p, i) => `<tr><td><b>${i + 1}º</b></td><td class="rk-thumb">${link(p, mini(p))}</td><td>${link(p, esc(igrCorta(p.titulo || p.legenda)))}<br><small>${esc(p.perfil)} · ${esc(p.formato)} · ${esc(fmtDate(igcalQuando(p.quando).dia))}</small></td>${colunas.map(([c]) => `<td class="num ${c === k ? 'igr-sel' : ''}">${valor(p, c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="kpi-note">Engajamento = interações ÷ alcance. Visualizações, alcance e salvamentos aparecem só quando a Meta os informa para a publicação; o que a Meta não informa fica “—”, nunca zero.</p></section>`
    : `<div class="empty-rich"><strong>Nenhuma publicação neste período</strong><p>Conecte o perfil em Configurações › Instagram e sincronize, ou amplie o período nos Filtros.</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>`}`;
  bindGoButtons();
  const sel = $('#igrOrdem'); if (sel) sel.onchange = () => { IGR.ordem = sel.value; setPref('igrOrdem', IGR.ordem); PAGINAS.igranking(); };
};
