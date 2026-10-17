// Solicitações simplificadas: cadastro rápido, 4 etapas, Kanban/lista, distribuição, permissões da equipe, aprovação só quando necessária,
// comentários/anexos/histórico, filtros e atraso. Uso: node solicitacoes.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,500))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const dia=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
(async()=>{
 const login=async(c,n)=>{let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});let ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:n})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:n})});return {...J,Cookie:cookie(r)}};
 const G=await login('NAT-3301','Nat26ab'),E=await login('ANT-3302','Ant26ab'),M=await login('MON-3303','Mon26ab');
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const row=async id=>(await call('GET','/data?module=solicitacoes&id='+id))[1];
 let s,r;

 // ---- cadastro rápido ----
 [s,r]=await call('POST','/solicitacoes/nova',{titulo:'ab'});t('título curto é recusado',s===400);
 [s,r]=await call('POST','/solicitacoes/nova',{titulo:'Cartaz da feira',prioridade:'XPTO'});t('prioridade inválida é recusada',s===400);
 [s,r]=await call('POST','/solicitacoes/nova',{titulo:'Cartaz da feira de ciências',descricao:'Cartaz A3 para o pátio',solicitante:'Coord. Anos Finais',segmento:'Anos Finais',prazo:dia(5),prioridade:'ALTA'});
 const A1=r;t('cadastro rápido cria em Pendente sem responsável',s===201&&r.etapa==='PENDENTE'&&r.status==='AGUARDANDO TRIAGEM'&&r.origem==='INTERNO'&&r.exigeAprovacao==='0'&&r.solicitante==='Coord. Anos Finais',r);
 [s,r]=await call('POST','/solicitacoes/nova',{titulo:'Post do dia do professor',responsavel:'Antônio Filho',prazo:dia(-2),exigeAprovacao:'1'});
 const A2=r;t('a Gerente cria já distribuindo (continua em Pendente) e com aprovação marcada',s===201&&r.status==='DISTRIBUÍDA'&&r.etapa==='PENDENTE'&&r.exigeAprovacao==='1'&&r.atrasada===true,r);
 [s]=await call('POST','/solicitacoes/nova',{titulo:'Algo para outra pessoa',responsavel:'Monique Vilante'},E);t('a equipe não distribui para outra pessoa ao cadastrar',s===403);
 [s,r]=await call('POST','/solicitacoes/nova',{titulo:'Reunião de pais — convite',responsavel:'Antônio Filho'},E);const A3=r;t('a equipe cadastra para si mesma',s===201&&r&&r.status==='DISTRIBUÍDA');
 // anexos opcionais
 const fd=new FormData();fd.append('files',new Blob([Buffer.from('%PDF-1.4\n%teste\n')],{type:'application/pdf'}),'briefing.pdf');
 let x=await fetch(B+'/solicitacoes/anexo?id='+A1.id,{method:'POST',headers:{'X-EVO':'1',Cookie:G.Cookie},body:fd});let j=await x.json();
 t('anexo opcional é enviado e vinculado',x.status===200&&/ANEXOS\/SOLICITACOES\/.+briefing/.test(j.anexos||''),j);
 const fd2=new FormData();fd2.append('files',new Blob([Buffer.from('%PDF-1.4\n')],{type:'application/pdf'}),'x.pdf');
 x=await fetch(B+'/solicitacoes/anexo?id='+A1.id,{method:'POST',headers:{'X-EVO':'1',Cookie:M.Cookie},body:fd2});t('quem não é dono nem criador não anexa',x.status===403);

 // ---- distribuição pela gerente ----
 [s]=await call('POST','/solicitacoes/distribuir',{id:A1.id,responsavel:'Antônio Filho'},E);t('a equipe não distribui',s===403);
 [s]=await call('POST','/solicitacoes/distribuir',{id:A1.id},G);t('distribuir exige o responsável',s===400);
 [s,r]=await call('POST','/solicitacoes/distribuir',{id:A1.id,responsavel:'Antônio Filho',prazo:dia(7),prioridade:'URGENTE'});
 t('a Gerente distribui: DISTRIBUÍDA, responsável, prazo e prioridade',s===200&&r.status==='DISTRIBUÍDA'&&r.responsavel==='Antônio Filho'&&r.prazoEfetivo===dia(7)&&r.prioridade==='URGENTE',r);
 const notif=(await call('GET','/notificacoes',null,E))[1];
 t('o responsável é avisado da atribuição',JSON.stringify(notif).includes(A1.id),notif);
 const tars=((await call('GET','/data?module=tarefas'))[1].rows||[]).filter(z=>z.solicitacaoId===A1.id);t('distribuir não cria tarefa duplicada',tars.length===0,tars.length);

 // ---- movimentação e permissões ----
 [s]=await call('POST','/solicitacoes/mover',{id:A1.id,etapa:'EM_ANDAMENTO'},M);t('equipe que não é a responsável não move (403)',s===403);
 [s,r]=await call('POST','/solicitacoes/mover',{id:A1.id,etapa:'EM_ANDAMENTO'},E);t('o responsável inicia: Em andamento (EM EXECUÇÃO)',s===200&&r.etapa==='EM_ANDAMENTO'&&r.status==='EM EXECUÇÃO'&&!!r.iniciadoEm,r);
 [s]=await call('POST','/solicitacoes/mover',{id:A1.id,etapa:'PENDENTE',motivo:'voltar'},E);t('a equipe não volta etapa',s===403);
 [s,r]=await call('POST','/solicitacoes/mover',{id:A1.id,etapa:'EM_APROVACAO'},E);t('sem aprovação exigida, não vai para Em aprovação (409)',s===409&&/não exige aprovação/.test(r.error),r);
 [s,r]=await call('POST','/solicitacoes/mover',{id:A1.id,etapa:'CONCLUIDO'},E);t('sem aprovação exigida, a equipe conclui direto',s===200&&r.status==='CONCLUÍDA'&&r.etapa==='CONCLUIDO'&&!!r.concluidoEm,r);
 [s]=await call('POST','/solicitacoes/mover',{id:A1.id,etapa:'EM_ANDAMENTO'},E);t('equipe não reabre concluída',s===403);
 [s,r]=await call('POST','/solicitacoes/mover',{id:A1.id,etapa:'EM_ANDAMENTO'},G);t('reabrir exige motivo (409 pede motivo)',s===409&&r.motivo===true,r);
 [s,r]=await call('POST','/solicitacoes/mover',{id:A1.id,etapa:'EM_ANDAMENTO',motivo:'Faltou o logo'},G);t('a Gerente reabre com motivo',s===200&&r.status==='EM EXECUÇÃO');
 // com aprovação
 [s,r]=await call('POST','/solicitacoes/mover',{id:A2.id,etapa:'CONCLUIDO'},G);t('pendente com responsável + exige aprovação: concluir direto é recusado',s===409&&/exige aprovação/.test(r.error),r);
 [s]=await call('POST','/solicitacoes/mover',{id:A2.id,etapa:'EM_APROVACAO'},E);t('a equipe não pula etapa (Pendente → Em aprovação)',s===403);
 await call('POST','/solicitacoes/mover',{id:A2.id,etapa:'EM_ANDAMENTO'},E);
 [s,r]=await call('POST','/solicitacoes/mover',{id:A2.id,etapa:'EM_APROVACAO',mensagem:'Pode conferir'},E);t('o responsável envia para aprovação',s===200&&r.status==='AGUARDANDO APROVAÇÃO DO SOLICITANTE'&&r.aprovacaoSolicitante==='PENDENTE'&&r.retornoSolicitante==='Pode conferir',r);
 [s]=await call('POST','/solicitacoes/mover',{id:A2.id,etapa:'CONCLUIDO'},E);t('a equipe não aprova a própria entrega',s===403);
 [s,r]=await call('POST','/solicitacoes/mover',{id:A2.id,etapa:'CONCLUIDO'},G);t('a Gerente aprova e conclui',s===200&&r.status==='CONCLUÍDA'&&r.aprovacaoSolicitante==='APROVADO'&&r.aprovadoPor==='Natália Mello',r);
 // sem responsável
 [s,r]=await call('POST','/solicitacoes/nova',{titulo:'Sem dono ainda'});const A4=r;
 [s,r]=await call('POST','/solicitacoes/mover',{id:A4.id,etapa:'EM_ANDAMENTO'},G);t('iniciar exige responsável (409)',s===409&&/Distribua/.test(r.error),r);
 [s]=await call('POST','/solicitacoes/mover',{id:A4.id,etapa:'XYZ'},G);t('etapa inválida é recusada',s===400);
 // cancelar
 [s,r]=await call('POST','/solicitacoes/mover',{id:A4.id,etapa:'CANCELADA'},G);t('cancelar exige motivo',s===409&&r.motivo===true);
 [s,r]=await call('POST','/solicitacoes/mover',{id:A4.id,etapa:'CANCELADA',motivo:'Duplicada'},G);t('a Gerente cancela com motivo',s===200&&r.cancelada===true&&r.etapa==='CONCLUIDO',r);
 [s]=await call('POST','/solicitacoes/mover',{id:A3.id,etapa:'CANCELADA',motivo:'quero cancelar'},E);t('a equipe não cancela',s===403);
 // histórico
 const tl=(await call('GET','/timeline?module=solicitacoes&id='+A2.id))[1].rows;
 t('o histórico registra cada passagem (início, aprovação e conclusão)',tl.some(z=>/EM EXECUÇÃO/.test(z.texto))&&tl.some(z=>/AGUARDANDO APROVAÇÃO/.test(z.texto))&&tl.some(z=>/CONCLUÍDA/.test(z.texto)),tl.map(z=>z.texto));
 // comentários
 [s]=await call('POST','/comments',{module:'solicitacoes',id:A1.id,texto:'Ajustei o logo.'},E);const cm=(await call('GET','/comments?module=solicitacoes&id='+A1.id))[1].rows;
 t('comentário interno fica na solicitação',s===200&&cm.some(z=>z.texto==='Ajustei o logo.'&&z.interno===1));
 // edição
 [s]=await call('POST','/solicitacoes/editar',{id:A3.id,titulo:'Convite da reunião de pais'},M);t('quem não é dono não edita',s===403);
 [s,r]=await call('POST','/solicitacoes/editar',{id:A3.id,titulo:'Convite da reunião de pais',prazo:dia(3),exigeAprovacao:'1'},E);
 t('o responsável edita os dados, mas não a exigência de aprovação',s===200&&r.titulo==='Convite da reunião de pais'&&r.prazoEfetivo===dia(3)&&r.exigeAprovacao==='0',r);
 // PUT genérico respeita o dono
 [s]=await call('PUT','/data?module=solicitacoes&id='+A3.id,{prioridade:'BAIXA'},M);t('edição genérica por quem não é o responsável é bloqueada',s===403);
 // painel: filtros usam campos calculados
 const pn=(await call('GET','/solicitacoes/painel'))[1];
 t('painel traz etapa, atraso e opções para os filtros',pn.rows.every(z=>z.etapa)&&pn.rows.find(z=>z.id===A2.id).atrasada===false&&pn.opcoes.segmentos.includes('Anos Finais')&&pn.opcoes.responsaveis.includes('Antônio Filho')&&pn.eu.role==='manager',pn.opcoes);
 [,r]=await call('POST','/solicitacoes/nova',{titulo:'Atrasada de teste',responsavel:'Antônio Filho',prazo:dia(-3)});const A5=r;t('atraso: prazo vencido e não concluída = atrasada',r.atrasada===true);
 [s]=await call('GET','/solicitacoes/painel',null,{...J});t('sem login o painel não abre',s===401);

 // ============ INTERFACE ============
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const errs=[];
 const entra=async(cod,w=1366,h=1000)=>{const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept(d.type()==='prompt'?'Motivo de teste':undefined));await p.goto(BASE+'/');await p.fill('#internalCode',cod);await p.fill('#internalPass',cod==='NAT-3301'?'Nat26ab':cod==='ANT-3302'?'Ant26ab':'Mon26ab');await p.click('#internalLoginBtn');await p.waitForSelector('#nav .navitem');await p.waitForFunction(()=>!document.querySelector('#content .loading'),null,{timeout:20000}).catch(()=>{});await p.waitForTimeout(800);return p};
 const p=await entra('NAT-3301');
 await p.evaluate(()=>go('solicitacoes'));await p.waitForSelector('.sl-board');
 t('Solicitações vive dentro de Planejamento (aba), sem "Fluxos" no menu',(await p.$$eval('#subtabs .subtab',e=>e.some(x=>/Solicita/.test(x.textContent))))&&!(await p.$$eval('#nav .navitem',e=>e.some(x=>/Fluxos|Gestão de Demandas/i.test(x.textContent)))));
 t('Kanban tem exatamente as 4 colunas',(await p.$$eval('.sl-col h3',e=>e.map(x=>x.textContent))).join()==='Pendente,Em andamento,Em aprovação,Concluído');
 t('o cartão mostra título, responsável e prazo',/Post do dia do professor/.test(await p.$eval(`.sl-card[data-id="${A2.id}"]`,e=>e.textContent))&&/Antônio Filho/.test(await p.$eval(`.sl-card[data-id="${A2.id}"]`,e=>e.textContent)));
 t('A5 (atrasada) aparece em Pendente com a marca "Atrasada"',/Atrasada/.test(await p.$eval(`.sl-col[data-etapa="PENDENTE"] .sl-card[data-id="${A5.id}"]`,e=>e.textContent)));
 t('KPIs: contagem por etapa e atrasadas',(await p.$$eval('.sl-kpi',e=>e.length))===5);
 // filtros
 await p.selectOption('#slResp','Antônio Filho');await p.waitForTimeout(150);
 t('filtro por responsável',(await p.$$eval('.sl-card',e=>e.length))>0&&await p.$$eval('.sl-card',e=>e.every(c=>/Antônio Filho/.test(c.textContent))));
 await p.selectOption('#slPrazo','atrasadas');await p.waitForTimeout(150);
 t('filtro por prazo: só atrasadas',(await p.$$eval('.sl-card',e=>e.length))>=1&&await p.$$eval('.sl-card',e=>e.every(c=>/Atrasada/.test(c.textContent))));
 await p.click('#slLimpa');await p.selectOption('#slSeg','Anos Finais');await p.waitForTimeout(150);
 t('filtro por segmento',await p.$$eval('.sl-card',e=>e.length>0&&e.every(c=>/Anos Finais/.test(c.textContent))));
 await p.click('#slLimpa');await p.selectOption('#slEtapa','CONCLUIDO');await p.waitForTimeout(150);
 t('filtro por status (Concluído)',(await p.$$eval('.sl-col[data-etapa="CONCLUIDO"] .sl-card',e=>e.length))>=2&&(await p.$$eval('.sl-col[data-etapa="PENDENTE"] .sl-card',e=>e.length))===0);
 await p.click('#slLimpa');
 // lista
 await p.click('[data-vista="lista"]');await p.waitForSelector('.sl-tabela');
 t('visão em lista mostra as solicitações e permite ordenar',(await p.$$eval('.sl-tabela tbody tr',e=>e.length))>=4);
 await p.click('[data-ord="prazo"]');await p.waitForTimeout(100);t('a ordenação por prazo funciona',(await p.$$eval('.sl-tabela tbody tr td:nth-child(6)',e=>e.length))>0);
 await p.click('[data-vista="kanban"]');await p.waitForSelector('.sl-board');
 // novo pelo formulário
 await p.click('#slNova');await p.waitForSelector('#slForm');
 await p.click('#nSalvar');t('formulário valida o título',/mínimo 3/.test(await p.textContent('#nErro')));
 await p.fill('#nTitulo','Vídeo institucional da matrícula');await p.fill('#nDesc','Vídeo de 30s');await p.selectOption('#nSeg','Infantil').catch(()=>{});await p.selectOption('#nResp','Monique Vilante');await p.fill('#nPrazo',dia(9));await p.selectOption('#nPrio','ALTA');await p.check('#nAprov');
 fs.writeFileSync('/tmp/evo-sl-anexo.txt','anexo de teste');await p.setInputFiles('#nArq','/tmp/evo-sl-anexo.txt');await p.click('#nSalvar');await p.waitForSelector('#slForm',{state:'detached'});
 const nova=((await call('GET','/data?module=solicitacoes'))[1].rows).find(z=>z.titulo==='Vídeo institucional da matrícula');
 t('cadastro pela tela: dados, responsável, aprovação e anexo',nova&&nova.responsavel==='Monique Vilante'&&nova.prioridade==='ALTA'&&nova.exigeAprovacao==='1'&&/evo-sl-anexo/.test(nova.anexos||''),nova);
 // mover por "Mover para…" e pelo botão principal
 await p.waitForSelector(`.sl-card[data-id="${nova.id}"]`);
 await p.selectOption(`.sl-mover[data-id="${nova.id}"]`,'EM_ANDAMENTO');await p.waitForTimeout(900);
 t('mover pelo menu do cartão',(await row(nova.id)).status==='EM EXECUÇÃO'&&await p.$(`.sl-col[data-etapa="EM_ANDAMENTO"] .sl-card[data-id="${nova.id}"]`)!==null);
 // arrastar e soltar
 await p.dragAndDrop(`.sl-card[data-id="${nova.id}"]`,'.sl-col[data-etapa="EM_APROVACAO"] .sl-drop');await p.waitForTimeout(1000);
 t('arrastar o cartão para outra coluna',(await row(nova.id)).status==='AGUARDANDO APROVAÇÃO DO SOLICITANTE');
 // detalhe: comentário, anexo, histórico
 await p.click(`[data-sl-abrir="${nova.id}"]`);await p.waitForSelector('#dForm');
 t('o detalhe mostra histórico, anexos e comentários',/Histórico/.test(await p.textContent('.sl-det'))&&/evo-sl-anexo/.test(await p.textContent('#dArqs'))&&await p.$('#dComAdd')!==null);
 await p.fill('#dComNovo','Revisar a legenda do vídeo');await p.click('#dComAdd');await p.waitForSelector('#dCom .tb-comment');
 t('comentar dentro da solicitação',/Revisar a legenda/.test(await p.textContent('#dCom')));
 await p.click('[data-close]');
 // aprovar pelo botão principal
 await p.waitForSelector(`[data-sl-mover="${nova.id}"]`);await p.click(`[data-sl-mover="${nova.id}"]`);await p.waitForTimeout(900);
 t('"Aprovar e concluir" move para Concluído',(await row(nova.id)).status==='CONCLUÍDA');
 // equipe só enxerga ações das suas
 const pe=await entra('ANT-3302');await pe.evaluate(()=>go('solicitacoes'));await pe.waitForSelector('.sl-board');
 t('a equipe vê o quadro mas só ganha ações nos cartões que são dela',(await pe.$$eval('.sl-card',e=>e.length))>0&&await pe.$$eval('.sl-card',e=>e.filter(c=>c.querySelector('.sl-mover')).every(c=>/Antônio Filho/.test(c.textContent))));
 t('a equipe não tem o botão de cancelar no detalhe',await (async()=>{await pe.click(`[data-sl-abrir="${A5.id}"]`);await pe.waitForSelector('#dForm');const v=await pe.$('#dCancelar')===null;await pe.click('[data-close]');return v})());
 await pe.click(`.sl-card[data-id="${A5.id}"] [data-sl-mover]`);await pe.waitForTimeout(900);
 t('a equipe inicia a sua pelo botão "Iniciar"',(await row(A5.id)).status==='EM EXECUÇÃO');
 // celular
 const pm=await entra('NAT-3301',390,800);await pm.evaluate(()=>go('solicitacoes'));await pm.waitForSelector('.sl-board');
 t('celular: sem rolagem horizontal',await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 // link antigo de Fluxos cai em Solicitações
 await p.evaluate(()=>go('fluxos'));await p.waitForSelector('.sl-board');t('o link antigo de Fluxos abre Solicitações',true);
 t('sem erros de JavaScript',errs.length===0,errs.join(' | '));
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
