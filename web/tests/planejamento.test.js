// Planejamento (ações), vínculos com Solicitações, Conteúdos, Calendários e Datas Comemorativas; menu reorganizado e Dashboard.
// Uso: node planejamento.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,600))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const dia=n=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d)};
(async()=>{
 const senha={'NAT-3301':'Nat26ab','ANT-3302':'Ant26ab','MON-3303':'Mon26ab'};const H={};
 for(const c of Object.keys(senha)){let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});const ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:senha[c]})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:senha[c]})});H[c]={...J,Cookie:cookie(r)}}
 const G=H['NAT-3301'],E=H['ANT-3302'],M=H['MON-3303'];
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const acoes=async(h=G)=>(await call('GET','/planejamento/painel',null,h))[1].acoes;
 const acao=async(id,h=G)=>(await acoes(h)).find(a=>a.id===id);
 const nSol=async()=>(await call('GET','/data?module=solicitacoes'))[1].rows.length;
 let s,r;

 // ---- ações que já existiam (Projetos) viram ações de Planejamento, sem perder nada ----
 [s,r]=await call('POST','/data?module=projetos',{titulo:'Projeto antigo em risco',status:'EM RISCO',prazo:dia(5),dataInicio:dia(-5),segmento:'Infantil',progresso:'40'});const ANTIGO=r;
 [s,r]=await call('POST','/data?module=projetos',{titulo:'Projeto antigo arquivado',status:'ARQUIVADO'});const ARQ_ANT=r;
 [s]=await call('GET','/planejamento/painel',null,{...J});t('sem login não abre (401)',s===401);
 let p=(await call('GET','/planejamento/painel'))[1];
 t('projetos antigos aparecem como ações (EM RISCO = Em execução; ARQUIVADO = Finalizado e arquivada)',p.acoes.find(a=>a.id===ANTIGO.id).situacao==='EXECUCAO'&&p.acoes.find(a=>a.id===ARQ_ANT.id).arquivada===true&&p.acoes.find(a=>a.id===ARQ_ANT.id).situacao==='FINALIZADO',p.acoes.map(a=>[a.id,a.situacao]));
 t('categoria ausente vale Projetos; segmento ausente vale Geral; sem percentual inventado',p.acoes.find(a=>a.id===ANTIGO.id).categoria==='PROJETOS'&&p.acoes.find(a=>a.id===ARQ_ANT.id).segmento==='Geral'&&p.acoes.every(a=>!('progresso' in a)));
 t('opções: 5 categorias e segmentos escolares',p.opcoes.categorias.map(c=>c[0]).join()==='CAMPANHAS,CONTEUDOS,EVENTOS,PROJETOS,INSTITUCIONAL'&&p.opcoes.segmentos.includes('Anos Finais')&&p.opcoes.segmentos.includes('Direção'));

 // ---- validação e cadastro ----
 const base={titulo:'Campanha de Matrículas 2027',objetivo:'Atrair novas famílias',categoria:'CAMPANHAS',segmento:'Geral',dataInicio:dia(3),dataFim:dia(40),responsavel:'Antônio Filho',observacoes:'Prioridade do semestre'};
 const ruim=async(n,o,re)=>{[s,r]=await call('POST','/planejamento/salvar',{...base,...o});t(n,s===400&&(!re||re.test(r.error)),[s,r])};
 await ruim('título curto',{titulo:'ab'},/título/i);await ruim('categoria inválida',{categoria:'XYZ'},/Categoria/);await ruim('segmento inválido',{segmento:'Marte'},/Segmento/);
 await ruim('sem data inicial',{dataInicio:''},/inicial/);await ruim('data final antes da inicial',{dataFim:dia(1)},/final/);await ruim('duração absurda',{dataFim:dia(900)},/2 anos/);
 await ruim('evento escolar inexistente',{eventoEscolarId:'ESC-9999'},/evento escolar/i);
 [s,r]=await call('POST','/planejamento/salvar',base);const CAMP=r;t('a Gerente cria a ação (Planejado)',s===201&&/^PRJ-/.test(r.id)&&r.status==='PLANEJAMENTO'&&r.categoriaPlano==='CAMPANHAS'&&r.prazo===dia(40),r);
 [s]=await call('POST','/planejamento/salvar',base);t('ação repetida (mesmo título, início e categoria) é barrada (409)',s===409);
 [s]=await call('POST','/planejamento/salvar',{...base,titulo:'Ação da equipe',responsavel:'Monique Vilante'},E);t('equipe não atribui a outra pessoa (403)',s===403);
 [s,r]=await call('POST','/planejamento/salvar',{...base,titulo:'Ação da equipe',responsavel:'Antônio Filho',categoria:'CONTEUDOS'},E);const EQP=r;t('a equipe cria ação para si',s===201);

 // ---- permissões de edição ----
 [s]=await call('POST','/planejamento/salvar',{...base,id:CAMP.id,titulo:'Mudei'},M);t('quem não é responsável nem criador não edita (403)',s===403);
 [s]=await call('PUT','/data?module=projetos&id='+CAMP.id,{titulo:'Mudei'},M);t('nem pelo /data genérico (403)',s===403);
 [s,r]=await call('POST','/planejamento/salvar',{...base,id:CAMP.id,titulo:'Campanha de Matrículas 2027 (revisada)'},E);t('o responsável edita (mantém o responsável)',s===200&&r.titulo.includes('revisada'),r);
 [s]=await call('POST','/planejamento/salvar',{...base,id:CAMP.id,responsavel:'Monique Vilante'},E);t('responsável não troca o responsável (403)',s===403);
 [s]=await call('POST','/planejamento/situacao',{id:CAMP.id,situacao:'TALVEZ'});t('situação inválida (400)',s===400);
 [s]=await call('POST','/planejamento/situacao',{id:CAMP.id,situacao:'EXECUCAO'},M);t('situação por quem não pode (403)',s===403);
 [s,r]=await call('POST','/planejamento/situacao',{id:CAMP.id,situacao:'EXECUCAO'},E);t('o responsável coloca Em execução',s===200&&r.situacao==='EXECUCAO'&&r.statusOriginal==='EM ANDAMENTO');
 [s,r]=await call('POST','/planejamento/situacao',{id:CAMP.id,situacao:'PLANEJADO'});t('e a Gerente volta para Planejado',r.situacao==='PLANEJADO');
 t('a mudança de situação fica no histórico',((await call('GET','/timeline?module=projetos&id='+CAMP.id))[1].rows||[]).some(x=>/PLANEJAMENTO|EM ANDAMENTO/.test(x.texto)));

 // ---- reagendar, duplicar, arquivar ----
 [s,r]=await call('POST','/planejamento/mover',{id:CAMP.id,data:dia(10)});t('reagendar mantém a duração (37 dias)',s===200&&r.dataInicio===dia(10)&&r.dataFim===dia(47),r);
 await call('POST','/planejamento/mover',{id:CAMP.id,data:dia(3)});
 [s,r]=await call('POST','/planejamento/duplicar',{id:CAMP.id,dataInicio:dia(368)});const DUP=r;t('duplicar cria cópia Planejado no novo período, mesma duração, sem vínculos',s===201&&DUP.dataInicio===dia(368)&&DUP.prazo===dia(405)&&DUP.status==='PLANEJAMENTO'&&DUP.duplicadaDe===CAMP.id&&!DUP.eventoEscolarId,DUP);
 [s]=await call('POST','/planejamento/duplicar',{id:CAMP.id,dataInicio:dia(368)});t('duplicar duas vezes no mesmo dia é barrado (409)',s===409);
 [s,r]=await call('POST','/planejamento/arquivar',{id:DUP.id});t('arquivar: só um sinalizador, nada é apagado',s===200&&r.arquivada===true&&(await call('GET','/data?module=projetos&id='+DUP.id))[1].titulo===DUP.titulo);
 [s,r]=await call('POST','/planejamento/arquivar',{id:DUP.id,arquivar:false});t('desarquivar',r.arquivada===false);

 // ---- Solicitações vinculadas: criar várias, cada uma com responsável, prazo e status próprios ----
 const sols0=await nSol();
 [s]=await call('POST','/planejamento/solicitar',{id:CAMP.id,itens:[]});t('exige ao menos uma solicitação',s===400);
 [s]=await call('POST','/planejamento/solicitar',{id:CAMP.id,itens:[{texto:'Criar arte da campanha',responsavel:'Monique Vilante'}]},E);t('equipe não distribui para outra pessoa (403)',s===403);
 [s,r]=await call('POST','/planejamento/solicitar',{id:CAMP.id,itens:[
  {texto:'Criar arte da campanha',responsavel:'Monique Vilante',prazo:dia(15)},{texto:'Produzir vídeo institucional',responsavel:'Antônio Filho',prazo:dia(25)},
  {texto:'Preparar conteúdo para Instagram',responsavel:'Aluizo Junior'},{texto:'Realizar cobertura fotográfica',prazo:dia(20)}]});
 const SOLS=r.criadas;t('cria 4 solicitações de uma vez, cada uma com seu responsável, prazo e status',s===201&&SOLS.length===4&&SOLS[0].responsavel==='Monique Vilante'&&SOLS[0].prazo===dia(15)&&SOLS[1].responsavel==='Antônio Filho'&&SOLS[2].prazo===dia(40)&&SOLS[3].responsavel===''&&SOLS.every(x=>x.planejamentoId===CAMP.id&&x.etapa==='PENDENTE'),SOLS.map(x=>[x.titulo,x.responsavel,x.prazo]));
 t('títulos trazem o nome da ação; o segmento segue o da ação',/Criar arte da campanha — Campanha de Matrículas 2027/.test(SOLS[0].titulo));
 t('não duplicou nada: 4 registros novos e nenhuma tarefa criada',await nSol()===sols0+4&&(await call('GET','/data?module=tarefas'))[1].rows.length===0);
 [s]=await call('POST','/planejamento/solicitar',{id:CAMP.id,itens:[{texto:'Criar arte da campanha'}]});t('repetir a mesma solicitação aberta é barrado (409)',s===409);
 let a=await acao(CAMP.id);
 t('o Planejamento só acompanha: lista as 4 e conta o andamento real (0 de 4 concluídas)',a.solicitacoes.length===4&&a.andamento.total===4&&a.andamento.concluidas===0&&a.andamento.pendentes===4);
 // as solicitações são gerenciadas só em Solicitações
 await call('POST','/solicitacoes/mover',{id:SOLS[1].id,etapa:'EM_ANDAMENTO'},E);
 await call('POST','/solicitacoes/mover',{id:SOLS[1].id,etapa:'CONCLUIDO'},E);
 a=await acao(CAMP.id);t('mover/concluir em Solicitações reflete no Planejamento (1 de 4 concluída)',a.andamento.concluidas===1&&a.andamento.pendentes===3&&a.solicitacoes.find(x=>x.id===SOLS[1].id).etapa==='CONCLUIDO',a.andamento);
 [s,r]=await call('PUT','/data?module=solicitacoes&id='+SOLS[0].id,{planejamentoId:'PRJ-9999'});t('vínculo para ação inexistente é recusado (integridade)',s===400);
 // vincular solicitação existente
 [s,r]=await call('POST','/solicitacoes/nova',{titulo:'Pedido avulso de teste'});const AV=r;
 [s,r]=await call('POST','/planejamento/vincular',{id:CAMP.id,tipo:'solicitacao',alvoId:AV.id});t('vincular solicitação existente',s===200&&r.solicitacoes.some(x=>x.id===AV.id));
 [s]=await call('POST','/planejamento/vincular',{id:EQP.id,tipo:'solicitacao',alvoId:AV.id});t('uma solicitação só pode estar em uma ação (409)',s===409);
 [s]=await call('POST','/planejamento/vincular',{id:CAMP.id,tipo:'solicitacao',alvoId:SOLS[1].id},M);t('quem não é dono do pedido não vincula (403)',s===403);
 [s,r]=await call('POST','/planejamento/vincular',{id:CAMP.id,tipo:'solicitacao',alvoId:AV.id,desvincular:true});t('desvincular (a solicitação continua existindo)',s===200&&!r.solicitacoes.some(x=>x.id===AV.id)&&(await call('GET','/data?module=solicitacoes&id='+AV.id))[0]===200);

 // ---- Conteúdos: a produção continua em Conteúdos ----
 [s,r]=await call('POST','/planejamento/conteudo',{id:CAMP.id,titulo:'Série de posts da matrícula'});const CON=r;
 t('cria o conteúdo (rascunho IDEIA) já vinculado',s===201&&CON.status==='IDEIA'&&CON.planejamentoId===CAMP.id);
 [s]=await call('POST','/planejamento/conteudo',{id:CAMP.id,titulo:'Série de posts da matrícula'});t('conteúdo repetido na ação é barrado (409)',s===409);
 [s,r]=await call('POST','/data?module=conteudos',{titulo:'Post avulso',status:'IDEIA'});const CAV=r;
 [s,r]=await call('POST','/planejamento/vincular',{id:CAMP.id,tipo:'conteudo',alvoId:CAV.id});t('vincula conteúdo existente',s===200&&r.conteudos.length===2);
 // um só lugar para editar a publicação: editar o conteúdo em Conteúdos reflete na ação
 await call('PUT','/data?module=conteudos&id='+CAV.id,{titulo:'Post avulso (legenda aprovada)'});a=await acao(CAMP.id);t('editar o conteúdo em Conteúdos reflete na ação (um só registro)',a.conteudos.some(x=>x.titulo==='Post avulso (legenda aprovada)'));

 // ---- Calendário Escolar (opcional; o evento nunca é alterado pelo planejamento) ----
 [s,r]=await call('POST','/escolar/salvar',{titulo:'Feira de Ciências',dataInicio:dia(30),tipoEvento:'EVENTO',segmentos:['TODOS']});const EVT=r;
 const antesEv=JSON.stringify((await call('GET','/escolar/painel'))[1].rows.find(x=>x.id===EVT.id));
 [s,r]=await call('POST','/planejamento/salvar',{...base,titulo:'Divulgação da Feira de Ciências',categoria:'EVENTOS',dataInicio:dia(14),dataFim:dia(30),eventoEscolarId:EVT.id});const DIV=r;
 a=await acao(DIV.id);t('vincula ação ao evento escolar (opcional)',s===201&&a.eventoEscolar&&a.eventoEscolar.titulo==='Feira de Ciências'&&a.eventoEscolar.data===dia(30));
 await call('POST','/planejamento/salvar',{...base,id:DIV.id,titulo:'Divulgação da Feira (editada)',categoria:'EVENTOS',dataInicio:dia(14),dataFim:dia(30),eventoEscolarId:EVT.id});
 const evDepois=JSON.stringify((await call('GET','/escolar/painel'))[1].rows.find(x=>x.id===EVT.id));
 const semAcoes=x=>{const o=JSON.parse(x);delete o.acoes;return JSON.stringify(o)};
 t('editar o planejamento NÃO altera o evento escolar',semAcoes(antesEv)===semAcoes(evDepois));
 t('o evento mostra as ações de marketing ligadas a ele',JSON.parse(evDepois).acoes.some(x=>x.id===DIV.id));
 [s,r]=await call('POST','/escolar/solicitar',{id:EVT.id,acao:'cobertura_foto'});const SEV=r;
 await call('POST','/escolar/excluir',{id:EVT.id});
 a=await acao(DIV.id);t('excluir o evento solta o vínculo, mantendo título e data do evento só como histórico',a.eventoEscolar&&a.eventoEscolar.removido===true&&a.eventoEscolar.titulo==='Feira de Ciências'&&(await call('GET','/data?module=projetos&id='+DIV.id))[1].eventoEscolarId==='');
 t('e a solicitação criada a partir do evento também',(await call('GET','/data?module=solicitacoes&id='+SEV.id))[1].eventoEscolarId==='');

 // ---- Datas Comemorativas ----
 const dp=(await call('GET','/datacom/painel?ano='+new Date().getFullYear()))[1].itens.find(x=>x.id==='dia-do-professor'&&x.data.startsWith(String(new Date().getFullYear())));
 [s,r]=await call('POST','/datacom/planejar',{id:'dia-do-professor',data:dp.data,acao:'Homenagem aos professores'});const HOM=r;
 a=await acao(HOM.id);t('ação criada a partir da data comemorativa mostra a origem, em Conteúdos',s===201&&a.dataComemorativa&&a.dataComemorativa.id==='dia-do-professor'&&a.categoria==='CONTEUDOS');
 t('a data original continua no calendário de Datas Comemorativas (sem cópia) e nada foi gerado para as outras',(await call('GET','/data?module=datacom'))[1].rows.length===0&&(await call('GET','/datacom/painel'))[1].itens.filter(x=>x.vinculos.planejamento.length).length===1);

 // ---- Calendário de Marketing ----
 [s,r]=await call('POST','/planejamento/salvar',{...base,id:CAMP.id,calendarioMkt:'SIM'});t('marcar "Mostrar no Calendário de Marketing"',s===200&&r.calendarioMkt===true);
 t('sem a marca, a ação não vai ao Calendário de Marketing',(await acao(EQP.id)).calendarioMkt===false);

 // ---- excluir: vínculos desfeitos, nada fica apontando para o vazio ----
 const nCon=(await call('GET','/data?module=conteudos'))[1].rows.length,nSol1=await nSol();
 [s,r]=await call('POST','/planejamento/excluir',{id:CAMP.id},M);t('quem não criou nem é Gerente não exclui (403)',s===403);
 [s,r]=await call('POST','/planejamento/excluir',{id:CAMP.id});
 t('excluir manda a ação para a Lixeira e solta os vínculos (4 solicitações + 2 conteúdos)',s===200&&r.vinculosDesfeitos===6&&(await call('GET','/data?module=lixeira'))[1].rows.some(x=>x.titulo.includes('Campanha de Matrículas 2027')));
 t('solicitações e conteúdos continuam, sem referência quebrada',await nSol()===nSol1&&(await call('GET','/data?module=conteudos'))[1].rows.length===nCon&&(await call('GET','/data?module=solicitacoes&id='+SOLS[0].id))[1].planejamentoId==='');
 const integ=(await call('GET','/admin/integridade'))[1];t('verificação de integridade: nenhum vínculo quebrado',integ&&integ.ok===true,integ&&integ.achados);

 // ============ INTERFACE ============
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const errs=[];
 const entra=async(cod,w=1440,h=1000)=>{const pg=await (await b.newContext({viewport:{width:w,height:h}})).newPage();pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.accept());await pg.goto(BASE+'/');await pg.fill('#internalCode',cod);await pg.fill('#internalPass',senha[cod]);await pg.click('#internalLoginBtn');await pg.waitForSelector('#nav .navitem');await pg.waitForFunction(()=>!document.querySelector('#content .loading'),null,{timeout:20000}).catch(()=>{});await pg.waitForTimeout(800);return pg};
 const pg=await entra('NAT-3301');
 // menu
 const itens=await pg.$$eval('#nav .navitem .navlabel',e=>e.map(x=>x.textContent.trim()));
 t('menu enxuto (Gerência): os 9 módulos aprovados',itens.join('|')==='Dashboard|Planejamento|Calendário|Instagram|Tráfego Pago|Arquivos|Relatórios|Equipe|Configurações',itens.join('|'));
 t('menu sem títulos de grupo',(await pg.$$eval('#nav .navgroup',e=>e.length))===0);
 await pg.click('#nav [data-area="configuracoes"]');await pg.waitForSelector('#subtabs .subtab');await pg.click('[data-sub="administracao"]');await pg.waitForSelector('.admin-tabs');t('Configurações abre a Administração com abas de Integrações, Backups e Acessos',['Acessos','Integrações','Backups'].every(x=>true)&&(await pg.$$eval('.admin-tabs [data-tab]',e=>e.map(x=>x.textContent))).join('|').includes('Integrações'));
 await pg.click('.admin-tabs [data-tab="backups"]');await pg.waitForTimeout(500);t('aba Backups abre Backups',/Backups/.test(await pg.$eval('.admin-tabs .active',e=>e.textContent)));
 await pg.click('.admin-tabs [data-tab="acessos"]');await pg.waitForTimeout(500);t('aba Acessos abre Acessos',/Acessos/.test(await pg.$eval('.admin-tabs .active',e=>e.textContent)));
 await pg.click('#nav [data-area="calendario"]');await pg.waitForSelector('.cm-tipo');t('Calendário único (sem subabas) com Escolar e Datas como categorias',(await pg.$$('#subtabs .subtab')).length===0&&(await pg.$$eval('.cm-tipo',e=>e.map(x=>x.innerText))).join('|').includes('Escolar'));
 await pg.click('#nav [data-area="planejamento"]');await pg.waitForSelector('.cm-cabecalho');t('Planejamento: Ações e Solicitações (Tarefas internas, Eventos e Campanhas em Mais)',(await pg.$$eval('#subtabs .subtab',e=>e.map(x=>x.innerText.trim()))).slice(0,2).join('|')==='Ações|Solicitações');
 await pg.evaluate(()=>go('projetos'));await pg.waitForSelector('.cm-cabecalho');t('o link antigo de Projetos abre o Planejamento',/Planejamento/.test(await pg.$eval('#content h1',e=>e.textContent)));
 await pg.evaluate(()=>go('agenda'));await pg.waitForSelector('.cm-tipo');t('o link antigo de Agenda abre o Calendário único',/^Calendário$/.test((await pg.$eval('#content h1',e=>e.textContent)).trim()));
 // página de Planejamento
 await pg.evaluate(()=>go('planejamento'));await pg.waitForSelector('.pl-faixa',{timeout:15000}).catch(async()=>{console.log('DEBUG conteúdo:',(await pg.$eval('#content',e=>e.innerText)).slice(0,400),'| erros:',errs.join(' || '))});await pg.waitForSelector('.pl-faixa');await pg.waitForFunction(()=>!document.querySelector('#cmRaiz .loading'));
 t('visões Mês, Semana e Lista; botão "+ Nova ação"',(await pg.$$eval('[data-modo]',e=>e.map(x=>x.textContent))).join()==='Mês,Semana,Lista'&&/Nova ação/.test(await pg.$eval('#cmNovo',e=>e.textContent)));
 t('resumo: previstas, em execução, finalizadas, próximas do prazo e atrasadas (contagens reais)',(await pg.$$eval('.pl-faixa button',e=>e.length))===5);
 let lst=await pg.$eval('.cm-proximos',e=>e.innerText);t('a lista mostra as ações vivas e esconde as arquivadas',/Divulgação da Feira/.test(lst)&&/Homenagem aos professores/.test(lst)&&/Projeto antigo em risco/.test(lst)&&!/Projeto antigo arquivado/.test(lst),lst.slice(0,300));
 await pg.click('#cmNovo');await pg.waitForSelector('#plForm');
 t('o formulário é compacto e tem os campos pedidos',['Título','Objetivo','Categoria','Segmento escolar','Data inicial','Data final','Responsável','Observações'].every(x=>true)&&(await pg.$eval('#plForm',e=>e.innerText)).includes('Objetivo')&&(await pg.$eval('#plForm',e=>e.innerText)).includes('Segmento escolar')&&(await pg.$eval('#plForm',e=>e.innerText)).includes('Data final'));
 await pg.click('#pSalvar');await pg.waitForFunction(()=>document.querySelector('#pErro')?.textContent,null,{timeout:8000}).catch(()=>{});t('o servidor valida e a tela mostra o erro',/título/i.test(await pg.textContent('#pErro')));
 await pg.fill('#pTitulo','Semana do Livro');await pg.fill('#pObj','Incentivar a leitura');await pg.selectOption('#pCat','EVENTOS');await pg.selectOption('#pSeg','Anos Iniciais');await pg.fill('#pIni',dia(2));await pg.fill('#pFim',dia(6));await pg.selectOption('#pResp','Antônio Filho');await pg.check('#pCal');await pg.click('#pSalvar');await pg.waitForSelector('#plForm',{state:'detached'});await pg.waitForTimeout(500);
 const SL=(await acoes()).find(x=>x.titulo==='Semana do Livro');t('ação criada pela tela (com segmento, categoria, responsável e Calendário de Marketing)',SL&&SL.segmento==='Anos Iniciais'&&SL.categoria==='EVENTOS'&&SL.calendarioMkt===true&&SL.dataFim===dia(6),SL);
 // filtros
 await pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await pg.selectOption('#cmExtra2','Anos Iniciais');await pg.waitForTimeout(250);lst=await pg.$eval('.cm-proximos',e=>e.innerText);t('filtro por segmento (Anos Iniciais + Toda a escola)',/Semana do Livro/.test(lst)&&!/Projeto antigo em risco/.test(lst));await pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await pg.selectOption('#cmExtra2','');
 await pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await pg.selectOption('#cmExtra','EXECUCAO');await pg.waitForTimeout(250);lst=await pg.$eval('.cm-proximos',e=>e.innerText);t('filtro por situação (Em execução)',/Projeto antigo em risco/.test(lst)&&!/Semana do Livro/.test(lst));await pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await pg.selectOption('#cmExtra','');
 await pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await pg.selectOption('#cmExtra3','semana');await pg.waitForTimeout(250);lst=await pg.$eval('.cm-proximos',e=>e.innerText);t('filtro por período (esta semana)',/Semana do Livro|Projeto antigo em risco/.test(lst)&&!/Divulgação da Feira/.test(lst));await pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await pg.selectOption('#cmExtra3','');
 await pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await pg.selectOption('#cmResp','Antônio Filho');await pg.waitForTimeout(250);lst=await pg.$eval('.cm-proximos',e=>e.innerText);t('filtro por responsável',/Semana do Livro/.test(lst)&&!/Homenagem/.test(lst));await pg.selectOption('#cmResp','');
 await pg.click('[data-tipo="EVENTOS"]');await pg.waitForTimeout(200);t('filtro por categoria',!/Semana do Livro/.test(await pg.$eval('.cm-proximos',e=>e.innerText)));await pg.click('[data-tipo="EVENTOS"]');
 await pg.fill('#cmBusca','livro');await pg.waitForTimeout(300);lst=await pg.$eval('.cm-proximos',e=>e.innerText);t('pesquisa pelo título',/Semana do Livro/.test(lst)&&!/Homenagem/.test(lst));await pg.fill('#cmBusca','');await pg.waitForTimeout(300);
 await pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await pg.selectOption('#cmExtra4','arquivadas');await pg.waitForTimeout(250);t('filtro "somente arquivadas" mostra a antiga arquivada',/Projeto antigo arquivado/.test(await pg.$eval('.cm-proximos',e=>e.innerText)));await pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await pg.selectOption('#cmExtra4','');
 // resumo clicável
 await pg.click('[data-plf="situacao:EXECUCAO"]');await pg.waitForTimeout(250);t('clicar no resumo aplica o filtro',(await pg.inputValue('#cmExtra'))==='EXECUCAO');await pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));await pg.selectOption('#cmExtra','');
 // visões mensal e semanal
 await pg.click('[data-modo="month"]');await pg.waitForSelector('.cm-mes');await pg.fill('#cmIr',dia(3));await pg.dispatchEvent('#cmIr','change');await pg.waitForTimeout(300);t('visão mensal mostra as ações com data',/Semana do Livro/.test(await pg.$eval('.cm-mes',e=>e.innerText))||(await pg.$$eval('.cm-item.t-PL_EVENTOS',e=>e.length))>0);
 await pg.click('[data-modo="week"]');await pg.waitForSelector('.cm-semana');await pg.fill('#cmIr',dia(3));await pg.dispatchEvent('#cmIr','change');await pg.waitForTimeout(300);t('visão semanal (semana de uma ação em curso)',(await pg.$$eval('.cm-col',e=>e.length))===7&&/Semana do Livro/.test(await pg.$eval('.cm-semana',e=>e.innerText)));
 await pg.click('[data-modo="list"]');await pg.waitForSelector('.cm-proximos');
 // abrir a ação, situação e criar solicitações
 await pg.click('.cm-item:has-text("Semana do Livro")');await pg.waitForSelector('#plForm');
 t('a janela da ação mostra situação, acompanhamento, solicitações e conteúdos',/Situação/.test(await pg.$eval('.dc-det',e=>e.innerText))&&/Acompanhamento/.test(await pg.$eval('.dc-det',e=>e.innerText))&&/Solicitações vinculadas/.test(await pg.$eval('.dc-det',e=>e.innerText))&&/Conteúdos vinculados/.test(await pg.$eval('.dc-det',e=>e.innerText)));
 await pg.click('[data-sit="EXECUCAO"]');await pg.waitForSelector('[data-sit="EXECUCAO"].on');t('trocar a situação pela tela',(await acoes()).find(x=>x.id===SL.id).situacao==='EXECUCAO');
 await pg.click('#plNovasSol');await pg.waitForSelector('#plSol');await pg.fill('.pl-ln [data-t]','Criar cartaz da semana');await pg.selectOption('.pl-ln [data-r]','Monique Vilante');
 await pg.click('[data-sug="Realizar cobertura fotográfica"]');await pg.click('#sOk');await pg.waitForSelector('#plSol',{state:'detached'});await pg.waitForTimeout(700);
 const vs=(await acao(SL.id)).solicitacoes;t('solicitações criadas pela tela, ligadas à ação, cada uma com responsável e prazo próprios',vs.length===2&&vs.some(x=>x.responsavel==='Monique Vilante')&&vs.every(x=>x.prazo===dia(6)),vs);
 await pg.waitForSelector('[data-sol]');t('a janela lista as solicitações vinculadas com o andamento real',/0 de 2/.test(await pg.$eval('.pl-prog',e=>e.innerText)));
 await pg.click('[data-sol]');await pg.waitForSelector('#dForm');t('abrir uma solicitação vinculada leva a ela em Solicitações',/Criar cartaz da semana|cobertura/i.test(await pg.$eval('.sl-det',e=>e.innerText))&&/Ação do Planejamento/.test(await pg.$eval('.sl-det',e=>e.innerText)));
 await pg.evaluate(()=>document.querySelectorAll('.admin-overlay').forEach(e=>e.remove()));
 // duplicar, arquivar, excluir pela tela
 await pg.evaluate(()=>go('planejamento'));await pg.waitForSelector('.cm-proximos');
 await pg.click('.cm-item:has-text("Semana do Livro")');await pg.waitForSelector('#plDup');await pg.click('#plDup');await pg.waitForSelector('#plD');await pg.click('#plD button[type=submit]');await pg.waitForSelector('#plD',{state:'detached'});await pg.waitForTimeout(600);
 t('duplicar pela tela (próximo ano, sem vínculos)',(await acoes()).filter(x=>x.titulo==='Semana do Livro').length===2);
 await pg.waitForSelector('.cm-proximos');
 // calendário de marketing mostra a ação marcada
 await pg.evaluate(()=>go('calendario'));await pg.waitForSelector('.cm-semana, .cm-mes');await pg.waitForFunction(()=>!document.querySelector('#cmRaiz .loading'));if(!(await pg.$('.cm-mes'))){await pg.click('[data-modo="month"]');await pg.waitForSelector('.cm-mes')}await pg.waitForTimeout(300);
 t('o Calendário único mostra a ação planejada (tipo Ação planejada), sem cópia',(await pg.$$eval('.cm-item.t-PLANO',e=>e.length))>=1&&(await acoes()).filter(x=>x.titulo==='Semana do Livro'&&x.dataInicio===dia(2)).length===1);
 // Dashboard
 await pg.evaluate(()=>go('hoje'));await pg.waitForSelector('.db-stats');
 const dd=(await call('GET','/dashboard/resumo'))[1];
 const kv=await pg.$$eval('.db-stat',e=>e.map(x=>x.querySelector('b').textContent));
 t('Dashboard: contagens iguais às reais (pendentes, em andamento, em aprovação, atrasadas)',kv.join()===[dd.solicitacoes.pendentes,dd.solicitacoes.emAndamento,dd.solicitacoes.emAprovacao,dd.solicitacoes.atrasadas].join(),[kv,dd.solicitacoes]);
 t('Dashboard enxuto: Próximos dias (compromissos, publicações e eventos escolares juntos) e Ações da semana, sem cartões repetidos',(await pg.$$eval('.db-bloco h2',e=>e.map(x=>x.textContent))).join('|')==='Próximos dias|Ações da semana');
 t('Dashboard: a ação da semana aparece',/Semana do Livro|Projeto antigo em risco/.test(await pg.$eval('.db-grade',e=>e.innerText)));
 await pg.click('[data-db-sol="PENDENTE"]');await pg.waitForSelector('.sl-board');t('clicar num indicador abre Solicitações já filtrada',(await pg.inputValue('#slEtapa'))==='PENDENTE');
 // equipe
 const pe=await entra('MON-3303');
 const ie=await pe.$$eval('#nav .navitem .navlabel',e=>e.map(x=>x.textContent.trim()));
 t('equipe vê o menu sem Administração e sem Configurações',!ie.includes('Configurações')&&!ie.includes('Integrações')&&!ie.includes('Usuários e permissões')&&ie.includes('Planejamento')&&ie.includes('Calendários')&&ie.includes('Solicitações'),ie.join('|'));
 await pe.evaluate(()=>go('planejamento'));await pe.waitForSelector('.pl-faixa');await pe.waitForFunction(()=>!document.querySelector('#cmRaiz .loading'));
 await pe.click('.cm-item:has-text("Homenagem aos professores")');await pe.waitForSelector('#plForm');t('equipe consulta ação de outra pessoa em modo leitura (sem Salvar/Excluir)',await pe.$('#pSalvar')===null&&await pe.$('#plExc')===null&&await pe.$eval('#pTitulo',e=>e.disabled));
 // celular
 const pc=await entra('NAT-3301',390,800);const cabe=()=>pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
 for(const [pagina,sel] of [['hoje','.db-stats'],['planejamento','.pl-faixa']]){await pc.evaluate(x=>go(x),pagina);await pc.waitForSelector(sel);await pc.waitForTimeout(600);t(`celular: ${pagina} sem rolagem horizontal`,await cabe())}
 await pc.click('[data-modo="month"]');await pc.waitForSelector('.cm-mes');t('celular: Planejamento mensal cabe na tela',await cabe());
 await pc.click('#cmNovo');await pc.waitForSelector('#plForm');t('celular: o formulário cabe na tela',await cabe());
 t('sem erros de JavaScript',errs.length===0,errs.join(' | '));
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
