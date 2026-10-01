// Teste de interface (Chromium/Playwright). Uso: node ui.test.js <install.out>   (BASE=http://127.0.0.1:8080)
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n)};
(async()=>{
 const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});const p=await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/401|403|409/.test(m.text()))errs.push(m.text())});
 const prompts=['SenhaForte2026x'];p.on('dialog',d=>d.accept(prompts.length?prompts.shift():''));
 await p.goto(BASE+'/');
 await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass','errada');await p.click('#internalLoginBtn');await p.waitForTimeout(400);
 t('senha errada recusada',/inválidos/.test(await p.$eval('#internalLoginError',e=>e.innerText)));
 await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem',{timeout:5000});t('login + troca obrigatória de senha',true);
 const pages=await p.$$eval('#nav .navitem',e=>e.map(x=>x.dataset.page));t('menu inclui Administração',pages.includes('administracao'));
 let broken=[];for(const pg of pages){errs.length=0;await p.evaluate(x=>go(x),pg);await p.waitForTimeout(250);const bad2=await p.$eval('#content',e=>/Não foi possível carregar/.test(e.innerText));if(errs.length||bad2)broken.push(pg+':'+errs.join('|'))}
 t(`${pages.length} telas abrem sem erro`,broken.length===0);if(broken.length)console.log(broken);
 // Tráfego: importação CSV
 const csv='Nome da campanha;Início dos relatórios;Valor usado (BRL);Impressões;Alcance;Cliques no link (todos);Conversas iniciadas;Leads\nMatrículas 2027;2026-09-01;"1.500,50";90000;60000;1800;160;45\nVeterano;2026-09-01;800;40000;30000;700;50;12\n';
 fs.writeFileSync('/tmp/evo-import.csv',csv);
 await p.evaluate(()=>go('trafego'));await p.waitForSelector('#importCsvBtn');
 const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('#importCsvBtn')]);await fc.setFiles('/tmp/evo-import.csv');
 await p.waitForSelector('#csvGo');t('prévia do CSV reconhece 2 linhas',/2<\/b> registro|2 registro/.test(await p.$eval('.admin-box',e=>e.innerHTML)));
 await p.click('#csvGo');await p.waitForTimeout(900);
 const rows=await p.evaluate(async()=>(await api('/data?module=trafego')).rows);
 t('CSV gravou 2 registros com valor pt-BR',rows.length===2&&Math.abs(Number(rows[0].investimento.replace('.','').replace(',','.'))-1500.5)<0.01);
 t('KPIs de Tráfego atualizados',/R\$\s?2\.300,50/.test(await p.$eval('.traffic-hero',e=>e.innerText)));
 await p.evaluate(()=>go('trafego'));await p.click('#importCsvBtn',{noWaitAfter:true}).catch(()=>{});
 const [fc2]=await Promise.all([p.waitForEvent('filechooser'),p.click('#importCsvBtn').catch(()=>{})]).catch(()=>[null]);
 if(fc2){await fc2.setFiles('/tmp/evo-import.csv');await p.waitForSelector('#csvGo');t('reimportar ignora duplicados',/ignorado/.test(await p.$eval('.admin-box',e=>e.innerText)));await p.click('[data-close]')}
 // Administração
 await p.evaluate(()=>go('administracao'));await p.waitForSelector('[data-reset]');
 t('Acessos lista 10 usuários',(await p.$$('[data-reset]')).length===10);
 await p.click('[data-reset="portal|INF-2601"]');await p.waitForSelector('.temp-pass');t('reset mostra senha temporária de 12 caracteres',(await p.$eval('.temp-pass',e=>e.innerText.trim())).length===12);await p.click('[data-close]');
 await p.click('[data-tab=avisos]');await p.waitForSelector('#noticeForm');await p.fill('#noticeForm [name=titulo]','Reunião de pais');await p.fill('#noticeForm [name=mensagem]','Sábado 9h');await p.click('#noticeForm button');await p.waitForSelector('.notice-row');t('aviso publicado e listado',true);
 await p.click('[data-tab=auditoria]');await p.waitForSelector('.datatable tbody tr');t('auditoria exibe eventos',(await p.$$('.datatable tbody tr')).length>3);
 await p.click('[data-tab=backups]');await p.waitForSelector('#bkNow');await p.click('#bkNow');await p.waitForSelector('a[href*="backup/download"]');
 const [dl]=await Promise.all([p.waitForEvent('download'),p.click('a[href*="backup/download"]')]);t('baixa backup .json.gz',/evo_backup_.*\.json\.gz$/.test(dl.suggestedFilename()));
 // equipe não vê Administração
 const q=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();q.on('dialog',d=>d.accept('EquipeForte2026x'));
 await q.goto(BASE+'/');await q.fill('#internalCode','ANT-3302');await q.fill('#internalPass',pw('ANT-3302'));await q.click('#internalLoginBtn');await q.waitForSelector('#nav .navitem');
 const tp=await q.$$eval('#nav .navitem',e=>e.map(x=>x.dataset.page));t('Equipe não vê Administração/Saúde/Manutenção',!tp.includes('administracao')&&!tp.includes('manutencao')&&!tp.includes('saude'));
 await q.evaluate(()=>go('administracao'));await q.waitForTimeout(400);t('Equipe forçando URL volta à Minha Área',(await q.evaluate(()=>state.page))==='minhaarea');
 // sessão
 await p.reload();await p.waitForSelector('#nav .navitem');t('recarregar mantém sessão',true);
 await p.click('#internalLogout');await p.waitForSelector('#internalLogin',{timeout:5000});t('logout',true);
 // portal
 const po=await (await b.newContext({viewport:{width:1280,height:800}})).newPage();po.on('dialog',d=>d.accept('PortalForte2026x'));
 await po.goto(BASE+'/solicitante.html');await po.fill('#code','FIN-2603');await po.fill('#pass',pw('FIN-2603'));await po.click('#login');await po.waitForSelector('.portal-shell',{timeout:5000});t('Portal: login',true);
 t('Portal mostra aviso publicado',/Reunião de pais/.test(await po.$eval('#panel',e=>e.innerText)));
 console.log(`\n${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0)})();
