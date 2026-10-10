// Gera capturas de tela das telas principais em /tmp/evo-prints (não é teste). Uso: node prints.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const D=process.env.PRINTS||'/tmp/evo-prints';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await (await b.newContext({viewport:{width:1366,height:850}})).newPage();let ok=false;p.on('dialog',d=>ok?d.accept('Ajuste pedido pelo solicitante'):d.accept('Senha26x'));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.today-banner');ok=true;
 const put=(i,s,x={})=>p.evaluate(async([i,s,x])=>{await api('/data?module=solicitacoes&id='+i,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:s,...x})})},[i,s,x]);
 const mk=(t,tp,s)=>p.evaluate(async([t,tp,s])=>(await api('/data?module=solicitacoes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({titulo:t,segmento:'Infantil',tipoSolicitacao:tp,status:s,prioridade:'MÉDIA'})})).id,[t,tp,s]);
 const a=await mk('Reels da matrícula 2027','Reels','AGUARDANDO TRIAGEM');await put(a,'EM ANÁLISE');await put(a,'DISTRIBUÍDA',{responsavel:'Antônio Filho'});await put(a,'EM EXECUÇÃO');await put(a,'AGUARDANDO APROVAÇÃO DO SOLICITANTE');await put(a,'EM EXECUÇÃO');await put(a,'AGUARDANDO APROVAÇÃO DO SOLICITANTE');await put(a,'CONCLUÍDA');
 const c=await mk('Post do Dia do Professor','Post','AGUARDANDO TRIAGEM');await put(c,'AGUARDANDO SOLICITANTE');
 await mk('Cartaz da feira de ciências','Arte impressa','AGUARDANDO TRIAGEM');
 await p.evaluate(()=>go('central'));await p.waitForSelector('#indPainel .ind');await p.waitForTimeout(500);await p.screenshot({path:D+'/01_central_indicadores.png'});
 await p.click('#indPainel [data-ind="abertas"]');await p.waitForSelector('.admin-overlay .alert-row');await p.screenshot({path:D+'/02_indicador_lista_origem.png'});await p.click('.admin-overlay [data-close]');
 await p.evaluate(()=>go('solicitacoes'));await p.waitForTimeout(1500);
 await p.evaluate(i=>{openModal(state.rows.find(x=>x.id===i))},a);await p.waitForSelector('#btnTimeline');await p.click('#btnTimeline');await p.waitForSelector('.timeline-real li');await p.screenshot({path:D+'/03_linha_do_tempo.png'});
 await p.evaluate(()=>go('hoje'));await p.waitForSelector('.today-banner');await p.evaluate(()=>abrirNotificacoes());await p.waitForSelector('.admin-overlay .notif');await p.screenshot({path:D+'/04_notificacoes.png'});await p.evaluate(()=>document.querySelectorAll('.admin-overlay').forEach(x=>x.remove()));
 await p.setViewportSize({width:360,height:740});const m=p;await m.reload();await m.waitForSelector('#nav .navitem',{state:'attached'});await m.waitForTimeout(1200);
 for(const [pg,f] of [['tarefas','05_celular_tarefas'],['solicitacoes','06_celular_solicitacoes'],['central','07_celular_central']]){await m.evaluate(x=>go(x),pg);await m.waitForTimeout(1200);await m.screenshot({path:D+'/'+f+'.png'})}
 await p.setViewportSize({width:1366,height:850});await p.evaluate(()=>go('relatorios'));await p.waitForSelector('.see-also');await p.waitForTimeout(800);await p.screenshot({path:D+'/08_relatorios_ver_tambem.png'});
 await b.close()})();
