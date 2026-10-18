// Datas Comemorativas: catálogo e regras (fixas e móveis) verificados, recorrência sem duplicar, cadastro com validação, relevância,
// categorias, vínculos com Solicitações e Planejamento, permissões, filtros e celular. Uso: node datacom.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,600))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
(async()=>{
 const senha={'NAT-3301':'Nat26ab','ANT-3302':'Ant26ab','MON-3303':'Mon26ab'};const H={};
 for(const c of Object.keys(senha)){let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});const ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:senha[c]})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:senha[c]})});H[c]={...J,Cookie:cookie(r)}}
 const G=H['NAT-3301'],E=H['ANT-3302'],M=H['MON-3303'];
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const painel=async(ano,h=G)=>(await call('GET','/datacom/painel?ano='+ano,null,h))[1];
 const dataDe=(p,id,ano)=>{const i=p.itens.find(x=>x.id===id&&x.data.startsWith(String(ano)));return i&&i.data};
 let s,r;

 // ---- segurança ----
 [s]=await call('GET','/datacom/painel',null,{...J});t('sem login não abre (401)',s===401);
 [s]=await call('POST','/data?module=datacom',{titulo:'x'});t('o /data genérico não grava datas comemorativas (validação obrigatória)',s===400);

 // ---- catálogo: datas fixas e móveis verificadas contra valores conhecidos ----
 const P24=await painel(2024),P25=await painel(2025),P26=await painel(2026),P27=await painel(2027),P30=await painel(2030);
 const pascoas={2024:'2024-03-31',2025:'2025-04-20',2026:'2026-04-05',2027:'2027-03-28',2030:'2030-04-21'};
 t('Domingo de Páscoa correto (2024, 2025, 2026, 2027, 2030)',[[24,P24,2024],[25,P25,2025],[26,P26,2026],[27,P27,2027],[30,P30,2030]].every(([,p,a])=>dataDe(p,'pascoa',a)===pascoas[a]),[dataDe(P24,'pascoa',2024),dataDe(P26,'pascoa',2026)]);
 t('Sexta-feira da Paixão = Páscoa − 2 (2024-03-29, 2026-04-03)',dataDe(P24,'sexta-feira-santa',2024)==='2024-03-29'&&dataDe(P26,'sexta-feira-santa',2026)==='2026-04-03');
 t('Carnaval (segunda e terça) = Páscoa − 48/− 47 (2026-02-16 e 17; conferido no calendário do TRE-PB)',dataDe(P26,'carnaval-segunda',2026)==='2026-02-16'&&dataDe(P26,'carnaval-terca',2026)==='2026-02-17'&&dataDe(P24,'carnaval-terca',2024)==='2024-02-13');
 t('Corpus Christi = Páscoa + 60 (2026-06-04; 2025-06-19)',dataDe(P26,'corpus-christi',2026)==='2026-06-04'&&dataDe(P25,'corpus-christi',2025)==='2025-06-19');
 t('Dia das Mães = 2º domingo de maio (2025-05-11; 2026-05-10)',dataDe(P25,'dia-das-maes',2025)==='2025-05-11'&&dataDe(P26,'dia-das-maes',2026)==='2026-05-10');
 t('Dia dos Pais = 2º domingo de agosto (2025-08-10; 2026-08-09)',dataDe(P25,'dia-dos-pais',2025)==='2025-08-10'&&dataDe(P26,'dia-dos-pais',2026)==='2026-08-09');
 const fixa={'dia-da-mulher':'03-08','dia-da-agua':'03-22','livro-infantil':'04-18','dia-do-estudante':'08-11','independencia':'09-07','dia-das-criancas':'10-12','dia-do-professor':'10-15','consciencia-negra':'11-20','natal':'12-25','data-magna-pb':'08-05','nossa-senhora-das-neves-jp':'08-05'};
 t('datas fixas do catálogo nos dias certos (em 2026 e em 2031)',Object.entries(fixa).every(([id,md])=>dataDe(P26,id,2026)==='2026-'+md));
 const P31=await painel(2031);t('as datas aparecem nos anos seguintes sozinhas (2031)',Object.entries(fixa).every(([id,md])=>dataDe(P31,id,2031)==='2031-'+md)&&dataDe(P31,'dia-das-maes',2031)==='2031-05-11');
 const cat=P26.itens.find(x=>x.id==='natal');
 t('classificação legal fica clara: Natal e Consciência Negra = feriados nacionais; Carnaval/Corpus Christi NÃO são feriados',cat.categoria==='FERIADO_NACIONAL'&&P26.itens.find(x=>x.id==='consciencia-negra').categoria==='FERIADO_NACIONAL'&&P26.itens.find(x=>x.id==='carnaval-terca').categoria!=='FERIADO_NACIONAL'&&P26.itens.find(x=>x.id==='corpus-christi').categoria!=='FERIADO_NACIONAL'&&/ponto facultativo/i.test(P26.itens.find(x=>x.id==='corpus-christi').nome));
 t('Paraíba e João Pessoa: Data Magna (estadual) e Nossa Senhora das Neves (municipal) com base legal',P26.itens.find(x=>x.id==='data-magna-pb').categoria==='FERIADO_ESTADUAL_PB'&&/10\.601\/2015/.test(P26.itens.find(x=>x.id==='data-magna-pb').baseLegal)&&P26.itens.find(x=>x.id==='nossa-senhora-das-neves-jp').categoria==='FERIADO_MUNICIPAL_JP');
 const pend=P26.itens.filter(x=>x.status==='pendente');
 t('datas não confirmadas ficam PENDENTES (8/12 e 24/6 de João Pessoa), nunca como oficiais',pend.some(x=>x.id==='imaculada-conceicao-jp')&&pend.some(x=>x.id==='sao-joao-jp')&&pend.every(x=>/Valid|confirm/i.test(x.fonte)));
 t('todo item do catálogo traz a fonte de validação',P26.itens.filter(x=>x.origem==='catalogo').every(x=>x.fonte&&x.fonte.length>20));
 t('campanhas de mês inteiro trazem o período (Outubro Rosa 01 a 31/10)',(()=>{const i=P26.itens.find(x=>x.id==='outubro-rosa'&&x.data.startsWith('2026'));return i&&i.data==='2026-10-01'&&i.fim==='2026-10-31'})());
 t('o catálogo não é gravado por ano no banco (nenhum registro "datacom" criado)',(await call('GET','/data?module=datacom'))[1].rows.length===0);
 t('as 10 categorias pedidas existem',P26.categorias.length===10&&['FERIADO_NACIONAL','FERIADO_ESTADUAL_PB','FERIADO_MUNICIPAL_JP','EDUCACIONAL','CULTURAL','RELIGIOSA','PROFISSIONAL','AMBIENTAL','SAUDE','INSTITUCIONAL'].every(c=>P26.categorias.some(x=>x.codigo===c)));
 t('sem duplicatas: um id por data em cada ano',(()=>{const k=P26.itens.map(x=>x.uid);return new Set(k).size===k.length})());
 t('sem sugestões de relevância inventadas: só as citadas no pedido vêm marcadas',P26.itens.filter(x=>x.relevante==='SIM').every(x=>['dia-da-mulher','dia-da-agua','livro-infantil','dia-das-maes','dia-do-estudante','dia-dos-pais','independencia','dia-das-criancas','dia-do-professor','consciencia-negra','natal','pascoa','dia-do-autismo','setembro-amarelo'].includes(x.id)));

 // ---- datas personalizadas: validação ----
 const base={nome:'Aniversário do Colégio',categoria:'INSTITUCIONAL',regra:{tipo:'fixa',dia:'14',mes:'3'},repeteAnual:'SIM',relevante:'SIM',descricao:'Data de teste',observacoes:''};
 const ruim=async(n,o,re)=>{[s,r]=await call('POST','/datacom/salvar',{...base,...o});t(n,s===400&&(!re||re.test(r.error)),[s,r])};
 await ruim('nome curto é recusado',{nome:'ab'},/nome/i);
 await ruim('categoria inexistente é recusada',{categoria:'XYZ'},/categoria/i);
 await ruim('dia inválido para o mês (31/04)',{regra:{tipo:'fixa',dia:'31',mes:'4'}},/Dia inválido/);
 await ruim('mês inválido',{regra:{tipo:'fixa',dia:'1',mes:'13'}},/Mês/);
 await ruim('tipo de regra desconhecido',{regra:{tipo:'aleatoria'}},/regra/i);
 await ruim('n-ésimo inválido',{regra:{tipo:'nesimo',mes:'5',n:'7',diaSemana:'0'}},/1º/);
 await ruim('distância da Páscoa fora do limite',{regra:{tipo:'pascoa',offset:'400'}},/Páscoa/);
 await ruim('data que não repete exige o ano',{repeteAnual:'NAO',ano:''},/ano/i);
 await ruim('29/02 em ano comum é recusado quando não repete',{regra:{tipo:'fixa',dia:'29',mes:'2'},repeteAnual:'NAO',ano:'2025'},/bissexto/);
 await ruim('descrição enorme',{descricao:'x'.repeat(501)},/500/);
 [s]=await call('POST','/datacom/salvar',{...base,nome:'Natal',categoria:'FERIADO_NACIONAL',regra:{tipo:'fixa',dia:'25',mes:'12'}});t('repetir uma data do catálogo é barrado (409)',s===409);

 // ---- cadastro, recorrência anual, móveis personalizadas ----
 [s,r]=await call('POST','/datacom/salvar',base,E);const ANIV=r;t('a equipe cadastra data personalizada fixa',s===201&&r.id&&/^DTC-/.test(r.id),r);
 [s]=await call('POST','/datacom/salvar',base,E);t('cadastro repetido é barrado (409)',s===409);
 [s,r]=await call('POST','/datacom/salvar',{nome:'Feira do Livro (3ª sexta de outubro)',categoria:'CULTURAL',regra:{tipo:'nesimo',n:'3',diaSemana:'5',mes:'10'},repeteAnual:'SIM',relevante:'NAO'});const FEIRA=r;
 t('data móvel personalizada (3ª sexta de outubro)',s===201);
 [s,r]=await call('POST','/datacom/salvar',{nome:'Quinta-feira de Corpus (Páscoa + 60 duplicada?)',categoria:'RELIGIOSA',regra:{tipo:'pascoa',offset:'-3'},repeteAnual:'SIM',relevante:'SIM'});const QUINTA=r;t('data relativa à Páscoa personalizada (Quinta-feira Santa = Páscoa − 3)',s===201);
 [s,r]=await call('POST','/datacom/salvar',{nome:'Dia bissexto da escola',categoria:'INSTITUCIONAL',regra:{tipo:'fixa',dia:'29',mes:'2'},repeteAnual:'SIM',relevante:'NAO'});const BIS=r;
 [s,r]=await call('POST','/datacom/salvar',{nome:'Evento único de 2027',categoria:'INSTITUCIONAL',regra:{tipo:'fixa',dia:'10',mes:'6'},repeteAnual:'NAO',ano:'2027',relevante:'SIM'});const UNICO=r;
 const Q26=await painel(2026),Q27=await painel(2027),Q28=await painel(2028),Q29=await painel(2029);
 t('data fixa personalizada repete todo ano (2026, 2027, 2028)',[Q26,Q27,Q28].every((p,i)=>dataDe(p,ANIV.id,2026+i)===`${2026+i}-03-14`));
 t('3ª sexta de outubro correta (2026-10-16; 2027-10-15)',dataDe(Q26,FEIRA.id,2026)==='2026-10-16'&&dataDe(Q27,FEIRA.id,2027)==='2027-10-15');
 t('Quinta-feira Santa personalizada (2026-04-02; 2027-03-25)',dataDe(Q26,QUINTA.id,2026)==='2026-04-02'&&dataDe(Q27,QUINTA.id,2027)==='2027-03-25');
 t('29/02 só aparece em ano bissexto (2028 sim; 2026, 2027 e 2029 não)',dataDe(Q28,BIS.id,2028)==='2028-02-29'&&!Q26.itens.some(x=>x.id===BIS.id&&x.data.startsWith('2026-02'))&&!Q27.itens.some(x=>x.id===BIS.id&&x.data.startsWith('2027-02'))&&!Q29.itens.some(x=>x.id===BIS.id&&x.data.startsWith('2029-02')));
 t('data de um ano só não repete (aparece em 2027, não em 2026 nem 2028)',dataDe(Q27,UNICO.id,2027)==='2027-06-10'&&!Q26.itens.some(x=>x.id===UNICO.id&&x.data.startsWith('2026'))&&!Q28.itens.some(x=>x.id===UNICO.id&&x.data.startsWith('2028')));
 t('uma linha no banco por data personalizada, não por ano',(await call('GET','/data?module=datacom'))[1].rows.length===5);
 t('personalizada: relevância e editável pelo dono',Q26.itens.find(x=>x.id===ANIV.id).relevante==='SIM'&&Q26.itens.find(x=>x.id===ANIV.id).editavel===true&&(await painel(2026,M)).itens.find(x=>x.id===ANIV.id).editavel===true);

 // ---- editar / excluir (dono ou Gerência) ----
 [s]=await call('POST','/datacom/salvar',{...base,id:ANIV.id,nome:'Aniversário do Colégio Evolução'},M);t('a equipe de Marketing edita a data de outra pessoa (200)',s===200);
 [s,r]=await call('POST','/datacom/salvar',{...base,id:ANIV.id,nome:'Aniversário do Colégio Evolução',regra:{tipo:'fixa',dia:'15',mes:'3'}},E);t('o autor edita (nome e regra)',s===200&&r.titulo==='Aniversário do Colégio Evolução');
 t('a edição vale para todos os anos (15/03)',dataDe(await painel(2027),ANIV.id,2027)==='2027-03-15');
 [s]=await call('POST','/datacom/excluir',{id:'natal'});t('datas do catálogo não se excluem (404)',s===404);
 [s]=await call('POST','/datacom/excluir',{id:BIS.id},M);t('a equipe exclui (vai para a Lixeira)',s===200);
 t('a exclusão vai para a Lixeira',(await call('GET','/data?module=lixeira'))[1].rows.some(x=>x.titulo==='Dia bissexto da escola'));

 // ---- relevância ----
 [s]=await call('POST','/datacom/relevancia',{id:'dia-do-trabalho',relevante:'TALVEZ'});t('valor inválido de relevância é recusado',s===400);
 t('Dia do Trabalho começa como não relevante',(await painel(2026)).itens.find(x=>x.id==='dia-do-trabalho').relevante==='NAO');
 [s]=await call('POST','/datacom/relevancia',{id:'dia-do-trabalho',relevante:'SIM',observacoes:'Falar sobre profissões'},E);const ajustado=(await painel(2026)).itens.find(x=>x.id==='dia-do-trabalho');
 t('a equipe marca como relevante, com observações, sem copiar o catálogo',s===200&&ajustado.relevante==='SIM'&&ajustado.relevanteAjustado===true&&ajustado.observacoes==='Falar sobre profissões');
 [s]=await call('POST','/datacom/relevancia',{id:'dia-do-trabalho',relevante:''});t('voltar ao padrão',s===200&&(await painel(2026)).itens.find(x=>x.id==='dia-do-trabalho').relevante==='NAO');
 [s]=await call('POST','/datacom/relevancia',{id:'natal',relevante:'NAO'});t('desmarcar uma sugerida (Natal)',s===200&&(await painel(2026)).itens.find(x=>x.id==='natal').relevante==='NAO');
 await call('POST','/datacom/relevancia',{id:'natal',relevante:''});
 [s]=await call('POST','/datacom/relevancia',{id:FEIRA.id,relevante:'SIM'},M);t('relevância da personalizada vale para quem usa (qualquer pessoa da equipe)',s===200&&(await painel(2026)).itens.find(x=>x.id===FEIRA.id).relevante==='SIM');
 t('nenhuma publicação foi criada automaticamente para as datas',(await call('GET','/data?module=conteudos'))[1].rows.length===0);

 // ---- categorias ----
 [s]=await call('POST','/datacom/categoria',{nome:'ab'});t('categoria com nome curto é recusada',s===400);
 [s]=await call('POST','/datacom/categoria',{nome:'Datas culturais'});t('nome igual a categoria existente é barrado (409)',s===409);
 [s,r]=await call('POST','/datacom/categoria',{nome:'Esportes e Olimpíadas'},E);const CAT=r;t('a equipe cria uma categoria nova',s===201&&/^CAT_/.test(r.codigo)&&(await painel(2026)).categorias.some(c=>c.codigo===CAT.codigo&&c.personalizada));
 [s,r]=await call('POST','/datacom/salvar',{nome:'Dia do Desafio',categoria:CAT.codigo,regra:{tipo:'nesimo',n:'-1',diaSemana:'3',mes:'5'},repeteAnual:'SIM',relevante:'SIM'});t('data na categoria nova; "último dia da semana do mês" (última quarta de maio 2026 = 27/05)',s===201&&dataDe(await painel(2026),r.id,2026)==='2026-05-27');

 // ---- vínculos: Solicitações e Planejamento ----
 const NATAL26='2026-12-25',DP26=dataDe(await painel(2026),'dia-do-professor',2026);
 [s,r]=await call('POST','/datacom/solicitar',{id:'natal',data:'2026-12-24'});t('só aceita a data real da ocorrência (24/12 não é Natal)',s===404);
 [s]=await call('POST','/datacom/solicitar',{id:'sao-joao-jp',data:'2026-06-24'});t('data PENDENTE não gera solicitação (409)',s===409);
 const sols0=(await call('GET','/data?module=solicitacoes'))[1].rows.length;
 [s,r]=await call('POST','/datacom/solicitar',{id:'dia-das-criancas',data:'2026-10-12'});const SOL=r;
 if(s===409)console.log('   (obs.: a data de hoje pode estar após 12/10; teste de prazo padrão ajustado)');
 const hoje=new Date().toISOString().slice(0,10);
 [s,r]=await call('POST','/datacom/solicitar',{id:'natal',data:NATAL26,texto:'Produzir arte para o Instagram',observacao:'Usar o tema do ano'},E);const SN=r;
 t('cria solicitação interna (usando o fluxo de Solicitações) com referência à data',s===201&&/Produzir arte para o Instagram — Natal/.test(r.titulo)&&r.origem==='INTERNO'&&r.dataComemorativaId==='natal'&&r.dataComemorativaData===NATAL26&&r.etapa==='PENDENTE'&&/Usar o tema/.test(r.descricao),r);
 t('prazo padrão: 2 dias antes da data (23/12)',SN.prazo==='2026-12-23',SN.prazo);
 [s,r]=await call('POST','/datacom/solicitar',{id:'natal',data:NATAL26,texto:'Produzir arte para o Instagram'});t('solicitação repetida é barrada (409)',s===409&&r.error.includes(SN.id));
 [s]=await call('POST','/datacom/solicitar',{id:'natal',data:NATAL26,texto:'Gravar vídeo curto'});t('outra solicitação para a mesma data é permitida',s===201);
 const spn=(await call('GET','/solicitacoes/painel'))[1].rows.find(x=>x.id===SN.id);t('aparece no módulo Solicitações com a referência',spn&&spn.dataComemorativaNome==='Natal');
 t('não criou nada além do pedido (só 2 solicitações novas, nenhuma tarefa)',(await call('GET','/data?module=solicitacoes'))[1].rows.length===sols0+2+(SOL&&SOL.id?1:0)&&(await call('GET','/data?module=tarefas'))[1].rows.length===0);
 [s,r]=await call('POST','/datacom/planejar',{id:'dia-do-professor',data:DP26,acao:'Homenagem aos professores do Colégio Evolução'},E);const PL=r;
 t('cria ação no Planejamento (Projeto) com a referência à data, sem copiar a comemoração',s===201&&/^PRJ-/.test(r.id)&&r.status==='PLANEJAMENTO'&&r.dataComemorativaId==='dia-do-professor'&&r.dataComemorativaData===DP26&&r.prazo===DP26&&(await call('GET','/data?module=datacom'))[1].rows.length===5,r);
 [s]=await call('POST','/datacom/planejar',{id:'dia-do-professor',data:DP26,acao:'Homenagem aos professores do Colégio Evolução'},E);t('ação repetida é barrada (409)',s===409);
 const pv=(await painel(2026)).itens.find(x=>x.id==='dia-do-professor'&&x.data===DP26);
 t('natal mostra as 2 solicitações',(await painel(2026)).itens.find(x=>x.id==='natal'&&x.data===NATAL26).vinculos.solicitacoes.length===2);

 // ============ INTERFACE ============
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const errs=[];
 const entra=async(cod,w=1440,h=1000)=>{const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());await p.goto(BASE+'/');await p.fill('#internalCode',cod);await p.fill('#internalPass',senha[cod]);await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem');await p.waitForFunction(()=>!document.querySelector('#content .loading'),null,{timeout:20000}).catch(()=>{});await p.waitForTimeout(800);return p};
 const p=await entra('NAT-3301');
 const abre=async(pg=p)=>pg.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));
 const novoDc=async(pg=p)=>{await pg.click('#cmNovo');await pg.waitForSelector('.cal-escolha');await pg.click('.cal-escolha [data-n="dc"]');await pg.waitForSelector('#dcForm')};
 await p.evaluate(()=>go('agenda'));await p.waitForSelector('.cm-tipo');
 const sub=await p.$$eval('.cm-tipo:not(.cm-todos)',e=>e.map(x=>x.innerText.trim()));
 t('os três calendários ficam juntos em um só: categorias Escolar, Datas e Feriados ao lado das de Marketing',['escolar','datas','feriados','compromissos'].every(x=>sub.some(y=>y.toLowerCase().includes(x)))&&(await p.$$('#subtabs .subtab')).length===0,sub.join('|'));
 await p.evaluate(()=>go('datacom'));await p.waitForSelector('.cm-semana, .cm-mes');await p.waitForFunction(()=>!document.querySelector('#cmRaiz .loading'));
 t('Calendário único aberto filtrado em Datas e Feriados, com Semana, Mês, Dia, Lista e Ano',(await p.$$eval('.cm-tipo.off',e=>e.length))===4&&(await p.$$eval('[data-modo]',e=>e.map(x=>x.textContent))).join()==='Semana,Mês,Dia,Lista,Ano');
 await p.selectOption('#cmAno','2026');await p.waitForFunction(()=>/2026/.test(document.querySelector('.cm-periodo')?.textContent||''));
 await p.click('[data-modo="list"]');await p.waitForSelector('.cm-proximos');
 let txt=await p.$eval('.cm-proximos',e=>e.innerText);
 t('lista do ano mostra as datas confirmadas e esconde as pendentes',/Natal/.test(txt)&&/Dia do Professor/.test(txt)&&!/São João \(João Pessoa\)/.test(txt),txt.slice(0,200));
 await abre();await p.selectOption('#cmExtra2','pendentes');await p.waitForTimeout(250);txt=await p.$eval('.cm-proximos',e=>e.innerText);t('filtro "Pendentes de validação" mostra só as pendentes',/São João/.test(txt)&&/Imaculada/.test(txt)&&!/Natal/.test(txt));
 await abre();await p.selectOption('#cmExtra2','');await p.waitForTimeout(150);
 await abre();await p.selectOption('#cmExtra','feriados');await p.waitForTimeout(250);txt=await p.$eval('.cm-proximos',e=>e.innerText);t('filtro Feriados: só feriados (Natal sim, Dia do Professor não)',/Natal/.test(txt)&&/Data Magna/.test(txt)&&!/Dia do Professor/.test(txt)&&!/Corpus Christi/.test(txt));
 await abre();await p.selectOption('#cmExtra','educacionais');await p.waitForTimeout(250);txt=await p.$eval('.cm-proximos',e=>e.innerText);t('filtro Datas educacionais',/Dia do Professor/.test(txt)&&/Livro Infantil/.test(txt)&&!/Natal/.test(txt));
 await abre();await p.selectOption('#cmExtra','');await p.waitForTimeout(150);
 await abre();await p.selectOption('#cmMes','12');await p.waitForTimeout(250);txt=await p.$eval('.cm-proximos',e=>e.innerText);t('filtro por mês (dezembro)',/Natal/.test(txt)&&!/Dia do Professor/.test(txt));await abre();await p.selectOption('#cmMes','');await p.waitForTimeout(150);
 await abre();await p.click('[data-tog="relevantes"]');await p.waitForTimeout(250);txt=await p.$eval('.cm-proximos',e=>e.innerText);t('"Somente datas relevantes" (Dia dos Pais sim, Tiradentes não)',/Dia dos Pais/.test(txt)&&!/Tiradentes/.test(txt));await abre();await p.click('[data-tog="relevantes"]');await p.waitForTimeout(150);
 await p.fill('#cmBusca','professor');await p.waitForTimeout(300);txt=await p.$eval('.cm-proximos',e=>e.innerText);t('pesquisa pelo nome (acentos e caixa não atrapalham)',/Dia do Professor/.test(txt)&&!/Natal/.test(txt));await p.fill('#cmBusca','');await p.waitForTimeout(300);
 await p.click('[data-tipo="DATA"]');await p.waitForTimeout(200);txt=await p.$eval('.cm-proximos',e=>e.innerText);t('filtro por categoria (esconde as Datas, mantém os Feriados)',!/Dia das Mães/.test(txt)&&/Natal/.test(txt));await p.click('[data-tipo="DATA"]');await p.waitForTimeout(150);
 // navegação entre anos
 await p.click('#cmNext');await p.waitForFunction(()=>document.querySelector('.cm-periodo')?.textContent==='2027');
 const l27=await p.$eval('.cm-proximos',e=>e.innerText);t('navegar para 2027: as datas aparecem sozinhas (e as móveis mudam de dia)',/Natal/.test(l27)&&/Dia das Mães/.test(l27)&&/28\/03/.test(l27),l27.slice(0,300));
 await p.selectOption('#cmAno','2030');await p.waitForFunction(()=>document.querySelector('.cm-periodo')?.textContent==='2030');t('seletor de ano (2030): Páscoa em 21/04',/21\/04/.test(await p.$eval('.cm-proximos',e=>e.innerText)));
 await p.click('#cmHoje');await p.waitForFunction(()=>document.querySelector('.cm-periodo')?.textContent===String(new Date().getFullYear()));
 // visão anual e mensal
 await p.click('[data-modo="year"]');await p.waitForSelector('.cm-ano');t('visão anual: 12 meses com as datas marcadas',(await p.$$eval('.cm-mini',e=>e.length))===12&&(await p.$$eval('.cm-md.tem',e=>e.length))>20);
 t('feriados aparecem destacados na visão anual',(await p.$$eval('.cm-md.tem.feriado',e=>e.length))>=8);
 await p.click('.cm-mini-t >> nth=11');await p.waitForSelector('.cm-mes');t('clicar no mês abre a visão mensal (dezembro)',/dezembro/i.test(await p.$eval('.cm-periodo',e=>e.textContent)));
 t('o Natal aparece no mês e o dia fica destacado como feriado',/Natal/.test(await p.$eval('.cm-mes',e=>e.innerText))&&(await p.$$eval('.cm-dia.feriado',e=>e.length))>=1);
 // detalhe + relevância + vínculos
 await p.click('.cm-item:has-text("Natal")');await p.waitForSelector('.dc-det');
 t('detalhe: categoria, fixa/móvel, confirmada, regra e fonte',/Feriados nacionais/.test(await p.$eval('.dc-det',e=>e.innerText))&&/Data fixa/.test(await p.$eval('.dc-det',e=>e.innerText))&&/Confirmada/.test(await p.$eval('.dc-det',e=>e.innerText))&&/Lei 10\.607/.test(await p.$eval('.dc-det',e=>e.innerText)));
 await p.click('[data-rel="SIM"]');await p.waitForSelector('.dc-det',{state:'detached'});await p.waitForTimeout(400);
 t('marcar como relevante pela tela',(await painel(new Date().getFullYear())).itens.find(x=>x.id==='natal').relevante==='SIM');await call('POST','/datacom/relevancia',{id:'natal',relevante:''});
 await p.click('[data-modo="month"]').catch(()=>{});
 // criar ação no Planejamento e solicitação pela tela
 await p.evaluate(()=>{document.querySelectorAll('.admin-overlay').forEach(e=>e.remove())});
 await p.click('[data-modo="list"]');await p.waitForSelector('.cm-proximos');
 await p.click('.cm-item:has-text("Internacional da Mulher")');await p.waitForSelector('#dcPlanejar');
 await p.click('#dcPlanejar');await p.waitForSelector('#dcAc');t('ação no Planejamento já vem com o texto sugerido e o prazo da data',/Ação para Dia Internacional da Mulher/.test(await p.inputValue('#aTexto'))&&(await p.inputValue('#aPrazo')).endsWith('-03-08'));
 await p.fill('#aTexto','Campanha de março');await p.click('#aOk');await p.waitForSelector('#dcAc',{state:'detached'});await p.waitForTimeout(500);
 const pj=(await call('GET','/data?module=projetos'))[1].rows.find(x=>x.titulo==='Campanha de março');t('criada pela tela, com a referência',pj&&pj.dataComemorativaId==='dia-da-mulher');
 await p.click('.cm-item:has-text("Internacional da Mulher")').catch(async()=>{await p.click('[data-modo="list"]')});await p.waitForSelector('.dc-det');
 t('o detalhe passa a listar a ação criada',/Campanha de março/.test(await p.$eval('.dc-vinc',e=>e.innerText)));
 await p.evaluate(()=>{document.querySelectorAll('.admin-overlay').forEach(e=>e.remove())});
 // nova data pela tela
 await novoDc();
 await p.click('#dcForm #fOk');await p.waitForFunction(()=>document.querySelector('#fErro')?.textContent,null,{timeout:8000}).catch(()=>{});t('formulário valida o nome',/nome/i.test(await p.textContent('#fErro')));
 await p.fill('#fNome','Semana da Matemática');await p.selectOption('#fTipo','nesimo');await p.selectOption('#fN','1');await p.selectOption('#fSem','1');await p.selectOption('#fMesN','11');await p.selectOption('#fCat','__nova');await p.fill('#fCatNova','Semanas temáticas');await p.click('#fOk');await p.waitForSelector('#dcForm',{state:'detached'});await p.waitForTimeout(500);
 const sm=(await call('GET','/data?module=datacom'))[1].rows.find(x=>x.titulo==='Semana da Matemática');
 t('data móvel e categoria nova criadas pela tela (1ª segunda de novembro)',sm&&sm.regraTipo==='nesimo'&&/^CAT_SEMANAS/.test(sm.categoria));
 await p.click('.cm-item:has-text("Semana da Matemática")');await p.waitForSelector('#dcEditar');await p.click('#dcEditar');await p.waitForSelector('#dcForm');
 t('editar abre o formulário já preenchido',(await p.inputValue('#fNome'))==='Semana da Matemática'&&(await p.inputValue('#fTipo'))==='nesimo');await p.fill('#fNome','Semana da Matemática 2');await p.click('#fOk');await p.waitForSelector('#dcForm',{state:'detached'});
 t('edição pela tela',(await call('GET','/data?module=datacom'))[1].rows.some(x=>x.titulo==='Semana da Matemática 2'));
 await p.click('.cm-item:has-text("Semana da Matemática 2")');await p.waitForSelector('#dcExcluir');
 p.removeAllListeners('dialog');p.once('dialog',d=>d.dismiss());await p.click('#dcExcluir');await p.waitForTimeout(400);t('cancelar a confirmação não exclui',(await call('GET','/data?module=datacom'))[1].rows.some(x=>x.titulo==='Semana da Matemática 2'));
 p.removeAllListeners('dialog');p.once('dialog',d=>d.accept());await p.click('#dcExcluir');await p.waitForSelector('.dc-det',{state:'detached'});await p.waitForTimeout(400);t('confirmar exclui',!(await call('GET','/data?module=datacom'))[1].rows.some(x=>x.titulo==='Semana da Matemática 2'));p.on('dialog',d=>d.accept());

 // ---- celular ----
 const pc=await entra('NAT-3301',390,800);await pc.evaluate(()=>go('datacom'));await pc.waitForSelector('.cm-semana, .cm-mes');await pc.waitForFunction(()=>!document.querySelector('#cmRaiz .loading'));if(!(await pc.$('.cm-mes'))){await pc.click('[data-modo="month"]');await pc.waitForSelector('.cm-mes')}
 const cabe=()=>pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
 t('celular: mês sem rolagem horizontal',await cabe());
 await pc.click('[data-modo="year"]');await pc.waitForSelector('.cm-ano');t('celular: visão anual cabe na tela',await cabe());
 await pc.click('[data-modo="list"]');await pc.waitForSelector('.cm-proximos');t('celular: lista cabe na tela',await cabe());
 await novoDc(pc);t('celular: o formulário cabe na tela',await cabe());
 t('sem erros de JavaScript',errs.length===0,errs.join(' | '));
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
