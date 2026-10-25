// A Gerente escolhe o código de acesso de uma pessoa. Uso: node codigo.test.js <install.out>
const fs=require('fs');const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,300))};
const J={'Content-Type':'application/json','X-EVO':'1'};
(async()=>{
 let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:pw('NAT-3301')})});let ck=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw('NAT-3301'),nova:'Nat26ab'})});
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:'Nat26ab'})});ck=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const H={...J,Cookie:ck};const post=(u,b)=>fetch(B+u,{method:'POST',headers:H,body:JSON.stringify(b)}).then(async x=>[x.status,await x.json().catch(()=>({}))]);
 r=await fetch(B+'/admin/mode',{method:'POST',headers:H,body:JSON.stringify({modo:'codigo',senhaAdmin:'Nat26ab'})});t('liga o modo código',r.status===200);
 let [s,j]=await post('/admin/users/code',{tipo:'interno',codigo:'ANT-3302',acesso:'antonio',senhaAdmin:'Nat26ab'});t('escolhe o código "ANTONIO" (aceita minúsculas)',s===200&&j.acesso==='ANTONIO',j);
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'antonio'})});const u=await r.json();t('a pessoa entra com o código escolhido',r.status===200&&u.user.name==='Antônio Filho',u);
 r=await fetch(B+'/admin/users',{headers:H});const lista=await r.json();t('a tabela mostra o código escolhido',lista.find(x=>x.codigo==='ANT-3302').acesso==='ANTONIO');
 [s,j]=await post('/admin/users/code',{tipo:'interno',codigo:'MON-3303',acesso:'ANTONIO',senhaAdmin:'Nat26ab'});t('código repetido de outra pessoa: 409',s===409,j);
 [s,j]=await post('/admin/users/code',{tipo:'interno',codigo:'MON-3303',acesso:'ab',senhaAdmin:'Nat26ab'});t('curto demais: 400',s===400,j);
 [s,j]=await post('/admin/users/code',{tipo:'interno',codigo:'MON-3303',acesso:'com espaço',senhaAdmin:'Nat26ab'});t('com espaço/acentos: 400',s===400,j);
 [s,j]=await post('/admin/users/code',{tipo:'interno',codigo:'MON-3303',acesso:'MONI2026'});t('nunca pede senha: troca o código sem senhaAdmin (200)',s===200,j);
 [s,j]=await post('/admin/users/code',{tipo:'portal',codigo:'INF-2601',acesso:'INFANTIL',senhaAdmin:'Nat26ab'});t('ficha de Portal não existe mais (400)',s===400,j);
 [s,j]=await post('/admin/users/code',{tipo:'interno',codigo:'ANT-3302',acesso:'ANT2026',senhaAdmin:'Nat26ab'});
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'ANTONIO'})});t('o código antigo deixa de valer',r.status===401);
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'ANT2026'})});t('o novo código vale',r.status===200);
 r=await fetch(B+'/admin/users/code',{method:'POST',headers:J,body:JSON.stringify({tipo:'interno',codigo:'ANT-3302',acesso:'XXXX1'})});t('sem sessão: 401',r.status===401);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})();
