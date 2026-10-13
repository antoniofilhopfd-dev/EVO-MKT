// Etapa 03: transições de status, histórico, SLA, indicadores e ciclo completo. Uso: node operacao.test.js <install.out>
const fs=require('fs');const {execFileSync}=require('child_process');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,500))};
const J={'Content-Type':'application/json','X-EVO':'1'};
const sql=q=>execFileSync('mariadb',['--default-character-set=utf8mb4','-uroot','-S','/run/mysqld/mysqld.sock','evowebtest','-N','-e',q],{encoding:'utf8'});
const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
(async()=>{
 let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:pw('NAT-3301')})});let ck=cookie(r);
 await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw('NAT-3301'),nova:'Nat26ab'})});
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:'Nat26ab'})});const H={...J,Cookie:cookie(r)};
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'ANT-3302',senha:pw('ANT-3302')})});let ak=cookie(r);
 await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ak},body:JSON.stringify({atual:pw('ANT-3302'),nova:'Ant26ab'})});
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'ANT-3302',senha:'Ant26ab'})});const E={...J,Cookie:cookie(r)};
 const call=async(m,u,b,h=H)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const plog=async c=>({'X-Portal-Token':(await (await fetch(B+'/portal/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})})).json()).token,'X-EVO':'1'});
 const P1=await plog('INF-2601'),P2=await plog('MED-2604');
 const put=(id,b)=>call('PUT','/data?module=solicitacoes&id='+id,b);
 const hist=id=>sql(`SELECT CONCAT(campo,':',de,'>',para,'|',motivo) FROM status_history WHERE modulo='solicitacoes' AND registro='${id}' ORDER BY id`).trim().split('\n').filter(Boolean);

 // ---- fonte única de regras ----
 let [s,fl]=await call('GET','/fluxo');t('/fluxo traz status e transições',s===200&&fl.status.solicitacoes.includes('AGUARDANDO APROVAÇÃO DO SOLICITANTE')&&fl.solicitacoes.transicoes['NOVA'].length>0,fl);
 t('/fluxo também serve ao Portal',(await call('GET','/fluxo',null,P1))[0]===200);
 t('/fluxo sem sessão: 401/403',[401,403].includes((await call('GET','/fluxo',null,{}))[0]));

 // ---- transições ----
 const [,s1]=await call('POST','/data?module=solicitacoes',{titulo:'Fluxo A',segmento:'Infantil',tipoSolicitacao:'Post',status:'AGUARDANDO TRIAGEM',prioridade:'MÉDIA'});
 t('criação registra o status inicial no histórico',hist(s1.id).length===1&&/^status:>AGUARDANDO TRIAGEM\|/.test(hist(s1.id)[0]),hist(s1.id));
 [s]=await put(s1.id,{status:'CONCLUÍDA'});t('pular etapas (TRIAGEM → CONCLUÍDA) é recusado com 409',s===409);
 [s]=await put(s1.id,{status:'INVENTADO'});t('status inexistente: 400',s===400);
 [s]=await put(s1.id,{status:'EM ANÁLISE'});t('transição válida: 200',s===200);
 [s]=await put(s1.id,{status:'EM ANÁLISE',titulo:'Fluxo A2'});t('mesmo status (só edita título) não gera histórico',s===200&&hist(s1.id).length===2,hist(s1.id));
 [s,r]=await put(s1.id,{status:'AGUARDANDO TRIAGEM'});t('retorno sem motivo: 409 com {motivo:true}',s===409&&r.motivo===true,r);
 [s]=await put(s1.id,{status:'AGUARDANDO TRIAGEM',motivoTransicao:'Triagem precisa rever'});t('retorno com motivo: 200',s===200);
 t('o motivo fica no histórico e não vira campo do registro',hist(s1.id).some(x=>/EM ANÁLISE>AGUARDANDO TRIAGEM\|Triagem precisa rever/.test(x))&&!('motivoTransicao' in (await call('GET','/data?module=solicitacoes&id='+s1.id))[1]));
 await put(s1.id,{status:'EM ANÁLISE'});await put(s1.id,{status:'EM EXECUÇÃO',responsavel:'Antônio Filho'});
 await put(s1.id,{responsavel:'Natália Mello'});
 t('troca de responsável entra no histórico (redistribuição)',hist(s1.id).some(x=>/^responsavel:Antônio Filho>Natália Mello/.test(x)),hist(s1.id));
 await put(s1.id,{status:'CONCLUÍDA'});
 [s]=await put(s1.id,{status:'NOVA'});t('de CONCLUÍDA só se volta para EM EXECUÇÃO (409)',s===409);
 [s,r]=await put(s1.id,{status:'EM EXECUÇÃO'});t('reabrir exige motivo',s===409&&r.motivo===true);
 [s]=await put(s1.id,{status:'EM EXECUÇÃO',motivoTransicao:'Cliente pediu ajuste'});t('reabrir com motivo: 200',s===200);
 const antes=(await call('GET','/data?module=solicitacoes'))[1].rows.length;
 await put(s1.id,{status:'CONCLUÍDA'});
 t('reabrir/concluir não duplica registros',(await call('GET','/data?module=solicitacoes'))[1].rows.length===antes);

 // ---- linha do tempo ----
 [s,r]=await call('GET','/timeline?module=solicitacoes&id='+s1.id);
 t('linha do tempo interna traz status, responsável e eventos',s===200&&r.rows.some(x=>x.tipo==='status')&&r.rows.some(x=>x.tipo==='responsavel')&&r.rows.some(x=>x.tipo==='evento'),r);
 t('linha do tempo exige sessão interna',[401,403].includes((await call('GET','/timeline?module=solicitacoes&id='+s1.id,null,P1))[0]));
 // Portal: cria a própria demanda, vê só o histórico dela, com ator interno anonimizado
 const dem=(await (await fetch(B+'/portal/requests',{method:'POST',headers:{...P1,'Content-Type':'application/json'},body:JSON.stringify({titulo:'Demanda do Portal',objetivo:'x',segmento:'Infantil',prioridade:'MÉDIA',tipoSolicitacao:'Post'})})).json());
 await put(dem.id,{status:'EM ANÁLISE'});
 [s,r]=await call('GET','/portal/timeline?id='+dem.id,null,P1);
 t('Portal vê o histórico da própria demanda sem nomes internos',s===200&&r.rows.length>=2&&!r.rows.some(x=>/Natália|Antônio|NAT-|ANT-/.test(x.ator))&&r.sla&&r.sla.vencimento&&!('diasPausados' in r.sla),r);
 t('outro segmento não vê o histórico (403)',(await call('GET','/portal/timeline?id='+dem.id,null,P2))[0]===403);
 t('equipe interna não usa a rota do Portal',[401,403].includes((await call('GET','/portal/timeline?id='+dem.id))[0]));

 // ---- SLA: datas fixas (sem feriados) ----
 const seed=(id,criado,status,hs,extra={})=>{
  sql(`UPDATE records SET data=JSON_SET(data,'$.criadoEm','${criado}T10:00:00-03:00','$.status','${status}'${Object.entries(extra).map(([k,v])=>`,'$.${k}','${v}'`).join('')}) WHERE modulo='solicitacoes' AND id='${id}'`);
  sql(`DELETE FROM status_history WHERE modulo='solicitacoes' AND registro='${id}'`);
  for(const [campo,de,para,q] of hs) sql(`INSERT INTO status_history(modulo,registro,campo,de,para,ator,quando,motivo) VALUES('solicitacoes','${id}','${campo}','${de}','${para}','teste','${q}T09:00:00-03:00','')`);
 };
 const mk=async(tipo,extra={})=>(await call('POST','/data?module=solicitacoes',{titulo:'SLA '+tipo,segmento:'Infantil',tipoSolicitacao:tipo,status:'AGUARDANDO TRIAGEM',...extra}))[1].id;
 // Post (3 dias) criada ter 01/09/2026: vence sex 04/09; ficou 2 dias úteis pausada → vence ter 08/09
 const a=await mk('Post');seed(a,'2026-09-01','EM EXECUÇÃO',[['status','','AGUARDANDO TRIAGEM','2026-09-01'],['status','AGUARDANDO TRIAGEM','AGUARDANDO SOLICITANTE','2026-09-02'],['status','AGUARDANDO SOLICITANTE','EM EXECUÇÃO','2026-09-04']]);
 [s,r]=await call('GET','/sla?id='+a);t('SLA: início, vencimento e pausa em dias úteis (Post: 04/09 + 2 pausados = 08/09)',s===200&&r.inicio==='2026-09-01'&&r.vencimento==='2026-09-08'&&r.diasPausados===2&&r.estado==='vencido',r);
 const b=await mk('Post');seed(b,'2026-09-01','EM EXECUÇÃO',[['status','','AGUARDANDO TRIAGEM','2026-09-01']],{prazoNegociado:'2026-12-31'});
 [,r]=await call('GET','/sla?id='+b);t('prazo negociado substitui o cálculo e não vence',r.negociado&&r.vencimento==='2026-12-31'&&r.estado!=='vencido',r);
 const c=await mk('Reels');seed(c,'2026-09-01','CONCLUÍDA',[['status','','AGUARDANDO TRIAGEM','2026-09-01'],['status','AGUARDANDO TRIAGEM','CONCLUÍDA','2026-09-08']]);
 const d=await mk('Reels');seed(d,'2026-09-01','CONCLUÍDA',[['status','','AGUARDANDO TRIAGEM','2026-09-01'],['status','AGUARDANDO TRIAGEM','CONCLUÍDA','2026-09-15']]);
 [,r]=await call('GET','/sla?id='+c);const [,r2]=await call('GET','/sla?id='+d);
 t('SLA: concluída no vencimento = no prazo; depois = atrasada',r.estado==='concluido_no_prazo'&&r2.estado==='concluido_atrasado',[r,r2]);
 const e=await mk('Reels');seed(e,'2026-09-01','AGUARDANDO SOLICITANTE',[['status','','AGUARDANDO TRIAGEM','2026-09-01'],['status','AGUARDANDO TRIAGEM','AGUARDANDO SOLICITANTE','2026-09-02']]);
 [,r]=await call('GET','/sla?id='+e);t('SLA: aguardando solicitante fica pausado (não vence)',r.estado==='pausado',r);
 t('/sla exige sessão interna',[401,403].includes((await call('GET','/sla?id='+a,null,P1))[0]));

 // ---- indicadores ----
 const Q='/indicadores?de=2026-09-01&ate=2026-09-30&tipo=Reels';
 [s,r]=await call('GET',Q);const ind=id=>(r.indicadores||[]).find(x=>x.id===id);
 t('indicadores: só Gerência (Equipe 403)',(await call('GET',Q,null,E))[0]===403);
 t('indicadores: concluídas no período = 2, com lista de origem',s===200&&ind('concluidas').valor===2&&ind('concluidas').ids.includes(c)&&ind('concluidas').ids.includes(d),r);
 t('indicadores: cumprimento do SLA = 50% (1 de 2) e tempo médio calculado',ind('cumprimentoSla').valor===50&&ind('cumprimentoSla').detalhe==='1 de 2'&&ind('tempoAtendimento').valor===(5+10)/2,[ind('cumprimentoSla'),ind('tempoAtendimento')]);
 t('indicadores: SLA pausado lista a demanda pausada',ind('slaPausado').ids.includes(e));
 t('indicadores: todo indicador traz definição e lista de origem',r.indicadores.every(x=>x.definicao&&Array.isArray(x.ids)));
 [,r]=await call('GET','/indicadores?de=2020-01-01&ate=2020-01-31');t('período sem dados: cumprimento é null (não 0%)',r.indicadores.find(x=>x.id==='cumprimentoSla').valor===null);
 [,r]=await call('GET','/indicadores?de=2026-01-01&ate=2099-12-31');
 t('tabelas: por etapa e carga por pessoa existem; Natália aparece na redistribuição',Array.isArray(r.tabelas.porEtapa)&&Array.isArray(r.tabelas.cargaPorPessoa)&&r.indicadores.find(x=>x.id==='redistribuidas').ids.includes(s1.id),r.tabelas);

 // ---- recusa/cancelamento sempre com motivo; coordenação e data de publicação no pedido ----
 {const x=await mk('Post');
  [s,r]=await put(x,{status:'CANCELADA'});t('recusar/cancelar sem motivo é recusado (409 com {motivo:true})',s===409&&r.motivo===true&&/motivo da recusa/.test(r.error),r);
  [s]=await put(x,{status:'CANCELADA',motivoTransicao:'Fora do escopo do Marketing'});t('recusar com motivo funciona e o motivo fica no histórico',s===200&&hist(x).some(h=>/>CANCELADA\|Fora do escopo/.test(h)));
  const novo=await (await fetch(B+'/portal/requests',{method:'POST',headers:{...P1,'Content-Type':'application/json'},body:JSON.stringify({titulo:'Com data',objetivo:'x',segmento:'Infantil',prioridade:'MÉDIA',dataPublicacao:'2026-12-01',prazo:'2026-11-20'})})).json();
  t('o pedido guarda a coordenação (usuário do Portal) e a data de publicação',novo.coordenacao&&novo.dataPublicacao==='2026-12-01',novo);
  const ruim=await fetch(B+'/portal/requests',{method:'POST',headers:{...P1,'Content-Type':'application/json'},body:JSON.stringify({titulo:'Data ruim',objetivo:'x',segmento:'Infantil',dataPublicacao:'amanhã'})});t('data de publicação inválida: 400',ruim.status===400)}
 // ---- ciclo completo ----
 const cic=(await (await fetch(B+'/portal/requests',{method:'POST',headers:{...P1,'Content-Type':'application/json'},body:JSON.stringify({titulo:'Ciclo completo',objetivo:'x',segmento:'Infantil',prioridade:'ALTA',tipoSolicitacao:'Reels'})})).json()).id;
 const cnt=async()=>({s:(await call('GET','/data?module=solicitacoes'))[1].rows.length,t:(await call('GET','/data?module=tarefas'))[1].rows.length});
 const c0=await cnt();
 await put(cic,{status:'AGUARDANDO SOLICITANTE',triagemStatus:'DEVOLVIDA PARA AJUSTES'});
 await put(cic,{status:'EM ANÁLISE'});await put(cic,{status:'DISTRIBUÍDA',responsavel:'Antônio Filho'});await put(cic,{status:'EM EXECUÇÃO'});
 await put(cic,{status:'AGUARDANDO APROVAÇÃO DO SOLICITANTE'});
 await put(cic,{status:'EM EXECUÇÃO',motivoTransicao:'Ajuste pedido pelo solicitante'});await put(cic,{status:'AGUARDANDO APROVAÇÃO DO SOLICITANTE'});await put(cic,{status:'CONCLUÍDA'});
 const c1=await cnt();
 t('ciclo completo: histórico cobre todas as etapas na ordem',hist(cic).map(x=>x.split('|')[0]).join(' ').includes('>AGUARDANDO SOLICITANTE')&&hist(cic).slice(-1)[0].includes('>CONCLUÍDA'),hist(cic));
 t('ciclo completo: devolver, distribuir e reabrir não duplicam demandas; a automação cria no máximo UMA tarefa vinculada',c1.s===c0.s&&c1.t===c0.t+1,[c0,c1]);
 t('ciclo completo: demanda final em CONCLUÍDA e visível ao solicitante',(await (await fetch(B+'/portal/requests',{headers:P1})).json()).rows.find(x=>x.id===cic).status==='CONCLUÍDA');
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
