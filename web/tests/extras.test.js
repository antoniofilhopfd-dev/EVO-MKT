// Link de aprovação sem login e NPS. Uso: node extras.test.js <install.out>
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
 const P1=await plog('INF-2601');
 const put=(id,b)=>call('PUT','/data?module=solicitacoes&id='+id,b);
 const nova=async(extra={})=>{const r=await (await fetch(B+'/portal/requests',{method:'POST',headers:P1,body:JSON.stringify({titulo:'Demanda extra',objetivo:'x',segmento:'Infantil',prioridade:'MÉDIA',tipoSolicitacao:'Post',...extra})})).json();return r.id};
 const subir=async id=>{const f=new FormData();f.append('files',new File(['arquivo final'],'final.txt',{type:'text/plain'}));return (await fetch(B+'/manager/upload?id='+id,{method:'POST',headers:{Cookie:G.Cookie,'X-EVO':'1'},body:f})).status};
 const hist=id=>sql(`SELECT CONCAT(ator,'|',de,'>',para,'|',motivo) FROM status_history WHERE modulo='solicitacoes' AND registro='${id}' ORDER BY id`).trim().split('\n');

 // =============== link de aprovação ===============
 const id=await nova();await put(id,{status:'EM ANÁLISE'});await put(id,{status:'EM EXECUÇÃO',responsavel:'Antônio Filho'});
 let [s,r]=await call('POST','/manager/approval-link',{id});t('link só é criado quando a entrega aguarda aprovação (409)',s===409,r);
 t('upload da entrega funciona',await subir(id)===200);
 await put(id,{status:'AGUARDANDO APROVAÇÃO DO SOLICITANTE'});
 [s,r]=await call('POST','/manager/approval-link',{id});
 t('Gerência gera o link (url com token, validade)',s===200&&/\/aprovar\.html\?t=[0-9a-f]{64}$/.test(r.url)&&r.dias===7,r);
 const tok=r.url.split('t=')[1];
 t('o token não fica gravado no banco (só o hash)',!sql('SELECT token_hash FROM approval_links').includes(tok));
 const pub=async(m,u,b)=>{const x=await fetch(B+u,{method:m,headers:{'X-EVO':'1',...(b?{'Content-Type':'application/json'}:{})},body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j,x]};
 [s,r]=await pub('GET','/public/approval?t='+tok);
 t('sem login, o link mostra título e arquivos da entrega',s===200&&r.titulo==='Demanda extra'&&r.arquivos.length===1&&!('responsavel' in r),r);
 const xf=await fetch(B+'/public/approval/file?t='+tok+'&path='+encodeURIComponent(r.arquivos[0].path));
 t('o arquivo da entrega baixa pelo link',xf.status===200&&(await xf.text())==='arquivo final');
 [s]=await pub('GET','/public/approval/file?t='+tok+'&path='+encodeURIComponent('ANEXOS/SOLICITACOES/OUTRA/x.txt'));t('arquivo fora da entrega é recusado (403)',s===403);
 [s]=await pub('GET','/public/approval?t='+'0'.repeat(64));t('token inexistente: 404',s===404);
 [s]=await pub('POST','/public/approval',{t:tok,acao:'APROVADO',nome:'',comentario:''});t('sem nome: 400',s===400);
 [s]=await pub('POST','/public/approval',{t:tok,acao:'AJUSTES SOLICITADOS',nome:'Maria Diretora',comentario:''});t('pedir ajustes sem comentário: 400',s===400);
 [s]=await pub('POST','/public/approval',{t:tok,acao:'AJUSTES SOLICITADOS',nome:'Maria Diretora',comentario:'Trocar a cor do título'});
 let sol=(await call('GET','/data?module=solicitacoes&id='+id))[1];
 t('pedido de ajustes pelo link volta a demanda para execução e registra quem pediu',s===200&&sol.status==='EM EXECUÇÃO'&&hist(id).some(x=>/^link:Maria Diretora\|AGUARDANDO APROVAÇÃO DO SOLICITANTE>EM EXECUÇÃO\|.*Trocar a cor/.test(x)),hist(id));
 [s]=await pub('POST','/public/approval',{t:tok,acao:'APROVADO',nome:'Maria Diretora'});t('o link é de uso único (404 na segunda vez)',s===404);
 await put(id,{status:'AGUARDANDO APROVAÇÃO DO SOLICITANTE'});
 [,r]=await call('POST','/manager/approval-link',{id});const tok2=r.url.split('t=')[1];
 [s]=await pub('POST','/public/approval',{t:tok2,acao:'APROVADO',nome:'João Coordenador'});
 sol=(await call('GET','/data?module=solicitacoes&id='+id))[1];
 t('aprovação pelo link conclui a demanda',s===200&&sol.status==='CONCLUÍDA'&&sol.aprovadoPorLink==='João Coordenador'&&sol.aprovacaoSolicitante==='APROVADO',sol);
 const nt=(await call('GET','/notificacoes'))[1].rows;t('Gerência é avisada na central',nt.some(n=>/link de aprovação/i.test(n.titulo)&&n.registro===id));
 const id2=await nova();await put(id2,{status:'EM ANÁLISE'});await put(id2,{status:'EM EXECUÇÃO'});await subir(id2);await put(id2,{status:'AGUARDANDO APROVAÇÃO DO SOLICITANTE'});
 [,r]=await call('POST','/manager/approval-link',{id:id2});const tok3=r.url.split('t=')[1];
 sql(`UPDATE approval_links SET expira_em='2020-01-01T00:00:00-03:00'`);
 [s]=await pub('GET','/public/approval?t='+tok3);t('link vencido: 404',s===404);
 [s]=await pub('POST','/manager/approval-link',{id:id2});t('gerar link exige sessão (sem login: 401/403)',[401,403].includes(s));
 [s]=await call('POST','/manager/approval-link',{id:id2},E);t('Equipe também pode gerar o link',s===200);

 // =============== NPS ===============
 const a=await nova(),b=await nova();
 for(const x of [a,b]){await put(x,{status:'EM ANÁLISE'});await put(x,{status:'EM EXECUÇÃO'})}
 const pnps=(x,n)=>fetch(B+'/data?module=solicitacoes&id='+x,{method:'PUT',headers:P1,body:JSON.stringify({npsNota:String(n)})}).then(r=>r.status);
 t('NPS antes da conclusão: 409',await pnps(a,9)===409);
 await put(a,{status:'CONCLUÍDA'});await put(b,{status:'CONCLUÍDA'});
 t('NPS fora de 0–10: 400',await pnps(a,11)===400);
 t('NPS 9 aceito; segunda resposta recusada',await pnps(a,9)===200&&await pnps(a,10)===409);
 await pnps(b,3);
 [,r]=await call('GET','/indicadores');const nps=r.indicadores.find(x=>x.id==='nps');
 t('indicador NPS: 1 promotor e 1 detrator = 0, com lista de origem',nps.valor===0&&nps.ids.includes(a)&&nps.ids.includes(b)&&r.tabelas.npsPorSegmento.some(x=>x.segmento==='Infantil'&&x.respostas>=2),nps);
 const lista=await (await fetch(B+'/portal/requests',{headers:P1})).json();t('o solicitante vê a própria resposta',lista.rows.find(x=>x.id===a).npsNota==='9');

 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
