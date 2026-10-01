// Fluxos de ponta a ponta na interface: Portal ↔ Gerente (demanda, entrega, aprovação, avaliação),
// Minha Área (Recebi / Em execução / Transferir), Central de Aprovações, Lixeira/restauração, Equipe e visões.
// Uso: node ui2.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
const tx=(n,txt,re)=>{const c=re.test(txt);t(n,c);if(!c)console.log('     texto visto:',JSON.stringify(txt.slice(0,260)))};
let ok=0,bad=0;const t=(n,c)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n)};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const errs=[];const track=p=>{p.on('pageerror',e=>errs.push(e.message))};
 const newPage=async(w=1440,h=900)=>{const p=await (await b.newContext({viewport:{width:w,height:h},acceptDownloads:true})).newPage();track(p);return p};
 fs.writeFileSync('/tmp/evo-brief.pdf','%PDF-1.4 briefing de teste');fs.writeFileSync('/tmp/evo-final.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
 const login=async(p,code,pass,newPass)=>{p.removeAllListeners('dialog');p.on('dialog',d=>d.accept(newPass||''));await p.goto(BASE+'/');await p.fill('#internalCode',code);await p.fill('#internalPass',pass);await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem',{timeout:6000})};
 const G=await newPage();await login(G,'NAT-3301',pw('NAT-3301'),'SenhaForte2026x');
 const A=(p,path,opt)=>p.evaluate(([a,o])=>api(a,o),[path,opt||{}]);
 const post=async(p,mod,o)=>{const r=await A(p,'/data?module='+mod,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});await p.evaluate(m=>invalidate(m),mod);return r};
 const rows=async(p,mod)=>(await A(p,'/data?module='+mod)).rows;

 // ========== 1) PORTAL: nova demanda com anexo ==========
 const P=await newPage();P.on('dialog',d=>d.accept('PortalForte2026x'));
 await P.goto(BASE+'/solicitante.html');await P.fill('#code','FIN-2603');await P.fill('#pass',pw('FIN-2603'));await P.click('#login');await P.waitForSelector('.portal-shell',{timeout:6000});
 await P.click('[data-tab="new"]');await P.waitForSelector('#form');
 await P.fill('#form [name=solicitanteNome]','Coordenação Anos Finais');await P.fill('#form [name=titulo]','Banner Olimpíada de Matemática');
 await P.selectOption('#tipoSolicitacao','Post');await P.fill('#form [name=prazo]','2026-10-20');await P.fill('#form [name=objetivo]','Divulgar a olimpíada para as famílias');
 await P.setInputFiles('#form input[type=file]','/tmp/evo-brief.pdf');
 await P.click('#form button[type=submit]');await P.waitForTimeout(1200);
 let sol=(await rows(G,'solicitacoes')).find(r=>r.titulo==='Banner Olimpíada de Matemática');
 t('Portal: demanda criada pela tela (AGUARDANDO TRIAGEM)',sol&&sol.status==='AGUARDANDO TRIAGEM'&&sol.segmento==='Anos Finais');
 t('Portal: anexo enviado e vinculado',sol&&/ANEXOS\/SOLICITACOES\/.+brief/.test(sol.anexos||''));

 // ========== 2) GERENTE: triagem → distribui ==========
 await G.evaluate(()=>{invalidate('solicitacoes');go('solicitacoes')});await G.waitForSelector(`.executor-select[data-id="${sol.id}"]`);
 tx('Gerente vê a demanda na fila de triagem',await G.$eval('.request-manager-grid',e=>e.innerText),/Banner Olimp/i);
 await G.fill(`.executor-select[data-id="${sol.id}"]`,'Antônio Filho');await G.click(`.distribute[data-id="${sol.id}"]`);await G.waitForTimeout(900);
 sol=(await rows(G,'solicitacoes')).find(r=>r.id===sol.id);
 t('Gerente distribui: EM EXECUÇÃO com executor',sol.status==='EM EXECUÇÃO'&&sol.responsavel==='Antônio Filho'&&sol.triagemStatus==='DISTRIBUÍDA');

 // ========== 3) pede ajuste → solicitante responde ==========
 await G.evaluate(()=>go('solicitacoes'));await G.waitForSelector(`.req-adjust[data-id="${sol.id}"]`);
 G.removeAllListeners('dialog');G.once('dialog',d=>d.accept('Qual horário do evento?'));await G.click(`.req-adjust[data-id="${sol.id}"]`);await G.waitForTimeout(800);
 sol=(await rows(G,'solicitacoes')).find(r=>r.id===sol.id);t('Gerente devolve para ajuste',sol.triagemStatus==='DEVOLVIDA PARA AJUSTES');
 await P.click('[data-tab="list"]').catch(()=>{});await P.evaluate(()=>renderList());await P.waitForSelector('.send-reply',{timeout:5000});
 await P.fill(`#reply-${sol.id}`,'Sábado às 9h, no pátio.');await P.click(`.send-reply[data-id="${sol.id}"]`);await P.waitForTimeout(1000);
 sol=(await rows(G,'solicitacoes')).find(r=>r.id===sol.id);t('Solicitante responde: volta para triagem',sol.status==='EM ANÁLISE'&&/Sábado/.test(sol.respostaSolicitante));
 await A(G,'/data?module=solicitacoes&id='+sol.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'EM EXECUÇÃO',triagemStatus:'DISTRIBUÍDA'})});

 // ========== 4) entrega: arquivo final + envio para aprovação ==========
 await G.evaluate(()=>go('solicitacoes'));await G.waitForSelector(`.req-final-file[data-id="${sol.id}"]`);
 await G.click(`.req-final-file[data-id="${sol.id}"]`);await G.waitForSelector('#delFiles');await G.setInputFiles('#delFiles','/tmp/evo-final.png');await G.click('#delSend');await G.waitForTimeout(1200);
 sol=(await rows(G,'solicitacoes')).find(r=>r.id===sol.id);t('Entrega: arquivo final salvo em /ENTREGA/',/\/ENTREGA\/.+final/.test(sol.arquivosEntrega||''));
 await G.evaluate(()=>go('solicitacoes'));await G.waitForSelector(`.req-deliver[data-id="${sol.id}"]`);
 G.removeAllListeners('dialog');G.once('dialog',d=>d.accept('Arte pronta! Confira.'));await G.click(`.req-deliver[data-id="${sol.id}"]`);await G.waitForTimeout(800);
 sol=(await rows(G,'solicitacoes')).find(r=>r.id===sol.id);t('Entrega enviada para aprovação do solicitante',sol.status==='AGUARDANDO APROVAÇÃO DO SOLICITANTE');

 // ========== 5) solicitante vê o arquivo, aprova e avalia ==========
 await P.evaluate(()=>renderList());await P.waitForSelector('.approve-delivery',{timeout:5000});
 const href=await P.$eval('.delivery-files a',a=>a.href);const dl=await P.evaluate(async h=>{const r=await fetch(h,{headers:{'X-Portal-Token':session.token}});return r.status},href);
 t('Solicitante baixa o arquivo final (autenticado)',dl===200);
 P.removeAllListeners('dialog');P.on('dialog',d=>d.accept());await P.click('.approve-delivery');await P.waitForTimeout(1200);
 sol=(await rows(G,'solicitacoes')).find(r=>r.id===sol.id);t('Solicitante aprova: CONCLUÍDA',sol.status==='CONCLUÍDA'&&sol.aprovacaoSolicitante==='APROVADO');
 await P.evaluate(()=>renderList());await P.waitForSelector('.rate-delivery[data-note="5"]',{timeout:5000});await P.click('.rate-delivery[data-note="5"]');await P.waitForTimeout(900);
 sol=(await rows(G,'solicitacoes')).find(r=>r.id===sol.id);t('Solicitante avalia a entrega (5)',sol.avaliacaoNota==='5');

 // ========== 6) MINHA ÁREA (Equipe) ==========
 await post(G,'tarefas',{titulo:'Legendas do mês',responsavel:'Antônio Filho',status:'NOVO',prazo:'2026-10-05',segmento:'Infantil'});
 const T=await newPage();await login(T,'ANT-3302',pw('ANT-3302'),'EquipeForte2026x');
 await T.evaluate(()=>{invalidate('tarefas');go('minhaarea')});await T.waitForSelector('.acknowledge-work',{timeout:5000});
 tx('Minha Área lista o trabalho atribuído',await T.$eval('#content',e=>e.innerText),/Legendas do m/i);
 await T.click('.acknowledge-work');await T.waitForTimeout(900);
 let tar=(await rows(G,'tarefas')).find(r=>r.titulo==='Legendas do mês');t('“Recebi” registra quem recebeu',/Antônio/.test(tar.recebidoPor||''));
 await T.evaluate(()=>go('minhaarea'));await T.waitForSelector('.start-work');await T.click('.start-work');await T.waitForTimeout(900);
 tar=(await rows(G,'tarefas')).find(r=>r.titulo==='Legendas do mês');t('“Em execução por mim” muda o status',tar.status==='EM ANDAMENTO');
 await T.evaluate(()=>go('minhaarea'));await T.waitForSelector('.transfer-work');
 T.removeAllListeners('dialog');T.on('dialog',d=>d.accept(d.type()==='prompt'?'Monique Vilante':undefined));await T.click('.transfer-work');await T.waitForTimeout(1200);
 tar=(await rows(G,'tarefas')).find(r=>r.titulo==='Legendas do mês');t('Transferir passa a tarefa à colega',tar.responsavel==='Monique Vilante');
 await T.evaluate(()=>go('tarefas'));await T.waitForSelector('.kanban-board');t('Equipe vê Tarefas em quadro por padrão',true);

 // ========== 7) CENTRAL DE APROVAÇÕES ==========
 await post(G,'tarefas',{titulo:'Arte para aprovar',responsavel:'Monique Vilante',status:'REVISÃO',fluxoEtapa:'Revisão',aprovacaoInternaStatus:'AGUARDANDO',aprovacaoInternaEtapa:'APROVAÇÃO',aprovacaoInternaAprovador:'Natália Mello',aprovacaoInternaSolicitadaEm:new Date().toISOString(),aprovacaoVersao:'1'});
 await G.evaluate(()=>go('aprovacoes'));await G.waitForSelector('.approve-internal',{timeout:6000});
 tx('Gerente vê o item na fila de aprovação',await G.$eval('.approval-pro-queue',e=>e.innerText),/Arte para aprovar/);
 G.removeAllListeners('dialog');G.on('dialog',d=>d.accept(d.type()==='prompt'?'Aprovado, pode publicar.':undefined));await G.click('.approve-internal');await G.waitForTimeout(1200);
 tar=(await rows(G,'tarefas')).find(r=>r.titulo==='Arte para aprovar');t('Aprovar registra a decisão',tar.aprovacaoInternaStatus!=='AGUARDANDO');
 await post(G,'tarefas',{titulo:'Arte para reprovar',responsavel:'Monique Vilante',status:'REVISÃO',fluxoEtapa:'Revisão',aprovacaoInternaStatus:'AGUARDANDO',aprovacaoInternaEtapa:'APROVAÇÃO',aprovacaoInternaAprovador:'Natália Mello',aprovacaoInternaSolicitadaEm:new Date().toISOString(),aprovacaoVersao:'1'});
 await G.evaluate(()=>go('aprovacoes'));await G.waitForSelector('.reject-internal',{timeout:6000});await G.click('.reject-internal');await G.waitForTimeout(1200);
 tar=(await rows(G,'tarefas')).find(r=>r.titulo==='Arte para reprovar');t('Reprovar devolve o item (motivo obrigatório respondido)',tar.aprovacaoInternaStatus!=='AGUARDANDO');

 // ========== 8) LIXEIRA ==========
 await G.evaluate(()=>{setPref('view.tarefas','table');go('tarefas')});await G.waitForSelector('.delete-row');
 const alvo=(await rows(G,'tarefas')).find(r=>r.titulo==='Arte para aprovar');
 G.removeAllListeners('dialog');G.on('dialog',d=>d.accept());await G.click(`.delete-row[data-id="${alvo.id}"]`);await G.waitForTimeout(1000);
 t('Excluir pela tela move para a Lixeira',!(await rows(G,'tarefas')).some(r=>r.id===alvo.id)&&(await rows(G,'lixeira')).some(r=>r.idOriginal===alvo.id));
 await G.evaluate(()=>go('lixeira'));await G.waitForSelector('.restore-row');await G.click('.restore-row');await G.waitForTimeout(1200);
 const back=(await rows(G,'tarefas')).find(r=>r.titulo==='Arte para aprovar');t('Restaurar recria o item (ID novo, nunca reutilizado)',back&&back.id!==alvo.id);

 // ========== 9) EQUIPE, VISÕES E MODAIS ==========
 await G.evaluate(()=>go('equipe'));await G.waitForTimeout(700);const eq=await G.$eval('#content',e=>e.innerText);
 tx('Equipe mostra capacidade (sem “não definida”)',eq,/^(?![\s\S]*Capacidade não definida)[\s\S]*40/);
 await post(G,'eventos',{titulo:'Sarau literário',status:'PRÉ-EVENTO',dataInicio:'2026-10-12',responsavel:'Aluizo Junior',segmento:'Ensino Médio'});
 await G.evaluate(()=>{setPref('view.eventos','timeline');go('eventos')});await G.waitForSelector('.tl-card');tx('Eventos: linha do tempo',await G.$eval('.tl-wrap',e=>e.innerText),/Sarau liter/);
 await post(G,'campanhas',{titulo:'Vestibular 2027',status:'ATIVA',dataInicio:'2026-09-20',prazo:'2026-11-20',objetivo:'Preparar alunos',orcamento:'3000'});
 await G.evaluate(()=>{setPref('view.campanhas','cards');go('campanhas')});await G.waitForSelector('.camp-card');tx('Campanhas: cartões',await G.$eval('.camp-grid',e=>e.innerText),/Vestibular 2027/);
 await G.click('.camp-card .edit-row');await G.waitForSelector('#modal:not(.hidden)');
 const cut=await G.evaluate(()=>{const c=document.querySelector('.modalcard').getBoundingClientRect();return c.top<-1||c.bottom>innerHeight+1});t('Modal de edição cabe na janela',!cut);await G.click('#cancelModal');

 // ========== 10) Esqueci minha senha (tela) ==========
 const L=await newPage();L.on('dialog',d=>d.accept('EDU-3305'));await L.goto(BASE+'/');await L.click('#forgotLink');await L.waitForTimeout(900);
 tx('“Esqueci minha senha” responde sem revelar a conta',await L.$eval('#internalLoginError',e=>e.innerText),/Se o c/);
 await G.evaluate(()=>{adminTab='acessos'});await G.evaluate(()=>go('administracao'));await G.waitForSelector('[data-reset]');
 tx('Administração marca “pediu nova senha”',await G.$eval('#adminBody',e=>e.innerText),/pediu nova senha/i);
 console.log('erros JS:',errs.length?errs:'nenhum');t('nenhum erro de JavaScript durante os fluxos',errs.length===0);
 console.log(`\n${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0)})().catch(e=>{console.log('ERRO',e.message.split('\n')[0]);process.exit(1)});
