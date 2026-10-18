// Etapa 03 na interface: indicadores na Central, lista de origem, linha do tempo e pedido de motivo ao voltar de etapa. Uso: node ui8.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,300))};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const prompts=[];let logado=false;p.on('dialog',d=>{if(!logado)return d.accept('Senha26x');prompts.push(d.message());d.accept('Triagem precisa rever')});
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.db-topo');logado=true;
 // dados: uma solicitação em EM ANÁLISE
 const id=await p.evaluate(async()=>{const r=await api('/data?module=solicitacoes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({titulo:'Demanda da interface',segmento:'Infantil',tipoSolicitacao:'Post',status:'EM ANÁLISE'})});return r.id});
 await p.evaluate(()=>go('central'));await p.waitForSelector('#indPainel .ind');
 t('Central mostra o painel de indicadores do servidor',(await p.$$('#indPainel .ind')).length>=12);
 t('o painel traz "Cumprimento do SLA" e "Redistribuídas"',/Cumprimento do SLA/.test(await p.$eval('#indPainel',e=>e.innerText))&&/Redistribu/.test(await p.$eval('#indPainel',e=>e.innerText)));
 await p.click('#indPainel [data-ind="abertas"]');await p.waitForSelector('.admin-overlay .alert-row');
 t('clicar no indicador abre a lista de registros de origem',/Demanda da interface/.test(await p.$eval('.admin-overlay',e=>e.innerText)));
 await p.click('.admin-overlay [data-close]');
 // status novo na lista e pedido de motivo
 t('lista de status de solicitação inclui "AGUARDANDO APROVAÇÃO DO SOLICITANTE" (vinda do servidor)',await p.evaluate(()=>STATUS_BY_MODULE.solicitacoes.includes('AGUARDANDO APROVAÇÃO DO SOLICITANTE')));
 await p.evaluate(async i=>{await api('/data?module=solicitacoes&id='+i,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'DISTRIBUÍDA'})})},id);
 const res=await p.evaluate(async i=>{await api('/data?module=solicitacoes&id='+i,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'EM ANÁLISE'})});return (await api('/data?module=solicitacoes&id='+i)).status},id);
 t('voltar de etapa pede o motivo e conclui depois de informado',prompts.some(m=>/motivo/i.test(m))&&res==='EM ANÁLISE',[prompts,res]);
 // linha do tempo no modal
 await p.evaluate(()=>go('solicitacoes'));await p.waitForTimeout(1200);
 await p.evaluate(i=>{const r=state.rows.find(x=>x.id===i);openModal(r)},id);await p.waitForSelector('#btnTimeline');await p.click('#btnTimeline');await p.waitForSelector('.timeline-real li');
 const tl=await p.$eval('.admin-overlay',e=>e.innerText);
 t('linha do tempo mostra as mudanças de status com o motivo',/EM ANÁLISE → DISTRIBUÍDA/.test(tl)&&/Triagem precisa rever/.test(tl),tl);
 t('sem erros de JS',errs.length===0,errs.join('|'));
 await b.close();console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
