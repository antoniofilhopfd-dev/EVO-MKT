// Calendário Escolar: cadastro com validação no servidor, vários dias, segmentos, duplicidade, permissões, separação do Marketing,
// pedido opcional ao Marketing (Solicitações), filtros/busca, visões e celular. Uso: node escolar.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,500))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const dia=n=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d)};
(async()=>{
 const senha={'NAT-3301':'Nat26ab','ANT-3302':'Ant26ab','MON-3303':'Mon26ab'};const H={};
 for(const c of Object.keys(senha)){let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});const ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:senha[c]})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:senha[c]})});H[c]={...J,Cookie:cookie(r)}}
 const G=H['NAT-3301'],E=H['ANT-3302'];
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const lista=async()=>(await call('GET','/escolar/painel'))[1].rows;
 let s,r;
 const base={titulo:'Feira de Ciências',dataInicio:dia(10),tipoEvento:'EVENTO',segmentos:['FUND1','FUND2']};

 // ---- segurança e permissões ----
 [s]=await call('GET','/escolar/painel',null,{...J});t('sem login o calendário escolar não abre (401)',s===401);
 [s]=await call('POST','/escolar/salvar',{titulo:'x'},E);t('a equipe tem acesso a cadastrar (dados inválidos dão 400, não 403)',s===400);
 [s]=await call('POST','/data?module=calescolar',base);t('o /data genérico não grava no calendário escolar (validação obrigatória)',s===400);
 [s]=await call('POST','/data?module=calescolar',base,E);t('nem a equipe pelo /data (403)',s===403);
 [s,r]=await call('GET','/escolar/painel',null,E);t('equipe consulta e também edita',s===200&&r.podeEditar===true&&r.opcoes.segmentos.length===7&&r.opcoes.tipos.length===10,r&&r.opcoes);
 t('não há nenhum evento fictício cadastrado de fábrica',r.rows.length===0);

 // ---- validação no servidor ----
 const ruim=async(n,o,re)=>{[s,r]=await call('POST','/escolar/salvar',{...base,...o});t(n,s===400&&(!re||re.test(r.error)),[s,r])};
 await ruim('título curto é recusado',{titulo:'ab'},/título/i);
 await ruim('data inexistente é recusada',{dataInicio:'2026-02-30'},/Data inválida/);
 await ruim('data final antes da inicial é recusada',{dataFim:dia(9)},/data final/i);
 await ruim('horário final sem inicial é recusado',{horaFim:'10:00'},/inicial/);
 await ruim('horário final antes do inicial (mesmo dia) é recusado',{horaInicio:'10:00',horaFim:'09:00'},/depois/);
 await ruim('hora inválida é recusada',{horaInicio:'25:00'},/inválido/);
 await ruim('segmento inválido é recusado',{segmentos:['XYZ']},/Segmento/);
 await ruim('tipo inválido é recusado',{tipoEvento:'FESTA'},/Tipo/);
 await ruim('duração absurda é recusada',{dataFim:dia(400)},/dias/);
 await ruim('descrição enorme é recusada',{descricao:'x'.repeat(1001)},/1000/);

 // ---- cadastro ----
 [s,r]=await call('POST','/escolar/salvar',{...base,horaInicio:'08:00',horaFim:'12:00',local:'Pátio central',descricao:'Stands das turmas'});const FEIRA=r;
 t('cria evento de um dia com horário, segmentos, local e descrição',s===201&&r.id&&r.segmentos==='FUND1|FUND2'&&r.dataFim===r.dataInicio&&r.local==='Pátio central',r);
 [s,r]=await call('POST','/escolar/salvar',{titulo:'Excursão ao museu',dataInicio:dia(20),dataFim:dia(22),tipoEvento:'PASSEIO',segmentos:'MEDIO'});const EXC=r;
 t('evento de vários dias (3 dias) e segmento único',s===201&&r.dataFim===dia(22)&&r.segmentos==='MEDIO'&&r.tipoEvento==='PASSEIO',r);
 [s,r]=await call('POST','/escolar/salvar',{titulo:'Reunião geral',dataInicio:dia(5),tipoEvento:'REUNIAO_PAIS',segmentos:['TODOS','MEDIO']});const REU=r;
 t('"Toda a escola" prevalece sobre os demais segmentos',s===201&&r.segmentos==='TODOS',r);
 [s,r]=await call('POST','/escolar/salvar',{titulo:'Prova bimestral',dataInicio:dia(7),tipoEvento:'PROVA',segmentos:[]});
 t('sem segmento escolhido vale "Toda a escola"',s===201&&r.segmentos==='TODOS',r);
 [s,r]=await call('POST','/escolar/salvar',base);t('evento duplicado (mesmo título, data e segmentos) é recusado (409)',s===409&&/já está cadastrado/.test(r.error),[s,r]);
 [s]=await call('POST','/escolar/salvar',{...base,segmentos:['INFANTIL']});t('mesmo título e data em outro segmento é permitido',s===201);
 [s,r]=await call('POST','/escolar/salvar',{...base,id:FEIRA.id,titulo:'Feira de Ciências 2026',horaInicio:'09:00',horaFim:'12:00',local:'Pátio central',descricao:'Stands das turmas'});
 t('edita mantendo o mesmo id',s===200&&r.id===FEIRA.id&&r.titulo==='Feira de Ciências 2026'&&r.horaInicio==='09:00',r);
 [s]=await call('POST','/escolar/salvar',{...base,id:'ESC-9999'});t('editar um id inexistente dá 404',s===404);

 // ---- reagendar ----
 [s,r]=await call('POST','/escolar/mover',{id:EXC.id,data:dia(30)});t('reagendar mantém a duração (3 dias)',s===200&&r.dataInicio===dia(30)&&r.dataFim===dia(32),r);
 [s]=await call('POST','/escolar/mover',{id:EXC.id,data:'2026-13-45'});t('reagendar com data inválida é recusado',s===400);
 [s]=await call('POST','/escolar/mover',{id:FEIRA.id,data:'data-ruim'},E);t('a equipe tem acesso a reagendar (data inválida dá 400, não 403)',s===400);

 // ---- separação do Marketing e persistência ----
 const cal=(await call('GET','/data?module=calendario'))[1].rows;
 t('os eventos escolares não entram no Calendário de Marketing',!cal.some(x=>/Feira de Ciências|Excursão/.test(x.titulo)));
 const ev1=await lista();const E2=await (async()=>{const x=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:'NAT-3301',senha:senha['NAT-3301']})});return {...J,Cookie:cookie(x)}})();
 t('os registros persistem (nova sessão enxerga os mesmos)',(await call('GET','/escolar/painel',null,E2))[1].rows.length===ev1.length&&ev1.length>=5);

 // ---- integração com Solicitações (opcional, nunca automática) ----
 const sols0=(await call('GET','/data?module=solicitacoes'))[1].rows.length;
 t('criar eventos não gerou nenhuma solicitação',sols0===0,sols0);
 [s]=await call('POST','/escolar/solicitar',{id:FEIRA.id,acao:'drone'},E);t('ação desconhecida é recusada',s===400);
 [s,r]=await call('POST','/escolar/solicitar',{id:FEIRA.id,acao:'cobertura_foto'},E);const SOL=r;
 t('a equipe cria "Cobertura fotográfica" a partir do evento, com referência ao evento',s===201&&/Cobertura fotográfica — Feira de Ciências 2026/.test(r.titulo)&&r.eventoEscolarId===FEIRA.id&&r.eventoEscolarAcao==='cobertura_foto'&&r.prazo===dia(10)&&r.origem==='INTERNO',r);
 t('a descrição leva o contexto do evento (data, local e público)',/Pátio central/.test(SOL.descricao)&&/Anos Iniciais|Anos Finais|Ensino Fundamental/.test(SOL.descricao)&&new RegExp(dia(10).split('-').reverse().join('/')).test(SOL.descricao),SOL.descricao);
 [s,r]=await call('POST','/escolar/solicitar',{id:FEIRA.id,acao:'cobertura_foto'});t('pedido repetido é recusado (409) citando o existente',s===409&&r.error.includes(SOL.id),r);
 [s,r]=await call('POST','/escolar/solicitar',{id:FEIRA.id,acao:'arte',observacao:'Usar a identidade do Colégio'});t('"Arte de divulgação" tem prazo com antecedência (7 dias antes)',s===201&&r.prazo===dia(3)&&/identidade/.test(r.descricao),r);
 [s,r]=await call('POST','/escolar/solicitar',{id:FEIRA.id,acao:'video',prazo:dia(9)});t('prazo informado prevalece',s===201&&r.prazo===dia(9));
 [s,r]=await call('POST','/escolar/solicitar',{id:EXC.id,acao:'video'});t('segmento do evento passa para a solicitação (Ensino Médio)',s===201&&r.segmento==='Ensino Médio',r);
 [s,r]=await call('POST','/escolar/solicitar',{id:REU.id,acao:'arte'});t('arte para evento próximo não fica com prazo no passado',s===201&&r.prazo>=new Date(Date.now()-3*3600e3).toISOString().slice(0,10),r);
 const pnl=(await call('GET','/escolar/painel'))[1].rows.find(x=>x.id===FEIRA.id);t('o evento lista as solicitações ligadas a ele',pnl.solicitacoes.length===3&&pnl.solicitacoes.every(x=>/^SOL-/.test(x.id)),pnl.solicitacoes);
 const sp=(await call('GET','/solicitacoes/painel'))[1].rows.find(x=>x.id===SOL.id);t('a solicitação aparece no módulo Solicitações como pendente, com a referência',sp&&sp.etapa==='PENDENTE'&&sp.eventoEscolarTitulo==='Feira de Ciências 2026',sp);

 // ---- excluir ----
 [s]=await call('POST','/escolar/excluir',{id:'ESC-9999'},E);t('equipe tem acesso a excluir (inexistente dá 404, não 403)',s===404);
 [s]=await call('POST','/escolar/excluir',{id:REU.id});const lix=(await call('GET','/data?module=lixeira'))[1].rows;
 t('a Gerência exclui (vai para a Lixeira) e some do calendário',s===200&&!(await lista()).some(x=>x.id===REU.id)&&lix.some(x=>x.titulo==='Reunião geral'));
 t('solicitações já criadas a partir de um evento continuam depois da exclusão dele',(await call('GET','/data?module=solicitacoes'))[1].rows.some(x=>x.id===SOL.id));

 // ============ INTERFACE ============
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const errs=[];
 const entra=async(cod,w=1440,h=1000)=>{const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());await p.goto(BASE+'/');await p.fill('#internalCode',cod);await p.fill('#internalPass',senha[cod]);await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem');await p.waitForFunction(()=>!document.querySelector('#content .loading'),null,{timeout:20000}).catch(()=>{});await p.waitForTimeout(800);return p};
 const p=await entra('NAT-3301');
 const mesVista=async(pg=p)=>{await pg.waitForFunction(()=>!document.querySelector('#cmRaiz .loading'));if(!(await pg.$('.cm-mes'))){await pg.click('[data-modo="month"]');await pg.waitForSelector('.cm-mes')}};
 const abre=async(pg=p)=>pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));
 const novoEsc=async(pg=p)=>{await pg.click('#cmNovo');await pg.waitForSelector('.cal-escolha');await pg.click('.cal-escolha [data-n="esc"]');await pg.waitForSelector('#escForm')};
 await p.evaluate(()=>go('agenda'));await p.waitForSelector('.cm-tipo');
 const sub=await p.$$eval('.cm-tipo:not(.cm-todos)',e=>e.map(x=>x.innerText.trim()));
 t('Calendário único: Escolar ao lado de Compromissos e Datas (sem subabas)',sub.some(x=>/Escolar/.test(x))&&sub.some(x=>/Compromissos/.test(x))&&sub.some(x=>/Datas/.test(x))&&(await p.$$('#subtabs .subtab')).length===0,sub.join('|'));
 await p.evaluate(()=>go('calescolar'));await p.waitForSelector('.cm-semana, .cm-mes');await mesVista();
 t('Calendário único aberto já filtrado em Escolar (um botão "+ Novo")',(await p.$$eval('.cm-tipo.off',e=>e.length))===7&&/Novo/.test(await p.$eval('#cmNovo',e=>e.textContent)));
 t('visões Semana, Mês, Dia, Lista e Ano',(await p.$$eval('[data-modo]',e=>e.map(x=>x.textContent))).join()==='Semana,Mês,Dia,Lista,Ano');
 // eventos de arrastar sintéticos: exercitam os mesmos tratadores (dragstart/dragover/drop) sem depender do gesto do mouse
 const soltar=(txt,data)=>p.evaluate(([txt,data])=>{const s=[...document.querySelectorAll('.cm-item')].find(x=>x.textContent.includes(txt)),d=document.querySelector(`.cm-dia[data-date="${data}"]`),dt=new DataTransfer();s.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));d.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));d.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));s.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}))},[txt,data]);
 const irA=async()=>{await p.fill('#cmIr',dia(10));await p.dispatchEvent('#cmIr','change');await p.waitForTimeout(250)};
 await irA();
 let txt=await p.$eval('#cmRaiz',e=>e.innerText);
 t('mostra os eventos cadastrados (e não os do Marketing)',/Feira de Ciências 2026/.test(txt)&&!/Reunião geral/.test(txt));
 // vários dias aparecem em cada dia do período
 await p.fill('#cmIr',dia(30));await p.dispatchEvent('#cmIr','change');await p.waitForTimeout(250);
 t('evento de vários dias aparece em cada dia do período (3 células)',(await p.$$eval('.cm-item:has-text("Excursão ao museu")',e=>e.length))>=3);
 await irA();
 // filtros
 await abre();await p.selectOption('#cmExtra3','MEDIO');await p.waitForTimeout(200);txt=await p.$eval('#cmRaiz',e=>e.innerText);
 t('filtro por segmento (Ensino Médio): tira o do Fundamental, mantém "Toda a escola"',!/Feira de Ciências/.test(txt)&&/Prova bimestral/.test(txt));
 await abre();await p.selectOption('#cmExtra3','');await p.waitForTimeout(150);
 await p.click('[data-tipo="ESCOLAR"]');await p.waitForTimeout(150);t('a categoria Escolar esconde os eventos escolares',!/Prova bimestral/.test(await p.$eval('#cmRaiz',e=>e.innerText)));await p.click('[data-tipo="ESCOLAR"]');await p.waitForTimeout(150);
 await p.fill('#cmBusca','feira');await p.waitForTimeout(250);txt=await p.$eval('#cmRaiz',e=>e.innerText);t('pesquisa pelo título',/Feira de Ciências/.test(txt)&&!/Prova bimestral/.test(txt));await p.fill('#cmBusca','');await p.waitForTimeout(250);
 // criar pelo botão e pelo dia
 await novoEsc();
 const campos=await p.$eval('#escForm',e=>e.innerText);t('formulário: Título, Data, Horários, Tipo, Segmentos, Local e Descrição',['Título','Data','Horário inicial','Horário final','Tipo de evento','Local','Segmentos','Descrição'].every(x=>campos.includes(x)),campos);
 t('"Toda a escola" já vem marcado',await p.isChecked('[data-seg="TODOS"]'));
 await p.fill('#eTitulo','Torneio de vôlei');await p.fill('#eData',dia(12));await p.fill('#eFim',dia(13));await p.selectOption('#eTipo','ESPORTIVA');await p.check('[data-seg="FUND2"]');
 t('marcar um segmento desmarca "Toda a escola"',!(await p.isChecked('[data-seg="TODOS"]')));
 await p.check('[data-seg="MEDIO"]');await p.fill('#eLocal','Ginásio');await p.click('#eSalvar');await p.waitForSelector('#escForm',{state:'detached'});
 const tor=(await lista()).find(x=>x.titulo==='Torneio de vôlei');
 t('criado pela tela, em dois dias e dois segmentos',tor&&tor.dataFim===dia(13)&&tor.segmentos==='FUND2|MEDIO'&&tor.local==='Ginásio',tor);
 await p.click(`.cm-num[data-novo="${dia(11)}"]`);await p.waitForSelector('.cal-escolha');await p.click('.cal-escolha [data-n="esc"]');await p.waitForSelector('#escForm');t('clicar no dia preenche a data',(await p.inputValue('#eData'))===dia(11));
 await p.fill('#eTitulo','ab');await p.click('#eSalvar');await p.waitForFunction(()=>document.querySelector('#eErro')?.textContent,null,{timeout:8000}).catch(()=>{});t('erros do servidor aparecem no formulário',/título/i.test(await p.textContent('#eErro')));await p.click('#escForm [data-close]');
 // duplicado na tela
 await novoEsc();await p.fill('#eTitulo','Torneio de vôlei');await p.fill('#eData',dia(12));await p.uncheck('[data-seg="TODOS"]').catch(()=>{});await p.check('[data-seg="FUND2"]');await p.check('[data-seg="MEDIO"]');await p.click('#eSalvar');await p.waitForFunction(()=>document.querySelector('#eErro')?.textContent,null,{timeout:8000}).catch(()=>{});
 t('evento repetido é barrado na tela',/já está cadastrado/.test(await p.textContent('#eErro')),await p.textContent('#eErro'));await p.click('#escForm [data-close]');
 // editar, reagendar por arrastar, excluir
 await p.click('.cm-item:has-text("Torneio de vôlei")');await p.waitForSelector('#escForm');t('abrir o evento mostra os dados',(await p.inputValue('#eTitulo'))==='Torneio de vôlei'&&(await p.inputValue('#eLocal'))==='Ginásio');
 await p.fill('#eTitulo','Torneio de vôlei (final)');await p.click('#eSalvar');await p.waitForSelector('#escForm',{state:'detached'});t('editar pela tela',(await lista()).some(x=>x.titulo==='Torneio de vôlei (final)'));await p.waitForSelector('.cm-item:has-text("Torneio de vôlei (final)")');await p.waitForTimeout(300);
 await soltar('Prova bimestral',dia(8));await p.waitForTimeout(1200);t('arrastar reagenda o evento',(await lista()).find(x=>x.titulo==='Prova bimestral').dataInicio===dia(8),[await p.textContent('#toast'),(await lista()).find(x=>x.titulo==='Prova bimestral').dataInicio,dia(8),dia(10)]);
 await p.click('.cm-item:has-text("Prova bimestral")');await p.waitForSelector('#eExcluir');
 p.removeAllListeners('dialog');p.once('dialog',d=>d.dismiss());await p.click('#eExcluir');await p.waitForTimeout(400);t('cancelar a confirmação não exclui',(await lista()).some(x=>x.titulo==='Prova bimestral'));
 p.removeAllListeners('dialog');p.once('dialog',d=>d.accept());await p.click('#eExcluir');await p.waitForSelector('#escForm',{state:'detached'});await p.waitForTimeout(400);t('confirmar exclui',!(await lista()).some(x=>x.titulo==='Prova bimestral'));p.on('dialog',d=>d.accept());
 // pedir ao marketing pela tela
 await p.click('.cm-item:has-text("Torneio de vôlei (final)")');await p.waitForSelector('[data-pedir="video"]');
 await p.click('[data-pedir="video"]');await p.waitForSelector('#escPed');await p.fill('#pObs','Gravar a final');await p.click('#pOk');await p.waitForSelector('#escPed',{state:'detached'});await p.waitForTimeout(500);
 const sv=(await call('GET','/data?module=solicitacoes'))[1].rows.find(x=>/Produção de vídeo — Torneio/.test(x.titulo));
 t('"Produção de vídeo" criada pela tela, ligada ao evento',sv&&sv.eventoEscolarId===tor.id&&/Gravar a final/.test(sv.descricao),sv);
 await p.click('.cm-item:has-text("Torneio de vôlei (final)")');await p.waitForSelector('[data-sol]');
 t('o evento mostra a solicitação criada e abre o registro original',/Torneio/.test(await p.$eval('.cm-vinc',e=>e.innerText)));
 await p.click('[data-sol]');await p.waitForSelector('#dForm');t('o link abre a solicitação original em Solicitações',/Torneio/.test(await p.$eval('.sl-det',e=>e.innerText))&&/Evento escolar/.test(await p.$eval('.sl-det',e=>e.innerText)));
 await p.evaluate(()=>document.querySelectorAll('.admin-overlay').forEach(x=>x.remove()));
 // semana e próximos
 await p.click('[data-modo="week"]');await p.waitForSelector('.cm-semana');const s0=await p.$eval('.cm-periodo',e=>e.textContent);await p.click('#cmNext');await p.waitForTimeout(200);t('navegação semanal',(await p.$eval('.cm-periodo',e=>e.textContent))!==s0);await p.click('#cmHoje');
 await p.click('[data-modo="list"]');await p.waitForSelector('.cm-proximos');const lt=await p.$eval('.cm-proximos',e=>e.innerText);
 t('lista de próximos eventos, em ordem de data',lt.indexOf('Feira de Ciências')>=0&&lt.indexOf('Feira de Ciências')<lt.indexOf('Excursão ao museu'),lt);
 await p.click('[data-modo="month"]');await p.waitForSelector('.cm-mes');

 // ---- equipe: só consulta e pede apoio ----
 const pe=await entra('MON-3303');await pe.evaluate(()=>go('calescolar'));await pe.waitForSelector('.cm-semana, .cm-mes');await mesVista(pe);
 await pe.click('#cmNovo');await pe.waitForSelector('.cal-escolha');t('equipe vê o calendário e não pode criar evento escolar',!(await pe.$('.cal-escolha [data-n="esc"]'))&&/Feira de Ciências/.test(await pe.$eval('#cmRaiz',e=>e.innerText)));await pe.click('.admin-box [data-close]');
 t('equipe não arrasta eventos',await pe.$eval('.cm-item',e=>!e.hasAttribute('draggable')));
 await pe.click('.cm-item:has-text("Feira de Ciências")');await pe.waitForSelector('#escForm');
 t('equipe vê os detalhes em modo leitura (sem Salvar/Excluir) e pode pedir apoio',await pe.$('#eSalvar')===null&&await pe.$('#eExcluir')===null&&await pe.$('[data-pedir="arte"]')!==null&&await pe.$eval('#eTitulo',e=>e.disabled));
 await pe.evaluate(()=>document.querySelectorAll('.admin-overlay').forEach(x=>x.remove()));

 // ---- celular ----
 const pc=await entra('NAT-3301',390,800);await pc.evaluate(()=>go('calescolar'));await pc.waitForSelector('.cm-semana, .cm-mes');await mesVista(pc);
 t('celular: sem rolagem horizontal (mês)',await pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await pc.click('[data-modo="list"]');await pc.waitForSelector('.cm-proximos');t('celular: lista de próximos eventos sem estourar a tela',await pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await pc.click('[data-modo="week"]');await pc.waitForSelector('.cm-semana');t('celular: semana sem estourar a tela',await pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await novoEsc(pc);t('celular: o formulário cabe na tela',await pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 t('sem erros de JavaScript',errs.length===0,errs.join(' | '));
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
