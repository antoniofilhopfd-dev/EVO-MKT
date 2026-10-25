/* Instagram › Ranking: as melhores publicações do período (já postadas, lidas da Meta), com imagem e classificação por métrica. */
const IGR_ORDEM = [['alcance', 'Alcance'], ['interacoes', 'Interações'], ['engajamento', 'Engajamento'], ['visualizacoes', 'Visualizações'], ['visitasPerfil', 'Visitas ao perfil'], ['seguidoresNovos', 'Seguidores adquiridos'], ['curtidas', 'Curtidas'], ['comentarios', 'Comentários'], ['salvos', 'Salvamentos'], ['compartilhamentos', 'Compartilhamentos']];
const IGR = { ordem: 'interacoes', aba: 'publicacoes', visao: 'semana', ano: String(new Date().getFullYear()), vazias: '0' };
const igrN = v => (v === null || v === undefined ? '—' : fmtN(v));
const igrCorta = (t, n = 110) => { const s = String(t || '(sem legenda)').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; };

const igrAbas = () => `<div class="pills igr-abas" role="tablist" aria-label="Ranking">${[['publicacoes', 'Publicações'], ['contas', 'Contas']].map(([k, n]) => `<button type="button" role="tab" class="pill ${IGR.aba === k ? 'on' : ''}" data-igr-aba="${k}" aria-selected="${IGR.aba === k}">${n}</button>`).join('')}</div>`;
const igrLigaAbas = () => $$('[data-igr-aba]').forEach(b => { b.onclick = () => { IGR.aba = b.dataset.igrAba; Filtros.localSet({ aba: IGR.aba }); PAGINAS.igranking(); }; });

PAGINAS.igranking = async function () {
  Object.assign(IGR, Filtros.localGet({ ordem: 'interacoes', aba: 'publicacoes', visao: 'semana', ano: String(new Date().getFullYear()), vazias: '0' }));
  if (IGR.aba === 'contas') return igrContas();
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
  const valor = (p, key) => (key === 'seguidoresNovos' && p[key] !== null && p[key] !== undefined ? '+' + fmtN(p[key]) : key === 'engajamento' ? (p.engajamento === null ? '—' : String(p.engajamento).replace('.', ',') + '%') : igrN(p[key]));
  const colunas = IGR_ORDEM.filter(([c]) => disponivel(c) || ['interacoes', 'curtidas', 'visitasPerfil', 'seguidoresNovos'].includes(c));
  const podio = ranking.slice(0, 3).map((p, i) => `<article class="igr-podio"><b class="igr-pos">${i + 1}º</b><div class="igr-img">${link(p, mini(p))}</div><div><small>${esc(p.perfil)} · ${esc(p.formato)} · ${esc(fmtDate(igcalQuando(p.quando).dia))}</small><p>${esc(igrCorta(p.titulo || p.legenda, 90))}</p><strong>${valor(p, k)}</strong> <small>${esc((ordens.find(o => o[0] === k) || [])[1] || '')}</small></div></article>`).join('');
  $('#content').innerHTML = `${igrAbas()}<div class="ig-barra"><label class="igr-ord">Classificar por <select class="control" id="igrOrdem" aria-label="Classificar por">${ordens.map(([c, n]) => `<option value="${c}" ${c === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label><span class="kpi-note">${todas.length} publicação(ões) · ${esc(Filtros.descricao())}</span></div>
    ${d.aviso ? `<p class="foco-chip">${esc(d.aviso)}</p>` : ''}
    ${todas.length ? `<div class="igr-podios">${podio}</div>
    <section class="card"><div class="db-tit"><h2>Ranking das publicações</h2>${origem(d.origem)}</div><div class="tablewrap"><table class="datatable igr-tab"><thead><tr><th>#</th><th></th><th>Publicação</th>${colunas.map(([c, n]) => `<th class="num ${c === k ? 'igr-sel' : ''}">${n}</th>`).join('')}</tr></thead><tbody>${ranking.map((p, i) => `<tr><td><b>${i + 1}º</b></td><td class="rk-thumb">${link(p, mini(p))}</td><td>${link(p, esc(igrCorta(p.titulo || p.legenda)))}<br><small>${esc(p.perfil)} · ${esc(p.formato)} · ${esc(fmtDate(igcalQuando(p.quando).dia))}</small></td>${colunas.map(([c]) => `<td class="num ${c === k ? 'igr-sel' : ''}">${valor(p, c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="kpi-note">Engajamento = interações ÷ alcance. Visualizações, alcance e salvamentos aparecem só quando a Meta os informa para a publicação; o que a Meta não informa fica “—”, nunca zero.</p></section>`
    : `<div class="empty-rich"><strong>Nenhuma publicação neste período</strong><p>Conecte o perfil em Configurações › Instagram e sincronize, ou amplie o período nos Filtros.</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>`}`;
  bindGoButtons(); igrLigaAbas();
  const sel = $('#igrOrdem'); if (sel) sel.onchange = () => { IGR.ordem = sel.value; Filtros.localSet({ ordem: IGR.ordem }); PAGINAS.igranking(); };
};

const igrNomeConta = u => '@' + String(u).replace(/^@/, '');
/** Aba Contas: comparação das duas contas e histórico semanal, mensal e anual com valores reais. */
async function igrContas() {
  const q = new URLSearchParams({ visao: IGR.visao, ano: IGR.ano });
  const [geral, h] = await Promise.all([api('/instagram/geral?' + Filtros.query()), api('/instagram/ranking-contas?' + q.toString() + '&' + Filtros.query(['perfil']))]);
  const nomes = h.contas.map(igrNomeConta), semDados = '<span class="igr-sd">Sem dados</span>';
  const par = (cs, k, fmt) => `<div class="igr-par">${cs.map((c, i) => `<span><i class="igr-c${i}"></i>${c[k] === null || c[k] === undefined ? '—' : fmt(c[k])}</span>`).join('')}</div>`;
  const mostrar = h.periodos.filter(p => IGR.visao !== 'semana' || IGR.vazias === '1' || !p.vazia);
  const rotulo = p => (h.visao === 'semana' ? `<b>${esc(p.rotulo)}</b><small>${esc(fmtDate(p.inicio))} a ${esc(fmtDate(p.fim))}</small>` : h.visao === 'mes' ? `<b>${esc(new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(p.inicio + 'T12:00:00Z')).replace(/^./, c => c.toUpperCase()))}</b>` : `<b>${esc(p.rotulo)}</b>`) + (p.parcial ? '<small>em andamento</small>' : '');
  const colunas = [['Seguidores', 'seguidores', v => fmtN(v)], ['Novos seguidores', 'novos', v => (v > 0 ? '+' : '') + fmtN(v)], ['Alcance', 'alcance', v => fmtN(v)], ['Visualizações', 'visualizacoes', v => fmtN(v)], ['Visitas ao perfil', 'visitasPerfil', v => fmtN(v)], ['Interações', 'interacoes', v => fmtN(v)], ['Engajamento', 'engajamento', v => String(v).replace('.', ',') + '%']];
  const linhas = mostrar.map(p => `<tr class="${p.futuro ? 'igr-futuro' : ''}"><td class="igr-per">${rotulo(p)}</td>${p.vazia ? `<td colspan="${colunas.length}" class="igr-sd-td">${semDados}</td>` : colunas.map(([, k, f]) => `<td class="num">${par(p.contas, k, f)}</td>`).join('')}</tr>`).join('');
  const oculta = IGR.visao === 'semana' ? h.periodos.length - mostrar.length : 0;
  $('#content').innerHTML = `${igrAbas()}
    <section class="card"><div class="db-tit"><h2>Comparação das contas</h2><small>${esc(Filtros.descricao())}</small></div>${igvComparacao(geral)}</section>
    <section class="card"><div class="db-tit"><h2>Histórico das contas</h2>${origem(h.origem)}</div>
      <div class="ig-barra"><span class="igcal-modos" role="group" aria-label="Agrupar por">${[['semana', 'Semanal'], ['mes', 'Mensal'], ['ano', 'Anual']].map(([k, n]) => `<button type="button" class="btn ${IGR.visao === k ? '' : 'soft'}" data-igr-visao="${k}" aria-pressed="${IGR.visao === k}">${n}</button>`).join('')}</span>
        ${IGR.visao !== 'ano' ? `<label class="igr-ord">Ano <select class="control" id="igrAno" aria-label="Ano">${h.anos.map(a => `<option ${String(a) === String(IGR.ano) ? 'selected' : ''}>${a}</option>`).join('')}</select></label>` : ''}
        ${IGR.visao === 'semana' ? `<label class="check-row"><input type="checkbox" id="igrVazias" ${IGR.vazias === '1' ? 'checked' : ''}> Mostrar semanas sem dados</label>` : ''}
        <button type="button" class="btn soft" id="igrHist">Carregar histórico (12 meses)</button><button type="button" class="btn soft" id="igrSegManual">Informar seguidores de um mês</button></div>
      <div class="igr-leg">${nomes.map((n, i) => `<span><i class="igr-c${i}"></i>${esc(n)}</span>`).join('')}</div>
      ${mostrar.length ? `<div class="tablewrap"><table class="datatable igr-hist"><thead><tr><th>${IGR.visao === 'semana' ? 'Semana (domingo a sábado)' : IGR.visao === 'mes' ? 'Mês' : 'Ano'}</th>${colunas.map(([n]) => `<th class="num">${n}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>` : '<div class="empty compact">Ainda não há semanas com dados neste ano. Use “Carregar histórico” ou sincronize o Instagram.</div>'}
      <p class="kpi-note">${oculta ? `${oculta} semana(s) sem dados ocultas; marque “Mostrar semanas sem dados” para vê-las. ` : ''}A numeração semanal segue o projeto: a Semana 41 de 2026 vai de 04/10/2026 a 10/10/2026 (domingo a sábado). O alcance é único por conta e não é somado entre as contas. Seguidores só existem desde a primeira sincronização; o que a Meta não informou aparece como “Sem dados” ou “—”, nunca como zero ou estimativa. No ano, alcance e visualizações são a soma dos meses.</p></section>`;
  bindGoButtons(); igrLigaAbas();
  $$('[data-igr-visao]').forEach(b => { b.onclick = () => { IGR.visao = b.dataset.igrVisao; Filtros.localSet({ visao: IGR.visao }); PAGINAS.igranking(); }; });
  const ano = $('#igrAno'); if (ano) ano.onchange = () => { IGR.ano = ano.value; Filtros.localSet({ ano: IGR.ano }); PAGINAS.igranking(); };
  const vz = $('#igrVazias'); if (vz) vz.onchange = () => { IGR.vazias = vz.checked ? '1' : '0'; Filtros.localSet({ vazias: IGR.vazias }); PAGINAS.igranking(); };
  igrContasBotoes();
}
function igrContasBotoes() {
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
