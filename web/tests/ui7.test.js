// Calendário geral (com filtros) e sub-aba Calendário dentro de cada módulo. Uso: node ui7.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,300))};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept('Senha26x'));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');
 const d=new Date();d.setDate(d.getDate()+2);const ds=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
 const post=(m,o)=>p.evaluate(async([m,o])=>{await api('/data?module='+m,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});invalidate(m)},[m,o]);
 await post('eventos',{titulo:'Feira de Ciências',dataInicio:ds,status:'PRÉ-EVENTO'});
 await post('calendario',{titulo:'Reunião de pais',inicioEm:ds+'T19:00',fimEm:ds+'T20:00',tipoItem:'Reunião',status:'PLANEJADO'});
 await post('tarefas',{titulo:'Arte do cartaz',prazo:ds,status:'NOVO'});
 await post('conteudos',{titulo:'Post da feira',publicacaoEm:ds+'T10:00',status:'PROGRAMADO'});
 await post('campanhas',{titulo:'Matrículas 2027',dataInicio:ds,status:'PLANEJAMENTO'});
 const nav=await p.$$eval('#nav .navitem',e=>e.map(x=>x.innerText.replace(/\s+/g,' ').trim()));
 t('menu lateral tem as 8 áreas',nav.length===8&&['Visão geral','Solicitações','Planejamento','Conteúdo','Tráfego','Relatórios','Arquivos e equipe','Administração'].every((x,i)=>nav[i].includes(x)),nav.join('|'));
 await p.evaluate(()=>go('agenda'));await p.waitForSelector('#subtabs .subtab');const sub=await p.$$eval('#subtabs .subtab',e=>e.map(x=>x.innerText));
 t('Planejamento tem um só "Calendário" nas seções (sem "Calendário de Eventos")',sub.filter(x=>/Calendário/.test(x)).length===1&&!sub.some(x=>/Calendário de Eventos/.test(x))&&sub.includes('Tarefas')&&sub.includes('Projetos'),sub.join('|'));
 // geral com filtros
 await p.evaluate(()=>go('calendario'));await p.waitForSelector('.upcoming-panel');
 let up=await p.$eval('.upcoming-panel',e=>e.innerText);
 t('Calendário geral mostra tarefa, conteúdo, campanha, evento e reunião',['Arte do cartaz','Post da feira','Matrículas 2027','Feira de Ciências','Reunião de pais'].every(x=>up.includes(x)),up);
 await p.click('[data-calf="tarefas"]');await p.waitForTimeout(500);up=await p.$eval('.upcoming-panel',e=>e.innerText);
 t('desmarcar "Tarefas" some com as tarefas e mantém o resto',!/Arte do cartaz/.test(up)&&/Feira de Ciências/.test(up),up);
 await p.click('[data-calf="tarefas"]');await p.waitForTimeout(400);
 await p.click('#calNew');await p.waitForSelector('#recordForm');
 t('"+ Novo compromisso" abre o formulário com Tipo/Início/Fim',/Tipo[\s\S]*Início[\s\S]*Fim/.test(await p.$eval('#formFields',e=>e.innerText)));await p.evaluate(()=>closeModal());
 // sub-aba Calendário em cada módulo
 const casos=[['tarefas','Arte do cartaz',['Feira de Ciências','Post da feira','Matrículas 2027']],['conteudos','Post da feira',['Arte do cartaz','Feira de Ciências']],['eventos','Feira de Ciências',['Arte do cartaz','Post da feira']],['campanhas','Matrículas 2027',['Arte do cartaz','Feira de Ciências']]];
 for(const [m,tem,naoTem] of casos){
  await p.evaluate(m=>{setPref('view.'+m,'table');go(m)},m);await p.waitForSelector('.view-switch button[data-view="calendar"]');
  t(`${m}: tem a sub-aba Calendário`,true);
  await p.click('.view-switch button[data-view="calendar"]');await p.waitForSelector('.module-calendar-head');
  const html=await p.$eval('#content',e=>e.innerText);
  t(`${m}: calendário mostra só ${m} (tem "${tem}")`,html.includes(tem)&&naoTem.every(x=>!html.includes(x)),html.slice(0,200));
 }
 // criar clicando no dia dentro do módulo cria o item do módulo
 await p.evaluate(()=>{setPref('view.tarefas','calendar');go('tarefas')});await p.waitForSelector('.module-calendar-head');
 await p.click('.daynum');await p.waitForSelector('#recordForm');
 t('clicar no dia em Tarefas abre formulário de tarefa (Prazo/Prioridade)',/Prazo[\s\S]*Prioridade|Prioridade[\s\S]*Prazo/.test(await p.$eval('#formFields',e=>e.innerText)));await p.evaluate(()=>closeModal());
 // link antigo
 await p.evaluate(()=>go('calev'));await p.waitForSelector('.module-calendar-head');
 t('link antigo "calev" cai em Eventos → Calendário',/Feira de Ciências/.test(await p.$eval('#content',e=>e.innerText)));
 t('sem erros de JS',errs.length===0,errs.join('|'));
 await b.close();console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
