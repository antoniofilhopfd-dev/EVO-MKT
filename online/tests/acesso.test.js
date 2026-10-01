// Modo de acesso "somente código" (2 letras + 4 números) e suas proteções. Uso: MAILLOG=... node acesso.test.js <install.out>
const fs=require('fs');const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];
const API=(process.env.BASE||'http://127.0.0.1:8080')+'/api';const MAILLOG=process.env.MAILLOG;
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('     ',JSON.stringify(x).slice(0,300))};
const jar=(r,into)=>{(r.headers.getSetCookie?.()||[]).forEach(c=>{const [kv]=c.split(';');const [k,v]=kv.split('=');into[k]=v});return into};
const ck=j=>Object.entries(j).map(([k,v])=>k+'='+v).join('; ');
async function call(p,{m='GET',b,cookies,pt,jarOut}={}){const h={'X-EVO':'1'};if(b)h['Content-Type']='application/json';if(cookies)h.Cookie=ck(cookies);if(pt){h['X-Portal-Token']=pt;delete h['X-EVO']}
 const r=await fetch(API+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined});if(jarOut)jar(r,jarOut);let j;try{j=await r.json()}catch{}return{s:r.status,j}}
const mails=()=>MAILLOG&&fs.existsSync(MAILLOG)?fs.readFileSync(MAILLOG,'utf8'):'';
(async()=>{
 let r=await call('/auth/mode');t('modo padrão é "senha"',r.j.modo==='senha');
 // ---- Gerente entra com senha e liga o modo por código ----
 const GJ={};r=await call('/auth/login',{m:'POST',b:{codigo:'NAT-3301',senha:pw('NAT-3301')},jarOut:GJ});t('Gerente entra com senha (modo atual)',r.s===200);
 r=await call('/admin/mode',{m:'POST',cookies:GJ,b:{modo:'codigo'}});t('ligar o modo por código exige a senha de administração',r.s===403);
 r=await call('/admin/mode',{m:'POST',cookies:GJ,b:{modo:'codigo',senhaAdmin:'errada'}});t('senha de administração errada é recusada',r.s===403);
 r=await call('/admin/mode',{m:'POST',cookies:GJ,b:{modo:'codigo',senhaAdmin:pw('NAT-3301')}});const codes=r.j.codigos||[];
 t('liga o modo e gera 10 códigos (5 equipe + 5 portal)',r.s===200&&codes.length===10&&codes.filter(c=>c.tipo==='portal').length===5,r.j);
 t('códigos têm 2 letras (sem I/O) + 4 números',codes.every(c=>/^[A-HJ-NP-Z]{2}[0-9]{4}$/.test(c.acesso)));
 t('códigos são únicos e sem sequências óbvias',new Set(codes.map(c=>c.acesso)).size===10&&codes.every(c=>!/(\d)\1{3}/.test(c.acesso)&&!/1234|4321|0000/.test(c.acesso)));
 const C={};codes.forEach(c=>C[c.codigo]=c.acesso);
 r=await call('/auth/mode');t('modo público informa "codigo"',r.j.modo==='codigo');
 r=await call('/admin/users',{cookies:GJ});t('lista de acessos não expõe os códigos',!JSON.stringify(r.j).includes(C['ANT-3302']));
 // ---- login só com código ----
 r=await call('/auth/login',{m:'POST',b:{codigo:'ANT-3302',senha:pw('ANT-3302')}});t('senha antiga deixa de valer no modo por código',r.s===401);
 const before=(mails().match(/Novo acesso: Antônio Filho/g)||[]).length;
 const AJ={};r=await call('/auth/login',{m:'POST',b:{codigo:C['ANT-3302'].toLowerCase()},jarOut:AJ});t('Equipe entra só com o código (aceita minúsculas)',r.s===200&&r.j.user.name==='Antônio Filho'&&r.j.mustChange===false);
 t('cookie de aparelho conhecido é criado',!!AJ.evo_dev&&!!AJ.evo_sid);
 if(MAILLOG)t('aparelho novo: Gerente e Antônio recebem alerta por e-mail',(mails().match(/Novo acesso: Antônio Filho/g)||[]).length===before+1);
 r=await call('/auth/me',{cookies:AJ});t('sessão funciona',r.s===200);
 const n1=(mails().match(/Novo acesso/g)||[]).length;await call('/auth/login',{m:'POST',b:{codigo:C['ANT-3302']},cookies:{evo_dev:AJ.evo_dev}});
 if(MAILLOG)t('mesmo aparelho: não envia novo alerta',(mails().match(/Novo acesso/g)||[]).length===n1);
 const GJ2={};r=await call('/auth/login',{m:'POST',b:{codigo:C['NAT-3301']},jarOut:GJ2});t('Gerente entra com código e ainda precisa definir a senha de administração',r.s===200&&r.j.mustChange===true);
 // ---- ações sensíveis exigem confirmação ----
 r=await call('/admin/reset-password',{m:'POST',cookies:GJ2,b:{tipo:'interno',codigo:'ANT-3302'}});t('gerar novo código exige senha de administração',r.s===403);
 r=await call('/admin/user-active',{m:'POST',cookies:GJ2,b:{tipo:'portal',codigo:'MED-2604',ativo:false}});t('ativar/desativar acesso exige confirmação',r.s===403);
 r=await call('/integrations/settings',{m:'POST',cookies:GJ2,b:{meta_app_id:'X'}});t('salvar credenciais de integração exige confirmação',r.s===403);
 r=await call('/integrations/settings',{m:'POST',cookies:GJ2,b:{meta_app_id:'X',senhaAdmin:pw('NAT-3301')}});t('com a senha de administração, passa',r.s===200);
 r=await call('/admin/mode',{m:'POST',cookies:AJ,b:{modo:'senha',senhaAdmin:'x'}});t('Equipe não muda o modo de acesso',r.s===403);
 r=await call('/admin/reset-password',{m:'POST',cookies:GJ2,b:{tipo:'interno',codigo:'ANT-3302',senhaAdmin:pw('NAT-3301')}});const novo=r.j.senhaTemporaria;
 t('novo código gerado (formato válido) e diferente do antigo',r.s===200&&/^[A-HJ-NP-Z]{2}[0-9]{4}$/.test(novo)&&novo!==C['ANT-3302']);
 r=await call('/auth/login',{m:'POST',b:{codigo:C['ANT-3302']}});t('código antigo deixa de funcionar',r.s===401);
 r=await call('/auth/login',{m:'POST',b:{codigo:C['ANT-3302']},cookies:{evo_dev:AJ.evo_dev}});t('aparelhos antigos da pessoa são removidos ao gerar novo código',r.s===401);
 r=await call('/auth/me',{cookies:AJ});t('sessão aberta com o código antigo é encerrada',r.s===401);
 const ND={};r=await call('/auth/login',{m:'POST',b:{codigo:novo},jarOut:ND});t('código novo funciona',r.s===200&&!!ND.evo_dev);
 // ---- Portal só com código + isolamento ----
 const PJ={};r=await call('/portal/login',{m:'POST',b:{codigo:C['INF-2601']},jarOut:PJ});const PT=r.j.token;t('Portal entra só com o código',r.s===200&&!!PT&&r.j.user.segmentos[0]==='Infantil');
 r=await call('/portal/requests',{m:'POST',pt:PT,b:{titulo:'Teste código',objetivo:'x',segmento:'Infantil',prioridade:'NORMAL'}});t('Portal cria demanda',r.s===201);
 r=await call('/portal/login',{m:'POST',b:{codigo:C['MED-2604']}});r=await call('/portal/requests',{pt:r.j.token});t('isolamento por segmento continua valendo',r.s===200&&r.j.rows.length===0);
 r=await call('/data?module=tarefas',{pt:PT});t('Portal continua sem acesso a áreas internas',r.s===401||r.s===403);
 // ---- proteção contra adivinhação ----
 r=await call('/auth/login',{m:'POST',b:{codigo:'ZZ9999'}});t('código inexistente = erro genérico',r.s===401&&/Código inválido/.test(r.j.error));
 r=await call('/auth/login',{m:'POST',b:{codigo:'abc'}});t('formato inválido = mesmo erro (não revela regra)',r.s===401&&/Código inválido/.test(r.j.error));
 for(let i=0;i<9;i++)await call('/auth/login',{m:'POST',b:{codigo:'QQ'+String(1000+i)}});
 r=await call('/auth/login',{m:'POST',b:{codigo:novo}});t('proteção global ativa: aparelho NOVO não entra nem com código certo',r.s===429&&/Proteção ativada/.test(r.j.error),r);
 r=await call('/auth/login',{m:'POST',b:{codigo:novo},cookies:{evo_dev:ND.evo_dev}});
 t('aparelho já conhecido continua entrando durante o ataque',r.s===200,r);
 if(MAILLOG)t('Gerente recebe alerta de tentativas em massa',/Alerta: muitas tentativas/.test(mails()));
 for(let i=0;i<20;i++)await call('/auth/login',{m:'POST',b:{codigo:'RR'+String(2000+i)},cookies:{evo_dev:ND.evo_dev}});
 r=await call('/auth/login',{m:'POST',b:{codigo:novo},cookies:{evo_dev:ND.evo_dev}});t('limite por IP bloqueia mesmo aparelho conhecido',r.s===429&&/deste endereço/.test(r.j.error),r);
 r=await call('/auth/me',{cookies:GJ2});t('quem já está logado não é afetado',r.s===200);
 r=await call('/admin/audit',{cookies:GJ2});t('auditoria registra novos aparelhos, falhas e mudanças',r.j.some(x=>x.acao==='novo-dispositivo')&&r.j.some(x=>x.acao==='login-falhou')&&r.j.some(x=>x.acao==='modo-acesso:codigo'));
 // ---- voltar ao modo por senha ----
 r=await call('/admin/mode',{m:'POST',cookies:GJ2,b:{modo:'senha',senhaAdmin:pw('NAT-3301')}});t('Gerente volta ao modo por senha',r.s===200&&r.j.modo==='senha');
 r=await call('/auth/login',{m:'POST',b:{codigo:'EDU-3305',senha:pw('EDU-3305')}});t('senhas voltam a valer',r.s===200);
 console.log(`\n${ok} ok, ${bad} falhas`);process.exit(bad?1:0)})().catch(e=>{console.log('ERRO',e.stack.split('\n').slice(0,3).join(' | '));process.exit(1)});
