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
