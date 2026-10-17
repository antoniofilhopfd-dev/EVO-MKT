// Interface: 9 áreas, seções, ficha com comentários/checklist/subtarefas, decisão de conteúdo, diálogos acessíveis, relatórios, tráfego, administração. Uso: node ui10.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,400))};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await (await b.newContext({viewport:{width:1366,height:1000}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));let ans='Senha26x';p.on('dialog',d=>d.accept(ans));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.db-topo');ans='Subtarefa criada pela tela';
 const api=(m,u,body)=>p.evaluate(async([m,u,body])=>api(u,{method:m,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),[m,u,body]);
 const nav=await p.$$eval('#nav .navitem .navlabel',e=>e.map(x=>x.innerText.trim()));
 t('menu lateral: 9 módulos, sem itens decorativos',nav.length===9&&nav[0]==='Dashboard'&&nav[3]==='Instagram'&&nav[8]==='Configurações',nav.join('|'));
 const areas={planejamento:['Ações','Solicitações'],instagramarea:['Estúdio','Conteúdos','Aprovações','Métricas'],trafego:['Tráfego','Gerenciador'],relatorios:['Relatórios','Fechamento mensal']};
 const pag={planejamento:'planejamento',instagramarea:'studio',trafego:'trafego',relatorios:'relatorios'};
 for(const [k,esperado] of Object.entries(areas)){await p.evaluate(x=>go(x),pag[k]);await p.waitForSelector('#subtabs .subtab');const sub=await p.$$eval('#subtabs .subtab',e=>e.map(x=>x.innerText.trim()));t(`seções de ${k}: ${esperado.join(', ')}`,esperado.every(x=>sub.includes(x)),sub.join('|'))}
 await p.click('#subtabs .subtab:nth-child(2)');await p.waitForTimeout(600);t('clicar numa seção troca de tela e marca a seção ativa',await p.$eval('#subtabs .subtab.active',e=>e.innerText)==='Fechamento mensal');
 // ficha da tarefa
 const tid=(await api('POST','/data?module=tarefas',{titulo:'Tarefa para a ficha',status:'NOVO',responsavel:'Natália Mello'})).id;
 await p.evaluate(x=>go('tarefas'),0);await p.waitForTimeout(800);
 await p.evaluate(async i=>{const d=await getRows('tarefas',true);state.module='tarefas';state.rows=d.rows;openModal(d.rows.find(x=>x.id===i))},tid);await p.waitForSelector('#trabalhoBox #tbComAdd');
 t('diálogo da ficha tem papel de diálogo, aria-modal e nome acessível',await p.$eval('#modal .modalcard',e=>e.getAttribute('role')==='dialog'&&e.getAttribute('aria-modal')==='true'&&!!e.getAttribute('aria-labelledby')));
 t('o foco entra no diálogo ao abrir',await p.evaluate(()=>!!document.activeElement.closest('#modal')));
 for(let i=0;i<60;i++)await p.keyboard.press('Tab');
 t('Tab não escapa do diálogo (foco preso)',await p.evaluate(()=>!!document.activeElement.closest('#modal')));
 await p.fill('#tbComNovo','Primeiro comentário pela interface');await p.click('#tbComAdd');await p.waitForFunction(()=>/Primeiro comentário/.test(document.querySelector('#trabalhoBox').innerText));
 await p.fill('#tbChkNovo','Revisar arte');await p.click('#tbChkAdd');await p.waitForSelector('[data-chk]');await p.click('[data-chk]');await p.waitForFunction(()=>document.querySelector('#trabalhoBox .tb-item.feito'));
 t('comentário e checklist (com item marcado) aparecem na ficha',/Revisar arte/.test(await p.$eval('#trabalhoBox',e=>e.innerText)));
 await p.click('#tNovaSub');await p.waitForFunction(()=>/Subtarefa criada pela tela/.test(document.querySelector('#trabalhoBox').innerText));t('subtarefa criada pela ficha aparece vinculada',true);
 await p.keyboard.press('Escape');await p.waitForTimeout(300);t('Esc fecha o diálogo',await p.$eval('#modal',e=>e.classList.contains('hidden')));
 // conteúdo: decisão de revisão
 const cid=(await api('POST','/data?module=conteudos',{titulo:'Reels da feira',status:'REVISÃO',canal:'TikTok',revisor:'Natália Mello'})).id;
 await p.evaluate(async i=>{const d=await getRows('conteudos',true);state.module='conteudos';state.rows=d.rows;openModal(d.rows.find(x=>x.id===i))},cid);await p.waitForSelector('#cDecidir');
 t('ficha do conteúdo mostra o estado de publicação e o botão de decisão para o revisor',/EM PRODUÇÃO/.test(await p.$eval('#trabalhoBox',e=>e.innerText)));
 await p.click('#cDecidir');await p.waitForSelector('[data-d="APROVADO"]');await p.click('[data-d="APROVADO"]');await p.waitForTimeout(800);
 t('aprovar pela tela muda o conteúdo para APROVADO',(await api('GET','/data?module=conteudos&id='+cid)).status==='APROVADO');
 // telas
 await p.evaluate(()=>go('conteudos'));await p.waitForSelector('#canalFilter',{state:'attached'});await p.evaluate(()=>document.querySelector('.cm-maisfiltros')?.setAttribute('open',''));t('Conteúdos tem filtros de canal e de estado de publicação',!!(await p.$('#estadoFilter')));
 await p.evaluate(()=>go('aprovacoes'));await p.waitForSelector('#filaUnica');t('Aprovações reúne conteúdos e entregas numa fila só',/Conteúdos em revisão/.test(await p.$eval('#filaUnica',e=>e.innerText)));
 await p.evaluate(()=>go('relatorios'));await p.waitForSelector('#painelInt h4');await p.waitForTimeout(800);
 const rel=await p.$eval('#painelInt',e=>e.innerText);t('Relatórios: painel integrado separa redes, tráfego, operação e institucional, com fonte e data',/1\. Redes sociais/.test(rel)&&/2\. Tráfego pago/.test(rel)&&/3\. Indicadores operacionais/.test(rel)&&/4\. Indicadores institucionais/.test(rel)&&/fonte:/.test(rel)&&/Gerado em/.test(rel),rel.slice(0,300));
 t('Relatórios: não estima indicadores institucionais',/Nada é estimado/.test(rel));
 await p.evaluate(()=>go('trafego'));await p.waitForSelector('#metaAdsBox');t('Tráfego: bloco "Meta Ads somente leitura" com instrução quando não há dados',/SOMENTE LEITURA/i.test(await p.$eval('#metaAdsBox',e=>e.innerText)));
 await p.evaluate(()=>{adminTab='integracoes';go('administracao')});await p.waitForSelector('#adsCard');
 t('Administração → Integrações: cartões de anúncios, IA, automações e prontidão',!!(await p.$('#autCard'))&&!!(await p.$('#iaCard'))&&!!(await p.$('#prontidao')));
 await p.evaluate(()=>{adminTab='backups';go('administracao')});await p.waitForSelector('#bkInteg');await p.click('#bkInteg');await p.waitForSelector('.admin-overlay');
 t('Verificar integridade: relatório somente leitura no estado normal',/Nenhum problema/.test(await p.$eval('.admin-overlay',e=>e.innerText)),await p.$eval('.admin-overlay',e=>e.innerText));
 t('sem erros de JS',errs.length===0,errs.join('|'));
 await b.close();console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
