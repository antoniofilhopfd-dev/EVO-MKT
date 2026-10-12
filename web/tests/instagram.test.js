// Instagram: várias contas, permissões, token expirado, métricas indisponíveis. Uso: node instagram.test.js <install.out>
const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,500))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
(async()=>{
 let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:pw('NAT-3301')})});let ck=cookie(r);
 await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw('NAT-3301'),nova:'Nat26ab'})});
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:'Nat26ab'})});const G={...J,Cookie:cookie(r)};
 const call=async(m,u,b)=>{const x=await fetch(B+u,{method:m,headers:G,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const tok=(token)=>call('POST','/integrations/meta/token',{token});
 const st=async()=>(await call('GET','/integrations/status'))[1].instagram;
 const pr=async id=>((await call('GET','/integrations/prontidao'))[1].itens.find(x=>x.id===id)||{});
 // várias contas
 let [s]=await tok('MULTI_TOKEN');let ig=await st();
 t('duas contas Instagram nas Páginas: lista as duas e usa a primeira',s===200&&ig.contas.length===2&&ig.usuario==='evolucaopb',ig);
 [s]=await call('POST','/integrations/meta/account',{ig_user_id:'17841499999999999'});ig=await st();
 t('Gerência escolhe a outra conta',s===200&&ig.usuario==='outraconta'&&ig.igUserId==='17841499999999999',ig);
 [s]=await call('POST','/integrations/meta/account',{ig_user_id:'123'});t('conta que não pertence às Páginas é recusada',s===400);
 // permissões
 await tok('LIMITED_TOKEN');ig=await st();
 t('permissão desmarcada é detectada e aparece na prontidão',ig.permissoesFaltando.includes('instagram_content_publish')&&(await pr('meta_perm')).ok===false);
 await tok('GOOD_TOKEN');t('com todas as permissões, o alerta some',(await pr('meta_perm')).ok===true);
 // token expirado
 [s]=await tok('EXPIRED_TOKEN');ig=await st();
 const nt=(await call('GET','/notificacoes'))[1].rows;
 t('token expirado (erro 190) marca "reconectar", avisa na central e na prontidão',ig.tokenInvalido===true&&nt.some(n=>n.tipo==='integracao_falha'&&/expirou|revogado/.test(n.texto))&&(await pr('meta_valido')).ok===false,{ig,nt:nt.slice(0,2)});
 await tok('GOOD_TOKEN');t('trocar por um token válido limpa o alerta',(await st()).tokenInvalido===false&&(await pr('meta_valido')).ok===true);
 // métrica retirada pela Meta
 await tok('NOVIEWS_TOKEN');[s,r]=await call('POST','/integrations/instagram/sync',{});
 const lg=(await call('GET','/integrations/log'))[1];
 t('métrica indisponível não derruba a sincronização: segue com as demais e registra aviso',s===200&&lg.some(l=>/indisponíveis.*views/.test(l.msg)),{s,r,lg:lg.slice(0,3)});
 const ins=(await call('GET','/data?module=instagram'))[1].rows;
 t('os dados das outras métricas foram gravados',ins.some(x=>x.origem==='INSTAGRAM_API'&&Number(x.alcance)>0),ins.slice(0,1));
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
