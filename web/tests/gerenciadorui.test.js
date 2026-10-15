// Gerenciador de Anúncios na interface: árvore, expandir, ligar/pausar, editar, duplicar, histórico. Uso: node gerenciadorui.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const PR=process.env.PRINTS||'/tmp/evo-prints';
fs.mkdirSync(PR,{recursive:true});
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,400))};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1440,height:1000}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 let logado=false;p.on('dialog',d=>d.accept(d.type()==='prompt'?(logado?'x':'Senha26x'):undefined));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');logado=true;
 const api=(m,u,body)=>p.evaluate(async([m,u,body])=>{try{return await api(u,{method:m,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})}catch(e){return {erro:e.message}}},[m,u,body]);
 const mock=async q=>(await fetch('http://127.0.0.1:8099'+q)).json();
 const edits=async id=>((await mock('/__state')).edits||{})[id]||[];
 await api('POST','/ads/modo',{gestao:true}); // modo completo ligado para testar a criação/edição
 await api('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});await api('GET','/integrations/ads/accounts');await api('POST','/integrations/ads/account',{conta:'111222333'});await api('POST','/ads/gestao/config',{ativa:true,cidade:'João Pessoa'});
 await p.evaluate(()=>go('gerenciador'));await p.waitForSelector('.gm-tab tr.gm-campanha',{timeout:20000});
 t('Tráfego tem a seção Gerenciador entre as abas',await p.evaluate(()=>[...document.querySelectorAll('#subtabs .subtab')].map(x=>x.textContent).includes('Gerenciador')));
 t('mostra as 4 campanhas da conta, com objetivo em português e totais',(await p.$$('tr.gm-campanha')).length===4&&/Cadastros \(leads\)/.test(await p.$eval('.gm-tab',e=>e.innerText))&&/R\$\s*2\.084,56/.test(await p.$eval('.gm-tab tfoot',e=>e.innerText)));
 await p.click('[data-abre="c1"]');await p.waitForSelector('tr.gm-conjunto[data-id="s1"]');await p.click('[data-abre="s1"]');await p.waitForSelector('tr.gm-anuncio[data-id="a1"]');
 t('expandir mostra conjunto e anúncios da campanha, com foto só do anúncio https',(await p.$$('tr.gm-anuncio')).length===2&&(await p.$$('tr.gm-anuncio img.gm-foto')).length===1);
 const c1=await p.$eval('tr.gm-campanha[data-id="c1"]',e=>e.innerText);t('linha da campanha: resultados, custo por resultado, gasto, CTR',/55/.test(c1)&&/R\$\s*22,4/.test(c1)&&/R\$\s*1\.234,56/.test(c1)&&/2,33%/.test(c1),c1);
 await p.screenshot({path:PR+'/34_gerenciador.png',fullPage:true});
 // ligar/pausar pelo interruptor
 await p.evaluate(()=>{document.querySelector('[data-sw="c2"]').click()});await p.waitForFunction(()=>true);await p.waitForTimeout(1500);
 t('o interruptor pausa a campanha na Meta (com confirmação)',(await edits('c2')).some(e=>e.status==='PAUSED'),await edits('c2'));
 // editar conjunto
 await p.waitForSelector('[data-edit="s1"]',{timeout:15000});await p.click('[data-edit="s1"]');await p.waitForSelector('#geNome');
 await p.fill('#geNome','Conjunto matrículas v2');await p.fill('#geDia','40');await p.fill('#geIdMin','28');await p.fill('#geRaio','22');
 await p.screenshot({path:PR+'/35_gerenciador_editar.png'});
 await p.click('#geSalva');await p.waitForSelector('#geNome',{state:'detached',timeout:20000});
 const es=await edits('s1');const tg=JSON.parse((es.filter(e=>e.targeting).pop()||{targeting:'{}'}).targeting);
 t('editar conjunto envia só o que mudou: nome, orçamento (4000 centavos), idade mínima e raio',es.some(e=>e.name==='Conjunto matrículas v2')&&es.some(e=>e.daily_budget==='4000')&&tg.age_min===28&&tg.geo_locations.cities[0].radius===22,es);
 // acima do teto: erro e janela continua
 await p.waitForSelector('[data-edit="s1"]',{timeout:15000});await p.click('[data-edit="s1"]');await p.waitForSelector('#geDia');await p.fill('#geDia','300');await p.click('#geSalva');
 await p.waitForFunction(()=>/teto por campanha/.test(document.querySelector('#toast')?.innerText||''),null,{timeout:10000});
 t('orçamento acima do teto mostra o erro do teto (nada é enviado)',!(await edits('s1')).some(e=>e.daily_budget==='30000'));
 await p.keyboard.press('Escape');await p.evaluate(()=>document.querySelectorAll('.admin-overlay').forEach(o=>o.remove()));
 // duplicar
 await p.waitForSelector('[data-dup="c1"]',{timeout:15000});await p.click('[data-dup="c1"]');await p.waitForTimeout(1500);
 const cp=((await mock('/__state')).copias||[]).pop()||[];t('duplicar pede a cópia pausada à Meta',cp[0]==='c1'&&cp[1].status_option==='PAUSED',cp);
 // histórico
 await p.waitForSelector('#gmHist');await p.click('#gmHist');await p.waitForSelector('.admin-overlay table');
 const hx=await p.$eval('.admin-overlay',e=>e.innerText);t('histórico mostra quem alterou e o antes/depois',/Natália Mello/.test(hx)&&/Conjunto matrículas v2/.test(hx)&&/duplicar/.test(hx),hx.slice(0,300));
 await p.click('.admin-overlay [data-close]');
 // celular
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>go('gerenciador'));await p.waitForSelector('.gm-tab',{timeout:20000});
 t('no celular a página não rola para o lado (a tabela rola dentro do quadro)',await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 t('sem erros de JS',errs.length===0,errs.join('|'));
 // ---- 3 níveis: abas, drill, detalhes, comparação
 await p.evaluate(()=>go('gerenciador'));await p.waitForSelector('[data-gv="campanha"]');
 t('abas Hierarquia | Campanhas | Conjuntos | Anúncios',(await p.$$eval('[data-gv]',b=>b.map(x=>x.textContent))).join()==='Hierarquia,Campanhas,Conjuntos,Anúncios');
 t('painel de orçamento mostra os três números separados',/Planejado no EVO MKT/.test(await p.$eval('.gm-orc',e=>e.innerText))&&/Configurado na Meta/.test(await p.$eval('.gm-orc',e=>e.innerText))&&/Gasto no mês/.test(await p.$eval('.gm-orc',e=>e.innerText)));
 await p.click('[data-gv="campanha"]');await p.waitForSelector('[data-gf^="campanha:"]');
 t('visão Campanhas: código interno, ID da Meta e status da Meta em cada linha',/CAM-\d{4}/.test(await p.$eval('tr[data-id="c1"]',e=>e.innerText))&&/Meta: c1/.test(await p.$eval('tr[data-id="c1"]',e=>e.innerText)));
 await p.click('[data-gf="campanha:c1"]');await p.waitForSelector('[data-gf^="conjunto:"]');
 t('abrir a campanha leva aos conjuntos dela, com o filtro visível e sem perder o período',(await p.$$('[data-gf^="conjunto:"]')).length===1&&/Filtrado em/.test(await p.$eval('.gm-crumb',e=>e.innerText)));
 await p.click('[data-gf="conjunto:s1"]');await p.waitForSelector('[data-gsel="a1"]');
 t('abrir o conjunto leva aos anúncios dele',(await p.$$('[data-gsel]')).length===2);
 await p.click('tr[data-id="a1"] [data-det]');await p.waitForSelector('.gm-det');
 const det=await p.$eval('.admin-box',e=>e.innerText);
 t('detalhes do anúncio: criativo, botão, link, códigos e métricas completas',/AN-\d{4}/.test(det)&&/Matrículas abertas/.test(det)&&/LEARN_MORE/.test(det)&&/evolucao\.test\/matriculas/.test(det)&&/CPM/.test(det)&&/Frequência/.test(det),det.slice(0,300));
 await p.click('[data-close]');
 await p.check('[data-gsel="a1"]');await p.check('[data-gsel="a2"]');await p.click('#gmCompSel');await p.waitForSelector('.gm-best,.gm-worst,.datatable th');
 t('comparar selecionados mostra as métricas lado a lado',/Custo por conversa/.test(await p.$eval('.admin-box',e=>e.innerText))&&/CTR/.test(await p.$eval('.admin-box',e=>e.innerText)));
 await p.click('[data-close]');await p.click('[data-gv="hierarquia"]');await p.waitForSelector('tr.gm-campanha');
 t('voltar para a hierarquia mantém a tela funcionando',(await p.$$('tr.gm-campanha')).length===4);
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error('ERRO',e.message.slice(0,300));process.exit(1)});
