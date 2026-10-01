// Acesso só por código: ativação na Administração, login interno e do Portal. Uso: node ui4.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n)};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1440,height:1000}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 p.on('dialog',d=>d.accept(d.type()==='prompt'?'SenhaForte2026x':undefined));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem');
 await p.evaluate(()=>{adminTab='acessos';go('administracao')});await p.waitForSelector('#modeBtn');
 t('botão para ativar acesso só por código aparece',/código/i.test(await p.$eval('#modeBtn',e=>e.innerText)));
 await p.click('#modeBtn');await p.waitForSelector('.admin-overlay .temp-pass');
 const codes=await p.$$eval('.admin-overlay .temp-pass',a=>a.map(e=>e.innerText.trim()));
 t('códigos gerados no formato 2 letras + 4 números',codes.length>=10&&codes.every(c=>/^[A-HJ-NP-Z]{2}[0-9]{4}$/.test(c)));
 const rows=await p.$$eval('.admin-overlay tbody tr',a=>a.map(r=>[...r.cells].map(c=>c.innerText.trim())));
 const code=k=>rows.find(r=>r[1]===k)[2];
 // login interno sem senha
 const p2=await (await b.newContext()).newPage();p2.on('pageerror',e=>errs.push(e.message));
 await p2.goto(BASE+'/');await p2.waitForSelector('#internalCode');await p2.waitForTimeout(400);
 t('tela interna esconde o campo de senha',!(await p2.isVisible('#internalPass')));
 const other=rows.find(r=>r[1]!=='NAT-3301'&&!r[1].match(/^[A-Z]{3}-26/));
 await p2.fill('#internalCode',other[2]);await p2.click('#internalLoginBtn');await p2.waitForSelector('#nav .navitem',{timeout:8000});
 t('login interno só com código funciona',true);
 // código inválido
 const p3=await (await b.newContext()).newPage();await p3.goto(BASE+'/');await p3.waitForTimeout(400);await p3.fill('#internalCode','ZZ9999');await p3.click('#internalLoginBtn');await p3.waitForSelector('.login-error');
 t('código inválido mostra erro',true);
 // portal
 const portal=rows.find(r=>/^[A-Z]{3}-26/.test(r[1]));
 const p4=await (await b.newContext()).newPage();p4.on('pageerror',e=>errs.push(e.message));await p4.goto(BASE+'/solicitante.html');await p4.waitForSelector('#code');await p4.waitForTimeout(400);
 t('portal esconde a senha',!(await p4.isVisible('#pass')));
 await p4.fill('#code',portal[2]);await p4.click('#login');await p4.waitForSelector('.topbar, nav, #newBtn, h2',{timeout:8000});
 t('login do Portal só com código funciona',!(await p4.isVisible('#code')));
 t('sem erros de JS',errs.length===0);if(errs.length)console.log(errs);
 await b.close();console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
