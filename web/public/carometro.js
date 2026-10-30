/* Carômetro Escolar (etapa 1): consulta de alunos por segmento, série e turma, em grade ou lista, com ficha.
   Somente leitura sobre o cadastro do Uso de Imagem. Fotos entram na etapa 2; o selo de autorização é só informativo. */
const CM = { vista: 'grade', busca: '', segmento: '', serie: '', turma: '', autorizacao: '', sel: new Map(), mais: 1 };
const CM_AUT = { AUTORIZADO: ['Autorizado', 'ok'], NAO_AUTORIZADO: ['Não autorizado', 'bad'], SEM_INFORMACAO: ['Sem informação', 'mute'] };
const cmSelo = a => { const [t, c] = CM_AUT[a] || CM_AUT.SEM_INFORMACAO; return `<span class="cm-selo ${c}">${t}</span>`; };
const cmIniciais = n => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const cmFoto = (a, tam = 'mini') => a.fotoId
  ? `<div class="cm-foto"><img src="${API}/carometro/foto?id=${a.fotoId}&tam=${tam}" alt="Foto de ${attr(a.nome)}" loading="lazy" draggable="false"></div>`
  : `<div class="cm-foto sem" role="img" aria-label="${attr(a.nome)}, sem foto cadastrada"><b>${esc(cmIniciais(a.nome))}</b><small>Sem foto</small></div>`;

PAGINAS.cmvisao = async function () {
  $('#content').innerHTML = `<div class="ig-barra"><input id="cmBusca" class="control" type="search" placeholder="Buscar por nome ou matrícula" aria-label="Buscar aluno" value="${attr(CM.busca)}"><select id="cmSeg" class="control" aria-label="Segmento"></select><select id="cmSerie" class="control" aria-label="Série"></select><select id="cmTurma" class="control" aria-label="Turma"></select><select id="cmAut" class="control" aria-label="Autorização de imagem"><option value="">Toda autorização</option><option value="AUTORIZADO">Autorizado</option><option value="NAO_AUTORIZADO">Não autorizado</option><option value="SEM_INFORMACAO">Sem informação</option></select></div>
    <div id="cmInd"></div><div class="ig-barra"><div class="cm-vistas" role="group" aria-label="Forma de exibição"><button type="button" class="btn ghost" data-vista="grade">▦ Grade</button><button type="button" class="btn ghost" data-vista="lista">☰ Lista</button></div><span class="kpi-note" id="cmSelTxt"></span><button type="button" class="btn ghost" id="cmLimpar" hidden>Limpar seleção</button></div>
    <div id="cmLista"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
  $('#cmAut').value = CM.autorizacao;
  let atraso;
  const carrega = async () => {
    const p = new URLSearchParams({ busca: CM.busca, segmento: CM.segmento, serie: CM.serie, turma: CM.turma, autorizacao: CM.autorizacao });
    const d = await api('/carometro/alunos?' + p);
    const opt = (v, t, sel) => `<option value="${attr(v)}" ${sel ? 'selected' : ''}>${esc(t)}</option>`;
    $('#cmSeg').innerHTML = opt('', 'Todos os segmentos', !CM.segmento) + d.segmentos.map(s => opt(s.k, s.nome, CM.segmento === s.k)).join('');
    $('#cmSerie').innerHTML = opt('', 'Todas as séries', !CM.serie) + d.series.map(s => opt(s, s, CM.serie === s)).join('');
    $('#cmTurma').innerHTML = opt('', 'Todas as turmas', !CM.turma) + d.turmas.map(s => opt(s, s, CM.turma === s)).join('');
    const i = d.indicadores, cart = (r, v, cls) => `<div class="db-cartao ui-cartao ${cls || ''}"><small>${r}</small><strong>${fmtN(v)}</strong></div>`;
    $('#cmInd').innerHTML = `<div class="db-cartoes ui-seis">${cart('Alunos (ano ' + esc(d.anoLetivo) + ')', i.alunos)}${cart('Com foto', i.comFoto, 'ok')}${cart('Sem foto', i.semFoto, i.semFoto ? 'alerta' : '')}${cart('Possíveis duplicados', i.duplicados, i.duplicados ? 'alerta' : '')}${cart('Sem turma reconhecida', i.semTurma, i.semTurma ? 'alerta' : '')}</div>`;
    const rows = d.rows, visiveis = rows.slice(0, CM.mais * 120);
    const marc = a => CM.sel.has(a.id);
    const card = a => `<div class="cm-al ${marc(a) ? 'sel' : ''}"><label class="cm-ck"><input type="checkbox" data-sel="${a.id}" ${marc(a) ? 'checked' : ''} aria-label="Selecionar ${attr(a.nome)}"></label><button type="button" class="cm-abre" data-ficha="${a.id}" aria-label="Abrir ficha de ${attr(a.nome)}">${cmFoto(a)}<strong>${esc(a.nome)}</strong><small>${esc(a.matricula)} · ${esc(a.turma || 'sem turma')}</small></button>${cmSelo(a.autorizacao)}${a.duplicado ? '<span class="cm-selo warn">Nome repetido na turma</span>' : ''}</div>`;
    const linha = a => `<tr><td class="ui-ck"><input type="checkbox" data-sel="${a.id}" ${marc(a) ? 'checked' : ''} aria-label="Selecionar ${attr(a.nome)}"></td><td><button type="button" class="ui-lk" data-ficha="${a.id}"><b>${esc(a.nome)}</b></button>${a.duplicado ? ' <span class="cm-selo warn">repetido</span>' : ''}</td><td>${esc(a.matricula)}</td><td>${esc(a.turma || '—')}</td><td>${cmSelo(a.autorizacao)}</td></tr>`;
    $('#cmLista').innerHTML = rows.length
      ? `<p class="kpi-note">${fmtN(rows.length)} aluno(s)${d.total > rows.length ? ` (mostrando os ${d.limite} primeiros de ${fmtN(d.total)}; refine a busca)` : ''}. Ter foto cadastrada não significa autorização para publicar.</p>${CM.vista === 'grade' ? `<div class="cm-grade">${visiveis.map(card).join('')}</div>` : `<div class="tablewrap"><table class="datatable ui-tab"><thead><tr><th></th><th>Aluno</th><th>Matrícula</th><th>Turma</th><th>Autorização</th></tr></thead><tbody>${visiveis.map(linha).join('')}</tbody></table></div>`}${visiveis.length < rows.length ? '<div class="ig-barra"><button type="button" class="btn ghost" id="cmMais">Mostrar mais</button></div>' : ''}`
      : `<div class="empty"><b>Nenhum aluno encontrado.</b><br>${d.indicadores.alunos === 0 && !CM.busca && !CM.segmento && !CM.serie && !CM.turma && !CM.autorizacao ? 'Cadastre ou importe a lista de alunos em Uso de Imagem › Alunos.' : 'Mude os filtros ou a busca.'}</div>`;
    $$('#cmLista [data-sel]').forEach(b => { b.onchange = () => { const a = rows.find(x => x.id === +b.dataset.sel); if (!a) return; if (b.checked) CM.sel.set(a.id, a); else CM.sel.delete(a.id); atualizaSel(); b.closest('.cm-al')?.classList.toggle('sel', b.checked); }; });
    $$('#cmLista [data-ficha]').forEach(b => { b.onclick = () => cmFicha(+b.dataset.ficha); });
    $('#cmMais') && ($('#cmMais').onclick = () => { CM.mais++; carrega(); });
    $$('.cm-vistas [data-vista]').forEach(b => { b.classList.toggle('active', b.dataset.vista === CM.vista); b.setAttribute('aria-pressed', String(b.dataset.vista === CM.vista)); });
  };
  const atualizaSel = () => { const n = CM.sel.size, turmas = new Set([...CM.sel.values()].map(a => a.turma)).size; $('#cmSelTxt').textContent = n ? `${n} selecionado(s) de ${turmas} turma(s)` : ''; $('#cmLimpar').hidden = !n; };
  const muda = () => { CM.mais = 1; carrega(); };
  $('#cmBusca').oninput = e => { clearTimeout(atraso); atraso = setTimeout(() => { CM.busca = e.target.value; muda(); }, 250); };
  $('#cmSeg').onchange = e => { CM.segmento = e.target.value; CM.serie = ''; CM.turma = ''; muda(); };
  $('#cmSerie').onchange = e => { CM.serie = e.target.value; CM.turma = ''; muda(); };
  $('#cmTurma').onchange = e => { CM.turma = e.target.value; muda(); };
  $('#cmAut').onchange = e => { CM.autorizacao = e.target.value; muda(); };
  $('#cmLimpar').onclick = () => { CM.sel.clear(); atualizaSel(); carrega(); };
  $$('.cm-vistas [data-vista]').forEach(b => { b.onclick = () => { CM.vista = b.dataset.vista; carrega(); }; });
  atualizaSel();
  await carrega();
};

PAGINAS.cmturmas = async function () {
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  const d = await api('/carometro/turmas');
  $('#content').innerHTML = `<p class="kpi-note">Ano letivo ${esc(d.anoLetivo)} · ${fmtN(d.total)} aluno(s) ativos. Clique em uma turma para ver os alunos.</p><div class="cm-segs">${d.segmentos.map(s => `<section class="card"><div class="db-tit"><h2>${esc(s.nome)}</h2><span class="kpi-note">${esc(s.detalhe)} · ${fmtN(s.alunos)} aluno(s)</span></div>${s.series.length ? s.series.map(g => `<div class="cm-serie"><b>${esc(g.serie)}</b><div class="cm-turmas">${g.turmas.map(t => `<button type="button" class="btn ghost" data-seg="${attr(s.k)}" data-turma="${attr(t.turma)}" data-serie="${attr(g.serie)}">${esc(t.turma)} <small>(${fmtN(t.alunos)})</small></button>`).join('')}</div></div>`).join('') : '<p class="kpi-note">Nenhuma turma com alunos.</p>'}</section>`).join('')}${d.semSegmento ? `<section class="card ui-atencao"><div class="db-tit"><h2>Sem segmento reconhecido</h2></div><p class="kpi-note">${fmtN(d.semSegmento)} aluno(s) com turma vazia ou fora do padrão (ex.: “3º Ano A”, “Infantil 2 B”). Corrija em Uso de Imagem › Alunos.</p></section>` : ''}</div>`;
  $$('#content [data-turma]').forEach(b => { b.onclick = () => { CM.segmento = b.dataset.seg; CM.serie = b.dataset.serie; CM.turma = b.dataset.turma; CM.busca = ''; CM.autorizacao = ''; CM.mais = 1; go('cmvisao'); }; });
};

async function cmFicha(id) {
  const d = await api('/carometro/aluno?id=' + id), a = d.aluno, fotos = d.fotos;
  const aut = a.autorizacao === 'SEM_INFORMACAO' ? 'Nenhuma autorização concluída no módulo Uso de Imagem.' : `Fonte: ${esc(a.autorizacaoFonte)}${a.autorizacaoDesde ? ' · desde ' + esc(fmtDate(a.autorizacaoDesde)) : ''}${a.autorizacaoValeAte ? ' · válida até ' + esc(fmtDate(a.autorizacaoValeAte)) : ''}`;
  const seg = SEGMENTOS_ROT[a.segmento] || 'Não reconhecido';
  const atual = fotos.find(f => Number(f.ativa));
  const hist = fotos.length ? `<h4>Histórico da foto</h4><div class="tablewrap"><table class="datatable"><thead><tr><th>Versão</th><th>Enviada</th><th>Por</th><th>Tamanho</th><th></th></tr></thead><tbody>${fotos.map(f => `<tr><td>${f.versao}${Number(f.ativa) ? ' <span class="cm-selo ok">atual</span>' : ''}</td><td>${esc(fmtDateTime(f.enviado_em))}</td><td>${esc(f.enviado_por)}</td><td>${esc(f.largura)}×${esc(f.altura)}${f.aviso ? `<br><small class="cm-aviso">${esc(f.aviso)}</small>` : ''}</td><td class="cm-acoes">${d.podeEditar && !Number(f.ativa) ? `<button type="button" class="btn ghost" data-rest="${f.id}">Restaurar</button>` : ''}${d.podeEditar ? `<a class="btn ghost" href="${API}/carometro/foto?id=${f.id}&tam=original">Original</a>` : ''}${d.podeExcluir ? `<button type="button" class="btn ghost danger" data-exc="${f.id}">Excluir</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
  const dlg = dialogo(`<div class="cm-ficha"><div>${cmFoto(a, 'padrao')}${d.podeEditar ? `<input type="file" id="cmArq" accept="image/jpeg,image/png,image/webp" hidden><button type="button" class="btn" id="cmEnviar">${atual ? 'Substituir foto…' : 'Enviar foto…'}</button>${atual ? '<button type="button" class="btn ghost" id="cmRetirar">Retirar foto atual</button>' : ''}<p class="kpi-note">JPG, PNG ou WebP, até 5 MB. A foto é recortada em 3:4 sem distorcer; o original fica guardado.</p>` : '<p class="kpi-note">Só a Gerência envia ou troca fotos.</p>'}</div><div><h3>${esc(a.nome)}</h3><table class="datatable"><tbody><tr><th>Matrícula</th><td>${esc(a.matricula)}</td></tr><tr><th>Ano letivo</th><td>${esc(a.anoLetivo)}</td></tr><tr><th>Segmento</th><td>${esc(seg)}</td></tr><tr><th>Série</th><td>${esc(a.serie || '—')}</td></tr><tr><th>Turma</th><td>${esc(a.turma || '—')} <small>(${fmtN(a.colegasNaTurma)} aluno(s))</small></td></tr><tr><th>Autorização de imagem</th><td>${cmSelo(a.autorizacao)}<br><small>${aut}</small></td></tr></tbody></table><p class="kpi-note">Informativo. Ter foto cadastrada não significa autorização para publicar. Alterações no cadastro são feitas em Uso de Imagem › Alunos.</p>${hist}<div class="ig-barra"><button type="button" class="btn" data-close>Fechar</button></div></div></div>`, { larga: true, aoFechar: () => { if (state.page === 'cmvisao') go('cmvisao'); } });
  const recarrega = () => { dlg.close(); cmFicha(id); };
  const el = dlg.el;
  const enviar = el.querySelector('#cmEnviar');
  if (enviar) {
    enviar.onclick = () => el.querySelector('#cmArq').click();
    el.querySelector('#cmArq').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 5 * 1048576) { toast('A foto passa de 5 MB.', 'warn'); return; }
      const fd = new FormData(); fd.append('aluno_id', id); fd.append('arquivo', f);
      enviar.disabled = true; enviar.textContent = 'Enviando…';
      try { const r = await api('/carometro/foto', { method: 'POST', body: fd }); toast(r.aviso ? 'Foto salva. ' + r.aviso : 'Foto salva', r.aviso ? 'warn' : undefined); recarrega(); } catch (err) { toast(err.message, 'warn'); enviar.disabled = false; enviar.textContent = 'Enviar foto…'; }
    };
  }
  const retirar = el.querySelector('#cmRetirar');
  if (retirar) retirar.onclick = async () => { if (await Dlg.confirmar({ titulo: 'Retirar a foto atual?', texto: 'Ela continua no histórico e pode ser restaurada.', confirmar: 'Retirar' })) { await post('/carometro/foto/remover', { aluno_id: id }); toast('Foto retirada'); recarrega(); } };
  el.querySelectorAll('[data-rest]').forEach(b => { b.onclick = async () => { await post('/carometro/foto/restaurar', { id: +b.dataset.rest }); toast('Versão restaurada'); recarrega(); }; });
  el.querySelectorAll('[data-exc]').forEach(b => { b.onclick = async () => { if (await Dlg.confirmar({ titulo: 'Excluir esta versão?', texto: 'Original, foto padrão e miniatura serão apagados definitivamente e não há como desfazer.', confirmar: 'Excluir', perigo: true })) { await post('/carometro/foto/excluir', { id: +b.dataset.exc }); toast('Versão excluída'); recarrega(); } }; });
}
const SEGMENTOS_ROT = { MATERNAL: 'Maternais', INFANTIL: 'Infantil 1, 2 e 3', JARDINS: 'Jardins', INICIAIS: 'Anos Iniciais', FINAIS: 'Anos Finais', MEDIO: 'Ensino Médio' };

/* ---- Importação e associação (fotos em lote com simulação) ---- */
const CM_EST = { ok: ['Pronta', 'ok'], sugerida: ['Confirmar', 'warn'], ambigua: ['Escolher aluno', 'warn'], orfa: ['Sem aluno', 'bad'], invalida: ['Inválida', 'bad'], ignorada: ['Ignorada', 'mute'] };
const CM_LOTE = { simulado: 'Em simulação', aplicado: 'Aplicado', cancelado: 'Cancelado', desfeito: 'Desfeito' };
PAGINAS.cmimport = async function () {
  $('#content').innerHTML = `<section class="card"><div class="db-tit"><h2>1. Lista de alunos</h2></div><p class="kpi-note">O cadastro de alunos é o mesmo do Uso de Imagem. A importação mostra uma prévia antes de gravar, atualiza pela matrícula e nunca apaga ninguém.</p><div class="ig-barra"><button type="button" class="btn" id="cmImpAlunos">Importar lista de alunos…</button></div></section>
    <section class="card"><div class="db-tit"><h2>2. Fotos em lote</h2></div><p class="kpi-note">Nome do arquivo = matrícula (ex.: <b>2026001.jpg</b>). Dá para enviar também um manifesto (<b>matricula;nome_arquivo;origem</b>). Nada vira foto de aluno antes de você conferir e aplicar. Nomes só são sugeridos, nunca associados sozinhos.</p>
      <div class="ig-barra"><input type="file" id="cmFotos" accept="image/jpeg,image/png,image/webp" multiple aria-label="Fotos dos alunos"><input type="file" id="cmManifesto" accept=".csv,.txt,text/csv,text/plain" aria-label="Manifesto opcional (CSV)"><button type="button" class="btn" id="cmSimular">Simular importação</button></div><div id="cmProg" class="kpi-note"></div></section>
    <div id="cmLote"></div><section class="card"><div class="db-tit"><h2>Lotes recentes</h2></div><div id="cmLotes"></div></section>`;
  $('#cmImpAlunos').onclick = () => uiImportar(() => toast('Lista de alunos atualizada'));
  const desenhaLotes = async () => {
    const d = await api('/carometro/lotes');
    $('#cmLotes').innerHTML = d.rows.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Lote</th><th>Situação</th><th>Criado</th><th>Resultado</th><th></th></tr></thead><tbody>${d.rows.map(l => `<tr><td>#${l.id}</td><td>${esc(CM_LOTE[l.estado] || l.estado)}</td><td>${esc(fmtDateTime(l.criadoEm))} · ${esc(l.criadoPor)}</td><td>${esc(l.resumo || '—')}</td><td>${l.estado === 'simulado' ? `<button type="button" class="btn ghost" data-abre="${l.id}">Abrir</button>` : l.estado === 'aplicado' ? `<button type="button" class="btn ghost danger" data-desf="${l.id}">Desfazer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="kpi-note">Nenhum lote ainda.</p>';
    $$('#cmLotes [data-abre]').forEach(b => { b.onclick = () => desenhaLote(+b.dataset.abre); });
    $$('#cmLotes [data-desf]').forEach(b => { b.onclick = async () => { if (await Dlg.confirmar({ titulo: 'Desfazer este lote?', texto: 'As fotos aplicadas por ele são retiradas e a foto anterior volta a ser a atual. Fotos já alteradas depois ficam como estão.', confirmar: 'Desfazer', perigo: true })) { const r = await post('/carometro/lote/desfazer', { lote_id: +b.dataset.desf }); toast(`${r.desfeitas} foto(s) desfeita(s)`); desenhaLotes(); } }; });
  };
  const desenhaLote = async id => {
    const d = await api('/carometro/lote?id=' + id), r = d.resumo, aberto = d.lote.estado === 'simulado';
    const cart = (t, v, cls) => `<div class="db-cartao ui-cartao ${cls || ''}"><small>${t}</small><strong>${fmtN(v)}</strong></div>`;
    const acao = i => {
      if (!aberto || i.estado === 'invalida') return '';
      const ign = `<button type="button" class="btn ghost" data-ign="${i.id}">Ignorar</button>`;
      if (i.estado === 'ignorada') return `<button type="button" class="btn ghost" data-res="${i.id}">Reativar</button>`;
      if (i.estado === 'sugerida') return `<button type="button" class="btn" data-conf="${i.id}">Confirmar</button>${ign}`;
      if (i.estado === 'ambigua' || i.estado === 'orfa') return `<input class="control cm-mat" data-mat="${i.id}" placeholder="Matrícula do aluno" aria-label="Matrícula do aluno para ${attr(i.arquivo)}"><button type="button" class="btn" data-vinc="${i.id}">Vincular</button>${ign}`;
      return ign;
    };
    $('#cmLote').innerHTML = `<section class="card" id="cmLoteCard"><div class="db-tit"><h2>Lote #${d.lote.id} · ${esc(CM_LOTE[d.lote.estado] || d.lote.estado)}</h2></div><div class="db-cartoes ui-seis">${cart('Prontas', r.prontos, 'ok')}${cart('Substituem foto', r.substituem)}${cart('Para confirmar', r.sugeridas, r.sugeridas ? 'alerta' : '')}${cart('Sem aluno', r.orfas + r.ambiguas, r.orfas + r.ambiguas ? 'alerta' : '')}${cart('Em conflito', r.conflitos, r.conflitos ? 'alerta' : '')}${cart('Inválidas', r.invalidas)}</div>
      <p class="kpi-note">${aberto ? 'Simulação: nada foi gravado nas fichas dos alunos. Decida os itens pendentes e aplique.' : esc(d.lote.resumo || '')}</p>
      <div class="tablewrap"><table class="datatable cm-lote"><thead><tr><th>Foto</th><th>Arquivo</th><th>Aluno</th><th>Regra</th><th>Situação</th><th></th></tr></thead><tbody>${d.itens.map(i => { const [t, c] = i.conflito ? ['Conflito', 'bad'] : CM_EST[i.estado] || [i.estado, 'mute']; return `<tr><td>${i.estado === 'invalida' ? '—' : `<img class="cm-mini" src="${API}/carometro/lote/foto?item=${i.id}&tam=mini" alt="Prévia de ${attr(i.arquivo)}" loading="lazy">`}</td><td>${esc(i.arquivo)}<br><small>${i.largura ? esc(i.largura + '×' + i.altura) : ''}${i.aviso ? ' · ' + esc(i.aviso) : ''}</small></td><td>${i.aluno ? `<b>${esc(i.aluno)}</b><br><small>${esc(i.matricula)} · ${esc(i.turma)}</small>${i.substitui ? '<br><small class="cm-aviso">substitui a foto atual</small>' : ''}` : '—'}</td><td>${esc(i.regra || '—')}${i.confianca ? `<br><small>confiança ${esc(i.confianca)}</small>` : ''}</td><td><span class="cm-selo ${c}">${esc(t)}</span>${i.motivo ? `<br><small>${esc(i.motivo)}</small>` : ''}</td><td class="cm-acoes">${acao(i)}</td></tr>`; }).join('')}</tbody></table></div>
      ${aberto ? `<div class="ig-barra"><button type="button" class="btn" id="cmAplicar" ${d.pendencias || !r.prontos ? 'disabled' : ''}>Aplicar lote (${fmtN(r.prontos)} foto(s))</button><button type="button" class="btn ghost" id="cmCancelarLote">Cancelar lote (nada é gravado)</button>${d.pendencias ? `<span class="kpi-note">Resolva ${fmtN(d.pendencias)} item(ns) pendente(s) para aplicar.</span>` : ''}</div>` : ''}</section>`;
    const tudo = async (caminho, corpo) => { await post(caminho, { lote_id: id, ...corpo }); desenhaLote(id); };
    $$('#cmLote [data-ign]').forEach(b => { b.onclick = () => tudo('/carometro/lote/resolver', { item_id: +b.dataset.ign, acao: 'ignorar' }); });
    $$('#cmLote [data-res]').forEach(b => { b.onclick = () => tudo('/carometro/lote/resolver', { item_id: +b.dataset.res, acao: 'restaurar' }); });
    $$('#cmLote [data-conf]').forEach(b => { b.onclick = () => tudo('/carometro/lote/resolver', { item_id: +b.dataset.conf, acao: 'confirmar' }); });
    $$('#cmLote [data-vinc]').forEach(b => {
      b.onclick = async () => {
        const mat = ($(`[data-mat="${b.dataset.vinc}"]`).value || '').trim(); if (!mat) { toast('Digite a matrícula do aluno.', 'warn'); return; }
        const achou = (await api('/carometro/alunos?busca=' + encodeURIComponent(mat))).rows.filter(a => a.matricula.toLowerCase() === mat.toLowerCase());
        if (achou.length !== 1) { toast('Nenhum aluno com esta matrícula.', 'warn'); return; }
        tudo('/carometro/lote/resolver', { item_id: +b.dataset.vinc, acao: 'vincular', aluno_id: achou[0].id });
      };
    });
    $('#cmAplicar') && ($('#cmAplicar').onclick = async () => { if (await Dlg.confirmar({ titulo: 'Aplicar o lote?', texto: `${r.prontos} foto(s) passam a ser a foto atual dos alunos${r.substituem ? `; ${r.substituem} substituem uma foto anterior (que fica no histórico)` : ''}. Dá para desfazer depois.`, confirmar: 'Aplicar' })) { const x = await post('/carometro/lote/aplicar', { lote_id: id }); toast(`${x.aplicadas} foto(s) aplicada(s)`); desenhaLote(id); desenhaLotes(); } });
    $('#cmCancelarLote') && ($('#cmCancelarLote').onclick = async () => { if (await Dlg.confirmar({ titulo: 'Cancelar o lote?', texto: 'As fotos enviadas para a simulação são descartadas. Nenhuma ficha é alterada.', confirmar: 'Cancelar lote', perigo: true })) { await post('/carometro/lote/cancelar', { lote_id: id }); $('#cmLote').innerHTML = ''; desenhaLotes(); } });
  };
  $('#cmSimular').onclick = async () => {
    const arqs = [...$('#cmFotos').files]; if (!arqs.length) { toast('Escolha as fotos.', 'warn'); return; }
    const man = $('#cmManifesto').files[0] ? await $('#cmManifesto').files[0].text() : '';
    $('#cmSimular').disabled = true; let loteId = 0;
    try {
      for (let i = 0; i < arqs.length; i += 3) {
        $('#cmProg').textContent = `Enviando ${Math.min(i + 3, arqs.length)} de ${arqs.length}…`;
        const fd = new FormData(); if (loteId) fd.append('lote_id', loteId); else fd.append('manifesto', man);
        arqs.slice(i, i + 3).forEach(f => fd.append('arquivo', f));
        loteId = (await api('/carometro/lote/fotos', { method: 'POST', body: fd })).loteId;
      }
      $('#cmProg').textContent = ''; $('#cmFotos').value = ''; await desenhaLote(loteId); desenhaLotes();
    } catch (e) { toast(e.message, 'warn'); $('#cmProg').textContent = e.message; } finally { $('#cmSimular').disabled = false; }
  };
  await desenhaLotes();
  const aberto = (await api('/carometro/lotes')).rows.find(l => l.estado === 'simulado'); if (aberto) desenhaLote(aberto.id);
};
