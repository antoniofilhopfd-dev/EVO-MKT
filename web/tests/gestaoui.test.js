// Gestor de Anúncios na interface: configuração, Impulsionar com resumo e confirmação, pausar/retomar/pausar tudo. Uso: node gestaoui.test.js <install.out>
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
 await api('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});await api('POST','/integrations/instagram/sync',{});await api('GET','/integrations/ads/accounts');await api('POST','/integrations/ads/account',{conta:'111222333'});await api('POST','/integrations/ads/sync',{});
 // ---- configuração
 await p.evaluate(()=>go('trafego'));await p.waitForSelector('#gestorAds',{state:'attached',timeout:20000});
 let tx=await p.$eval('#gestorAds',e=>e.innerText);
 t('Tráfego mostra o Gestor de anúncios desligado, com aviso de que os anúncios vão ao ar ativos',/Desligado/.test(tx)&&/vão ao ar ativos/i.test(tx)&&/Teto por campanha/.test(tx),tx.slice(0,300));
 t('valores padrão do desenho aparecem (R$ 50/dia, R$ 3.000, 14 dias, 20 km, 25 a 55)',(await p.$eval('#gaTetoDia',e=>e.value))==='50'&&(await p.$eval('#gaTetoMes',e=>e.value))==='3000'&&(await p.$eval('#gaDiasMax',e=>e.value))==='14'&&(await p.$eval('#gaRaio',e=>e.value))==='20'&&(await p.$eval('#gaIdMin',e=>e.value))==='25'&&(await p.$eval('#gaIdMax',e=>e.value))==='55');
 await p.screenshot({path:PR+'/31_gestor_config.png',fullPage:true});
 await p.check('#gaAtiva');await p.fill('#gaCidade','João Pessoa');await p.click('#gaSalva');
 await p.waitForFunction(()=>/Ligado/.test(document.querySelector('#gestorAds .badge')?.innerText||''),null,{timeout:20000});
 tx=await p.$eval('#gestorAds',e=>e.textContent);t('salvar liga a gestão e mostra a cidade resolvida na Meta',/Ligado/.test(tx)&&/João Pessoa/.test(tx),tx.slice(0,400));
 // ---- impulsionar
 await p.evaluate(()=>go('igposts'));await p.waitForSelector('.ig-imp',{timeout:20000});
 t('cada publicação tem o botão Impulsionar (só Gerência)',(await p.$$('.ig-imp')).length>=3);
 await p.click('.ig-imp[data-imp="m2"]');await p.waitForSelector('#giPrev .gi-lista',{timeout:20000});
 let pv=await p.$eval('#giPrev',e=>e.innerText);
 t('o resumo mostra objetivo, público, total comprometido e teto do mês',/Conversas no Instagram Direct/.test(pv)&&/João Pessoa/.test(pv)&&/R\$\s*140,00/.test(pv)&&/teto mensal/i.test(pv),pv);
 t('antes de marcar a confirmação o botão Lançar fica desativado',await p.$eval('#giLanca',e=>e.disabled));
 await p.fill('#giOrc','80');await p.waitForFunction(()=>/teto por campanha/.test(document.querySelector('#giPrev')?.innerText||''),null,{timeout:10000});
 t('acima do teto: mostra o erro e continua bloqueado mesmo marcando a confirmação',await p.evaluate(()=>{document.querySelector('#giOk').checked=true;document.querySelector('#giOk').dispatchEvent(new Event('change'));return document.querySelector('#giLanca').disabled}));
 await p.fill('#giOrc','20');await p.waitForFunction(()=>!/teto por campanha/.test(document.querySelector('#giPrev')?.innerText||'')&&/140,00/.test(document.querySelector('#giPrev')?.innerText||''),null,{timeout:10000});
 t('mudar um valor desmarca a confirmação (precisa confirmar de novo)',!(await p.$eval('#giOk',e=>e.checked)));
 await p.check('#giOk');t('com tudo válido e confirmado o botão libera',!(await p.$eval('#giLanca',e=>e.disabled)));
 await p.screenshot({path:PR+'/32_impulsionar_resumo.png'});
 await p.click('#giLanca');await p.waitForSelector('#giLanca',{state:'detached',timeout:20000});
 let ls=(await api('GET','/ads/gestao')).lancamentos;t('lançar cria o anúncio ATIVO e registra quem lançou',ls.length===1&&ls[0].estado==='ATIVO'&&Number(ls[0].orcamento_dia)===20&&ls[0].dias===7&&!!ls[0].quem,ls);
 // ---- gestão na tela
 await p.evaluate(()=>go('trafego'));await p.waitForSelector('#gestorAds [data-ga="pausar"]',{timeout:20000});
 await p.screenshot({path:PR+'/33_gestor_lancamentos.png',fullPage:true});
 await p.click('#gestorAds [data-ga="pausar"]');await p.waitForSelector('#gestorAds [data-ga="retomar"]',{timeout:20000});
 t('Pausar na tela pausa e passa a oferecer Retomar',(await api('GET','/ads/gestao')).lancamentos[0].estado==='PAUSADO');
 await p.click('#gestorAds [data-ga="retomar"]');await p.waitForSelector('#gestorAds [data-ga="pausar"]',{timeout:20000});
 t('Retomar na tela volta a ATIVO',(await api('GET','/ads/gestao')).lancamentos[0].estado==='ATIVO');
 await p.click('#gaPausaTudo');await p.waitForSelector('#gestorAds [data-ga="retomar"]',{timeout:20000});
 t('"Pausar tudo" pausa o que o sistema lançou',(await api('GET','/ads/gestao')).lancamentos.every(l=>l.estado!=='ATIVO'));
 // celular
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>go('trafego'));await p.waitForSelector('#gestorAds',{state:'attached',timeout:20000});await p.waitForTimeout(500);
 t('no celular a tela do Gestor não rola para o lado',await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await p.evaluate(()=>go('igposts'));await p.waitForSelector('.ig-imp');await p.click('.ig-imp[data-imp="m2"]');await p.waitForSelector('#giPrev .gi-lista');
 t('no celular o diálogo de impulsionar cabe na tela',await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1&&document.querySelector('.admin-box').scrollWidth<=window.innerWidth));
 t('sem erros de JS',errs.length===0,errs.join('|'));
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error('ERRO',e.message.slice(0,300));process.exit(1)});
