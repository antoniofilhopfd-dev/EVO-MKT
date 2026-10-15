// Assistente de nova campanha na interface. Uso: node campanhaui.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const PR=process.env.PRINTS||'/tmp/evo-prints';
fs.mkdirSync(PR,{recursive:true});
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,500))};
const JPG=Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1366,height:1000}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 let logado=false;p.on('dialog',d=>d.accept(d.type()==='prompt'?(logado?'x':'Senha26x'):undefined));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');logado=true;
 const api=(m,u,body)=>p.evaluate(async([m,u,body])=>{try{return await api(u,{method:m,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})}catch(e){return {erro:e.message}}},[m,u,body]);
 const mock=async q=>(await fetch('http://127.0.0.1:8099'+q)).json();
 const novos=async tipo=>Object.entries((await mock('/__state')).ads_novos||{}).filter(([,v])=>v.tipo===tipo).map(([,v])=>v.params);
 await api('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});await api('POST','/integrations/instagram/sync',{});await api('GET','/integrations/ads/accounts');await api('POST','/integrations/ads/account',{conta:'111222333'});await api('POST','/integrations/ads/sync',{});
 await api('POST','/ads/gestao/config',{ativa:true,cidade:'João Pessoa'});
 const post=(await api('POST','/data?module=conteudos',{titulo:'Arte da matrícula',legenda:'Matrículas abertas',status:'APROVADO',formato:'Feed'})).id;
 await p.evaluate(async([i,b64])=>{const f=new FormData();f.append('files',new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'arte.jpg',{type:'image/jpeg'}));await fetch('/api/integrations/instagram/media?id='+i,{method:'POST',credentials:'same-origin',headers:{'X-EVO':'1'},body:f})},[post,JPG.toString('base64')]);
 const toast=async()=>await p.$eval('#toast',e=>e.innerText).catch(()=>'');
 await p.evaluate(()=>go('gerenciador'));await p.waitForSelector('#gmNova',{timeout:20000});
 // ---- tráfego com imagem nova
 await p.click('#gmNova');await p.waitForSelector('#wz .wz-obj',{timeout:20000});
 t('o assistente mostra os 6 objetivos da Meta',(await p.$$('#wz .wz-obj')).length===6&&/Reconhecimento/.test(await p.$eval('#wz',e=>e.innerText))&&/Promoção do app/.test(await p.$eval('#wz',e=>e.innerText)));
 await p.screenshot({path:PR+'/36_nova_campanha_objetivo.png'});
 await p.click('#wzProx');t('sem escolher o objetivo não avança',(await p.$eval('.wz-passos .ativo',e=>e.innerText)).startsWith('1.'));
 await p.click('[data-obj="TRAFFIC"]');await p.waitForSelector('input[name="meta"]');
 await p.click('#wzProx');t('sem escolher o resultado não avança',(await p.$eval('.wz-passos .ativo',e=>e.innerText)).startsWith('1.'));
 await p.check('input[name="meta"][value="LINK_CLICKS"]');await p.fill('[data-w="nome"]','Matrículas via site');await p.click('#wzProx');
 await p.waitForSelector('[data-w="publico.raioKm"]');t('passo 2 já traz o público padrão do Gestor (cidade e idade)',(await p.$eval('#wz',e=>e.innerText)).includes('25')||(await p.$eval('[data-w="publico.idadeMin"]',e=>e.value))==='25');
 await p.fill('[data-w="publico.raioKm"]','15');await p.selectOption('[data-w="publico.genero"]','mulheres');
 await p.fill('#wzInt','educ');await p.waitForSelector('[data-addint]',{timeout:10000});await p.click('[data-addint]');await p.waitForSelector('.wz-chips .st-chip');
 t('interesse pesquisado na Meta entra como etiqueta',/Educação infantil/.test(await p.$eval('#wz',e=>e.innerText)));
 await p.click('#wzProx');await p.waitForSelector('[data-w="orc.valor"]');await p.fill('[data-w="orc.valor"]','30');await p.fill('[data-w="dias"]','5');
 await p.selectOption('[data-w="lance.tipo"]','LIMITE_CUSTO');await p.waitForSelector('[data-w="lance.valor"]');await p.fill('[data-w="lance.valor"]','9');await p.click('#wzProx');
 await p.waitForSelector('[data-w="destino.siteUrl"]');
 await p.click('#wzProx');t('passo 4: sem imagem não avança',/Escolha a imagem/.test(await toast()));
 await p.fill('[data-w="destino.siteUrl"]','https://matricula.exemplo.com.br');await p.selectOption('[data-w="criativo.conteudoId"]',post);await p.fill('[data-w="criativo.texto"]','Garanta a vaga');await p.click('#wzProx');
 await p.waitForSelector('#wzPrev .gi-lista',{timeout:20000});
 const rv=await p.$eval('#wzPrev',e=>e.innerText);
 t('revisão: objetivo, público, interesses, lance, total (R$ 30 × 5 = R$ 150) e teto do mês',/Tráfego · Cliques no link/.test(rv)&&/15 km/.test(rv)&&/mulheres/.test(rv)&&/Educação infantil/.test(rv)&&/limite de custo 9/.test(rv)&&/R\$\s*150,00/.test(rv)&&/teto mensal/.test(rv),rv);
 t('antes de confirmar o botão Lançar fica desativado',await p.$eval('#wzLanca',e=>e.disabled));
 await p.check('#wzOk');t('confirmado e válido: libera Lançar',!(await p.$eval('#wzLanca',e=>e.disabled)));
 await p.screenshot({path:PR+'/37_nova_campanha_revisao.png'});
 await p.click('#wzLanca');await p.waitForSelector('#wz',{state:'detached',timeout:25000});
 const C=(await novos('campanha')).pop(),S=(await novos('conjunto')).pop(),K=(await novos('criativo')).pop();const tg=JSON.parse(S.targeting);
 t('lançou ATIVA: objetivo de tráfego, meta LINK_CLICKS, R$ 30/dia, COST_CAP 9, público, interesse e link da imagem',C.status==='ACTIVE'&&C.objective==='OUTCOME_TRAFFIC'&&S.optimization_goal==='LINK_CLICKS'&&S.daily_budget==='3000'&&S.bid_strategy==='COST_CAP'&&S.bid_amount==='900'&&tg.genders.join()==='2'&&tg.geo_locations.cities[0].radius===15&&tg.flexible_spec[0].interests[0].name==='Educação infantil'&&JSON.parse(K.object_story_spec).link_data.link==='https://matricula.exemplo.com.br',JSON.stringify([C,S]));
 t('lançamento registrado como CAMPANHA com o nome escolhido',(await api('GET','/ads/gestao')).lancamentos.some(l=>l.tipo==='CAMPANHA'&&/Matrículas via site/.test(l.titulo)));
 // ---- reconhecimento com publicação
 await p.evaluate(()=>go('gerenciador'));await p.waitForSelector('#gmNova');await p.click('#gmNova');await p.waitForSelector('#wz .wz-obj');
 await p.click('[data-obj="AWARENESS"]');await p.check('input[name="meta"][value="REACH"]');await p.click('#wzProx');await p.waitForSelector('[data-w="publico.raioKm"]');await p.click('#wzProx');
 await p.waitForSelector('[data-w="orc.valor"]');await p.fill('[data-w="dias"]','4');await p.click('#wzProx');await p.waitForSelector('[data-post="m2"]');
 await p.click('#wzProx');t('passo 4: sem escolher a publicação não avança',/Escolha a publicação/.test(await toast()));
 await p.click('[data-post="m2"]');await p.click('#wzProx');await p.waitForSelector('#wzPrev .gi-lista');await p.check('#wzOk');await p.click('#wzLanca');await p.waitForSelector('#wz',{state:'detached',timeout:25000});
 const C2=(await novos('campanha')).pop(),K2=(await novos('criativo')).pop();
 t('reconhecimento/alcance com publicação existente: ATIVA e criativo da publicação',C2.objective==='OUTCOME_AWARENESS'&&C2.status==='ACTIVE'&&K2.source_instagram_media_id==='m2',[C2,K2]);
 // ---- erro visível na revisão
 await p.evaluate(()=>go('gerenciador'));await p.waitForSelector('#gmNova');await p.click('#gmNova');await p.waitForSelector('#wz .wz-obj');
 await p.click('[data-obj="SALES"]');await p.click('#wzProx');await p.waitForSelector('[data-w="publico.raioKm"]');await p.click('#wzProx');await p.waitForSelector('[data-w="orc.valor"]');await p.fill('[data-w="dias"]','3');await p.click('#wzProx');
 await p.waitForSelector('[data-w="destino.pixelId"]');await p.selectOption('[data-w="criativo.conteudoId"]',post);await p.fill('[data-w="criativo.texto"]','Matricule-se');await p.click('#wzProx');await p.waitForSelector('#wzPrev .gi-lista');
 const ev=await p.$eval('#wzPrev',e=>e.innerText);await p.check('#wzOk');
 t('vendas sem site, pixel e evento: a revisão mostra os erros e o botão continua bloqueado',/site de destino/.test(ev)&&/pixel/i.test(ev)&&/evento/i.test(ev)&&await p.$eval('#wzLanca',e=>e.disabled),ev);
 // celular
 await p.setViewportSize({width:390,height:844});
 t('no celular o assistente cabe na tela',await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1&&document.querySelector('.admin-box').scrollWidth<=window.innerWidth));
 t('sem erros de JS',errs.length===0,errs.join('|'));
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error('ERRO',e.message.slice(0,400));process.exit(1)});
