// Reorganização final: 9 módulos no menu, Calendário único, Conteúdos dentro de Instagram, Solicitações dentro de Planejamento,
// perfis Administrador × Gerente × Equipe, Dashboard enxuto, Arquivos e Configurações. Uso: node reorg.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,600))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const dia=n=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d)};
(async()=>{
 const senha={'NAT-3301':'Nat26ab','ANT-3302':'Ant26ab','MON-3303':'Mon26ab'};const H={};
 for(const c of Object.keys(senha)){let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});const ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:senha[c]})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:senha[c]})});H[c]={...J,Cookie:cookie(r)}}
 const A=H['NAT-3301'],E=H['ANT-3302'];
 const req=async(m,u,b,h=A)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 let s,j;

 // ---------- perfis ----------
 [s,j]=await req('GET','/auth/me');t('a Gerente atual (migração) virou Administradora: admin=true, perfil "Administrador"',s===200&&j.user.admin===true&&j.user.perfil==='Administrador',j);
 [s,j]=await req('GET','/auth/me',null,E);t('a Equipe não é admin: perfil "Equipe"',j.user.admin===false&&j.user.perfil==='Equipe',j);
 [s,j]=await req('POST','/admin/users/create',{tipo:'interno',nome:'Gerente Teste',perfil:'manager'});t('Administrador cria ficha de Gerente',s===201,[s,j]);
 const gcod=j.codigo,gsen=j.acesso;
 let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:gcod,senha:gsen})});const gck=cookie(r);
 await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:gck},body:JSON.stringify({atual:gsen,nova:'Ger26ab'})});
 r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:gcod,senha:'Ger26ab'})});const G={...J,Cookie:cookie(r)};
 [s,j]=await req('GET','/auth/me',null,G);t('Gerente: role manager, sem admin, perfil "Gerente"',j.user.role==='manager'&&j.user.admin===false&&j.user.perfil==='Gerente',j);
 const barradas=[['GET','/admin/users'],['GET','/admin/audit'],['GET','/backup/list'],['POST','/backup'],['GET','/portal/users'],['GET','/admin/portal'],['POST','/admin/mode',{modo:'senha'}],['POST','/integrations/settings',{}],['POST','/admin/users/create',{tipo:'interno',nome:'Xx'}],['POST','/admin/users/role',{codigo:'ANT-3302',perfil:'admin'}],['GET','/admin/integridade']];
 const falhasG=[];for(const [m,u,b] of barradas){const [st]=await req(m,u,b,G);if(st!==403)falhasG.push(`${m} ${u}:${st}`)}
 t('Gerente é barrada nas rotas de administração (403)',falhasG.length===0,falhasG);
 const permitidas=[['GET','/planejamento/painel'],['GET','/solicitacoes/painel'],['GET','/escolar/painel'],['GET','/datacom/painel'],['GET','/dashboard/resumo'],['GET','/data?module=equipe'],['GET','/integrations/status']];
 const falhasP=[];for(const [m,u] of permitidas){const [st]=await req(m,u,null,G);if(st!==200)falhasP.push(`${m} ${u}:${st}`)}
 t('Gerente continua operando Planejamento, Solicitações, Calendários, Dashboard e Equipe',falhasP.length===0,falhasP);
 [s]=await req('POST','/escolar/salvar',{titulo:'Reunião geral',dataInicio:dia(2),tipoEvento:'EVENTO',segmentos:['TODOS']},G);t('Gerente cadastra evento do Calendário Escolar',s===201||s===200,s);
 [s]=await req('POST','/admin/users/role',{codigo:gcod,perfil:'team'},E);t('Equipe não muda perfis (403)',s===403);
 [s,j]=await req('POST','/admin/users/role',{codigo:'NAT-3301',perfil:'team'});t('o único Administrador não pode ser rebaixado (400)',s===400,[s,j]);
 [s]=await req('POST','/admin/users/delete',{tipo:'interno',codigo:'NAT-3301'});t('nem excluído (400)',s===400);
 [s]=await req('POST','/admin/user-active',{tipo:'interno',codigo:'NAT-3301',ativo:false});t('nem desativado (400)',s===400);
 [s,j]=await req('POST','/admin/users/role',{codigo:gcod,perfil:'admin'});t('Administrador promove a Gerente a Administrador',s===200);
 [s]=await req('GET','/admin/users',null,G);r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:gcod,senha:'Ger26ab'})});const G2={...J,Cookie:cookie(r)};
 [s]=await req('GET','/admin/users',null,G2);t('e ela passa a acessar a administração (200)',s===200,s);
 [s,j]=await req('POST','/admin/users/role',{codigo:gcod,perfil:'manager'});t('Administrador volta a Gerente (há outro Administrador)',s===200);
 [s,j]=await req('GET','/admin/users');const lista=j||[];t('a lista de usuários informa o nível de cada ficha',lista.some(x=>x.codigo==='NAT-3301'&&x.nivel==='admin')&&lista.some(x=>x.codigo===gcod&&x.nivel==='manager')&&lista.some(x=>x.codigo==='ANT-3302'&&x.nivel==='team'),lista.map(x=>x.codigo+':'+x.nivel));

 // ---------- interface ----------
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});const errs=[];
 const entra=async(cod,sen,w=1440,h=1000)=>{const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());await p.goto(BASE+'/');await p.fill('#internalCode',cod);await p.fill('#internalPass',sen);await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem');await p.waitForFunction(()=>!document.querySelector('#content .loading'),null,{timeout:20000}).catch(()=>{});await p.waitForTimeout(800);return p};
 const D0=dia(0),D1=dia(1);
 await req('POST','/data?module=calendario',{titulo:'Reunião de pauta',tipoItem:'Reunião',dataInicio:D0,inicioEm:D0+'T09:00',fimEm:D0+'T10:00',diaInteiro:'Não',status:'PLANEJADO'});
 await req('POST','/data?module=conteudos',{titulo:'Reels da semana',publicacaoEm:D1+'T10:00',status:'PROGRAMADO',canal:'Instagram'});
 const sol=(await req('POST','/solicitacoes/nova',{titulo:'Arte do mural',segmento:'Infantil',prazo:D1,responsavel:'Antônio Filho'}))[1];
 const acao=(await req('POST','/planejamento/salvar',{titulo:'Campanha de matrículas',categoria:'CAMPANHAS',segmento:'Geral',dataInicio:D0,dataFim:dia(3),responsavel:'Natália Mello'}))[1];
 const ev=(await req('POST','/escolar/salvar',{titulo:'Feira de ciências',dataInicio:D1,tipoEvento:'EVENTO',segmentos:['TODOS']}))[1];

 const p=await entra('NAT-3301','Nat26ab');
 const nav=await p.$$eval('#nav .navitem .navlabel',e=>e.map(x=>x.innerText.trim()));
 t('menu lateral: exatamente os 9 módulos aprovados, na ordem',nav.join('|')==='Dashboard|Planejamento|Calendário|Instagram|Tráfego Pago|Arquivos|Relatórios|Equipe|Configurações',nav.join('|'));
 t('nenhum item removido aparece no menu (Agenda, Solicitações, Tarefas, Projetos, Eventos, Campanhas, Conteúdos, Escolar, Datas)',!nav.some(x=>/^(Agenda|Solicitações|Tarefas|Projetos|Eventos|Campanhas|Conteúdos|Calendário Escolar|Datas Comemorativas)$/.test(x)));
 t('sem títulos de grupo no menu',await p.$$eval('#nav .navgroup',e=>e.length)===0);
 const subs=async()=>p.$$eval('#subtabs .subtab',e=>e.map(x=>x.innerText.replace(/\s+/g,' ').trim()));
 const vai=async pg=>{await p.evaluate(x=>go(x),pg);await p.waitForFunction(()=>!document.querySelector('#content .loading'),null,{timeout:20000}).catch(()=>{});await p.waitForTimeout(500)};

 // Planejamento
 await vai('planejamento');let st=await subs();
 t('Planejamento: abas Ações e Solicitações + menu Mais',st[0]==='Ações'&&st[1]==='Solicitações'&&/Mais/.test(st[2]||''),st);
 await p.click('#subMais');const maisPl=await p.$$eval('#subMenu button',e=>e.map(x=>x.innerText));
 t('Mais (Planejamento) guarda Tarefas internas, Eventos e Campanhas — nada ficou inacessível',['Tarefas internas','Eventos','Campanhas'].every(x=>maisPl.includes(x)),maisPl);
 await p.click('#subMenu button:has-text("Tarefas internas")');await p.waitForTimeout(900);
 t('abrir Tarefas internas pelo Mais funciona e marca a aba',/Tarefas/.test(await p.$eval('#subMais',e=>e.innerText)));
 await vai('solicitacoes');t('Solicitações abre dentro da área de Planejamento (item do menu Planejamento ativo)',await p.$eval('#nav .navitem.active .navlabel',e=>e.innerText)==='Planejamento'&&await p.evaluate(()=>/Arte do mural/.test(document.querySelector('#content').innerText)));
 await vai('projetos');t('link antigo de Projetos cai em Planejamento (Ações)',await p.evaluate(()=>state.page)==='planejamento'&&/Campanha de matrículas/.test(await p.$eval('#content',e=>e.innerText)));

 // Calendário único
 await vai('calendario');
 t('Calendário: sem subabas independentes de Marketing, Escolar e Datas',(await subs()).length===0);
 t('Calendário abre na visão semanal',await p.$eval('[data-modo="week"]',e=>e.classList.contains('active')));
 await p.click('[data-modo="list"]');await p.waitForSelector('.cm-proximos');
 await p.waitForFunction(()=>!document.querySelector('#cmRaiz .loading'));
 const txtMes=await p.$eval('#cmRaiz',e=>e.innerText);
 t('Calendário único reúne compromisso, publicação, prazo, ação planejada e evento escolar',['Reunião de pauta','Reels da semana','Arte do mural','Campanha de matrículas','Feira de ciências'].every(x=>txtMes.includes(x)),txtMes.slice(0,400));
 const tiposCh=await p.$$eval('.cm-tipo:not(.cm-todos)',e=>e.map(x=>x.innerText.trim()));
 t('categorias em filtros discretos (Compromissos, Coberturas, Publicações, Ações, Prazos, Escolar, Datas, Feriados)',['Compromissos','Coberturas','Publicações','Ações','Prazos','Escolar','Datas','Feriados'].every(x=>tiposCh.some(y=>y.includes(x))),tiposCh);
 await p.click('[data-tipo="ESCOLAR"]');await p.waitForTimeout(300);
 t('desmarcar "Escolar" esconde só os eventos escolares',!(await p.$eval('#cmRaiz',e=>e.innerText)).includes('Feira de ciências')&&(await p.$eval('#cmRaiz',e=>e.innerText)).includes('Reunião de pauta'));
 await p.click('#cmTodos');await p.waitForTimeout(300);t('"Ver tudo" restaura os tipos',(await p.$eval('#cmRaiz',e=>e.innerText)).includes('Feira de ciências'));
 // um registro só: não duplica
 const cont=await p.$$eval('.cm-item',e=>e.filter(x=>/Feira de ciências/.test(x.innerText)).length);t('o evento escolar aparece uma única vez (sem cópia)',cont===1,cont);
 // abrir cada origem no formulário da origem
 await p.click('.cm-item:has-text("Feira de ciências")');await p.waitForSelector('#escForm');t('evento escolar abre o formulário do Calendário Escolar',true);await p.click('[data-close]');
 await p.click('.cm-item:has-text("Campanha de matrículas") >> nth=0');await p.waitForSelector('.admin-box');t('ação planejada abre a janela do Planejamento',/Campanha de matrículas|Editar ação|Situação/.test(await p.$eval('.admin-box',e=>e.innerText)));await p.click('.admin-box [data-close]');
 // reagendar compromisso por evento sintético (grade mensal)
 await p.click('[data-modo="month"]');await p.waitForSelector('.cm-mes');
 const dest=dia(2);
 await p.evaluate(([u,d])=>{const it=document.querySelector('.cm-item[data-uid^="calendario:"]');const z=document.querySelector(`.cm-dia[data-date="${d}"]`);if(!it||!z)return;const dt=new DataTransfer();dt.setData('text/plain',it.dataset.uid);it.dispatchEvent(new DragEvent('dragstart',{dataTransfer:dt,bubbles:true}));z.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}));z.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))},[0,dest]);
 await p.waitForTimeout(900);
 const calReg=(await req('GET','/data?module=calendario'))[1].rows.find(x=>x.titulo==='Reunião de pauta');
 t('reagendar pelo Calendário único atualiza o registro original',String(calReg.inicioEm||calReg.dataInicio).slice(0,10)===dest,calReg);
 // novo: escolha do tipo
 await p.click('#cmNovo');await p.waitForSelector('.cal-escolha');const esc=await p.$$eval('.cal-escolha button',e=>e.map(x=>x.innerText));
 t('"+ Novo" pergunta o tipo e oferece compromisso, ação, evento escolar e data própria',esc.length===4,esc);
 await p.click('.cal-escolha [data-n="mkt"]');await p.waitForSelector('#cmForm');t('Compromisso abre o formulário simples',true);await p.click('#cmForm [data-close]');
 // links antigos
 await vai('calescolar');await p.waitForSelector('#cmRaiz .cm-semana, #cmRaiz .cm-mes');
 t('link antigo do Calendário Escolar abre o Calendário único filtrado em Escolar',await p.evaluate(()=>state.page)==='calendario'&&(await p.$$eval('.cm-tipo.off',e=>e.length))===7);
 await vai('datacom');t('link antigo de Datas Comemorativas abre o Calendário único filtrado em Datas e Feriados',(await p.$$eval('.cm-tipo.off',e=>e.length))===6);
 await vai('agenda');t('link antigo de Agenda mostra tudo',await p.evaluate(()=>state.page)==='calendario'&&(await p.$$eval('.cm-tipo.off',e=>e.length))===0);

 // Instagram com Conteúdos
 await vai('studio');st=await subs();
 t('Instagram: Estúdio, Conteúdos, Aprovações, Métricas + Mais',['Estúdio','Conteúdos','Aprovações','Métricas'].every((x,i)=>st[i]===x)&&/Mais/.test(st[4]||''),st);
 await p.click('#subMais');const maisIg=await p.$$eval('#subMenu button',e=>e.map(x=>x.innerText));
 t('Mais (Instagram) guarda Editorial, Ideias, Templates, Desempenho e Ranking',['Editorial','Ideias','Templates','Desempenho','Ranking'].every(x=>maisIg.includes(x)),maisIg);
 await p.keyboard.press('Escape');await p.click('body');
 await vai('conteudos');t('Conteúdos abre dentro de Instagram e mostra os registros',await p.$eval('#nav .navitem.active .navlabel',e=>e.innerText)==='Instagram'&&/Reels da semana/.test(await p.$eval('#content',e=>e.innerText)));
 await vai('campanhas');t('Campanhas (internas) segue acessível pelo Planejamento',await p.$eval('#nav .navitem.active .navlabel',e=>e.innerText)==='Planejamento');

 // Tráfego Pago preservado
 await vai('trafego');st=await subs();t('Tráfego Pago preservado: Tráfego e Gerenciador',st.includes('Tráfego')&&st.includes('Gerenciador'),st);

 // Dashboard
 await vai('hoje');const dash=await p.$eval('#content',e=>e.innerText);
 t('Dashboard: solicitações por etapa, próximos dias, ações da semana',/Pendentes/.test(dash)&&/Em andamento/.test(dash)&&/Próximos dias/.test(dash)&&/Ações da semana/.test(dash),dash.slice(0,300));
 t('Dashboard junta compromisso, publicação e evento escolar em uma lista',/Reunião de pauta|Reels da semana|Feira de ciências/.test(dash)&&/Publicação/.test(dash)&&/Evento escolar/.test(dash),dash);
 t('Dashboard enxuto: sem "Entregas recentes" nem cartões repetidos',!/Entregas recentes/.test(dash)&&(await p.$$eval('.db-bloco',e=>e.length))<=2);

 // Arquivos, Relatórios, Configurações
 await vai('arquivos');t('Arquivos: Biblioteca, Entregas e Anexos',await p.$$eval('[data-file-view]',e=>e.map(x=>x.dataset.fileView).join())==='library,deliveries,anexos');
 await p.click('[data-file-view="anexos"]');await p.waitForTimeout(200);t('aba Anexos mostra os anexos das solicitações (sem cópia)',await p.$eval('#fileViewAnexos',e=>!e.hidden));
 await vai('relatorios');st=await subs();const cards=await p.$$eval('[data-report] b',e=>e.map(x=>x.innerText));
 t('Relatórios: Fechamento mensal é uma seção própria, sem cartão duplicado',st.includes('Fechamento mensal')&&!cards.includes('Fechamento mensal'),[st,cards]);
 await vai('configuracoes');st=await subs();const cfg=await p.$eval('#content',e=>e.innerText);
 t('Configurações: Perfil e preferências + Administração (Administrador)',st.includes('Perfil e preferências')&&st.includes('Administração')&&/Alterar senha/.test(cfg)&&/Administrador/.test(cfg),[st,cfg.slice(0,200)]);
 await p.click('[data-sub="administracao"]');await p.waitForSelector('[data-nivel]');
 t('Administração mostra o seletor de perfil (Equipe / Gerente / Administrador)',await p.$$eval('[data-nivel]:first-of-type option',e=>e.length)===3||await p.$$eval('[data-nivel]',e=>e.length)>=3);

 // Gerente: sem Administração
 const pg=await entra(gcod,'Ger26ab');
 const goG=async pgn=>{await pg.evaluate(x=>go(x),pgn);await pg.waitForTimeout(700)};
 await goG('configuracoes');const sg=await pg.$$eval('#subtabs .subtab',e=>e.map(x=>x.innerText));
 t('Gerente não vê a Administração em Configurações',!sg.includes('Administração'),sg);
 await goG('administracao');t('e é levada de volta se tentar abrir a Administração',await pg.evaluate(()=>state.page)!=='administracao');
 const navG=await pg.$$eval('#nav .navitem .navlabel',e=>e.map(x=>x.innerText.trim()));t('Gerente vê os mesmos 9 módulos',navG.length===9,navG);

 // Equipe
 const pe=await entra('ANT-3302','Ant26ab');
 const navE=await pe.$$eval('#nav .navitem .navlabel',e=>e.map(x=>x.innerText.trim()));
 t('Equipe vê os módulos do dia a dia (sem Relatórios nem Equipe de gestão)',navE.includes('Planejamento')&&navE.includes('Calendário')&&navE.includes('Instagram')&&!navE.includes('Relatórios'),navE);
 await pe.evaluate(()=>go('calendario'));await pe.waitForSelector('.cm-semana');t('Equipe consulta o Calendário único',true);
 await pe.click('#cmNovo');await pe.waitForSelector('.cal-escolha');t('Equipe não vê "Evento do calendário escolar" ao criar',(await pe.$$eval('.cal-escolha button',e=>e.length))===3);

 // responsividade
 const pc=await entra('NAT-3301','Nat26ab',390,800);
 await pc.evaluate(()=>go('calendario'));await pc.waitForSelector('.cm-semana, .cm-mes');await pc.waitForTimeout(500);
 t('celular: Calendário único sem rolagem horizontal',await pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await pc.evaluate(()=>go('hoje'));await pc.waitForTimeout(600);t('celular: Dashboard sem rolagem horizontal',await pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 t('sem erros de JavaScript',errs.length===0,errs.join(' | '));
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
