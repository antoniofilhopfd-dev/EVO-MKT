// Administração: contas de Instagram acompanhadas (marcar, salvar, ocultar) e seletor do topo. Uso: node contasui.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const PR=process.env.PRINTS||'/tmp/evo-prints';
fs.mkdirSync(PR,{recursive:true});
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,400))};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1366,height:1000}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 let logado=false;p.on('dialog',d=>d.accept(d.type()==='prompt'?(logado?'x':'Senha26x'):undefined));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');logado=true;
 const api=(m,u,body)=>p.evaluate(async([m,u,body])=>{try{return await api(u,{method:m,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})}catch(e){return {erro:e.message}}},[m,u,body]);
 const IG2='17841499999999999';
 await api('POST','/integrations/meta/token',{token:'DUAL_TOKEN'});
 const st0=await api('GET','/integrations/status');const IG1=st0.instagram.igUserId;
 await api('POST','/integrations/meta/account',{ig_user_id:IG2});
 await p.evaluate(()=>{adminTab='integracoes';go('administracao')});await p.waitForSelector('[data-igmon]',{timeout:20000});
 const marcadas=async()=>p.$$eval('[data-igmon]',els=>els.filter(e=>e.checked).map(e=>e.dataset.igmon));
 t('com a conta em uso na segunda, só ela vem marcada',(await marcadas()).join()===IG2,await marcadas());
 await p.check(`[data-igmon="${IG1}"]`);await p.waitForTimeout(1200);
 t('marcar já mostra na tela quem está sendo acompanhado (salva sozinho)',/@evolucaopb/.test(await p.$eval('#igMonStatus',e=>e.textContent))&&/@outraconta/.test(await p.$eval('#igMonStatus',e=>e.textContent)),await p.$eval('#igMonStatus',e=>e.textContent));
 await p.evaluate(()=>{adminTab='integracoes';go('administracao')});await p.waitForSelector('[data-igmon]');await p.waitForTimeout(800);
 const dep=await marcadas();
 t('marcar a primeira e salvar mantém as duas marcadas depois de recarregar a tela',dep.length===2&&dep.includes(IG1)&&dep.includes(IG2),dep);
 await p.evaluate(()=>go('studio'));await p.waitForSelector('[data-igconta]',{timeout:20000});
 const opcoes=await p.$$eval('[data-igconta] option',o=>o.map(x=>x.textContent));
 t('o seletor do topo lista as duas contas e o atalho de gerenciar',opcoes.filter(x=>/^@/.test(x)).length===2&&opcoes.some(x=>/gerenciar/i.test(x)),opcoes);
 t('sem erros de JavaScript',errs.length===0,errs.join(' | '));
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
