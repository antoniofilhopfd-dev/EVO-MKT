// Calendário Escolar antigo: agora somente leitura (a criação/edição acontece no Calendário Geral, via Google Agenda).
// Uso: node escolar.test.js <install.out>
const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,500))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
(async()=>{
 const senha={'NAT-3301':'Nat26ab','ANT-3302':'Ant26ab'};const H={};
 for(const c of Object.keys(senha)){let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});const ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:senha[c]})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:senha[c]})});H[c]={...J,Cookie:cookie(r)}}
 const G=H['NAT-3301'],E=H['ANT-3302'];
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 let s,r;
 [s]=await call('GET','/escolar/painel',null,{...J});t('sem login o calendário escolar não abre (401)',s===401);
 [s,r]=await call('GET','/escolar/painel',null,E);t('equipe consulta, mas não edita',s===200&&r.podeEditar===false,r&&r.podeEditar);
 [s,r]=await call('GET','/escolar/painel');t('administrador também só consulta',s===200&&r.podeEditar===false);
 for(const [m,u] of [['POST','/escolar/salvar'],['POST','/escolar/mover'],['POST','/escolar/excluir']]){
  for(const [n,h] of [['administrador',G],['equipe',E]]){[s]=await call(m,u,{titulo:'Feira de Ciências',dataInicio:'2030-01-10',segmentos:['FUND1']},h);t(`${u} (${n}): somente leitura, 403`,s===403,s)}
 }
 [s]=await call('POST','/data?module=calescolar',{titulo:'Feira'},E);t('o /data genérico continua sem gravar no calendário escolar',s===403||s===400,s);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
