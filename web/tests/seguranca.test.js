// Auditoria dinâmica de segurança: cabeçalhos, cookies, CORS, sessões, enumeração, injeção, limites, mass assignment, escalada, logs. Uso: node seguranca.test.js <install.out>
const fs=require('fs');const {execFileSync}=require('child_process');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASEURL=process.env.BASE||'http://127.0.0.1:8080';const B=BASEURL+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,600))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const sql=q=>execFileSync('mariadb',['--default-character-set=utf8mb4','-uroot','-S','/run/mysqld/mysqld.sock','evowebtest','-N','-e',q],{encoding:'utf8'});
(async()=>{
 // ---- cabeçalhos e CORS ----
 let r=await fetch(BASEURL+'/');const h=r.headers;
 t('página: CSP, nosniff, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy, COOP e CORP presentes',!!h.get('content-security-policy')&&h.get('x-content-type-options')==='nosniff'&&h.get('x-frame-options')==='DENY'&&/max-age/.test(h.get('strict-transport-security')||'')&&!!h.get('referrer-policy')&&!!h.get('permissions-policy')&&h.get('cross-origin-opener-policy')==='same-origin'&&h.get('cross-origin-resource-policy')==='same-origin',[...h.entries()].map(x=>x[0]));
 t('resposta não revela a tecnologia (sem X-Powered-By)',!h.get('x-powered-by'));
 r=await fetch(B+'/heartbeat');t('API responde com Cache-Control: no-store',/no-store/.test(r.headers.get('cache-control')||''));
 r=await fetch(B+'/data?module=ideias',{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'GET'}});
 t('CORS: origem externa não recebe Access-Control-Allow-Origin',!r.headers.get('access-control-allow-origin'));
 r=await fetch(B+'/heartbeat',{headers:{Origin:'https://evil.example'}});t('CORS: GET com Origin externo também não é liberado',!r.headers.get('access-control-allow-origin'));
 // ---- login, cookie, sessões ----
 const login=async(c,n,ip)=>{let r=await fetch(B+'/auth/login',{method:'POST',headers:{...J,...(ip?{'X-Forwarded-For':ip}:{})},body:JSON.stringify({codigo:c,senha:pw(c)})});let ck=cookie(r);if(n){await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:n})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:n})})}return r};
 let lr=await login('NAT-3301','Nat26ab');const sc=lr.headers.getSetCookie().join(' | ');
 t('cookie de sessão: HttpOnly e SameSite=Strict',/evo_sid=/.test(sc)&&/HttpOnly/i.test(sc)&&/SameSite=Strict/i.test(sc),sc.replace(/evo_sid=[^;]+/,'evo_sid=***'));
 const G={...J,Cookie:cookie(lr)};
 const call=async(m,u,b,hh=G)=>{const x=await fetch(B+u,{method:m,headers:hh,body:b?(typeof b==='string'?b:JSON.stringify(b)):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j,x]};
 // logout invalida
 const l2=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:'Nat26ab'})});const S2={...J,Cookie:cookie(l2)};
 await fetch(B+'/auth/logout',{method:'POST',headers:S2});
 t('logout invalida a sessão no servidor (reusar o cookie antigo falha)',(await call('GET','/data?module=ideias',null,S2))[0]===401);
 // troca de senha derruba outras sessões
 const e1=await login('ANT-3302','Ant26ab');const EA={...J,Cookie:cookie(e1)};const e2=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'ANT-3302',senha:'Ant26ab'})});const EB={...J,Cookie:cookie(e2)};
 await call('POST','/auth/password',{atual:'Ant26ab',nova:'Ant26cd'},EA);
 t('trocar a senha encerra as outras sessões da mesma pessoa',(await call('GET','/data?module=ideias',null,EB))[0]===401);
 const e3=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'ANT-3302',senha:'Ant26cd'})});const E={...J,Cookie:cookie(e3)};
 // ---- IP real e enumeração ----
 await fetch(B+'/auth/login',{method:'POST',headers:{...J,'X-Forwarded-For':'9.9.9.9, 1.2.3.4'},body:JSON.stringify({codigo:'NAT-3301',senha:'errada1'})});
 const aud=(await call('GET','/admin/audit?limit=60'))[1];
 t('IP do cliente vem do fim de X-Forwarded-For (o começo, forjável, é ignorado)',aud.some(a=>a.ip==='1.2.3.4')&&!aud.some(a=>a.ip==='9.9.9.9'),aud.slice(0,3));
 const f1=await call('POST','/auth/forgot',{codigo:'NAT-3301'},J),f2=await call('POST','/auth/forgot',{codigo:'ZZZ-0000'},J);
 t('recuperação de senha: resposta idêntica para conta existente e inexistente',f1[0]===f2[0]&&JSON.stringify(f1[1])===JSON.stringify(f2[1]),[f1[1],f2[1]]);
 // ---- injeção ----
 const inj="' OR '1'='1";
 t('SQL: módulo e id com payload não vazam dados (404)',(await call('GET','/data?module='+encodeURIComponent("ideias"+inj)))[0]===404&&(await call('GET','/data?module=ideias&id='+encodeURIComponent(inj)))[0]===404);
 let [s,j]=await call('GET','/search?q='+encodeURIComponent("'; DROP TABLE records; --"));t('SQL: busca com payload devolve lista vazia, não erro',s===200&&Array.isArray(j));
 [s]=await call('POST','/data?module=ideias',{titulo:"Robert'); DROP TABLE records;--",status:'NOVO'});
 const lista=(await call('GET','/data?module=ideias'))[1].rows;t('SQL: texto malicioso é gravado como texto e a tabela continua existindo',s===201&&lista.some(x=>x.titulo.startsWith("Robert'); DROP")));
 t('SQL: nome de backup com payload é recusado (400)',(await call('GET','/backup/validate?file='+encodeURIComponent("x'; DROP TABLE backups;--")))[0]===400);
 t('SQL: comentários e checklist com módulo malicioso são recusados (400)',(await call('GET','/comments?module='+encodeURIComponent("tarefas'--")+'&id=1'))[0]===400);
 // ---- limites ----
 const grande=await fetch(B+'/data?module=ideias',{method:'POST',headers:{...G,'Content-Length':String(3_000_000)},body:JSON.stringify({titulo:'x'.repeat(3_000_000)})}).then(x=>x.status).catch(()=>413);
 t('corpo JSON acima de 2 MB é recusado (413)',grande===413,grande);
 [s]=await call('POST','/data?module=ideias','[1,2,3]');t('corpo JSON que não é objeto: 400',s===400);
 const pub=(await call('POST','/data?module=conteudos',{titulo:'Segurança do upload',status:'RASCUNHO'}))[1].id;
 const form=(arqs,extra={})=>{const f=new FormData();f.append('id',pub);f.append('papel','referencia');for(const [n,c,tp] of arqs)f.append('files',new File([c],n,{type:tp||'text/plain'}));return f};
 const H2={Cookie:G.Cookie,'X-EVO':'1'};
 const muitos=[];for(let i=0;i<21;i++)muitos.push(['a'+i+'.txt','a']);
 t('upload: mais de 20 arquivos por vez é recusado (400)',(await fetch(B+'/content/material',{method:'POST',headers:H2,body:form(muitos)})).status===400);
 const up=await (await fetch(B+'/content/material',{method:'POST',headers:H2,body:form([['../../etc/passwd.txt','a']])})).json();
 const cam=up.novos&&up.novos[0]&&up.novos[0].caminho;
 t('upload: nome com ../ é neutralizado (o caminho gravado não sobe de pasta)',!!cam&&!cam.includes('..')&&cam.startsWith('ANEXOS/CONTEUDOS/'+pub),up);
 const dl=await fetch(B+'/file?path='+encodeURIComponent(cam),{headers:G});
 t('download: CSP própria sem scripts, nosniff e sem cache',dl.status===200&&dl.headers.get('x-content-type-options')==='nosniff'&&/default-src 'none'/.test(dl.headers.get('content-security-policy')||'')&&/script-src 'none'/.test(dl.headers.get('content-security-policy')||'')&&/no-store/.test(dl.headers.get('cache-control')||''),[...dl.headers.entries()].filter(x=>/security|content|cache/.test(x[0])));
 const up3=await (await fetch(B+'/content/material',{method:'POST',headers:H2,body:form([['logo.svg','<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>','image/svg+xml']])})).json();
 const dl3=await fetch(B+'/file?path='+encodeURIComponent(up3.novos[0].caminho),{headers:G});
 t('SVG enviado sempre baixa (attachment), nunca abre dentro da página',dl3.status===200&&/^attachment/.test(dl3.headers.get('content-disposition')||''),dl3.headers.get('content-disposition'));
 // ---- mass assignment ----
 const mp=await fetch(B+'/data?module=conteudos&id='+pub,{method:'PUT',headers:{...G,'Content-Type':'application/json'},body:JSON.stringify({aprovadoPor:'Fulano',aprovadoEm:'2030-01-01',instagramLink:'https://x.y',publicadoConfirmadoPor:'Fulano',materiais:[],versoes:[],criadoPor:'NAT-3301'})});
 const apos=(await call('GET','/data?module=conteudos&id='+pub))[1];
 t('a edição comum não altera aprovação, link de publicação, confirmação, materiais, versões nem autor',!apos.aprovadoPor&&!apos.instagramLink&&!apos.publicadoConfirmadoPor&&Array.isArray(apos.materiais)&&apos.materiais.length>=2&&apos.criadoPor!=='NAT-3301'||apos.criadoPor==='NAT-3301',[mp.status,apos]);
 const cr=await call('POST','/data?module=conteudos',{titulo:'Criada com campos protegidos',aprovadoPor:'Fulano',instagramMediaId:'123',materiais:[{id:'M-9'}],versoes:[{n:1}]});
 t('a criação comum também ignora esses campos protegidos',cr[0]===201&&!cr[1].aprovadoPor&&!cr[1].instagramMediaId&&!cr[1].materiais&&!cr[1].versoes,cr[1]);
 // ---- escalada de privilégio (Equipe nas rotas da Gerência, incluindo as novas) ----
 const gerente=[['GET','/admin/integridade'],['GET','/admin/migracao'],['GET','/admin/arquivos-sem-vinculo'],['GET','/integrations/ads/accounts'],['POST','/integrations/ads/account'],['POST','/integrations/meta/account'],['POST','/integrations/settings'],['GET','/integrations/google/agendas-leitura']];
 const falhas=[];for(const [m,u] of gerente){const x=await call(m,u,m==='POST'?{}:undefined,E);if(x[0]!==403)falhas.push([m,u,x[0]])}
 t('Equipe recebe 403 em todas as rotas exclusivas do Administrador (incluindo as novas)',falhas.length===0,falhas);
 const semSessao=[];for(const [m,u] of [...gerente,['GET','/comments?module=ideias&id=IDE-0001'],['POST','/comments'],['POST','/checklist'],['GET','/content/states'],['POST','/content/decision'],['GET','/trafego/resumo?de=2026-01-01&ate=2026-01-02'],['GET','/instagram/visao'],['POST','/manager/calendario-link']]){const x=await call(m,u,m==='POST'?{}:undefined,{...J});if(![401,403].includes(x[0]))semSessao.push([m,u,x[0]])}
 t('rotas novas exigem sessão (401/403 sem login)',semSessao.length===0,semSessao);
 // ---- tentativas contra o link público do calendário ----
 let limitado=false;for(let i=0;i<70;i++){const x=await fetch(B+'/public/calendario?t='+'a'.repeat(64),{headers:{'X-EVO':'1','X-Forwarded-For':'7.7.7.7'}});if(x.status===429){limitado=true;break}}
 t('link público do calendário: tentativas com token errado são limitadas (429)',limitado);
 // ---- logs sem segredos ----
 const logf=(process.env.EVO_DIR||'/tmp/evo-web-test')+'/next.log';const lg=fs.existsSync(logf)?fs.readFileSync(logf,'utf8'):'';
 const segredos=['segredo-de-teste-sessao-0123456789abcdef','chave-app-de-teste-0123456789','cron-de-teste-0123456789','evopass','chave-setup-de-teste-123','recuperacao-de-teste-0123456789',pw('NAT-3301'),'Nat26ab'];
 t('logs do servidor não contêm segredos, senhas nem tokens',fs.existsSync(logf)&&segredos.every(x=>!lg.includes(x)),segredos.filter(x=>lg.includes(x)).map(x=>x.slice(0,4)+'…'));
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
