// Calendário de publicações em modo leitura (link da direção). O token na URL é a credencial; nada aqui altera dados.
const T=new URLSearchParams(location.search).get('t')||'',box=document.getElementById('box'),sub=document.getElementById('sub');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ROT={'EM REVISÃO':['Em revisão','rev'],APROVADO:['Aprovado','ok'],AGENDADO:['Agendado',''],PUBLICADO:['Publicado','ok']};
(async()=>{
 if(!T){sub.textContent='';box.innerHTML='<div class="msg"><b>Link inválido.</b></div>';return}
 let d;try{const r=await fetch('/api/public/calendario?t='+encodeURIComponent(T),{headers:{'X-EVO':'1'}});d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível abrir.')}catch(e){sub.textContent='';box.innerHTML=`<div class="msg"><b>${esc(e.message)}</b></div>`;return}
 sub.textContent='Somente leitura. Mostra publicações em revisão, aprovadas, agendadas e publicadas.';
 const por={};d.rows.forEach(r=>{const k=String(r.quando).slice(0,10);(por[k]=por[k]||[]).push(r)});
 const hoje=new Date().toISOString().slice(0,10);
 const dias=Object.keys(por).sort();
 box.innerHTML=dias.map(k=>{const dt=new Date(k+'T12:00:00');return `<section class="dia ${k===hoje?'hoje':''}"><h2>${esc(new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(dt))}</h2>${por[k].map(r=>{const [l,c]=ROT[r.status]||[r.status,''];return `<div class="post"><span class="hora">${esc(String(r.quando).slice(11,16)||'—')}</span><div><b>${esc(r.titulo)}</b><small>${esc(r.perfil)}${r.formato?' · '+esc(r.formato):''}</small></div><span class="st ${c}">${esc(l)}</span></div>`}).join('')}</section>`}).join('')||'<div class="msg" style="background:#EAF0FB"><b>Nenhuma publicação programada para os próximos dias.</b></div>';
})();
