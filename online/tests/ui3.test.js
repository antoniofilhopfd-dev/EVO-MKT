// Tela Administração → Integrações (Instagram e Google) com os servidores simulados. Uso: node ui3.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const MOCK='http://127.0.0.1:8099';
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n)};
const tx=(n,txt,re)=>{const c=re.test(txt);t(n,c);if(!c)console.log('     texto visto:',JSON.stringify(String(txt).slice(0,300)))};
(async()=>{
 await fetch(MOCK+'/__reset',{method:'POST',body:'{}'});
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept('SenhaForte2026x'));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem');
 const A=(path,opt)=>p.evaluate(([a,o])=>api(a,o),[path,opt||{}]);
 const rows=async m=>(await A('/data?module='+m)).rows;
 await p.evaluate(()=>{adminTab='integracoes';go('administracao')});await p.waitForSelector('#metaForm');
 tx('aba Integrações mostra Instagram e Google não conectados',await p.$eval('#adminBody',e=>e.innerText),/Instagram[\s\S]*Não conectado[\s\S]*GOOGLE[\s\S]*Não conectado/i);
 tx('mostra os endereços de redirecionamento para cadastrar',await p.$eval('#adminBody',e=>e.innerText),/api\/integrations\/meta\/callback[\s\S]*api\/integrations\/google\/callback/);
 await p.fill('#metaForm [name=meta_app_id]','APPID');await p.fill('#metaForm [name=meta_app_secret]','META_SECRET');await p.click('#metaForm button[type=submit]');await p.waitForSelector('a[href="/api/integrations/meta/connect"]');
 t('salvar credenciais Meta libera o botão Conectar',true);
 await p.fill('#gForm [name=g_client_id]','GID.apps.test');await p.fill('#gForm [name=g_client_secret]','G_SECRET');await p.click('#gForm button[type=submit]');await p.waitForSelector('a[href="/api/integrations/google/connect"]');
 t('salvar credenciais Google libera o botão Conectar',true);
 t('segredo não aparece no HTML da tela',!(await p.content()).includes('META_SECRET')&&!(await p.content()).includes('G_SECRET'));
 // conexão (o redirecionamento OAuth real é simulado chamando o callback com state válido)
 const connect=async(svc)=>{const r=await p.evaluate(async s=>{const x=await fetch('/api/integrations/'+s+'/connect',{redirect:'manual'});return x.type},svc);const loc=await p.evaluate(async s=>{const x=await fetch('/api/integrations/'+s+'/connect',{redirect:'follow'}).catch(e=>null);return null},svc);return r};
 const st=async(svc)=>{const u=await p.evaluate(async s=>{const r=await fetch('/api/integrations/'+s+'/connect',{redirect:'manual'});return r.status},svc);return u};
 // pega o state chamando o connect pelo lado do servidor (cookie da página) usando o proxy do Playwright
 const state=async svc=>{const r=await p.context().request.get(BASE+'/api/integrations/'+svc+'/connect',{maxRedirects:0});return new URL(r.headers()['location']).searchParams.get('state')};
 for(const svc of ['meta','google']){const s=await state(svc);const r=await p.context().request.get(BASE+'/api/integrations/'+svc+'/callback?code=GOODCODE&state='+encodeURIComponent(s),{maxRedirects:0});t('retorno OAuth '+svc+' conecta',/_ok/.test(r.headers()['location']||''))}
 await p.goto(BASE+'/?page=administracao&int=meta_ok');await p.waitForSelector('#nav .navitem');await p.waitForTimeout(1300);
 tx('voltando do OAuth abre a aba Integrações com aviso de sucesso',await p.$eval('#toast',e=>e.innerText)+await p.$eval('#adminBody',e=>e.innerText),/Instagram conectado|@evolucaopb/);
 await p.waitForSelector('#igSync');tx('Instagram aparece conectado como @evolucaopb',await p.$eval('#adminBody',e=>e.innerText),/@evolucaopb/);
 await p.click('#igSync');await p.waitForTimeout(1500);tx('sincronizar métricas atualiza a tela Instagram',(await rows('instagram')).filter(r=>r.origem==='INSTAGRAM_API').length+' periodos',/^2 periodos$/);
 await p.evaluate(()=>{invalidate('instagram');go('instagram')});await p.waitForTimeout(800);tx('tela Instagram mostra os seguidores vindos da API',await p.$eval('.social-kpis',e=>e.innerText),/4\.600/);
 // fila de publicação
 await A('/data?module=conteudos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({titulo:'Post Dia do Professor',legenda:'Parabéns, professores! 💙',status:'APROVADO',formato:'Feed',publicarInstagram:'SIM',publicacaoEm:'2099-10-15T09:00'})});
 await p.evaluate(()=>{invalidate('conteudos');adminTab='integracoes';go('administracao')});await p.waitForSelector('.ig-media');
 t('fila de publicação lista o conteúdo marcado',/Post Dia do Professor/.test(await p.$eval('#adminBody',e=>e.innerText)));
 t('“Publicar agora” começa desativado sem mídia',await p.$eval('.ig-pub',e=>e.disabled));
 fs.writeFileSync('/tmp/evo-post.jpg',Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64'));
 const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('.ig-media')]);await fc.setFiles('/tmp/evo-post.jpg');await p.waitForFunction(()=>!document.querySelector('.ig-pub')?.disabled,null,{timeout:6000});
 t('anexar mídia pela tela habilita a publicação',true);
 await p.click('.ig-pub');await p.waitForFunction(()=>/Publicado/.test(document.querySelector('#adminBody').innerText),null,{timeout:15000});
 t('publicar agora: conteúdo fica Publicado com link',await p.$eval('#adminBody a[href*="instagram.com"]',a=>!!a.href));
 // Google
 await p.waitForSelector('#gCal');
 await p.click('#gCal');await p.waitForTimeout(1500);tx('sincronizar Agenda mostra resultado',await p.$eval('#toast',e=>e.innerText),/Agenda:/);
 await p.click('#gSheet');await p.waitForTimeout(2000);tx('exportar para Planilhas gera link da planilha',await p.$eval('#adminBody',e=>e.innerHTML),/docs\.google\.com\/spreadsheets/);
 await p.check('#gAuto');await p.waitForTimeout(500);t('ligar envio automático ao Drive',(await A('/integrations/status')).google.driveAuto===true);
 await p.screenshot({path:'/home/user/EVO-MKT/dist/telas/19_integracoes.png',fullPage:true});
 t('nenhum erro de JavaScript',errs.length===0);if(errs.length)console.log(errs);
 console.log(`\n${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0)})().catch(e=>{console.log('ERRO',e.message.split('\n').slice(0,2).join(' '));process.exit(1)});
