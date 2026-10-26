/* Instagram › Planejamento: pauta do mês, ideias, campanhas editoriais, modelos e grupos de hashtags. */
const IGP = { aba: pref('igpAba', 'pauta'), mes: hojeBR().slice(0, 7) };
const mesRotulo = ym => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(ym + '-15T12:00:00Z'));
const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 15)); return d.toISOString().slice(0, 7); };

PAGINAS.igplan = async function () {
  const abas = [['pauta', 'Pauta do mês'], ['ideias', 'Ideias'], ['campanhas', 'Campanhas editoriais'], ['modelos', 'Modelos e hashtags']];
  $('#content').innerHTML = `${abasInstagramAcoes()}<div class="pills" role="tablist" aria-label="Planejamento">${abas.map(([k, l]) => `<button type="button" role="tab" class="pill ${IGP.aba === k ? 'on' : ''}" data-aba="${k}" aria-selected="${IGP.aba === k}">${l}</button>`).join('')}</div><div id="igpCorpo"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
  $$('[data-aba]').forEach(b => { b.onclick = () => { IGP.aba = b.dataset.aba; setPref('igpAba', IGP.aba); go('igplan'); }; });
  await ({ pauta: igpPauta, ideias: igpIdeias, campanhas: igpCampanhas, modelos: igpModelos }[IGP.aba] || igpPauta)();
  if (window.IG_ABRIR_CAMPANHA) { const id = window.IG_ABRIR_CAMPANHA; window.IG_ABRIR_CAMPANHA = null; if (IGP.aba !== 'campanhas') { IGP.aba = 'campanhas'; return go('igplan'); } const r = ((await getRows('campanhas')).rows || []).find(x => x.id === id); if (r) igpCampanhaForm(r); }
};

/* ---- pauta do mês ---- */
async function igpPauta() {
  await carregarConteudos();
  const f = Filtros.get(), ym = IGP.mes;
  const rows = IGC.rows.filter(r => calPubCabe(r, f) && String(r.publicacaoEm || '').slice(0, 7) === ym && stLimpo(r.status) !== 'ARQUIVADO');
  const semData = IGC.rows.filter(r => calPubCabe(r, f) && !r.publicacaoEm && !['PUBLICADO', 'ARQUIVADO'].includes(stLimpo(r.status)));
  const dias = new Map(); rows.forEach(r => { const k = r.publicacaoEm.slice(0, 10); (dias.get(k) || dias.set(k, []).get(k)).push(r); });
  const porPerfil = {}; rows.forEach(r => { const p = r.perfil || 'Sem perfil'; porPerfil[p] = (porPerfil[p] || 0) + 1; });
  const ultimo = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5) , 0)).getUTCDate();
  const vazios = []; for (let i = 1; i <= ultimo; i++) { const k = `${ym}-${String(i).padStart(2, '0')}`; if (!dias.has(k)) vazios.push(i); }
  const datas = await api('/datas?dias=60').then(d => d.rows).catch(() => []);
  $('#igpCorpo').innerHTML = `<div class="ig-barra"><button class="btn soft" id="mPrev" aria-label="Mês anterior">‹</button><b class="mes-rot">${esc(mesRotulo(ym))}</b><button class="btn soft" id="mNext" aria-label="Próximo mês">›</button><button class="btn soft" id="mHoje">Este mês</button></div>
    <div class="kpis kpis4"><div class="kpi"><small>Publicações no mês</small><strong>${rows.length}</strong></div>${Object.entries(porPerfil).map(([p, n]) => `<div class="kpi"><small>${esc(p)}</small><strong>${n}</strong></div>`).join('')}<div class="kpi"><small>Dias sem publicação</small><strong>${vazios.length}</strong><i class="kd flat">de ${ultimo} dias</i></div></div>
    <div class="db-duas"><section class="card"><div class="db-tit"><h2>Dia a dia</h2><small>${esc(Filtros.descricao())}</small></div>${rows.length ? [...dias.entries()].sort().map(([k, rs]) => `<div class="pauta-dia"><b>${esc(fmtDate(k))}</b>${rs.sort((a, b) => a.publicacaoEm.localeCompare(b.publicacaoEm)).map(r => `<button type="button" class="pauta-item" data-pub="${attr(r.id)}"><span>${esc(r.publicacaoEm.slice(11, 16) || '—')}</span> ${esc(r.titulo)} <small>${esc(r.perfil || '')} · ${esc(r.formato || '')}</small> ${badgeEstado(r)}</button>`).join('')}</div>`).join('') : '<div class="empty compact">Nenhuma publicação neste mês com os filtros escolhidos.</div>'}</section>
    <section class="card"><div class="db-tit"><h2>Sem data</h2><small>${semData.length}</small></div>${semData.map(r => `<button type="button" class="pauta-item" data-pub="${attr(r.id)}">${esc(r.titulo)} <small>${esc(r.perfil || '')}</small> ${badgeEstado(r)}</button>`).join('') || '<div class="empty compact">Tudo com data marcada.</div>'}
      <div class="db-tit sep"><h2>Datas para planejar</h2><small>próximos 60 dias</small></div>${datas.map(x => `<div class="pauta-data"><div><b>${esc(x.titulo)}</b> <small>${esc(fmtDate(x.data))} · ${esc(x.tema)} · planejar até ${esc(fmtDate(x.planejarAte))}</small></div><button type="button" class="btn soft" data-dpub="${attr(x.data)}|${attr(x.titulo)}">Criar publicação</button></div>`).join('') || '<div class="empty compact">Nenhuma data nos próximos 60 dias.</div>'}</section></div>`;
  $('#mPrev').onclick = () => { IGP.mes = somaMes(IGP.mes, -1); igpPauta(); }; $('#mNext').onclick = () => { IGP.mes = somaMes(IGP.mes, 1); igpPauta(); }; $('#mHoje').onclick = () => { IGP.mes = hojeBR().slice(0, 7); igpPauta(); };
  $$('[data-pub]', $('#igpCorpo')).forEach(b => b.onclick = () => editarPublicacao(b.dataset.pub));
  $$('[data-dpub]', $('#igpCorpo')).forEach(b => b.onclick = () => { const [data, titulo] = b.dataset.dpub.split('|'); novaPublicacao({ data, dados: { titulo: `Publicação: ${titulo}`, status: 'IDEIA', origemTipo: 'datas', origemNome: titulo, origemData: data } }); });
}

/* ---- ideias ---- */
async function igpIdeias() {
  const rows = ((await getRows('ideias', true)).rows || []).filter(r => stLimpo(r.status) !== 'ARQUIVADO');
  const f = Filtros.get();
  const vis = rows.filter(r => (!f.perfil || !r.perfil || ['Ambos', f.perfil].includes(r.perfil)));
  $('#igpCorpo').innerHTML = `<div class="ig-barra"><button class="btn soft" id="idNova">+ Nova ideia</button><span class="kpi-note">${vis.length} ideia(s)</span></div>${vis.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Ideia</th><th>Perfil</th><th>Segmento</th><th>Tema</th><th>Estado</th><th></th></tr></thead><tbody>${vis.map(r => `<tr><td class="titlecell"><b>${esc(r.titulo)}</b><br><small>${esc(r.descricao || '')}</small></td><td>${esc(r.perfil || '—')}</td><td>${esc(r.segmento || '—')}</td><td>${esc(r.tema || '—')}</td><td>${esc(r.status || 'NOVA')}</td><td class="acoes-cel"><button class="btn soft" data-virar="${attr(r.id)}">Virar publicação</button><button class="btn soft" data-ed="${attr(r.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-rich"><strong>Nenhuma ideia ainda</strong><p>Guarde aqui as ideias soltas; quando uma valer a pena, transforme em publicação.</p></div>'}`;
  $('#idNova').onclick = () => igpIdeiaForm(null);
  $$('[data-ed]').forEach(b => b.onclick = () => igpIdeiaForm(rows.find(r => r.id === b.dataset.ed)));
  $$('[data-virar]').forEach(b => b.onclick = async () => {
    const r = rows.find(x => x.id === b.dataset.virar);
    const dlg = await novaPublicacao({ dados: { titulo: r.titulo, perfil: r.perfil || '', segmento: r.segmento || '', tema: r.tema || '', legenda: r.descricao || '', status: 'IDEIA', origemTipo: 'ideias', origemId: r.id, origemNome: r.titulo } });
    try { await put(`/data?module=ideias&id=${encodeURIComponent(r.id)}`, { status: 'USADA' }); invalidate('ideias'); } catch { /* a ideia continua; só não marca como usada */ }
    void dlg;
  });
}
function igpIdeiaForm(r) {
  const e = !!r; r = r || {};
  const o = dialogo(`<h3>${e ? 'Editar ideia' : 'Nova ideia'}</h3><form id="idForm" class="cm-form" novalidate><label class="wide">Título *<input class="control" id="iT" maxlength="140" value="${attr(r.titulo || '')}"></label><label>Perfil<select class="control" id="iP">${['', '@evolucaopb', '@geracaoevolucao', 'Ambos'].map(p => `<option value="${p}" ${r.perfil === p ? 'selected' : ''}>${p || 'Qualquer'}</option>`).join('')}</select></label><label>Segmento<select class="control" id="iS"><option value="">Qualquer</option>${SEG_NOMES.map(s => `<option ${r.segmento === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label><label>Tema<input class="control" id="iTe" maxlength="80" value="${attr(r.tema || '')}"></label><label class="wide">Descrição<textarea class="control" id="iD" rows="4" maxlength="1000">${esc(r.descricao || '')}</textarea></label><div class="cm-erro wide" id="iErr" role="alert"></div><div class="actions wide">${e ? '<button type="button" class="btn danger-soft" id="iDel">Excluir</button>' : ''}<span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>`);
  $('#iT', o.el).focus();
  $('#idForm', o.el).onsubmit = async ev => {
    ev.preventDefault(); const body = { titulo: $('#iT', o.el).value.trim(), perfil: $('#iP', o.el).value, segmento: $('#iS', o.el).value, tema: $('#iTe', o.el).value.trim(), descricao: $('#iD', o.el).value.trim() };
    if (body.titulo.length < 3) { $('#iErr', o.el).textContent = 'Dê um título de pelo menos 3 letras.'; return; }
    try { if (e) await put(`/data?module=ideias&id=${encodeURIComponent(r.id)}`, body); else await post('/data?module=ideias', { ...body, status: 'NOVA' }); invalidate('ideias'); o.close(); toast('Ideia salva'); go('igplan'); } catch (er) { $('#iErr', o.el).textContent = er.message; }
  };
  const del = $('#iDel', o.el); if (del) del.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Excluir ideia', texto: `Excluir “${r.titulo}”?`, confirmar: 'Excluir', perigo: true })) return; try { await api(`/data?module=ideias&id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }); invalidate('ideias'); o.close(); go('igplan'); } catch (er) { toast(er.message, 'warn'); } };
}

/* ---- campanhas editoriais ---- */
async function igpCampanhas() {
  await carregarConteudos();
  const rows = ((await getRows('campanhas', true)).rows || []);
  Filtros.esquecerCampanhas();
  const n = id => IGC.rows.filter(c => String(c.campanhaId) === String(id));
  $('#igpCorpo').innerHTML = `<div class="ig-barra"><button class="btn soft" id="cpNova">+ Nova campanha editorial</button><span class="kpi-note">Campanha editorial agrupa publicações por tema ou ação. Não é campanha de anúncio.</span></div>${rows.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Campanha</th><th>Período</th><th>Segmento</th><th>Publicações</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map(r => { const ps = n(r.id); return `<tr><td class="titlecell"><b>${esc(r.titulo)}</b><br><small>${esc(r.objetivo || r.descricao || '')}</small></td><td>${r.dataInicio ? esc(fmtDate(r.dataInicio)) : '—'} a ${r.prazo ? esc(fmtDate(r.prazo)) : '—'}</td><td>${esc(r.segmento || '—')}</td><td>${ps.length} <small>(${ps.filter(c => stLimpo(c.status) === 'PUBLICADO').length} publicadas)</small></td><td>${esc(r.status || '—')}</td><td class="acoes-cel"><button class="btn soft" data-ver="${attr(r.id)}">Ver publicações</button><button class="btn soft" data-ed="${attr(r.id)}">Editar</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty-rich"><strong>Nenhuma campanha editorial</strong><p>Crie uma para agrupar as publicações de uma ação (ex.: Matrículas 2027).</p></div>'}`;
  $('#cpNova').onclick = () => igpCampanhaForm(null);
  $$('[data-ed]').forEach(b => b.onclick = () => igpCampanhaForm(rows.find(r => r.id === b.dataset.ed)));
  $$('[data-ver]').forEach(b => b.onclick = () => { const ps = n(b.dataset.ver); if (!ps.length) return toast('Esta campanha ainda não tem publicações.', 'warn'); abrirRegistros(ps.map(p => String(p.id)), 'Campanha: ' + rows.find(r => r.id === b.dataset.ver).titulo); });
}
function igpCampanhaForm(r) {
  const e = !!r; r = r || {};
  const o = dialogo(`<h3>${e ? 'Editar campanha editorial' : 'Nova campanha editorial'}</h3><form id="cpForm" class="cm-form" novalidate><label class="wide">Nome *<input class="control" id="cN" maxlength="140" value="${attr(r.titulo || '')}"></label><label>Início<input class="control" type="date" id="cI" value="${attr(String(r.dataInicio || '').slice(0, 10))}"></label><label>Fim<input class="control" type="date" id="cF" value="${attr(String(r.prazo || '').slice(0, 10))}"></label><label>Segmento<select class="control" id="cS"><option value="">Todos</option>${SEG_NOMES.map(s => `<option ${r.segmento === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label><label>Estado<select class="control" id="cE">${['PLANEJADA', 'ATIVA', 'CONCLUÍDA', 'ARQUIVADO'].map(s => `<option ${(r.status || 'PLANEJADA') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="wide">Objetivo<input class="control" id="cO" maxlength="160" value="${attr(r.objetivo || '')}"></label><label class="wide">Descrição<textarea class="control" id="cD" rows="3" maxlength="1000">${esc(r.descricao || '')}</textarea></label><div class="cm-erro wide" id="cErr" role="alert"></div><div class="actions wide">${e ? '<button type="button" class="btn danger-soft" id="cDel">Excluir</button>' : ''}<span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>`);
  $('#cN', o.el).focus();
  $('#cpForm', o.el).onsubmit = async ev => {
    ev.preventDefault(); const body = { titulo: $('#cN', o.el).value.trim(), dataInicio: $('#cI', o.el).value, prazo: $('#cF', o.el).value, segmento: $('#cS', o.el).value, status: $('#cE', o.el).value, objetivo: $('#cO', o.el).value.trim(), descricao: $('#cD', o.el).value.trim() };
    if (body.titulo.length < 3) { $('#cErr', o.el).textContent = 'Dê um nome de pelo menos 3 letras.'; return; }
    if (body.dataInicio && body.prazo && body.prazo < body.dataInicio) { $('#cErr', o.el).textContent = 'O fim não pode ser antes do início.'; return; }
    try { if (e) await put(`/data?module=campanhas&id=${encodeURIComponent(r.id)}`, body); else await post('/data?module=campanhas', body); invalidate('campanhas'); Filtros.esquecerCampanhas(); o.close(); toast('Campanha salva'); go('igplan'); } catch (er) { $('#cErr', o.el).textContent = er.message; }
  };
  const del = $('#cDel', o.el); if (del) del.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Excluir campanha', texto: `Excluir “${r.titulo}”? As publicações continuam, só perdem o agrupamento.`, confirmar: 'Excluir', perigo: true })) return; try { await api(`/data?module=campanhas&id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }); invalidate('campanhas'); Filtros.esquecerCampanhas(); o.close(); go('igplan'); } catch (er) { toast(er.message, 'warn'); } };
}

/* ---- modelos de legenda e grupos de hashtags ---- */
async function igpModelos() {
  const [m, h] = await Promise.all([api('/studio/modelos').then(d => d.modelos || []), api('/studio/hashtags').then(d => d.grupos || [])]);
  const lista = JSON.parse(JSON.stringify(m)), grupos = JSON.parse(JSON.stringify(h));
  const pinta = () => {
    $('#igpCorpo').innerHTML = `<div class="db-duas"><section class="card"><div class="db-tit"><h2>Modelos de legenda</h2><button class="btn soft" id="mdNovo">+ Novo modelo</button></div>${lista.map((x, i) => `<div class="mod-item"><b>${esc(x.nome)}</b><p>${esc((x.legenda || '').slice(0, 140))}</p><button class="btn soft" data-med="${i}">Editar</button></div>`).join('') || '<div class="empty compact">Nenhum modelo.</div>'}</section>
      <section class="card"><div class="db-tit"><h2>Grupos de hashtags</h2><button class="btn soft" id="hgNovo">+ Novo grupo</button></div>${grupos.map((x, i) => `<div class="mod-item"><b>${esc(x.nome)}</b><p>${esc((x.tags || []).join(' '))}</p><button class="btn soft" data-hed="${i}">Editar</button></div>`).join('') || '<div class="empty compact">Nenhum grupo.</div>'}</section></div>`;
    $('#mdNovo').onclick = () => modForm(-1); $$('[data-med]').forEach(b => b.onclick = () => modForm(+b.dataset.med));
    $('#hgNovo').onclick = () => hgForm(-1); $$('[data-hed]').forEach(b => b.onclick = () => hgForm(+b.dataset.hed));
  };
  const gravar = async (rota, corpo) => { await post(rota, corpo); toast('Salvo'); go('igplan'); };
  const modForm = i => {
    const x = i >= 0 ? lista[i] : { nome: '', legenda: '', cta: '', hashtags: '' };
    const o = dialogo(`<h3>${i >= 0 ? 'Editar modelo' : 'Novo modelo'}</h3><form class="cm-form" id="mdForm"><label class="wide">Nome *<input class="control" id="mN" maxlength="60" value="${attr(x.nome)}"></label><label class="wide">Legenda<textarea class="control" id="mL" rows="6" maxlength="2200">${esc(x.legenda)}</textarea></label><label>CTA<input class="control" id="mC" maxlength="160" value="${attr(x.cta)}"></label><label>Hashtags<input class="control" id="mH" maxlength="600" value="${attr(x.hashtags)}"></label><div class="cm-erro wide" id="mErr" role="alert"></div><div class="actions wide">${i >= 0 ? '<button type="button" class="btn danger-soft" id="mDel">Excluir</button>' : ''}<span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>`);
    $('#mdForm', o.el).onsubmit = async ev => { ev.preventDefault(); const nv = { nome: $('#mN', o.el).value.trim(), legenda: $('#mL', o.el).value, cta: $('#mC', o.el).value.trim(), hashtags: $('#mH', o.el).value.trim() }; if (!nv.nome) { $('#mErr', o.el).textContent = 'Dê um nome ao modelo.'; return; } const nova = lista.slice(); if (i >= 0) nova[i] = nv; else nova.push(nv); try { o.close(); await gravar('/studio/modelos', { modelos: nova }); } catch (er) { toast(er.message, 'warn'); } };
    const d = $('#mDel', o.el); if (d) d.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Excluir modelo', texto: `Excluir “${x.nome}”?`, confirmar: 'Excluir', perigo: true })) return; o.close(); await gravar('/studio/modelos', { modelos: lista.filter((_, k) => k !== i) }); };
  };
  const hgForm = i => {
    const x = i >= 0 ? grupos[i] : { nome: '', tags: [] };
    const o = dialogo(`<h3>${i >= 0 ? 'Editar grupo' : 'Novo grupo'}</h3><form class="cm-form" id="hgForm"><label class="wide">Nome *<input class="control" id="gN" maxlength="40" value="${attr(x.nome)}"></label><label class="wide">Hashtags (separadas por espaço)<textarea class="control" id="gT" rows="3">${esc((x.tags || []).join(' '))}</textarea></label><div class="cm-erro wide" id="gErr" role="alert"></div><div class="actions wide">${i >= 0 ? '<button type="button" class="btn danger-soft" id="gDel">Excluir</button>' : ''}<span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>`);
    $('#hgForm', o.el).onsubmit = async ev => { ev.preventDefault(); const nv = { nome: $('#gN', o.el).value.trim(), tags: ($('#gT', o.el).value.match(/#[\p{L}\p{N}_]+/gu) || []) }; if (!nv.nome) { $('#gErr', o.el).textContent = 'Dê um nome ao grupo.'; return; } const nova = grupos.slice(); if (i >= 0) nova[i] = nv; else nova.push(nv); try { o.close(); await gravar('/studio/hashtags', { grupos: nova }); } catch (er) { toast(er.message, 'warn'); } };
    const d = $('#gDel', o.el); if (d) d.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Excluir grupo', texto: `Excluir “${x.nome}”?`, confirmar: 'Excluir', perigo: true })) return; o.close(); await gravar('/studio/hashtags', { grupos: grupos.filter((_, k) => k !== i) }); };
  };
  pinta();
}
