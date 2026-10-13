// Gestão do trabalho: comentários, checklist, subtarefas, dependências, recorrência, automações, histórico de prazo, integridade. Uso: node trabalho.test.js <install.out>
const fs=require('fs');const {execFileSync}=require('child_process');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,600))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const sql=q=>execFileSync('mariadb',['--default-character-set=utf8mb4','-uroot','-S','/run/mysqld/mysqld.sock','evowebtest','-N','-e',q],{encoding:'utf8'});
(async()=>{
 const login=async(c,n)=>{let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});let ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:n})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:n})});return {...J,Cookie:cookie(r)}};
 const G=await login('NAT-3301','Nat26ab'),E=await login('ANT-3302','Ant26ab');
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const plog=async c=>({'X-Portal-Token':(await (await fetch(B+'/portal/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})})).json()).token,'X-EVO':'1','Content-Type':'application/json'});
 const P1=await plog('INF-2601'),P2=await plog('MED-2604');
 const tar=async(b)=>(await call('POST','/data?module=tarefas',{status:'NOVO',...b}));
 const put=(id,b,h=G)=>call('PUT','/data?module=tarefas&id='+id,b,h);

 // ---- dependências e subtarefas ----
 const [,A]=await tar({titulo:'Base'});const [,Bt]=await tar({titulo:'Depende da base',dependeDe:A.id});
 let [s,r]=await put(Bt.id,{status:'CONCLUÍDO'});t('não conclui uma tarefa cuja dependência está aberta (409)',s===409&&/depende de/.test(r.error),r);
 await put(A.id,{status:'CONCLUÍDO'});[s]=await put(Bt.id,{status:'CONCLUÍDO'});t('depois de concluir a dependência, conclui (200)',s===200);
 [s]=await put(A.id,{dependeDe:A.id});t('tarefa não depende de si mesma (400)',s===400);
 [s,r]=await put(A.id,{dependeDe:Bt.id});t('ciclo de dependência é recusado (400)',s===400&&/circular/.test(r.error),r);
 [s]=await tar({titulo:'x',dependeDe:'TAR-9999'}).then(x=>[x[0]]);t('dependência inexistente é recusada (400)',s===400);
 const [,Pai]=await tar({titulo:'Tarefa principal'});const [s1,Sub]=await tar({titulo:'Subtarefa 1',tarefaPaiId:Pai.id});
 t('cria subtarefa vinculada à principal',s1===201&&Sub.tarefaPaiId===Pai.id);
 [s]=await tar({titulo:'neto',tarefaPaiId:Sub.id}).then(x=>[x[0]]);t('subtarefa de subtarefa é recusada (um nível só)',s===400);
 [s]=await put(Pai.id,{tarefaPaiId:Sub.id});t('tarefa que já tem subtarefa não vira subtarefa',s===400);

 // ---- histórico de prazo e responsável ----
 const [,H]=await tar({titulo:'Com prazo',prazo:'2026-11-10',responsavel:'Antônio Filho'});
 await put(H.id,{prazo:'2026-11-20'});await put(H.id,{responsavel:'Natália Mello'});
 [,r]=await call('GET','/timeline?module=tarefas&id='+H.id);
 t('mudança de prazo e de responsável entram na linha do tempo',r.rows.some(x=>/Prazo: 2026-11-10 → 2026-11-20/.test(x.texto))&&r.rows.some(x=>/Responsável: Antônio Filho → Natália Mello/.test(x.texto)),r.rows);

 // ---- recorrência ----
 const [,R]=await tar({titulo:'Relatório semanal',recorrencia:'SEMANAL',prazo:'2026-11-02',responsavel:'Natália Mello'});
 await put(R.id,{status:'CONCLUÍDO'});await put(R.id,{status:'NOVO'});await put(R.id,{status:'CONCLUÍDO'});
 const todas=(await call('GET','/data?module=tarefas'))[1].rows;const filhas=todas.filter(x=>x.origemRecorrenciaId===R.id);
 t('concluir tarefa recorrente cria UMA próxima ocorrência (sem duplicar ao reabrir/concluir de novo)',filhas.length===1&&filhas[0].prazo==='2026-11-09'&&filhas[0].status==='NOVO'&&filhas[0].responsavel==='Natália Mello',filhas);
 const [,R2]=await tar({titulo:'Mensal até outubro',recorrencia:'MENSAL',prazo:'2026-10-15',recorrenciaAte:'2026-10-31'});await put(R2.id,{status:'CONCLUÍDO'});
 t('recorrência respeita "recorrer até"',!(await call('GET','/data?module=tarefas'))[1].rows.some(x=>x.origemRecorrenciaId===R2.id));
 await call('POST','/admin/automacoes',{auto_recorrencia:false});
 const [,R3]=await tar({titulo:'Sem automação',recorrencia:'DIÁRIA',prazo:'2026-11-02'});await put(R3.id,{status:'CONCLUÍDO'});
 t('com a automação desligada pela Gerência, nada é criado',!(await call('GET','/data?module=tarefas'))[1].rows.some(x=>x.origemRecorrenciaId===R3.id));
 t('Equipe não liga/desliga automações (403)',(await call('POST','/admin/automacoes',{auto_recorrencia:true},E))[0]===403);
 await call('POST','/admin/automacoes',{auto_recorrencia:true});

 // ---- tarefa criada automaticamente ao distribuir a demanda ----
 const dem=(await (await fetch(B+'/portal/requests',{method:'POST',headers:P1,body:JSON.stringify({titulo:'Demanda automática',objetivo:'x',segmento:'Infantil',prioridade:'ALTA',tipoSolicitacao:'Post'})})).json()).id;
 const ps=(b)=>call('PUT','/data?module=solicitacoes&id='+dem,b);
 await ps({status:'EM ANÁLISE'});await ps({status:'DISTRIBUÍDA',responsavel:'Antônio Filho'});
 let vinc=(await call('GET','/data?module=tarefas'))[1].rows.filter(x=>x.solicitacaoId===dem);
 t('distribuir a demanda com responsável cria uma tarefa vinculada',vinc.length===1&&vinc[0].responsavel==='Antônio Filho'&&vinc[0].origem==='AUTOMACAO',vinc);
 await ps({status:'EM EXECUÇÃO'});await ps({status:'EM ANÁLISE',motivoTransicao:'voltou'});await ps({status:'DISTRIBUÍDA'});
 vinc=(await call('GET','/data?module=tarefas'))[1].rows.filter(x=>x.solicitacaoId===dem);
 t('devolver e distribuir de novo não duplica a tarefa',vinc.length===1);

 // ---- comentários ----
 [s]=await call('POST','/comments',{module:'solicitacoes',id:dem,texto:'Nota interna da equipe'});
 await call('POST','/comments',{module:'solicitacoes',id:dem,texto:'Resposta para a coordenação',interno:false});
 [,r]=await call('GET','/comments?module=solicitacoes&id='+dem);t('comentários internos listados para a equipe',s===200&&r.rows.length===2);
 [,r]=await call('GET','/portal/comments?id='+dem,null,P1);
 t('o Portal só vê comentários marcados como visíveis, e o autor aparece como "Marketing"',r.rows.length===1&&r.rows[0].texto==='Resposta para a coordenação'&&r.rows[0].autor==='Marketing',r);
 [s]=await call('POST','/portal/comments',{id:dem,texto:'Obrigada!'},P1);[,r]=await call('GET','/comments?module=solicitacoes&id='+dem);
 t('a coordenação comenta na própria demanda e a equipe vê',s===200&&r.rows.some(x=>x.autor_tipo==='portal'&&x.texto==='Obrigada!'));
 t('outra coordenação não lê nem comenta (403)',(await call('GET','/portal/comments?id='+dem,null,P2))[0]===403&&(await call('POST','/portal/comments',{id:dem,texto:'invasão'},P2))[0]===403);
 t('Portal não usa a rota interna de comentários',[401,403].includes((await call('GET','/comments?module=solicitacoes&id='+dem,null,P1))[0]));
 [s]=await call('POST','/comments',{module:'configuracoes',id:'CFG-0001',texto:'x'});t('comentário em módulo não permitido é recusado (400)',s===400);

 // ---- checklist ----
 await call('POST','/checklist',{module:'tarefas',id:Pai.id,texto:'Item A'});await call('POST','/checklist',{module:'tarefas',id:Pai.id,texto:'Item B'});
 [,r]=await call('GET','/checklist?module=tarefas&id='+Pai.id);t('checklist com itens em ordem',r.rows.length===2&&r.rows[0].texto==='Item A');
 await call('PUT','/checklist',{itemId:r.rows[0].id,feito:true});[,r]=await call('GET','/checklist?module=tarefas&id='+Pai.id);t('marcar item como feito',r.rows[0].feito===1);
 await call('DELETE','/checklist?itemId='+r.rows[1].id);[,r]=await call('GET','/checklist?module=tarefas&id='+Pai.id);t('remover item',r.rows.length===1);

 // ---- integridade, lixeira e busca ----
 [,r]=await call('GET','/admin/integridade');t('verificação de integridade roda e não acusa problemas no estado normal',r.achados.length===0,r.achados);
 t('integridade é só da Gerência (403 para Equipe)',(await call('GET','/admin/integridade',null,E))[0]===403);
 sql(`UPDATE records SET data=JSON_SET(data,'$.solicitacaoId','SOL-9999') WHERE modulo='tarefas' AND id='${Sub.id}'`);
 [,r]=await call('GET','/admin/integridade');t('detecta vínculo quebrado (tarefa aponta para demanda inexistente)',r.achados.some(x=>x.tipo==='vinculo_quebrado'&&x.registro===Sub.id),r.achados);
 sql(`UPDATE records SET data=JSON_REMOVE(data,'$.solicitacaoId') WHERE modulo='tarefas' AND id='${Sub.id}'`);
 const [,D]=await call('POST','/data?module=tarefas',{titulo:'TituloExclusivoLixeira',status:'NOVO'});
 await call('DELETE','/data?module=tarefas&id='+D.id);
 [,r]=await call('GET','/search?q=TituloExclusivoLixeira');t('item excluído não aparece na busca global',r.length===0,r);
 [,r]=await call('GET','/admin/integridade');t('item na lixeira não gera falso alarme de órfão',r.achados.length===0,r.achados);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
