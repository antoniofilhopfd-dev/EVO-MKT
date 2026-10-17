// Capturas reais finais (não faz parte da suíte padrão). Uso: ./run-web.sh capturas  → grava em docs/screenshots/final/ e gera o INDEX.md
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs'),path=require('path');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
const DIR=process.env.PRINTS||path.join(__dirname,'../docs/screenshots/final');fs.mkdirSync(DIR,{recursive:true});for(const f of fs.readdirSync(DIR))if(f.endsWith('.png'))fs.unlinkSync(path.join(DIR,f));
const indice=[];const dia=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1440,height:900},locale:'pt-BR',timezoneId:'America/Recife'});const p=await ctx.newPage();let ans='Senha26x';p.on('dialog',d=>d.accept(ans));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');ans='ok';
 const api=(m,u,body)=>p.evaluate(async([m,u,body])=>api(u,{method:m,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),[m,u,body]);
 const shot=async(arq,titulo,mostra,pagina=p)=>{await pagina.waitForTimeout(700);await pagina.evaluate(()=>{const t=document.getElementById('toast');if(t)t.classList.add('hidden')});await pagina.screenshot({path:path.join(DIR,arq+'.png')});indice.push([arq+'.png',titulo,mostra])};
 const limpa=()=>p.evaluate(()=>{state.cache.clear();state.cacheAt.clear()});
 const ir=async(pg)=>{await limpa();await p.evaluate(x=>{document.querySelectorAll('.admin-overlay').forEach(o=>o.remove());go(x)},pg);await p.waitForTimeout(1100)};
 // ---------- dados de demonstração (todos marcados com [DEMO]) ----------
 const ptok=async c=>(await (await fetch(BASE+'/api/portal/login',{method:'POST',headers:{'Content-Type':'application/json','X-EVO':'1'},body:JSON.stringify({codigo:c,senha:pw(c)})})).json()).token;
 const T1=await ptok('INF-2601');
 const dem=async(titulo,seg,extra={})=>(await (await fetch(BASE+'/api/portal/requests',{method:'POST',headers:{'X-Portal-Token':T1,'X-EVO':'1','Content-Type':'application/json'},body:JSON.stringify({titulo,objetivo:'Divulgar a atividade para as famílias e abrir inscrições.',segmento:seg,prioridade:'MÉDIA',tipoSolicitacao:'Post',prazo:dia(6),canal:'Instagram',publicoAlvo:'Famílias da Educação Infantil',...extra})})).json()).id;
 const s1=await dem('[DEMO] Cartaz da Feira de Ciências','Infantil');const s2=await dem('[DEMO] Reels da matrícula 2027','Infantil',{tipoSolicitacao:'Reels',prioridade:'ALTA'});const s3=await dem('[DEMO] Convite da formatura','Infantil',{tipoSolicitacao:'Arte impressa'});
 const put=(id,b)=>api('PUT','/data?module=solicitacoes&id='+id,b);
 await put(s2,{status:'EM ANÁLISE'});await put(s2,{status:'DISTRIBUÍDA',responsavel:'Antônio Filho'});await put(s2,{status:'EM EXECUÇÃO'});
 await put(s3,{status:'AGUARDANDO SOLICITANTE',triagemStatus:'DEVOLVIDA PARA AJUSTES',retornoSolicitante:'Faltam a data e o local da formatura.'});
 await api('POST','/comments',{module:'solicitacoes',id:s2,texto:'Roteiro aprovado com a coordenação.',interno:false});await api('POST','/comments',{module:'solicitacoes',id:s2,texto:'Gravar na quarta de manhã.',interno:true});
 const t1=(await api('POST','/data?module=tarefas',{titulo:'[DEMO] Roteiro do Reels da matrícula',status:'EM ANDAMENTO',prioridade:'ALTA',responsavel:'Antônio Filho',prazo:dia(3),segmento:'Infantil',solicitacaoId:s2})).id;
 await api('POST','/data?module=tarefas',{titulo:'[DEMO] Gravar depoimentos',status:'NOVO',responsavel:'Natália Mello',prazo:dia(5),tarefaPaiId:t1,segmento:'Infantil'});
 await api('POST','/data?module=tarefas',{titulo:'[DEMO] Editar o vídeo',status:'NOVO',responsavel:'Aluizo Junior',prazo:dia(7),dependeDe:t1,segmento:'Infantil'});
 await api('POST','/data?module=tarefas',{titulo:'[DEMO] Relatório semanal',status:'NOVO',responsavel:'Natália Mello',prazo:dia(2),recorrencia:'SEMANAL'});
 await api('POST','/data?module=tarefas',{titulo:'[DEMO] Cartaz atrasado',status:'BLOQUEADO',responsavel:'Aluizo Junior',prazo:dia(-2)});
 await api('POST','/checklist',{module:'tarefas',id:t1,texto:'Definir cenas'});await api('POST','/checklist',{module:'tarefas',id:t1,texto:'Revisar com a coordenação'});await api('POST','/comments',{module:'tarefas',id:t1,texto:'Primeira versão do roteiro pronta.'});
 await api('POST','/data?module=projetos',{titulo:'[DEMO] Campanha de matrículas 2027',status:'EM ANDAMENTO',responsavel:'Natália Mello',prazo:dia(60),segmento:'Geral',progresso:'35'});
 await api('POST','/data?module=eventos',{titulo:'[DEMO] Feira de Ciências',status:'PRÉ-EVENTO',dataInicio:dia(14),responsavel:'Aluizo Junior',segmento:'Anos Iniciais'});
 await api('POST','/data?module=agenda',{titulo:'[DEMO] Reunião de pauta',inicioEm:dia(1)+'T10:00',fimEm:dia(1)+'T11:00',responsavel:'Natália Mello'});
 await api('POST','/data?module=campanhas',{titulo:'[DEMO] Matrículas 2027',status:'ATIVA',dataInicio:dia(-10),periodoFim:dia(50),canal:'Instagram',orcamento:'2000',metaAdsId:'c1',objetivo:'Gerar contatos de famílias',segmento:'Geral'});
 const c1=(await api('POST','/data?module=conteudos',{titulo:'[DEMO] Reels: bastidores da feira',status:'REVISÃO',canal:'Instagram',formato:'Reels',revisor:'Natália Mello',publicacaoEm:dia(4)+'T10:00',segmento:'Anos Iniciais'})).id;
 await api('POST','/data?module=conteudos',{titulo:'[DEMO] Vídeo: depoimento de aluno',status:'APROVADO',canal:'YouTube',formato:'Vídeo',publicacaoEm:dia(6)+'T18:00'});
 await api('POST','/data?module=conteudos',{titulo:'[DEMO] TikTok: tour pela escola',status:'PROGRAMADO',canal:'TikTok',formato:'Vídeo',publicacaoEm:dia(3)+'T12:00'});
 await api('POST','/data?module=conteudos',{titulo:'[DEMO] Post: Dia do Professor',status:'PRODUÇÃO',canal:'Instagram',formato:'Feed',publicacaoEm:dia(2)+'T09:00'});
 await api('POST','/data?module=ideias',{titulo:'[DEMO] Série "Um dia na escola"',status:'IDEIA',categoriaIdeia:'Série'});
 await api('POST','/data?module=arquivos',{titulo:'[DEMO] Manual da marca',tipoArquivo:'PDF',caminhoArquivo:'Marketing/Marca/manual.pdf',responsavel:'Natália Mello'});
 // Meta (servidor simulado): Instagram + anúncios somente leitura
 await api('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});await api('POST','/integrations/ads/config',{ativar:true});await api('GET','/integrations/ads/accounts');await api('POST','/integrations/ads/account',{conta:'111222333'});
 try{await api('POST','/integrations/instagram/sync',{})}catch{}try{await api('POST','/integrations/ads/sync',{})}catch{}
 // aprovação com link
 const s4=await dem('[DEMO] Folder institucional','Infantil',{tipoSolicitacao:'Material gráfico'});for(const st of ['EM ANÁLISE','EM EXECUÇÃO'])await put(s4,{status:st});
 await p.evaluate(async i=>{const f=new FormData();f.append('files',new File(['demo'],'folder-final.txt',{type:'text/plain'}));await fetch('/api/manager/upload?id='+i,{method:'POST',headers:{'X-EVO':'1'},body:f})},s4);await put(s4,{status:'AGUARDANDO APROVAÇÃO DO SOLICITANTE'});
 // ---------- 16 capturas ----------
 await ir('hoje');await shot('01_visao_geral','Visão geral','Tela "Hoje" da Gerência: prioridades, prazos e pendências (dados [DEMO]).');
 await ir('central');await p.waitForSelector('#indPainel .ind');await shot('02_navegacao_central','Navegação principal e Central Operacional','Menu com as 8 áreas, seções da área "Visão geral", indicadores de SLA/NPS (cada cartão abre os registros de origem), saúde por segmento e datas para planejar.');
 await ir('solicitacoes');await shot('03_solicitacoes','Solicitações','Triagem, fila de complementação, entregas aguardando aprovação e relatório mensal.');
 const P=await (await b.newContext({viewport:{width:1280,height:900},locale:'pt-BR'})).newPage();P.on('dialog',d=>d.accept('Portal26'));
 await P.goto(BASE+'/solicitante');await P.fill('#code','INF-2601');await P.fill('#pass',pw('INF-2601'));await P.click('#login');await P.waitForSelector('#panel',{timeout:10000});await P.waitForTimeout(900);
 await P.evaluate(()=>{const q=document.getElementById('quickNew');if(q)q.click()});await P.waitForSelector('#form',{timeout:8000});await shot('04_formulario_solicitacao','Formulário de solicitação (Portal)','Campos da coordenação: segmento, tipo de material, prazo, data de publicação, objetivo, público, canal, referências e anexos.',P);
 await P.getByRole('button',{name:'Minhas demandas'}).click();await P.waitForTimeout(1500);await P.evaluate(()=>document.querySelectorAll('details.timeline-details').forEach((d,i)=>{if(i<1)d.open=true}));await shot('06_portal_solicitante','Portal Solicitante','A coordenação acompanha só as demandas do próprio segmento: status, SLA, retorno do Marketing, histórico real e ações pendentes.',P);
 await ir('solicitacoes');await p.evaluate(async i=>{const d=await getRows('solicitacoes',true);state.module='solicitacoes';state.rows=d.rows;openModal(d.rows.find(x=>x.id===i))},s2);await p.waitForSelector('#trabalhoBox #tbComAdd');await p.evaluate(()=>document.getElementById('trabalhoBox').scrollIntoView({block:'center'}));await shot('05a_ficha_demanda','Detalhes de uma demanda (ficha)','Ficha com campos, comentários (internos e visíveis ao solicitante) e botões de linha do tempo.');
 await p.evaluate(i=>showTimeline('solicitacoes',i),s2);await p.waitForSelector('.timeline-real li');await shot('05_historico_demanda','Histórico de uma demanda','Linha do tempo oficial: criação, mudanças de status e de responsável, com autor, data e motivo.');
 await p.evaluate(()=>{document.querySelectorAll('.admin-overlay').forEach(o=>o.remove());closeModal()});
 await p.evaluate(()=>setPref('view.tarefas','kanban'));await ir('tarefas');await shot('07_planejamento_tarefas','Planejamento: tarefas em quadro','Quadro Kanban por status, filtros por responsável, subtarefas, dependências, tarefa recorrente e tarefa atrasada.');
 await ir('calendario');await p.waitForSelector('.cm-mes');await shot('08_calendario','Calendário','Compromissos, reuniões, coberturas, publicações e prazos das solicitações, com filtros por tipo e responsável.');
 await ir('tarefas');await p.evaluate(async i=>{const d=await getRows('tarefas',true);state.module='tarefas';state.rows=d.rows;openModal(d.rows.find(x=>x.id===i))},t1);await p.waitForSelector('#trabalhoBox #tbChkAdd');await p.evaluate(()=>document.getElementById('trabalhoBox').scrollIntoView({block:'center'}));await shot('09_ficha_tarefa','Kanban e tarefas: ficha da tarefa','Subtarefas, checklist, comentários e histórico de uma tarefa (fonte única dos dados).');
 await p.evaluate(()=>closeModal());
 await ir('aprovacoes');await p.waitForSelector('#filaUnica');await shot('10_conteudo_aprovacoes','Conteúdo e aprovações','Fila única: cadeia de aprovação interna, conteúdos em revisão e entregas aguardando o solicitante.');
 await p.evaluate(()=>setPref('view.conteudos','table'));await ir('conteudos');await shot('10a_conteudos','Conteúdo por canal e estado de publicação','Instagram, TikTok e YouTube; estado de publicação separado do status editorial (agendado internamente ≠ publicação confirmada).');
 await ir('trafego');await p.waitForSelector('#metaAdsBox');await p.evaluate(()=>document.getElementById('metaAdsBox').scrollIntoView());await shot('11_trafego','Tráfego','Campanhas lidas da Meta (somente leitura), com fonte e data de atualização. Dados do servidor simulado de testes.');
 await ir('campanhas');await shot('12_campanhas_metricas','Campanhas e métricas','Campanhas planejadas (orçamento planejado) e métricas; o gasto real vem da leitura da Meta.');
 await ir('relatorios');await p.waitForSelector('#painelInt h4');await p.waitForTimeout(1200);await shot('13_relatorios','Relatórios','Painel integrado: redes, tráfego (planejado × real), operação e institucional, cada bloco com fonte, período e última atualização.');
 await ir('equipe');await shot('14_equipe','Equipe','Pessoas, funções, capacidade e carga.');
 await ir('arquivos');await shot('14a_arquivos','Arquivos','Biblioteca de caminhos e materiais.');
 await p.evaluate(()=>{adminTab='integracoes';go('administracao')});await p.waitForSelector('#prontidao');await shot('15_administracao','Administração: integrações','Prontidão (o que falta configurar), IA, anúncios somente leitura e automações internas. Nenhum segredo é exibido.');
 await p.evaluate(()=>{adminTab='backups';go('administracao')});await p.waitForSelector('#bkNow');await shot('15a_backups','Administração: backups','Criar, validar e restaurar backups; verificação de integridade dos dados.');
 const M=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'pt-BR'})).newPage();M.on('dialog',d=>d.accept('ok'));
 await M.goto(BASE+'/');await M.fill('#internalCode','NAT-3301');await M.fill('#internalPass','Senha26x');await M.click('#internalLoginBtn');await M.waitForSelector('#nav .navitem',{state:'attached'});await M.waitForTimeout(1200);
 await M.evaluate(()=>go('tarefas'));await M.waitForTimeout(1200);await shot('16_responsivo_celular','Interface responsiva (celular, 390 px)','Planejamento no celular: seções roláveis, filtros que quebram linha, sem rolagem horizontal da página.',M);
 const TB=await (await b.newContext({viewport:{width:820,height:1100},locale:'pt-BR'})).newPage();TB.on('dialog',d=>d.accept('ok'));
 await TB.goto(BASE+'/');await TB.fill('#internalCode','NAT-3301');await TB.fill('#internalPass','Senha26x');await TB.click('#internalLoginBtn');await TB.waitForSelector('#nav .navitem',{state:'attached'});await TB.waitForTimeout(1200);
 await TB.evaluate(()=>go('relatorios'));await TB.waitForTimeout(1800);await shot('16a_responsivo_tablet','Interface responsiva (tablet, 820 px)','Relatórios no tablet.',TB);
 const md=['# Capturas reais finais','',`Geradas em ${new Date().toLocaleString('pt-BR')} pelo próprio aplicativo (build de produção) com \`tests/capturas.test.js\`, contra um banco de testes. Todos os registros de demonstração têm o prefixo **[DEMO]**; não há dados pessoais, senhas, códigos de acesso nem tokens nas imagens. Tráfego e Instagram usam o **servidor simulado** da Meta usado nos testes — os números **não** são do Colégio.`,'','| Arquivo | Tela | O que demonstra |','|---|---|---|',...indice.map(([a,t,m])=>`| ![${t}](${a}) \`${a}\` | ${t} | ${m} |`)];
 fs.writeFileSync(path.join(DIR,'INDEX.md'),md.join('\n')+'\n');
 await b.close();console.log(indice.length+' capturas gravadas em '+DIR);
})().catch(e=>{console.error(e);process.exit(1)});
