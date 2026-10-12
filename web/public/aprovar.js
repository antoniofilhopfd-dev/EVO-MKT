// Página pública de aprovação por link (token de uso único). Sem login: o token na URL é a credencial.
const T=new URLSearchParams(location.search).get('t')||'',box=document.getElementById('box');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function call(path,opt={}){const r=await fetch('/api'+path,{...opt,headers:{'X-EVO':'1',...(opt.headers||{})}});let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.error||'Não foi possível concluir.');return j}
function fim(msg,ok=true){box.innerHTML=`<div class="msg ${ok?'':'err'}"><b>${esc(msg)}</b></div>`}
(async()=>{
 if(!T)return fim('Link inválido.',false);
 let d;try{d=await call('/public/approval?t='+encodeURIComponent(T))}catch(e){return fim(e.message,false)}
 box.innerHTML=`<h1>${esc(d.titulo)}</h1><small>${esc(d.segmento||'')} · solicitado por ${esc(d.solicitante||'—')}</small>
 ${d.mensagem?`<p>${esc(d.mensagem)}</p>`:''}
 <div class="files"><b>Arquivos da entrega</b>${d.arquivos.map(a=>`<a href="/api/public/approval/file?t=${encodeURIComponent(T)}&path=${encodeURIComponent(a.path)}" target="_blank" rel="noopener">${esc(a.nome)}</a>`).join('')||'<p><small>Sem arquivos anexados.</small></p>'}</div>
 <label for="nome">Seu nome</label><input id="nome" maxlength="80" autocomplete="name" placeholder="Quem está respondendo?">
 <label for="com">Comentário <small>(obrigatório para pedir ajustes)</small></label><textarea id="com" maxlength="500"></textarea>
 <div class="btns"><button class="ok" id="ok">Aprovar entrega</button><button class="aj" id="aj">Solicitar ajustes</button></div>
 <p><small>Este link vale até ${esc(String(d.expiraEm).slice(0,10).split('-').reverse().join('/'))} e só pode ser usado uma vez.</small></p>`;
 const enviar=async acao=>{const nome=document.getElementById('nome').value.trim(),comentario=document.getElementById('com').value.trim();
  document.getElementById('ok').disabled=document.getElementById('aj').disabled=true;
  try{await call('/public/approval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:T,acao,nome,comentario})});fim(acao==='APROVADO'?'Entrega aprovada. Obrigado!':'Pedido de ajustes enviado ao Marketing. Obrigado!')}
  catch(e){alert(e.message);document.getElementById('ok').disabled=document.getElementById('aj').disabled=false}};
 document.getElementById('ok').onclick=()=>enviar('APROVADO');document.getElementById('aj').onclick=()=>enviar('AJUSTES SOLICITADOS');
})();
