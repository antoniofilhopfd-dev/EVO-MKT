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
 t('Dashboard mostra Instagram, Tráfego, próximos eventos e datas comemorativas',/Instagram/.test(dash)&&/Tr[aá]fego|Invest/i.test(dash)&&/eventos|Calend/i.test(dash)&&/Datas comemorativas/i.test(dash),dash.slice(0,300));
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
 const rs=await p.$$eval('.tp-resumo .tp-rs',e=>e.map(x=>x.innerText.replace(/\n/g,' ')));
 t('Gerenciador: resumo no topo (investimento, conversas, custo por conversa, CTR, ativos)',rs.length===5&&/Investimento/.test(rs[0])&&/Ativos/.test(rs[4])&&/\d+ de \d+/.test(rs[4]),rs);
 await p.click('#tpFiltros');await p.waitForTimeout(400);
 t('painel de filtros avançados abre',!!(await p.$('#ffSt'))&&!!(await p.$('#ffCd')));
 await p.click('[data-rng^="ffCd"]');await p.waitForSelector('.pp');await p.click('.pp-g button[data-d$="-03"]');await p.click('.pp-g button[data-d$="-09"]');await p.click('.pp .ok');await p.waitForTimeout(300);
 const rng=await p.evaluate(()=>[document.querySelector('#ffCd').value,document.querySelector('#ffCa').value,document.querySelector('[data-rng^="ffCd"]').textContent]);
 t('filtro de datas: primeiro e último dia escolhidos no mesmo calendário (um modal, uma confirmação)',rng[0].endsWith('-03')&&rng[1].endsWith('-09')&&/📅/.test(rng[2])&&!(await p.$('.pp')),rng);
 await p.click('[aria-label^="Limpar datas de Criação"]');
 t('limpar as datas do filtro com um toque',(await p.$eval('#ffCd',e=>e.value))===''&&(await p.$eval('#ffCa',e=>e.value))==='');
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
 await ir(p,'trafego');t('Visão Geral tem o atalho do relatório semanal (PDF)',!!(await p.$('#tpRelSemanalVg[href="/relatorio-trafego.html"]')));
 await ir(p,'tfrelatorios');t('Relatórios tem o atalho do relatório semanal aprovado',!!(await p.$('#tpRelSemanal[href="/relatorio-trafego.html"]')));
 await p.evaluate(()=>setPref&&0).catch(()=>{});await p.evaluate(()=>tpDefinePeriodo('x','2026-10-04','2026-10-10'));await ir(p,'tfrelatorios');const href=await p.$eval('#tpRelSemanal',e=>{e.addEventListener('click',ev=>ev.preventDefault(),{capture:true});e.click();return e.getAttribute('href')});t('o relatório semanal abre no período escolhido no Tráfego (04/10 a 10/10)',/de=2026-10-04&ate=2026-10-10/.test(href),href);
 await ir(p,'igvisao');const igv=await p.evaluate(()=>document.querySelector('#content').innerText);t('Instagram › Visão geral: seguidores, publicações, interações, alcance, andamento e próximas',/Seguidores/.test(igv)&&/Publica/.test(igv)&&/Intera/.test(igv)&&/Alcance/.test(igv)&&/Andamento da produ/.test(igv)&&/Pr[oó]ximas publica/.test(igv),igv.slice(0,300));
 t('Visão geral do Instagram é a primeira aba da área',(await p.$$eval('#subtabs .subtab',e=>e[0].textContent.trim()))==='Visão geral');
 await p.click('[data-ig-ir="studio"].btn');await p.waitForTimeout(800);t('Visão geral: "Nova publicação" abre o Estúdio',(await p.evaluate(()=>state.page))==='studio');
 for(const [pg,rx,nome] of [['igposts',/Desempenho|publica/i,'Desempenho'],['igranking',/Ranking|Métricas|m[eê]s/i,'Ranking']]){await ir(p,pg);const tx=await p.evaluate(()=>document.querySelector('#content').innerText);t(`Instagram › ${nome} abre e traz conteúdo`,tx.length>80&&rx.test(tx),tx.slice(0,160))}
 t('Instagram: seletor de conta no topo da Visão geral (quando há conta)',(await ir(p,'igvisao'),true)&&(await p.$$('[data-igconta]')).length>=1);
 await ir(p,'hoje');t('Dashboard: seletor de conta do Instagram no topo',(await p.$$('[data-igconta]')).length>=1);
 const optsD=await p.$$eval('[data-igconta] option',e=>e.map(o=>o.value).filter(v=>v!=='__admin'));
 if(optsD.length>1){await p.selectOption('[data-igconta]',optsD[1]);await p.waitForTimeout(2500);t('Dashboard: trocar a conta recarrega o resumo do Instagram',/Instagram/.test(await p.evaluate(()=>document.querySelector('#content').innerText))&&(await p.evaluate(()=>igConta))===optsD[1]);await p.selectOption('[data-igconta]',optsD[0]);await p.waitForTimeout(1500)}
 await ir(p,'conteudos');const pub=await p.evaluate(()=>document.querySelector('#content').innerText);
 t('Publicações: lista enxuta (sem Salvar filtro, Exportar CSV, Favoritar, Calendário nem chips técnicos)',!/Salvar filtro|Exportar CSV|Favoritar|Banco de dados|Backup autom/.test(pub)&&!(await p.$('[data-view="calendar"]'))&&!!(await p.$('#modNovo'))&&!!(await p.$('#moduleSearch')),pub.slice(0,300));
 await ir(p,'studio');await p.waitForTimeout(1200);
 const igEst=await p.evaluate(()=>{const l=studioCache.ig||[];if(!l.length)return {n:0};studioSemana=stSegunda(new Date(l[0].dia+'T12:00:00'));desenharStudio();return {n:l.length,cards:document.querySelectorAll('.st-ig').length,rotulo:(document.querySelector('.st-ig em')||{}).textContent}});
 t('Estúdio mostra os posts já publicados no Instagram (somente consulta), além dos programados',igEst.n>=1&&igEst.cards>=1&&igEst.rotulo==='Publicado',igEst);
 await ir(p,'conteudos');await p.waitForTimeout(1500);
 t('Publicações lista os posts já publicados no Instagram e não mostra aviso de vazio junto',/Publicadas no Instagram/.test(await p.evaluate(()=>document.querySelector('#content').innerText))&&(await p.$$('#pubIg .db-lista li')).length>=1&&!/Nada em Publica/.test(await p.evaluate(()=>document.querySelector('#content').innerText)));
 // ---- posts já agendados no Instagram: acompanhados como Programado e conciliados como Publicado ----
 const conc=await p.evaluate(async()=>{const h={'Content-Type':'application/json','X-EVO':'1'};const cur=new Date().toISOString().slice(0,7);
  const mk=async b=>(await (await fetch('/api/data?module=conteudos',{method:'POST',headers:h,body:JSON.stringify(b)})).json());
  const a=await mk({titulo:'Feira agendada',legenda:'Bastidores da feira',status:'PROGRAMADO',agendadoNoInstagram:'SIM',publicarInstagram:'NÃO',publicacaoEm:cur+'-01T12:00',canal:'Instagram',formato:'Reels'});
  const b=await mk({titulo:'Outro post',legenda:'Texto que não existe no perfil',status:'PROGRAMADO',agendadoNoInstagram:'SIM',publicarInstagram:'NÃO',publicacaoEm:cur+'-01T12:00',canal:'Instagram',formato:'Feed'});
  const antes=(await (await fetch('/api/data?module=conteudos&id='+a.id)).json()).status;
  await fetch('/api/integrations/instagram/sync',{method:'POST',headers:h,body:'{}'});
  const ra=await (await fetch('/api/data?module=conteudos&id='+a.id)).json(),rb=await (await fetch('/api/data?module=conteudos&id='+b.id)).json();
  return {antes,a:[ra.status,ra.instagramMediaId],b:[rb.status,rb.instagramMediaId]}});
 t('post agendado no Instagram vira Publicado quando aparece no perfil (casa por horário e legenda)',conc.antes==='PROGRAMADO'&&conc.a[0]==='PUBLICADO'&&conc.a[1]==='m2',conc);
 t('post agendado sem correspondência no perfil continua Programado',conc.b[0]==='PROGRAMADO'&&!conc.b[1],conc);
 // ---- menu "Mais" das sub-abas (Tráfego e Instagram), no computador e no celular ----
 const maisFunciona=async(pg,inicio,nome)=>{
  await ir(pg,inicio);await pg.click('#subMais');await pg.waitForTimeout(250);
  const r=await pg.evaluate(()=>{const m=document.getElementById('subMenu');if(!m||m.hidden)return {aberto:false};const b=m.querySelector('button');const bx=b.getBoundingClientRect();const topo=document.elementFromPoint(bx.left+bx.width/2,bx.top+bx.height/2);return {aberto:true,alvo:b.dataset.sub,clicavel:b===topo||b.contains(topo)||(topo&&topo.closest('#subMenu')!==null),coberto_por:topo?(topo.tagName+'.'+topo.className+'#'+topo.id):null,caixa:[Math.round(bx.left),Math.round(bx.top),Math.round(bx.width),Math.round(bx.height)]}});
  t(`${nome}: "Mais" abre o menu e o item fica clicável`,r.aberto&&r.clicavel,r);
  if(r.aberto){await pg.click('#subMenu button');await pg.waitForTimeout(1500);t(`${nome}: item do "Mais" abre a tela`,(await pg.evaluate(()=>state.page))===r.alvo,r)}
 };
 await maisFunciona(p,'trafego','Tráfego (computador)');
 await maisFunciona(p,'studio','Instagram (computador)');
 const pm2=await login('NAT-3301','Nat26ab',{width:390,height:800});
 await maisFunciona(pm2,'trafego','Tráfego (celular)');
 await maisFunciona(pm2,'studio','Instagram (celular)');
 // ---- marcar campanhas/conjuntos e ver só os conjuntos/anúncios deles ----
 await ir(p,'gerenciador');await p.click('[data-niv="campanha"]');await p.waitForTimeout(300);
 const idC=await p.$eval('[data-sel2]',e=>e.dataset.sel2);await p.check('[data-sel2="'+idC+'"]');
 await p.click('[data-niv="conjunto"]');await p.waitForTimeout(500);
 const so1=await p.evaluate(id=>({n:GM2.lista.length,todas:GM2.lista.every(x=>x._campanha===id),total:tpFlat('conjunto').length,chip:(document.querySelector('.tp-chips')||{}).innerText||''}),idC);
 t('marcar uma campanha e abrir Conjuntos mostra só os conjuntos dela',so1.n>=1&&so1.todas&&/campanha\(s\) marcada/.test(so1.chip),so1);
 const idS=await p.$eval('[data-sel2]',e=>e.dataset.sel2);await p.check('[data-sel2="'+idS+'"]');
 await p.click('[data-niv="anuncio"]');await p.waitForTimeout(500);
 const so2=await p.evaluate(id=>({n:GM2.lista.length,todos:GM2.lista.every(x=>x._conjunto===id),chip:(document.querySelector('.tp-chips')||{}).innerText||''}),idS);
 t('marcar um conjunto e abrir Anúncios mostra só os anúncios dele',so2.n>=1&&so2.todos&&/conjunto\(s\) marcado/.test(so2.chip),so2);
 await p.click('[data-niv="campanha"]');await p.waitForTimeout(300);
 t('voltar para Campanhas limpa a seleção e o filtro',(await p.evaluate(()=>GM2.foco.camps.length+GM2.foco.conjs.length+GM2.sel.size))===0);
 // ---- criar campanha, conjunto e anúncio, cada um separado (nascem pausados) ----
 await post('/ads/gestao/config',{ativa:true,cidade:'João Pessoa',tetoDia:100,tetoMes:6000,diasMax:30});
 const mockNovos=async()=>Object.entries((await (await fetch('http://127.0.0.1:8099/__state')).json()).ads_novos||{});
 await ir(p,'gerenciador');await p.click('#tpNova');await p.waitForSelector('[data-cri]');
 t('Criar abre a escolha: campanha, conjunto, anúncio e assistente completo',(await p.$$('[data-cri]')).length===4);
 await p.click('[data-cri="campanha"]');await p.waitForSelector('#crNome');await p.fill('#crNome','Campanha de teste da interface');await p.selectOption('#crObj','ENGAGEMENT');
 await p.click('#crConf');await p.waitForSelector('.cri-msg.ok');t('campanha: a conferência mostra o resumo e libera o botão Criar',!(await p.$eval('#crOk',e=>e.disabled))&&/pausad/i.test(await p.$eval('.cri-msg',e=>e.innerText)));
 await p.click('#crOk');await p.waitForSelector('#crForm',{state:'detached'});await p.waitForTimeout(800);
 const nc=(await mockNovos()).filter(([,v])=>v.tipo==='campanha').pop();
 t('campanha criada pela tela, pausada, só ela',!!nc&&nc[1].params.status==='PAUSED'&&nc[1].params.name==='Campanha de teste da interface'&&(await mockNovos()).filter(([,v])=>v.tipo==='conjunto').length===0,nc);
 await ir(p,'gerenciador');await p.click('#tpNova');await p.click('[data-cri="conjunto"]');await p.waitForSelector('#crCamp');await p.selectOption('#crCamp','c1');await p.waitForSelector('#crMeta');
 await p.fill('#crNome','Conjunto de teste da interface');await p.selectOption('#crMeta','CONVERSATIONS');
 await p.click('#crPer');await p.waitForSelector('.pp');await p.click('.pp [data-m="1"]');await p.click('.pp-g button[data-d$="-05"]');await p.click('.pp-g button[data-d$="-07"]');await p.click('.pp .ok');
 await p.click('#crConf');await p.waitForSelector('.cri-msg.ok');const msgC=await p.$eval('.cri-msg',e=>e.innerText);
 t('conjunto: dentro da campanha escolhida (com orçamento próprio, sem pedir orçamento) a conferência passa',!(await p.$('#crOrcV'))&&!(await p.$eval('#crOk',e=>e.disabled)),msgC);
 await p.click('#crOk');await p.waitForSelector('#crForm',{state:'detached'});await p.waitForTimeout(800);
 const ns=(await mockNovos()).filter(([,v])=>v.tipo==='conjunto').pop();
 t('conjunto criado pela tela na campanha certa, pausado',!!ns&&ns[1].params.status==='PAUSED'&&ns[1].params.campaign_id==='c1'&&ns[1].params.optimization_goal==='CONVERSATIONS',ns);
 await ir(p,'gerenciador');await p.click('#tpNova');await p.click('[data-cri="anuncio"]');await p.waitForSelector('#crSet');await p.selectOption('#crSet','s1');await p.waitForSelector('#crTipo');
 await p.fill('#crNome','Anúncio de teste da interface');await p.selectOption('#crTipo','POST_IG');await p.waitForSelector('#crPost');await p.selectOption('#crPost','m2');
 await p.click('#crConf');await p.waitForSelector('.cri-msg.ok');await p.click('#crOk');await p.waitForSelector('#crForm',{state:'detached'});await p.waitForTimeout(800);
 const na=(await mockNovos()).filter(([,v])=>v.tipo==='anuncio').pop();
 t('anúncio criado pela tela no conjunto escolhido, pausado',!!na&&na[1].params.status==='PAUSED'&&na[1].params.adset_id==='s1',na);
 // ---- período em um único modal (primeiro e último dia) ----
 await ir(p,'gerenciador');await p.click('#tpPerBtn');await p.waitForSelector('.pp');
 const antes=await p.$$eval('.pp-g button[data-d]',e=>e.length);
 await p.click('.pp-g button[data-d$="-04"]');await p.waitForTimeout(100);
 t('modal de período: o primeiro dia fica marcado e o Aplicar já libera',(await p.$eval('.pp .ok',e=>!e.disabled))&&(await p.$$('.pp-g button.ini')).length===1);
 await p.click('.pp-g button[data-d$="-10"]');await p.waitForTimeout(100);
 const fimMarcado=await p.$$eval('.pp-g button.fim',e=>e.length);
 await p.click('.pp .ok');await p.waitForTimeout(1500);
 const per=await p.evaluate(()=>tpPeriodo());
 t('um único modal escolhe o primeiro e o último dia e aplica de uma vez',antes>=28&&fimMarcado===1&&per.p==='x'&&per.de.endsWith('-04')&&per.ate.endsWith('-10')&&!(await p.$('.pp')),[antes,fimMarcado,per]);
 t('o botão do período mostra o intervalo escolhido',/📅/.test(await p.$eval('#tpPerBtn',e=>e.textContent)));
 await p.evaluate(()=>tpDefinePeriodo('30'));
 // ---- celular ----
 const pm=await login('NAT-3301','Nat26ab',{width:390,height:800});
 for(const pg of ['hoje','calendario','arquivos','trafego','gerenciador','configuracoes']){await ir(pm,pg);const w=await pm.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);t(`celular: ${pg} sem rolagem horizontal da página`,w<=2,w)}
 // ---- erros de JS ----
 const errs=[...p.errs,...pe.errs,...pm.errs];t('sem erros de JS nas telas novas',errs.length===0,errs);
 await b.close();console.log(`\n${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
