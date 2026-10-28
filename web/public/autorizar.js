/* Portal do responsável: autorizar ou não autorizar o uso de imagem do aluno. Sem login: o acesso é o link (no endereço, depois do #) + o código
   combinado à parte. Nada fica guardado no navegador; o código só existe na memória desta página. */
(() => {
  const raiz = document.getElementById('autRaiz');
  const token = decodeURIComponent((location.hash || '').replace(/^#/, '')).trim();
  const API = '/api';
  const S = { codigo: '', v: null, decisao: '', passo: '' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chamar = async (rota, corpo) => {
    let r; try { r = await fetch(API + rota, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-EVO': '1' }, body: JSON.stringify({ token, codigo: S.codigo, ...corpo }), cache: 'no-store' }); } catch { throw new Error('Sem conexão com a internet. Confira o sinal e tente de novo: o que você já respondeu não foi perdido.'); }
    if (r.headers.get('content-type')?.includes('application/pdf')) return r;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || j.message || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  };
  const tela = (html, foco = 'h1') => { raiz.innerHTML = html; const f = raiz.querySelector(foco); if (f) { f.tabIndex = -1; f.focus({ preventScroll: false }); } window.scrollTo(0, 0); };
  const erroEm = (id, msg) => { const e = document.getElementById(id); if (e) { e.textContent = msg; e.hidden = !msg; } };
  const baixar = async (tipo, nome) => {
    const r = await chamar('/public/imagem/pdf', { tipo }); const b = await r.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const doc = v => `<article class="aut-doc" tabindex="0" aria-label="Texto integral do termo"><h2>AUTORIZAÇÃO PARA USO DE IMAGEM</h2>${v.texto.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}<small>Protocolo ${esc(v.protocolo)} · versão ${esc(v.versao)} do termo · SHA-256 do texto: ${esc(v.hash)}…</small></article>`;

  /* ---- 0. código de acesso ---- */
  function telaCodigo(msg = '') {
    if (token.length < 32) return tela('<h1>Link incompleto</h1><p>Este endereço está incompleto. Abra o link exatamente como o colégio enviou, ou peça um novo.</p>');
    tela(`<h1>Acesso seguro</h1><p>Digite o <b>código de acesso</b> que o colégio informou a você, separado do link.</p>
      <form id="fCod" class="aut-card" novalidate><label for="codigo">Código de acesso (6 números)</label><input id="codigo" class="aut-in" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" required>
      <p class="aut-erro" id="eCod" role="alert" ${msg ? '' : 'hidden'}>${esc(msg)}</p><button class="aut-btn" type="submit">Continuar</button></form>`, 'h1');
    document.getElementById('codigo').focus();
    document.getElementById('fCod').onsubmit = async ev => {
      ev.preventDefault(); S.codigo = document.getElementById('codigo').value.replace(/\D/g, '');
      if (S.codigo.length !== 6) return erroEm('eCod', 'O código tem 6 números.');
      try { S.v = await chamar('/public/imagem/abrir', {}); proximo(); } catch (e) { if ([404, 410, 423].includes(e.status)) return tela(`<h1>Não foi possível abrir</h1><p class="aut-erro">${esc(e.message)}</p>`); erroEm('eCod', e.message); }
    };
  }

  /* ---- decide a tela pelo estado da solicitação ---- */
  function proximo() {
    const v = S.v;
    if (v.status === 'AUTORIZADO' || v.status === 'NAO_AUTORIZADO') return telaFim();
    if (v.status === 'REVOGADO') return tela(`<h1>Autorização revogada</h1><p>Esta autorização (${esc(v.protocolo)}) foi revogada. O colégio não deve mais usar a imagem do aluno conforme este termo.</p>`);
    if (v.status === 'VENCIDO') return tela(`<h1>Autorização vencida</h1><p>O prazo desta autorização (${esc(v.protocolo)}) terminou. Se o colégio precisar de uma nova, enviará outro termo.</p>`);
    if (v.encerrada) return tela(`<h1>Solicitação encerrada</h1><p>Esta solicitação (${esc(v.protocolo)}) foi encerrada pelo colégio. Em caso de dúvida, fale com a secretaria.</p>`);
    if (v.status === 'AGUARDANDO_VALIDACAO') return telaFim();
    if (v.status === 'AGUARDANDO_ASSINATURA' && v.decisao === 'AUTORIZO') return telaAssinatura();
    if (v.bloqueio) return tela(`<h1>Termo indisponível</h1><p class="aut-aviso">${esc(v.bloqueio)}</p>`);
    telaTermo();
  }

  /* ---- 1. leitura do termo, escolha e confirmação dos dados ---- */
  function telaTermo() {
    const v = S.v;
    tela(`<h1>Olá! Autorização de uso de imagem</h1>
      <p class="aut-sub">Aluno(a): <b>${esc(v.aluno)}</b> · Turma: <b>${esc(v.turma || '—')}</b></p>
      <p>Leia o termo inteiro. Você pode <b>autorizar</b> ou <b>não autorizar</b>; a sua escolha não traz prejuízo ao aluno.</p>${doc(v)}
      <form id="fTermo" class="aut-card" novalidate>
        <fieldset><legend>Qual é a sua escolha?</legend>
          <label class="aut-op"><input type="radio" name="dec" value="AUTORIZO"><span><b>AUTORIZO</b><small>Autorizo o uso da imagem do aluno nas condições do termo.</small></span></label>
          <label class="aut-op"><input type="radio" name="dec" value="NAO_AUTORIZO"><span><b>NÃO AUTORIZO</b><small>Não autorizo o uso da imagem do aluno.</small></span></label></fieldset>
        <label for="rNome">Seu nome completo (responsável legal)</label><input id="rNome" class="aut-in" autocomplete="name" maxlength="160" value="${esc(v.responsavel || '')}">
        <label for="rPar">Seu grau de responsabilidade</label><select id="rPar" class="aut-in"><option value="">Escolha…</option>${v.parentescos.map(p => `<option ${v.parentesco === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <label class="aut-ck"><input type="checkbox" id="c1"> Li o termo inteiro e entendi a finalidade do uso da imagem.</label>
        <label class="aut-ck"><input type="checkbox" id="c2"> Os dados do aluno (${esc(v.aluno)}, ${esc(v.turma || 'turma')}) estão corretos.</label>
        <label class="aut-ck"><input type="checkbox" id="c3"> Sou o responsável legal por este aluno.</label>
        <p class="aut-erro" id="eT" role="alert" hidden></p><button class="aut-btn" type="submit">Continuar</button></form>`);
    document.getElementById('fTermo').onsubmit = async ev => {
      ev.preventDefault();
      const dec = (document.querySelector('[name=dec]:checked') || {}).value;
      if (!dec) return erroEm('eT', 'Escolha AUTORIZO ou NÃO AUTORIZO.');
      const corpo = { decisao: dec, responsavel_nome: document.getElementById('rNome').value, parentesco: document.getElementById('rPar').value, leu_termo: document.getElementById('c1').checked, dados_corretos: document.getElementById('c2').checked, sou_responsavel: document.getElementById('c3').checked };
      if (dec === 'NAO_AUTORIZO' && !await confirma('Confirmar que você NÃO AUTORIZA', 'O colégio registrará a sua recusa e não usará a imagem do aluno nas condições deste termo.')) return;
      const b = ev.submitter || ev.target.querySelector('button'); b.disabled = true;
      try { const r = await chamar('/public/imagem/decidir', corpo); S.v = await chamar('/public/imagem/abrir', {}); S.v.status = r.status; proximo(); } catch (e) { erroEm('eT', e.message); b.disabled = false; }
    };
  }

  const confirma = (titulo, texto) => new Promise(ok => {
    const d = document.createElement('div'); d.className = 'aut-modal'; d.innerHTML = `<div class="aut-caixa" role="dialog" aria-modal="true" aria-labelledby="mT"><h2 id="mT">${esc(titulo)}</h2><p>${esc(texto)}</p><div class="aut-acoes"><button class="aut-btn aut-sec" id="mN">Voltar</button><button class="aut-btn" id="mS">Confirmar</button></div></div>`;
    document.body.appendChild(d); document.getElementById('mS').focus();
    const f = v => { d.remove(); ok(v); }; document.getElementById('mN').onclick = () => f(false); document.getElementById('mS').onclick = () => f(true);
    d.addEventListener('keydown', e => { if (e.key === 'Escape') f(false); });
  });

  /* ---- 2. escolha da forma de assinatura (somente duas) ---- */
  function telaAssinatura(modo = '') {
    const v = S.v;
    if (modo === 'desenhar') return telaDesenho();
    if (modo === 'govbr') return telaGovbr();
    tela(`<h1>Como você quer assinar?</h1><p class="aut-sub">${esc(v.responsavel)} (${esc(v.parentesco)}) · aluno(a) ${esc(v.aluno)}</p>
      ${v.recusaDoArquivo ? `<p class="aut-aviso" role="alert"><b>O arquivo enviado antes não foi aceito:</b> ${esc(v.recusaDoArquivo)}</p>` : ''}
      <div class="aut-escolha"><button class="aut-card aut-cartao" id="bDes"><b>Assinar escrevendo na tela</b><span>Desenhe a sua assinatura com o dedo, o mouse ou a caneta. É rápido e não precisa de conta.</span></button>
      <button class="aut-card aut-cartao" id="bGov"><b>Assinar com GOV.BR</b><span>Assine o PDF no portal oficial do governo (conta prata ou ouro) e devolva o arquivo assinado aqui. A equipe confere a assinatura.</span></button></div>`);
    document.getElementById('bDes').onclick = () => telaAssinatura('desenhar'); document.getElementById('bGov').onclick = () => telaAssinatura('govbr');
  }

  /* ---- 3a. assinatura desenhada ---- */
  function telaDesenho() {
    tela(`<h1>Escreva a sua assinatura</h1><p>Desenhe dentro do quadro com o dedo, o mouse ou a caneta.</p>
      <div class="aut-card"><div class="aut-tela"><canvas id="cv" role="img" aria-label="Quadro para desenhar a assinatura"></canvas></div>
      <div class="aut-acoes"><button class="aut-btn aut-sec" id="bLimpa" type="button">Limpar e refazer</button></div>
      <label class="aut-ck"><input type="checkbox" id="cOk"> Esta assinatura é minha e vale como a minha autorização, nas condições do termo.</label>
      <p class="aut-erro" id="eA" role="alert" hidden></p><div class="aut-acoes"><button class="aut-btn aut-sec" id="bVolta" type="button">Voltar</button><button class="aut-btn" id="bFim" type="button">Concluir autorização</button></div></div>`);
    const cv = document.getElementById('cv'), cx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const ajusta = () => { const w = cv.parentElement.clientWidth; cv.style.width = w + 'px'; cv.style.height = '190px'; cv.width = Math.round(w * dpr); cv.height = Math.round(190 * dpr); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.lineWidth = 2.6 * dpr; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#111'; S.tinta = 0; };
    ajusta();
    let desenhando = false, ult = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); desenhando = true; ult = pos(e); cx.beginPath(); cx.moveTo(...ult); cx.lineTo(ult[0] + 0.1, ult[1] + 0.1); cx.stroke(); S.tinta++; });
    cv.addEventListener('pointermove', e => { if (!desenhando) return; e.preventDefault(); const p = pos(e); cx.beginPath(); cx.moveTo(...ult); cx.lineTo(...p); cx.stroke(); S.tinta += Math.hypot(p[0] - ult[0], p[1] - ult[1]); ult = p; });
    const fim = () => { desenhando = false; };
    cv.addEventListener('pointerup', fim); cv.addEventListener('pointercancel', fim);
    document.getElementById('bLimpa').onclick = ajusta;
    document.getElementById('bVolta').onclick = () => telaAssinatura();
    document.getElementById('bFim').onclick = async ev => {
      if (S.tinta < 60 * dpr) return erroEm('eA', 'Desenhe a sua assinatura no quadro antes de concluir.');
      if (!document.getElementById('cOk').checked) return erroEm('eA', 'Marque a confirmação de que a assinatura é sua.');
      ev.target.disabled = true;
      try { await chamar('/public/imagem/assinar', { assinatura: cv.toDataURL('image/png'), confirmo_assinatura: true }); S.v = await chamar('/public/imagem/abrir', {}); telaFim(); } catch (e) { erroEm('eA', e.message); ev.target.disabled = false; }
    };
  }

  /* ---- 3b. GOV.BR: baixar o PDF, assinar no portal oficial e devolver o arquivo assinado ---- */
  function telaGovbr() {
    const v = S.v;
    tela(`<h1>Assinar com GOV.BR</h1>
      <ol class="aut-passos"><li><b>Baixe o termo em PDF.</b><br><button class="aut-btn aut-sec" id="bBaixa" type="button">Baixar PDF do termo</button></li>
      <li><b>Abra o assinador oficial do GOV.BR</b> em outra aba e assine o PDF com a sua conta (prata ou ouro).<br><a class="aut-btn aut-sec" href="https://assinador.iti.br/" target="_blank" rel="noopener noreferrer">Abrir assinador.iti.br</a></li>
      <li><b>Baixe o arquivo assinado</b> do próprio assinador. Não use “Imprimir em PDF”: isso apaga a assinatura.</li>
      <li><b>Envie aqui o PDF assinado.</b></li></ol>
      <p class="aut-aviso"><b>Cuidado:</b> o colégio nunca pede a sua senha do GOV.BR. Não a digite aqui nem a informe a ninguém.</p><p class="aut-sub">Não tem conta GOV.BR prata ou ouro, ou está sem internet boa? Volte e assine escrevendo na tela, ou procure a secretaria do colégio.</p>
      <form id="fGov" class="aut-card" novalidate><label for="arq">PDF assinado (até 5 MB)</label><input id="arq" class="aut-in" type="file" accept="application/pdf,.pdf">
      <p class="aut-erro" id="eG" role="alert" hidden></p><div class="aut-acoes"><button class="aut-btn aut-sec" id="bV" type="button">Voltar</button><button class="aut-btn" type="submit">Enviar PDF assinado</button></div></form>
      <p class="aut-sub">Depois do envio, a equipe do colégio confere a assinatura. A autorização só vale depois dessa conferência.</p>`);
    document.getElementById('bBaixa').onclick = () => baixar('original', `Autorizacao-Uso-de-Imagem_${v.protocolo}.pdf`).catch(e => erroEm('eG', e.message));
    document.getElementById('bV').onclick = () => telaAssinatura();
    document.getElementById('fGov').onsubmit = async ev => {
      ev.preventDefault(); const f = document.getElementById('arq').files[0];
      if (!f) return erroEm('eG', 'Escolha o arquivo PDF assinado.');
      if (f.size > 5 * 1048576) return erroEm('eG', 'O arquivo passa de 5 MB.');
      const b = ev.submitter || ev.target.querySelector('[type=submit]'); b.disabled = true;
      const fd = new FormData(); fd.append('token', token); fd.append('codigo', S.codigo); fd.append('arquivo', f);
      try {
        const r = await fetch(API + '/public/imagem/govbr', { method: 'POST', headers: { 'X-EVO': '1' }, body: fd, cache: 'no-store' }); const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Não foi possível enviar o arquivo.');
        S.v = await chamar('/public/imagem/abrir', {}); telaFim();
      } catch (e) { erroEm('eG', e.message); b.disabled = false; }
    };
  }

  /* ---- 4. confirmação ---- */
  function telaFim() {
    const v = S.v, aut = v.status === 'AUTORIZADO', nao = v.status === 'NAO_AUTORIZADO', val = v.status === 'AGUARDANDO_VALIDACAO';
    const titulo = aut ? 'Autorização registrada' : nao ? 'Recusa registrada' : 'Arquivo recebido';
    const msg = aut ? 'Obrigado! A sua autorização foi registrada.' : nao ? 'Obrigado por responder. O colégio não usará a imagem do aluno nas condições deste termo.' : 'Recebemos o seu PDF assinado. A equipe do colégio vai conferir a assinatura; a autorização só passa a valer depois dessa conferência.';
    tela(`<h1>${titulo}</h1><div class="aut-card aut-ok ${nao ? 'aut-nao' : ''}"><p>${msg}</p><dl class="aut-dl"><dt>Protocolo</dt><dd>${esc(v.protocolo)}</dd><dt>Aluno(a)</dt><dd>${esc(v.aluno)}</dd><dt>Situação</dt><dd>${aut ? 'Autorizado' : nao ? 'Não autorizado' : 'Aguardando validação do colégio'}</dd>${v.modalidade ? `<dt>Como foi assinado</dt><dd>${v.modalidade === 'GOVBR' ? 'GOV.BR (arquivo assinado)' : 'Assinatura desenhada na tela'}</dd>` : ''}<dt>Registrado em</dt><dd>${esc(v.decididaEm || '—')}</dd></dl>
      ${v.podeBaixarFinal ? '<button class="aut-btn" id="bFinal" type="button">Baixar o documento</button>' : ''}</div>
      <p class="aut-sub">Você pode revogar esta autorização a qualquer momento falando com a secretaria do colégio e informando o protocolo.</p>`);
    const b = document.getElementById('bFinal'); if (b) b.onclick = () => baixar('final', `Autorizacao-Uso-de-Imagem_${v.protocolo}.pdf`).catch(e => alert(e.message));
  }

  telaCodigo();
})();
