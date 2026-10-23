/* Criar no Gerenciador, um nível por vez (como no Gerenciador da Meta): campanha, conjunto de anúncios ou anúncio.
   Tudo é conferido antes (nada é enviado sem a revisão) e nasce PAUSADO. Usa as rotas /ads/criar*. */
const CRI={opcoes:null,gestao:null};
const criChave=()=>Array.from(crypto.getRandomValues(new Uint8Array(14)),b=>b.toString(16).padStart(2,'0')).join('')+'zq';
async function criOpcoes(){if(!CRI.opcoes){try{CRI.opcoes=await api('/ads/campanha/opcoes')}catch{CRI.opcoes={objetivos:{},ctas:[],eventos:[],pixels:[],posts:[],imagens:[],formularios:[]}}}return CRI.opcoes}
async function criGestao(){if(!CRI.gestao){try{CRI.gestao=await api('/ads/gestao')}catch{CRI.gestao={config:{publico:{}}}}}return CRI.gestao}
const criSel=(id,lista,atual,vazio)=>`<select class="control" id="${id}">${vazio?`<option value="">${esc(vazio)}</option>`:''}${lista.map(([v,l])=>`<option value="${attr(v)}" ${String(atual)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
const criLbl=(t,corpo,dica='')=>`<label class="cri-c"><span>${t}</span>${corpo}${dica?`<small class="kpi-note">${dica}</small>`:''}</label>`;
const criDia=iso=>iso?iso.split('-').reverse().join('/'):'';

/** Pergunta o que criar. O nível da aba aberta vem em destaque. */
function tpMenuCriar(){
  const atual=GM2.nivel;
  const o=adminOverlay(`<h3>O que você quer criar?</h3><p class="kpi-note">Cada item é criado separado, como no Gerenciador da Meta, e <b>nasce pausado</b>: você confere e ativa depois.</p>
   <div class="cri-esc">${[['campanha','Campanha','Define o objetivo (conversas, tráfego, alcance…).'],['conjunto','Conjunto de anúncios','Dentro de uma campanha: público, orçamento, datas e onde veicular.'],['anuncio','Anúncio','Dentro de um conjunto: a arte ou a publicação do Instagram.']].map(([k,t,d])=>`<button type="button" class="cri-op ${atual===k?'on':''}" data-cri="${k}"><b>${t}</b><small>${d}</small></button>`).join('')}
    <button type="button" class="cri-op" data-cri="assistente"><b>Campanha completa (assistente)</b><small>Cria campanha, conjunto e anúncio de uma vez, em passos guiados. Vai ao ar ativa.</small></button></div>
   <div class="tp-ff-acoes"><button class="softbtn" type="button" data-close>Cancelar</button></div>`);
  o.el.querySelectorAll('[data-cri]').forEach(b=>b.onclick=()=>{o.close();b.dataset.cri==='assistente'?novaCampanha():tpCriar(b.dataset.cri)});
}

async function tpCriar(nivel,pre={}){
  const [op,gs]=await Promise.all([criOpcoes(),criGestao()]);
  const rot={campanha:'Nova campanha',conjunto:'Novo conjunto de anúncios',anuncio:'Novo anúncio'}[nivel];
  const camps=gmDados.campanhas.filter(c=>tpEstadoDe(c)!=='ARCHIVED');
  const sets=tpFlat('conjunto').filter(c=>tpEstadoDe(c)!=='ARCHIVED');
  const selC=[...GM2.sel][0]||'',campIni=pre.campanhaId||((GM2.nivel==='campanha'&&selC)||(GM2.foco.camps||[])[0]||GM2.foco.campanha||''),setIni=pre.conjuntoId||((GM2.nivel==='conjunto'&&selC)||(GM2.foco.conjs||[])[0]||GM2.foco.conjunto||'');
  const pub=(gs.config&&gs.config.publico)||{};
  const est={chave:criChave(),inicio:'',fim:'',info:null};
  const corpoNome=criLbl('Nome *',`<input class="control" id="crNome" maxlength="100" autocomplete="off" placeholder="${nivel==='campanha'?'Ex.: Matrículas 2027 — Ensino Médio':nivel==='conjunto'?'Ex.: João Pessoa, 14 a 18 anos':'Ex.: Vídeo da feira de ciências'}">`);
  let corpo='';
  if(nivel==='campanha')corpo=corpoNome+criLbl('Objetivo *',criSel('crObj',Object.entries(op.objetivos||{}).map(([k,o])=>[k,o.rotulo]),'','Escolha…'),'O que você quer que a campanha consiga. Os resultados possíveis aparecem no conjunto.');
  if(nivel==='conjunto')corpo=criLbl('Campanha *',criSel('crCamp',camps.map(c=>[c.id,c.nome]),campIni,'Escolha a campanha…'))+corpoNome+'<div id="crDin"></div>';
  if(nivel==='anuncio')corpo=criLbl('Conjunto de anúncios *',criSel('crSet',sets.map(c=>[c.id,`${c.nome} — ${(gmDados.campanhas.find(k=>k.id===c._campanha)||{}).nome||''}`]),setIni,'Escolha o conjunto…'))+corpoNome+'<div id="crDin"></div>';
  const o=adminOverlay(`<h3>${rot}</h3><form id="crForm" class="cm-form cri-form" novalidate>${corpo}
    <div id="crRev" class="cri-rev" aria-live="polite"></div>
    <div class="tp-ff-acoes"><button class="softbtn" type="button" data-close>Cancelar</button><button class="softbtn" type="button" id="crConf">Conferir</button><button class="btn" type="submit" id="crOk" disabled>Criar (pausado)</button></div></form>`);
  const f=o.el,g=id=>{const e=f.querySelector('#'+id);return e?e.value:''};
  const rev=(h,cls='')=>{f.querySelector('#crRev').innerHTML=h?`<div class="cri-msg ${cls}">${h}</div>`:''};
  const invalida=()=>{f.querySelector('#crOk').disabled=true;rev('')};
  f.addEventListener('input',invalida);f.addEventListener('change',e=>{if(e.target.id!=='crCamp'&&e.target.id!=='crSet')invalida()});

  // ---- campos dinâmicos ----
  const destinoHtml=(exige,goal,cta,ctas)=>{
    let h='';
    if(goal==='CONVERSATIONS')h+=criLbl('Onde a conversa acontece',criSel('crMsg',[['DIRECT','Direct do Instagram'],['MESSENGER','Messenger'],['WHATSAPP','WhatsApp']],'DIRECT'))+`<div id="crWaBox" hidden>${criLbl('WhatsApp (com DDI e DDD)',`<input class="control" id="crWa" placeholder="+55 83 90000-0000">`)}</div>`;
    if(exige.includes('site'))h+=criLbl('Site de destino (https) *',`<input class="control" id="crSite" type="url" placeholder="https://…">`);
    if(exige.includes('form'))h+=criLbl('Formulário instantâneo *',criSel('crForm_',(op.formularios||[]).map(x=>[x.id,x.nome]),'','Escolha…'));
    if(exige.includes('pixel'))h+=criLbl('Pixel *',criSel('crPix',(op.pixels||[]).map(x=>[x.id,x.nome]),'','Escolha…'))+criLbl('Evento que conta como resultado *',criSel('crEv',(op.eventos||[]).map(x=>[x,x]),'','Escolha…'));
    if(exige.includes('app'))h+=criLbl('ID do aplicativo *',`<input class="control" id="crApp">`)+criLbl('Link da loja (https) *',`<input class="control" id="crLoja" type="url">`);
    return h;
  };
  const destinoVal=()=>({mensagem:g('crMsg')||undefined,whatsapp:g('crWa')||undefined,siteUrl:g('crSite')||undefined,formId:g('crForm_')||undefined,pixelId:g('crPix')||undefined,evento:g('crEv')||undefined,appId:g('crApp')||undefined,lojaUrl:g('crLoja')||undefined});
  const ligaMsg=()=>{const m=f.querySelector('#crMsg');if(m)m.onchange=()=>{f.querySelector('#crWaBox').hidden=m.value!=='WHATSAPP'}};

  if(nivel==='conjunto'){
    const dinConj=async()=>{
      const id=g('crCamp'),box=f.querySelector('#crDin');est.info=null;invalida();
      if(!id){box.innerHTML='';return}
      box.innerHTML='<small class="kpi-note">Lendo a campanha…</small>';
      try{est.info=await api('/ads/criar/info?nivel=campanha&id='+encodeURIComponent(id))}catch(e){box.innerHTML=`<div class="cri-msg err">${esc(e.message)}</div>`;return}
      const info=est.info,metas=Object.entries(info.metas||{});
      box.innerHTML=`<p class="kpi-note">Objetivo da campanha: <b>${esc(info.objetivoRotulo)}</b>.</p>`
       +criLbl('Resultado *',criSel('crMeta',metas.map(([k,m])=>[k,m.rotulo]),metas.length===1?metas[0][0]:'','Escolha…'),'<span id="crMetaAjuda"></span>')
       +(info.comOrcamentoNaCampanha?'<p class="kpi-note">Esta campanha tem orçamento próprio (na campanha). O conjunto não leva orçamento.</p>':`<div class="cri-2">${criLbl('Orçamento',criSel('crOrcT',[['DIARIO','Diário'],['TOTAL','Total']],'DIARIO'))}${criLbl('Valor (R$) *',`<input class="control" id="crOrcV" type="number" min="1" step="0.01" inputmode="decimal">`)}</div>`)
       +criLbl('Período *',`<button type="button" class="control cm-rng" id="crPer">📅 Escolher o primeiro e o último dia</button>`,`Nada fica aberto para sempre. Máximo de ${(gs.config&&gs.config.diasMax)||14} dias.`)
       +`<fieldset class="cri-fs"><legend>Público</legend><p class="kpi-note">Cidade: <b>${esc((pub.cidade&&pub.cidade.nome)||'defina em Alertas e automações')}</b></p><div class="cri-2">${criLbl('Raio (km)',`<input class="control" id="crRaio" type="number" min="1" max="80" value="${attr(pub.raioKm||20)}">`)}${criLbl('Gênero',criSel('crGen',[['todos','Todos'],['mulheres','Mulheres'],['homens','Homens']],'todos'))}</div><div class="cri-2">${criLbl('Idade mínima',`<input class="control" id="crIdMin" type="number" min="18" max="65" value="${attr(pub.idadeMin||25)}">`)}${criLbl('Idade máxima',`<input class="control" id="crIdMax" type="number" min="18" max="65" value="${attr(pub.idadeMax||55)}">`)}</div></fieldset>`
       +`<div id="crDest"></div>`
       +criLbl('Lance',criSel('crLance',[['MENOR_CUSTO','Menor custo (automático)'],['LIMITE_CUSTO','Limite de custo']],'MENOR_CUSTO'))+`<div id="crLanceV" hidden>${criLbl('Limite de custo (R$)',`<input class="control" id="crLanceN" type="number" min="1" step="0.01">`)}</div>`;
      const pintaDest=()=>{const m=f.querySelector('#crMeta'),mt=info.metas[m.value];f.querySelector('#crMetaAjuda').textContent=mt?mt.ajuda:'';f.querySelector('#crDest').innerHTML=mt?destinoHtml(mt.exige||[],m.value==='CONVERSATIONS'?'CONVERSATIONS':'',mt.cta,op.ctas):'';ligaMsg()};
      f.querySelector('#crMeta').onchange=pintaDest;pintaDest();
      f.querySelector('#crLance').onchange=e=>{f.querySelector('#crLanceV').hidden=e.target.value!=='LIMITE_CUSTO'};
      f.querySelector('#crPer').onclick=()=>PeriodoPicker.abrir({de:est.inicio.slice(0,10),ate:est.fim.slice(0,10),titulo:'Período do conjunto'},(a,b)=>{const hoje=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);est.inicio=a>hoje?a+'T00:05':'';est.fim=b+'T23:59';f.querySelector('#crPer').textContent='📅 '+(a===b?criDia(a):criDia(a)+' a '+criDia(b));invalida()});
    };
    f.querySelector('#crCamp').onchange=dinConj;if(campIni)dinConj();
  }
  if(nivel==='anuncio'){
    const dinAn=async()=>{
      const id=g('crSet'),box=f.querySelector('#crDin');est.info=null;invalida();
      if(!id){box.innerHTML='';return}
      box.innerHTML='<small class="kpi-note">Lendo o conjunto…</small>';
      try{est.info=await api('/ads/criar/info?nivel=conjunto&id='+encodeURIComponent(id))}catch(e){box.innerHTML=`<div class="cri-msg err">${esc(e.message)}</div>`;return}
      const info=est.info,tipos=[...(info.criativos||[]).map(x=>x==='POST_IG'?['POST_IG','Publicação do Instagram']:['IMAGEM','Imagem nova (do Estúdio)']),...((info.criativos||[]).includes('IMAGEM')?[['ARQUIVO','Imagem ou vídeo (biblioteca ou computador)']]:[])];
      box.innerHTML=`<p class="kpi-note">Campanha: <b>${esc(info.campanha||'')}</b> · Resultado: <b>${esc(info.metaRotulo||'')}</b>.</p>`
       +criLbl('Criativo *',criSel('crTipo',tipos,tipos.length===1?tipos[0][0]:'','Escolha…'))+'<div id="crCri"></div><div id="crDest"></div>';
      const pinta=()=>{const t=f.querySelector('#crTipo').value;
        f.querySelector('#crCri').innerHTML=t==='POST_IG'?criLbl('Publicação *',criSel('crPost',(op.posts||[]).map(p=>[p.id,`${(p.legenda||'(sem legenda)').slice(0,60)} · ${p.tipo}`]),'','Escolha…'),'Anuncia um post já publicado (curtidas e comentários contam).')
          :t==='ARQUIVO'?`<div class="cri-c"><span>Imagem ou vídeo *</span><div class="cri-arq"><button type="button" class="softbtn" id="crArqBib">Escolher da biblioteca</button> <button type="button" class="softbtn" id="crArqPc">Enviar do computador</button><input type="file" id="crArqFile" accept=".jpg,.jpeg,.png,.mp4,.mov,image/jpeg,image/png,video/mp4,video/quicktime" hidden></div><small class="kpi-note" id="crArqNome">${est.arq?esc(est.arq.split('/').pop()):'Nenhum arquivo escolhido. Imagem JPG/PNG ou vídeo MP4/MOV.'}</small></div>`+criLbl('Texto do anúncio *',`<textarea class="control" id="crTexto" rows="3" maxlength="2000"></textarea>`)+criLbl('Título',`<input class="control" id="crTit" maxlength="255">`)+criLbl('Descrição',`<input class="control" id="crDesc" maxlength="255">`)
          :t==='IMAGEM'?criLbl('Imagem *',criSel('crImg',(op.imagens||[]).map(p=>[p.id,p.titulo]),'','Escolha…'),'JPEG anexado a um post do Estúdio.')+criLbl('Texto do anúncio *',`<textarea class="control" id="crTexto" rows="3" maxlength="2000"></textarea>`)+criLbl('Título',`<input class="control" id="crTit" maxlength="255">`)+criLbl('Descrição',`<input class="control" id="crDesc" maxlength="255">`):'';
        f.querySelector('#crDest').innerHTML=destinoHtml(info.exige||[],'',info.cta,op.ctas)+(t==='IMAGEM'||t==='ARQUIVO'?criLbl('Botão',criSel('crCta',(op.ctas||[]).map(x=>[x,x]),info.cta||'','Padrão do resultado')):'');ligaMsg();
        if(t==='ARQUIVO'){const nm=f.querySelector('#crArqNome'),mostra=c=>{est.arq=c;nm.textContent=c.split('/').pop()};
          f.querySelector('#crArqBib').onclick=async()=>{try{const r=await arquivosEscolher({tipos:['imagem','video']});if(r&&r[0])mostra(r[0])}catch(e){toast(e.message,'warn')}};
          f.querySelector('#crArqPc').onclick=()=>f.querySelector('#crArqFile').click();
          f.querySelector('#crArqFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(!/\.(jpe?g|png|mp4|mov)$/i.test(file.name)){toast('Use JPG, PNG, MP4 ou MOV.','warn');return}
            const fd=new FormData();fd.append('files',file);fd.append('pasta','Tráfego');nm.textContent='Enviando…';
            try{const r=await api('/arquivos/enviar',{method:'POST',body:fd});const c=((r.salvos||r.arquivos||[])[0]||{}).caminho||(r.caminhos||[])[0];if(!c)throw new Error('Não consegui identificar o arquivo enviado.');mostra(c);toast('Arquivo enviado')}catch(x){nm.textContent='Falha no envio.';toast(x.message,'bad')}}}};
      f.querySelector('#crTipo').onchange=pinta;pinta();
    };
    f.querySelector('#crSet').onchange=dinAn;if(setIni)dinAn();
  }

  // ---- montar o pedido, conferir e criar ----
  const spec=()=>{
    const s={chave:est.chave,nome:g('crNome')};
    if(nivel==='campanha')s.objetivo=g('crObj');
    if(nivel==='conjunto'){Object.assign(s,{campanhaId:g('crCamp'),meta:g('crMeta'),inicio:est.inicio||undefined,fim:est.fim||undefined,publico:{raioKm:Number(g('crRaio')),idadeMin:Number(g('crIdMin')),idadeMax:Number(g('crIdMax')),genero:g('crGen')},destino:destinoVal(),lance:{tipo:g('crLance'),valor:Number(g('crLanceN'))||undefined}});
      if(f.querySelector('#crOrcV'))s.orcamento={tipo:g('crOrcT'),valor:Number(g('crOrcV'))}}
    if(nivel==='anuncio'){const t=g('crTipo');Object.assign(s,{conjuntoId:g('crSet'),destino:destinoVal(),criativo:{tipo:t,midia:t==='POST_IG'?g('crPost'):undefined,conteudoId:t==='IMAGEM'?g('crImg'):undefined,arquivo:t==='ARQUIVO'?est.arq:undefined,texto:g('crTexto')||undefined,titulo:g('crTit')||undefined,descricao:g('crDesc')||undefined,cta:g('crCta')||undefined}})}
    return s;
  };
  f.querySelector('#crConf').onclick=async()=>{
    rev('Conferindo…');
    try{
      const r=await gmPost('/ads/criar/previa',{nivel,spec:spec()});
      const res=r.resumo||{};const linhas=[['Nome',res.nome],['Campanha',res.campanha],['Conjunto',res.conjunto],['Objetivo',res.objetivo],['Resultado',res.resultado],['Orçamento',res.orcamento],['Duração',res.dias?res.dias+' dia(s)':''],['Compromisso de até',res.compromisso?gmBrl(res.compromisso):''],['Criativo',res.criativo],['Estado ao criar',res.estado]].filter(x=>x[1]);
      rev(`${(r.erros||[]).length?`<b>Corrija antes de criar:</b><ul>${r.erros.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:'<b>Tudo certo para criar.</b>'}${(r.avisos||[]).length?`<ul class="cri-av">${r.avisos.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:''}${r.ok?`<dl class="dc-dl">${linhas.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl><p class="kpi-note">Nada foi enviado à Meta ainda. Ao criar, ${nivel==='campanha'?'a campanha':nivel==='conjunto'?'o conjunto':'o anúncio'} fica <b>pausado</b>.</p>`:''}`,r.ok?'ok':'err');
      f.querySelector('#crOk').disabled=!r.ok;
    }catch(e){rev(esc(e.message),'err')}
  };
  f.querySelector('#crForm').onsubmit=async ev=>{
    ev.preventDefault();const b=f.querySelector('#crOk');if(b.disabled)return;b.disabled=true;rev('Criando na Meta…');
    try{
      const r=await gmPost('/ads/criar',{nivel,confirmou:true,spec:spec()});
      o.close();toast({campanha:'Campanha criada e pausada. Confira e ative quando quiser.',conjunto:'Conjunto criado e pausado. Confira e ative quando quiser.',anuncio:'Anúncio criado e pausado. Confira e ative quando quiser.'}[nivel]);
      if(nivel==='campanha'){GM2.nivel='campanha'}if(nivel==='conjunto'){GM2.nivel='conjunto';GM2.foco={campanha:'',conjunto:'',camps:[spec().campanhaId],conjs:[]}}if(nivel==='anuncio'){GM2.nivel='anuncio';GM2.foco={campanha:'',conjunto:'',camps:[],conjs:[spec().conjuntoId]}}
      await tpRecarrega();
    }catch(e){est.chave=criChave();rev(esc(e.message),'err')}
  };
}


/** Editor do conjunto: o que o Gerenciador da Meta também edita (cidade, gênero, posicionamentos, interesses, públicos personalizados e lance). */
async function tpEditorAvancado(ov,o){
  const box=ov.el.querySelector('#geAv');if(!box)return;
  const op=await criOpcoes(),p=o.publico||{};
  const gen0=(p.generos||[]).length===1?((p.generos[0]==='Mulheres')?'mulheres':'homens'):'todos';
  const est={interesses:(p.interesses||[]).map(i=>({id:i.id,nome:i.nome})),pers:new Set((p.personalizados||[]).map(x=>x.id)),plat:new Set(p.plataformas||[])};
  const cid0=(p.cidades||[])[0],lance0=o.estrategiaLance==='COST_CAP'?'LIMITE_CUSTO':'MENOR_CUSTO';
  const PLAT=[['instagram','Instagram'],['facebook','Facebook'],['messenger','Messenger'],['audience_network','Audience Network']];
  const pintaInt=()=>{box.querySelector('#geInts').innerHTML=est.interesses.map((i,k)=>`<span class="tp-chip">${esc(i.nome)} <button type="button" data-rmint="${k}" aria-label="Remover">×</button></span>`).join('')||'<small class="kpi-note">Nenhum interesse (público amplo).</small>';box.querySelectorAll('[data-rmint]').forEach(b=>b.onclick=()=>{est.interesses.splice(Number(b.dataset.rmint),1);pintaInt()})};
  box.innerHTML=`<fieldset class="cri-fs"><legend>Público e veiculação</legend>
    <div class="cri-2">${criLbl('Trocar a cidade',`<input class="control" id="geCidade" placeholder="${attr(cid0?cid0.nome:'Ex.: João Pessoa')}" autocomplete="off">`,'Deixe em branco para manter.')}${criLbl('Gênero',criSel('geGen',[['todos','Todos'],['mulheres','Mulheres'],['homens','Homens']],gen0))}</div>
    <div class="cri-c"><span>Onde o anúncio aparece</span><div class="cri-plat">${PLAT.map(([k,l])=>`<label class="check-row"><input type="checkbox" data-plat="${k}" ${est.plat.has(k)?'checked':''}><span>${l}</span></label>`).join('')}</div><small class="kpi-note">Nenhuma marcada = posicionamentos automáticos (a Meta escolhe).</small></div>
    <div class="cri-c"><span>Interesses</span><div id="geInts" class="tp-chips"></div><div class="cri-2"><input class="control" id="geIntQ" placeholder="Pesquisar interesse…" autocomplete="off"><button type="button" class="softbtn" id="geIntBusca">Buscar</button></div><div id="geIntRes"></div></div>
    ${(op.publicos||[]).length?`<div class="cri-c"><span>Públicos personalizados</span><div class="cri-plat">${op.publicos.map(x=>`<label class="check-row"><input type="checkbox" data-pers="${attr(x.id)}" ${est.pers.has(x.id)?'checked':''}><span>${esc(x.nome)}</span></label>`).join('')}</div></div>`:''}
    <div class="cri-2">${criLbl('Lance',criSel('geLance',[['MENOR_CUSTO','Menor custo (automático)'],['LIMITE_CUSTO','Limite de custo']],lance0))}${criLbl('Limite de custo (R$)',`<input class="control" id="geLanceV" type="number" min="1" step="0.01" value="${attr(o.lanceValor||'')}">`)}</div></fieldset>`;
  pintaInt();
  box.querySelectorAll('[data-plat]').forEach(c=>c.onchange=()=>{c.checked?est.plat.add(c.dataset.plat):est.plat.delete(c.dataset.plat)});
  box.querySelectorAll('[data-pers]').forEach(c=>c.onchange=()=>{c.checked?est.pers.add(c.dataset.pers):est.pers.delete(c.dataset.pers)});
  box.querySelector('#geIntBusca').onclick=async()=>{const q=box.querySelector('#geIntQ').value.trim();if(q.length<2)return;const r=box.querySelector('#geIntRes');r.innerHTML='<small class="kpi-note">Buscando na Meta…</small>';
    try{const d=await api('/ads/campanha/interesses?q='+encodeURIComponent(q));r.innerHTML=(d.rows||[]).map(i=>`<button type="button" class="softbtn" data-addint="${attr(i.id)}|${attr(i.nome)}">+ ${esc(i.nome)}${i.publico?` <small>(${Number(i.publico).toLocaleString('pt-BR')})</small>`:''}</button>`).join('')||'<small class="kpi-note">Nada encontrado.</small>';
      r.querySelectorAll('[data-addint]').forEach(b=>b.onclick=()=>{const [id,...n]=b.dataset.addint.split('|');if(!est.interesses.some(x=>x.id===id))est.interesses.push({id,nome:n.join('|')});pintaInt()})}catch(e){r.innerHTML=`<div class="cri-msg err">${esc(e.message)}</div>`}};
  const igual=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
  ov.avancado=()=>{
    const c={},v=id=>{const e=box.querySelector('#'+id);return e?e.value.trim():''};
    if(v('geCidade'))c.cidade=v('geCidade');
    if(v('geGen')!==gen0)c.genero=v('geGen');
    if(!igual([...est.plat],p.plataformas||[]))c.plataformas=[...est.plat];
    if(!igual(est.interesses.map(i=>i.id),(p.interesses||[]).map(i=>i.id)))c.interesses=est.interesses;
    if(!igual([...est.pers],(p.personalizados||[]).map(x=>x.id)))c.publicosPersonalizados=[...est.pers];
    if(v('geLance')!==lance0||(v('geLance')==='LIMITE_CUSTO'&&Number(v('geLanceV'))!==Number(o.lanceValor||0)))c.lance={tipo:v('geLance'),valor:Number(v('geLanceV'))||undefined};
    return c;
  };
}
