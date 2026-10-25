/* Calendário Geral: SOMENTE eventos e atividades escolares, lidos do Google Agenda (agendas cadastradas em Configurações › Agendas Google).
   Mês, Semana e Dia (domingo a sábado). Criar, editar e excluir só na agenda do Marketing (o servidor confere a permissão a cada alteração).
   Nada de publicações, campanhas ou anúncios aqui: isso mora no Instagram. */
const CG_GRUPOS = [['MATERNAIS', 'Maternais', '#793A8C'], ['JARDINS', 'Jardins', '#00A1F3'], ['INICIAIS', 'Anos Iniciais', '#FAB900'], ['FINAIS', 'Anos Finais', '#FF7800'], ['MEDIO', 'Ensino Médio', '#00275F'], ['GERAL', 'Geral', '#063996']];
const CG_NOMES = { MATERNAIS: 'Maternais – Infantil 1, 2 e 3', JARDINS: 'Jardins – Infantil 4, 5 e 1º ano', INICIAIS: 'Anos Iniciais – 2º ao 5º ano', FINAIS: 'Anos Finais – 6º ao 9º ano', MEDIO: 'Ensino Médio – 1ª à 3ª série', GERAL: 'Geral / institucional' };
const CG_MODELOS = [
  ['Reunião com pais', 'Reunião com os responsáveis para apresentar informações importantes do período, esclarecer dúvidas e alinhar combinados.\nPauta: \nLocal e horário de chegada: '],
  ['Formação', 'Formação para a equipe com foco em prática pedagógica.\nObjetivo: \nPúblico: \nMaterial necessário: '],
  ['Projeto / Atividade', 'Atividade do projeto com as turmas.\nObjetivo: \nTurmas envolvidas: \nMateriais e organização: '],
  ['Avaliação', 'Avaliação do período.\nConteúdos: \nDuração: \nOrientações aos estudantes: '],
  ['Evento especial', 'Evento especial do Colégio Evolução.\nProgramação: \nPúblico convidado: \nObservações: '],
  ['Visita / Saída pedagógica', 'Saída pedagógica.\nDestino: \nSaída e retorno: \nAutorização e itens que o estudante deve levar: '],
  ['Outro', ''],
];
const CG_LEMBRETES = [[10, '10 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes'], [1440, '1 dia antes'], [2880, '2 dias antes']];
const CG_REPETE = [['', 'Não repete'], ['DIARIA', 'Todos os dias'], ['SEMANAL', 'Toda semana'], ['MENSAL', 'Todo mês'], ['ANUAL', 'Todo ano']];
const CG = { ref: hojeBR(), modo: ['mes', 'semana', 'dia'].includes(pref('cgModo', 'mes')) ? pref('cgModo', 'mes') : 'mes', segs: new Set(CG_GRUPOS.map(g => g[0])), busca: '', dados: null, sel: hojeBR() };
const CG_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CG_DIAS_LONGO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const cgMesNome = ym => { const t = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(ym + '-01T12:00:00Z')); return t.charAt(0).toUpperCase() + t.slice(1); };
const cgDow = d => new Date(d + 'T12:00:00Z').getUTCDay();
const cgHoraMin = h => (h ? (+h.slice(0, 2)) * 60 + (+h.slice(3, 5)) : 0);
const cgDataLonga = d => `${CG_DIAS_LONGO[cgDow(d)]}, ${+d.slice(8)} de ${cgMesNome(d.slice(0, 7)).split(' ')[0].toLowerCase()} de ${d.slice(0, 4)}`;

/** Intervalo que a tela precisa buscar (o mês inclui as pontas das semanas de fora). */
function cgJanela() {
  if (CG.modo === 'dia') return [CG.ref, CG.ref];
  if (CG.modo === 'semana') { const ini = somaDias(CG.ref, -cgDow(CG.ref)); return [ini, somaDias(ini, 6)]; }
  const ym = CG.ref.slice(0, 7), pri = ym + '-01', ult = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5), 0)).toISOString().slice(0, 10);
  return [somaDias(pri, -cgDow(pri)), somaDias(ult, 6 - cgDow(ult))];
}
async function cgCarregar() {
  const [de, ate] = cgJanela();
  CG.dados = await api(`/agenda/eventos?de=${de}&ate=${ate}`);
}
function cgFiltrados() {
  const b = CG.busca.trim().toLowerCase(), todos = CG.segs.size === CG_GRUPOS.length;
  return (CG.dados?.itens || []).filter(e => (todos || e.segmentos.some(s => CG.segs.has(s))) && (!b || `${e.titulo} ${e.local} ${e.descricao} ${e.agenda}`.toLowerCase().includes(b)));
}
const cgNoDia = (itens, d) => itens.filter(e => e.dia <= d && e.diaFim >= d);
const cgFundo = cor => cor + '26';
const cgHora = e => (e.diaInteiro ? 'Dia inteiro' : `${e.horaInicio} – ${e.horaFim}`);

function cgChip(e) {
  return `<button type="button" class="cg-ev" data-ev="${attr(e.id)}" style="--c:${e.cor};background:${cgFundo(e.cor)}" title="${attr(`${e.titulo} · ${cgHora(e)} · ${e.agenda}`)}"><i></i>${e.diaInteiro ? '' : `<b>${esc(e.horaInicio)}</b> `}<span>${esc(e.titulo)}</span>${e.legado ? '<em>só leitura</em>' : ''}</button>`;
}
function cgMes(itens) {
  const [de, ate] = cgJanela(), ym = CG.ref.slice(0, 7), hoje = hojeBR(), cel = [];
  for (let d = de; d <= ate; d = somaDias(d, 1)) {
    const lista = cgNoDia(itens, d), fora = d.slice(0, 7) !== ym;
    cel.push(`<div class="cg-dia ${fora ? 'fora' : ''} ${d === hoje ? 'hoje' : ''} ${d === CG.sel ? 'sel' : ''}" data-dia="${d}"><div class="cg-dia-topo"><button type="button" class="cg-num" data-abre="${d}">${+d.slice(8)}</button>${CG.dados?.pode ? `<button type="button" class="cg-mais" data-novo="${d}" aria-label="Novo evento em ${attr(fmtDate(d))}" title="Novo evento neste dia">+</button>` : ''}</div>${lista.slice(0, 3).map(cgChip).join('')}${lista.length > 3 ? `<button type="button" class="cg-vermais" data-abre="${d}">+${lista.length - 3} mais</button>` : ''}</div>`);
  }
  return `<div class="cg-mes"><div class="cg-cab">${CG_DIAS.map(x => `<div>${x}</div>`).join('')}</div><div class="cg-grade">${cel.join('')}</div></div>`;
}
/** Semana e dia: grade de horas (07h às 20h), eventos posicionados pelo horário; dia inteiro e vários dias no topo. */
function cgHoras(itens, dias) {
  const H0 = 7, H1 = 20, PX = 46, hoje = hojeBR();
  const topo = dias.map(d => `<div class="cg-th ${d === hoje ? 'hoje' : ''}"><small>${CG_DIAS[cgDow(d)]}</small><b>${+d.slice(8)}</b></div>`).join('');
  const dia = dias.map(d => `<div class="cg-allday" data-dia="${d}">${cgNoDia(itens, d).filter(e => e.diaInteiro || e.dia !== e.diaFim).map(cgChip).join('')}</div>`).join('');
  const colunas = dias.map(d => {
    const evs = cgNoDia(itens, d).filter(e => !e.diaInteiro && e.dia === e.diaFim).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
    const cols = []; // atribui colunas para eventos que se sobrepõem
    evs.forEach(e => { const ini = cgHoraMin(e.horaInicio), fim = Math.max(cgHoraMin(e.horaFim), ini + 30); let c = cols.findIndex(f => f <= ini); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = fim; e._c = c; e._n = 0; });
    evs.forEach(e => { const ini = cgHoraMin(e.horaInicio), fim = Math.max(cgHoraMin(e.horaFim), ini + 30); e._n = Math.max(...evs.filter(o => cgHoraMin(o.horaInicio) < fim && Math.max(cgHoraMin(o.horaFim), cgHoraMin(o.horaInicio) + 30) > ini).map(o => o._c)) + 1; });
    return `<div class="cg-col ${d === hoje ? 'hoje' : ''}" data-dia="${d}" style="height:${(H1 - H0) * PX}px">${Array.from({ length: H1 - H0 }, (_, i) => `<div class="cg-linha" style="top:${i * PX}px" ${CG.dados?.pode ? `data-novo="${d}" data-hora="${String(H0 + i).padStart(2, '0')}:00"` : ''}></div>`).join('')}${evs.map(e => {
      const ini = Math.max(cgHoraMin(e.horaInicio), H0 * 60), fim = Math.min(Math.max(cgHoraMin(e.horaFim), cgHoraMin(e.horaInicio) + 30), H1 * 60), top = (ini - H0 * 60) / 60 * PX, alt = Math.max(24, (fim - ini) / 60 * PX - 2), larg = 100 / e._n;
      return `<button type="button" class="cg-bloco" data-ev="${attr(e.id)}" style="--c:${e.cor};background:${cgFundo(e.cor)};top:${top}px;height:${alt}px;left:${e._c * larg}%;width:calc(${larg}% - 3px)" title="${attr(`${e.titulo} · ${cgHora(e)}`)}"><b>${esc(e.horaInicio)} – ${esc(e.horaFim)}</b><span>${esc(e.titulo)}</span>${e.local ? `<small>${esc(e.local)}</small>` : ''}</button>`;
    }).join('')}</div>`;
  }).join('');
  const horas = Array.from({ length: H1 - H0 }, (_, i) => `<div style="height:${PX}px"><small>${String(H0 + i).padStart(2, '0')}:00</small></div>`).join('');
  const n = dias.length;
  return `<div class="cg-horas" style="--n:${n}"><div class="cg-h-topo"><div></div>${topo}</div><div class="cg-h-allday"><div><small>dia todo</small></div>${dia}</div><div class="cg-h-corpo"><div class="cg-h-rotulos">${horas}</div>${colunas}</div></div>`;
}
function cgMini() {
  const ym = CG.ref.slice(0, 7), pri = ym + '-01', ult = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5), 0)).toISOString().slice(0, 10);
  const de = somaDias(pri, -cgDow(pri)), ate = somaDias(ult, 6 - cgDow(ult)), hoje = hojeBR(), itens = cgFiltrados(), cel = [];
  for (let d = de; d <= ate; d = somaDias(d, 1)) cel.push(`<button type="button" class="cg-m ${d.slice(0, 7) !== ym ? 'fora' : ''} ${d === hoje ? 'hoje' : ''} ${d === CG.sel ? 'sel' : ''}" data-abre="${d}">${+d.slice(8)}${cgNoDia(itens, d).length ? '<i></i>' : ''}</button>`);
  return `<section class="cg-card"><div class="cg-card-t"><b>${esc(cgMesNome(ym))}</b><span><button type="button" class="cg-seta" data-nav="-1" aria-label="Mês anterior">‹</button><button type="button" class="cg-seta" data-nav="1" aria-label="Próximo mês">›</button></span></div><div class="cg-mini-cab">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<span>${x}</span>`).join('')}</div><div class="cg-mini">${cel.join('')}</div></section>`;
}
function cgDoDia() {
  const lista = cgNoDia(cgFiltrados(), CG.sel).sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''));
  return `<section class="cg-card"><div class="cg-card-t"><b>Eventos do dia</b><small>${lista.length} evento(s)</small></div><p class="cg-data">${esc(cgDataLonga(CG.sel))}</p>${lista.length ? lista.map(e => `<button type="button" class="cg-item" data-ev="${attr(e.id)}"><i style="background:${e.cor}"></i><span><b>${esc(e.titulo)}</b><small>${esc(cgHora(e))}${e.local ? ' · ' + esc(e.local) : ''}</small></span></button>`).join('') : '<div class="empty compact">Nenhum evento neste dia.</div>'}</section>`;
}
function cgLegenda() { return `<div class="cg-leg">${CG_GRUPOS.map(([k, n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div>`; }

PAGINAS.calendario = async function () {
  const desenha = () => {
    const itens = cgFiltrados(), [de, ate] = cgJanela(), dados = CG.dados;
    const rot = CG.modo === 'dia' ? cgDataLonga(CG.ref) : CG.modo === 'semana' ? `${fmtDate(de)} a ${fmtDate(ate)}` : cgMesNome(CG.ref.slice(0, 7));
    const todos = CG.segs.size === CG_GRUPOS.length;
    const corpo = !dados.agendas.length ? `<div class="empty-rich"><strong>Nenhuma agenda do Google cadastrada</strong><p>O Calendário Geral mostra os eventos escolares das agendas do Google Agenda. Cadastre as agendas em Configurações › Agendas Google.</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>` : CG.modo === 'mes' ? cgMes(itens) : cgHoras(itens, CG.modo === 'dia' ? [CG.ref] : Array.from({ length: 7 }, (_, i) => somaDias(de, i)));
    $('#content').innerHTML = `<div class="cg-barra">
        <span class="cg-nav"><button type="button" class="btn soft" data-nav="-1" aria-label="Anterior">‹</button><b class="cg-rot">${esc(rot)}</b><button type="button" class="btn soft" data-nav="1" aria-label="Próximo">›</button><button type="button" class="btn soft" data-nav="hoje">Hoje</button></span>
        <span class="cg-modos" role="group" aria-label="Visão">${[['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia']].map(([k, n]) => `<button type="button" class="btn ${CG.modo === k ? '' : 'soft'}" data-modo="${k}" aria-pressed="${CG.modo === k}">${n}</button>`).join('')}</span>
        <details class="cg-segs"><summary class="btn soft">${todos ? 'Todos os segmentos' : `${CG.segs.size} segmento(s)`} ▾</summary><div>${CG_GRUPOS.map(([k, n, c]) => `<label><input type="checkbox" data-seg="${k}" ${CG.segs.has(k) ? 'checked' : ''}><i style="background:${c}"></i>${n}</label>`).join('')}<button type="button" class="btn soft" data-seg-todos>Marcar todos</button></div></details>
        <input type="search" class="control cg-busca" id="cgBusca" placeholder="Buscar eventos, locais, responsáveis…" aria-label="Buscar eventos escolares" value="${attr(CG.busca)}">
        <button type="button" class="btn" id="cgNovo" ${dados.pode ? '' : 'disabled title="Nenhuma agenda liberada para edição. Só a agenda do Marketing aceita novos eventos."'}>+ Novo evento</button>
      </div>
      ${dados.avisos.length ? `<div class="cg-avisos" role="alert">${dados.avisos.map(a => `<p><b>${esc(a.agenda || 'Google')}:</b> ${esc(a.mensagem)}</p>`).join('')}<small>Os eventos desta agenda podem estar incompletos até o problema ser resolvido.</small></div>` : ''}
      ${cgLegenda()}
      <div class="cg-layout"><div class="cg-principal">${corpo}</div><aside class="cg-lado">${cgMini()}${cgDoDia()}<p class="kpi-note cg-sync">${dados.agendas.length ? `Agendas: ${dados.agendas.filter(a => a.ativa).length} ativa(s) · ${dados.agendas.some(a => a.permissao === 'edicao') ? 'edição só na agenda do Marketing' : 'todas somente leitura'}` : ''}</p></aside></div>`;
    ligar();
  };
  const recarrega = async () => { const pr = $('.cg-principal'); if (pr) pr.classList.add('carregando'); try { await cgCarregar(); } catch (e) { CG.dados = { itens: [], avisos: [{ agenda: 'Calendário', mensagem: e.message }], agendas: CG.dados?.agendas || [], pode: false }; } if (state.page === 'calendario') { try { desenha(); } catch (err) { console.error('Calendário Geral:', err); toast('Não foi possível montar o calendário: ' + err.message, 'bad'); } } };
  const ligar = () => {
    $$('[data-nav]').forEach(b => { b.onclick = () => { const v = b.dataset.nav; if (v === 'hoje') CG.ref = hojeBR(); else if (CG.modo === 'dia') CG.ref = somaDias(CG.ref, +v); else if (CG.modo === 'semana') CG.ref = somaDias(CG.ref, 7 * +v); else CG.ref = somaMes(CG.ref.slice(0, 7), +v) + '-01'; CG.sel = CG.ref; recarrega(); }; });
    $$('[data-modo]').forEach(b => { b.onclick = () => { CG.modo = b.dataset.modo; setPref('cgModo', CG.modo); recarrega(); }; });
    $$('[data-seg]').forEach(c => { c.onchange = () => { c.checked ? CG.segs.add(c.dataset.seg) : CG.segs.delete(c.dataset.seg); if (!CG.segs.size) CG.segs.add(c.dataset.seg); const aberto = true; desenha(); const d = $('.cg-segs'); if (d && aberto) d.open = true; }; });
    const todos = $('[data-seg-todos]'); if (todos) todos.onclick = () => { CG_GRUPOS.forEach(g => CG.segs.add(g[0])); desenha(); };
    $('#cgBusca').oninput = debounce(e => { CG.busca = e.target.value; desenha(); const i = $('#cgBusca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    $('#cgNovo').onclick = () => cgForm(null, { dia: CG.sel }, recarrega);
    $$('[data-abre]').forEach(b => { b.onclick = () => { const d = b.dataset.abre, mini = !!b.closest('.cg-mini'); CG.sel = d; CG.ref = d; if (!mini && CG.modo === 'mes') { CG.modo = 'dia'; setPref('cgModo', 'dia'); } recarrega(); }; });
    $$('[data-novo]').forEach(b => { b.onclick = e => { e.stopPropagation(); cgForm(null, { dia: b.dataset.novo, hora: b.dataset.hora || '' }, recarrega); }; });
    $$('[data-ev]').forEach(b => { b.onclick = e => { e.stopPropagation(); const ev = (CG.dados?.itens || []).find(x => x.id === b.dataset.ev); if (ev) cgDetalhes(ev, recarrega); }; });
  };
  try { await cgCarregar(); } catch (e) { CG.dados = { itens: [], avisos: [{ agenda: 'Calendário', mensagem: e.message }], agendas: [], pode: false }; }
  desenha();
};

/** Detalhes: modal central. Editar e Excluir só aparecem se o servidor liberou a edição desta agenda. */
function cgDetalhes(e, recarrega) {
  const segs = e.segmentos.map(s => `<span class="cg-tag" style="background:${cgFundo((CG_GRUPOS.find(g => g[0] === s) || [, , '#063996'])[2])}">${esc(CG_NOMES[s] || s)}</span>`).join(' ');
  const dlg = dialogo(`<div class="cg-det"><div class="cg-det-t"><h2>Detalhes do evento</h2><span>${e.podeAlterar ? '<button type="button" class="btn soft" id="cgEd">✎ Editar</button><button type="button" class="btn soft cg-perigo" id="cgEx">Excluir</button>' : ''}<button type="button" class="btn soft" data-close aria-label="Fechar">✕</button></span></div>
    <div class="cg-det-corpo"><div class="cg-det-principal"><div>${segs}</div><h3 style="border-left:6px solid ${e.cor};padding-left:10px">${esc(e.titulo)}</h3>
      <p>📅 ${esc(cgDataLonga(e.dia))}${e.diaFim !== e.dia ? ' até ' + esc(fmtDate(e.diaFim)) : ''}</p><p>🕒 ${esc(cgHora(e))}${e.recorrente ? ' · evento recorrente' : ''}</p>${e.local ? `<p>📍 ${esc(e.local)}</p>` : ''}
      ${e.descricao ? `<h4>Descrição</h4><div class="cg-desc">${esc(e.descricao).replace(/\n/g, '<br>')}</div>` : ''}
      ${e.participantes.length ? `<h4>Participantes (${e.participantes.length})</h4><ul class="cg-lista">${e.participantes.map(p => `<li>${esc(p.nome || p.email)}${p.nome ? `<small>${esc(p.email)}</small>` : ''}</li>`).join('')}</ul>` : ''}
      ${e.anexos.length ? `<h4>Anexos</h4><ul class="cg-lista">${e.anexos.map(a => `<li><a href="${attr(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.titulo)}</a></li>`).join('')}</ul>` : ''}</div>
      <aside class="cg-det-lado"><div class="cg-origem"><small>Agenda de origem</small><b>${esc(e.agenda)}</b></div><div class="cg-perm ${e.podeAlterar ? 'ok' : ''}"><small>Permissão</small><b>${e.podeAlterar ? 'Leitura e edição' : 'Somente leitura'}</b><span>${e.legado ? 'Evento do calendário escolar anterior: fica só para consulta.' : e.podeAlterar ? 'Você pode editar e excluir eventos desta agenda.' : 'Só a agenda do Marketing aceita alterações no EVO MKT.'}</span></div>
      ${e.criadoPor ? `<p class="kpi-note">Criado no EVO MKT por ${esc(e.criadoPor)}</p>` : ''}${e.link ? `<a class="btn soft" href="${attr(e.link)}" target="_blank" rel="noopener noreferrer">Abrir no Google Agenda</a>` : ''}</aside></div>
    <div class="cg-rodape"><button type="button" class="btn soft" data-close>Fechar</button></div></div>`, { larga: true });
  const ed = $('#cgEd', dlg.el); if (ed) ed.onclick = () => { dlg.close(); cgForm(e, {}, recarrega); };
  const ex = $('#cgEx', dlg.el); if (ex) ex.onclick = () => { dlg.close(); cgExcluir(e, recarrega); };
}
function cgExcluir(e, recarrega) {
  const dlg = dialogo(`<div class="cg-conf"><h3>Excluir evento</h3><p>Excluir “<b>${esc(e.titulo)}</b>”? Isto também <b>exclui o evento no Google Agenda</b> e não dá para desfazer pelo EVO MKT.</p>${e.recorrente ? '<div class="cg-escopo"><label><input type="radio" name="cgEsc" value="ocorrencia" checked> Só esta ocorrência</label><label><input type="radio" name="cgEsc" value="serie"> Toda a série de eventos</label></div>' : ''}<div class="cg-erro" id="cgExErro" role="alert" hidden></div><div class="cg-acoes"><button type="button" class="btn soft" data-close>Cancelar</button><button type="button" class="btn cg-perigo-b" id="cgExOk">Excluir</button></div></div>`);
  $('#cgExOk', dlg.el).onclick = async ev => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Excluindo…';
    try { await post('/agenda/evento/excluir', { calendarId: e.calendarId, eventId: e.eventId, escopo: ($('[name=cgEsc]:checked', dlg.el) || {}).value || 'ocorrencia', confirmar: true }); dlg.close(); toast('Evento excluído no Google Agenda'); await recarrega(); }
    catch (er) { const x = $('#cgExErro', dlg.el); x.textContent = er.message; x.hidden = false; b.disabled = false; b.textContent = 'Excluir'; }
  };
}
/** Novo evento / editar: modal central e compacto. Só lista agendas liberadas para edição; sem tipo de evento e sem escolha de cor. */
function cgForm(ev, pre, recarrega) {
  const editaveis = (CG.dados?.agendas || []).filter(a => a.permissao === 'edicao');
  if (!ev && !editaveis.length) { toast('Nenhuma agenda liberada para edição. Só a agenda do Marketing aceita novos eventos.', 'warn'); return; }
  const v = ev ? { titulo: ev.titulo, dia: ev.dia, diaFim: ev.diaFim, diaInteiro: ev.diaInteiro, horaInicio: ev.horaInicio || '08:00', horaFim: ev.horaFim || '09:00', segmentos: ev.segmentos, descricao: ev.descricao, local: ev.local, participantes: ev.participantes.map(p => p.email), calendarId: ev.calendarId }
    : { titulo: '', dia: pre.dia || hojeBR(), diaFim: pre.dia || hojeBR(), diaInteiro: false, horaInicio: pre.hora || '08:00', horaFim: pre.hora ? String(Math.min(23, +pre.hora.slice(0, 2) + 1)).padStart(2, '0') + ':00' : '09:00', segmentos: ['GERAL'], descricao: '', local: '', participantes: [], calendarId: editaveis[0].id };
  const dlg = dialogo(`<form class="cg-form" id="cgForm" novalidate><div class="cg-form-t"><div><h2>${ev ? 'Editar evento' : 'Novo evento'}</h2><p class="kpi-note">${ev ? 'As alterações vão para o Google Agenda.' : 'Preencha as informações para criar o evento no Calendário Geral.'}</p></div><button type="button" class="btn soft" data-close aria-label="Fechar">✕</button></div>
    <div class="cg-form-grade"><div class="cg-form-esq">
      <label>Agenda de destino *<select class="control" id="cgAg" ${ev ? 'disabled' : ''}>${(ev ? [{ id: ev.calendarId, nome: ev.agenda }] : editaveis).map(a => `<option value="${attr(a.id)}">${esc(a.nome)}</option>`).join('')}</select></label>
      <p class="kpi-note">Apenas agendas com permissão de edição aparecem aqui.</p>
      <label>Título do evento *<input class="control" id="cgTit" maxlength="140" placeholder="Ex.: Feira de Ciências – 4º ano" value="${attr(v.titulo)}"></label>
      <div class="cg-quando"><label>Data *<input type="date" class="control" id="cgDia" value="${v.dia}"></label><label class="cg-hora">Início<input type="time" class="control" id="cgHi" value="${v.horaInicio}"></label><label class="cg-hora">Fim<input type="time" class="control" id="cgHf" value="${v.horaFim}"></label><label class="check-row"><input type="checkbox" id="cgInt" ${v.diaInteiro ? 'checked' : ''}> Dia inteiro</label></div>
      <label id="cgFimBox" ${v.diaInteiro || v.diaFim !== v.dia ? '' : 'hidden'}>Até o dia<input type="date" class="control" id="cgDiaFim" value="${v.diaFim}"></label>
      <fieldset class="cg-segs-form"><legend>Segmentos *</legend>${CG_GRUPOS.map(([k, n, c]) => `<label class="cg-chip-seg"><input type="checkbox" data-fs="${k}" ${v.segmentos.includes(k) ? 'checked' : ''}><i style="background:${c}"></i>${n}</label>`).join('')}</fieldset>
      <label>Modelo de texto (opcional)<select class="control" id="cgMod"><option value="">Selecione um modelo pronto</option>${CG_MODELOS.map(([n]) => `<option>${esc(n)}</option>`).join('')}</select></label>
      <label>Descrição<textarea class="control" id="cgDesc" rows="4" maxlength="1000" placeholder="Descreva os detalhes do evento, objetivo, público, observações…">${esc(v.descricao)}</textarea></label><div class="cg-cont"><span id="cgN">${v.descricao.length}</span>/1000</div>
      <label>Local (opcional)<input class="control" id="cgLoc" maxlength="140" value="${attr(v.local)}"></label>
    </div><div class="cg-form-dir">
      <label>Responsável / participantes (opcional)<input class="control" id="cgPar" placeholder="e-mails separados por vírgula" value="${attr(v.participantes.join(', '))}"></label><p class="kpi-note">Os participantes são adicionados ao evento no Google; o EVO MKT não envia convites por e-mail.</p>
      ${ev && ev.recorrente ? '<fieldset class="cg-escopo"><legend>Este evento se repete</legend><label><input type="radio" name="cgEsc" value="ocorrencia" checked> Só esta ocorrência</label><label><input type="radio" name="cgEsc" value="serie"> Toda a série (textos e horário)</label></fieldset>' : ''}
      ${ev ? '' : `<label>Repetição<select class="control" id="cgRep">${CG_REPETE.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label><label id="cgVezesBox" hidden>Repetir quantas vezes (2 a 60)<input type="number" class="control" id="cgVezes" min="2" max="60" value="10"></label>`}
      <fieldset class="cg-lemb"><legend>Lembretes</legend>${CG_LEMBRETES.map(([m, n]) => `<label class="check-row"><input type="checkbox" data-lem="${m}"> ${n}</label>`).join('')}</fieldset>
    </div></div>
    <div class="cg-erro" id="cgErro" role="alert" hidden></div>
    <div class="cg-acoes"><button type="button" class="btn soft" data-close>Cancelar</button><button type="submit" class="btn" id="cgSalvar">${ev ? 'Salvar alterações' : 'Salvar evento'}</button></div></form>`, { larga: true });
  const f = $('#cgForm', dlg.el), erro = m => { const x = $('#cgErro', dlg.el); x.textContent = m; x.hidden = !m; };
  const mostraInt = () => { const i = $('#cgInt', dlg.el).checked; $$('.cg-hora', dlg.el).forEach(x => { x.hidden = i; }); $('#cgFimBox', dlg.el).hidden = !i && $('#cgDiaFim', dlg.el).value === $('#cgDia', dlg.el).value; };
  $('#cgInt', dlg.el).onchange = mostraInt; mostraInt();
  $('#cgDia', dlg.el).onchange = () => { if ($('#cgDiaFim', dlg.el).value < $('#cgDia', dlg.el).value) $('#cgDiaFim', dlg.el).value = $('#cgDia', dlg.el).value; };
  $('#cgMod', dlg.el).onchange = e => { const m = CG_MODELOS.find(x => x[0] === e.target.value); if (m && m[1]) { $('#cgDesc', dlg.el).value = m[1]; $('#cgN', dlg.el).textContent = String(m[1].length); } };
  $('#cgDesc', dlg.el).oninput = e => { $('#cgN', dlg.el).textContent = String(e.target.value.length); };
  const rep = $('#cgRep', dlg.el); if (rep) rep.onchange = () => { $('#cgVezesBox', dlg.el).hidden = !rep.value; };
  f.onsubmit = async e => {
    e.preventDefault(); erro('');
    const b = $('#cgSalvar', dlg.el), int = $('#cgInt', dlg.el).checked, dia = $('#cgDia', dlg.el).value;
    const corpo = { calendarId: ev ? ev.calendarId : $('#cgAg', dlg.el).value, titulo: $('#cgTit', dlg.el).value, dia, diaFim: int ? $('#cgDiaFim', dlg.el).value || dia : $('#cgDiaFim', dlg.el).value && $('#cgDiaFim', dlg.el).value > dia ? $('#cgDiaFim', dlg.el).value : dia, diaInteiro: int, horaInicio: $('#cgHi', dlg.el).value, horaFim: $('#cgHf', dlg.el).value, segmentos: $$('[data-fs]', dlg.el).filter(x => x.checked).map(x => x.dataset.fs), descricao: $('#cgDesc', dlg.el).value, local: $('#cgLoc', dlg.el).value, participantes: $('#cgPar', dlg.el).value.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean), lembretes: $$('[data-lem]', dlg.el).filter(x => x.checked).map(x => +x.dataset.lem), recorrencia: rep ? rep.value : '', recorrenciaVezes: rep && rep.value ? +$('#cgVezes', dlg.el).value : 0 };
    b.disabled = true; b.textContent = 'Salvando no Google…';
    try {
      // só mostra sucesso depois que o Google confirmou (a API só responde ok após a gravação)
      const r = ev ? await put('/agenda/evento', { ...corpo, eventId: ev.eventId, escopo: ($('[name=cgEsc]:checked', dlg.el) || {}).value || 'ocorrencia' }) : await post('/agenda/evento', corpo);
      dlg.close(); cgSucesso(r.evento, ev ? 'atualizado' : 'criado', recarrega);
    } catch (er) { erro(er.message); b.disabled = false; b.textContent = ev ? 'Salvar alterações' : 'Salvar evento'; }
  };
}
/** Confirmação: só "Ver no calendário", "Abrir no Google Agenda" e "Concluir". */
function cgSucesso(e, acao, recarrega) {
  const dlg = dialogo(`<div class="cg-ok"><div class="cg-ok-i">✓</div><h3>Evento ${acao} com sucesso</h3><p><b>${esc(e.titulo)}</b></p><p class="kpi-note">${esc(cgDataLonga(e.dia))} · ${esc(cgHora(e))}<br>Agenda: ${esc(e.agenda)}</p><div class="cg-ok-acoes"><button type="button" class="btn" id="cgVer">Ver no calendário</button>${e.link ? `<a class="btn soft" href="${attr(e.link)}" target="_blank" rel="noopener noreferrer">Abrir no Google Agenda</a>` : ''}<button type="button" class="btn soft" id="cgConcluir">Concluir</button></div></div>`);
  $('#cgVer', dlg.el).onclick = async () => { dlg.close(); CG.ref = e.dia; CG.sel = e.dia; await recarrega(); };
  $('#cgConcluir', dlg.el).onclick = async () => { dlg.close(); await recarrega(); };
}
