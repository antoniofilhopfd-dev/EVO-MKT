// Auditoria de segurança das áreas novas: autenticação, CSRF, autorização por perfil, entradas maliciosas, XSS, logs e Portal suspenso.
// Uso: node auditoria.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,600))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const dia=n=>{const d=new Date();d.setDate(d.getDate()+n);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
(async()=>{
 const senha={'NAT-3301':'Nat26ab','ANT-3302':'Ant26ab','MON-3303':'Mon26ab'};const H={};
 for(const c of Object.keys(senha)){let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});const ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:senha[c]})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:senha[c]})});H[c]={...J,Cookie:cookie(r)}}
 const G=H['NAT-3301'],E=H['ANT-3302'],M=H['MON-3303'];
 const req=async(m,u,b,h=G,raw)=>{const x=await fetch(B+u,{method:m,headers:h,body:raw!==undefined?raw:b?JSON.stringify(b):undefined});let j=null;const tx=await x.text();try{j=JSON.parse(tx)}catch{}return [x.status,j,tx]};
 const ROTAS_GET=['/admin/lgpd/exportar','/planejamento/painel','/escolar/painel','/datacom/painel','/solicitacoes/painel','/dashboard/resumo'];
 const ROTAS_POST=['/planejamento/salvar','/planejamento/situacao','/planejamento/mover','/planejamento/duplicar','/planejamento/arquivar','/planejamento/excluir','/planejamento/solicitar','/planejamento/vincular','/planejamento/conteudo','/escolar/salvar','/escolar/mover','/escolar/excluir','/escolar/solicitar','/datacom/salvar','/datacom/excluir','/datacom/relevancia','/datacom/categoria','/datacom/solicitar','/datacom/planejar','/solicitacoes/nova','/solicitacoes/editar','/solicitacoes/distribuir','/solicitacoes/mover','/solicitacoes/pedir-info','/admin/portal','/admin/lgpd/anonimizar'];

 // 1) autenticação: nenhuma rota nova responde sem sessão
 let semSessao=true;const falhas=[];
 for(const u of ROTAS_GET){const [s]=await req('GET',u,null,{...J});if(s!==401){semSessao=false;falhas.push(u+':'+s)}}
 for(const u of ROTAS_POST){const [s]=await req('POST',u,{id:'x'},{...J});if(s!==401){semSessao=false;falhas.push(u+':'+s)}}
 t('todas as rotas novas (GET e POST) exigem login (401)',semSessao,falhas);
 // 2) CSRF: com sessão válida, mas sem o cabeçalho de proteção, nenhuma escrita passa
 const semCsrf=[];for(const u of ROTAS_POST){const [s]=await req('POST',u,{id:'x'},{'Content-Type':'application/json',Cookie:G.Cookie});if(s!==403)semCsrf.push(u+':'+s)}
 t('toda escrita sem o cabeçalho anti-CSRF é recusada (403)',semCsrf.length===0,semCsrf);
 // 3) autorização por perfil
 const so=(n,rs,h)=>rs.map(([m,u,b])=>req(m,u,b,h));
 const restritasEquipe=[['POST','/admin/portal',{ativo:true,confirmar:'REATIVAR'}],['GET','/admin/portal'],['POST','/solicitacoes/distribuir',{id:'SOL-1',responsavel:'Antônio Filho'}],['GET','/portal/users'],['POST','/backup',{}],['GET','/admin/audit']];
 const rs=await Promise.all(so('',restritasEquipe,E));t('a equipe é barrada nas ações da Gerência/Administração (403)',rs.every(([s])=>s===403),rs.map(([s],i)=>restritasEquipe[i][1]+':'+s));
 const [,aud]=await req('GET','/admin/audit');t('a Gerência vê o registro de operações',Array.isArray(aud)&&aud.length>0);
 // 4) entradas maliciosas ou absurdas nunca viram erro 500 nem vazam detalhes
 const sujas=[];
 const injecao=["x' OR '1'='1","1; DROP TABLE records;--",'../../etc/passwd','${7*7}','<script>alert(1)</script>','\u0000\u0001'];
 for(const v of injecao){
  for(const [u,b] of [['/planejamento/situacao',{id:v,situacao:'EXECUCAO'}],['/planejamento/excluir',{id:v}],['/escolar/mover',{id:v,data:dia(2)}],['/datacom/relevancia',{id:v,relevante:'SIM'}],['/datacom/excluir',{id:v}],['/solicitacoes/mover',{id:v,etapa:'PENDENTE'}],['/planejamento/salvar',{titulo:v,dataInicio:dia(2),categoria:v,segmento:v}]]){
   const [s,j,tx]=await req('POST',u,b);if(s>=500||/stack|at \/|node_modules|mysql|ER_/i.test(tx))sujas.push(`${u} ${JSON.stringify(v).slice(0,20)} -> ${s}`)}}
 t('injeção de SQL/caminho e caracteres estranhos: sempre erro tratado (4xx), sem detalhes internos',sujas.length===0,sujas);
 let [s,j,tx]=await req('POST','/planejamento/salvar',null,G,'{isto não é json');t('JSON inválido: erro tratado (400), sem 500',s>=400&&s<500,[s,tx.slice(0,100)]);
 [s]=await req('POST','/planejamento/salvar',null,G,'x'.repeat(2_100_000));t('corpo gigante é recusado (413)',s===413,s);
 [s,j]=await req('POST','/planejamento/salvar',{titulo:'x'.repeat(5000),dataInicio:dia(1)});t('campo gigante é recusado (400)',s===400);
 [s,j]=await req('POST','/datacom/salvar',{nome:'Data com SQL \'; DROP TABLE users;--',categoria:'CULTURAL',regra:{tipo:'fixa',dia:'3',mes:'3'},repeteAnual:'SIM',relevante:'SIM'});t('aspas e ponto-e-vírgula no texto são só texto (gravados e devolvidos como estão)',s===201&&j.titulo.includes("DROP TABLE users;--")&&(await req('GET','/datacom/painel'))[0]===200);
 [s,j]=await req('GET','/auth/me');t('as tabelas continuam intactas após as tentativas de injeção',s===200&&j.user&&j.user.code==='NAT-3301');
 // 5) Portal continua suspenso
 [s,j]=await req('POST','/portal/login',{codigo:'INF-2601',senha:pw('INF-2601')},{...J});t('o Portal das Coordenações continua suspenso (503)',s===503&&j&&j.portalIndisponivel===true,[s,j]);
 const pag=await fetch(BASE+'/solicitante.html');t('a página do Portal continua indisponível (503)',pag.status===503,pag.status);
 // 6) registros de operações importantes
 const [,ev]=await req('POST','/escolar/salvar',{titulo:'Evento de auditoria',dataInicio:dia(9),segmentos:['TODOS'],tipoEvento:'EVENTO'});
 await req('POST','/escolar/mover',{id:ev.id,data:dia(10)});await req('POST','/escolar/excluir',{id:ev.id});
 const [,pj]=await req('POST','/planejamento/salvar',{titulo:'Ação de auditoria',categoria:'PROJETOS',segmento:'Geral',dataInicio:dia(3)});
 await req('POST','/planejamento/arquivar',{id:pj.id});await req('POST','/planejamento/excluir',{id:pj.id});
 const [,log]=await req('GET','/admin/audit?limite=200');const acoes=(log||[]).map(x=>`${x.acao}:${x.modulo}`);
 t('criar, reagendar, arquivar e excluir ficam no registro de operações (com quem e quando)',['criar:calescolar','reagendar:calescolar','lixeira:calescolar','criar:projetos','arquivar:projetos','lixeira:projetos'].every(a=>acoes.includes(a))&&log.every(x=>x.ator&&x.quando),acoes.slice(0,12));
 // 7) XSS: textos com HTML em todos os módulos novos são exibidos como texto
 const carga='"><img src=x onerror="window.__xss=1"><b>';
 await req('POST','/planejamento/salvar',{titulo:'P '+carga,objetivo:carga,categoria:'CAMPANHAS',segmento:'Geral',dataInicio:dia(2),dataFim:dia(4),observacoes:carga});
 await req('POST','/escolar/salvar',{titulo:'E '+carga,dataInicio:dia(2),segmentos:['TODOS'],tipoEvento:'EVENTO',local:carga,descricao:carga});
 await req('POST','/datacom/salvar',{nome:'D '+carga,categoria:'CULTURAL',regra:{tipo:'fixa',dia:String(new Date(dia(2)+'T12:00:00').getDate()),mes:String(new Date(dia(2)+'T12:00:00').getMonth()+1)},repeteAnual:'SIM',relevante:'SIM',descricao:carga});
 await req('POST','/solicitacoes/nova',{titulo:'S '+carga,descricao:carga,prazo:dia(2)});
 await req('POST','/data?module=calendario',{titulo:'C '+carga,inicioEm:dia(2)+'T10:00',tipoItem:'Reunião',status:'PLANEJADO'});
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const pg=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));let dialogos=0;pg.on('dialog',d=>{dialogos++;d.accept()});
 await pg.goto(BASE+'/');await pg.fill('#internalCode','NAT-3301');await pg.fill('#internalPass',senha['NAT-3301']);await pg.click('#internalLoginBtn');await pg.waitForSelector('#nav .navitem');await pg.waitForTimeout(1000);
 const abrir=async(pagina,sel)=>{await pg.evaluate(x=>go(x),pagina);await pg.waitForSelector(sel);await pg.waitForFunction(()=>!document.querySelector('#cmRaiz .loading, #content .loading'),null,{timeout:15000}).catch(()=>{});await pg.waitForTimeout(500)};
 await abrir('planejamento','.pl-faixa');await pg.click('.cm-item:has-text("P ")').catch(()=>{});await pg.waitForTimeout(400);
 await pg.evaluate(()=>document.querySelectorAll('.admin-overlay').forEach(e=>e.remove()));
 await abrir('calendario','.cm-semana, .cm-mes, .cm-proximos');await pg.click('[data-modo="list"]');await pg.waitForSelector('.cm-proximos');
 for(const pre of ['E ','D ','C ','P ']){await pg.click(`.cm-item:has-text("${pre}")`).catch(()=>{});await pg.waitForTimeout(400);await pg.evaluate(()=>document.querySelectorAll('.admin-overlay').forEach(e=>e.remove()))}
 await abrir('solicitacoes','.sl-board');await pg.click('[data-sl-abrir]').catch(()=>{});await pg.waitForTimeout(400);
 await abrir('hoje','.db-stats');
 t('HTML dentro dos textos nunca executa (Planejamento, Escolar, Datas, Marketing, Solicitações e Dashboard)',(await pg.evaluate(()=>window.__xss))===undefined&&dialogos===0&&errs.length===0,[dialogos,errs]);
 t('e aparece como texto, não como elemento',(await pg.$$eval('img[src="x"]',e=>e.length))===0);
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
