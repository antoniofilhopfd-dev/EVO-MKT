/* Instagram › Publicar agora e Agendar: telas simplificadas (perfil, formato, mídia, legenda, prévia).
   Usa a publicação automática que já existe: cria a publicação, anexa a mídia final e chama /content/publicar-rapido. */
const IGPUB_FORMATOS = [
  ['Reels', 'Reels', 'Vídeo vertical, MP4 ou MOV', 'video'],
  ['Feed', 'Post individual', 'Uma foto (JPG) ou um vídeo', 'um'],
  ['Carrossel', 'Carrossel de fotos', 'De 2 a 10 itens', 'multi'],
  ['Stories', 'Stories', 'Pontual: não entra na pauta nem no calendário', 'story'],
];
const igpubPerfilRotulo = usuario => { const u = String(usuario || '').replace(/^@/, ''), s = u.replace(/[._]/g, '').toLowerCase(); return s === 'geracaoevolucao' ? '@geracaoevolucao' : '@' + u; };

/** modo: 'agora' | 'agendar'. `existente`: publicação já criada (rascunho) para continuar. */
async function abrirPublicacao(modo = 'agora', existente = null, opc = {}) {
  const contas = (await api('/instagram/contas')).contas || [];
  if (!contas.length) { toast('Conecte o Instagram em Configurações antes de publicar.', 'warn'); return; }
  const amanha = somaDias(hojeBR(), 1);
  const est = { modo, conta: 0, collab: false, formato: existente?.formato || 'Reels', arquivos: [], legenda: existente?.legenda || '', dia: existente?.publicacaoEm ? existente.publicacaoEm.slice(0, 10) : opc.dia || amanha, hora: existente?.publicacaoEm ? existente.publicacaoEm.slice(11, 16) : '09:00', id: existente?.id || '', previa: 0 };
  if (existente?.contaInstagram) { const i = contas.findIndex(c => c.ig === existente.contaInstagram); if (i >= 0) est.conta = i; }
  const dlg = dialogo('<div id="igpub"></div>', { larga: true });
  const raiz = $('#igpub', dlg.el);
  const fmt = () => IGPUB_FORMATOS.find(f => f[0] === est.formato);
  const aceita = () => (est.formato === 'Reels' ? '.mp4,.mov' : '.jpg,.jpeg,.mp4,.mov');
  const maxItens = () => (est.formato === 'Carrossel' ? 10 : 1);
  const ehVideo = a => /\.(mp4|mov)$/i.test(a.name);
  const urls = est.arquivos.map(a => URL.createObjectURL(a));

  const previaMidia = () => {
    const a = est.arquivos[0]; if (!a) return '<div class="igp-vazio">Sua mídia aparece aqui</div>';
    const u = URL.createObjectURL(a);
    return ehVideo(a) ? `<video src="${attr(u)}" muted playsinline></video>` : `<img src="${attr(u)}" alt="">`;
  };
  const previa = () => {
    const c = contas[est.previa] || contas[0], u = '@' + String(c.usuario).replace(/^@/, '');
    const legenda = esc(est.legenda || 'Sua legenda aparece aqui…').slice(0, 220);
    const f = est.formato;
    const abas = est.collab && contas.length > 1 ? `<div class="igp-abas">${contas.map((x, i) => `<button type="button" class="${est.previa === i ? 'on' : ''}" data-prev="${i}">No perfil de @${esc(String(x.usuario).replace(/^@/, ''))}</button>`).join('')}</div>` : '';
    const quadro = f === 'Reels' || f === 'Stories'
      ? `<div class="igp-tela igp-vertical">${previaMidia()}<div class="igp-sobre"><b>${f === 'Stories' ? 'Stories' : 'Reels'}</b><div class="igp-rodape"><b>${esc(u)}</b><span>${legenda}</span></div></div></div>`
      : `<div class="igp-post"><div class="igp-cab"><i></i><b>${esc(u)}</b></div><div class="igp-quadrado">${previaMidia()}${f === 'Carrossel' && est.arquivos.length ? `<em>1/${est.arquivos.length}</em>` : ''}</div><div class="igp-leg"><b>${esc(u)}</b> ${legenda}</div></div>`;
    return `<h3>Pré-visualização</h3><p class="kpi-note">Veja como a publicação deve ficar no Instagram.</p>${abas}${quadro}`;
  };
  const desenha = () => {
    const c = contas[est.conta], outra = contas.find((_, i) => i !== est.conta);
    raiz.innerHTML = `<div class="igp"><div class="igp-form">
      <div class="igp-topo"><div><h2>${modo === 'agora' ? 'Publicar agora' : 'Agendar publicação'}</h2><p class="kpi-note">${modo === 'agora' ? 'Crie e publique seu conteúdo no Instagram.' : 'Escolha o dia e o horário; o sistema publica sozinho.'}</p></div><button type="button" class="btn soft" data-close aria-label="Fechar">✕</button></div>
      <h4>1. Perfil</h4><div class="igp-perfis">${contas.map((x, i) => `<label class="igp-perfil ${est.conta === i ? 'on' : ''}"><input type="radio" name="igpConta" value="${i}" ${est.conta === i ? 'checked' : ''}><b>${esc(x.pagina || x.usuario)}</b><small>@${esc(String(x.usuario).replace(/^@/, ''))}</small></label>`).join('')}</div>
      ${outra ? `<label class="check-row"><input type="checkbox" id="igpCollab" ${est.collab ? 'checked' : ''} ${est.formato === 'Stories' ? 'disabled' : ''}> Convidar @${esc(String(outra.usuario).replace(/^@/, ''))} como colaborador (Collab)</label><p class="kpi-note">O Instagram envia um convite ao outro perfil e ele precisa aceitar; a publicação não sai sozinha nos dois perfis.</p>` : ''}
      <h4>2. Formato</h4><div class="igp-formatos">${IGPUB_FORMATOS.map(([k, n, d]) => `<label class="igp-formato ${est.formato === k ? 'on' : ''}"><input type="radio" name="igpFmt" value="${k}" ${est.formato === k ? 'checked' : ''}><b>${n}</b><small>${d}</small></label>`).join('')}</div>
      <h4>3. Mídia</h4><div class="igp-midia"><label class="igp-upload"><input type="file" id="igpArq" accept="${aceita()}" ${maxItens() > 1 ? 'multiple' : ''}><b>Clique para enviar ${maxItens() > 1 ? 'as fotos' : est.formato === 'Reels' ? 'o vídeo' : 'a mídia'}</b><small>${est.formato === 'Reels' ? 'MP4 ou MOV' : 'JPG, MP4 ou MOV'} · até ${maxItens()} item(ns) · máx. 15 MB cada</small></label>
        <div class="igp-lista">${est.arquivos.map((a, i) => `<span class="igp-item">${esc(a.name)} <button type="button" data-rm="${i}" aria-label="Remover">✕</button></span>`).join('') || '<small class="kpi-note">Nenhum arquivo escolhido.</small>'}</div></div>
      <h4>4. Legenda</h4><textarea id="igpLeg" class="control" rows="5" maxlength="2200" placeholder="Escreva a legenda e as hashtags…">${esc(est.legenda)}</textarea><div class="igp-cont"><span id="igpN">${est.legenda.length}</span>/2.200</div>
      ${modo === 'agendar' ? `<h4>5. Data e horário</h4><div class="igp-quando"><label>Dia<input type="date" id="igpDia" class="control" min="${hojeBR()}" value="${est.dia}"></label><label>Horário<input type="time" id="igpHora" class="control" value="${est.hora}"></label><small class="kpi-note">Horário de Fortaleza.</small></div>` : ''}
      <div class="igp-erro" id="igpErro" role="alert" hidden></div>
      <div class="igp-acoes"><button type="button" class="btn soft" id="igpRasc">Salvar rascunho</button><button type="button" class="btn" id="igpGo">${modo === 'agora' ? 'Publicar agora' : 'Agendar'}</button></div>
    </div><aside class="igp-prev" id="igpPrev">${previa()}</aside></div>`;
    liga();
  };
  const liga = () => {
    $$('[name=igpConta]', raiz).forEach(r => { r.onchange = () => { est.conta = +r.value; est.previa = est.conta; est.collab = false; desenha(); }; });
    $$('[name=igpFmt]', raiz).forEach(r => { r.onchange = () => { est.formato = r.value; if (est.formato === 'Stories') est.collab = false; est.arquivos = est.arquivos.slice(0, maxItens()); desenha(); }; });
    const co = $('#igpCollab', raiz); if (co) co.onchange = () => { est.collab = co.checked; est.previa = est.conta; $('#igpPrev', raiz).innerHTML = previa(); ligaPrevia(); };
    $('#igpArq', raiz).onchange = e => {
      const novos = [...e.target.files], ok = [];
      for (const a of novos) {
        if (!new RegExp('\\.(' + aceita().replace(/\./g, '').split(',').join('|') + ')$', 'i').test(a.name)) { erro(`“${a.name}” não serve para ${est.formato}.`); continue; }
        if (a.size > 15 * 1048576) { erro(`“${a.name}” passa de 15 MB.`); continue; }
        ok.push(a);
      }
      est.arquivos = (maxItens() > 1 ? [...est.arquivos, ...ok] : ok.slice(0, 1)).slice(0, maxItens());
      desenha();
    };
    $$('[data-rm]', raiz).forEach(b => { b.onclick = () => { est.arquivos.splice(+b.dataset.rm, 1); desenha(); }; });
    const leg = $('#igpLeg', raiz); leg.oninput = () => { est.legenda = leg.value; $('#igpN', raiz).textContent = String(leg.value.length); $('#igpPrev', raiz).innerHTML = previa(); ligaPrevia(); };
    const dia = $('#igpDia', raiz); if (dia) dia.onchange = () => { est.dia = dia.value; };
    const hora = $('#igpHora', raiz); if (hora) hora.onchange = () => { est.hora = hora.value; };
    $('#igpRasc', raiz).onclick = () => enviar('rascunho');
    $('#igpGo', raiz).onclick = () => enviar('publicar');
    ligaPrevia();
  };
  const ligaPrevia = () => { $$('[data-prev]', raiz).forEach(b => { b.onclick = () => { est.previa = +b.dataset.prev; $('#igpPrev', raiz).innerHTML = previa(); ligaPrevia(); }; }); };
  const erro = msg => { const e = $('#igpErro', raiz); if (e) { e.textContent = msg; e.hidden = !msg; } };
  const enviar = async acao => {
    erro('');
    const c = contas[est.conta], outra = contas.find((_, i) => i !== est.conta), publicar = acao === 'publicar';
    if (publicar && !est.legenda.trim()) return erro('Escreva a legenda.');
    if (publicar && !est.arquivos.length && !est.id) return erro('Envie a mídia.');
    if (publicar && est.formato === 'Carrossel' && est.arquivos.length < 2 && !est.id) return erro('O carrossel precisa de 2 a 10 itens.');
    if (publicar && est.formato === 'Reels' && est.arquivos.length && !est.arquivos.every(ehVideo)) return erro('O Reels precisa ser um vídeo (MP4 ou MOV).');
    if (publicar && modo === 'agendar' && (!est.dia || !est.hora || `${est.dia}T${est.hora}` <= `${hojeBR()}T${new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' }).format(new Date())}`)) return erro('Escolha um dia e um horário no futuro.');
    const botoes = $$('#igpRasc, #igpGo', raiz); botoes.forEach(b => { b.disabled = true; });
    const rotulo = $('#igpGo', raiz).textContent; if (publicar) $('#igpGo', raiz).textContent = modo === 'agora' ? 'Publicando…' : 'Agendando…';
    try {
      const primeira = est.legenda.trim().split('\n')[0].slice(0, 60);
      const dados = { titulo: primeira || 'Publicação sem título', legenda: est.legenda, perfil: igpubPerfilRotulo(c.usuario), formato: est.formato, canal: 'Instagram', contaInstagram: c.ig, colaboradores: est.collab && outra ? String(outra.usuario).replace(/^@/, '') : '', publicarInstagram: 'SIM', publicacaoEm: modo === 'agendar' ? `${est.dia}T${est.hora}` : '' };
      let r = est.id ? await put(`/data?module=conteudos&id=${encodeURIComponent(est.id)}`, dados) : await post('/data?module=conteudos', { ...dados, status: 'RASCUNHO' });
      est.id = r.id;
      if (est.arquivos.length) {
        const fd = new FormData(); fd.append('id', r.id); fd.append('papel', 'final'); est.arquivos.forEach(a => fd.append('files', a));
        await api('/content/material', { method: 'POST', body: fd }); est.arquivos = [];
      }
      invalidate('conteudos');
      if (!publicar) { toast('Rascunho salvo'); dlg.close(); if (state.page === 'igconteudos' || state.page === 'igcalendario') go(state.page); return; }
      const res = await post('/content/publicar-rapido', { id: r.id, modo, quando: modo === 'agendar' ? `${est.dia}T${est.hora}` : '' });
      toast(modo === 'agora' ? (res.status === 'PUBLICADO' ? 'Publicado no Instagram' : 'Enviado ao Instagram: ainda processando') : 'Publicação agendada');
      dlg.close(); if (state.page === 'igconteudos' || state.page === 'igcalendario') go(state.page);
    } catch (e) {
      erro(e.message || 'Não foi possível concluir.'); botoes.forEach(b => { b.disabled = false; }); if (publicar) $('#igpGo', raiz).textContent = rotulo;
    }
  };
  desenha();
}
