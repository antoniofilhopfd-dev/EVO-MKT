/* Calendário: uma tela só, com camadas. Cada item mostra de onde vem.
   Camadas: Publicações · Planejamento editorial · Calendário escolar · Datas comemorativas · Feriados · Google Agenda.
   Nada é copiado: abrir ou arrastar um item altera o registro da sua origem. */
const CAL_TIPOS = [
  { k: 'PUBLICACAO', rotulo: 'Publicações', glifo: '✎', fonte: 'Publicação do EVO MKT (Instagram › Conteúdos)' },
  { k: 'EDITORIAL', rotulo: 'Planejamento editorial', glifo: '◆', classe: 't-PLANO', fonte: 'Campanha editorial (Instagram › Planejamento)' },
  { k: 'ESCOLAR', rotulo: 'Calendário escolar', glifo: '★', classe: 't-ESCOLAR', fonte: 'Calendário escolar do Colégio' },
  { k: 'DATA', rotulo: 'Datas comemorativas', glifo: '✿', classe: 't-DATA', fonte: 'Datas comemorativas (catálogo e cadastradas pela equipe)' },
  { k: 'FERIADO', rotulo: 'Feriados', glifo: '⚐', classe: 't-FERIADO', fonte: 'Feriados (catálogo)' },
  { k: 'GOOGLE', rotulo: 'Google Agenda', glifo: '▪', classe: 't-COMPROMISSO', fonte: 'Google Agenda (sincronizada)' },
  { k: 'GOOGLEL', rotulo: 'Google Agenda (somente leitura)', glifo: '◌', classe: 't-INTERNA', fonte: 'Agenda do Google marcada como somente leitura (não editável aqui)' },
];
const CAL_ROTULO_TIPO = k => (CAL_TIPOS.find(t => t.k === k) || {}).rotulo || k;
const CAL_TIPOS_COMPROMISSO = ['Reunião', 'Compromisso', 'Cobertura fotográfica', 'Cobertura de vídeo', 'Ação institucional', 'Atividade interna'];
const calSufixo = s => (String(s || '').length > 10 ? String(s).slice(10) : '');

function calDataHora(r) {
  const bruto = String(r.inicioEm || r.dataInicio || ''), data = bruto.slice(0, 10);
  let hora = bruto.length > 10 ? bruto.slice(11, 16) : '';
  if (hora === '00:00' || String(r.diaInteiro || '').toLowerCase().startsWith('s')) hora = '';
  return [data, hora];
}
const calPubCabe = (r, f) => {
  if (f.perfil && !['Ambos', f.perfil].includes(r.perfil)) return false;
  if (f.segmento) { const nome = (SEG_LISTA.find(s => s[0] === f.segmento) || [, ''])[1]; if (r.segmento && r.segmento !== nome && r.segmento !== 'Todos') return false; if (!r.segmento) return false; }
  if (f.formato && String(r.formato || '').toLowerCase() !== f.formato.toLowerCase()) return false;
  if (f.campanha && String(r.campanhaId || '') !== f.campanha) return false;
  return true;
};

/** Reúne as camadas; uma que falhar não derruba as outras. */
async function calCarregar(ano) {
  const f = Filtros.get();
  const [pubs, camp, esc_, dc, cal, equipe, gl] = await Promise.allSettled([getRows('conteudos', true), getRows('campanhas', true), escCarregar(), dcCarregar(ano), getRows('calendario', true), api('/team'), api(`/integrations/google/eventos-leitura?de=${ano}-01-01&ate=${ano}-12-31`)]);
  const itens = [];
  if (pubs.status === 'fulfilled') (pubs.value.rows || []).forEach(r => {
    const v = String(r.publicacaoEm || ''); if (!v || /ARQUIV/i.test(r.status || '') || !calPubCabe(r, f)) return;
    itens.push({ uid: 'pub:' + r.id, id: r.id, origem: 'pub', titulo: r.titulo || '(sem título)', data: v.slice(0, 10), hora: v.length > 10 ? v.slice(11, 16) : '', tipo: 'PUBLICACAO', responsavel: r.responsavel || '', editavel: !/PUBLICADO/i.test(r.status || ''), feito: /PUBLICADO/i.test(r.status || ''), raw: r });
  });
  if (camp.status === 'fulfilled') (camp.value.rows || []).forEach(r => {
    const ini = String(r.dataInicio || '').slice(0, 10); if (!ini || /ARQUIV|CANCEL/i.test(r.status || '')) return;
    if (f.campanha && String(r.id) !== f.campanha) return;
    const fim = String(r.prazo || '').slice(0, 10);
    itens.push({ uid: 'camp:' + r.id, id: r.id, origem: 'camp', titulo: r.titulo || '(campanha)', data: ini, fim: fim > ini ? fim : '', hora: '', tipo: 'EDITORIAL', responsavel: r.responsavel || '', editavel: false, raw: r });
  });
  if (esc_.status === 'fulfilled') esc_.value.itens.forEach(i => {
    if (f.segmento && !i.segmentos.includes(f.segmento) && !i.segmentos.includes('TODOS')) return;
    itens.push({ ...i, origem: 'esc', tipoOrigem: i.tipo, tipo: 'ESCOLAR' });
  });
  if (dc.status === 'fulfilled') dc.value.itens.forEach(i => {
    const r = i.raw, feriado = DC.grupoFeriados.includes(r.categoria);
    if (r.status === 'pendente' || !(feriado || r.relevante === 'SIM')) return; // o calendário mostra o que a equipe confirmou e marcou como relevante
    itens.push({ ...i, origem: 'dc', tipoOrigem: i.tipo, tipo: feriado ? 'FERIADO' : 'DATA', editavel: false });
  });
  if (cal.status === 'fulfilled') (cal.value.rows || []).forEach(r => {
    const [data, hora] = calDataHora(r); if (!data || /CANCEL/i.test(r.status || '')) return;
    const fim = String(r.dataFim || r.fimEm || '').slice(0, 10);
    itens.push({ uid: 'cal:' + r.id, id: r.id, origem: 'cal', titulo: r.titulo, data, fim: fim > data ? fim : '', hora, tipo: 'GOOGLE', responsavel: r.responsavel || '', editavel: r.origem !== 'GOOGLE_AGENDA' || r.somenteLeitura !== 'SIM', feito: /REALIZ|CONCLU/i.test(r.status || ''), raw: r });
  });
  if (gl.status === 'fulfilled') (gl.value.rows || []).forEach(e => itens.push({ uid: e.uid, id: e.uid, origem: 'gl', titulo: e.titulo, data: e.data, fim: e.fim || '', hora: e.hora || '', tipo: 'GOOGLEL', responsavel: '', editavel: false, raw: e }));
  const responsaveis = equipe.status === 'fulfilled' ? (equipe.value.rows || []).map(x => x.nome).filter(Boolean) : [];
  return { itens: itens.map(calEncurta), opcoes: { responsaveis }, eu: (esc_.value && esc_.value.eu) || { nome: '', role: '' }, podeEditar: true, falhas: [pubs, camp, esc_, dc, cal].filter(x => x.status === 'rejected').length };
}
/** Evento muito longo aparece só no primeiro dia (e na lista); repetir em todos os dias poluiria o calendário. */
const calEncurta = i => (i.fim && (CalMotor.dataDe(i.fim) - CalMotor.dataDe(i.data)) / 86400000 > 6 ? { ...i, fim: '', periodo: i.data + '→' + i.fim } : i);

function calAbrir(it) {
  if (it.origem === 'pub') return editarPublicacao(it.id);
  if (it.origem === 'camp') { window.IG_ABRIR_CAMPANHA = it.id; return go('igconteudos'); }
  if (it.origem === 'esc') return escAbrir(it);
  if (it.origem === 'dc') return dcAbrir(it);
  if (it.origem === 'gl') return calLeituraDetalhe(it);
  return calCompromissoForm(it);
}
async function calMover(it, nova) {
  if (it.origem === 'esc') return escPost('/escolar/mover', { id: it.id, data: nova });
  if (it.origem === 'pub') { await put(`/data?module=conteudos&id=${encodeURIComponent(it.id)}`, { publicacaoEm: nova + calSufixo(it.raw.publicacaoEm) }); invalidate('conteudos'); return; }
  if (it.origem === 'cal') {
    const r = it.raw, ini = String(r.inicioEm || r.dataInicio || '').slice(0, 10), fim = String(r.fimEm || '').slice(0, 10);
    const patch = { dataInicio: nova, inicioEm: nova + calSufixo(r.inicioEm) };
    const soma = (de, d) => { const x = CalMotor.dataDe(de); x.setDate(x.getDate() + d); return isoDate(x); };
    const dur = (a, b) => Math.round((CalMotor.dataDe(b) - CalMotor.dataDe(a)) / 86400000);
    if (fim) patch.fimEm = soma(nova, Math.max(0, dur(ini, fim))) + calSufixo(r.fimEm);
    if (r.dataFim && String(r.dataFim).slice(0, 10) > ini) patch.dataFim = soma(nova, dur(ini, String(r.dataFim).slice(0, 10)));
    await put(`/data?module=calendario&id=${encodeURIComponent(it.id)}`, patch); invalidate('calendario'); return;
  }
  throw new Error('Este item não é reagendado por aqui (campanhas editoriais mudam em Instagram › Planejamento; datas comemorativas são calculadas pelo sistema).');
}

/** Cria uma publicação a partir de um evento escolar ou de uma data comemorativa; nunca é automático. */
async function calCriarPublicacao(origemTipo, id, data, nome) {
  const titulo = await Dlg.perguntar({ titulo: 'Criar publicação', rotulo: 'Título da publicação', valor: `Publicação: ${nome}`, confirmar: 'Criar publicação', dica: 'Ela nasce como Ideia, com a data e a origem já preenchidas.' });
  if (!titulo) return;
  try {
    const novo = await post(origemTipo === 'escolar' ? '/escolar/publicacao' : '/datacom/publicacao', { id, data, titulo });
    invalidate('conteudos'); toast('Publicação criada'); editarPublicacao(novo.id);
  } catch (e) { toast(e.message, 'warn'); }
}

/** Evento de uma agenda do Google marcada como somente leitura: só consulta. */
function calLeituraDetalhe(it) {
  const e = it.raw;
  dialogo(`<h3>${esc(e.titulo)}</h3><p class="kpi-note">Fonte: ${esc(e.agenda)} (Google Agenda, somente leitura). Para mudar este evento, edite no Google.</p><dl class="dc-dl"><dt>Data</dt><dd>${esc(fmtDate(e.data))}${e.fim ? ' a ' + esc(fmtDate(e.fim)) : ''}${e.hora ? ' · ' + esc(e.hora) : ''}</dd>${e.local ? `<dt>Local</dt><dd>${esc(e.local)}</dd>` : ''}${e.descricao ? `<dt>Descrição</dt><dd>${esc(e.descricao)}</dd>` : ''}</dl><div class="actions"><button type="button" class="btn soft" id="glPub">Criar publicação a partir deste evento</button><span class="cm-esp"></span><button type="button" class="btn" data-close>Fechar</button></div>`).el.querySelector('#glPub').onclick = ev => { ev.target.closest('.admin-overlay').remove(); novaPublicacao({ data: e.data, dados: { titulo: `Publicação: ${e.titulo}`, status: 'IDEIA', origemTipo: 'google', origemNome: e.titulo, origemData: e.data } }); };
}

/** Compromisso do calendário (reunião, cobertura…): vai para o Google Agenda quando a integração está ligada. */
async function calCompromissoForm(it, dataInicial = '') {
  const edit = !!it, r = edit ? it.raw : {};
  const lerOnly = edit && r.origem === 'GOOGLE_AGENDA' && r.somenteLeitura === 'SIM';
  let resp = []; try { resp = ((await api('/team')).rows || []).map(x => x.nome); } catch { /* sem lista */ }
  if (edit && it.responsavel && !resp.includes(it.responsavel)) resp = [it.responsavel, ...resp];
  const dis = lerOnly ? 'disabled' : '';
  const o = dialogo(`<h3>${edit ? (lerOnly ? esc(it.titulo) : 'Editar compromisso') : 'Novo compromisso'}</h3>
    ${edit ? `<p class="kpi-note">Fonte: ${r.origem === 'GOOGLE_AGENDA' ? 'Google Agenda (importado)' : 'EVO MKT, sincronizado com o Google Agenda'}${lerOnly ? ' · agenda somente leitura: edite no Google' : ''}</p>` : ''}
    <form id="cmForm" class="cm-form" novalidate>
      <label class="wide">Título *<input class="control" id="fTitulo" maxlength="140" required autocomplete="off" value="${attr(edit ? it.titulo : '')}" ${dis}></label>
      <label>Data *<input class="control" type="date" id="fData" required value="${attr(edit ? it.data : dataInicial)}" ${dis}></label>
      <label>Horário (opcional)<input class="control" type="time" id="fHora" value="${attr(edit ? it.hora : '')}" ${dis}></label>
      <label>Até (opcional, vários dias)<input class="control" type="date" id="fFim" value="${attr(edit && it.fim ? it.fim : '')}" ${dis}></label>
      <label>Tipo<select class="control" id="fTipo" ${dis}>${CAL_TIPOS_COMPROMISSO.map(t => `<option ${t === (r.tipoItem || 'Compromisso') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Responsável (opcional)<select class="control" id="fResp" ${dis}><option value="">Sem responsável</option>${resp.map(n => `<option value="${attr(n)}" ${n === (edit ? it.responsavel : '') ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="wide">Observações (opcional)<textarea class="control" id="fObs" rows="3" maxlength="1000" ${dis}>${esc(edit ? (r.descricao || '') : '')}</textarea></label>
      <div class="cm-erro wide" id="fErro" role="alert"></div>
      <div class="actions wide">${edit && !lerOnly ? '<button type="button" class="btn danger-soft" id="fExcluir">Excluir</button>' : ''}<span class="cm-esp"></span><button type="button" class="btn soft" data-close>${lerOnly ? 'Fechar' : 'Cancelar'}</button>${lerOnly ? '' : '<button type="submit" class="btn" id="fSalvar">Salvar</button>'}</div>
    </form>`);
  if (lerOnly) return;
  $('#fTitulo', o.el).focus();
  $('#cmForm', o.el).onsubmit = async ev => {
    ev.preventDefault(); const err = $('#fErro', o.el); err.textContent = '';
    const titulo = $('#fTitulo', o.el).value.trim(), data = $('#fData', o.el).value, hora = $('#fHora', o.el).value, fimSel = $('#fFim', o.el).value;
    if (titulo.length < 2) { err.textContent = 'Informe o título.'; return; }
    if (!data) { err.textContent = 'Escolha a data.'; return; }
    if (fimSel && fimSel < data) { err.textContent = 'O dia final não pode ser antes do inicial.'; return; }
    const body = { titulo, tipoItem: $('#fTipo', o.el).value, dataInicio: data, inicioEm: `${data}T${hora || '00:00'}`, fimEm: `${fimSel && fimSel > data ? fimSel : data}T${hora || '00:00'}`, diaInteiro: hora ? 'Não' : 'Sim', responsavel: $('#fResp', o.el).value, descricao: $('#fObs', o.el).value.trim(), dataFim: fimSel && fimSel > data ? fimSel : '' };
    const btn = $('#fSalvar', o.el); btn.disabled = true;
    try {
      if (edit) await put(`/data?module=calendario&id=${encodeURIComponent(it.id)}`, body); else await post('/data?module=calendario', { ...body, status: 'PLANEJADO' });
      invalidate('calendario'); o.close(); toast(edit ? 'Compromisso atualizado' : 'Compromisso criado'); await CAL_UNICO.recarregar();
    } catch (e) { err.textContent = e.message; btn.disabled = false; }
  };
  const ex = $('#fExcluir', o.el);
  if (ex) ex.onclick = async () => {
    if (!await Dlg.confirmar({ titulo: 'Excluir compromisso', texto: `Excluir "${it.titulo}"?`, confirmar: 'Excluir', perigo: true })) return;
    try { await api(`/data?module=calendario&id=${encodeURIComponent(it.id)}`, { method: 'DELETE' }); invalidate('calendario'); o.close(); toast('Compromisso excluído'); await CAL_UNICO.recarregar(); } catch (e) { $('#fErro', o.el).textContent = e.message; }
  };
}

/** "Criar": a publicação é o caminho principal; o resto é opcional. */
function calNovo(data) {
  const o = dialogo(`<h3>O que você quer criar?</h3><p class="kpi-note">${data ? `Dia ${esc(fmtDate(data))}. ` : ''}Cada opção abre o formulário do tipo escolhido.</p>
    <div class="cal-escolha">
      <button type="button" class="btn" data-n="pub">Publicação para o Instagram</button>
      <button type="button" class="softbtn" data-n="cal">Compromisso, reunião ou cobertura</button>
      <button type="button" class="softbtn" data-n="esc">Evento do calendário escolar</button>
      <button type="button" class="softbtn" data-n="dc">Data comemorativa própria</button>
    </div><div class="actions"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button></div>`);
  $$('[data-n]', o.el).forEach(b => b.onclick = async () => {
    const k = b.dataset.n; o.close();
    try {
      if (k === 'pub') return novaPublicacao({ data });
      if (k === 'cal') return calCompromissoForm(null, data);
      if (k === 'esc') { await escCarregar(); return escForm(null, data); }
      if (k === 'dc') { await dcCarregar(Number(String(data || '').slice(0, 4)) || new Date().getFullYear()); return dcForm(null, data); }
    } catch (e) { toast(e.message, 'warn'); }
  });
}

const CAL_UNICO = CalMotor.criar({
  chave: 'calendario', tituloPagina: 'Calendário', eyebrow: 'CALENDÁRIO', rotuloNovo: '+ Criar',
  descricao: 'Publicações, planejamento editorial, calendário escolar, datas comemorativas e Google Agenda em um só lugar. Clique em um dia para criar; arraste para reagendar.',
  tipos: CAL_TIPOS, carregar: calCarregar, novo: calNovo, abrir: calAbrir, mover: calMover, porAno: true,
  modos: [['month', 'Mês'], ['week', 'Semana'], ['day', 'Dia'], ['list', 'Lista']], modoPadrao: 'month', listaEscopo: 'ano', busca: true,
  faixa: () => `<div class="cal-topo"><button type="button" class="btn soft" id="calLink">Link de leitura para a direção</button></div><p class="cal-nota">Os filtros de perfil, formato e campanha valem para as publicações; o de segmento vale para publicações e para o calendário escolar. Datas comemorativas, feriados e a Google Agenda não têm esses filtros.</p>`,
  aoDesenhar: () => { const b = $('#calLink'); if (b) b.onclick = calLinkLeitura; },
  detalhe: i => `Fonte: ${(CAL_TIPOS.find(t => t.k === i.tipo) || {}).fonte || ''}`,
  classeDia: lista => (lista.some(i => i.tipo === 'FERIADO') ? 'feriado' : ''),
});

let calSincTimer = null;
/** Traz as mudanças feitas direto no Google Agenda: ao abrir o Calendário e a cada 2 minutos enquanto ele estiver aberto. */
async function calSincGoogle() {
  try {
    const r = await post('/integrations/google/calendar/sync?leve=1', {});
    if (r && !r.pulou && ((r.do_google || 0) + (r.criados || 0) + (r.removidos || 0)) > 0 && state.page === 'calendario') { invalidate('calendario'); CAL_UNICO.recarregar(); }
  } catch { /* Google desligado ou fora do ar: o calendário continua com o que tem */ }
}
PAGINAS.calendario = async function () {
  CalMotor.redirecionar = () => CAL_UNICO.recarregar();
  clearInterval(calSincTimer);
  calSincTimer = setInterval(() => { if (state.page !== 'calendario') { clearInterval(calSincTimer); return; } calSincGoogle(); }, 120000);
  setTimeout(calSincGoogle, 1500);
  return CAL_UNICO.render();
};

/** Link público SOMENTE de leitura do calendário (para a direção ver as datas sem entrar no sistema). */
async function calLinkLeitura() {
  const st = await api('/manager/calendario-link').catch(() => ({ ativo: false }));
  const o = dialogo(`<h3>Link de leitura do calendário</h3><p class="kpi-note">Quem tiver o link vê as publicações em revisão, aprovadas, agendadas e publicadas, sem entrar no sistema e sem poder alterar nada. Rascunhos e ideias nunca aparecem.</p><div id="lkCorpo">${st.ativo ? `<p class="ok-txt">Há um link ativo até ${esc(fmtDateTime(st.expiraEm))}. Por segurança ele não é mostrado de novo; gerar outro substitui o anterior.</p>` : '<p>Nenhum link ativo.</p>'}</div><label class="dlg-lbl">Validade<select class="control" id="lkDias">${[[7, '7 dias'], [30, '30 dias'], [90, '90 dias']].map(([v, l]) => `<option value="${v}" ${v === 30 ? 'selected' : ''}>${l}</option>`).join('')}</select></label><div class="actions"><button class="btn" id="lkNovo">Gerar link</button>${st.ativo ? '<button class="btn danger-soft" id="lkOff">Desativar</button>' : ''}<span class="cm-esp"></span><button class="btn soft" data-close>Fechar</button></div>`);
  $('#lkNovo', o.el).onclick = async () => { try { const r = await post('/manager/calendario-link', { dias: Number($('#lkDias', o.el).value) }); $('#lkCorpo', o.el).innerHTML = `<div class="uri-row"><small>Copie agora (válido até ${esc(fmtDateTime(r.expiraEm))}):</small><code>${esc(r.url)}</code><button type="button" class="btn soft" id="lkCop">Copiar</button></div>`; $('#lkCop', o.el).onclick = () => copiar(r.url, 'Link copiado'); } catch (e) { toast(e.message, 'warn'); } };
  const off = $('#lkOff', o.el); if (off) off.onclick = async () => { try { await post('/manager/calendario-link', { acao: 'desativar' }); toast('Link desativado'); o.close(); } catch (e) { toast(e.message, 'warn'); } };
}
