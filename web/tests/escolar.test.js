// Calendário Escolar: cadastro com validação no servidor, vários dias, segmentos, duplicidade, permissões, separação do Marketing,
// criação opcional de uma publicação a partir do evento, camada no Calendário e celular. Uso: node escolar.test.js <install.out>
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

 // ---- publicação a partir do evento (opcional, nunca automática) ----
 t('criar eventos não gerou nenhuma publicação',(await call('GET','/data?module=conteudos'))[1].rows.length===0);
 [s,r]=await call('POST','/escolar/publicacao',{id:FEIRA.id,titulo:'Feira de Ciências: chamada'},E);const PUB=r;
 t('cria uma publicação (Ideia) com data, segmento e origem do evento',s===201&&r.status==='IDEIA'&&r.origemTipo==='calescolar'&&r.origemId===FEIRA.id&&r.publicacaoEm===FEIRA.dataInicio&&r.segmento==='Ensino Fundamental – Anos Iniciais'||r.segmento==='Todos',r);
 [s,r]=await call('POST','/escolar/publicacao',{id:FEIRA.id,titulo:'Feira de Ciências: chamada'});t('publicação repetida é recusada (409)',s===409);
 [s]=await call('POST','/escolar/publicacao',{id:'ESC-9999'});t('evento inexistente: 404',s===404);
 const pnl=(await call('GET','/escolar/painel'))[1].rows.find(x=>x.id===FEIRA.id);t('o evento lista as publicações ligadas a ele',pnl.publicacoes.length===1&&pnl.publicacoes[0].id===PUB.id);
 // ---- excluir ----
 [s]=await call('POST','/escolar/excluir',{id:'ESC-9999'},E);t('excluir inexistente dá 404',s===404);
 [s,r]=await call('POST','/escolar/excluir',{id:FEIRA.id});
 t('excluir apaga o evento e solta as publicações (continuam, sem o vínculo, guardando o nome)',s===200&&r.vinculosDesfeitos===1&&!(await lista()).some(x=>x.id===FEIRA.id)&&(await call('GET','/data?module=conteudos&id='+PUB.id))[1].origemId===''&&(await call('GET','/data?module=conteudos&id='+PUB.id))[1].origemNome==='Feira de Ciências 2026');
 [s]=await call('POST','/escolar/excluir',{id:REU.id});t('exclui a reunião geral',s===200&&!(await lista()).some(x=>x.id===REU.id));

 // ============ INTERFACE: camada "Calendário escolar" ============
 const U=require('./lib/ui');const br=await U.abrir();
 const p=await U.pagina(br,'NAT-3301','Nat26ab');
 await U.ir(p,'calendario');
 await p.evaluate(()=>CAL_UNICO.definirFiltro('modo','list'));await p.waitForTimeout(500);
 const txt=await U.textoConteudo(p);
 t('o calendário mostra o evento escolar de dias futuros na lista',/Excursão ao museu/.test(txt)||/Prova bimestral/.test(txt),txt.slice(0,300));
 t('o item mostra de onde vem (calendário escolar)',/Calendário escolar/.test(await p.innerText('.cm-tipos')));
 await p.click('.cm-item >> text=Prova bimestral').catch(()=>{});await p.waitForSelector('#escForm',{timeout:8000}).catch(()=>{});
 t('abrir o evento mostra o formulário com “Criar publicação deste evento”',await p.$('#ePub')!==null);
 await p.click('#ePub');await p.waitForSelector('#dlgForm');await p.click('#dlgForm button[type=submit]');await p.waitForSelector('#estForm',{timeout:10000});
 t('criar publicação do evento abre o Estúdio já preenchido',(await p.inputValue('#fTitulo')).includes('Prova bimestral'));
 t('sem erros de script nem diálogos nativos',p.errs.length===0,p.errs);
 await br.close();
 // celular
 const br2=await U.abrir();const pc=await U.pagina(br2,'NAT-3301','Nat26ab',{width:390,height:800});await U.ir(pc,'calendario');
 t('celular: o calendário não estoura a largura',await pc.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await br2.close();
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
