// Datas Comemorativas: catálogo e regras (fixas e móveis) verificados, recorrência sem duplicar, cadastro com validação, relevância,
// categorias, criação de publicação a partir da data, camada no Calendário e celular. Uso: node datacom.test.js <install.out>
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
 [s]=await call('POST','/datacom/excluir',{id:BIS.id},M);t('a equipe exclui a data cadastrada',s===200&&!(await painel(2026)).itens.some(x=>x.id===BIS.id));

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

 // ---- publicação a partir da data (opcional, nunca automática) ----
 const NATAL26='2026-12-25';
 [s,r]=await call('POST','/datacom/publicacao',{id:'natal',data:'2026-12-24'});t('só aceita a data real da ocorrência (24/12 não é Natal)',s===404);
 [s]=await call('POST','/datacom/publicacao',{id:'sao-joao-jp',data:'2026-06-24'});t('data PENDENTE não gera publicação (409)',s===409);
 const n0=(await call('GET','/data?module=conteudos'))[1].rows.length;t('a lista de datas não criou publicações sozinha',n0===0);
 [s,r]=await call('POST','/datacom/publicacao',{id:'natal',data:NATAL26,titulo:'Natal: mensagem do Colégio'},E);const PN=r;
 t('cria publicação (Ideia) com a data e a origem',s===201&&r.status==='IDEIA'&&r.publicacaoEm===NATAL26&&r.origemTipo==='datacom'&&r.origemId==='natal'&&r.origemNome==='Natal',r);
 [s,r]=await call('POST','/datacom/publicacao',{id:'natal',data:NATAL26,titulo:'Natal: mensagem do Colégio'});t('publicação repetida é barrada (409)',s===409);
 [s]=await call('POST','/datacom/publicacao',{id:'natal',data:NATAL26,titulo:'Natal: vídeo curto'});t('outra publicação para a mesma data é permitida',s===201);
 // ---- camada no Calendário ----
 const U=require('./lib/ui');const br=await U.abrir();const p=await U.pagina(br,'NAT-3301','Nat26ab');
 await U.ir(p,'calendario');
 t('legenda do calendário tem datas comemorativas e feriados como camadas',/Datas comemorativas/.test(await p.innerText('.cm-tipos'))&&/Feriados/.test(await p.innerText('.cm-tipos')));
 await p.evaluate(()=>CAL_UNICO.definirFiltro('modo','list'));await p.waitForTimeout(500);
 t('a lista do ano traz feriados do catálogo (Natal)',/Natal/.test(await U.textoConteudo(p)));
 await p.click('.cm-item >> text=Natal').catch(()=>{});await p.waitForSelector('.dc-det',{timeout:8000}).catch(()=>{});
 t('abrir uma data mostra regra, validação e “Criar publicação desta data”',await p.$('#dcPub')!==null&&/Regra/.test(await p.innerText('.dc-det')));
 t('sem erros de script nem diálogos nativos',p.errs.length===0,p.errs);
 await br.close();
 const br2=await U.abrir();const pc=await U.pagina(br2,'NAT-3301','Nat26ab',{width:390,height:800});await U.ir(pc,'calendario');
 t('celular: sem rolagem horizontal',await pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await br2.close();
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
