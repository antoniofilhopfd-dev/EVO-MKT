// Acessibilidade de diálogos: papel/aria, foco dentro do diálogo, Tab preso, Esc fecha e o foco volta ao botão de origem.
(()=>{
 const FOC='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
 const pilha=[];
 const visivel=e=>e&&e.offsetParent!==null;
 function abrir(el,rotuloSel){
  if(pilha.some(x=>x.el===el))return;
  const box=el.querySelector('.modalcard,.admin-box')||el;
  box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  const tit=box.querySelector('h1,h2,h3,#modalTitle');if(tit){if(!tit.id)tit.id='dlg-'+Math.random().toString(36).slice(2,8);box.setAttribute('aria-labelledby',tit.id)}
  pilha.push({el,box,origem:document.activeElement});
  setTimeout(()=>{const f=[...box.querySelectorAll(FOC)].filter(visivel)[0];(f||box).focus?.()},30);
 }
 function fechar(el){const i=pilha.findIndex(x=>x.el===el);if(i<0)return;const [x]=pilha.splice(i,1);try{x.origem&&x.origem.isConnected&&x.origem.focus()}catch{}}
 new MutationObserver(ms=>{
  for(const m of ms){
   m.addedNodes.forEach(n=>{if(n.nodeType===1&&n.classList?.contains('admin-overlay'))abrir(n)});
   m.removedNodes.forEach(n=>{if(n.nodeType===1&&n.classList?.contains('admin-overlay'))fechar(n)});
   if(m.type==='attributes'&&m.target.id==='modal'){m.target.classList.contains('hidden')?fechar(m.target):abrir(m.target)}
  }
 }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 document.addEventListener('keydown',e=>{
  const topo=pilha[pilha.length-1];if(!topo)return;
  if(e.key==='Escape'){const c=topo.box.querySelector('[data-close],#closeModal,.modalhead button,[aria-label="Fechar"]');if(c){e.preventDefault();c.click()}return}
  if(e.key!=='Tab')return;
  const fs=[...topo.box.querySelectorAll(FOC)].filter(visivel);if(!fs.length)return;
  const a=fs[0],z=fs[fs.length-1];
  if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
 });
})();
