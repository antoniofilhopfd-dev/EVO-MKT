/* Arquivos: biblioteca visual de mídia (imagens, vídeos e documentos) guardada no banco, com pastas.
   Também serve de seletor para o Estúdio do Instagram e para os criativos do Tráfego Pago: arquivosEscolher({tipos,multi}).
   Renomear e mover mudam só o nome e a pasta (o caminho não muda); arquivo em uso por um registro não é excluído. */
const AQ={rows:[],pastas:[],maxMb:15,pasta:'',busca:'',tipo:'',ordem:'recentes',vista:pref('arquivos.vista','grade'),sel:new Set()};
const AQ_TIPOS=[['','Todos'],['imagem','Imagens'],['video','Vídeos'],['documento','Documentos'],['audio','Áudios'],['outro','Outros']];
const aqUrl=(c,dl)=>`/api/file?path=${encodeURIComponent(c)}${dl?'&download=1':''}`;
const aqPost=(u,b)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const aqTam=n=>n>=1048576?(n/1048576).toFixed(1).replace('.',',')+' MB':Math.max(1,Math.round(n/1024))+' KB';
const aqExt=n=>((String(n).split('.').pop()||'').toUpperCase().slice(0,5))||'—';
const aqGlifo=t=>({imagem:'▧',video:'▶',documento:'▤',audio:'♪',outro:'▪'}[t]||'▪');
async function aqCarrega(){const d=await api('/arquivos/lista');AQ.rows=d.rows;AQ.pastas=d.pastas;AQ.maxMb=d.maxMb}
function aqFiltrados(){
  const q=AQ.busca.trim().toLowerCase();
  let l=AQ.rows.filter(r=>(!AQ.pasta||r.pasta===AQ.pasta)&&(!AQ.tipo||r.tipo===AQ.tipo)&&(!q||r.nome.toLowerCase().includes(q)));
  const o=AQ.ordem;l=[...l].sort((a,b)=>o==='nome'?a.nome.localeCompare(b.nome,'pt-BR'):o==='tamanho'?b.tamanho-a.tamanho:String(b.criadoEm).localeCompare(String(a.criadoEm)));
  return l;
}
function aqMiniatura(r,grande){
  if(r.tipo==='imagem')return `<img loading="lazy" alt="" src="${attr(aqUrl(r.caminho))}">`;
  if(r.tipo==='video')return `<video preload="metadata" muted playsinline ${grande?'controls':''} src="${attr(aqUrl(r.caminho))}#t=0.5"></video>`;
  return `<span class="aq-ico">${aqGlifo(r.tipo)}<b>${esc(aqExt(r.nome))}</b></span>`;
}
function aqCartao(r,modoEscolha){
  const marcado=AQ.sel.has(r.caminho);
  return `<article class="aq-card${marcado?' sel':''}" data-c="${attr(r.caminho)}" tabindex="0"><div class="aq-mini" data-prev="${attr(r.caminho)}">${aqMiniatura(r)}<span class="aq-tag">${esc(aqExt(r.nome))}</span></div>
   <div class="aq-info"><b title="${attr(r.nome)}">${esc(r.nome)}</b><small>${esc(aqTam(r.tamanho))} · ${esc(fmtDate(String(r.criadoEm).slice(0,10)))}</small>${modoEscolha?'':`<small class="aq-pasta">${esc(r.pasta)}</small>`}</div>
   ${modoEscolha?`<label class="aq-esc"><input type="checkbox" data-esc="${attr(r.caminho)}" ${marcado?'checked':''}> Selecionar</label>`:`<div class="aq-acoes"><button class="softbtn" data-prev="${attr(r.caminho)}">Abrir</button><a class="softbtn" href="${attr(aqUrl(r.caminho,1))}" download="${attr(r.nome)}">Baixar</a><button class="softbtn" data-ren="${attr(r.caminho)}">Renomear</button><button class="softbtn" data-mov="${attr(r.caminho)}">Mover</button>${r.origem==='biblioteca'?`<button class="softbtn aq-del" data-del="${attr(r.caminho)}">Excluir</button>`:''}</div>`}</article>`;
}
function aqLinha(r,modoEscolha){
  return `<tr data-c="${attr(r.caminho)}"><td>${modoEscolha?`<input type="checkbox" data-esc="${attr(r.caminho)}" ${AQ.sel.has(r.caminho)?'checked':''} aria-label="Selecionar ${attr(r.nome)}">`:''}<button class="aq-nome" data-prev="${attr(r.caminho)}"><span class="aq-lm">${r.tipo==='imagem'?`<img loading="lazy" alt="" src="${attr(aqUrl(r.caminho))}">`:aqGlifo(r.tipo)}</span>${esc(r.nome)}</button></td><td>${esc(r.pasta)}</td><td>${esc(aqExt(r.nome))}</td><td>${esc(aqTam(r.tamanho))}</td><td>${esc(fmtDate(String(r.criadoEm).slice(0,10)))}</td>
   <td class="aq-lacoes">${modoEscolha?'':`<a class="softbtn" href="${attr(aqUrl(r.caminho,1))}" download="${attr(r.nome)}">Baixar</a><button class="softbtn" data-ren="${attr(r.caminho)}">Renomear</button><button class="softbtn" data-mov="${attr(r.caminho)}">Mover</button>${r.origem==='biblioteca'?`<button class="softbtn aq-del" data-del="${attr(r.caminho)}">Excluir</button>`:''}`}</td></tr>`;
}
function aqCorpo(modoEscolha){
  const l=aqFiltrados(),contagem=p=>AQ.rows.filter(r=>!p||r.pasta===p).length;
  const vazio=`<div class="empty-rich"><strong>${AQ.rows.length?'Nada encontrado com esses filtros':'Nenhum arquivo ainda'}</strong><p>${AQ.rows.length?'Limpe a busca ou escolha outra pasta.':'Envie imagens, vídeos e documentos para usar nas publicações e anúncios.'}</p></div>`;
  return `<div class="aq-lado"><button class="aq-pasta-b ${AQ.pasta===''?'active':''}" data-pasta="">Todos os arquivos <i>${contagem('')}</i></button>${AQ.pastas.map(p=>`<button class="aq-pasta-b ${AQ.pasta===p?'active':''}" data-pasta="${attr(p)}">${esc(p)} <i>${contagem(p)}</i></button>`).join('')}${modoEscolha?'':'<button class="softbtn aq-novapasta" id="aqPasta">+ Nova pasta</button>'}</div>
   <div class="aq-main"><div class="aq-barra"><input type="search" class="control aq-busca" id="aqBusca" placeholder="Pesquisar pelo nome" aria-label="Pesquisar arquivo" value="${attr(AQ.busca)}">
    <select class="control" id="aqTipo" aria-label="Tipo">${AQ_TIPOS.map(([k,n])=>`<option value="${k}" ${AQ.tipo===k?'selected':''}>${n}</option>`).join('')}</select>
    <select class="control" id="aqOrdem" aria-label="Ordenar"><option value="recentes" ${AQ.ordem==='recentes'?'selected':''}>Mais recentes</option><option value="nome" ${AQ.ordem==='nome'?'selected':''}>Nome</option><option value="tamanho" ${AQ.ordem==='tamanho'?'selected':''}>Maior tamanho</option></select>
    <div class="view-switch" role="group" aria-label="Visualização"><button type="button" data-vista="grade" class="${AQ.vista==='grade'?'active':''}">Grade</button><button type="button" data-vista="lista" class="${AQ.vista==='lista'?'active':''}">Lista</button></div></div>
   <div class="aq-drop" id="aqDrop">${l.length?(AQ.vista==='grade'?`<div class="aq-grade">${l.map(r=>aqCartao(r,modoEscolha)).join('')}</div>`:`<div class="tablewrap"><table class="datatable aq-tab"><thead><tr><th>Nome</th><th>Pasta</th><th>Formato</th><th>Tamanho</th><th>Enviado em</th><th></th></tr></thead><tbody>${l.map(r=>aqLinha(r,modoEscolha)).join('')}</tbody></table></div>`):vazio}</div>
   <small class="kpi-note">${l.length} arquivo(s). Limite de ${AQ.maxMb} MB por arquivo. Solte arquivos aqui para enviar para a pasta ${esc(AQ.pasta||'Geral')}.</small></div>`;
}
function aqLiga(raiz,modoEscolha,aoMudar){
  const redesenha=()=>{raiz.innerHTML=aqCorpo(modoEscolha);aqLiga(raiz,modoEscolha,aoMudar)};
  raiz.querySelectorAll('[data-pasta]').forEach(b=>b.onclick=()=>{AQ.pasta=b.dataset.pasta;redesenha()});
  raiz.querySelectorAll('[data-vista]').forEach(b=>b.onclick=()=>{AQ.vista=b.dataset.vista;setPref('arquivos.vista',AQ.vista);redesenha()});
  $('#aqBusca',raiz).oninput=e=>{AQ.busca=e.target.value;clearTimeout(aqLiga._t);aqLiga._t=setTimeout(()=>{redesenha();const i=$('#aqBusca',raiz);i.focus();i.setSelectionRange(i.value.length,i.value.length)},200)};
  $('#aqTipo',raiz).onchange=e=>{AQ.tipo=e.target.value;redesenha()};
  $('#aqOrdem',raiz).onchange=e=>{AQ.ordem=e.target.value;redesenha()};
  raiz.querySelectorAll('[data-prev]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();if(modoEscolha){const c=b.dataset.prev;AQ.sel.has(c)?AQ.sel.delete(c):AQ.sel.add(c);redesenha();aoMudar&&aoMudar();return}aqPrevia(b.dataset.prev)});
  raiz.querySelectorAll('[data-esc]').forEach(i=>i.onchange=()=>{i.checked?AQ.sel.add(i.dataset.esc):AQ.sel.delete(i.dataset.esc);redesenha();aoMudar&&aoMudar()});
  raiz.querySelectorAll('[data-ren]').forEach(b=>b.onclick=async()=>{const r=AQ.rows.find(x=>x.caminho===b.dataset.ren);const n=prompt('Novo nome do arquivo (inclua a extensão):',r.nome);if(n===null)return;try{await aqPost('/arquivos/renomear',{caminho:r.caminho,nome:n});toast('Arquivo renomeado');await aqCarrega();redesenha()}catch(e){toast(e.message,'bad')}});
  raiz.querySelectorAll('[data-mov]').forEach(b=>b.onclick=async()=>{const r=AQ.rows.find(x=>x.caminho===b.dataset.mov);const n=prompt(`Mover "${r.nome}" para qual pasta?\nPastas: ${AQ.pastas.join(', ')}\n(digite um nome novo para criar)`,r.pasta);if(!n)return;try{await aqPost('/arquivos/mover',{caminho:r.caminho,pasta:n});toast('Arquivo movido');await aqCarrega();redesenha()}catch(e){toast(e.message,'bad')}});
  raiz.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{const r=AQ.rows.find(x=>x.caminho===b.dataset.del);if(!confirm(`Excluir "${r.nome}"? Esta ação não pode ser desfeita.`))return;try{await aqPost('/arquivos/excluir',{caminho:r.caminho,confirmou:true});toast('Arquivo excluído');await aqCarrega();redesenha()}catch(e){toast(e.message,'bad')}});
  $('#aqPasta',raiz)&&($('#aqPasta',raiz).onclick=async()=>{const n=prompt('Nome da nova pasta:');if(!n)return;try{const r=await aqPost('/arquivos/pasta',{nome:n});AQ.pasta=r.nome;await aqCarrega();redesenha()}catch(e){toast(e.message,'bad')}});
  const drop=$('#aqDrop',raiz);
  if(drop&&!modoEscolha){drop.ondragover=e=>{e.preventDefault();drop.classList.add('sobre')};drop.ondragleave=()=>drop.classList.remove('sobre');drop.ondrop=async e=>{e.preventDefault();drop.classList.remove('sobre');if(e.dataTransfer.files.length)await aqEnviar([...e.dataTransfer.files],redesenha)}}
}
async function aqEnviar(files,redesenha){
  if(!files.length)return;
  const fd=new FormData();files.forEach(f=>fd.append('files',f));fd.append('pasta',AQ.pasta||'Geral');
  toast(`Enviando ${files.length} arquivo(s)…`);
  try{await api('/arquivos/enviar',{method:'POST',body:fd});toast('Envio concluído');await aqCarrega();redesenha()}catch(e){toast(e.message,'bad')}
}
function aqPrevia(c){
  const r=AQ.rows.find(x=>x.caminho===c);if(!r)return;
  const o=adminOverlay(`<h3>${esc(r.nome)}</h3><div class="aq-prev">${r.tipo==='imagem'?`<img alt="${attr(r.nome)}" src="${attr(aqUrl(c))}">`:r.tipo==='video'?`<video controls playsinline src="${attr(aqUrl(c))}"></video>`:r.mime==='application/pdf'?`<iframe title="${attr(r.nome)}" src="${attr(aqUrl(c))}"></iframe>`:`<div class="aq-mini">${aqMiniatura(r)}</div>`}</div>
   <dl class="dc-dl"><dt>Pasta</dt><dd>${esc(r.pasta)}</dd><dt>Formato</dt><dd>${esc(r.mime)}</dd><dt>Tamanho</dt><dd>${esc(aqTam(r.tamanho))}</dd><dt>Enviado em</dt><dd>${esc(fmtDateTime(r.criadoEm))}</dd><dt>Caminho</dt><dd><code>${esc(r.caminho)}</code></dd></dl>
   <div class="actions"><a class="btn" href="${attr(aqUrl(c,1))}" download="${attr(r.nome)}">Baixar</a><span class="cm-esp"></span><button class="btn soft" data-close>Fechar</button></div>`);
  return o;
}
async function renderFiles(){
  state.module=null;AQ.sel.clear();
  $('#content').innerHTML=`<div class="aq-topo"><h1 class="sr-only">Arquivos</h1><p class="cm-sub">Biblioteca de imagens, vídeos e documentos do marketing.</p><div class="aq-topo-b"><button class="btn" id="aqEnviar">Enviar arquivos</button><input type="file" id="aqArq" multiple hidden></div></div><div class="aq" id="aqRaiz"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
  try{await aqCarrega()}catch(e){$('#aqRaiz').innerHTML=`<div class="error-state"><h2>Não foi possível carregar</h2><p>${esc(e.message)}</p></div>`;return}
  const raiz=$('#aqRaiz');raiz.innerHTML=aqCorpo(false);aqLiga(raiz,false);
  $('#aqEnviar').onclick=()=>$('#aqArq').click();
  $('#aqArq').onchange=async e=>{await aqEnviar([...e.target.files],()=>{raiz.innerHTML=aqCorpo(false);aqLiga(raiz,false)});e.target.value=''};
}
/** Seletor de arquivos para outros módulos. Devolve a lista de caminhos escolhidos (vazia se a pessoa cancelar). */
async function arquivosEscolher({tipos=['imagem','video'],multi=false}={}){
  await aqCarrega();
  const antes={pasta:AQ.pasta,busca:AQ.busca,tipo:AQ.tipo};
  AQ.sel.clear();AQ.pasta='';AQ.busca='';AQ.tipo='';
  const usaveis=AQ.rows.filter(r=>tipos.includes(r.tipo));
  const real=AQ.rows;AQ.rows=usaveis;
  return new Promise(resolve=>{
    const o=adminOverlay(`<h3>Escolher da biblioteca</h3><div class="aq aq-modal" id="aqModal"></div><div class="actions"><span class="cm-esp"></span><button class="btn soft" data-close>Cancelar</button><button class="btn" id="aqOk" disabled>Usar selecionado</button></div>`,()=>{AQ.rows=real;Object.assign(AQ,antes);resolve([])});
    const raiz=o.el.querySelector('#aqModal');
    const atualiza=()=>{if(!multi&&AQ.sel.size>1){const ultimo=[...AQ.sel].pop();AQ.sel=new Set([ultimo]);raiz.innerHTML=aqCorpo(true);aqLiga(raiz,true,atualiza)}const ok=o.el.querySelector('#aqOk');ok.disabled=!AQ.sel.size;ok.textContent=AQ.sel.size>1?`Usar ${AQ.sel.size} arquivos`:'Usar selecionado'};
    raiz.innerHTML=aqCorpo(true);aqLiga(raiz,true,atualiza);
    o.el.querySelector('#aqOk').onclick=()=>{const r=[...AQ.sel];AQ.rows=real;Object.assign(AQ,antes);o.el.remove();resolve(r)};
  });
}
