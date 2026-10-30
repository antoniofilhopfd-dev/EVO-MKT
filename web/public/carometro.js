/* Carômetro Escolar (etapa 1): consulta de alunos por segmento, série e turma, em grade ou lista, com ficha.
   Somente leitura sobre o cadastro do Uso de Imagem. Fotos entram na etapa 2; o selo de autorização é só informativo. */
const CM = { vista: 'grade', busca: '', segmento: '', serie: '', turma: '', foto: '', autorizacao: '', sel: new Map(), mais: 1 };
let cmNavVai = () => {};
const CM_AUT = { AUTORIZADO: ['Autorizado', 'ok'], NAO_AUTORIZADO: ['Não autorizado', 'bad'], SEM_INFORMACAO: ['Sem informação', 'mute'] };
const cmSelo = a => { const [t, c] = CM_AUT[a] || CM_AUT.SEM_INFORMACAO; return `<span class="cm-selo ${c}">${t}</span>`; };
const cmIniciais = n => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const cmFoto = (a, tam = 'mini') => a.fotoId
  ? `<div class="cm-foto"><img src="${API}/carometro/foto?id=${a.fotoId}&tam=${tam}" alt="Foto de ${attr(a.nome)}" loading="lazy" draggable="false"></div>`
  : `<div class="cm-foto sem" role="img" aria-label="${attr(a.nome)}, sem foto cadastrada"><b>${esc(cmIniciais(a.nome))}</b><small>Sem foto</small></div>`;

/* Fotos de câmera e celular costumam ter 5 a 15 MB. Antes de enviar, reduz para no máximo 2000 px no lado maior (JPEG) quando passa de 1,5 MB.
   O nome do arquivo (matrícula ou nome do aluno) é mantido. Se o navegador não conseguir ler a imagem, envia o arquivo como está. */
async function cmPrepararFoto(f) {
  if (!/^image\//.test(f.type) || f.size <= 1.5 * 1048576) return f;
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    const esc2 = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * esc2); c.height = Math.round(bmp.height * esc2);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
    if (!blob || (blob.size >= f.size && f.size <= 5 * 1048576)) return f;
    return new File([blob], f.name.replace(/\.[A-Za-z0-9]{2,5}$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return f; }
}

PAGINAS.cmvisao = async function () {
  $('#content').innerHTML = `<div class="ig-barra"><input id="cmBusca" class="control" type="search" placeholder="Buscar por nome ou matrícula" aria-label="Buscar aluno" value="${attr(CM.busca)}"><select id="cmSeg" class="control" aria-label="Segmento"></select><select id="cmSerie" class="control" aria-label="Série"></select><select id="cmTurma" class="control" aria-label="Turma"></select><select id="cmFotoF" class="control" aria-label="Situação da foto"><option value="">Com e sem foto</option><option value="sem">Pendentes (sem foto)</option><option value="com">Com foto</option></select><select id="cmAut" class="control" aria-label="Autorização de imagem"><option value="">Toda autorização</option><option value="AUTORIZADO">Autorizado</option><option value="NAO_AUTORIZADO">Não autorizado</option><option value="SEM_INFORMACAO">Sem informação</option></select></div>
    <div class="cm-nav" role="group" aria-label="Navegar entre as turmas"><button type="button" class="btn" id="cmPrev" aria-label="Turma anterior">◀</button><div class="cm-nav-txt" id="cmNavTxt" aria-live="polite"></div><button type="button" class="btn" id="cmNext" aria-label="Próxima turma">▶</button></div>
    <div class="ig-barra" id="cmGestaoBar"></div><div id="cmInd"></div><div class="ig-barra"><div class="cm-vistas" role="group" aria-label="Forma de exibição"><button type="button" class="btn ghost" data-vista="grade">▦ Grade</button><button type="button" class="btn ghost" data-vista="lista">☰ Lista</button></div><span class="kpi-note" id="cmSelTxt"></span><button type="button" class="btn" id="cmFotosTurma" hidden>Enviar fotos desta turma</button><button type="button" class="btn" id="cmSalvarSel" hidden>Salvar seleção…</button><button type="button" class="btn ghost" id="cmLimpar" hidden>Limpar seleção</button><button type="button" class="btn danger" id="cmExcluirAlunos" hidden>Excluir aluno</button></div>
    <div id="cmLista"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
  const acesso = await api('/carometro/acesso');
  $('#cmGestaoBar').innerHTML = `${acesso.substituir ? '<button type="button" class="btn ghost" id="cmAnoBtn">Revisão por ano letivo</button>' : ''}${Number(acesso.usuario?.admin) ? '<button type="button" class="btn ghost" id="cmPermBtn">Permissões do carômetro</button>' : ''}`;
  $('#cmAnoBtn') && ($('#cmAnoBtn').onclick=cmRevisaoAnual);
  $('#cmPermBtn') && ($('#cmPermBtn').onclick=cmPermissoes);
  $('#cmAut').value = CM.autorizacao; $('#cmFotoF').value = CM.foto;
  let atraso;
  const carrega = async () => {
    const p = new URLSearchParams({ busca: CM.busca, segmento: CM.segmento, serie: CM.serie, turma: CM.turma, foto: CM.foto, autorizacao: CM.autorizacao });
    const d = await api('/carometro/alunos?' + p);
    const opt = (v, t, sel) => `<option value="${attr(v)}" ${sel ? 'selected' : ''}>${esc(t)}</option>`;
    $('#cmSeg').innerHTML = opt('', 'Todos os segmentos', !CM.segmento) + d.segmentos.map(s => opt(s.k, s.nome, CM.segmento === s.k)).join('');
    $('#cmSerie').innerHTML = opt('', 'Todas as séries', !CM.serie) + d.series.map(s => opt(s, s, CM.serie === s)).join('');
    $('#cmTurma').innerHTML = opt('', 'Todas as turmas', !CM.turma) + d.turmas.map(s => opt(s, s, CM.turma === s)).join('');
    $('#cmFotosTurma').hidden = !CM.turma; $('#cmFotosTurma').onclick = () => { CM_IMP.turma = CM.turma; go('cmimport'); };
    /* seletor ◀ ▶ entre as turmas (com "Pendentes", pula as turmas sem pendência) */
    const lista = d.nav.filter(x => CM.foto !== 'sem' || x.semFoto > 0 || x.turma === CM.turma), pos = lista.findIndex(x => x.turma === CM.turma);
    const vai = k => { const alvo = lista[k]; if (!alvo) return; CM.serie = ''; CM.turma = alvo.turma; CM.busca = ''; muda(); };
    $('#cmPrev').disabled = !lista.length || pos <= 0; $('#cmNext').disabled = !lista.length || (pos >= 0 && pos >= lista.length - 1);
    $('#cmPrev').onclick = () => vai(pos - 1); $('#cmNext').onclick = () => vai(pos + 1);
    cmNavVai = dir => { if (dir < 0 && !$('#cmPrev').disabled) vai(pos - 1); if (dir > 0 && !$('#cmNext').disabled) vai(pos < 0 ? 0 : pos + 1); };
    const atual = pos >= 0 ? lista[pos] : null;
    $('#cmNavTxt').innerHTML = atual ? `<b>${esc(atual.turma)}</b><small>turma ${pos + 1} de ${lista.length} · ${fmtN(atual.alunos)} aluno(s) · ${fmtN(atual.semFoto)} sem foto</small>` : `<b>Todas as turmas</b><small>${CM.foto === 'sem' ? 'só as turmas com pendência · ' : ''}use ▶ (ou a seta →) para ver turma por turma</small>`;
    const i = d.indicadores, cart = (r, v, cls, filtro) => filtro ? `<button type="button" class="db-cartao ui-cartao cm-filtro ${cls || ''} ${CM.foto === filtro ? 'ativo' : ''}" data-ffoto="${filtro}" aria-pressed="${CM.foto === filtro}"><small>${r}</small><strong>${fmtN(v)}</strong></button>` : `<div class="db-cartao ui-cartao ${cls || ''}"><small>${r}</small><strong>${fmtN(v)}</strong></div>`;
    $('#cmInd').innerHTML = `<div class="db-cartoes ui-seis">${cart('Alunos (ano ' + esc(d.anoLetivo) + ')', i.alunos)}${cart('Com foto', i.comFoto, 'ok', 'com')}${cart('Sem foto (pendentes)', i.semFoto, i.semFoto ? 'alerta' : '', 'sem')}${cart('Possíveis duplicados', i.duplicados, i.duplicados ? 'alerta' : '')}${cart('Sem turma reconhecida', i.semTurma, i.semTurma ? 'alerta' : '')}</div>`;
    $$('#cmInd [data-ffoto]').forEach(b => { b.onclick = () => { CM.foto = CM.foto === b.dataset.ffoto ? '' : b.dataset.ffoto; $('#cmFotoF').value = CM.foto; muda(); }; });
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
  const atualizaSel = () => { const n = CM.sel.size, turmas = new Set([...CM.sel.values()].map(a => a.turma)).size; $('#cmSelTxt').textContent = n ? `${n} selecionado(s) de ${turmas} turma(s)` : ''; $('#cmLimpar').hidden = !n; $('#cmSalvarSel').hidden = !n; $('#cmExcluirAlunos').hidden = !n || !Number(acesso.usuario?.admin); $('#cmExcluirAlunos').textContent = n > 1 ? `Excluir alunos (${n})` : 'Excluir aluno'; };
  const muda = () => { CM.mais = 1; carrega(); };
  $('#cmBusca').oninput = e => { clearTimeout(atraso); atraso = setTimeout(() => { CM.busca = e.target.value; muda(); }, 250); };
  $('#cmSeg').onchange = e => { CM.segmento = e.target.value; CM.serie = ''; CM.turma = ''; muda(); };
  $('#cmSerie').onchange = e => { CM.serie = e.target.value; CM.turma = ''; muda(); };
  $('#cmTurma').onchange = e => { CM.turma = e.target.value; muda(); };
  $('#cmFotoF').onchange = e => { CM.foto = e.target.value; muda(); };
  $('#cmAut').onchange = e => { CM.autorizacao = e.target.value; muda(); };
  $('#cmSalvarSel').onclick = () => cmSalvarSelecao([...CM.sel.keys()], () => { CM.sel.clear(); go('cmselecoes'); });
  $('#cmExcluirAlunos').onclick = async () => {
    const alunos=[...CM.sel.values()].map(a=>({id:a.id,nome:a.nome,matricula:a.matricula}));
    if(!alunos.length)return;
    const dl=dialogo(`<h3>${alunos.length===1?'Excluir aluno?':'Excluir alunos selecionados?'}</h3><p>Confira o nome e a matrícula antes de excluir:</p><ul>${alunos.map(a=>`<li><b>${esc(a.nome)}</b> · matrícula ${esc(a.matricula)}</li>`).join('')}</ul><p>A exclusão é definitiva e remove o cadastro também de <b>Uso de Imagem</b>, além das fotos e vínculos do carômetro. Alunos com solicitações de autorização serão mantidos para preservar o histórico.</p><p id="cmExcluirErro" class="cm-erro" role="alert"></p><div class="actions dlg-acoes"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn danger" id="cmConfirmarExclusao">Excluir definitivamente</button></div>`,{larga:true});
    $('#cmConfirmarExclusao',dl.el).onclick=async()=>{
      const btn=$('#cmConfirmarExclusao',dl.el);btn.disabled=true;
      try {
        const r=await post('/carometro/alunos/excluir',{confirmar:true,alunos});
        (r.excluidosIds||[]).forEach(id=>CM.sel.delete(id));dl.close();atualizaSel();await carrega();
        if(r.excluidos)toast(`${r.excluidos} aluno(s) excluído(s)`);
        if(r.mantidos?.length)dialogo(`<h3>Alunos mantidos</h3><ul>${r.mantidos.map(a=>`<li><b>${esc(a.aluno)}</b>: ${esc(a.motivo)}</li>`).join('')}</ul><button type="button" class="btn" data-close>Fechar</button>`);
      } catch(e) { $('#cmExcluirErro',dl.el).textContent=e.message;btn.disabled=false; }
    };
  };
  $('#cmLimpar').onclick = () => { CM.sel.clear(); atualizaSel(); carrega(); };
  $$('.cm-vistas [data-vista]').forEach(b => { b.onclick = () => { CM.vista = b.dataset.vista; carrega(); }; });
  atualizaSel();
  await carrega();
};

PAGINAS.cmturmas = async function () {
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  const d = await api('/carometro/turmas');
  $('#content').innerHTML = `<p class="kpi-note">Ano letivo ${esc(d.anoLetivo)} · ${fmtN(d.total)} aluno(s) ativos. Clique em uma turma para ver os alunos.</p><div class="cm-segs">${d.segmentos.map(s => `<section class="card"><div class="db-tit"><h2>${esc(s.nome)}</h2><span class="kpi-note">${esc(s.detalhe)} · ${fmtN(s.alunos)} aluno(s)</span></div>${s.series.length ? s.series.map(g => `<div class="cm-serie"><b>${esc(g.serie)}</b><div class="cm-turmas">${g.turmas.map(t => `<span class="cm-par"><button type="button" class="btn ghost" data-seg="${attr(s.k)}" data-turma="${attr(t.turma)}" data-serie="${attr(g.serie)}">${esc(t.turma)} <small>(${fmtN(t.alunos)})</small></button><button type="button" class="btn ghost cm-fotos" data-fotos="${attr(t.turma)}" title="Enviar as fotos da turma ${attr(t.turma)}" aria-label="Enviar as fotos da turma ${attr(t.turma)}">Fotos</button></span>`).join('')}</div></div>`).join('') : '<p class="kpi-note">Nenhuma turma com alunos.</p>'}</section>`).join('')}${d.semSegmento ? `<section class="card ui-atencao"><div class="db-tit"><h2>Sem segmento reconhecido</h2></div><p class="kpi-note">${fmtN(d.semSegmento)} aluno(s) com turma vazia ou fora do padrão (ex.: “3º Ano A”, “Infantil 2 B”). Corrija em Uso de Imagem › Alunos.</p></section>` : ''}</div>`;
  $$('#content [data-fotos]').forEach(b => { b.onclick = () => { CM_IMP.turma = b.dataset.fotos; go('cmimport'); }; });
  $$('#content [data-turma]').forEach(b => { b.onclick = () => { CM.segmento = b.dataset.seg; CM.serie = b.dataset.serie; CM.turma = b.dataset.turma; CM.busca = ''; CM.foto = ''; CM.autorizacao = ''; CM.mais = 1; go('cmvisao'); }; });
};

async function cmFicha(id) {
  const d = await api('/carometro/aluno?id=' + id), a = d.aluno, fotos = d.fotos;
  const aut = a.autorizacao === 'SEM_INFORMACAO' ? 'Nenhuma autorização concluída no módulo Uso de Imagem.' : `Fonte: ${esc(a.autorizacaoFonte)}${a.autorizacaoDesde ? ' · desde ' + esc(fmtDate(a.autorizacaoDesde)) : ''}${a.autorizacaoValeAte ? ' · válida até ' + esc(fmtDate(a.autorizacaoValeAte)) : ''}`;
  const seg = SEGMENTOS_ROT[a.segmento] || 'Não reconhecido';
  const atual = fotos.find(f => Number(f.ativa));
  const hist = fotos.length ? `<h4>Histórico da foto</h4><div class="tablewrap"><table class="datatable"><thead><tr><th>Versão</th><th>Enviada</th><th>Por</th><th>Origem / tamanho</th><th></th></tr></thead><tbody>${fotos.map(f => `<tr><td>${f.versao}${Number(f.ativa) ? ' <span class="cm-selo ok">atual</span>' : ''}</td><td>${esc(fmtDateTime(f.enviado_em))}</td><td>${esc(f.enviado_por)}</td><td>${esc(f.origem || '—')}<br>${esc(f.largura)}×${esc(f.altura)}${f.aviso ? `<br><small class="cm-aviso">${esc(f.aviso)}</small>` : ''}</td><td class="cm-acoes">${d.podeEditar && !Number(f.ativa) ? `<button type="button" class="btn ghost" data-rest="${f.id}">Restaurar</button>` : ''}${d.podeBaixar ? `<a class="btn ghost" href="${API}/carometro/foto?id=${f.id}&tam=original">Original</a>` : ''}${d.podeExcluir ? `<button type="button" class="btn ghost danger" data-exc="${f.id}">Excluir</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
  const dlg = dialogo(`<div class="cm-ficha"><div>${cmFoto(a, 'padrao')}${d.podeEditar ? `<input type="file" id="cmArq" accept="image/*" hidden><button type="button" class="btn" id="cmEnviar">${atual ? 'Substituir foto…' : 'Enviar foto…'}</button>${atual ? '<button type="button" class="btn ghost" id="cmEnquadrarAtual">Enquadrar / girar foto atual</button><button type="button" class="btn ghost" id="cmRetirar">Retirar foto atual</button>' : ''}<p class="kpi-note">JPG, PNG ou WebP. Fotos grandes são reduzidas automaticamente antes do envio. A foto é recortada em 3:4 sem distorcer.</p><p class="cm-erro" id="cmFotoErro" role="alert"></p>` : '<p class="kpi-note">Só a Gerência envia ou troca fotos.</p>'}</div><div><h3>${esc(a.nome)}</h3><table class="datatable"><tbody><tr><th>Matrícula</th><td>${esc(a.matricula)}</td></tr><tr><th>Ano letivo</th><td>${esc(a.anoLetivo)}</td></tr><tr><th>Segmento</th><td>${esc(seg)}</td></tr><tr><th>Série</th><td>${esc(a.serie || '—')}</td></tr><tr><th>Turma</th><td>${esc(a.turma || '—')} <small>(${fmtN(a.colegasNaTurma)} aluno(s))</small></td></tr><tr><th>Autorização de imagem</th><td>${cmSelo(a.autorizacao)}<br><small>${aut}</small></td></tr></tbody></table><p class="kpi-note">Informativo. Ter foto cadastrada não significa autorização para publicar. Alterações no cadastro são feitas em Uso de Imagem › Alunos.</p>${hist}<div class="ig-barra"><button type="button" class="btn" data-close>Fechar</button></div></div></div>`, { larga: true, aoFechar: () => { if (state.page === 'cmvisao') go('cmvisao'); } });
  const recarrega = () => { dlg.close(); cmFicha(id); };
  const el = dlg.el;
  const enviar = el.querySelector('#cmEnviar');
  if (enviar) {
    enviar.onclick = () => el.querySelector('#cmArq').click();
    el.querySelector('#cmArq').onchange = async e => {
      const f0 = e.target.files[0]; if (!f0) return;
      const erro = el.querySelector('#cmFotoErro'); erro.textContent = '';
      enviar.disabled = true; enviar.textContent = 'Preparando a foto…';
      try {
        const f = await cmPrepararFoto(f0);
        if (f.size > 5 * 1048576) throw new Error('A foto continua com mais de 5 MB depois de reduzida. Escolha outra imagem.');
        const fd = new FormData(); fd.append('aluno_id', id); fd.append('arquivo', f);
        enviar.textContent = `Enviando ${Math.max(1, Math.round(f.size / 1024))} KB…`;
        const r = await api('/carometro/foto', { method: 'POST', body: fd });
        toast(r.aviso ? 'Foto salva. ' + r.aviso : 'Foto salva', r.aviso ? 'warn' : undefined); recarrega();
      } catch (err) { erro.textContent = 'Não foi possível enviar: ' + (err.message || 'erro desconhecido'); toast(err.message || 'Falha no envio', 'warn'); enviar.disabled = false; enviar.textContent = atual ? 'Substituir foto…' : 'Enviar foto…'; el.querySelector('#cmArq').value = ''; }
    };
  }
  const enquadrar=el.querySelector('#cmEnquadrarAtual');
  if(enquadrar) enquadrar.onclick=()=>cmEnquadrar(0,atual.id,recarrega,true);
  const retirar = el.querySelector('#cmRetirar');
  if (retirar) retirar.onclick = async () => { if (await Dlg.confirmar({ titulo: 'Retirar a foto atual?', texto: 'Ela continua no histórico e pode ser restaurada.', confirmar: 'Retirar' })) { await post('/carometro/foto/remover', { aluno_id: id }); toast('Foto retirada'); recarrega(); } };
  el.querySelectorAll('[data-rest]').forEach(b => { b.onclick = async () => { await post('/carometro/foto/restaurar', { id: +b.dataset.rest }); toast('Versão restaurada'); recarrega(); }; });
  el.querySelectorAll('[data-exc]').forEach(b => { b.onclick = async () => { if (await Dlg.confirmar({ titulo: 'Excluir esta versão?', texto: 'Original, foto padrão e miniatura serão apagados definitivamente e não há como desfazer.', confirmar: 'Excluir', perigo: true })) { await post('/carometro/foto/excluir', { id: +b.dataset.exc }); toast('Versão excluída'); recarrega(); } }; });
}
const SEGMENTOS_ROT = { MATERNAIS: 'Maternais', INFANTIL: 'Infantil 1–3', JARDINS: 'Jardins', INICIAIS: 'Anos Iniciais', FINAIS: 'Anos Finais', MEDIO: 'Ensino Médio' };

/* ---- Importação e associação (fotos em lote com simulação) ---- */
const CM_EST = { ok: ['Pronta', 'ok'], sugerida: ['Confirmar', 'warn'], ambigua: ['Escolher aluno', 'warn'], orfa: ['Sem aluno', 'bad'], invalida: ['Inválida', 'bad'], ignorada: ['Ignorada', 'mute'] };
const CM_LOTE = { simulado: 'Em simulação', aplicado: 'Aplicado', cancelado: 'Cancelado', desfeito: 'Desfeito' };
PAGINAS.cmimport = async function () {
  $('#content').innerHTML = `<section class="card"><div class="db-tit"><h2>1. Lista de alunos</h2></div><p class="kpi-note">O cadastro de alunos é o mesmo do Uso de Imagem. A importação mostra uma prévia antes de gravar, atualiza pela matrícula e nunca apaga ninguém.</p><div class="ig-barra"><button type="button" class="btn" id="cmImpAlunos">Importar lista de alunos…</button></div></section>
    <section class="card"><div class="db-tit"><h2>2. Fotos de uma turma (turma por turma)</h2></div><p class="kpi-note">Escolha a turma e envie <b>todas as fotos dela de uma vez</b>: selecione os arquivos (Ctrl+A na pasta) ou envie a pasta compactada em <b>ZIP</b> (até 60 MB). O arquivo pode se chamar pela <b>matrícula</b> (2026001.jpg) ou pelo <b>nome</b> (joao-silva.jpg); as fotos sem nome certo você liga ao aluno na lista da turma. Nada é gravado antes de você conferir e aplicar.</p>
      <div class="ig-barra"><select id="cmTurmaLote" class="control" aria-label="Turma das fotos"><option value="">Escolha a turma…</option></select><input type="file" id="cmFotosT" accept="image/*,.zip,application/zip" multiple aria-label="Fotos da turma (ou um ZIP com as fotos)"><button type="button" class="btn" id="cmSimularT">Simular turma</button></div><div id="cmProgT" class="kpi-note"></div></section>
    <section class="card"><div class="db-tit"><h2>3. Fotos de várias turmas (por matrícula)</h2></div><p class="kpi-note">Nome do arquivo = matrícula (ex.: <b>2026001.jpg</b>). Dá para enviar também um manifesto (<b>matricula;nome_arquivo;origem</b>). Nada vira foto de aluno antes de você conferir e aplicar. Nomes só são sugeridos, nunca associados sozinhos.</p>
      <div class="ig-barra"><input type="file" id="cmFotos" accept="image/*,.zip" multiple aria-label="Fotos dos alunos"><input type="file" id="cmManifesto" accept=".csv,.txt,text/csv,text/plain" aria-label="Manifesto opcional (CSV)"><button type="button" class="btn" id="cmSimular">Simular importação</button></div><div id="cmProg" class="kpi-note" aria-live="polite"></div><label class="ui-campo">Ou selecionar uma pasta com subpastas por turma<input id="cmPastas" type="file" webkitdirectory multiple></label><button type="button" class="btn" id="cmEnviarPastas">Adicionar pastas à fila</button></section>
    <section class="card"><div class="db-tit"><h2>Fila de importação</h2></div><p class="kpi-note">Cada envio acrescenta um lote. Os rascunhos e as associações ficam salvos no servidor. Confira cada lote e selecione os que deseja aplicar juntos.</p><div id="cmFila"></div></section><div id="cmLote"></div><section class="card"><div class="db-tit"><h2>Lotes recentes</h2></div><div id="cmLotes"></div></section>`;
  $('#cmImpAlunos').onclick = () => uiImportar(() => toast('Lista de alunos atualizada'));
  const arvore = await api('/carometro/turmas');
  const listaTurmas = arvore.segmentos.flatMap(sg => sg.series.flatMap(g => g.turmas));
  $('#cmTurmaLote').innerHTML = '<option value="">Escolha a turma…</option>' + listaTurmas.map(t => `<option value="${attr(t.turma)}">${esc(t.turma)} (${fmtN(t.alunos)})</option>`).join('');
  if (CM_IMP.turma && listaTurmas.some(t => t.turma === CM_IMP.turma)) { $('#cmTurmaLote').value = CM_IMP.turma; setTimeout(() => $('#cmFotosT').focus(), 50); } CM_IMP.turma = '';
  let ocupado = false;
  const desenhaLotes = async () => {
    const d = await api('/carometro/lotes');
    const abertos = d.rows.filter(l => l.estado === 'simulado');
    $('#cmFila').innerHTML = abertos.length ? abertos.map(l => `<label class="cm-chk"><input type="checkbox" data-fila="${l.id}"> Lote #${l.id} · ${esc(l.turma || 'Várias turmas')} · ${esc(fmtDateTime(l.criadoEm))}</label>`).join('') + '<button type="button" class="btn" id="cmAplicarFila">Conferir resumo e aplicar selecionados</button>' : '<p class="kpi-note">Adicione as fotos para começar.</p>';
    $('#cmAplicarFila') && ($('#cmAplicarFila').onclick = async () => {
      const ids = $$('#cmFila [data-fila]:checked').map(b => +b.dataset.fila);
      if (!ids.length) return toast('Selecione os lotes da fila.', 'warn');
      const lotes = await Promise.all(ids.map(id => api('/carometro/lote?id=' + id)));
      if (lotes.some(l => l.pendencias || !l.resumo.prontos)) return toast('Confira os lotes e resolva as pendências antes de aplicar.', 'warn');
      const alunos = lotes.flatMap(l => l.itens.filter(i => i.estado === 'ok').map(i => i.alunoId));
      if (new Set(alunos).size !== alunos.length) return toast('Um aluno aparece em mais de um lote selecionado. Abra os lotes e ignore a foto que não deseja usar.', 'warn');
      const total = lotes.reduce((n,l) => n+l.resumo.prontos,0), substituem = lotes.reduce((n,l) => n+l.resumo.substituem,0);
      if (!await Dlg.confirmar({titulo:'Aplicar a fila conferida?',texto:`${ids.length} lote(s), ${total} foto(s), ${substituem} substituição(ões). Cada lote pode ser desfeito separadamente.`,confirmar:'Aplicar selecionados'})) return;
      $('#cmAplicarFila').disabled = true;
      try { await post('/carometro/lote/aplicar-fila',{ids}); toast('Lotes aplicados'); }
      catch(e) { toast('A fila não foi aplicada: ' + e.message + '. As alterações foram desfeitas.', 'warn'); }
      await desenhaLotes();
    });
    $('#cmLotes').innerHTML = d.rows.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Lote</th><th>Situação</th><th>Criado</th><th>Resultado</th><th></th></tr></thead><tbody>${d.rows.map(l => `<tr><td>#${l.id}${l.turma ? ' · ' + esc(l.turma) : ''}</td><td>${esc(CM_LOTE[l.estado] || l.estado)}</td><td>${esc(fmtDateTime(l.criadoEm))} · ${esc(l.criadoPor)}</td><td>${esc(l.resumo || '—')}</td><td>${l.estado === 'simulado' ? `<button type="button" class="btn ghost" data-abre="${l.id}">Abrir</button>` : l.estado === 'aplicado' ? `<button type="button" class="btn ghost danger" data-desf="${l.id}">Desfazer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="kpi-note">Nenhum lote ainda.</p>';
    $$('#cmLotes [data-abre]').forEach(b => { b.onclick = () => desenhaLote(+b.dataset.abre); });
    $$('#cmLotes [data-desf]').forEach(b => { b.onclick = async () => { if (await Dlg.confirmar({ titulo: 'Desfazer este lote?', texto: 'As fotos aplicadas por ele são retiradas e a foto anterior volta a ser a atual. Fotos já alteradas depois ficam como estão.', confirmar: 'Desfazer', perigo: true })) { const r = await post('/carometro/lote/desfazer', { lote_id: +b.dataset.desf }); toast(`${r.desfeitas} foto(s) desfeita(s)`); desenhaLotes(); } }; });
  };
  const desenhaLote = async id => {
    const d = await api('/carometro/lote?id=' + id), r = d.resumo, aberto = d.lote.estado === 'simulado';
    const cart = (t, v, cls) => `<div class="db-cartao ui-cartao ${cls || ''}"><small>${t}</small><strong>${fmtN(v)}</strong></div>`;
    const acao = i => {
      if (!aberto || i.estado === 'invalida') return '';
      const ign = `<button type="button" class="btn ghost" data-ign="${i.id}">${i.substitui ? 'Manter foto atual' : 'Ignorar'}</button><button type="button" class="btn ghost" data-pend="${i.id}">Deixar pendente</button>`;
      if (i.estado === 'ignorada') return `<button type="button" class="btn ghost" data-res="${i.id}">Reativar</button>`;
      if (i.estado === 'sugerida') return `<button type="button" class="btn ghost" data-troca="${i.id}">Corrigir aluno</button><button type="button" class="btn" data-conf="${i.id}">Confirmar</button>${ign}`;
      if ((i.estado === 'ambigua' || i.estado === 'orfa') && d.lote.turma) return `<select class="control cm-mat" data-alu="${i.id}" aria-label="Aluno para ${attr(i.arquivo)}"><option value="">Escolher aluno…</option>${d.faltam.concat(i.alunoId ? [] : []).map(a => `<option value="${a.id}">${esc(a.nome)} (${esc(a.matricula)})</option>`).join('')}</select>${ign}`;
      if (i.estado === 'ambigua' || i.estado === 'orfa') return `<input class="control cm-mat" data-mat="${i.id}" placeholder="Matrícula do aluno" aria-label="Matrícula do aluno para ${attr(i.arquivo)}"><button type="button" class="btn" data-vinc="${i.id}">Vincular</button>${ign}`;
      return `<button type="button" class="btn ghost" data-troca="${i.id}">Corrigir aluno</button>${ign}`;
    };
    $('#cmLote').innerHTML = `<section class="card" id="cmLoteCard"><div class="db-tit"><h2>Lote #${d.lote.id}${d.lote.turma ? ' · ' + esc(d.lote.turma) : ''} · ${esc(CM_LOTE[d.lote.estado] || d.lote.estado)}</h2></div>${d.lote.turma && aberto ? `<p class="kpi-note">${d.faltam.length ? `Ainda sem foto neste lote (${fmtN(d.faltam.length)} de ${fmtN(d.alunosTurma.length)}): ${esc(d.faltam.slice(0, 12).map(a => a.nome).join(', '))}${d.faltam.length > 12 ? '…' : ''}.` : 'Todos os alunos da turma têm foto neste lote.'}</p>` : ''}<div class="db-cartoes ui-seis">${cart('Total de fotos', r.total) + cart('Turmas', r.turmas) + cart('Prontas', r.prontos, 'ok')}${cart('Substituem foto', r.substituem)}${cart('Para confirmar', r.sugeridas, r.sugeridas ? 'alerta' : '')}${cart('Sem aluno', r.orfas + r.ambiguas, r.orfas + r.ambiguas ? 'alerta' : '')}${cart('Em conflito', r.conflitos, r.conflitos ? 'alerta' : '')}${cart('Inválidas', r.invalidas)}</div>
      <p class="kpi-note">${aberto ? 'Simulação: nada foi gravado nas fichas dos alunos. Decida os itens pendentes e aplique.' : esc(d.lote.resumo || '')}</p>
      <div class="tablewrap"><table class="datatable cm-lote"><thead><tr><th>Foto</th><th>Arquivo</th><th>Aluno</th><th>Regra</th><th>Situação</th><th></th></tr></thead><tbody>${d.itens.map(i => { const [t, c] = i.conflito ? ['Conflito', 'bad'] : CM_EST[i.estado] || [i.estado, 'mute']; return `<tr><td>${i.estado === 'invalida' || !aberto ? '—' : `<button type="button" class="cm-zoombtn" data-zoom="${i.id}" data-nome="${attr(i.arquivo)}" aria-label="Ampliar ${attr(i.arquivo)}"><img class="cm-mini grande" src="${API}/carometro/lote/foto?item=${i.id}&tam=mini" alt="Prévia de ${attr(i.arquivo)}" loading="lazy"></button>`}</td><td>${esc(i.arquivo)}<br><small>${i.largura ? esc(i.largura + '×' + i.altura) : ''}${i.aviso ? ' · ' + esc(i.aviso) : ''}</small></td><td>${i.aluno ? `<b style="font-size:1.1rem">${esc(i.aluno)}</b><br><small>${esc(i.matricula)} · ${esc(i.turma)}</small>${i.substitui && aberto ? `<br><small class="cm-aviso">substitui a foto atual</small><br><img class="cm-mini grande" src="${API}/carometro/foto?id=${i.fotoAtual}&tam=mini" alt="Foto atual de ${attr(i.aluno)}" loading="lazy">` : ''}` : '—'}</td><td>${esc(i.regra || '—')}${i.confianca ? `<br><small>confiança ${esc(i.confianca)}</small>` : ''}</td><td><span class="cm-selo ${c}">${esc(t)}</span>${i.motivo ? `<br><small>${esc(i.motivo)}</small>` : ''}${i.turmaDivergente ? '<br><b class="cm-aviso">Turma alterada: corrija a associação.</b>' : ''}${i.outrosLotes?.length ? `<br><b class="cm-aviso">Também nos lotes ${i.outrosLotes.map(n=>'#'+n).join(', ')}. Escolha qual foto manter.</b>` : ''}</td><td class="cm-acoes">${acao(i)}${aberto && i.estado !== 'invalida' ? `<button type="button" class="btn ghost" data-crop="${i.id}">Enquadrar / girar</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
      ${aberto ? `<div class="ig-barra"><button type="button" class="btn" id="cmAplicar" ${d.pendencias || !r.prontos ? 'disabled' : ''}>Aplicar lote (${fmtN(r.prontos)} foto(s))</button>${d.lote.turma && r.orfas + r.ambiguas > 0 && d.faltam.length ? '<button type="button" class="btn ghost" id="cmOrdem">Ligar pela ordem dos arquivos</button>' : ''}${d.itens.some(i => i.estado === 'sugerida' && i.regra !== 'Ordem dos arquivos') ? '<button type="button" class="btn ghost" id="cmConfTodas">Confirmar todas as sugestões</button>' : ''}<button type="button" class="btn ghost" id="cmCancelarLote">Cancelar lote (nada é gravado)</button>${d.pendencias ? `<span class="kpi-note">Resolva ${fmtN(d.pendencias)} item(ns) pendente(s) para aplicar.</span>` : ''}</div>` : ''}</section>`;
    const tudo = async (caminho, corpo) => { await post(caminho, { lote_id: id, ...corpo }); desenhaLote(id); };
    $$('#cmLote [data-crop]').forEach(b => { b.onclick = () => cmEnquadrar(id, +b.dataset.crop, () => desenhaLote(id)); });
    $$('#cmLote [data-troca]').forEach(b => { b.onclick = () => {
      const dl = dialogo('<h3>Corrigir aluno</h3><label class="ui-campo">Matrícula<input id="cmCorrMat" class="control"></label><p id="cmCorrErro" role="alert"></p><button class="btn" id="cmCorrOk">Vincular</button>');
      $('#cmCorrOk',dl.el).onclick = async () => { try {
        const mat=$('#cmCorrMat',dl.el).value.trim();
        const candidatos=(await api('/carometro/alunos?busca='+encodeURIComponent(mat))).rows.filter(a=>a.matricula.toLowerCase()===mat.toLowerCase());
        if(candidatos.length!==1) throw new Error('Matrícula não encontrada ou ambígua.');
        await tudo('/carometro/lote/resolver',{item_id:+b.dataset.troca,acao:'vincular',aluno_id:candidatos[0].id}); dl.close();
      } catch(e) { $('#cmCorrErro',dl.el).textContent=e.message; } };
    }; });
    $$('#cmLote [data-pend]').forEach(b=>{b.onclick=()=>tudo('/carometro/lote/resolver',{item_id:+b.dataset.pend,acao:'pendente'});});
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
    $$('#cmLote [data-alu]').forEach(b => { b.onchange = () => { if (b.value) tudo('/carometro/lote/resolver', { item_id: +b.dataset.alu, acao: 'vincular', aluno_id: +b.value }); }; });
    $$('#cmLote [data-zoom]').forEach(b => { b.onclick = () => dialogo(`<h3>${esc(b.dataset.nome)}</h3><img class="cm-zoom" src="${API}/carometro/lote/foto?item=${b.dataset.zoom}&tam=padrao" alt="Foto ${attr(b.dataset.nome)}"><div class="actions dlg-acoes"><button type="button" class="btn" data-close>Fechar</button></div>`); });
    $('#cmOrdem') && ($('#cmOrdem').onclick = async () => { if (await Dlg.confirmar({ titulo: 'Ligar pela ordem dos arquivos?', texto: 'As fotos sem aluno são ligadas aos alunos que faltam, na ordem dos nomes dos arquivos e na ordem alfabética da turma. Servem como sugestão: confira o rosto de cada uma antes de aplicar.', confirmar: 'Ligar pela ordem' })) { try { const x = await post('/carometro/lote/preencher-ordem', { lote_id: id }); toast(`${x.ligadas} foto(s) ligadas${x.sobraram ? `; ${x.sobraram} sobraram sem aluno` : ''}`); desenhaLote(id); } catch (e) { toast(e.message, 'warn'); } } });
    $('#cmConfTodas') && ($('#cmConfTodas').onclick = async () => { if (await Dlg.confirmar({ titulo: 'Confirmar todas as sugestões?', texto: 'Confirme só depois de conferir o rosto de cada foto com o nome do aluno.', confirmar: 'Confirmar todas' })) { const x = await post('/carometro/lote/confirmar-todas', { lote_id: id }); toast(`${x.confirmadas} sugestão(ões) confirmadas`); desenhaLote(id); } });
    $('#cmAplicar') && ($('#cmAplicar').onclick = async () => { if (await Dlg.confirmar({ titulo: 'Aplicar o lote?', texto: `${r.prontos} foto(s) passam a ser a foto atual dos alunos${r.substituem ? `; ${r.substituem} substituem uma foto anterior (que fica no histórico)` : ''}. Dá para desfazer depois.`, confirmar: 'Aplicar' })) { const x = await post('/carometro/lote/aplicar', { lote_id: id }); toast(`${x.aplicadas} foto(s) aplicada(s)`); desenhaLote(id); desenhaLotes(); if (d.lote.turma) { const k = listaTurmas.findIndex(t => t.turma === d.lote.turma); if (k >= 0 && listaTurmas[k + 1]) $('#cmTurmaLote').value = listaTurmas[k + 1].turma; } } });
    $('#cmCancelarLote') && ($('#cmCancelarLote').onclick = async () => { if (await Dlg.confirmar({ titulo: 'Cancelar o lote?', texto: 'As fotos enviadas para a simulação são descartadas. Nenhuma ficha é alterada.', confirmar: 'Cancelar lote', perigo: true })) { await post('/carometro/lote/cancelar', { lote_id: id }); $('#cmLote').innerHTML = ''; desenhaLotes(); } });
  };
  const simular = async (btn, prog, arqs, man, turma) => {
    if (!arqs.length) { toast('Escolha as fotos.', 'warn'); return; }
    if (ocupado) { toast('Aguarde o envio em andamento.', 'warn'); return; }
    ocupado = true; btn.disabled = true; let loteId = 0; const falhas=[];
    try {
      loteId = (await post('/carometro/lote/criar',{manifesto:man,turma})).loteId;
      const enviar = async lista => {
        for (let i=0;i<lista.length;i++) {
          const f0=lista[i]; prog.textContent=`Lote #${loteId}: enviando ${i+1} de ${lista.length}…`;
          try {
            const fd=new FormData();fd.append('lote_id',loteId);fd.append('arquivo',/\.zip$/i.test(f0.name)?f0:await cmPrepararFoto(f0));
            await api('/carometro/lote/fotos',{method:'POST',body:fd});
          } catch(e) { falhas.push(f0); }
        }
      };
      await enviar(arqs);
      await desenhaLote(loteId); await desenhaLotes();
      prog.textContent = falhas.length ? `${falhas.length} arquivo(s) falharam; os demais ficaram salvos no lote #${loteId}. ` : `Lote #${loteId} salvo para conferência. Adicione outra turma quando quiser.`;
      if(falhas.length) {
        const retry=document.createElement('button');retry.className='btn';retry.textContent='Tentar novamente só as falhas';prog.appendChild(retry);
        retry.onclick=async()=>{retry.disabled=true;const pend=falhas.splice(0);await enviar(pend);await desenhaLote(loteId);await desenhaLotes();prog.textContent=falhas.length?`${falhas.length} arquivo(s) ainda falharam. Selecione-os para um novo envio.`:'Envio recuperado.';};
      }
    } catch(e) { toast(e.message,'warn');prog.textContent=`${e.message}${loteId?' · rascunho salvo: lote #'+loteId:''}`; }
    finally { ocupado=false;btn.disabled=false; }
  };
  $('#cmEnviarPastas').onclick = async () => {
    const grupos=new Map();
    for(const f of $('#cmPastas').files) {
      if(!/\.(jpe?g|png|webp)$/i.test(f.name)) continue;
      const partes=f.webkitRelativePath.split('/'); const turma=partes[partes.length-2];
      if(!listaTurmas.some(t=>t.turma===turma)) {toast(`Pasta “${turma}” não corresponde a uma turma. Renomeie a pasta para o nome cadastrado.`, 'warn');return;}
      if(!grupos.has(turma)) grupos.set(turma,[]); grupos.get(turma).push(f);
    }
    if(!grupos.size) return toast('Escolha uma pasta com fotos em subpastas por turma.','warn');
    if(!await Dlg.confirmar({titulo:'Adicionar pastas por turma?',texto:[...grupos].map(([t,fs])=>`${t}: ${fs.length} foto(s)`).join('; '),confirmar:'Adicionar à fila'})) return;
    for(const [turma,arquivos] of grupos) await simular($('#cmEnviarPastas'),$('#cmProg'),arquivos,'',turma);
  };
  $('#cmSimular').onclick = async () => { const man = $('#cmManifesto').files[0] ? await $('#cmManifesto').files[0].text() : ''; await simular($('#cmSimular'), $('#cmProg'), [...$('#cmFotos').files], man, ''); $('#cmFotos').value = ''; };
  $('#cmSimularT').onclick = async () => { const turma = $('#cmTurmaLote').value; if (!turma) { toast('Escolha a turma.', 'warn'); return; } await simular($('#cmSimularT'), $('#cmProgT'), [...$('#cmFotosT').files], '', turma); $('#cmFotosT').value = ''; };
  await desenhaLotes();
  const aberto = (await api('/carometro/lotes')).rows.find(l => l.estado === 'simulado'); if (aberto) desenhaLote(aberto.id);
};

/* ---- Seleções salvas ---- */
function cmSalvarSelecao(ids, aoSalvar, atual) {
  const d = dialogo(`<h3>${atual ? 'Editar seleção' : 'Salvar seleção'}</h3><label class="ui-campo">Nome da seleção<input id="cmSelNome" class="control" maxlength="120" value="${attr(atual ? atual.nome : '')}" placeholder="Ex.: Monitores 2026"></label><label class="cm-chk"><input type="checkbox" id="cmSelComp" ${atual && atual.compartilhada ? 'checked' : ''}> Compartilhar com a equipe</label><p class="kpi-note">${fmtN(ids.length)} aluno(s). Salvar uma seleção não altera a matrícula nem o cadastro.</p><p class="cm-erro" id="cmSelErro" role="alert"></p><div class="actions dlg-acoes"><button type="button" class="btn soft" data-close>Cancelar</button><button type="button" class="btn" id="cmSelOk">Salvar</button></div>`);
  $('#cmSelNome', d.el).focus();
  $('#cmSelOk', d.el).onclick = async () => {
    try { await post('/carometro/selecao', { id: atual ? atual.id : 0, nome: $('#cmSelNome', d.el).value, compartilhada: $('#cmSelComp', d.el).checked, aluno_ids: ids }); d.close(); toast('Seleção salva'); aoSalvar(); }
    catch (e) { $('#cmSelErro', d.el).textContent = e.message; }
  };
}
PAGINAS.cmselecoes = async function () {
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  const d = await api('/carometro/selecoes');
  $('#content').innerHTML = `<div class="ig-barra"><button type="button" class="btn" id="cmNovaSel">+ Nova seleção</button><span class="kpi-note">Para criar: marque alunos (de uma ou várias turmas) na Visão geral e clique em “Salvar seleção”.</span></div>
    <section class="card">${d.rows.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Nome</th><th>Alunos</th><th>Turmas</th><th>Criada por</th><th>Atualizada</th><th></th></tr></thead><tbody>${d.rows.map(r => `<tr><td><b>${esc(r.nome)}</b>${r.compartilhada ? ' <span class="cm-selo mute">compartilhada</span>' : ''}</td><td>${fmtN(r.alunos)}</td><td>${fmtN(r.turmas)}</td><td>${esc(r.dono)}</td><td>${esc(fmtDateTime(r.atualizadoEm))}</td><td class="cm-acoes"><button type="button" class="btn ghost" data-abrir="${r.id}">Abrir</button>${r.podeEditar ? `<button type="button" class="btn ghost" data-edit="${r.id}">Editar</button>` : ''}<button type="button" class="btn ghost" data-dup="${r.id}">Duplicar</button>${r.podeEditar ? `<button type="button" class="btn ghost danger" data-del="${r.id}">Excluir</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Nenhuma seleção salva.</b><br>Marque alunos na Visão geral e salve a lista para reutilizar.</div>'}</section>`;
  $('#cmNovaSel').onclick = () => go('cmvisao');
  $$('#content [data-abrir]').forEach(b => { b.onclick = async () => { const x = await api('/carometro/selecao?id=' + b.dataset.abrir); CM.sel = new Map(x.alunos.map(a => [a.id, a])); CM.busca = ''; CM.segmento = ''; CM.serie = ''; CM.turma = ''; CM.foto = ''; CM.autorizacao = ''; go('cmvisao'); toast(`${x.alunos.length} aluno(s) selecionados`); }; });
  $$('#content [data-edit]').forEach(b => { b.onclick = async () => { const x = await api('/carometro/selecao?id=' + b.dataset.edit); cmEditarSelecao(x, () => PAGINAS.cmselecoes()); }; });
  $$('#content [data-dup]').forEach(b => { b.onclick = async () => { await post('/carometro/selecao/duplicar', { id: +b.dataset.dup }); toast('Seleção duplicada'); PAGINAS.cmselecoes(); }; });
  $$('#content [data-del]').forEach(b => { b.onclick = async () => { if (await Dlg.confirmar({ titulo: 'Excluir a seleção?', texto: 'Só a lista é apagada; os alunos e as fotos não são afetados.', confirmar: 'Excluir', perigo: true })) { await post('/carometro/selecao/excluir', { id: +b.dataset.del }); toast('Seleção excluída'); PAGINAS.cmselecoes(); } }; });
};
function cmEditarSelecao(x, aoFim) {
  const manter = new Set(x.alunos.map(a => a.id));
  const d = dialogo(`<h3>Editar seleção</h3><label class="ui-campo">Nome<input id="cmEdNome" class="control" maxlength="120" value="${attr(x.selecao.nome)}"></label><label class="cm-chk"><input type="checkbox" id="cmEdComp" ${x.selecao.compartilhada ? 'checked' : ''}> Compartilhar com a equipe</label><div class="tablewrap cm-edlist"><table class="datatable"><thead><tr><th>Aluno</th><th>Turma</th><th></th></tr></thead><tbody>${x.alunos.map(a => `<tr data-linha="${a.id}"><td>${esc(a.nome)}</td><td>${esc(a.turma)}</td><td><button type="button" class="btn ghost danger" data-tira="${a.id}">Tirar</button></td></tr>`).join('')}</tbody></table></div><p class="cm-erro" id="cmEdErro" role="alert"></p><div class="actions dlg-acoes"><button type="button" class="btn soft" data-close>Cancelar</button><button type="button" class="btn" id="cmEdOk">Salvar</button></div>`, { larga: true });
  $$('[data-tira]', d.el).forEach(b => { b.onclick = () => { manter.delete(+b.dataset.tira); b.closest('tr').remove(); }; });
  $('#cmEdOk', d.el).onclick = async () => { try { await post('/carometro/selecao', { id: x.selecao.id, nome: $('#cmEdNome', d.el).value, compartilhada: $('#cmEdComp', d.el).checked, aluno_ids: [...manter] }); d.close(); toast('Seleção salva'); aoFim(); } catch (e) { $('#cmEdErro', d.el).textContent = e.message; } };
}

/* ---- Sessões de fotos ---- */
const CM_SIT = [['pendente', 'Pendente'], ['fotografado', 'Fotografado'], ['ausente', 'Ausente'], ['refazer', 'Refazer']];
PAGINAS.cmsessoes = async function (abrirId) {
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  const d = await api('/carometro/sessoes');
  const hoje = new Date().toISOString().slice(0, 10);
  $('#content').innerHTML = `${d.podeEditar ? '<div class="ig-barra"><button type="button" class="btn" id="cmNovaSes">+ Nova sessão</button></div>' : ''}<section class="card">${d.rows.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Sessão</th><th>Data</th><th>Turma</th><th>Progresso</th><th>Situação</th><th></th></tr></thead><tbody>${d.rows.map(r => `<tr><td><b>${esc(r.nome)}</b></td><td>${esc(fmtDate(r.data))}</td><td>${esc(r.turma)}</td><td><div class="ui-barra"><i style="width:${r.total ? Math.round(r.fotografados / r.total * 100) : 0}%"></i></div><small>${r.fotografados}/${r.total}${r.ausentes ? ` · ${r.ausentes} ausente(s)` : ''}${r.refazer ? ` · ${r.refazer} p/ refazer` : ''}</small></td><td><span class="cm-selo ${r.status === 'concluida' ? 'ok' : 'warn'}">${r.status === 'concluida' ? 'Concluída' : 'Aberta'}</span></td><td class="cm-acoes"><button type="button" class="btn ghost" data-sess="${r.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Nenhuma sessão de fotos.</b>' + (d.podeEditar ? '<br>Crie uma sessão para acompanhar quem já foi fotografado em cada turma.' : '') + '</div>'}</section><div id="cmSessao"></div>`;
  $('#cmNovaSes') && ($('#cmNovaSes').onclick = () => {
    const dl = dialogo(`<h3>Nova sessão de fotos</h3><label class="ui-campo">Nome<input id="cmSsNome" class="control" maxlength="120" placeholder="Ex.: Fotos de rematrícula"></label><label class="ui-campo">Data<input id="cmSsData" class="control" type="date" value="${hoje}"></label><label class="ui-campo">Turma<select id="cmSsTurma" class="control"><option value="">Escolha…</option>${d.turmas.map(t => `<option>${esc(t)}</option>`).join('')}</select></label><label class="ui-campo">Observação (opcional)<input id="cmSsObs" class="control" maxlength="400"></label><p class="cm-erro" id="cmSsErro" role="alert"></p><div class="actions dlg-acoes"><button type="button" class="btn soft" data-close>Cancelar</button><button type="button" class="btn" id="cmSsOk">Criar sessão</button></div>`);
    $('#cmSsOk', dl.el).onclick = async () => { try { const r = await post('/carometro/sessao', { nome: $('#cmSsNome', dl.el).value, data: $('#cmSsData', dl.el).value, turma: $('#cmSsTurma', dl.el).value, obs: $('#cmSsObs', dl.el).value }); dl.close(); toast('Sessão criada'); await PAGINAS.cmsessoes(r.id); } catch (e) { $('#cmSsErro', dl.el).textContent = e.message; } };
  });
  const abre = async id => {
    const x = await api('/carometro/sessao?id=' + id), s = x.sessao, ed = x.podeEditar;
    $('#cmSessao').innerHTML = `<section class="card" id="cmSessaoCard"><div class="db-tit"><h2>${esc(s.nome)} · ${esc(s.turma)} · ${esc(fmtDate(s.data))}</h2></div>${s.obs ? `<p class="kpi-note">${esc(s.obs)}</p>` : ''}<p class="kpi-note">${s.fotografados} de ${s.total} fotografado(s). Quem já tem foto enviada a partir do dia da sessão aparece como fotografado.</p>
      <div class="tablewrap"><table class="datatable"><thead><tr><th>Aluno</th><th>Matrícula</th><th>Situação</th><th></th></tr></thead><tbody>${x.itens.map(i => `<tr><td>${esc(i.nome)}</td><td>${esc(i.matricula)}</td><td>${ed ? `<select class="control" data-sit="${i.id}" aria-label="Situação de ${attr(i.nome)}">${CM_SIT.map(([k, t]) => `<option value="${k}" ${i.situacao === k ? 'selected' : ''}>${t}</option>`).join('')}</select>` : esc((CM_SIT.find(c => c[0] === i.situacao) || [])[1] || i.situacao)}</td><td class="cm-acoes">${ed ? `<button type="button" class="btn ghost" data-foto="${i.id}">Foto…</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${ed ? `<div class="ig-barra"><button type="button" class="btn" id="cmSsStatus">${s.status === 'concluida' ? 'Reabrir sessão' : 'Concluir sessão'}</button><button type="button" class="btn ghost danger" id="cmSsExcluir">Excluir sessão</button></div>` : ''}</section>`;
    $$('#cmSessao [data-sit]').forEach(b => { b.onchange = async () => { await post('/carometro/sessao/item', { sessao_id: id, aluno_id: +b.dataset.sit, situacao: b.value }); toast('Situação atualizada'); }; });
    $$('#cmSessao [data-foto]').forEach(b => { b.onclick = () => cmFicha(+b.dataset.foto); });
    $('#cmSsStatus') && ($('#cmSsStatus').onclick = async () => { await post('/carometro/sessao/status', { id, status: s.status === 'concluida' ? 'aberta' : 'concluida' }); PAGINAS.cmsessoes(id); });
    $('#cmSsExcluir') && ($('#cmSsExcluir').onclick = async () => { if (await Dlg.confirmar({ titulo: 'Excluir a sessão?', texto: 'Só o acompanhamento é apagado; as fotos dos alunos continuam.', confirmar: 'Excluir', perigo: true })) { await post('/carometro/sessao/excluir', { id }); toast('Sessão excluída'); PAGINAS.cmsessoes(); } });
  };
  $$('#content [data-sess]').forEach(b => { b.onclick = () => abre(+b.dataset.sess); });
  if (abrirId) abre(abrirId);
};

/* ---- Impressão e PDF (A4) ---- */
const CM_PDF = { origem: 'turma', turma: '', selecao: '', orientacao: 'retrato', porlinha: '5', matricula: false, so_autorizados: false };
PAGINAS.cmpdf = async function () {
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  const [tr, se] = await Promise.all([api('/carometro/turmas'), api('/carometro/selecoes')]);
  const turmas = tr.segmentos.flatMap(s => s.series.flatMap(g => g.turmas.map(t => t.turma)));
  if (!CM_PDF.turma || !turmas.includes(CM_PDF.turma)) CM_PDF.turma = turmas[0] || '';
  if (!CM_PDF.selecao || !se.rows.some(r => String(r.id) === String(CM_PDF.selecao))) CM_PDF.selecao = se.rows[0] ? String(se.rows[0].id) : '';
  const opt = (v, t, sel) => `<option value="${attr(v)}" ${String(sel) === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
  $('#content').innerHTML = `<div class="cm-pdf"><section class="card cm-pdf-form"><div class="db-tit"><h2>Opções do PDF</h2></div>
    <label class="ui-campo">Origem<select id="pdfOrigem" class="control">${opt('turma', 'Uma turma', CM_PDF.origem)}${opt('selecao', 'Uma seleção salva', CM_PDF.origem)}</select></label>
    <label class="ui-campo" id="pdfLTurma">Turma<select id="pdfTurma" class="control">${turmas.map(t => opt(t, t, CM_PDF.turma)).join('')}</select></label>
    <label class="ui-campo" id="pdfLSel">Seleção<select id="pdfSel" class="control">${se.rows.length ? se.rows.map(r => opt(r.id, `${r.nome} (${r.alunos})`, CM_PDF.selecao)).join('') : '<option value="">Nenhuma seleção salva</option>'}</select></label>
    <label class="ui-campo">Orientação<select id="pdfOri" class="control">${opt('retrato', 'A4 retrato', CM_PDF.orientacao)}${opt('paisagem', 'A4 paisagem', CM_PDF.orientacao)}</select></label>
    <label class="ui-campo">Fotos por linha<select id="pdfPor" class="control">${[4, 5, 6].map(n => opt(n, n + ' por linha', CM_PDF.porlinha)).join('')}</select></label>
    <label class="cm-chk"><input type="checkbox" id="pdfMat" ${CM_PDF.matricula ? 'checked' : ''}> Mostrar a matrícula</label>
    <label class="cm-chk"><input type="checkbox" id="pdfAut" ${CM_PDF.so_autorizados ? 'checked' : ''}> Só alunos com autorização de imagem vigente</label>
    <p class="kpi-note">A matrícula fica oculta por padrão: imprima só o necessário. O PDF contém imagens de menores e é de uso interno.</p>
    <div class="ig-barra"><button type="button" class="btn" id="pdfBaixar">Gerar PDF</button></div></section>
    <section class="card cm-pdf-prev"><div class="db-tit"><h2>Prévia</h2><span class="kpi-note" id="pdfInfo"></span></div><div id="pdfPrev" class="cm-pdf-quadro"><div class="loading"><span></span><b>Montando a prévia…</b></div></div></section></div>`;
  const query = baixar => new URLSearchParams({ origem: CM_PDF.origem, turma: CM_PDF.turma, selecao: CM_PDF.selecao, orientacao: CM_PDF.orientacao, porlinha: CM_PDF.porlinha, matricula: CM_PDF.matricula ? '1' : '0', so_autorizados: CM_PDF.so_autorizados ? '1' : '0', ...(baixar ? { baixar: '1' } : {}) });
  const busca = async baixar => {
    const r = await fetch(API + '/carometro/pdf?' + query(baixar), { credentials: 'same-origin', headers: { 'X-EVO': '1' } });
    if (!r.ok) { let m = 'Não foi possível gerar o PDF.'; try { m = (await r.json()).error || m; } catch { /* sem corpo */ } throw new Error(m); }
    return { blob: await r.blob(), paginas: r.headers.get('X-Carometro-Paginas'), alunos: r.headers.get('X-Carometro-Alunos'), nome: (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || 'Carometro.pdf' };
  };
  let url = '', seq = 0;
  const previa = async () => {
    const meu = ++seq; $('#pdfPrev').innerHTML = '<div class="loading"><span></span><b>Montando a prévia…</b></div>'; $('#pdfInfo').textContent = '';
    try {
      const r = await busca(false); if (meu !== seq) return;
      if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(r.blob);
      $('#pdfPrev').innerHTML = `<iframe class="cm-pdf-frame" title="Prévia do PDF" src="${url}#toolbar=0&view=FitH"></iframe><p class="kpi-note">Se a prévia não aparecer no seu navegador, use “Gerar PDF”.</p>`;
      $('#pdfInfo').textContent = `${r.alunos} aluno(s) · ${r.paginas} página(s)`;
    } catch (e) { if (meu === seq) $('#pdfPrev').innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`; }
  };
  const atualizaVis = () => { $('#pdfLTurma').hidden = CM_PDF.origem !== 'turma'; $('#pdfLSel').hidden = CM_PDF.origem !== 'selecao'; };
  const liga = (id, k, tipo) => { $(id).onchange = e => { CM_PDF[k] = tipo === 'chk' ? e.target.checked : e.target.value; atualizaVis(); previa(); }; };
  liga('#pdfOrigem', 'origem'); liga('#pdfTurma', 'turma'); liga('#pdfSel', 'selecao'); liga('#pdfOri', 'orientacao'); liga('#pdfPor', 'porlinha'); liga('#pdfMat', 'matricula', 'chk'); liga('#pdfAut', 'so_autorizados', 'chk');
  $('#pdfBaixar').onclick = async () => {
    $('#pdfBaixar').disabled = true;
    try { const r = await busca(true), a = document.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = r.nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('PDF gerado'); }
    catch (e) { toast(e.message, 'warn'); } finally { $('#pdfBaixar').disabled = false; }
  };
  atualizaVis(); previa();
};

/* ---- Pendências e qualidade ---- */
const CM_IMP = { turma: '' };
const CM_PEND = { tipo: '', estado: 'abertas', sel: new Set() };
PAGINAS.cmpendencias = async function () {
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  const d = await api('/carometro/pendencias?' + new URLSearchParams({ tipo: CM_PEND.tipo, estado: CM_PEND.estado }));
  const abertas = CM_PEND.estado === 'abertas';
  const cart = ([k, rot]) => `<button type="button" class="db-cartao ui-cartao cm-filtro ${CM_PEND.tipo === k ? 'ativo' : ''} ${d.contagem[k] ? 'alerta' : ''}" data-tipo="${k}" aria-pressed="${CM_PEND.tipo === k}"><small>${esc(rot)}</small><strong>${fmtN(d.contagem[k])}</strong></button>`;
  const acaoLinha = p => p.alunoId ? `<button type="button" class="btn ghost" data-ficha="${p.alunoId}">${p.tipo === 'sem_foto' || p.tipo === 'imagem_baixa' ? 'Enviar foto…' : 'Abrir ficha'}</button>` : '<button type="button" class="btn ghost" data-lote>Abrir lote</button>';
  $('#content').innerHTML = `<div class="db-cartoes ui-seis">${Object.entries(d.tipos).map(cart).join('')}</div>
    <div class="ig-barra"><select id="pdTipo" class="control" aria-label="Tipo de pendência"><option value="">Todos os tipos</option>${Object.entries(d.tipos).map(([k, v]) => `<option value="${k}" ${CM_PEND.tipo === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select><select id="pdEstado" class="control" aria-label="Situação"><option value="abertas" ${abertas ? 'selected' : ''}>Abertas (${fmtN(d.abertas)})</option><option value="ignoradas" ${abertas ? '' : 'selected'}>Deixadas como estão (${fmtN(d.ignoradas)})</option></select><span style="flex:1"></span><span class="kpi-note" id="pdSelTxt"></span><button type="button" class="btn" id="pdLote" disabled>${abertas ? 'Deixar como está…' : 'Reabrir selecionadas'}</button></div>
    <section class="card">${d.rows.length ? `<p class="kpi-note">${fmtN(d.total)} pendência(s)${d.total > d.limite ? ` (mostrando as ${d.limite} primeiras)` : ''}. Cada decisão em lote fica registrada com motivo, autor e data.</p><div class="tablewrap"><table class="datatable"><thead><tr><th><input type="checkbox" id="pdTodos" aria-label="Marcar todas"></th><th>Tipo</th><th>Aluno / arquivo</th><th>Turma</th><th>Detalhe</th><th></th></tr></thead><tbody>${d.rows.map(p => `<tr><td><input type="checkbox" data-k="${attr(p.chave)}" ${CM_PEND.sel.has(p.chave) ? 'checked' : ''} aria-label="Selecionar"></td><td><span class="cm-selo ${p.tipo === 'duplicado' || p.tipo === 'arquivo_orfao' ? 'bad' : 'warn'}">${esc(d.tipos[p.tipo])}</span></td><td><b>${esc(p.aluno)}</b>${p.matricula ? `<br><small>${esc(p.matricula)}</small>` : ''}</td><td>${esc(p.turma || '—')}</td><td>${esc(p.detalhe)}${p.ignorada ? `<br><small class="cm-aviso">Deixada como está por ${esc(p.por)}: ${esc(p.motivo)}</small>` : ''}</td><td class="cm-acoes">${acaoLinha(p)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><b>${abertas ? 'Nenhuma pendência aberta.' : 'Nada foi deixado como está.'}</b></div>`}</section>`;
  $$('#content [data-tipo]').forEach(b => { b.onclick = () => { CM_PEND.tipo = CM_PEND.tipo === b.dataset.tipo ? '' : b.dataset.tipo; CM_PEND.sel.clear(); PAGINAS.cmpendencias(); }; });
  $('#pdTipo').onchange = e => { CM_PEND.tipo = e.target.value; CM_PEND.sel.clear(); PAGINAS.cmpendencias(); };
  $('#pdEstado').onchange = e => { CM_PEND.estado = e.target.value; CM_PEND.sel.clear(); PAGINAS.cmpendencias(); };
  const atual = () => { const n = CM_PEND.sel.size; $('#pdSelTxt').textContent = n ? `${n} selecionada(s)` : ''; $('#pdLote').disabled = !n; };
  $$('#content [data-k]').forEach(b => { b.onchange = () => { if (b.checked) CM_PEND.sel.add(b.dataset.k); else CM_PEND.sel.delete(b.dataset.k); atual(); }; });
  $('#pdTodos') && ($('#pdTodos').onchange = e => { $$('#content [data-k]').forEach(b => { b.checked = e.target.checked; if (b.checked) CM_PEND.sel.add(b.dataset.k); else CM_PEND.sel.delete(b.dataset.k); }); atual(); });
  $$('#content [data-ficha]').forEach(b => { b.onclick = () => cmFicha(+b.dataset.ficha); });
  $$('#content [data-lote]').forEach(b => { b.onclick = () => go('cmimport'); });
  $('#pdLote').onclick = async () => {
    const chaves = [...CM_PEND.sel];
    if (!abertas) { await post('/carometro/pendencias/reabrir', { chaves }); CM_PEND.sel.clear(); toast('Pendências reabertas'); PAGINAS.cmpendencias(); return; }
    const dl = dialogo(`<h3>Deixar como está</h3><p class="kpi-note">${chaves.length} pendência(s). Explique o motivo; fica registrado com seu nome e a data.</p><label class="ui-campo">Motivo<input id="pdMotivo" class="control" maxlength="300" placeholder="Ex.: são irmãos gêmeos, nomes parecidos"></label><p class="cm-erro" id="pdErro" role="alert"></p><div class="actions dlg-acoes"><button type="button" class="btn soft" data-close>Cancelar</button><button type="button" class="btn" id="pdOk">Confirmar</button></div>`);
    $('#pdMotivo', dl.el).focus();
    $('#pdOk', dl.el).onclick = async () => { try { await post('/carometro/pendencias/ignorar', { chaves, motivo: $('#pdMotivo', dl.el).value }); dl.close(); CM_PEND.sel.clear(); toast('Registrado'); PAGINAS.cmpendencias(); } catch (e) { $('#pdErro', dl.el).textContent = e.message; } };
  };
  atual();
};

/* ---- Pastas do Google Drive (só referência; a integração ainda não é operacional) ---- */
PAGINAS.cmdrive = async function () {
  $('#content').innerHTML = '<div class="loading"><span></span><b>Carregando…</b></div>';
  const d = await api('/carometro/drive');
  const est = { nao_verificada: ['Não verificada', 'mute'], conferida_manual: ['Conferida manualmente', 'ok'] };
  $('#content').innerHTML = `<section class="card ui-atencao"><b>Sincronização ainda não operacional.</b><p class="kpi-note">Aqui ficam só as referências das pastas. O sistema não acessa o Drive, não guarda senhas nem copia fotos. Para usar as fotos de uma pasta: baixe-as do Drive e envie em <b>Importação</b> (nome do arquivo = matrícula). Se o Drive estiver fora do ar, o Carômetro continua funcionando com os dados locais.</p></section>
    ${d.podeEditar ? '<div class="ig-barra"><button type="button" class="btn" id="drvNova">+ Registrar pasta</button></div>' : '<p class="kpi-note">Só o Administrador registra ou altera pastas.</p>'}
    <section class="card">${d.rows.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Pasta</th><th>Observação</th><th>Situação</th><th>Última conferência</th><th></th></tr></thead><tbody>${d.rows.map(r => `<tr><td><b>${esc(r.nome)}</b><br><a href="${attr(r.link)}" target="_blank" rel="noopener noreferrer">Abrir no Drive</a></td><td>${esc(r.obs || '—')}</td><td><span class="cm-selo ${(est[r.estado] || est.nao_verificada)[1]}">${esc((est[r.estado] || est.nao_verificada)[0])}</span></td><td>${r.conferidaEm ? `${esc(fmtDateTime(r.conferidaEm))}<br><small>${esc(r.conferidaPor)}</small>` : '—'}</td><td class="cm-acoes">${d.podeEditar ? `<button type="button" class="btn ghost" data-conf="${r.id}">Marcar como conferida</button><button type="button" class="btn ghost danger" data-rem="${r.id}">Remover</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Nenhuma pasta registrada.</b></div>'}</section>
    <section class="card"><div class="db-tit"><h2>Salvaguardas previstas para a integração futura</h2></div><ul class="cm-lista"><li>Somente o Administrador escolhe as pastas.</li><li>Credenciais só em variáveis seguras do servidor, nunca no banco nem no navegador.</li><li>Acesso somente leitura, com checagem de permissão antes de listar.</li><li>Fotos nunca vão para serviço externo nem para links públicos.</li><li>Cópia local das fotos só com aprovação.</li></ul></section>`;
  $('#drvNova') && ($('#drvNova').onclick = () => {
    const dl = dialogo(`<h3>Registrar pasta do Drive</h3><label class="ui-campo">Nome<input id="drvNome" class="control" maxlength="120" placeholder="Ex.: Fotos 2026 - Anos Iniciais"></label><label class="ui-campo">Link da pasta (ou identificador)<input id="drvPasta" class="control" placeholder="https://drive.google.com/drive/folders/…"></label><label class="ui-campo">Observação (opcional)<input id="drvObs" class="control" maxlength="300"></label><p class="cm-erro" id="drvErro" role="alert"></p><div class="actions dlg-acoes"><button type="button" class="btn soft" data-close>Cancelar</button><button type="button" class="btn" id="drvOk">Registrar</button></div>`);
    $('#drvOk', dl.el).onclick = async () => { try { await post('/carometro/drive', { nome: $('#drvNome', dl.el).value, pasta: $('#drvPasta', dl.el).value, obs: $('#drvObs', dl.el).value }); dl.close(); toast('Pasta registrada'); PAGINAS.cmdrive(); } catch (e) { $('#drvErro', dl.el).textContent = e.message; } };
  });
  $$('#content [data-conf]').forEach(b => { b.onclick = async () => { await post('/carometro/drive/conferir', { id: +b.dataset.conf }); toast('Conferência registrada'); PAGINAS.cmdrive(); }; });
  $$('#content [data-rem]').forEach(b => { b.onclick = async () => { if (await Dlg.confirmar({ titulo: 'Remover a pasta?', texto: 'Só a referência é removida; nada muda no Drive.', confirmar: 'Remover', perigo: true })) { await post('/carometro/drive/remover', { id: +b.dataset.rem }); toast('Pasta removida'); PAGINAS.cmdrive(); } }; });
};

/* setas ← → do teclado trocam de turma na Visão geral (fora de campos de texto e de diálogos) */
document.addEventListener('keydown', e => {
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  if (typeof state === 'undefined' || state.page !== 'cmvisao' || document.querySelector('.admin-overlay')) return;
  const t = e.target, tag = (t && t.tagName) || '';
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) && t.type !== 'checkbox') return;
  e.preventDefault(); cmNavVai(e.key === 'ArrowLeft' ? -1 : 1);
});

async function cmEnquadrar(loteId,itemId,aoSalvar,individual=false) {
  const dl=dialogo(`<h3>Enquadrar a foto</h3><p>Mova os controles para enquadrar o rosto. O original permanece guardado.</p><canvas id="cmCropCanvas" width="300" height="400" style="max-width:100%;background:#eee"></canvas><label class="ui-campo">Zoom<input id="cmCropZ" type="range" min="1" max="4" value="1" step="0.01"></label><label class="ui-campo">Horizontal<input id="cmCropX" type="range" min="0" max="1" value="0.5" step="0.01"></label><label class="ui-campo">Vertical<input id="cmCropY" type="range" min="0" max="1" value="0.5" step="0.01"></label><button class="btn ghost" id="cmCropGirar">Girar 90°</button><p id="cmCropErro" role="alert"></p><div class="actions dlg-acoes"><button class="btn ghost" data-close>Cancelar</button><button class="btn" id="cmCropSalvar" disabled>Salvar enquadramento</button></div>`,{larga:true});
  try {
    const r=await fetch(individual ? `${API}/carometro/foto/enquadrar?id=${itemId}` : `${API}/carometro/lote/foto?item=${itemId}&tam=original`,{credentials:'same-origin'});if(!r.ok)throw new Error('Não foi possível abrir o original.');
    const bmp=await createImageBitmap(await r.blob(),{imageOrientation:'from-image'});let giro=0,recorte;
    const draw=()=>{
      const src=document.createElement('canvas');src.width=giro%180?bmp.height:bmp.width;src.height=giro%180?bmp.width:bmp.height;
      const sg=src.getContext('2d');sg.translate(src.width/2,src.height/2);sg.rotate(giro*Math.PI/180);sg.drawImage(bmp,-bmp.width/2,-bmp.height/2);
      const z=+$('#cmCropZ',dl.el).value,w=Math.min(src.width,src.height*3/4)/z,h=w*4/3,x=(src.width-w)*+$('#cmCropX',dl.el).value,y=(src.height-h)*+$('#cmCropY',dl.el).value;
      $('#cmCropCanvas',dl.el).getContext('2d').drawImage(src,x,y,w,h,0,0,300,400);
      recorte={x:x/src.width,y:y/src.height,w:w/src.width,h:h/src.height,giro};
    };
    ['#cmCropZ','#cmCropX','#cmCropY'].forEach(id=>$(id,dl.el).oninput=draw);
    $('#cmCropGirar',dl.el).onclick=()=>{giro=(giro+90)%360;draw();};draw();
    const salvar=$('#cmCropSalvar',dl.el);salvar.disabled=false;salvar.onclick=async()=>{salvar.disabled=true;try{await post(individual ? '/carometro/foto/enquadrar' : '/carometro/lote/enquadrar',{lote_id:loteId,item_id:itemId,foto_id:itemId,recorte});bmp.close();dl.close();aoSalvar();}catch(e){$('#cmCropErro',dl.el).textContent=e.message;salvar.disabled=false;}};
  } catch(e) {$('#cmCropErro',dl.el).textContent=e.message;}
}

async function cmRevisaoAnual() {
 const d=await api('/carometro/ano');
 const dl=dialogo(`<h3>Revisão por ano letivo</h3><p>Confira a turma de destino de cada aluno. Matrícula, fotos e histórico são preservados. A turma anterior fica registrada por ano.</p><label class="ui-campo">Ano de destino<input id="cmAnoDestino" class="control" type="number" min="2020" max="2100" value="${d.ano+1}"></label><div class="tablewrap" style="max-height:55vh;overflow:auto"><table class="datatable"><thead><tr><th>Aluno</th><th>Turma atual</th><th>Turma de destino</th></tr></thead><tbody>${d.alunos.map(a=>`<tr><td>${esc(a.nome)}<br><small>${esc(a.matricula)}</small></td><td>${esc(a.turma)}</td><td><input class="control" data-ano-aluno="${a.id}" value="${attr(a.turma)}" maxlength="60" aria-label="Turma de destino de ${attr(a.nome)}"></td></tr>`).join('')}</tbody></table></div><p>${d.historico.map(h=>`${h.ano}: ${h.alunos} aluno(s)`).join(' · ')}</p><p id="cmAnoErro" role="alert"></p><div class="actions"><button class="btn ghost" data-close>Cancelar</button><button class="btn" id="cmAnoAplicar">Conferir e salvar revisão</button></div>`,{larga:true});
 $('#cmAnoAplicar',dl.el).onclick=async()=>{
  const linhas=$$('[data-ano-aluno]',dl.el).map(el=>{const a=d.alunos.find(a=>a.id===+el.dataset.anoAluno);return{id:a.id,anterior:a.turma,turma:el.value.trim()};});
  const n=linhas.filter(l=>l.turma!==l.anterior).length,ano=+$('#cmAnoDestino',dl.el).value;
  if(!await Dlg.confirmar({titulo:'Salvar revisão anual?',texto:`Ano ${ano}: ${linhas.length} aluno(s) conferido(s), ${n} mudança(s) de turma. As fotos continuam ligadas às mesmas matrículas.`,confirmar:'Salvar revisão'}))return;
  const b=$('#cmAnoAplicar',dl.el);b.disabled=true;
  try{await post('/carometro/ano',{ano,linhas});dl.close();toast('Revisão anual salva');go('cmvisao');}catch(e){$('#cmAnoErro',dl.el).textContent=e.message;b.disabled=false;}
 };
}
async function cmPermissoes() {
 const d=await api('/carometro/permissoes');const acoes=[['consultar','Visualizar'],['importar','Importar'],['substituir','Substituir / restaurar'],['baixar','Baixar original'],['imprimir','Imprimir / PDF']];
 const dl=dialogo(`<h3>Permissões do carômetro</h3><label class="ui-campo">Pessoa<select class="control" id="cmPermPessoa">${d.usuarios.filter(u=>!Number(u.admin)).map(u=>`<option value="${attr(u.codigo)}">${esc(u.nome)} (${esc(u.role)})</option>`).join('')}</select></label><p>Sem segmentos marcados: acesso a todos. O Administrador mantém acesso completo.</p><div id="cmPermCampos"></div><p id="cmPermErro" role="alert"></p><div class="actions"><button class="btn ghost" data-close>Fechar</button><button class="btn" id="cmPermSalvar">Salvar permissões</button></div>`,{larga:true});
 const desenha=()=>{const codigo=$('#cmPermPessoa',dl.el).value,u=d.usuarios.find(u=>u.codigo===codigo),p=d.politicas.find(p=>p.codigo===codigo);let seg=[];try{seg=p?JSON.parse(p.segmentos):[];}catch{}
 $('#cmPermCampos',dl.el).innerHTML=`<h4>Segmentos</h4>${d.segmentos.map(s=>`<label class="cm-chk"><input type="checkbox" data-perm-seg="${s.k}" ${seg.includes(s.k)?'checked':''}>${esc(s.nome)}</label>`).join('')}<h4>Ações</h4>${acoes.map(([k,t])=>`<label class="cm-chk"><input type="checkbox" data-perm-acao="${k}" ${(p?Number(p[k]):['consultar','imprimir'].includes(k)||u?.role==='manager')?'checked':''}>${t}</label>`).join('')}`;};
 $('#cmPermPessoa',dl.el).onchange=desenha;desenha();
 $('#cmPermSalvar',dl.el).onclick=async()=>{const b={codigo:$('#cmPermPessoa',dl.el).value,segmentos:$$('[data-perm-seg]:checked',dl.el).map(el=>el.dataset.permSeg)};$$('[data-perm-acao]',dl.el).forEach(el=>b[el.dataset.permAcao]=el.checked);try{await post('/carometro/permissoes',b);dl.close();toast('Permissões salvas');}catch(e){$('#cmPermErro',dl.el).textContent=e.message;}};
}
