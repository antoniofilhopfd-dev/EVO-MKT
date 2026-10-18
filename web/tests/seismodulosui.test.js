// Interface dos seis módulos (v5.17): menu por perfil, Dashboard, Calendário único, Arquivos, Tráfego Pago (Visão Geral, Gerenciador, filtros, colunas, painel,
// Criativos, Públicos, Análises, Orçamentos, Alertas, Relatórios, Histórico) e Configurações por perfil. Uso: node seismodulosui.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,500))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const dia=n=>{const d=new Date();d.setDate(d.getDate()+n);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
(async()=>{
 const senha={'NAT-3301':'Nat26ab','ANT-3302':'Ant26ab'};const H={};
 for(const c of Object.keys(senha)){let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});const ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:senha[c]})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:senha[c]})});H[c]={...J,Cookie:cookie(r)}}
 const post=(u,b)=>fetch(B+u,{method:'POST',headers:H['NAT-3301'],body:JSON.stringify(b)}).then(x=>x.json());
 await post('/data?module=calendario',{titulo:'Reunião de pais',tipoItem:'Reunião',dataInicio:dia(0),inicioEm:dia(0)+'T19:00',fimEm:dia(0)+'T20:00',diaInteiro:'Não',status:'PLANEJADO'});
 await post('/escolar/salvar',{titulo:'Feira de ciências',dataInicio:dia(1),dataFim:dia(2),tipoEvento:'EVENTO',segmentos:['TODOS']});
 await post('/ads/modo',{gestao:true});await post('/integrations/meta/token',{token:'GOOD_TOKEN'});await post('/integrations/instagram/sync',{});await fetch(B+'/integrations/ads/accounts',{headers:H['NAT-3301']});await post('/integrations/ads/account',{conta:'111222333'});
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const login=async(cod,sen,vp={width:1440,height:900})=>{const p=await (await b.newContext({viewport:vp})).newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());await p.goto(BASE+'/');await p.fill('#internalCode',cod);await p.fill('#internalPass',sen);await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem');await p.waitForTimeout(1200);return p};
 const ir=async(p,pg)=>{await p.evaluate(x=>go(x),pg);await p.waitForFunction(()=>!document.querySelector('#content .loading'),null,{timeout:25000}).catch(()=>{});await p.waitForTimeout(2500)};
 const nav=p=>p.$$eval('#nav .navitem .navlabel',e=>e.map(x=>x.innerText.trim()));
 const SEIS='Dashboard|Calendário|Instagram|Tráfego Pago|Arquivos|Configurações';

 // ---- menu e perfis ----
 const p=await login('NAT-3301','Nat26ab');
 t('Administrador: menu com exatamente os seis módulos',(await nav(p)).join('|')===SEIS,await nav(p));
 const pe=await login('ANT-3302','Ant26ab');
 t('Equipe de Marketing: os mesmos seis módulos',(await nav(pe)).join('|')===SEIS,await nav(pe));
 await ir(pe,'configuracoes');
 const secE=await pe.$$eval('#cfgBody, .cfg-menu, #content',e=>e.map(x=>x.innerText).join(' '));
 t('Configurações da Equipe: Meu Perfil sim; Usuários e Backup não',/Meu Perfil/i.test(secE)&&!/Usuários e Acessos/i.test(secE)&&!/Backup/i.test(secE),secE.slice(0,300));
 await ir(p,'configuracoes');
 const secA=await p.evaluate(()=>document.querySelector('#content').innerText);
 t('Configurações do Administrador: todas as seções',/Meu Perfil/i.test(secA)&&/Usuários e Acessos/i.test(secA)&&/Integrações/i.test(secA)&&/Alertas/i.test(secA)&&/Preferências/i.test(secA)&&/Segurança/i.test(secA)&&/Backup/i.test(secA),secA.slice(0,400));
 // módulos retirados não respondem como tela
 for(const pg of ['tarefas','solicitacoes','projetos','campanhas','equipe','relatorios']){await p.evaluate(x=>{try{go(x)}catch{}},pg);await p.waitForTimeout(500)}
 t('módulos retirados não deixam item no menu',(await nav(p)).join('|')===SEIS);

 // ---- Dashboard ----
 await ir(p,'hoje');await p.waitForFunction(()=>document.querySelector('#content').innerText.length>400,null,{timeout:15000}).catch(()=>{});
 const dash=await p.evaluate(()=>document.querySelector('#content').innerText);
 t('Dashboard mostra Instagram, Tráfego, próximos eventos e integrações',/Instagram/.test(dash)&&/Tr[aá]fego|Invest/i.test(dash)&&/eventos|Calend/i.test(dash)&&/Integra/i.test(dash),dash.slice(0,300));
 t('Dashboard não cita Matrículas nem Leads cadastrados (sem CRM)',!/custo por matr[ií]cula|matr[ií]culas efetivadas|capta[cç][aã]o de leads|funil/i.test(dash),dash.slice(0,300));

 // ---- Calendário único ----
 await ir(p,'calendario');
 const cal=await p.evaluate(()=>document.querySelector('#content').innerText);
 t('Calendário único mostra reunião e evento escolar',/Reunião de pais/.test(cal)&&/Feira de ciências/.test(cal),cal.slice(0,300));
 t('Calendário tem Mês, Semana e Dia',!!(await p.$('[data-modo="month"]'))&&!!(await p.$('[data-modo="week"]'))&&!!(await p.$('[data-modo="day"]')));

 // ---- Arquivos ----
 await ir(p,'arquivos');
 const arq=await p.evaluate(()=>document.querySelector('#content').innerText);
 t('Arquivos abre com busca e envio',!!(await p.$('#aqBusca'))&&/Enviar|Upload/i.test(arq),arq.slice(0,200));

 // ---- Tráfego Pago ----
 await ir(p,'trafego');
 const vg=await p.evaluate(()=>document.querySelector('#content').innerText);
 t('Visão Geral: indicadores de investimento, alcance e conversas',/Investimento/i.test(vg)&&/Alcance/i.test(vg)&&/Conversas/i.test(vg),vg.slice(0,300));
 t('Visão Geral não mostra Matrículas nem funil',!/custo por matr[ií]cula|matr[ií]culas efetivadas|funil|leads cadastrados/i.test(vg));
 await ir(p,'gerenciador');
 t('Gerenciador abre direto na tabela com campanhas',!!(await p.$('#tpTabBox table, .tp-tab'))&&(await p.$$('.tp-tab tbody tr')).length>0);
 const ths=await p.$$eval('.tp-tab thead th',e=>e.map(x=>x.innerText.trim()).filter(Boolean));
 t('tabela traz colunas de desempenho (Gasto/Alcance/CTR)',ths.some(x=>/Invest/i.test(x))&&ths.some(x=>/CTR/i.test(x))&&ths.some(x=>/Conversas/i.test(x)),ths);
 await p.click('#tpFiltros');await p.waitForTimeout(400);
 t('painel de filtros avançados abre',!!(await p.$('#ffSt'))&&!!(await p.$('#ffCd')));
 await p.click('#tpFiltros').catch(()=>{});
 await p.click('#tpColunas');await p.waitForTimeout(400);
 t('painel de colunas abre com busca e padrão',!!(await p.$('#colBusca'))&&!!(await p.$('#colPadrao')));
 await p.click('#colOk').catch(()=>{});await p.waitForTimeout(300);
 await p.fill('#tpBusca','Matrículas').catch(()=>{});await p.waitForTimeout(500);
 t('busca por nome filtra a tabela',(await p.$$('.tp-tab tbody tr')).length>=1);
 await p.fill('#tpBusca','zzzz-inexistente').catch(()=>{});await p.waitForTimeout(500);
 t('busca sem resultado mostra estado vazio (não zeros)',(await p.$$('.tp-tab tbody tr[data-id]')).length===0);
 await p.fill('#tpBusca','').catch(()=>{});
 await ir(p,'gerenciador');
 if(await p.$('[data-painel]')){await p.click('[data-painel]');await p.waitForTimeout(1500);t('painel lateral abre ao clicar na campanha',!!(await p.$('.tp-lateral')))}
 for(const [pg,rx,nome] of [['tfcriativos',/Criativ/i,'Criativos'],['tfpublicos',/Segmento|Públic/i,'Públicos'],['tfanalises',/Comparar|Análise/i,'Análises'],['tforcamentos',/Orçamento/i,'Orçamentos'],['tfalertas',/Alerta/i,'Alertas'],['tfrelatorios',/Relat/i,'Relatórios'],['tfhistorico',/Hist/i,'Histórico']]){
  await ir(p,pg);const tx=await p.evaluate(()=>document.querySelector('#content').innerText);t(`Tráfego › ${nome} carrega`,rx.test(tx)&&!/custo por matr[ií]cula|matr[ií]culas efetivadas|funil|leads cadastrados/i.test(tx),tx.slice(0,160));
 }
 // ---- celular ----
 const pm=await login('NAT-3301','Nat26ab',{width:390,height:800});
 for(const pg of ['hoje','calendario','arquivos','trafego','gerenciador','configuracoes']){await ir(pm,pg);const w=await pm.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);t(`celular: ${pg} sem rolagem horizontal da página`,w<=2,w)}
 // ---- erros de JS ----
 const errs=[...p.errs,...pe.errs,...pm.errs];t('sem erros de JS nas telas novas',errs.length===0,errs);
 await b.close();console.log(`\n${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
