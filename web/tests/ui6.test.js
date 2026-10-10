// Administração → Acessos: criar e excluir fichas (equipe e Portal). Uso: node ui6.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,300))};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));const dl=[];p.on('dialog',d=>dl.push(d.message()));p.on('dialog',d=>d.accept('Senha26x'));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');
 await p.evaluate(()=>{adminTab='acessos';go('administracao')});await p.waitForSelector('#newFicha');
 // nova ficha da equipe
 await p.click('#newFicha');await p.fill('#fichaForm [name=nome]','Joana Ávila');await p.click('#fichaForm button[type=submit]');await p.waitForSelector('.admin-overlay .temp-pass');
 const txt=await p.$eval('.admin-overlay',e=>e.innerText);const senha=(await p.$eval('.admin-overlay .temp-pass',e=>e.innerText)).trim();
 t('criou ficha JOA-3306 da equipe com senha temporária de 8 caracteres',/JOA-3306/.test(txt)&&senha.length===8,txt);
 await p.click('.admin-overlay [data-close]');await p.waitForTimeout(600);
 t('ficha nova aparece na tabela',/JOA-3306[\s\S]*Joana Ávila/.test(await p.$eval('#adminBody',e=>e.innerText)));
 // login da nova pessoa
 const q=await (await b.newContext()).newPage();q.on('dialog',d=>d.accept('Nova2026'));await q.goto(BASE+'/');await q.fill('#internalCode','JOA-3306');await q.fill('#internalPass',senha);await q.click('#internalLoginBtn');await q.waitForSelector('#nav .navitem');
 t('a nova pessoa consegue entrar',true);
 // nova ficha do Portal
 await p.click('#newFicha');await p.selectOption('#fichaForm [name=tipo]','portal');await p.fill('#fichaForm [name=nome]','Coordenação Teste');await p.fill('#fichaForm [name=segmentos]','Infantil, Anos Finais');await p.click('#fichaForm button[type=submit]');await p.waitForSelector('.admin-overlay .temp-pass');
 t('criou ficha do Portal (COO-2606)',/COO-2606/.test(await p.$eval('.admin-overlay',e=>e.innerText)));await p.click('.admin-overlay [data-close]');await p.waitForTimeout(600);
 // excluir
 await p.click('[data-del="interno|JOA-3306"]');await p.waitForTimeout(900);
 t('ficha excluída some da tabela',!/JOA-3306/.test(await p.$eval('#adminBody',e=>e.innerText)));
 const r=await p.evaluate(async()=>fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-EVO':'1'},body:JSON.stringify({codigo:'JOA-3306',senha:'Nova2026'})}).then(x=>x.status));
 t('quem foi excluída não entra mais (401)',r===401,r);
 // proteções
 const own=await p.evaluate(async()=>fetch('/api/admin/users/delete',{method:'POST',headers:{'Content-Type':'application/json','X-EVO':'1'},body:JSON.stringify({tipo:'interno',codigo:'NAT-3301'})}).then(async x=>[x.status,(await x.json()).error]));
 t('não permite excluir a própria ficha',own[0]===400,own);
 // dois gerentes: Antônio Filho vira Gerente
 await p.click('[data-role="ANT-3302|manager"]');await p.waitForTimeout(900);
 const A=await (await b.newContext()).newPage();A.on('dialog',d=>d.accept('Ant26x'));await A.goto(BASE+'/');await A.fill('#internalCode','ANT-3302');await A.fill('#internalPass',pw('ANT-3302'));await A.click('#internalLoginBtn');await A.waitForSelector('#nav .navitem');
 t('Antônio Filho agora é Gerente e vê a Administração',(await A.$$eval('#nav .navitem',e=>e.map(x=>x.dataset.page))).includes('administracao'));
 t('a tabela mostra os dois gerentes',((await p.$eval('#adminBody',e=>e.innerText)).match(/Gerente de Marketing/g)||[]).length>=2);
 await p.click('[data-role="ANT-3302|team"]');await p.waitForTimeout(900);
 await p.evaluate(()=>{adminTab='acessos';go('administracao')});await p.waitForTimeout(500);
 const last=await p.evaluate(async()=>fetch('/api/admin/users/role',{method:'POST',headers:{'Content-Type':'application/json','X-EVO':'1'},body:JSON.stringify({codigo:'NAT-3301',perfil:'team'})}).then(async x=>[x.status,(await x.json()).error]));
 t('não deixa o sistema sem Gerente',last[0]===400,last);
 // escolher o código pela tela (✎)
 await p.click('#modeBtn');await p.waitForSelector('.admin-overlay .temp-pass');await p.click('.admin-overlay [data-close]');await p.waitForSelector('[data-setcode]');
 p.removeAllListeners('dialog');p.on('dialog',d=>d.accept(/administração/i.test(d.message())?'Senha26x':'MARIA7'));
 await p.click('[data-setcode^="interno|EDU-3305"]');await p.waitForTimeout(900);
 t('✎ permite escolher o código e a tabela mostra o novo',(await p.$$eval('[data-acesso]',a=>a.map(e=>e.innerText.trim()))).includes('MARIA7'));
 t('o sistema não pediu senha de administração em nenhuma ação (só "Tem certeza?")',!dl.some(m=>/senha de administração|Confirme sua senha/i.test(m)),dl);
 t('sem erros de JS',errs.length===0,errs.join('|'));
 await b.close();console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
