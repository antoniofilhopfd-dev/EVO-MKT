// Integridade e segurança: edição simultânea, leitura restrita, varredura de rotas sem sessão, IDOR entre segmentos. Uso: node integridade.test.js <install.out>
const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,400))};
const J={'Content-Type':'application/json','X-EVO':'1'};
const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
(async()=>{
 let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:pw('NAT-3301')})});let ck=cookie(r);
 await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw('NAT-3301'),nova:'Nat26ab'})});
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:'Nat26ab'})});ck=cookie(r);const G={...J,Cookie:ck};
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'ANT-3302',senha:pw('ANT-3302')})});let ak=cookie(r);
 await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ak},body:JSON.stringify({atual:pw('ANT-3302'),nova:'Ant26ab'})});
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'ANT-3302',senha:'Ant26ab'})});const E={...J,Cookie:cookie(r)};
 const pl=async(c,s)=>{const x=await fetch(B+'/portal/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:s})});return (await x.json()).token};
 const P1={'X-Portal-Token':await pl('INF-2601',pw('INF-2601')),'X-EVO':'1'},P2={'X-Portal-Token':await pl('MED-2604',pw('MED-2604')),'X-EVO':'1'};
 const st=async(m,u,h,b)=>(await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined})).status;

 // ---- 1) edição simultânea não perde campos ----
 const novo=await (await fetch(B+'/data?module=tarefas',{method:'POST',headers:G,body:JSON.stringify({titulo:'Concorrência',status:'NOVO'})})).json();
 const N=30;const res=await Promise.all(Array.from({length:N},(_,i)=>fetch(B+'/data?module=tarefas&id='+novo.id,{method:'PUT',headers:G,body:JSON.stringify({['campo'+i]:'v'+i})}).then(x=>x.status)));
 const fin=await (await fetch(B+'/data?module=tarefas&id='+novo.id,{headers:G})).json();
 const faltam=Array.from({length:N},(_,i)=>i).filter(i=>fin['campo'+i]!=='v'+i);
 t(`${N} edições simultâneas do mesmo registro: todas respondem 200`,res.every(x=>x===200),res);
 t(`${N} edições simultâneas: nenhum campo foi perdido`,faltam.length===0,{faltam});

 // ---- 2) leitura restrita ----
 t('Equipe NÃO lê Configurações (403)',await st('GET','/data?module=configuracoes',E)===403);
 t('Gerente lê Configurações (200)',await st('GET','/data?module=configuracoes',G)===200);
 t('Equipe lê Tarefas (200)',await st('GET','/data?module=tarefas',E)===200);

 // ---- 3) varredura: nenhuma rota protegida responde sem sessão ----
 const gets=['/health','/auth/me','/data?module=tarefas','/search?q=a','/backup/list','/backup/log','/backup/validate?file=evo_backup_20260101_000000_x.json.gz','/backup/download?file=evo_backup_20260101_000000_x.json.gz','/admin/users','/admin/audit','/portal/users','/integrations/status','/integrations/log','/integrations/instagram/queue','/manager/notices','/portal/requests','/portal/notices','/file?path=ANEXOS/SOLICITACOES/x','/portal/file?path=ANEXOS/SOLICITACOES/x','/integrations/meta/connect','/integrations/google/connect'];
 const posts=['/backup','/backup/restore','/admin/users/create','/admin/users/delete','/admin/users/role','/admin/users/code','/admin/mode','/admin/codes','/admin/import','/admin/reset-password','/admin/user-active','/admin/seed-equipe','/integrations/settings','/integrations/meta/token','/integrations/meta/disconnect','/integrations/google/disconnect','/integrations/instagram/sync','/integrations/instagram/publish','/integrations/google/calendar/sync','/integrations/google/sheets/export','/manager/notices','/manager/notices/remove','/manager/upload?id=SOL-0001','/portal/requests','/portal/upload?id=SOL-0001','/portal/password','/auth/password'];
 const semSessao=[];for(const u of gets){const s=await st('GET',u,{});if(![401,403].includes(s))semSessao.push(['GET',u,s])}
 for(const u of posts){const s=await st('POST',u,{'Content-Type':'application/json','X-EVO':'1'},{});if(![401,403].includes(s))semSessao.push(['POST',u,s])}
 t(`varredura: ${gets.length+posts.length} rotas protegidas recusam quem não tem sessão (401/403)`,semSessao.length===0,semSessao);
 t('POST sem cabeçalho X-EVO é recusado (CSRF)',await st('POST','/data?module=tarefas',{'Content-Type':'application/json',Cookie:ck},{titulo:'x'})===403);
 t('rotas públicas continuam públicas: heartbeat e modo de acesso',await st('GET','/heartbeat',{})===200&&await st('GET','/auth/mode',{})===200);

 // ---- 4) Equipe não usa funções da Gerência ----
 const prot=[['GET','/admin/users'],['GET','/admin/audit'],['GET','/backup/list'],['GET','/backup/log'],['POST','/backup'],['POST','/backup/restore'],['POST','/admin/mode'],['POST','/admin/users/create'],['POST','/admin/users/delete'],['POST','/admin/users/code'],['POST','/admin/import'],['GET','/integrations/status'],['POST','/integrations/settings'],['GET','/portal/users']];
 const eq=[];for(const [m,u] of prot){const s=await st(m,u,E,m==='POST'?{}:undefined);if(s!==403)eq.push([m,u,s])}
 t('Equipe recebe 403 em todas as rotas de Gerência',eq.length===0,eq);

 // ---- 5) o Portal não entra nas áreas internas ----
 const ptt=[['GET','/data?module=tarefas'],['GET','/admin/users'],['GET','/backup/list'],['GET','/search?q=a'],['GET','/file?path=ANEXOS/SOLICITACOES/x'],['POST','/data?module=tarefas'],['DELETE','/data?module=solicitacoes&id=SOL-0001'],['POST','/admin/mode']];
 const pe=[];for(const [m,u] of ptt){const s=await st(m,u,P1,m==='GET'?undefined:{});if(![401,403].includes(s))pe.push([m,u,s])}
 t('Token do Portal não acessa nenhuma rota interna',pe.length===0,pe);

 // ---- 6) IDOR entre segmentos (arquivo e demanda) ----
 const dem=await (await fetch(B+'/portal/requests',{method:'POST',headers:{...P1,'Content-Type':'application/json'},body:JSON.stringify({titulo:'Demanda Infantil',objetivo:'x',segmento:'Infantil',prioridade:'MÉDIA'})})).json();
 const fd=new FormData();fd.append('files',new File(['segredo infantil'],'doc.txt',{type:'text/plain'}));
 const up=await (await fetch(B+'/portal/upload?id='+dem.id,{method:'POST',headers:P1,body:fd})).json();const path=up.files[0];
 t('dono do segmento baixa o próprio anexo (200)',await st('GET','/portal/file?path='+encodeURIComponent(path),P1)===200);
 t('outro segmento NÃO baixa o anexo (403)',await st('GET','/portal/file?path='+encodeURIComponent(path),P2)===403);
 t('outro segmento NÃO anexa em demanda alheia (403)',await st('POST','/portal/upload?id='+dem.id,P2)===403);
 const lista2=await (await fetch(B+'/portal/requests',{headers:P2})).json();t('outro segmento não vê a demanda na listagem',!lista2.rows.some(x=>x.id===dem.id));
 t('outro segmento NÃO altera a demanda alheia (403)',await st('PUT','/data?module=solicitacoes&id='+dem.id,P2,{avaliacaoNota:'5'})===403);
 t('caminho com ".." é recusado',[400,403].includes(await st('GET','/portal/file?path='+encodeURIComponent('ANEXOS/SOLICITACOES/../../etc/passwd'),P1)));
 const campos=Object.keys(lista2.rows[0]||{});t('Portal não recebe campos internos (criadoPor, comentarios…)',!JSON.stringify((await (await fetch(B+'/portal/requests',{headers:P1})).json()).rows).match(/criadoPor|comentariosInternos|gerenteTriagem/));
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
