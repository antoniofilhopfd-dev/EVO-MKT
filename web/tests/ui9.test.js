// Interface: página pública de aprovação, link na ficha, NPS no Portal, legendas com IA, conta Instagram. Uso: node ui9.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const PR=process.env.PRINTS||'/tmp/evo-prints';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,300))};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1366,height:1000}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));let logado=false;p.on('dialog',d=>d.accept(logado?'ok':'Senha26x'));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');logado=true;
 const api=(m,u,body)=>p.evaluate(async([m,u,body])=>api(u,{method:m,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),[m,u,body]);
 const id=(await api('POST','/data?module=solicitacoes',{titulo:'Cartaz da feira de ciências',segmento:'Fundamental I',tipoSolicitacao:'Arte impressa',status:'AGUARDANDO TRIAGEM',solicitante:'Profa. Ana'})).id;
 for(const s of ['EM ANÁLISE','EM EXECUÇÃO'])await api('PUT','/data?module=solicitacoes&id='+id,{status:s});
 await p.evaluate(async i=>{const f=new FormData();f.append('files',new File(['x'],'cartaz-final.txt',{type:'text/plain'}));await fetch('/api/manager/upload?id='+i,{method:'POST',headers:{'X-EVO':'1'},body:f})},id);
 await api('PUT','/data?module=solicitacoes&id='+id,{status:'AGUARDANDO APROVAÇÃO DO SOLICITANTE'});
 // botão na ficha
 await p.evaluate(()=>go('solicitacoes'));await p.waitForTimeout(1500);
 await p.evaluate(i=>openModal(state.rows.find(x=>x.id===i)),id);await p.waitForSelector('#btnAprovLink');await p.click('#btnAprovLink');await p.waitForSelector('#lnkAprov');
 const url=await p.$eval('#lnkAprov',e=>e.textContent);t('a ficha da demanda gera o link de aprovação',/\/aprovar\.html\?t=/.test(url),url);
 await p.screenshot({path:PR+'/12_link_aprovacao.png'});
 // página pública em contexto sem login
 const anon=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const e2=[];anon.on('pageerror',e=>e2.push(e.message));anon.on('dialog',d=>d.accept());
 await anon.goto(url.replace(/^https?:\/\/[^/]+/,BASE));await anon.waitForSelector('#nome');
 t('página pública mostra a demanda e o arquivo, sem login',/Cartaz da feira/.test(await anon.$eval('#box',e=>e.innerText))&&/cartaz-final/.test(await anon.$eval('#box',e=>e.innerText)));
 await anon.screenshot({path:PR+'/13_pagina_aprovacao_celular.png'});
 await anon.fill('#nome','Profa. Ana Souza');await anon.click('#ok');await anon.waitForSelector('.msg');
 t('aprovar pela página conclui e mostra agradecimento',/Entrega aprovada/.test(await anon.$eval('#box',e=>e.innerText)));
 await anon.reload();await anon.waitForSelector('.msg.err');t('reabrir o link usado mostra mensagem de link inválido',/não é mais válido/.test(await anon.$eval('#box',e=>e.innerText)));
 t('o link aprovou de verdade',(await api('GET','/data?module=solicitacoes&id='+id)).status==='CONCLUÍDA');
 // IA
 await api('POST','/integrations/settings',{anthropic_key:'sk-ant-teste',ia_guia_voz:'Tom acolhedor'});
 const cid=(await api('POST','/data?module=conteudos',{titulo:'Feira de ciências',segmento:'Fundamental I',formato:'Feed',status:'IDEIA'})).id;
 await p.evaluate(()=>{document.querySelectorAll('.admin-overlay').forEach(x=>x.remove());go('conteudos')});await p.waitForTimeout(1500);await p.evaluate(async i=>{const d=await getRows('conteudos',true);state.module='conteudos';state.rows=d.rows;openModal(d.rows.find(x=>x.id===i))},cid);await p.waitForSelector('#btnIA');await p.click('#btnIA');await p.waitForSelector('[data-usar]');
 await p.screenshot({path:PR+'/14_legendas_ia.png'});
 await p.click('[data-usar="0"]');await p.waitForTimeout(300);
 t('"Usar esta" coloca a legenda no formulário',/matrículas abertas/i.test(await p.$eval('#formFields [name="legenda"]',e=>e.value)));
 // administração: cartão IA
 await p.evaluate(()=>{document.querySelectorAll('.admin-overlay').forEach(x=>x.remove());adminTab='integracoes';go('administracao')});await p.waitForSelector('#iaCard');
 t('Integrações tem o cartão de IA configurada, sem mostrar a chave',/Configurada/.test(await p.$eval('#iaCard',e=>e.innerText))&&!(await p.content()).includes('sk-ant-teste'));
 t('sem erros de JS',errs.length===0&&e2.length===0,errs.concat(e2).join('|'));
 await b.close();console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
