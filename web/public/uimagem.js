/* Uso de Imagem › Painel e Alunos. O Marketing escolhe MANUALMENTE quem precisa de autorização; nada é selecionado sozinho.
   Dados de alunos ficam só nesta área interna e nunca vão para URLs públicas. */
/* Ordem escolar das turmas (igual à do servidor): Infantil 1-5, 1º-9º Ano, 1ª-3ª Série; depois a letra. */
function uiChaveTurma(turma) {
  const t = String(turma || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[º°ª]/g, '').replace(/\s+/g, ' ').trim();
  const letra = (/(?:^|[\s\-/])([a-z])$/.exec(t) || [])[1] || '';
  let m = /infantil\s*(\d)/.exec(t) || /(\d)\s*infantil/.exec(t);
  if (m) return [0, +m[1], letra];
  m = /(\d{1,2})\s*(?:o\s*)?(?:ano|serie)\b/.exec(t) || /\b(?:ano|serie)\s*(\d{1,2})/.exec(t);
  if (m) return [/serie/.test(t) ? 2 : 1, +m[1], letra];
  return [9, 0, t];
}
const uiCmpTurma = (a, b) => { const x = uiChaveTurma(a), y = uiChaveTurma(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2], 'pt-BR') || String(a).localeCompare(String(b), 'pt-BR'); };
const UI = { ordem: 'turma', sel: new Map(), busca: '', segmento: '', turma: '', situacao: '', inativos: false };
const UI_ACOES = { 'aluno-criado': 'Aluno cadastrado', 'aluno-editado': 'Cadastro atualizado', 'aluno-inativado': 'Aluno inativado', 'aluno-reativado': 'Aluno reativado', importacao: 'Lista importada', 'solicitacoes-criadas': 'Solicitações criadas', 'alunos-excluidos': 'Alunos excluídos da lista' };
const UI_SITU = [['', 'Todas as situações'], ['SEM', 'Sem solicitação'], ['PENDENTE', 'Pendente'], ['AUTORIZADO', 'Autorizado'], ['NAO_AUTORIZADO', 'Não autorizado'], ['AGUARDANDO_ENVIO', 'Aguardando envio'], ['ENVIADO', 'Enviado'], ['ABERTO', 'Aberto'], ['AGUARDANDO_ASSINATURA', 'Aguardando assinatura'], ['AGUARDANDO_VALIDACAO', 'Aguardando validação'], ['VENCIDO', 'Vencido'], ['REVOGADO', 'Revogado']];

PAGINAS.uipainel = async function () {
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  const d = await api('/imagem/painel');
  const cartao = (rot, v, cls, nota) => `<div class="db-cartao ui-cartao ${cls || ''}"><small>${rot}</small><strong>${fmtN(v)}</strong>${nota ? `<span class="kpi-note">${nota}</span>` : ''}</div>`;
  const maior = Math.max(1, ...d.segmentos.map(s => s.n));
  $('#content').innerHTML = `<div class="ig-barra"><button type="button" class="btn" id="uiIrAlunos">Selecionar alunos</button><span class="kpi-note">O Marketing escolhe, na lista, quem precisa de autorização de uso de imagem.</span></div>
    <div class="db-cartoes ui-seis">${cartao('Alunos ativos', d.totalAlunos)}${cartao('Autorizados', d.autorizados, 'ok')}${cartao('Pendentes', d.pendentes, d.pendentes ? 'alerta' : '')}${cartao('Não autorizados', d.naoAutorizados, d.naoAutorizados ? 'alerta' : '')}${cartao('Vencidos', d.vencidos, d.vencidos ? 'alerta' : '')}${cartao('Revogados', d.revogados, d.revogados ? 'alerta' : '')}</div>
    ${d.naoUsar.length ? `<section class="card ui-atencao"><div class="db-tit"><h2>Não usar a imagem destes alunos</h2></div><p class="kpi-note">Recusado, vencido ou revogado: não publicar fotos nem vídeos.</p><ul class="ui-nao">${d.naoUsar.map(a => `<li><button type="button" class="ui-lk" data-ficha="${a.id}"><b>${esc(a.nome)}</b> <small>${esc(a.turma || '')}</small></button>${uiBadge(a.status)}</li>`).join('')}</ul></section>` : ''}
    ${d.vencemLogo.length ? `<section class="card"><div class="db-tit"><h2>Vencem nos próximos ${d.avisoDias} dias</h2></div><ul class="ui-nao">${d.vencemLogo.map(a => `<li><button type="button" class="ui-lk" data-ficha="${a.id}"><b>${esc(a.nome)}</b> <small>${esc(a.turma || '')}</small></button><span class="badge warn">vence em ${esc(fmtDate(a.vence_em))}</span></li>`).join('')}</ul></section>` : ''}
    <div class="db-duas"><section class="card"><div class="db-tit"><h2>Alunos por segmento</h2></div>${d.totalAlunos ? `<ul class="ui-seg">${d.segmentos.filter(s => s.n || s.k).map(s => `<li><span>${esc(s.nome)}</span><div class="ui-barra"><i style="width:${Math.round(s.n / maior * 100)}%"></i></div><b>${fmtN(s.n)}</b></li>`).join('')}</ul>` : '<p class="kpi-note">Nenhum aluno cadastrado ainda. Importe a lista em Alunos.</p>'}</section>
    <section class="card"><div class="db-tit"><h2>Atividade recente</h2></div>${d.recentes.length ? `<ul class="ui-rec">${d.recentes.map(r => `<li><b>${esc(UI_ACOES[r.acao] || r.acao)}</b><span>${esc(r.aluno || r.detalhe || '')}</span><small>${esc(fmtDateTime(r.quando))} · ${esc(r.ator)}</small></li>`).join('')}</ul>` : '<p class="kpi-note">Nada por aqui ainda.</p>'}</section></div>
    `;
  $('#uiIrAlunos').onclick = () => go('uialunos');
  $$('[data-ficha]').forEach(b => { b.onclick = () => uiFicha(+b.dataset.ficha); });
};

/* ---- leitura de listas (CSV colado/enviado ou planilha .xlsx) ---- */
function uiLerCsv(texto) {
  const t = String(texto || '').replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/).find(l => l.trim()) || '';
  const sep = [';', '\t', ','].map(s => [s, primeira.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const linhas = []; let cel = '', lin = [], asp = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (asp) { if (ch === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else asp = false; } else cel += ch; }
    else if (ch === '"') asp = true;
    else if (ch === sep) { lin.push(cel.trim()); cel = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; lin.push(cel.trim()); cel = ''; if (lin.some(x => x)) linhas.push(lin); lin = []; }
    else cel += ch;
  }
  lin.push(cel.trim()); if (lin.some(x => x)) linhas.push(lin);
  return linhas;
}
const uiNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Converte linhas cruas em alunos. Se houver cabeçalho (nome, matrícula, turma, segmento/série), usa-o; senão, a ordem é nome, matrícula, turma, segmento. */
function uiLinhasParaAlunos(linhas) {
  if (!linhas.length) return [];
  const cab = linhas[0].map(uiNorm), idx = (...nomes) => cab.findIndex(c => nomes.includes(c));
  const iN = idx('nome', 'aluno', 'nomedoaluno', 'estudante'), iM = idx('matricula', 'mat', 'ra', 'codigo'), iT = idx('turma', 'classe', 'serie', 'anoturma'), iS = idx('segmento', 'nivel', 'etapa', 'modalidade');
  const temCab = iN >= 0 && iM >= 0;
  const corpo = (temCab ? linhas.slice(1) : linhas).filter(l => !/apague esta linha/i.test(l.join(' ')) && !/^(como preencher|apague as linhas)/i.test(String(l[0] || '')) && !(String(l[0] || '').includes(':') && !String(l[1] || '').trim() && !String(l[2] || '').trim() && !String(l[3] || '').trim()) && !/^EXEMPLO-/i.test(String(l[0] || '')) && !/^EXEMPLO-/i.test(String(l[1] || '')));
  return corpo.map(l => temCab ? { nome: l[iN] || '', matricula: l[iM] || '', turma: iT >= 0 ? l[iT] || '' : '', segmento: iS >= 0 ? l[iS] || '' : '' } : (() => { const matPrimeiro = !/\s/.test(String(l[0] || '').trim()) && /\d/.test(String(l[0] || '')) ; const nomePrimeiro = /[A-Za-zÀ-ÿ]{3}/.test(String(l[0] || '')) && /\s/.test(String(l[0] || '').trim()) && /\d/.test(String(l[1] || '')) && !/\s/.test(String(l[1] || '').trim()); return nomePrimeiro && !matPrimeiro ? { nome: l[0] || '', matricula: l[1] || '', turma: l[2] || '', segmento: l[3] || '' } : { matricula: l[0] || '', nome: l[1] || '', turma: l[2] || '', segmento: l[3] || '' }; })());
}

PAGINAS.uialunos = async function () {
  $('#content').innerHTML = `<div class="ig-barra"><input id="uiBusca" class="control" type="search" placeholder="Buscar por nome ou matrícula" aria-label="Buscar aluno" value="${attr(UI.busca)}"><select id="uiSeg" class="control" aria-label="Segmento"></select><select id="uiTurma" class="control" aria-label="Turma"></select><select id="uiSit" class="control" aria-label="Situação da autorização">${UI_SITU.map(([k, t]) => `<option value="${k}" ${UI.situacao === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <label class="check-row ui-inat"><input type="checkbox" id="uiInat" ${UI.inativos ? 'checked' : ''}> Mostrar inativos</label><span class="cm-esp"></span><button type="button" class="btn soft" id="uiImp">Importar lista</button><button type="button" class="btn" id="uiNovo">+ Novo aluno</button></div>
    <div class="ui-selbar" id="uiSelBar" hidden></div><div id="uiLista"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
  let dados = null, atraso = 0;
  const barra = () => {
    const b = $('#uiSelBar'), n = UI.sel.size; b.hidden = !n;
    b.innerHTML = n ? `<b>${n} aluno(s) selecionado(s)</b><span class="kpi-note">A escolha é manual: só quem você marcar entra na solicitação.</span><span class="cm-esp"></span><button type="button" class="btn soft" id="uiLimpaSel">Limpar seleção</button><button type="button" class="btn danger-soft" id="uiExcl">Excluir marcados</button><button type="button" class="btn" id="uiCriar">Criar solicitações</button>` : '';
    const l = $('#uiLimpaSel'); if (l) l.onclick = () => { UI.sel.clear(); desenha(); };
    const cr = $('#uiCriar'); if (cr) cr.onclick = () => uiCriarSolic(UI.sel);
    const ex = $('#uiExcl'); if (ex) ex.onclick = () => uiExcluir([...UI.sel.values()], carrega);
  };
  const carrega = async () => {
    const qs = new URLSearchParams({ busca: UI.busca, segmento: UI.segmento, turma: UI.turma, situacao: UI.situacao, inativos: UI.inativos ? '1' : '' });
    dados = await api('/imagem/alunos?' + qs);
    $('#uiSeg').innerHTML = `<option value="">Todos os segmentos</option>${dados.segmentos.map(s => `<option value="${s.k}" ${UI.segmento === s.k ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}`;
    $('#uiTurma').innerHTML = `<option value="">Todas as turmas</option>${dados.turmas.map(t => `<option value="${attr(t)}" ${UI.turma === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;
    desenha();
  };
  const desenha = () => {
    barra();
    const rows = [...dados.rows].sort(UI.ordem === 'nome' ? (x, y) => String(x.nome).localeCompare(String(y.nome), 'pt-BR') : (x, y) => uiCmpTurma(x.turma, y.turma) || String(x.nome).localeCompare(String(y.nome), 'pt-BR')), todosMarcados = rows.length && rows.every(r => UI.sel.has(r.id));
    $('#uiLista').innerHTML = rows.length ? `<p class="kpi-note">${rows.length} aluno(s)${dados.limite ? ' (mostrando os 3.000 primeiros; refine a busca)' : ''} de ${fmtN(dados.total)} ativos.</p><div class="tablewrap"><table class="datatable ui-tab"><thead><tr><th class="ui-ck"><input type="checkbox" id="uiTodos" aria-label="Marcar todos os alunos desta lista" ${todosMarcados ? 'checked' : ''}></th><th><button type="button" class="ui-ord ${UI.ordem === 'nome' ? 'on' : ''}" data-ord="nome" title="Ordenar por nome">Aluno ${UI.ordem === 'nome' ? '▲' : ''}</button></th><th>Matrícula</th><th><button type="button" class="ui-ord ${UI.ordem === 'turma' ? 'on' : ''}" data-ord="turma" title="Ordenar pela ordem das turmas: Infantil 1 a 5, 1º ao 9º Ano, 1ª a 3ª Série">Turma ${UI.ordem === 'turma' ? '▲' : ''}</button></th><th>Segmento</th><th>Autorização</th><th></th></tr></thead><tbody>${rows.map(r => `<tr class="${r.ativo ? '' : 'ui-off'}"><td class="ui-ck"><input type="checkbox" data-sel="${r.id}" aria-label="Selecionar ${attr(r.nome)}" ${UI.sel.has(r.id) ? 'checked' : ''} ${r.ativo ? '' : 'disabled'}></td><td class="titlecell"><b>${esc(r.nome)}</b>${r.ativo ? '' : ' <small>(inativo)</small>'}</td><td>${esc(r.matricula)}</td><td>${esc(r.turma || '—')}</td><td>${esc(r.segmentoNome)}</td><td>${r.ativo ? `<button type="button" class="btn soft" data-lib="${r.id}" aria-label="Alterar autorização de ${attr(r.nome)}">${uiBadge(r.situacao)} <span aria-hidden="true">▾</span></button>` : uiBadge(r.situacao)}</td><td class="acoes-cel"><button type="button" class="btn soft" data-fi="${r.id}">Ficha</button><button type="button" class="btn soft" data-ed="${r.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty-rich"><strong>${dados.total || UI.busca || UI.segmento || UI.turma || UI.situacao ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}</strong><p>${dados.total || UI.busca || UI.segmento || UI.turma || UI.situacao ? 'Mude a busca ou os filtros.' : 'Importe a lista (CSV ou planilha .xlsx) ou cadastre um aluno por vez.'}</p></div>`;
    $$('[data-sel]').forEach(c => { c.onchange = () => { const r = dados.rows.find(x => x.id === +c.dataset.sel); if (c.checked) UI.sel.set(r.id, r); else UI.sel.delete(r.id); barra(); const t = $('#uiTodos'); if (t) t.checked = dados.rows.length && dados.rows.every(x => UI.sel.has(x.id)); }; });
    const t = $('#uiTodos'); if (t) t.onchange = () => { dados.rows.filter(r => r.ativo).forEach(r => { if (t.checked) UI.sel.set(r.id, r); else UI.sel.delete(r.id); }); desenha(); };
    $$('[data-ord]').forEach(b => { b.onclick = () => { UI.ordem = b.dataset.ord; desenha(); }; });
    $$('[data-lib]').forEach(b => { b.onclick = () => uiLiberacao(dados.rows.find(x => x.id === +b.dataset.lib), carrega); });
    $$('[data-fi]').forEach(b => { b.onclick = () => uiFicha(+b.dataset.fi); });
    $$('[data-ed]').forEach(b => { b.onclick = () => uiAlunoForm(dados.rows.find(x => x.id === +b.dataset.ed), carrega, dados.segmentos); });
  };
  $('#uiBusca').oninput = e => { clearTimeout(atraso); atraso = setTimeout(() => { UI.busca = e.target.value; carrega(); }, 250); };
  $('#uiSeg').onchange = e => { UI.segmento = e.target.value; carrega(); };
  $('#uiTurma').onchange = e => { UI.turma = e.target.value; carrega(); };
  $('#uiSit').onchange = e => { UI.situacao = e.target.value; carrega(); };
  $('#uiInat').onchange = e => { UI.inativos = e.target.checked; carrega(); };
  $('#uiNovo').onclick = () => uiAlunoForm(null, carrega, null);
  $('#uiImp').onclick = () => uiImportar(carrega);
  await carrega();
};

PAGINAS.uiautorizados = async function () {
  const content = $('#content');
  content.innerHTML = '<section id="uiAutorizados"><p class="kpi-note">Carregando alunos autorizados…</p></section>';
  const painel = $('#uiAutorizados', content);
  const { rows } = await api('/carometro/autorizados');
  if (!painel.isConnected) return;
  const turmas = [...new Set(rows.map(a => a.turma).filter(Boolean))].sort(uiCmpTurma);
  painel.innerHTML = `<div class="card">
    <div class="db-tit"><h2>Alunos autorizados</h2></div>
    <label class="ui-campo">Buscar por nome ou matrícula<input class="control" type="search" id="uiAutBusca"></label>
    <details><summary>Filtrar turmas</summary>
      <div class="ui-chips">${turmas.map(t => `<label class="ui-chip"><input type="checkbox" value="${attr(t)}"> ${esc(t)}</label>`).join('')}</div>
      <p class="kpi-note">Sem turma selecionada, a aba mostra todas.</p>
    </details>
  </div>
  <p class="kpi-note" id="uiAutTotal" role="status"></p>
  <div class="cm-grade" id="uiAutGrade"></div>
  <button type="button" class="btn soft" id="uiAutMais" hidden>Mostrar mais alunos</button>`;
  const busca = $('#uiAutBusca', painel), mais = $('#uiAutMais', painel);
  const normaliza = v => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const alunos = rows.map(a => ({ ...a, busca: normaliza(a.nome + ' ' + a.matricula) }));
  const lote = 48;
  let visiveis = lote;
  const desenha = () => {
    const texto = normaliza(busca.value);
    const escolhidas = new Set($$('input[type="checkbox"]:checked', painel).map(input => input.value));
    const resultado = alunos.filter(a => a.busca.includes(texto) && (!escolhidas.size || escolhidas.has(a.turma)));
    $('#uiAutTotal', painel).textContent = resultado.length ? `${resultado.length} aluno(s) autorizado(s)` : 'Nenhum aluno autorizado encontrado.';
    $('#uiAutGrade', painel).innerHTML = resultado.slice(0, visiveis).map(a => `<article class="cm-al">
      ${cmFoto(a)}<strong>${esc(a.nome)}</strong><small>Matrícula ${esc(a.matricula)}</small><small>${esc(a.turma || 'Sem turma')}</small>
    </article>`).join('');
    mais.hidden = resultado.length <= visiveis;
  };
  const filtra = () => { visiveis = lote; desenha(); };
  busca.oninput = filtra;
  painel.onchange = ev => { if (ev.target.type === 'checkbox') filtra(); };
  mais.onclick = () => { visiveis += lote; desenha(); };
  desenha();
};

/* Carômetro dos NÃO autorizados: quem não pode ter a imagem usada nos conteúdos (recusou, revogou, venceu e, se quiser, quem ainda não respondeu). */
PAGINAS.uinaoautorizados = async function () {
  const content = $('#content');
  content.innerHTML = '<section id="uiNao"><p class="kpi-note">Carregando…</p></section>';
  const painel = $('#uiNao', content);
  const { rows } = await api('/carometro/nao-autorizados');
  if (!painel.isConnected) return;
  const turmas = [...new Set(rows.map(a => a.turma).filter(Boolean))].sort(uiCmpTurma);
  const cont = m => rows.filter(a => a.motivo === m).length;
  const COR = { 'Não autoriza': 'bad', Revogado: 'bad', Vencido: 'warn', 'Sem resposta': 'mute' };
  painel.innerHTML = `<div class="card">
    <div class="db-tit"><h2>Famílias que NÃO autorizam a imagem nas redes sociais</h2></div>
    <p class="kpi-note"><b>A família não autoriza a imagem destes alunos nas redes sociais.</b> Não use em posts, vídeos ou anúncios. Não autoriza: ${fmtN(cont('Não autoriza'))} · Revogado: ${fmtN(cont('Revogado'))} · Vencido: ${fmtN(cont('Vencido'))} · Sem resposta: ${fmtN(cont('Sem resposta'))}.</p>
    <label class="ui-campo">Buscar por nome ou matrícula<input class="control" type="search" id="uiNaoBusca"></label>
    <label class="cm-chk"><input type="checkbox" id="uiNaoPend"> Incluir quem ainda não respondeu (sem resposta)</label>
    <details><summary>Filtrar turmas</summary>
      <div class="ui-chips">${turmas.map(t => `<label class="ui-chip"><input type="checkbox" value="${attr(t)}"> ${esc(t)}</label>`).join('')}</div>
      <p class="kpi-note">Sem turma selecionada, a aba mostra todas.</p>
    </details>
    <div class="ig-barra"><button type="button" class="btn" id="uiNaoPdf">Gerar PDF dos não autorizados</button></div>
  </div>
  <p class="kpi-note" id="uiNaoTotal" role="status"></p>
  <div class="cm-grade" id="uiNaoGrade"></div>
  <button type="button" class="btn soft" id="uiNaoMais" hidden>Mostrar mais alunos</button>`;
  const busca = $('#uiNaoBusca', painel), mais = $('#uiNaoMais', painel), pend = $('#uiNaoPend', painel);
  const normaliza = v => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const alunos = rows.map(a => ({ ...a, busca: normaliza(a.nome + ' ' + a.matricula) }));
  const lote = 48; let visiveis = lote;
  const desenha = () => {
    const texto = normaliza(busca.value);
    const escolhidas = new Set($$('details input[type="checkbox"]:checked', painel).map(i => i.value));
    const resultado = alunos.filter(a => a.busca.includes(texto) && (!escolhidas.size || escolhidas.has(a.turma)) && (pend.checked || a.motivo !== 'Sem resposta'));
    $('#uiNaoTotal', painel).textContent = resultado.length ? `${resultado.length} aluno(s) sem autorização para uso de imagem` : 'Nenhum aluno encontrado.';
    $('#uiNaoGrade', painel).innerHTML = resultado.slice(0, visiveis).map(a => `<article class="cm-al">
      ${cmFoto(a)}<strong>${esc(a.nome)}</strong><small>Matrícula ${esc(a.matricula)}</small><small>${esc(a.turma || 'Sem turma')}</small><span class="cm-selo ${COR[a.motivo] || 'mute'}">${esc(a.motivo)}</span>
    </article>`).join('');
    mais.hidden = resultado.length <= visiveis;
  };
  const filtra = () => { visiveis = lote; desenha(); };
  busca.oninput = filtra; pend.onchange = filtra;
  painel.onchange = ev => { if (ev.target.type === 'checkbox' && ev.target !== pend) filtra(); };
  mais.onclick = () => { visiveis += lote; desenha(); };
  $('#uiNaoPdf', painel).onclick = () => { CM_PDF.origem = 'nao-autorizados'; CM_PDF.pendentes = pend.checked; const t = $$('details input[type="checkbox"]:checked', painel).map(i => i.value); CM_PDF.todas = !t.length; CM_PDF.turmas = t; go('cmpdf'); };
  desenha();
};

function uiLiberacao(aluno, recarrega) {
  const opcoes = [['SEM', 'Sem solicitação (ninguém respondeu ainda)'], ['AUTORIZADO', 'Autorizado'], ['NAO_AUTORIZADO', 'Não autorizado'], ['PENDENTE', 'Pendente']];
  const d = dialogo(`<form id="uiLib"><h3>Alterar autorização</h3>
    <p><b>${esc(aluno.nome)}</b> · ${esc(aluno.turma || 'Sem turma')}</p>
    <label class="ui-campo">Liberação de imagem<select class="control" id="uiLibStatus" required>
      ${aluno.situacao && !opcoes.some(o => o[0] === aluno.situacao) ? `<option value="" selected disabled>Situação atual: ${esc(aluno.situacaoRotulo || aluno.situacao)}</option>` : ''}
      ${opcoes.map(([v, t]) => `<option value="${v}" ${v === (aluno.situacao || 'SEM') ? 'selected' : ''}>${t}</option>`).join('')}
    </select></label>
    <p class="kpi-note">Registro interno para o ano letivo atual. Marque “Autorizado” quando a escola já tiver a autorização do responsável. “Sem solicitação” desfaz a marcação interna: volta a valer só a solicitação enviada à família, se houver.</p>
    <p id="uiLibErro" class="cm-erro" role="alert" hidden></p>
    <div class="actions dlg-acoes"><button type="button" class="btn soft" data-close>Cancelar</button><button type="submit" class="btn">Salvar</button></div>
  </form>`);
  const f = $('#uiLib', d.el), salvar = $('button[type="submit"]', f);
  f.onsubmit = async ev => {
    ev.preventDefault();
    salvar.disabled = true;
    try {
      await post('/imagem/alunos/liberacao', { id: aluno.id, status: $('#uiLibStatus', f).value });
    } catch (e) {
      const erro = $('#uiLibErro', f);
      erro.textContent = e.message;
      erro.hidden = false;
      salvar.disabled = false;
      return;
    }
    d.close();
    toast('Autorização atualizada');
    await recarrega();
  };
}

function uiAlunoForm(a, aoSalvar, segmentos) {
  const segs = segmentos || [['INFANTIL', 'Educação Infantil'], ['FUND1', 'Anos Iniciais'], ['FUND2', 'Anos Finais'], ['MEDIO', 'Ensino Médio']].map(([k, nome]) => ({ k, nome }));
  const d = dialogo(`<form id="uiForm" novalidate><h3>${a ? 'Editar aluno' : 'Novo aluno'}</h3>
    <label class="ui-campo">Nome completo<input class="control" id="uiN" maxlength="160" value="${attr(a?.nome || '')}" required></label>
    <label class="ui-campo">Matrícula<input class="control" id="uiM" maxlength="40" value="${attr(a?.matricula || '')}" required></label>
    <label class="ui-campo">Turma<input class="control" id="uiT" maxlength="60" value="${attr(a?.turma || '')}" placeholder="Ex.: 3º Ano A"></label>
    <label class="ui-campo">Segmento<select class="control" id="uiS"><option value="">Sem segmento</option>${segs.map(s => `<option value="${s.k}" ${a?.segmento === s.k ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>
    <div class="igp-erro" id="uiErro" role="alert" hidden></div>
    <div class="actions dlg-acoes">${a ? `<button type="button" class="btn danger-soft" id="uiDel">Excluir da lista</button><button type="button" class="btn ${a.ativo ? 'soft' : 'soft'}" id="uiAtivo">${a.ativo ? 'Inativar aluno' : 'Reativar aluno'}</button>` : ''}<span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button type="submit" class="btn">Salvar</button></div></form>`);
  const erro = m => { const e = $('#uiErro', d.el); e.textContent = m; e.hidden = !m; };
  $('#uiForm', d.el).onsubmit = async ev => {
    ev.preventDefault(); erro('');
    try { await post('/imagem/alunos', { id: a?.id, nome: $('#uiN', d.el).value, matricula: $('#uiM', d.el).value, turma: $('#uiT', d.el).value, segmento: $('#uiS', d.el).value }); toast('Aluno salvo'); d.close(); aoSalvar(); }
    catch (e) { erro(e.message || 'Não foi possível salvar.'); }
  };
  const del = $('#uiDel', d.el); if (del) del.onclick = () => { d.close(); uiExcluir([a], aoSalvar); };
  const at = $('#uiAtivo', d.el);
  if (at) at.onclick = async () => {
    if (a.ativo && !await Dlg.confirmar({ titulo: 'Inativar aluno', texto: `“${a.nome}” sai da lista de seleção. O histórico é mantido e nada é apagado.`, confirmar: 'Inativar' })) return;
    try { await post('/imagem/alunos/ativo', { id: a.id, ativo: !a.ativo }); UI.sel.delete(a.id); toast(a.ativo ? 'Aluno inativado' : 'Aluno reativado'); d.close(); aoSalvar(); } catch (e) { erro(e.message); }
  };
}

function uiImportar(aoFim) {
  const d = dialogo(`<h3>Importar lista de alunos</h3><p class="kpi-note">Aceita planilha .xlsx, arquivo .csv ou texto colado, com as colunas <b>matrícula, nome, turma e segmento</b> (a primeira linha pode ser o cabeçalho). Quem já está cadastrado é atualizado pela matrícula; <b>ninguém é apagado</b>.</p>
    <p><a class="btn soft" id="uiModelo" href="${API}/imagem/alunos/modelo.xlsx" download>Baixar planilha modelo (.xlsx)</a> <span class="kpi-note">Já vem com as colunas certas e instruções.</span></p><div class="ui-imp"><label class="igp-upload"><input type="file" id="uiArq" accept=".xlsx,.csv,.txt"><b>Escolher arquivo</b><small>.xlsx, .csv ou .txt</small></label><textarea id="uiTxt" class="control" rows="5" placeholder="Ou cole aqui: matrícula;nome;turma;segmento"></textarea></div>
    <div id="uiPrevia"></div><div class="igp-erro" id="uiErro" role="alert" hidden></div>
    <div class="actions dlg-acoes"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button type="button" class="btn soft" id="uiConferir">Conferir lista</button><button type="button" class="btn" id="uiOk" disabled>Importar</button></div>`, { larga: true });
  let alunos = [];
  const erro = m => { const e = $('#uiErro', d.el); e.textContent = m; e.hidden = !m; };
  const conferir = async () => {
    erro(''); $('#uiOk', d.el).disabled = true;
    if (!alunos.length) return erro('Escolha um arquivo ou cole a lista.');
    try {
      const r = await post('/imagem/alunos/importar', { linhas: alunos, previa: true });
      $('#uiPrevia', d.el).innerHTML = `<div class="ui-resumo"><span><b>${r.novos}</b> novo(s)</span><span><b>${r.atualizados}</b> atualizado(s)</span><span><b>${r.iguais}</b> sem mudança</span><span class="${r.erros.length ? 'ui-ruim' : ''}"><b>${r.erros.length}</b> com problema</span></div>${r.erros.length ? `<ul class="ui-erros">${r.erros.slice(0, 8).map(e => `<li>Linha ${e.linha}: ${esc(e.erro)}</li>`).join('')}${r.erros.length > 8 ? `<li>… e mais ${r.erros.length - 8}</li>` : ''}</ul>` : ''}`;
      $('#uiOk', d.el).disabled = !(r.novos || r.atualizados);
    } catch (e) { erro(e.message); }
  };
  $('#uiArq', d.el).onchange = async e => {
    const f = e.target.files[0]; if (!f) return; erro('');
    try {
      if (/\.xlsx$/i.test(f.name)) {
        if (f.size > 1400000) return erro('A planilha passa de 1,4 MB. Salve como .csv e tente de novo.');
        const bytes = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
        alunos = uiLinhasParaAlunos((await post('/imagem/alunos/ler-planilha', { base64: btoa(bin) })).linhas);
      } else alunos = uiLinhasParaAlunos(uiLerCsv(await f.text()));
      $('#uiTxt', d.el).value = ''; await conferir();
    } catch (x) { erro(x.message); }
  };
  $('#uiConferir', d.el).onclick = () => { const t = $('#uiTxt', d.el).value; if (t.trim()) alunos = uiLinhasParaAlunos(uiLerCsv(t)); conferir(); };
  $('#uiOk', d.el).onclick = async () => {
    $('#uiOk', d.el).disabled = true;
    try { const r = await post('/imagem/alunos/importar', { linhas: alunos }); toast(`${r.novos} novo(s), ${r.atualizados} atualizado(s)`); d.close(); aoFim(); } catch (e) { erro(e.message); $('#uiOk', d.el).disabled = false; }
  };
}

/* ---- excluir da lista: definitivo; quem já tem solicitação não é excluído (use Inativar) ---- */
function uiExcluir(alunos, recarrega) {
  if (!alunos.length) return;
  const muitos = alunos.length > 3;
  const d = dialogo(`<form id="xlF" novalidate><h3>Excluir ${alunos.length} aluno(s) da lista</h3><p class="ui-aviso"><b>Exclusão definitiva.</b> Quem já tem solicitação de autorização <b>não</b> é excluído (o histórico é prova): para esses, use Inativar. Se tiver dúvida, faça um backup antes em Configurações.</p>
    <ul class="ui-erros ui-xl">${alunos.slice(0, 8).map(a => `<li>${esc(a.nome)} <small>${esc(a.turma || '')}</small></li>`).join('')}${alunos.length > 8 ? `<li>… e mais ${alunos.length - 8}</li>` : ''}</ul>
    ${muitos ? `<label class="ui-campo">Para confirmar, digite <b>EXCLUIR</b><input class="control" id="xlC" autocomplete="off"></label>` : ''}
    <div class="igp-erro" id="xlE" role="alert" hidden></div><div class="actions dlg-acoes"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Voltar</button><button type="submit" class="btn danger">Excluir definitivamente</button></div></form>`);
  $('#xlF', d.el).onsubmit = async ev => {
    ev.preventDefault(); const e = $('#xlE', d.el);
    if (muitos && $('#xlC', d.el).value.trim().toUpperCase() !== 'EXCLUIR') { e.textContent = 'Digite EXCLUIR para confirmar.'; e.hidden = false; return; }
    try {
      const r = await post('/imagem/alunos/excluir', { ids: alunos.map(a => a.id) });
      alunos.forEach(a => UI.sel.delete(a.id)); d.close();
      toast(`${r.excluidos} aluno(s) excluído(s)` + (r.mantidos.length ? `; ${r.mantidos.length} mantido(s) por terem solicitações` : ''), r.mantidos.length ? 'warn' : undefined); recarrega();
    } catch (x) { e.textContent = x.message; e.hidden = false; }
  };
}
