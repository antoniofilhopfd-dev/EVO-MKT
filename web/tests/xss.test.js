// XSS armazenado: payloads em todos os campos de texto, renderizados em todas as telas internas, no Portal, na página de aprovação e nos diálogos. Uso: node xss.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');const {execFileSync}=require('child_process');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,400))};
const sql=q=>execFileSync('mariadb',['--default-character-set=utf8mb4','-uroot','-S','/run/mysqld/mysqld.sock','evowebtest','-N','-e',q],{encoding:'utf8'});
const P='"><img src=x onerror="window.__xss=(window.__xss||0)+1"><svg onload="window.__xss=99"><script>window.__xss=77</script>';
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1366,height:900}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));let ans='Senha26x';p.on('dialog',d=>d.accept(ans));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');
 const api=(m,u,body)=>p.evaluate(async([m,u,body])=>api(u,{method:m,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),[m,u,body]);
 const ids={};
 for(const [m,extra] of [['tarefas',{descricao:P,responsavel:P}],['projetos',{descricao:P}],['eventos',{local:P}],['campanhas',{objetivo:P,publico:P,metaAdsId:P}],['ideias',{descricao:P}],['conteudos',{legenda:P,hashtags:P,linkPublicacao:'javascript:window.__xss=55',revisor:P,canal:'TikTok'}],['equipe',{funcao:P,email:P}],['arquivos',{caminhoArquivo:P}],['trafego',{periodo:P}],['instagram',{periodo:P,seguidores:'1'}],['agenda',{local:P}],['templates',{descricao:P}],['relatorios',{descricao:P}],['aprovacoes',{aprovador:P}]]){
  try{ids[m]=(await api('POST','/data?module='+m,{titulo:P,status:m==='conteudos'?'REVISÃO':undefined,...extra})).id}catch(e){console.log('  (aviso) não foi possível criar em',m,String(e.message).slice(0,80))}}
 // comentários, checklist, avisos, publicações do Instagram
 await api('POST','/comments',{module:'tarefas',id:ids.tarefas,texto:P});await api('POST','/checklist',{module:'tarefas',id:ids.tarefas,texto:P});await api('POST','/manager/notices',{titulo:P,texto:P});
 sql(`INSERT INTO ig_posts(media_id,publicado_em,tipo,legenda,curtidas,comentarios,permalink,atualizado_em) VALUES('xss1','2026-09-01T10:00:00+0000','FEED','${P.replace(/'/g,"''")}',5,1,'javascript:window.__xss=66','x')`);
 // demanda do Portal com payload
 const ptok=(await (await fetch(BASE+'/api/portal/login',{method:'POST',headers:{'Content-Type':'application/json','X-EVO':'1'},body:JSON.stringify({codigo:'INF-2601',senha:pw('INF-2601')})})).json()).token;
 const rq=await (await fetch(BASE+'/api/portal/requests',{method:'POST',headers:{'X-Portal-Token':ptok,'X-EVO':'1','Content-Type':'application/json'},body:JSON.stringify({titulo:P,objetivo:P,descricao:P,segmento:'Infantil',prioridade:'MÉDIA',publicoAlvo:P,mensagemPrincipal:P,referencias:P})})).json();
 for(const s of ['EM ANÁLISE','EM EXECUÇÃO'])await api('PUT','/data?module=solicitacoes&id='+rq.id,{status:s,retornoSolicitante:P});
 await api('POST','/comments',{module:'solicitacoes',id:rq.id,texto:P,interno:false});
 await api('PUT','/data?module=solicitacoes&id='+rq.id,{status:'AGUARDANDO APROVAÇÃO DO SOLICITANTE',entregaMensagem:P});
 const link=await api('POST','/manager/approval-link',{id:rq.id});
 // telas internas
 const paginas=await p.evaluate(()=>Object.keys(MODULES).filter(k=>canAccess(k)));
 for(const pg of paginas){await p.evaluate(x=>go(x),pg);await p.waitForTimeout(450)}
 t(`todas as telas internas (${paginas.length}) renderizam os payloads como texto, sem executar nada`,(await p.evaluate(()=>window.__xss))===undefined,await p.evaluate(()=>window.__xss));
 // diálogos: ficha com comentários/checklist, linha do tempo, notificações, lista de origem
 await p.evaluate(async i=>{const d=await getRows('tarefas',true);state.module='tarefas';state.rows=d.rows;openModal(d.rows.find(x=>x.id===i))},ids.tarefas);await p.waitForSelector('#trabalhoBox #tbComAdd');await p.waitForTimeout(300);
 await p.evaluate(()=>closeModal());
 await p.evaluate(i=>showTimeline('tarefas',i),ids.tarefas);await p.waitForTimeout(400);await p.evaluate(()=>document.querySelectorAll('.admin-overlay').forEach(x=>x.remove()));
 await p.evaluate(()=>abrirNotificacoes());await p.waitForTimeout(500);await p.evaluate(()=>document.querySelectorAll('.admin-overlay').forEach(x=>x.remove()));
 await p.evaluate(async i=>{const d=await getRows('conteudos',true);state.module='conteudos';state.rows=d.rows;openModal(d.rows.find(x=>x.id===i))},ids.conteudos);await p.waitForSelector('#trabalhoBox');await p.waitForTimeout(300);
 t('link com esquema javascript: nunca vira <a href>',!(await p.$$eval('#trabalhoBox a',as=>as.some(a=>/^javascript:/i.test(a.getAttribute('href')||'')))));
 await p.evaluate(()=>closeModal());
 await p.evaluate(()=>{adminTab='integracoes';go('administracao')});await p.waitForTimeout(700);
 await p.evaluate(()=>{adminTab='avisos';go('administracao')});await p.waitForTimeout(700);
 await p.evaluate(()=>{adminTab='auditoria';go('administracao')});await p.waitForTimeout(700);
 await p.evaluate(()=>go('instagram'));await p.waitForTimeout(900);
 await p.evaluate(()=>go('solicitacoes'));await p.waitForTimeout(900);
 // relatório impresso (document.write): captura o HTML que seria escrito
 const html=await p.evaluate(()=>{let h='';const o=window.open;window.open=()=>({document:{write:s=>{h+=s},close(){}},focus(){},print(){}});try{printRequestMonthlyReport(state.rows,new Date().toISOString().slice(0,7))}catch(e){h+='ERRO '+e.message}window.open=o;return h});
 t('relatório impresso de solicitações escapa o conteúdo (nenhuma tag injetada no HTML escrito)',html.length>200&&!/<img src=x/.test(html)&&!/<svg onload/.test(html)&&!/<script>window\.__xss/.test(html),html.slice(0,200));
 t('nada executou nos diálogos nem nas telas de administração',(await p.evaluate(()=>window.__xss))===undefined);
 // Portal
 const pp=await (await b.newContext({viewport:{width:1100,height:900}})).newPage();pp.on('pageerror',e=>errs.push('portal: '+e.message));pp.on('dialog',d=>d.accept('Portal26'));
 await pp.goto(BASE+'/solicitante');await pp.fill('#code','INF-2601');await pp.fill('#pass',pw('INF-2601'));await pp.click('#login');await pp.waitForSelector('#panel',{timeout:8000}).catch(()=>{});await pp.waitForTimeout(800);
 await pp.evaluate(()=>{const b=document.getElementById('quickList');if(b)b.click()});await pp.waitForTimeout(1200);
 await pp.evaluate(()=>document.querySelectorAll('details.timeline-details').forEach(d=>{d.open=true}));await pp.waitForTimeout(900);
 t('Portal: lista, histórico e comentários renderizam payloads como texto',(await pp.evaluate(()=>window.__xss))===undefined&&/Demanda|solicita|Nova|Minhas/i.test(await pp.$eval('body',e=>e.innerText)));
 // página pública de aprovação
 const ap=await (await b.newContext()).newPage();ap.on('pageerror',e=>errs.push('aprovação: '+e.message));
 await ap.goto(link.url.replace(/^https?:\/\/[^/]+/,BASE));await ap.waitForSelector('#nome',{timeout:8000}).catch(()=>{});await ap.waitForTimeout(500);
 t('página pública de aprovação escapa título, mensagem e arquivos',(await ap.evaluate(()=>window.__xss))===undefined&&!!(await ap.$('#nome')));
 t('nenhum erro de JavaScript em nenhuma das telas',errs.length===0,errs.join('|'));
 await b.close();console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
