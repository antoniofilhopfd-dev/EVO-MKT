/* Seletor de período em um único modal: escolhe o primeiro e o último dia no mesmo calendário e confirma uma vez.
   Independente do resto do app (também usado no relatório de Tráfego). Uso: PeriodoPicker.abrir({de,ate,titulo,max}, (de,ate)=>{...}) */
const PeriodoPicker=(()=>{
 const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
 const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
 const par=s=>/^\d{4}-\d\d-\d\d$/.test(s||'')?new Date(s+'T12:00:00'):null;
 const br=s=>s?s.split('-').reverse().join('/'):'—';
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 let css=false;
 function estilo(){if(css)return;css=true;const s=document.createElement('style');s.textContent=`
 .pp-ov{position:fixed;inset:0;z-index:20000;background:rgba(0,39,95,.45);display:flex;align-items:center;justify-content:center;padding:12px}
 .pp{background:#fff;border-radius:16px;width:min(360px,100%);max-height:calc(100vh - 24px);overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.3);padding:16px;font-family:inherit;color:#1D2433}
 .pp-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.pp-top h3{margin:0;font-size:16px;color:#00275F}
 .pp-x{border:0;background:#F0F2F7;border-radius:50%;width:34px;height:34px;font-size:18px;cursor:pointer;color:#00275F}
 .pp-sel{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
 .pp-sel div{border:1px solid #D9DEE8;border-radius:10px;padding:6px 10px}.pp-sel div.on{border-color:#063996;box-shadow:0 0 0 2px #E3ECFB}.pp-sel small{display:block;font-size:11px;color:#5E6678}.pp-sel b{font-size:14px}
 .pp-pre{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.pp-pre button{border:1px solid #D9DEE8;background:#fff;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer;color:#063996;font-weight:600}.pp-pre button:hover{background:#E3ECFB}
 .pp-nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.pp-nav b{font-size:14px}.pp-nav button{border:1px solid #D9DEE8;background:#fff;border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:16px;color:#063996}
 .pp-g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}.pp-g i{font-style:normal;font-size:11px;color:#5E6678;text-align:center;padding:4px 0}
 .pp-g button{border:0;background:transparent;height:38px;border-radius:8px;font-size:14px;cursor:pointer;color:#1D2433}
 .pp-g button:hover{background:#E3ECFB}.pp-g button.fora{color:#B6BDCB}.pp-g button.hoje{font-weight:800;color:#FF7800}
 .pp-g button.in{background:#E3ECFB;border-radius:0}.pp-g button.ini,.pp-g button.fim{background:#063996;color:#fff;font-weight:700}.pp-g button.ini{border-radius:8px 0 0 8px}.pp-g button.fim{border-radius:0 8px 8px 0}.pp-g button.ini.fim{border-radius:8px}
 .pp-g button:disabled{color:#CCD2DE;cursor:not-allowed;background:transparent}
 .pp-ac{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.pp-ac button{border:1px solid #D9DEE8;background:#fff;border-radius:10px;padding:9px 16px;font-weight:700;cursor:pointer;color:#063996;font-size:14px}.pp-ac .ok{background:#063996;color:#fff;border-color:#063996}.pp-ac .ok:disabled{opacity:.45;cursor:not-allowed}
 .pp-dica{font-size:12px;color:#5E6678;margin:8px 0 0}`;document.head.appendChild(s)}
 function abrir({de='',ate='',titulo='Escolha o período',max=''}={},cb){
  estilo();document.querySelector('.pp-ov')?.remove();
  let ini=par(de)?de:'',fim=par(ate)?ate:'',base=par(ini)||new Date();base=new Date(base.getFullYear(),base.getMonth(),1,12);
  const hoje=iso(new Date());const ov=document.createElement('div');ov.className='pp-ov';
  const fechar=()=>{ov.remove();document.removeEventListener('keydown',tecla)};
  const tecla=e=>{if(e.key==='Escape')fechar()};document.addEventListener('keydown',tecla);
  ov.onclick=e=>{if(e.target===ov)fechar()};
  const pre=[['Hoje',()=>[hoje,hoje]],['7 dias',()=>{const d=new Date();d.setDate(d.getDate()-6);return [iso(d),hoje]}],['30 dias',()=>{const d=new Date();d.setDate(d.getDate()-29);return [iso(d),hoje]}],['Este mês',()=>{const d=new Date();return [iso(new Date(d.getFullYear(),d.getMonth(),1,12)),hoje]}],['Mês anterior',()=>{const d=new Date();return [iso(new Date(d.getFullYear(),d.getMonth()-1,1,12)),iso(new Date(d.getFullYear(),d.getMonth(),0,12))]}]];
  function desenha(){
   const ano=base.getFullYear(),mes=base.getMonth(),primeiro=new Date(ano,mes,1,12).getDay(),dias=new Date(ano,mes+1,0).getDate();
   let g=['D','S','T','Q','Q','S','S'].map(x=>`<i>${x}</i>`).join('');
   for(let i=0;i<primeiro;i++)g+='<span></span>';
   for(let d=1;d<=dias;d++){const s=ano+'-'+String(mes+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const cls=[s===hoje?'hoje':'',s===ini?'ini':'',s===(fim||ini)&&ini?'fim':'',ini&&fim&&s>ini&&s<fim?'in':''].filter(Boolean).join(' ');
    g+=`<button type="button" data-d="${s}" class="${cls}" ${max&&s>max?'disabled':''} aria-label="${d} de ${MESES[mes]} de ${ano}">${d}</button>`}
   ov.innerHTML=`<div class="pp" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="pp-top"><h3>${esc(titulo)}</h3><button type="button" class="pp-x" aria-label="Fechar">✕</button></div>
    <div class="pp-sel"><div class="${!ini||fim?(!ini?'on':''):''}"><small>Primeiro dia</small><b>${br(ini)}</b></div><div class="${ini&&!fim?'on':''}"><small>Último dia</small><b>${br(fim)}</b></div></div>
    <div class="pp-pre">${pre.map(([r],i)=>`<button type="button" data-pre="${i}">${r}</button>`).join('')}</div>
    <div class="pp-nav"><button type="button" data-m="-1" aria-label="Mês anterior">‹</button><b>${MESES[mes]} de ${ano}</b><button type="button" data-m="1" aria-label="Próximo mês">›</button></div>
    <div class="pp-g">${g}</div>
    <p class="pp-dica">${!ini?'Toque no primeiro dia.':!fim?'Agora toque no último dia (ou em Aplicar para um dia só).':'Toque em outro dia para recomeçar.'}</p>
    <div class="pp-ac"><button type="button" class="cancel">Cancelar</button><button type="button" class="ok" ${ini?'':'disabled'}>Aplicar</button></div></div>`;
   ov.querySelector('.pp-x').onclick=fechar;ov.querySelector('.cancel').onclick=fechar;
   ov.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{base=new Date(ano,mes+Number(b.dataset.m),1,12);desenha()});
   ov.querySelectorAll('[data-pre]').forEach(b=>b.onclick=()=>{[ini,fim]=pre[Number(b.dataset.pre)][1]();base=new Date(par(ini).getFullYear(),par(ini).getMonth(),1,12);desenha()});
   ov.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{const s=b.dataset.d;if(!ini||fim){ini=s;fim=''}else if(s<ini){ini=s}else fim=s;desenha()});
   ov.querySelector('.ok').onclick=()=>{if(!ini)return;const a=ini,b=fim||ini;fechar();cb(a,b)};
  }
  document.body.appendChild(ov);desenha();
 }
 return {abrir};
})();
