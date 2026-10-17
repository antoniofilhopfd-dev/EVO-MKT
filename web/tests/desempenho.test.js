// Medição (antes de decidir por paginação no servidor): carrega o banco com milhares de registros e cronometra as telas mais pesadas.
// Falha só se alguma resposta passar do limite. Uso: node desempenho.test.js <install.out>
const fs=require('fs');const {execSync}=require('child_process');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,400))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const dia=n=>{const d=new Date();d.setDate(d.getDate()+n);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
(async()=>{
 let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:pw('NAT-3301')})});let ck=cookie(r);
 await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw('NAT-3301'),nova:'Nat26ab'})});
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:'Nat26ab'})});const H={...J,Cookie:cookie(r)};
 const N={solicitacoes:5000,conteudos:3000,projetos:3000,tarefas:5000};
 const linhas=[];
 for(const [mod,n] of Object.entries(N)){const pref=mod.slice(0,3).toUpperCase();for(let i=1;i<=n;i++){const id=`${pref}-9${String(i).padStart(5,'0')}`;
  const d={id,titulo:`Registro de carga ${i}`,status:mod==='solicitacoes'?'NOVA':'NOVO',prazo:dia(i%90-30),dataInicio:dia(i%90-30),publicacaoEm:dia(i%60)+'T10:00',responsavel:['Natália Mello','Antônio Filho','Monique Vilante'][i%3],segmento:'Geral',descricao:'x'.repeat(200)};
  linhas.push(`('${mod}','${id}','${JSON.stringify(d).replace(/\\/g,'\\\\').replace(/'/g,"''")}','2026-01-01T00:00:00','2026-01-01T00:00:00')`)}}
 const sql='INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES '+linhas.join(',')+';';
 fs.writeFileSync('/tmp/evo-carga.sql',sql);
 execSync('mariadb -uroot -S /run/mysqld/mysqld.sock evowebtest < /tmp/evo-carga.sql');
 const total=Object.values(N).reduce((a,b)=>a+b,0);
 const medir=async(u,limite)=>{const ini=Date.now();const x=await fetch(B+u,{headers:H});const txt=await x.text();const ms=Date.now()-ini;console.log(`     ${u}: ${ms} ms, ${(txt.length/1024).toFixed(0)} KB`);return {s:x.status,ms}};
 const rotas=[['/data?module=tarefas',3000],['/data?module=solicitacoes',3000],['/solicitacoes/painel',3000],['/planejamento/painel',3000],['/dashboard/resumo',3000],['/data?module=conteudos',3000],['/escolar/painel',2000],['/datacom/painel',2000]];
 console.log(`     banco com ${total} registros`);
 for(const [u,lim] of rotas){const m=await medir(u);t(`${u} responde em até ${lim} ms com ${total} registros`,m.s===200&&m.ms<=lim,m)}
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
