// Central de notificações: registro de avisos do fluxo. Uso: node notificacoes.test.js <install.out>
const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,500))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
(async()=>{
 const login=async(c,n)=>{let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});let ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:n})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:n})});return {...J,Cookie:cookie(r)}};
 const G=await login('NAT-3301','Nat26ab'),E=await login('ANT-3302','Ant26ab');
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const [,s]=await call('POST','/data?module=solicitacoes',{titulo:'Aviso teste',segmento:'Infantil',tipoSolicitacao:'Post',status:'AGUARDANDO TRIAGEM'});
 const put=b=>call('PUT','/data?module=solicitacoes&id='+s.id,b);
 await put({status:'EM ANÁLISE'});await put({status:'AGUARDANDO SOLICITANTE'});await put({status:'EM EXECUÇÃO',responsavel:'Antônio Filho'});await put({status:'AGUARDANDO APROVAÇÃO DO SOLICITANTE'});await put({status:'CONCLUÍDA'});
 let [st,n]=await call('GET','/notificacoes');
 const tipos=n.rows.filter(r=>r.registro===s.id).map(r=>r.tipo);
 t('Gerência vê o registro de avisos gerados pelo fluxo',st===200&&['complementacao','entrega','concluida'].every(x=>tipos.includes(x)),tipos);
 t('há contagem de não lidas',n.naoLidas>=3,n.naoLidas);
 const [,ne]=await call('GET','/notificacoes',null,E);
 t('Equipe vê só o que é destinado a ela (atribuição a Antônio Filho)',ne.rows.every(r=>r.destino==='Antônio Filho')&&ne.rows.some(r=>r.tipo==='responsavel'),ne.rows);
 await call('POST','/notificacoes/lida',{todas:true});
 t('marcar todas como lidas zera a contagem',(await call('GET','/notificacoes'))[1].naoLidas===0);
 t('sem sessão: 401/403',[401,403].includes((await call('GET','/notificacoes',null,{}))[0]));
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
