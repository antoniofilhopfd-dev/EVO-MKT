/* Uso de Imagem › Modelos e Solicitações. Modelos: só o Administrador edita. Cada solicitação guarda o texto, a versão e o hash do momento
   em que foi criada: mudar o modelo depois não altera o que já foi pedido. */
const UI_STATUS = {
  AGUARDANDO_ENVIO: ['Aguardando envio', ''], ENVIADO: ['Enviado', 'info'], ABERTO: ['Aberto', 'info'], AGUARDANDO_ASSINATURA: ['Aguardando assinatura', 'warn'], AGUARDANDO_VALIDACAO: ['Aguardando validação', 'warn'],
  AUTORIZADO: ['Autorizado', 'ok'], NAO_AUTORIZADO: ['Não autorizado', 'bad'], VENCIDO: ['Vencido', 'bad'], REVOGADO: ['Revogado', 'bad'], ERRO: ['Erro', 'bad'], CANCELADO: ['Cancelado', 'mute'],
};
const uiBadge = s => { const [t, c] = UI_STATUS[s] || ['Sem solicitação', '']; return `<span class="badge ${c}">${esc(t)}</span>`; };
const UI_TIPOS = { PADRAO: 'Padrão', EVENTO: 'Específico de evento', PERSONALIZADO: 'Personalizado' };
const uiPrazoRot = m => m.periodo_tipo === 'ATE_DATA' ? `até ${fmtDate(m.periodo_valor)}` : m.periodo_tipo === 'MESES' ? `${m.periodo_valor} mês(es)` : 'indeterminado';
const uiBaixarPdf = ids => { const a = document.createElement('a'); a.href = `${API}/imagem/solicitacoes/pdf?ids=${ids.join(',')}`; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); };
const uiAviso = '<p class="ui-aviso"><b>Texto de exemplo.</b> Antes de enviar a qualquer responsável, o termo precisa de revisão jurídica e de LGPD do colégio. O sistema não substitui essa análise.</p>';

PAGINAS.uimodelos = async function () {
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  const d = await api('/imagem/modelos');
  $('#content').innerHTML = `${uiAviso}<div class="ig-barra"><span class="kpi-note">${d.podeEditar ? 'Você é Administrador: pode criar e editar modelos.' : 'Só o Administrador cria e edita modelos. Você pode ver a prévia.'}</span><span class="cm-esp"></span>${d.podeEditar ? '<button type="button" class="btn" id="uiNovoModelo">+ Novo modelo</button>' : ''}</div>
    <div class="ui-modelos">${d.rows.map(m => `<section class="card ui-modelo ${m.ativo ? '' : 'ui-off'}"><div class="db-tit"><h2>${esc(m.nome)}</h2><span class="badge">${esc(UI_TIPOS[m.tipo] || m.tipo)}</span></div>
      <p class="kpi-note">${esc(m.finalidade)}</p><dl class="dc-dl"><dt>Canais</dt><dd>${esc(m.canais.join(', '))}</dd><dt>Prazo</dt><dd>${esc(uiPrazoRot(m))}</dd><dt>Versão</dt><dd>${m.versao}${m.ativo ? '' : ' · inativo'}</dd></dl>
      <div class="actions"><button type="button" class="btn soft" data-prev="${m.id}">Ver prévia</button>${d.podeEditar ? `<button type="button" class="btn soft" data-ed="${m.id}">Editar</button><button type="button" class="btn soft" data-at="${m.id}">${m.ativo ? 'Desativar' : 'Ativar'}</button>` : ''}</div></section>`).join('')}</div>`;
  $$('[data-prev]').forEach(b => { b.onclick = () => uiPrevia({ modelo_id: +b.dataset.prev }); });
  $$('[data-ed]').forEach(b => { b.onclick = () => uiModeloForm(d.rows.find(m => m.id === +b.dataset.ed), d); });
  $$('[data-at]').forEach(b => { b.onclick = async () => { const m = d.rows.find(x => x.id === +b.dataset.at); try { await post('/imagem/modelos/ativo', { id: m.id, ativo: !m.ativo }); go('uimodelos'); } catch (e) { toast(e.message, 'bad'); } }; });
  const nv = $('#uiNovoModelo'); if (nv) nv.onclick = () => uiModeloForm(null, d);
};

/** Documento na tela, no formato do PDF. `corpo` é a chamada à prévia da API (modelo salvo ou rascunho). */
function uiDoc(r) {
  return `<article class="ui-doc"><h3>AUTORIZAÇÃO PARA USO DE IMAGEM</h3>${r.texto.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}<div class="ui-ass"><span>Assinatura do responsável</span><span>Local e data</span></div><small>Versão ${r.versao ?? '—'} · SHA-256 do texto: ${esc(r.hash.slice(0, 16))}…</small></article>`;
}
async function uiPrevia(corpo) {
  try { const r = await post('/imagem/previa', corpo); dialogo(`${uiDoc(r)}<div class="actions dlg-acoes"><span class="cm-esp"></span><button type="button" class="btn" data-close>Fechar</button></div>`, { larga: true }).el.firstElementChild.classList.add('ui-box'); }
  catch (e) { toast(e.message, 'bad'); }
}

function uiModeloForm(m, d) {
  const novo = !m; m = m || { nome: '', tipo: 'EVENTO', finalidade: '', canais: [], local_uso: '', periodo_tipo: 'INDETERMINADO', periodo_valor: '', observacoes: '', corpo: d.rows[0]?.corpo || '' };
  const dlg = dialogo(`<form id="uiMF" novalidate class="ui-mf"><div class="ui-mf-col"><h3>${novo ? 'Novo modelo' : 'Editar modelo'}</h3>
    <label class="ui-campo">Nome<input class="control" id="mfN" maxlength="120" value="${attr(m.nome)}"></label>
    <label class="ui-campo">Tipo<select class="control" id="mfT">${Object.entries(UI_TIPOS).map(([k, v]) => `<option value="${k}" ${m.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="ui-campo">Finalidade (explícita e específica)<textarea class="control" id="mfF" rows="3" maxlength="1000">${esc(m.finalidade)}</textarea></label>
    <fieldset class="ui-campo"><legend>Canais de divulgação</legend><div class="ui-canais">${d.canais.map(c => `<label class="check-row"><input type="checkbox" name="mfC" value="${attr(c)}" ${m.canais.includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</div></fieldset>
    <label class="ui-campo">Local ou evento<input class="control" id="mfL" maxlength="200" value="${attr(m.local_uso)}"></label>
    <div class="ui-linha"><label class="ui-campo">Prazo<select class="control" id="mfP"><option value="INDETERMINADO">Indeterminado</option><option value="ATE_DATA">Até uma data</option><option value="MESES">Quantidade de meses</option></select></label><label class="ui-campo" id="mfVw">Valor<input class="control" id="mfV" value="${attr(m.periodo_valor)}"></label></div>
    <label class="ui-campo">Observações (aparecem no termo)<textarea class="control" id="mfO" rows="2" maxlength="1000">${esc(m.observacoes)}</textarea></label>
    <label class="ui-campo">Texto do termo<textarea class="control" id="mfB" rows="9">${esc(m.corpo)}</textarea><small class="kpi-note">Marcadores: ${d.marcadores.map(x => `{{${x}}}`).join(' ')}</small></label>
    <div class="igp-erro" id="mfE" role="alert" hidden></div><div class="actions dlg-acoes"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button type="submit" class="btn">Salvar modelo</button></div></div>
    <aside class="ui-mf-prev"><h3>Prévia</h3><div id="mfPrev"></div></aside></form>`, { larga: true });
  dlg.el.firstElementChild.classList.add('ui-box');
  const g = id => $('#' + id, dlg.el);
  g('mfP').value = m.periodo_tipo;
  const valor = () => {
    const t = g('mfP').value, w = g('mfVw'); w.hidden = t === 'INDETERMINADO';
    const v = g('mfV'); v.type = t === 'ATE_DATA' ? 'date' : t === 'MESES' ? 'number' : 'text'; if (t === 'MESES') { v.min = 1; v.max = 120; }
  };
  const lerForm = () => ({ id: m.id, nome: g('mfN').value, tipo: g('mfT').value, finalidade: g('mfF').value, canais: $$('[name=mfC]:checked', dlg.el).map(x => x.value), local_uso: g('mfL').value, periodo_tipo: g('mfP').value, periodo_valor: g('mfP').value === 'INDETERMINADO' ? '' : g('mfV').value, observacoes: g('mfO').value, corpo: g('mfB').value });
  let tm = 0;
  const previa = () => { clearTimeout(tm); tm = setTimeout(async () => { try { g('mfPrev').innerHTML = uiDoc(await post('/imagem/previa', { modelo: lerForm() })); } catch (e) { g('mfPrev').innerHTML = `<p class="kpi-note">${esc(e.message)}</p>`; } }, 350); };
  valor();
  $$('input,select,textarea', dlg.el).forEach(el => { el.oninput = () => { if (el.id === 'mfP') valor(); previa(); }; el.onchange = el.oninput; });
  previa();
  $('#uiMF', dlg.el).onsubmit = async ev => {
    ev.preventDefault(); const e = g('mfE'); e.hidden = true;
    try { const r = await post('/imagem/modelos', lerForm()); toast(r.novaVersao ? 'Modelo salvo (nova versão)' : 'Modelo salvo'); dlg.close(); go('uimodelos'); } catch (x) { e.textContent = x.message; e.hidden = false; }
  };
}

/* ---- criar solicitações a partir dos alunos marcados ---- */
async function uiCriarSolic(selecionados) {
  const d = await api('/imagem/modelos'), ativos = d.rows.filter(m => m.ativo);
  if (!ativos.length) return toast('Nenhum modelo ativo. Peça ao Administrador para ativar um modelo.', 'warn');
  const alunos = [...selecionados.values()];
  const dlg = dialogo(`<form id="uiSF" novalidate class="ui-mf"><div class="ui-mf-col"><h3>Criar solicitações</h3><p class="kpi-note">${alunos.length} aluno(s) marcado(s) por você. Uma solicitação individual será criada para cada um.</p>
    <label class="ui-campo">Modelo de autorização<select class="control" id="sfM">${ativos.map(m => `<option value="${m.id}">${esc(m.nome)} (v${m.versao})</option>`).join('')}</select></label>
    <div class="ui-sf-lista">${alunos.map(a => `<div class="ui-sf-item"><div><b>${esc(a.nome)}</b><br><small>${esc(a.turma || '')} · ${esc(a.matricula)}</small></div><label>Responsável<input class="control" data-r="${a.id}" maxlength="160"></label><label>E-mail<input class="control" data-e="${a.id}" type="email"></label><label>Telefone<input class="control" data-t="${a.id}" inputmode="tel" placeholder="(83) 90000-0000"></label></div>`).join('')}</div>
    <p class="kpi-note">Os dados do responsável são opcionais agora: servem para preencher o termo e, na próxima etapa, para o envio. Use o mínimo necessário.</p>
    <div class="igp-erro" id="sfE" role="alert" hidden></div><div class="actions dlg-acoes"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button type="submit" class="btn">Criar ${alunos.length} solicitação(ões)</button></div></div>
    <aside class="ui-mf-prev"><h3>Prévia (primeiro aluno)</h3><div id="sfPrev"></div></aside></form>`, { larga: true });
  dlg.el.firstElementChild.classList.add('ui-box');
  const g = id => $('#' + id, dlg.el);
  const previa = async () => { try { g('sfPrev').innerHTML = uiDoc(await post('/imagem/previa', { modelo_id: +g('sfM').value, aluno_id: alunos[0].id, responsavel: $(`[data-r="${alunos[0].id}"]`, dlg.el).value })); } catch (e) { g('sfPrev').innerHTML = `<p class="kpi-note">${esc(e.message)}</p>`; } };
  g('sfM').onchange = previa; $(`[data-r="${alunos[0].id}"]`, dlg.el).onchange = previa; previa();
  $('#uiSF', dlg.el).onsubmit = async ev => {
    ev.preventDefault(); const e = g('sfE'); e.hidden = true;
    const btn = $('button[type=submit]', dlg.el); btn.disabled = true;
    try {
      const r = await post('/imagem/solicitacoes/criar', { modelo_id: +g('sfM').value, alunos: alunos.map(a => ({ id: a.id, responsavel: $(`[data-r="${a.id}"]`, dlg.el).value, email: $(`[data-e="${a.id}"]`, dlg.el).value, telefone: $(`[data-t="${a.id}"]`, dlg.el).value })) });
      dlg.close(); UI.sel.clear();
      if (r.ignoradas.length) await Dlg.confirmar({ titulo: `${r.criadas.length} criada(s), ${r.ignoradas.length} não criada(s)`, texto: r.ignoradas.slice(0, 6).map(x => `${x.aluno}: ${x.motivo}`).join(' · '), confirmar: 'Ver solicitações', cancelar: 'Fechar' }).then(ok => ok && go('uisolic'));
      else { toast(`${r.criadas.length} solicitação(ões) criada(s)`); go('uisolic'); }
    } catch (x) { e.textContent = x.message; e.hidden = false; btn.disabled = false; }
  };
}

const UISOL = { busca: '', status: '', sel: new Set() };
PAGINAS.uisolic = async function () {
  $('#content').innerHTML = `<div class="ig-barra"><input id="usBusca" class="control" type="search" placeholder="Buscar por aluno, matrícula ou protocolo" aria-label="Buscar solicitação" value="${attr(UISOL.busca)}"><select id="usSt" class="control" aria-label="Situação"><option value="">Todas as situações</option>${Object.entries(UI_STATUS).map(([k, [t]]) => `<option value="${k}" ${UISOL.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select><span class="cm-esp"></span><button type="button" class="btn soft" id="usLemb" disabled>Preparar lembretes</button><button type="button" class="btn" id="usLote" disabled>Baixar PDF dos marcados</button></div><div class="ui-chips" id="usChips"></div><div id="usLista"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
  let rows = [], atraso = 0;
  const lote = () => { $('#usLemb').disabled = !UISOL.sel.size; const b = $('#usLote'); b.disabled = !UISOL.sel.size; b.textContent = UISOL.sel.size ? `Baixar PDF dos ${UISOL.sel.size} marcados` : 'Baixar PDF dos marcados'; };
  const carrega = async () => {
    rows = (await api('/imagem/solicitacoes?' + new URLSearchParams({ busca: UISOL.busca, status: UISOL.status }))).rows;
    const cont = (await api('/imagem/relatorio')).resumo.porStatus;
    $('#usChips').innerHTML = [['', 'Todas', Object.values(cont).reduce((a, n) => a + n, 0)], ...Object.entries(UI_STATUS).map(([k, [t]]) => [k, t, cont[k] || 0]).filter(x => x[2])].map(([k, t, n]) => `<button type="button" class="ui-chip ${UISOL.status === k ? 'on' : ''}" data-chip="${k}">${esc(t)} <b>${n}</b></button>`).join('');
    $$('[data-chip]').forEach(b => { b.onclick = () => { UISOL.status = b.dataset.chip; $('#usSt').value = UISOL.status; carrega(); }; });
    $('#usLista').innerHTML = rows.length ? `<div class="tablewrap"><table class="datatable ui-tab"><thead><tr><th class="ui-ck"></th><th>Protocolo</th><th>Aluno</th><th>Turma</th><th>Modelo</th><th>Situação</th><th>Criada em</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td class="ui-ck"><input type="checkbox" data-m="${r.id}" aria-label="Marcar ${attr(r.protocolo)}" ${UISOL.sel.has(r.id) ? 'checked' : ''}></td><td>${esc(r.protocolo)}</td><td class="titlecell"><b>${esc(r.aluno)}</b><br><small>${esc(r.matricula)}</small></td><td>${esc(r.turma || '—')}</td><td>${esc(r.modelo)} <small>v${r.versao}</small></td><td>${uiBadge(r.status)}</td><td>${esc(fmtDateTime(r.criadoEm))}</td><td class="acoes-cel">${['CANCELADO', 'AUTORIZADO', 'NAO_AUTORIZADO', 'VENCIDO', 'REVOGADO', 'ERRO'].includes(r.status) ? '' : `<button type="button" class="btn" data-link="${r.id}">Link de envio</button>`}${r.status === 'AGUARDANDO_VALIDACAO' ? `<button type="button" class="btn" data-det="${r.id}">Validar</button>` : `<button type="button" class="btn soft" data-det="${r.id}">Detalhes</button>`}<button type="button" class="btn soft" data-pdf="${r.id}">PDF</button>${['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA'].includes(r.status) ? `<button type="button" class="btn soft" data-cx="${r.id}">Cancelar</button>` : ''}</td></tr>`).join('')}</tbody></table></div><p class="kpi-note">O sistema não envia nada sozinho: gere o link, copie a mensagem e envie por WhatsApp ou e-mail. O código de acesso deve ir por outro meio. O PDF serve para impressão e assinatura presencial.</p>`
      : '<div class="empty-rich"><strong>Nenhuma solicitação</strong><p>Marque os alunos em Alunos e use “Criar solicitações”.</p></div>';
    $$('[data-m]').forEach(c => { c.onchange = () => { const id = +c.dataset.m; if (c.checked) UISOL.sel.add(id); else UISOL.sel.delete(id); lote(); }; });
    $$('[data-pdf]').forEach(b => { b.onclick = () => uiBaixarPdf([+b.dataset.pdf]); });
    $$('[data-link]').forEach(b => { b.onclick = () => uiLink(rows.find(x => x.id === +b.dataset.link), carrega); });
    $$('[data-det]').forEach(b => { b.onclick = () => uiDetalhe(+b.dataset.det, carrega); });
    $$('[data-cx]').forEach(b => { b.onclick = () => uiCancelar(rows.find(x => x.id === +b.dataset.cx), carrega); });
    lote();
  };
  $('#usBusca').oninput = e => { clearTimeout(atraso); atraso = setTimeout(() => { UISOL.busca = e.target.value; carrega(); }, 250); };
  $('#usSt').onchange = e => { UISOL.status = e.target.value; carrega(); };
  $('#usLote').onclick = () => uiBaixarPdf([...UISOL.sel]);
  $('#usLemb').onclick = () => uiLembretes([...UISOL.sel], carrega);
  await carrega();
};

const uiCopiar = async (texto, ok) => { try { await navigator.clipboard.writeText(texto); toast(ok); } catch { const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast(ok); } catch { toast('Não foi possível copiar. Selecione e copie à mão.', 'warn'); } t.remove(); } };

/* ---- link de envio: gera o link único e o código; quem envia é uma pessoa ---- */
async function uiLink(r, recarrega) {
  if (r.status !== 'AGUARDANDO_ENVIO' && !await Dlg.confirmar({ titulo: 'Gerar um novo link', texto: 'O link e o código anteriores deixam de valer. Use quando o responsável perdeu o link ou o acesso foi bloqueado.', confirmar: 'Gerar novo link' })) return;
  let k; try { k = await post('/imagem/solicitacoes/link', { id: r.id, dias: 15 }); } catch (e) { return toast(e.message, 'bad'); }
  const tel = String(k.telefone || '').replace(/\D/g, ''), wa = tel ? `https://wa.me/${tel.length <= 11 ? '55' + tel : tel}?text=${encodeURIComponent(k.mensagem)}` : '';
  const mail = k.email ? `mailto:${encodeURIComponent(k.email)}?subject=${encodeURIComponent('Autorização de uso de imagem - Colégio Evolução')}&body=${encodeURIComponent(k.mensagem)}` : '';
  const d = dialogo(`<h3>Link de envio · ${esc(r.aluno)}</h3><p class="ui-aviso">O EVO MKT <b>não envia nada sozinho</b>. Copie e envie você mesmo. O link e o código aparecem só agora; se perder, gere outro.</p>
    <label class="ui-campo">Link seguro (vale até ${esc(fmtDate(k.expiraEm.slice(0, 10)))})<div class="ui-copia"><input class="control" readonly value="${attr(k.link)}" id="lkL"><button type="button" class="btn soft" id="lkCl">Copiar link</button></div></label>
    <label class="ui-campo">Código de acesso (envie por outro meio: telefone ou mensagem separada)<div class="ui-copia"><input class="control ui-cod" readonly value="${attr(k.codigo)}"><button type="button" class="btn soft" id="lkCc">Copiar código</button></div></label>
    <label class="ui-campo">Mensagem pronta<textarea class="control" rows="5" readonly id="lkM">${esc(k.mensagem)}</textarea></label><div class="actions"><button type="button" class="btn soft" id="lkCm">Copiar mensagem</button>${wa ? `<a class="btn soft" href="${attr(wa)}" target="_blank" rel="noopener noreferrer">Abrir no WhatsApp</a>` : ''}${mail ? `<a class="btn soft" href="${attr(mail)}">Abrir no e-mail</a>` : ''}</div>
    <hr><label class="ui-campo">Depois de enviar, marque como enviado (opcional)<select class="control" id="lkCanal"><option value="whatsapp">Enviei por WhatsApp</option><option value="email">Enviei por e-mail</option><option value="presencial">Entreguei pessoalmente</option><option value="outro">Outro meio</option></select></label>
    <div class="actions dlg-acoes"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Fechar</button>${r.status === 'AGUARDANDO_ENVIO' ? '<button type="button" class="btn" id="lkEnv">Marcar como enviado</button>' : ''}</div>`, { larga: true });
  d.el.firstElementChild.classList.add('ui-box');
  $('#lkCl', d.el).onclick = () => uiCopiar(k.link, 'Link copiado'); $('#lkCc', d.el).onclick = () => uiCopiar(k.codigo, 'Código copiado'); $('#lkCm', d.el).onclick = () => uiCopiar(k.mensagem, 'Mensagem copiada');
  const env = $('#lkEnv', d.el); if (env) env.onclick = async () => { try { await post('/imagem/solicitacoes/enviado', { id: r.id, canal: $('#lkCanal', d.el).value }); toast('Marcado como enviado'); d.close(); recarrega(); } catch (e) { toast(e.message, 'bad'); } };
  d.el.addEventListener('click', e => { if (e.target.closest('[data-close]')) recarrega(); });
}

const UI_ACAO = { vencido: 'Vencido (prazo terminou)', revogado: 'Autorização revogada', lembrete: 'Lembrete preparado', criada: 'Solicitação criada', 'link-gerado': 'Link gerado', enviado: 'Marcada como enviada', aberto: 'Link aberto pelo responsável', 'autorizo-escolhido': 'Responsável escolheu autorizar', autorizado: 'Autorizado', 'nao-autorizado': 'Não autorizado', 'govbr-enviado': 'PDF GOV.BR enviado', validado: 'Assinatura GOV.BR validada', 'arquivo-recusado': 'PDF GOV.BR recusado', cancelada: 'Cancelada', 'pdf-baixado': 'PDF baixado', 'arquivo-baixado': 'Arquivo baixado' };
const UI_ARQ = { govbr: 'PDF assinado no GOV.BR', final: 'Documento final', assinatura: 'Imagem da assinatura desenhada' };
async function uiDetalhe(id, recarrega) {
  let d; try { d = await api('/imagem/solicitacoes/detalhe?id=' + id); } catch (e) { return toast(e.message, 'bad'); }
  const s = d.solicitacao, valida = s.status === 'AGUARDANDO_VALIDACAO';
  const dlg = dialogo(`<h3>${esc(s.protocolo)} · ${esc(s.aluno)}</h3><p>${uiBadge(s.status)} <span class="kpi-note">${esc(s.modelo)} v${s.versao}</span></p>
    <dl class="dc-dl"><dt>Responsável</dt><dd>${esc(s.respConfirmado || s.responsavel || '—')}${s.parentesco ? ' (' + esc(s.parentesco) + ')' : ''}</dd><dt>Decisão</dt><dd>${s.decisao === 'AUTORIZO' ? 'Autoriza' : s.decisao === 'NAO_AUTORIZO' ? 'Não autoriza' : '—'}</dd><dt>Assinatura</dt><dd>${s.modalidade === 'GOVBR' ? 'GOV.BR' : s.modalidade === 'DESENHADA' ? 'Desenhada na tela' : '—'}</dd><dt>Link</dt><dd>${d.acesso ? (d.acesso.ativo ? 'ativo' : 'expirado, bloqueado ou substituído') + (d.acesso.ultimoAcesso ? ' · último acesso ' + esc(fmtDateTime(d.acesso.ultimoAcesso)) : '') : 'ainda não gerado'}</dd>${s.validadoPor ? `<dt>Validação</dt><dd>${esc(s.validadoPor)} em ${esc(fmtDateTime(s.validadoEm))}${s.validacaoObs ? ' — ' + esc(s.validacaoObs) : ''}</dd>` : ''}<dt>Hash do termo</dt><dd><small>${esc(s.termoHash)}</small></dd></dl>
    ${d.arquivos.length ? `<h4>Arquivos</h4><ul class="ui-arqs">${d.arquivos.map(a => `<li><a href="${API}/imagem/solicitacoes/arquivo?id=${id}&tipo=${a.tipo}" download>${esc(UI_ARQ[a.tipo] || a.tipo)}</a> <small>${esc(fmtDateTime(a.criado_em))} · ${fmtN(a.tamanho)} bytes · SHA-256 ${esc(a.sha256.slice(0, 12))}… ${a.info ? '· ' + esc(a.info) : ''}</small></li>`).join('')}</ul>` : ''}
    ${valida ? `<section class="ui-valida"><h4>Validar a assinatura do GOV.BR</h4><ol><li>Baixe o PDF assinado acima.</li><li>Abra <a href="https://validar.iti.gov.br/" target="_blank" rel="noopener noreferrer">validar.iti.gov.br</a>, envie o arquivo e confira se a assinatura é válida e se o nome é do responsável.</li><li>Registre aqui o resultado. O aluno só passa a <b>Autorizado</b> depois disso.</li></ol>
      <label class="ui-campo">Observação<input class="control" id="vObs" maxlength="400" placeholder="Ex.: assinatura válida, titular confere"></label><label class="check-row"><input type="checkbox" id="vOk"> Conferi a assinatura em validar.iti.gov.br e o documento corresponde ao termo.</label>
      <div class="igp-erro" id="vE" role="alert" hidden></div><div class="actions"><button type="button" class="btn" id="vSim">Assinatura válida: autorizar</button><button type="button" class="btn danger-soft" id="vNao">Recusar arquivo</button></div></section>` : ''}
    <h4>Histórico</h4><ul class="ui-hist">${d.eventos.map(e => `<li><b>${esc(UI_ACAO[e.acao] || e.acao)}</b> <small>${esc(fmtDateTime(e.quando))} · ${esc(e.ator)}${e.detalhe ? ' · ' + esc(e.detalhe) : ''}</small></li>`).join('')}</ul>
    <div class="actions dlg-acoes">${s.status === 'AUTORIZADO' ? '<button type="button" class="btn danger-soft" id="dRev">Revogar autorização</button>' : ''}<span class="cm-esp"></span><button type="button" class="btn" data-close>Fechar</button></div>`, { larga: true });
  dlg.el.firstElementChild.classList.add('ui-box');
  const rvb = $('#dRev', dlg.el); if (rvb) rvb.onclick = () => { dlg.close(); uiRevogar({ id, protocolo: s.protocolo }, recarrega); };
  const enviar = async resultado => {
    const e = $('#vE', dlg.el); e.hidden = true;
    try { await post('/imagem/solicitacoes/validar', { id, resultado, obs: $('#vObs', dlg.el).value, conferido_no_validar: $('#vOk', dlg.el).checked }); toast(resultado === 'VALIDO' ? 'Autorizado' : 'Arquivo recusado; o responsável será avisado ao abrir o link'); dlg.close(); recarrega(); } catch (x) { e.textContent = x.message; e.hidden = false; }
  };
  const si = $('#vSim', dlg.el); if (si) { si.onclick = () => enviar('VALIDO'); $('#vNao', dlg.el).onclick = () => enviar('INVALIDO'); }
}

/* ---- cancelar (com motivo quando o link já foi enviado) ---- */
function uiCancelar(r, recarrega) {
  const exige = r.status !== 'AGUARDANDO_ENVIO';
  const d = dialogo(`<form id="cxF" novalidate><h3>Cancelar solicitação ${esc(r.protocolo)}</h3><p class="kpi-note">${exige ? 'O link já foi enviado: ele deixa de funcionar. ' : ''}A solicitação fica registrada como cancelada; nada é apagado.</p>
    <label class="ui-campo">Motivo${exige ? '' : ' (opcional)'}<input class="control" id="cxM" maxlength="400"></label><div class="igp-erro" id="cxE" role="alert" hidden></div>
    <div class="actions dlg-acoes"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Voltar</button><button type="submit" class="btn danger">Cancelar solicitação</button></div></form>`);
  $('#cxF', d.el).onsubmit = async ev => { ev.preventDefault(); try { await post('/imagem/solicitacoes/cancelar', { id: r.id, motivo: $('#cxM', d.el).value }); toast('Solicitação cancelada'); d.close(); recarrega(); } catch (e) { const x = $('#cxE', d.el); x.textContent = e.message; x.hidden = false; } };
}

/* ---- lembretes moderados: o sistema prepara o texto; quem envia é uma pessoa ---- */
async function uiLembretes(ids, recarrega) {
  let r; try { r = await post('/imagem/solicitacoes/lembrete', { ids }); } catch (e) { return toast(e.message, 'bad'); }
  const d = dialogo(`<h3>Lembretes</h3><p class="kpi-note">O EVO MKT não envia nada sozinho. Copie cada mensagem e envie por WhatsApp ou e-mail. Há um intervalo mínimo e um máximo de ${r.max} lembrete(s) por solicitação.</p>
    ${r.lembretes.length ? `<ul class="ui-lemb">${r.lembretes.map(l => `<li><b>${esc(l.aluno)}</b> <small>lembrete ${l.numero} de ${r.max} · ${esc(l.protocolo)}</small><div class="ui-copia"><textarea class="control" rows="3" readonly>${esc(l.mensagem)}</textarea></div><div class="actions"><button type="button" class="btn soft" data-cp="${l.id}">Copiar mensagem</button>${l.telefone ? `<a class="btn soft" target="_blank" rel="noopener noreferrer" href="https://wa.me/${String(l.telefone).length <= 11 ? '55' : ''}${esc(l.telefone)}?text=${encodeURIComponent(l.mensagem)}">WhatsApp</a>` : ''}${l.email ? `<a class="btn soft" href="mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent('Lembrete: autorização de uso de imagem')}&body=${encodeURIComponent(l.mensagem)}">E-mail</a>` : ''}</div></li>`).join('')}</ul>` : '<p class="kpi-note">Nenhum lembrete foi preparado.</p>'}
    ${r.ignoradas.length ? `<h4>Não preparados</h4><ul class="ui-erros">${r.ignoradas.map(x => `<li><b>${esc(x.aluno)}</b>: ${esc(x.motivo)}</li>`).join('')}</ul>` : ''}
    <div class="actions dlg-acoes"><span class="cm-esp"></span><button type="button" class="btn" data-close>Fechar</button></div>`, { larga: true });
  d.el.firstElementChild.classList.add('ui-box');
  $$('[data-cp]', d.el).forEach(b => { b.onclick = () => uiCopiar(r.lembretes.find(x => x.id === +b.dataset.cp).mensagem, 'Mensagem copiada'); });
  d.el.addEventListener('click', e => { if (e.target.closest('[data-close]')) recarrega(); });
}

/* ---- revogar uma autorização em vigor ---- */
function uiRevogar(s, aoFim) {
  const d = dialogo(`<form id="rvF" novalidate><h3>Revogar autorização ${esc(s.protocolo)}</h3><p class="kpi-note">A autorização passa a <b>Revogada</b> e o aluno entra na lista de “não usar a imagem”. As provas (documento, assinatura, histórico) continuam guardadas.</p>
    <label class="ui-campo">Quem pediu e por quê<input class="control" id="rvM" maxlength="400" placeholder="Ex.: mãe pediu por telefone em 20/11"></label><div class="igp-erro" id="rvE" role="alert" hidden></div>
    <div class="actions dlg-acoes"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Voltar</button><button type="submit" class="btn danger">Revogar autorização</button></div></form>`);
  $('#rvF', d.el).onsubmit = async ev => { ev.preventDefault(); try { await post('/imagem/solicitacoes/revogar', { id: s.id, motivo: $('#rvM', d.el).value }); toast('Autorização revogada'); d.close(); aoFim(); } catch (e) { const x = $('#rvE', d.el); x.textContent = e.message; x.hidden = false; } };
}

/* ---- ficha do aluno ---- */
async function uiFicha(id) {
  let f; try { f = await api('/imagem/alunos/ficha?id=' + id); } catch (e) { return toast(e.message, 'bad'); }
  const a = f.aluno, atual = f.solicitacoes.find(s => s.status !== 'CANCELADO');
  const d = dialogo(`<h3>${esc(a.nome)}</h3><p class="kpi-note">Matrícula ${esc(a.matricula)} · ${esc(a.turma || 'sem turma')}${a.ativo ? '' : ' · inativo'}</p>
    <p>Situação atual: ${uiBadge(atual ? atual.status : '')} ${atual && ['NAO_AUTORIZADO', 'VENCIDO', 'REVOGADO'].includes(atual.status) ? '<b class="ui-ruim">Não usar a imagem deste aluno.</b>' : ''}</p>
    ${f.solicitacoes.length ? f.solicitacoes.map(s => `<section class="card ui-ficha"><div class="db-tit"><h2>${esc(s.protocolo)}</h2>${uiBadge(s.status)}</div>
      <dl class="dc-dl"><dt>Modelo</dt><dd>${esc(s.modelo)} (v${s.versao})</dd><dt>Responsável</dt><dd>${esc(s.responsavel || '—')}${s.parentesco ? ' (' + esc(s.parentesco) + ')' : ''}</dd><dt>Decisão</dt><dd>${s.decisao === 'AUTORIZO' ? 'Autoriza' : s.decisao === 'NAO_AUTORIZO' ? 'Não autoriza' : '—'}${s.decisaoEm ? ' em ' + esc(fmtDateTime(s.decisaoEm)) : ''}</dd><dt>Assinatura</dt><dd>${s.modalidade === 'GOVBR' ? 'GOV.BR' : s.modalidade === 'DESENHADA' ? 'Desenhada na tela' : '—'}${s.validadoPor ? ' · validada por ' + esc(s.validadoPor) : ''}</dd><dt>Prazo</dt><dd>${s.venceEm ? 'até ' + esc(fmtDate(s.venceEm)) : 'indeterminado'}</dd>${s.status === 'REVOGADO' ? `<dt>Revogação</dt><dd>${esc(fmtDateTime(s.revogadoEm))} · ${esc(s.revogadoPor)} — ${esc(s.revogadoMotivo)}</dd>` : ''}<dt>Hash do termo</dt><dd><small>${esc(s.termoHash)}</small></dd></dl>
      ${s.arquivos.length ? `<ul class="ui-arqs">${s.arquivos.map(x => `<li><a href="${API}/imagem/solicitacoes/arquivo?id=${s.id}&tipo=${x.tipo}" download>${esc(UI_ARQ[x.tipo] || x.tipo)}</a> <small>SHA-256 ${esc(x.sha256.slice(0, 12))}…</small></li>`).join('')}</ul>` : ''}
      <details><summary>Histórico (${s.eventos.length})</summary><ul class="ui-hist">${s.eventos.map(e => `<li><b>${esc(UI_ACAO[e.acao] || e.acao)}</b> <small>${esc(fmtDateTime(e.quando))} · ${esc(e.ator)}${e.detalhe ? ' · ' + esc(e.detalhe) : ''}</small></li>`).join('')}</ul></details>
      ${s.status === 'AUTORIZADO' ? `<div class="actions"><button type="button" class="btn danger-soft" data-rv="${s.id}">Revogar autorização</button></div>` : ''}</section>`).join('') : '<p class="kpi-note">Este aluno ainda não tem solicitações.</p>'}
    <div class="actions dlg-acoes"><a class="btn soft" href="${API}/imagem/alunos/ficha.pdf?id=${id}" download>Exportar ficha (PDF)</a><span class="cm-esp"></span><button type="button" class="btn" data-close>Fechar</button></div>`, { larga: true });
  d.el.firstElementChild.classList.add('ui-box');
  $$('[data-rv]', d.el).forEach(b => { b.onclick = () => { d.close(); uiRevogar(f.solicitacoes.find(x => x.id === +b.dataset.rv), () => uiFicha(id)); }; });
}

/* ---- relatórios ---- */
const UIREL = { segmento: '', turma: '', status: '', de: '', ate: '' };
PAGINAS.uirelat = async function () {
  const qs = () => new URLSearchParams(Object.entries(UIREL).filter(([, v]) => v)).toString();
  const al = await api('/imagem/alunos'), md = await api('/imagem/modelos');
  $('#content').innerHTML = `<div class="ig-barra"><select id="rSeg" class="control" aria-label="Segmento"><option value="">Todos os segmentos</option>${al.segmentos.map(s => `<option value="${s.k}" ${UIREL.segmento === s.k ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select><select id="rTur" class="control" aria-label="Turma"><option value="">Todas as turmas</option>${al.turmas.map(t => `<option ${UIREL.turma === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><select id="rSt" class="control" aria-label="Situação"><option value="">Todas as situações</option>${Object.entries(UI_STATUS).map(([k, [t]]) => `<option value="${k}" ${UIREL.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select><label class="ui-campo ui-dt">De<input type="date" id="rDe" class="control" value="${attr(UIREL.de)}"></label><label class="ui-campo ui-dt">Até<input type="date" id="rAte" class="control" value="${attr(UIREL.ate)}"></label><span class="cm-esp"></span><a class="btn soft" id="rXls" download>Baixar Excel</a><a class="btn" id="rPdf" download>Baixar PDF</a></div><div id="rCorpo"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
  void md;
  const carrega = async () => {
    const d = await api('/imagem/relatorio?' + qs());
    $('#rXls').href = `${API}/imagem/relatorio.xlsx?${qs()}`; $('#rPdf').href = `${API}/imagem/relatorio.pdf?${qs()}`;
    const n = k => d.resumo.porStatus[k] || 0, pend = ['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_VALIDACAO'].reduce((a, k) => a + n(k), 0);
    const tabela = (m, tit) => `<section class="card"><div class="db-tit"><h2>${tit}</h2></div><div class="tablewrap"><table class="datatable"><thead><tr><th>${tit === 'Por segmento' ? 'Segmento' : 'Turma'}</th><th>Autorizado</th><th>Não autoriz.</th><th>Pendente</th><th>Vencido/Revog.</th></tr></thead><tbody>${Object.entries(m).map(([k, v]) => `<tr><td>${esc(tit === 'Por segmento' ? ({ INFANTIL: 'Educação Infantil', FUND1: 'Anos Iniciais', FUND2: 'Anos Finais', MEDIO: 'Ensino Médio', '': 'Sem segmento' }[k] ?? k) : k)}</td><td>${v.AUTORIZADO || 0}</td><td>${v.NAO_AUTORIZADO || 0}</td><td>${['AGUARDANDO_ENVIO', 'ENVIADO', 'ABERTO', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_VALIDACAO'].reduce((a, s) => a + (v[s] || 0), 0)}</td><td>${(v.VENCIDO || 0) + (v.REVOGADO || 0)}</td></tr>`).join('')}</tbody></table></div></section>`;
    $('#rCorpo').innerHTML = `<div class="db-cartoes"><div class="db-cartao ui-cartao"><small>Solicitações</small><strong>${d.resumo.total}</strong></div><div class="db-cartao ui-cartao"><small>Alunos</small><strong>${d.resumo.alunos}</strong></div><div class="db-cartao ui-cartao ok"><small>Autorizadas</small><strong>${n('AUTORIZADO')}</strong></div><div class="db-cartao ui-cartao"><small>Pendentes</small><strong>${pend}</strong></div></div>
      <div class="ui-rel2">${tabela(d.porSegmento, 'Por segmento')}${tabela(d.porTurma, 'Por turma')}</div>
      <section class="card"><div class="db-tit"><h2>Solicitações</h2></div>${d.linhas.length ? `<div class="tablewrap"><table class="datatable ui-tab"><thead><tr><th>Aluno</th><th>Turma</th><th>Modelo</th><th>Situação</th><th>Solicitada</th><th>Vence</th></tr></thead><tbody>${d.linhas.map(r => `<tr><td class="titlecell"><b>${esc(r.aluno)}</b></td><td>${esc(r.turma || '—')}</td><td>${esc(r.modelo)} <small>v${r.versao}</small></td><td>${uiBadge(r.status)}</td><td>${esc(fmtDate(String(r.criadoEm).slice(0, 10)))}</td><td>${r.venceEm ? esc(fmtDate(r.venceEm)) : '—'}</td></tr>`).join('')}</tbody></table></div>${d.truncado ? '<p class="kpi-note">Mostrando as 500 primeiras linhas. O PDF e o Excel trazem tudo.</p>' : ''}` : '<div class="empty-rich"><strong>Nada neste recorte</strong><p>Mude os filtros.</p></div>'}</section>`;
  };
  const liga = (id, k) => { $(id).onchange = e => { UIREL[k] = e.target.value; carrega(); }; };
  liga('#rSeg', 'segmento'); liga('#rTur', 'turma'); liga('#rSt', 'status'); liga('#rDe', 'de'); liga('#rAte', 'ate');
  await carrega();
};

/* ---- ajustes do módulo (só o Administrador altera) ---- */
PAGINAS.uiconfig = async function () {
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  const { config: c, podeEditar, retencao } = await api('/imagem/config');
  const dis = podeEditar ? '' : 'disabled';
  const num = (id, rot, v, min, max, ajuda) => `<label class="ui-campo">${rot}<input type="number" class="control" id="${id}" min="${min}" max="${max}" value="${v}" ${dis}>${ajuda ? `<small class="kpi-note">${ajuda}</small>` : ''}</label>`;
  $('#content').innerHTML = `<p class="kpi-note">${podeEditar ? 'Você é Administrador: pode alterar estes ajustes.' : 'Só o Administrador altera estes ajustes. Você pode consultá-los.'}</p>
    <form id="cfF" class="ui-cfg" novalidate><section class="card"><div class="db-tit"><h2>Prazos e lembretes</h2></div>${num('cLink', 'Validade do link (dias)', c.linkDias, 1, 60, 'Depois disso o link expira e é preciso gerar outro.')}${num('cInt', 'Intervalo mínimo entre lembretes (dias)', c.lembreteIntervaloDias, 1, 30)}${num('cMax', 'Máximo de lembretes por solicitação', c.lembreteMax, 0, 10, 'Evita insistir demais com a mesma família.')}${num('cVenc', 'Avisar vencimentos com antecedência de (dias)', c.avisoVencimentoDias, 1, 365, 'Aparece no Painel.')}</section>
    <section class="card"><div class="db-tit"><h2>Retenção e documentos substituídos</h2></div>${num('cRet', 'Guardar registros encerrados por (anos)', c.retencaoAnos, 1, 30, `Hoje há ${retencao.elegiveisParaRevisao} registro(s) encerrado(s) além desse prazo, elegíveis para revisão. O sistema <b>não apaga nada sozinho</b>: a exclusão é decisão humana, com backup.`)}<label class="check-row"><input type="checkbox" id="cBloq" ${c.bloquearVersaoAntiga ? 'checked' : ''} ${dis}> Bloquear respostas a termos de versão antiga</label><small class="kpi-note">Se o modelo mudar, solicitações ainda não respondidas deixam de valer e precisam ser recriadas.</small></section>
    <section class="card"><div class="db-tit"><h2>Permissões e canais</h2></div><label class="ui-campo">Quem pode validar assinaturas do GOV.BR<select class="control" id="cVal" ${dis}><option value="equipe" ${c.quemValida === 'equipe' ? 'selected' : ''}>Toda a equipe de Marketing</option><option value="admin" ${c.quemValida === 'admin' ? 'selected' : ''}>Só o Administrador</option></select></label><label class="ui-campo">Quem pode revogar autorizações<select class="control" id="cRev" ${dis}><option value="equipe" ${c.quemRevoga === 'equipe' ? 'selected' : ''}>Toda a equipe de Marketing</option><option value="admin" ${c.quemRevoga === 'admin' ? 'selected' : ''}>Só o Administrador</option></select></label>
      <fieldset class="ui-campo"><legend>Atalhos de envio oferecidos</legend><label class="check-row"><input type="checkbox" name="cCan" value="whatsapp" ${c.canais.includes('whatsapp') ? 'checked' : ''} ${dis}> WhatsApp (abre o aplicativo; você envia)</label><label class="check-row"><input type="checkbox" name="cCan" value="email" ${c.canais.includes('email') ? 'checked' : ''} ${dis}> E-mail (abre o seu programa de e-mail; você envia)</label></fieldset></section>
    <section class="card"><div class="db-tit"><h2>Mensagens</h2></div><label class="ui-campo">Mensagem de envio<textarea class="control" id="cME" rows="5" ${dis}>${esc(c.mensagemEnvio)}</textarea><small class="kpi-note">Marcadores: {aluno} {link} {validade} {protocolo}. O {link} é obrigatório.</small></label><label class="ui-campo">Mensagem de lembrete<textarea class="control" id="cML" rows="4" ${dis}>${esc(c.mensagemLembrete)}</textarea><small class="kpi-note">Marcadores: {aluno} {protocolo}.</small></label></section>
    <div class="igp-erro" id="cfE" role="alert" hidden></div>${podeEditar ? '<div class="actions"><button type="submit" class="btn">Salvar ajustes</button></div>' : ''}</form>`;
  const f = $('#cfF'); if (!podeEditar) return;
  f.onsubmit = async ev => {
    ev.preventDefault(); const e = $('#cfE'); e.hidden = true;
    try { await post('/imagem/config', { linkDias: +$('#cLink').value, lembreteIntervaloDias: +$('#cInt').value, lembreteMax: +$('#cMax').value, avisoVencimentoDias: +$('#cVenc').value, retencaoAnos: +$('#cRet').value, bloquearVersaoAntiga: $('#cBloq').checked, quemValida: $('#cVal').value, quemRevoga: $('#cRev').value, canais: $$('[name=cCan]:checked').map(x => x.value), mensagemEnvio: $('#cME').value, mensagemLembrete: $('#cML').value }); toast('Ajustes salvos'); } catch (x) { e.textContent = x.message; e.hidden = false; }
  };
};
