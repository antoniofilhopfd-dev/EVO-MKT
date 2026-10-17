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
 t('menu lateral reorganizado (Organização, Marketing, Gestão, Administração)',nav.length===15&&['Dashboard','Solicitações','Planejamento','Calendários','Conteúdos','Campanhas','Instagram','Tráfego Pago','Relatórios','Arquivos','Equipe','Configurações','Usuários e permissões','Integrações','Backup e segurança'].every((x,i)=>nav[i].includes(x)),nav.join('|'));
 await p.evaluate(()=>go('calendario'));await p.waitForSelector('#subtabs .subtab');const sub=await p.$$eval('#subtabs .subtab',e=>e.map(x=>x.innerText));
 t('Calendários: Marketing, Escolar e Datas Comemorativas (sem "Calendário de Eventos")',sub.length===3&&sub.some(x=>/Marketing/.test(x))&&sub.some(x=>/Escolar/.test(x))&&sub.some(x=>/Datas/.test(x))&&!sub.some(x=>/Eventos/.test(x)),sub.join('|'));
 // Calendário de Marketing (geral): compromissos, reuniões, publicações e prazos de solicitações; sem tarefas/campanhas/eventos
 await p.evaluate(()=>go('calendario'));await p.waitForSelector('.cm-mes');
 let up=await p.$eval('#cmRaiz',e=>e.innerText);
 t('Calendário de Marketing mostra a reunião e a publicação, e deixa tarefas, campanhas e eventos nos seus módulos',/Reunião de pais/.test(up)&&/Post da feira/.test(up)&&!/Arte do cartaz/.test(up)&&!/Matrículas 2027/.test(up)&&!/Feira de Ciências/.test(up),up);
 await p.click('[data-tipo="PUBLICACAO"]');await p.waitForTimeout(300);up=await p.$eval('#cmRaiz',e=>e.innerText);
 t('desmarcar "Publicação" esconde as publicações e mantém a reunião',!/Post da feira/.test(up)&&/Reunião de pais/.test(up),up);
 await p.click('[data-tipo="PUBLICACAO"]');await p.waitForTimeout(300);
 await p.click('#cmNovo');await p.waitForSelector('#cmForm');
 t('"+ Novo evento" abre o formulário simples (Título, Data, Horário, Tipo, Responsável, Observações)',/Título[\s\S]*Data[\s\S]*Horário[\s\S]*Tipo[\s\S]*Responsável[\s\S]*Observações/.test(await p.$eval('#cmForm',e=>e.innerText)));await p.evaluate(()=>document.querySelectorAll('.admin-overlay').forEach(e=>e.remove()));
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
