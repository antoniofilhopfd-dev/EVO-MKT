// Rota de recuperação de emergência (/api/recover). Uso: node recover.test.js <install.out>
const fs=require('fs');const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,300))};
const K='recuperacao-de-teste-0123456789';
const get=async u=>{const r=await fetch(B+u);return [r.status,await r.text()]};
(async()=>{
 let [s,x]=await get('/recover?key=errada&codigo=ANT-3302');t('chave errada: 403',s===403,x);
 [s,x]=await get('/recover?key='+K+'&codigo=ZZZ-0000');t('ficha inexistente: 404',s===404,x);
 [s,x]=await get('/recover?key='+K+'&codigo=ANT-3302&perfil=manager');const nova=(x.match(/: (\S+)\n/)||[])[1];
 t('gera senha temporária de 8 caracteres e promove a Gerente',s===200&&nova&&nova.length===8,x);
 let r=await fetch(B+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo:'ANT-3302',senha:nova})});
 const j=await r.json();t('entra com a senha temporária e já é Gerente',r.status===200&&j.user.role==='manager'&&j.mustChange===true,j);
 // modo código: gera código novo
 const ck=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 r=await fetch(B+'/auth/password',{method:'POST',headers:{'Content-Type':'application/json','X-EVO':'1',Cookie:ck},body:JSON.stringify({atual:nova,nova:'Ant26ab'})});t('troca a senha',r.status===200);
 r=await fetch(B+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo:'ANT-3302',senha:'Ant26ab'})});const ck2=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 r=await fetch(B+'/admin/mode',{method:'POST',headers:{'Content-Type':'application/json','X-EVO':'1',Cookie:ck2},body:JSON.stringify({modo:'codigo',senhaAdmin:'Ant26ab'})});t('liga o modo código',r.status===200);
 [s,x]=await get('/recover?key='+K+'&codigo=ANT-3302');const cod=(x.match(/: ([A-Z]{2}\d{4})\n/)||[])[1];t('no modo código devolve um código de acesso (2 letras + 4 números)',s===200&&!!cod,x);
 r=await fetch(B+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo:cod})});t('entra só com o código recuperado',r.status===200);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})();
