// Calendário de Marketing: fontes (compromissos, reuniões, coberturas, publicações, prazos de solicitações), Mês/Semana/Dia,
// criar/editar/excluir/reagendar, filtros, integração com Solicitações e celular. Uso: node calmkt.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,500))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const dia=n=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d)};
(async()=>{
 const senha={'NAT-3301':'Nat26ab','ANT-3302':'Ant26ab','MON-3303':'Mon26ab'};
 for(const c of Object.keys(senha)){let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});const ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:senha[c]})})}
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const errs=[];
 const entra=async(cod,w=1440,h=1000)=>{const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());await p.goto(BASE+'/');await p.fill('#internalCode',cod);await p.fill('#internalPass',senha[cod]);await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem');await p.waitForFunction(()=>!document.querySelector('#content .loading'),null,{timeout:20000}).catch(()=>{});await p.waitForTimeout(800);return p};
 const p=await entra('NAT-3301');
 const api=(m,u,body)=>p.evaluate(async([m,u,body])=>{try{return await api(u,{method:m,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})}catch(e){return {erro:e.message}}},[m,u,body]);
 const lista=async m=>(await api('GET','/data?module='+m)).rows;
 const vai=async()=>{await p.evaluate(()=>go('calendario'));await p.waitForSelector('.cm-mes, .cm-semana, .cm-diaVista');await p.waitForFunction(()=>!document.querySelector('#cmRaiz .loading'));if(!(await p.$('.cm-mes'))){await p.click('[data-modo="month"]');await p.waitForSelector('.cm-mes')}};

 // ---- dados de teste (existentes e novos) ----
 const D0=dia(0),D1=dia(1),D2=dia(2),D3=dia(3);
 const reuniao=await api('POST','/data?module=calendario',{titulo:'Reunião de pais',tipoItem:'Reunião',dataInicio:D0,inicioEm:D0+'T19:00',fimEm:D0+'T20:00',diaInteiro:'Não',status:'PLANEJADO'});
 await api('POST','/data?module=calendario',{titulo:'Lembrete antigo',tipoItem:'Lembrete',dataInicio:D1,inicioEm:D1+'T00:00',diaInteiro:'Sim',status:'PLANEJADO'});
 await api('POST','/data?module=agenda',{titulo:'Gravação do vídeo institucional',inicioEm:D0+'T14:00',fimEm:D0+'T16:00',status:'Hoje'});
 const post=await api('POST','/data?module=conteudos',{titulo:'Post da feira',publicacaoEm:D1+'T10:00',status:'PROGRAMADO'});
 await api('POST','/data?module=tarefas',{titulo:'Tarefa que não aparece',prazo:D1,status:'NOVO'});
 await api('POST','/data?module=campanhas',{titulo:'Campanha que não aparece',dataInicio:D1,status:'PLANEJAMENTO'});
 const sol=await api('POST','/solicitacoes/nova',{titulo:'Cartaz da feira',segmento:'Infantil',prazo:D1,responsavel:'Antônio Filho'});
 const solFeita=await api('POST','/solicitacoes/nova',{titulo:'Pedido já entregue',prazo:D1,responsavel:'Antônio Filho'});
 await api('POST','/solicitacoes/mover',{id:solFeita.id,etapa:'EM_ANDAMENTO'});await api('POST','/solicitacoes/mover',{id:solFeita.id,etapa:'CONCLUIDO'});
 const antes={cal:(await lista('calendario')).length,sol:(await lista('solicitacoes')).length};

 // ---- o que aparece ----
 await vai();
 let txt=await p.$eval('#cmRaiz',e=>e.innerText);
 t('mostra reunião, compromisso antigo, gravação (agenda), publicação e prazo de solicitação',['Reunião de pais','Lembrete antigo','Gravação do vídeo','Post da feira','Cartaz da feira'].every(x=>txt.includes(x)),txt);
 t('não mostra tarefas, campanhas nem solicitações já concluídas',!/Tarefa que não aparece|Campanha que não aparece|Pedido já entregue/.test(txt));
 t('o título é "Calendário" (único, sem subabas)',/^Calendário$/.test((await p.$eval('#content h1',e=>e.textContent)).trim())&&(await p.$$('#subtabs .subtab')).length===0);
 t('o prazo da solicitação usa o registro original (um só cadastro)',(await lista('solicitacoes')).length===antes.sol&&(await p.$$eval('.cm-item.t-PRAZO',e=>e.length))===1);
 t('tipos têm classe/cor própria e o filtro mostra os 8 tipos',(await p.$$eval('.cm-tipo:not(.cm-todos)',e=>e.length))===8&&await p.$('.cm-item.t-COMPROMISSO')!==null&&await p.$('.cm-item.t-COBERTURA')!==null&&await p.$('.cm-item.t-PUBLICACAO')!==null);
 t('o compromisso antigo (Lembrete) continua visível como Compromisso',await p.$('.cm-item.t-COMPROMISSO')!==null);

 // ---- visualizações e navegação ----
 const periodo=()=>p.$eval('.cm-periodo',e=>e.textContent);
 const mes0=await periodo();await p.click('#cmNext');await p.waitForTimeout(150);const mes1=await periodo();
 t('avançar muda o mês',mes0!==mes1);await p.click('#cmPrev');await p.click('#cmPrev');await p.waitForTimeout(150);t('voltar muda o mês',(await periodo())!==mes0);
 await p.click('#cmHoje');await p.waitForTimeout(150);t('"Hoje" volta à data atual',(await periodo())===mes0);
 await p.fill('#cmIr',dia(40));await p.dispatchEvent('#cmIr','change');await p.waitForTimeout(200);t('"Ir para a data" navega',(await periodo())!==mes0);await p.click('#cmHoje');await p.waitForTimeout(150);
 await p.click('[data-modo="week"]');await p.waitForSelector('.cm-semana');t('visão Semana: 7 colunas e os itens da semana',(await p.$$eval('.cm-col',e=>e.length))===7&&/Reunião de pais/.test(await p.$eval('.cm-semana',e=>e.innerText)));
 const sem0=await periodo();await p.click('#cmNext');await p.waitForTimeout(150);t('semana: avançar muda o intervalo',(await periodo())!==sem0);await p.click('#cmHoje');await p.waitForTimeout(150);
 await p.click('[data-modo="day"]');await p.waitForSelector('.cm-diaVista');
 const diaTxt=await p.$eval('.cm-diaVista',e=>e.innerText);
 t('visão Dia: lista os do dia por horário (14:00 antes de 19:00)',diaTxt.includes('Reunião de pais')&&diaTxt.indexOf('14:00')>=0&&diaTxt.indexOf('14:00')<diaTxt.indexOf('19:00'),diaTxt);
 await p.click('#cmNext');await p.waitForTimeout(150);t('dia: avançar mostra o dia seguinte (Cartaz e Post)',/Cartaz da feira/.test(await p.$eval('.cm-diaVista',e=>e.innerText)));
 await p.click('#cmHoje');await p.click('[data-modo="month"]');await p.waitForSelector('.cm-mes');

 // ---- filtros ----
 await p.click('[data-tipo="COMPROMISSO"]');await p.waitForTimeout(150);t('filtro por tipo esconde Compromissos (inclui Reunião)',!/Reunião de pais/.test(await p.$eval('#cmRaiz',e=>e.innerText))&&/Post da feira/.test(await p.$eval('#cmRaiz',e=>e.innerText)));
 await p.click('[data-tipo="COMPROMISSO"]');await p.waitForTimeout(150);
 await p.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await p.selectOption('#cmResp','Antônio Filho');await p.waitForTimeout(150);txt=await p.$eval('#cmRaiz',e=>e.innerText);t('filtro por responsável mostra só os dele',/Cartaz da feira/.test(txt)&&!/Reunião de pais/.test(txt));
 await p.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await p.selectOption('#cmResp','');await p.waitForTimeout(150);

 // ---- criar: botão, número do dia, espaço livre ----
 await p.click('#cmNovo');await p.waitForSelector('.cal-escolha');await p.click('.cal-escolha [data-n="mkt"]');await p.waitForSelector('#cmForm');
 t('"+ Novo evento": a data já vem preenchida',(await p.inputValue('#fData'))===D0);
 await p.fill('#fTitulo','Cobertura da gincana');await p.fill('#fHora','09:30');await p.selectOption('#fTipo','COBERTURA');await p.selectOption('#fResp','Monique Vilante');await p.fill('#fObs','Levar o tripé');await p.click('#fSalvar');await p.waitForSelector('#cmForm',{state:'detached'});
 let nova=(await lista('calendario')).find(x=>x.titulo==='Cobertura da gincana');
 t('criado com título, data, horário, tipo, responsável e observações',nova&&nova.dataInicio===D0&&nova.inicioEm===D0+'T09:30'&&nova.tipoItem==='Cobertura foto/vídeo'&&nova.responsavel==='Monique Vilante'&&nova.descricao==='Levar o tripé'&&nova.diaInteiro==='Não',nova);
 await p.waitForSelector('.cm-item:has-text("Cobertura da gincana")');
 await p.click(`.cm-num[data-novo="${D2}"]`);await p.waitForSelector('#cmForm');t('clicar no número do dia preenche a data clicada',(await p.inputValue('#fData'))===D2);
 await p.fill('#fTitulo','Alinhamento sem hora');await p.click('#fSalvar');await p.waitForSelector('#cmForm',{state:'detached'});
 nova=(await lista('calendario')).find(x=>x.titulo==='Alinhamento sem hora');
 t('horário é opcional (dia inteiro) e o tipo padrão vale',nova&&nova.diaInteiro==='Sim'&&nova.dataInicio===D2&&nova.tipoItem==='Reunião',nova);
 await p.click(`.cm-dia[data-date="${D3}"]`,{position:{x:8,y:70}});await p.waitForSelector('#cmForm');t('clicar no espaço livre do dia cria nele',(await p.inputValue('#fData'))===D3);
 await p.click('#cmForm [data-close]');await p.waitForSelector('#cmForm',{state:'detached'});
 await p.click('#fSalvar').catch(()=>{});
 await p.click('[data-modo="week"]');await p.waitForSelector('.cm-semana');
 await p.click(`.cm-col[data-date="${D0}"]`,{position:{x:6,y:150}});await p.waitForSelector('#cmForm');t('na Semana, clicar no espaço livre também cria',(await p.inputValue('#fData'))===D0);
 await p.click('#cmForm [data-close]');await p.click('[data-modo="month"]');await p.waitForSelector('.cm-mes');
 await p.click('#cmNovo');await p.waitForSelector('.cal-escolha');await p.click('.cal-escolha [data-n="mkt"]');await p.waitForSelector('#cmForm');await p.click('#fSalvar');t('o formulário exige título',/título/i.test(await p.textContent('#fErro')));await p.click('#cmForm [data-close]');

 // ---- editar / reagendar pelo formulário ----
 await p.click('.cm-item:has-text("Cobertura da gincana")');await p.waitForSelector('#cmForm');
 t('abrir o evento mostra os dados',(await p.inputValue('#fTitulo'))==='Cobertura da gincana'&&(await p.inputValue('#fHora'))==='09:30'&&(await p.inputValue('#fTipo'))==='COBERTURA');
 await p.fill('#fTitulo','Cobertura da gincana (foto)');await p.fill('#fData',D1);await p.fill('#fHora','15:00');await p.click('#fSalvar');await p.waitForSelector('#cmForm',{state:'detached'});
 nova=(await lista('calendario')).find(x=>x.id===nova.id||x.titulo==='Cobertura da gincana (foto)');
 t('editar e reagendar pelo formulário',nova&&nova.titulo==='Cobertura da gincana (foto)'&&nova.dataInicio===D1&&nova.inicioEm===D1+'T15:00',nova);

 // ---- arrastar e soltar (reunião mantém o horário) ----
 await p.dragAndDrop('.cm-item:has-text("Reunião de pais")',`.cm-dia[data-date="${D2}"]`);await p.waitForTimeout(900);
 const re=(await lista('calendario')).find(x=>x.id===reuniao.id);
 t('arrastar reagenda e mantém o horário',re.dataInicio===D2&&re.inicioEm===D2+'T19:00'&&re.fimEm===D2+'T20:00',re);
 await p.dragAndDrop('.cm-item:has-text("Gravação do vídeo")',`.cm-dia[data-date="${D3}"]`);await p.waitForTimeout(900);
 const gr=(await lista('agenda')).find(x=>/Gravação do vídeo/.test(x.titulo));t('compromisso da Agenda também é reagendado',String(gr.inicioEm).startsWith(D3)&&String(gr.inicioEm).endsWith('T14:00'),gr);
 await p.dragAndDrop('.cm-item:has-text("Post da feira")',`.cm-dia[data-date="${D3}"]`);await p.waitForTimeout(900);
 const po=(await lista('conteudos')).find(x=>x.id===post.id);t('publicação arrastada mantém o horário de postagem',po.publicacaoEm===D3+'T10:00',po);

 // ---- integração com Solicitações ----
 await p.click('.cm-item.t-PRAZO');await p.waitForSelector('#dForm');
 t('clicar no prazo abre a solicitação original',/Cartaz da feira/.test(await p.$eval('.sl-det',e=>e.innerText))&&(await p.inputValue('#dPrazo'))===D1);
 await p.fill('#dPrazo',D2);await p.click('#dSalvar');await p.waitForSelector('#dForm',{state:'detached'});await p.waitForTimeout(600);
 let s1=(await lista('solicitacoes')).find(x=>x.id===sol.id);
 t('alterar o prazo na solicitação sincroniza com o calendário (um só registro)',s1.prazo===D2&&(await lista('solicitacoes')).length===antes.sol+0&&await p.$(`.cm-dia[data-date="${D2}"] .cm-item.t-PRAZO`)!==null,s1);
 await p.dragAndDrop('.cm-item.t-PRAZO',`.cm-dia[data-date="${D3}"]`);await p.waitForTimeout(900);
 s1=(await lista('solicitacoes')).find(x=>x.id===sol.id);t('arrastar o prazo altera o prazo da própria solicitação',s1.prazo===D3&&!s1.prazoNegociado,s1);
 t('nenhuma cópia foi criada (calendário e solicitações com a mesma contagem)',(await lista('solicitacoes')).length===antes.sol);

 // ---- excluir com confirmação ----
 await p.click('.cm-item:has-text("Alinhamento sem hora")');await p.waitForSelector('#cmForm');
 p.removeAllListeners('dialog');p.once('dialog',d=>d.dismiss());await p.click('#fExcluir');await p.waitForTimeout(500);
 t('cancelar a confirmação não exclui',(await lista('calendario')).some(x=>x.titulo==='Alinhamento sem hora'));
 p.removeAllListeners('dialog');p.once('dialog',d=>d.accept());await p.click('#fExcluir');await p.waitForSelector('#cmForm',{state:'detached'});await p.waitForTimeout(500);
 t('confirmar exclui (vai para a Lixeira)',!(await lista('calendario')).some(x=>x.titulo==='Alinhamento sem hora')&&(await lista('lixeira')).some(x=>x.titulo==='Alinhamento sem hora'));
 p.on('dialog',d=>d.accept());
 t('eventos existentes foram preservados',(await lista('calendario')).some(x=>x.id===reuniao.id)&&(await lista('calendario')).some(x=>x.titulo==='Lembrete antigo'));

 // ---- permissões: quem não é responsável não arrasta o prazo ----
 const pm=await entra('MON-3303');await pm.evaluate(()=>go('calendario'));await pm.waitForSelector('.cm-mes');await pm.waitForFunction(()=>!document.querySelector('#cmRaiz .loading'));
 t('equipe vê o prazo, mas só arrasta o que é dela (a solicitação é de outra pessoa)',await pm.$eval('.cm-item.t-PRAZO',e=>!e.hasAttribute('draggable')));
 await pm.dragAndDrop('.cm-item.t-PRAZO',`.cm-dia[data-date="${D1}"]`).catch(()=>{});await pm.waitForTimeout(600);
 s1=(await lista('solicitacoes')).find(x=>x.id===sol.id);t('e o servidor também recusa (prazo intacto)',s1.prazo===D3,s1);

 // ---- celular ----
 const pc=await entra('NAT-3301',390,800);await pc.evaluate(()=>go('calendario'));await pc.waitForSelector('.cm-mes');await pc.waitForFunction(()=>!document.querySelector('#cmRaiz .loading'));
 t('celular: sem rolagem horizontal',await pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 t('celular: mostra pontos coloridos em vez de títulos no mês',await pc.$$eval('.cm-pontos',e=>e.some(x=>getComputedStyle(x).display!=='none'))&&await pc.$$eval('.cm-dia .cm-lista',e=>e.every(x=>getComputedStyle(x).display==='none')));
 await pc.click(`.cm-dia[data-date="${D3}"]`,{position:{x:6,y:40}});await pc.waitForSelector('.cm-diaVista');t('celular: tocar num dia com itens abre a lista do dia',/Cartaz da feira|Gravação|Post da feira/.test(await pc.$eval('.cm-diaVista',e=>e.innerText)));
 await pc.click('[data-modo="week"]');await pc.waitForSelector('.cm-semana');t('celular: semana empilhada sem estourar a tela',await pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 t('sem erros de JavaScript',errs.length===0,errs.join(' | '));
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
