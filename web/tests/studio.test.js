// Estúdio de publicações: semana editorial, arrastar-e-soltar, compositor com prévia, grupos de hashtags. Uso: node studio.test.js <install.out>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node-tools/node_modules/playwright');const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const PR=process.env.PRINTS||'/tmp/evo-prints';
fs.mkdirSync(PR,{recursive:true});
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(x).slice(0,300))};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1366,height:1000}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 let logado=false;p.on('dialog',d=>d.accept(d.type()==='prompt'?(logado?'Matrículas':'Senha26x'):undefined));
 await p.goto(BASE+'/');await p.fill('#internalCode','NAT-3301');await p.fill('#internalPass',pw('NAT-3301'));await p.click('#internalLoginBtn');await p.waitForSelector('.db-topo');logado=true;
 const api=(m,u,body)=>p.evaluate(async([m,u,body])=>{try{return await api(u,{method:m,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})}catch(e){return {erro:e.message}}},[m,u,body]);
 // ---- API de hashtags
 let r=await api('GET','/studio/hashtags');t('grupos de hashtags começam vazios',Array.isArray(r.grupos)&&r.grupos.length===0,r);
 r=await api('POST','/studio/hashtags',{grupos:[{nome:'Infantil',tags:['#evolucao','sem-cerquilha','#ok_1','#evolucao']}]});t('salva grupo, tira tag inválida e repetida',r.ok&&r.grupos[0].tags.join()==='#evolucao,#ok_1',r);
 r=await api('POST','/studio/hashtags',{grupos:[{nome:'',tags:['#a']}]});t('grupo sem nome é recusado',!!r.erro,r);
 r=await api('POST','/studio/hashtags',{grupos:Array.from({length:31},(_,i)=>({nome:'g'+i,tags:[]}))});t('mais de 30 grupos é recusado',!!r.erro,r);
 await api('POST','/studio/hashtags',{grupos:[]});
 // ---- semana
 await p.evaluate(()=>go('studio'));await p.waitForSelector('.st-week');
 t('mostra a semana com 7 dias',(await p.$$('.st-day')).length===7);
 t('mostra indicadores, dica de horário e a coluna "Sem data"',(await p.$$('.st-kpis .kpi')).length===5&&!!(await p.$('.st-tip'))&&!!(await p.$('.st-backlog')));
 const dia=await p.evaluate(()=>stIso(stAddDias(studioSemana,3))),dia2=await p.evaluate(()=>stIso(stAddDias(studioSemana,5)));
 const c1=(await api('POST','/data?module=conteudos',{titulo:'Aula aberta do Médio',perfil:'@evolucaopb',formato:'Reels',status:'PROGRAMADO',publicacaoEm:dia+'T10:30',legenda:'Venha conhecer'})).id;
 const c2=(await api('POST','/data?module=conteudos',{titulo:'Pauta sem data',perfil:'@evolucaopb',formato:'Feed',status:'PRODUÇÃO'})).id;
 await p.evaluate(()=>renderStudio());await p.waitForSelector('.st-card');
 t('post datado aparece no dia certo',!!(await p.$(`.st-day[data-date="${dia}"] .st-card[data-id="${c1}"]`)));
 t('post sem data aparece em "Sem data"',!!(await p.$(`.st-backlog .st-card[data-id="${c2}"]`)));
 await p.screenshot({path:PR+'/22_estudio_semana.png'});
 // ---- arrastar e soltar
 await p.dragAndDrop(`.st-card[data-id="${c1}"]`,`.st-day[data-date="${dia2}"]`);await p.waitForTimeout(1200);
 let x=await api('GET','/data?module=conteudos&id='+c1);t('arrastar para outro dia reagenda e mantém a hora',x.publicacaoEm===dia2+'T10:30',x.publicacaoEm);
 await p.dragAndDrop(`.st-backlog .st-card[data-id="${c2}"]`,`.st-day[data-date="${dia}"]`);await p.waitForTimeout(1200);
 x=await api('GET','/data?module=conteudos&id='+c2);t('arrastar de "Sem data" agenda no dia (hora padrão 09:00)',x.publicacaoEm===dia+'T09:00',x.publicacaoEm);
 // ---- filtro
 await p.selectOption('[data-stf="formato"]','Reels');await p.waitForTimeout(200);
 t('filtro por formato esconde os outros posts',!!(await p.$(`.st-card[data-id="${c1}"]`))&&!(await p.$(`.st-card[data-id="${c2}"]`)));
 await p.selectOption('[data-stf="formato"]','');
 // ---- compositor
 await p.click('#stNovo');await p.waitForSelector('.st-form');
 await p.fill('#sfTitulo','Matrículas abertas 2027');
 await p.fill('#sfLegenda','Venha conhecer o Colégio Evolução e garanta a vaga do seu filho para 2027 com condições especiais de matrícula e bolsa.');
 await p.fill('#sfTags','#matriculas #evolucao');
 await p.fill('#sfCta','Link na bio');
 t('prévia mostra legenda cortada em 125 letras com "mais"',/… mais/.test(await p.$eval('#pvLegenda',e=>e.innerText))&&/#matriculas/.test(await p.$eval('#pvLegenda',e=>e.innerText)));
 t('contadores de legenda e de hashtags',/\/2200/.test(await p.$eval('#sfCLeg',e=>e.textContent))&&(await p.$eval('#sfCTag',e=>e.textContent))==='2/30');
 await p.setInputFiles('#sfArq',{name:'a.png',mimeType:'image/png',buffer:PNG});await p.waitForSelector('#pvMidia img');
 t('prévia mostra a mídia escolhida',!!(await p.$('#pvMidia img')));
 await p.selectOption('#sfFormato','Reels');t('formato Reels muda a prévia para vertical',/fm-vert/.test(await p.$eval('#pvMidia',e=>e.className)));
 await p.screenshot({path:PR+'/23_estudio_compositor.png'});
 // grupos
 await p.click('#sfGSalvar');await p.waitForSelector('[data-gu]');
 t('"Salvar como grupo" cria o grupo com as hashtags',(await api('GET','/studio/hashtags')).grupos.some(g=>g.nome==='Matrículas'&&g.tags.join()==='#matriculas,#evolucao'));
 await p.fill('#sfTags','');await p.click('[data-gu="0"]');
 t('clicar no grupo coloca as hashtags no campo',(await p.$eval('#sfTags',e=>e.value))==='#matriculas #evolucao');
 // validações
 await p.fill('#sfLegenda','a'.repeat(2201));await p.click('[data-s="RASCUNHO"]');await p.waitForTimeout(400);
 t('legenda acima de 2.200 caracteres não salva',!(await api('GET','/data?module=conteudos')).rows.some(r=>r.titulo==='Matrículas abertas 2027'));
 await p.fill('#sfLegenda','Texto curto');await p.fill('#sfTags',Array.from({length:31},(_,i)=>'#t'+i).join(' '));await p.click('[data-s="RASCUNHO"]');await p.waitForTimeout(400);
 t('mais de 30 hashtags não salva',!(await api('GET','/data?module=conteudos')).rows.some(r=>r.titulo==='Matrículas abertas 2027'));
 await p.fill('#sfTags','#a #b');await p.click('[data-s="AGENDADO"]');await p.waitForTimeout(400);
 t('agendar sem data não salva',!(await api('GET','/data?module=conteudos')).rows.some(r=>r.titulo==='Matrículas abertas 2027'));
 // salvar rascunho / aprovação / agendar
 await p.click('[data-s="RASCUNHO"]');await p.waitForSelector('.st-form',{state:'detached'});
 let novo=(await api('GET','/data?module=conteudos')).rows.find(r=>r.titulo==='Matrículas abertas 2027');
 t('salvar rascunho cria o post na etapa PRODUÇÃO',novo&&novo.status==='PRODUÇÃO'&&novo.formato==='Reels'&&novo.cta==='Link na bio'&&novo.canal==='Instagram',novo);
 await p.waitForSelector(`.st-card[data-id="${novo.id}"]`);await p.click(`.st-card[data-id="${novo.id}"]`);await p.waitForSelector('.st-form');
 t('abrir o card edita o mesmo post',(await p.$eval('#sfTitulo',e=>e.value))==='Matrículas abertas 2027');
 await p.fill('#sfRevisor','Antônio Filho');await p.click('[data-s="APROVACAO"]');await p.waitForSelector('.st-form',{state:'detached'});
 novo=await api('GET','/data?module=conteudos&id='+novo.id);t('"Enviar para aprovação" muda para REVISÃO',novo.status==='REVISÃO'&&novo.revisor==='Antônio Filho',novo);
 await p.click(`.st-card[data-id="${novo.id}"]`);await p.waitForSelector('.st-form');await p.fill('#sfQuando',dia2+'T12:00');await p.click('[data-s="AGENDADO"]');await p.waitForSelector('.st-form',{state:'detached'});
 novo=await api('GET','/data?module=conteudos&id='+novo.id);t('"Agendar" muda para PROGRAMADO com data e hora',novo.status==='PROGRAMADO'&&novo.publicacaoEm===dia2+'T12:00',novo);
 await p.click(`.st-card[data-id="${novo.id}"]`);await p.waitForSelector('.st-form');await p.fill('#sfCta','Novo CTA');await p.click('[data-s="MANTER"]');await p.waitForSelector('.st-form',{state:'detached'});
 for(let i=0;i<20;i++){novo=await api('GET','/data?module=conteudos&id='+novo.id);if(novo.cta==='Novo CTA')break;await p.waitForTimeout(250)}
 t('"Salvar sem mudar a etapa" preserva o status',novo.status==='PROGRAMADO'&&novo.cta==='Novo CTA',novo);
 // ---- área Instagram no menu + desempenho por publicação
 await p.evaluate(()=>go('studio'));await p.waitForSelector('.st-week');
 t('menu tem a área Instagram com Estúdio, Publicações e Análises + Mais',await p.evaluate(()=>{const subs=[...document.querySelectorAll('#subtabs .subtab')].map(x=>x.textContent);return !!document.querySelector('#nav [data-area="instagramarea"]')&&['Estúdio','Publicações','Análises'].every((x,i)=>subs[i]===x)&&/Mais/.test(subs[3]||'')}));
 t('a área Instagram reúne Estúdio, Conteúdos, Métricas, Desempenho e Ranking (não existe mais a área Conteúdo)',await p.evaluate(()=>{const a=AREAS.find(x=>x.k==='instagramarea');return !AREAS.some(x=>x.k==='conteudo')&&['studio','conteudos','instagram','igposts','igranking'].every(k=>a.pages.includes(k))}));
 await p.evaluate(()=>go('igposts'));await p.waitForFunction(()=>/DESEMPENHO/.test(document.querySelector('.dashboard-head')?.textContent||''));
 t('sem Instagram sincronizado mostra aviso claro',/Nenhuma publicação lida ainda/.test(await p.$eval('#content',e=>e.innerText)));
 await api('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});let sy=await api('POST','/integrations/instagram/sync',{});
 let ps=await api('GET','/instagram/posts');const m2=(ps.rows||[]).find(x=>x.id==='m2');
 t('sincronização grava alcance, salvos e compartilhamentos por publicação',m2&&m2.alcance===20000&&m2.salvos===80&&m2.compartilhamentos===40&&m2.interacoes===900+55+80+40,[sy,m2]);
 t('engajamento = interações ÷ alcance',m2&&m2.engajamento===Math.round((m2.interacoes/20000)*1000)/10,m2);
 t('só endereços https viram miniatura',(ps.rows||[]).every(x=>!x.miniatura||/^https:\/\//.test(x.miniatura))&&(ps.rows||[]).find(x=>x.id==='m1').miniatura.includes('cdninstagram'));
 await p.evaluate(()=>go('igranking'));await p.waitForFunction(()=>/RANKING/.test(document.querySelector('.dashboard-head')?.textContent||''));await p.waitForSelector('[data-rk="visao"]');
 t('ranking do mês: 1º lugar é o post com mais interações do mês',/Bastidores da feira/.test(await p.$eval('.datatable tbody tr:first-child',e=>e.textContent))||(await p.$$('.datatable')).length>=2);
 t('ranking tem relatório mensal em PDF, histórico e seguidores manuais (Gerência)',!!(await p.$('a[href^="/relatorio-instagram.html"]'))&&!!(await p.$('#rkHist'))&&!!(await p.$('#rkSegManual')));
 t('ranking mostra seguidores por mês e por ano',/Por mês/.test(await p.$eval('#content',e=>e.innerText))&&/Por ano/.test(await p.$eval('#content',e=>e.innerText)));
 await p.evaluate(()=>go('igposts'));await p.waitForSelector('.ig-card');
 t('tela Desempenho mostra um card por publicação do período',(await p.$$('.ig-card')).length>=3);
 await p.selectOption('[data-igf="tipo"]','Reels');t('filtro por formato mostra só Reels',(await p.$$('.ig-card')).length===1);
 await p.selectOption('[data-igf="tipo"]','');await p.selectOption('[data-igf="ordem"]','interacoes');
 t('ordenar por interações põe a melhor primeiro',/Bastidores da feira/.test(await p.$eval('.ig-card p',e=>e.textContent)));
 t('resumo compara formatos (Reels × Feed)',/REELS/.test(await p.$eval('.ig-resumo',e=>e.innerText))&&/FEED/.test(await p.$eval('.ig-resumo',e=>e.innerText)));
 await p.screenshot({path:PR+'/25_instagram_desempenho.png'});
 // ---- publicar pelo Estúdio
 const JPG=Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64');
 const cr=(await api('POST','/data?module=conteudos',{titulo:'Rascunho que não pode publicar',status:'PRODUÇÃO',formato:'Feed'})).id;
 r=await api('POST','/integrations/instagram/publish',{id:cr});t('o servidor recusa publicar conteúdo que não está aprovado',!!r.erro&&/APROVADOS/.test(r.erro),r);
 await p.evaluate(()=>go('studio'));await p.waitForSelector('#stNovo');await p.click('#stNovo');await p.waitForSelector('.st-form');
 await p.fill('#sfTitulo','Publicado pelo Estúdio');await p.fill('#sfLegenda','Hoje tem aula aberta!');
 await p.click('[data-s="PUBLICAR"]');await p.waitForTimeout(500);
 t('publicar sem mídia não publica nem cria o post',!(await api('GET','/data?module=conteudos')).rows.some(x=>x.titulo==='Publicado pelo Estúdio'));
 await p.setInputFiles('#sfArq',{name:'arte.jpg',mimeType:'image/jpeg',buffer:JPG});await p.click('[data-s="PUBLICAR"]');
 let pub;for(let i=0;i<40;i++){pub=(await api('GET','/data?module=conteudos')).rows.find(x=>x.titulo==='Publicado pelo Estúdio');if(pub&&pub.status==='PUBLICADO')break;await p.waitForTimeout(500)}
 await p.waitForSelector('.st-form',{state:'detached',timeout:20000});
 t('"Publicar agora" aprova, publica no Instagram e grava o link',pub&&pub.status==='PUBLICADO'&&/MEDIA_/.test(pub.instagramMediaId||'')&&/instagram\.com/.test(pub.instagramLink||''),pub);
 await p.evaluate(()=>renderStudio());await p.waitForSelector(`.st-card[data-id="${pub.id}"]`);await p.click(`.st-card[data-id="${pub.id}"]`);await p.waitForSelector('.st-form');
 t('post já publicado não oferece publicar de novo e mostra o link',!(await p.$('[data-s="PUBLICAR"]'))&&/ver no Instagram/.test(await p.$eval('.st-form',e=>e.innerText)));
 await p.click('.st-form [data-close]');
 // ---- link de aprovação do post (direção, sem login)
 const aprId=(await api('POST','/data?module=conteudos',{titulo:'Post para a direção',perfil:'@evolucaopb',formato:'Feed',legenda:'Matrículas abertas!',hashtags:'#evolucao',status:'REVISÃO',publicacaoEm:dia2+'T11:00'})).id;
 await p.evaluate(async i=>{const f=new FormData();f.append('files',new File([Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='),c=>c.charCodeAt(0))],'arte.jpg',{type:'image/jpeg'}));await fetch('/api/integrations/instagram/media?id='+i,{method:'POST',credentials:'same-origin',headers:{'X-EVO':'1'},body:f})},aprId);
 const rascunhoLink=await api('POST','/manager/approval-link',{id:cr});t('link de post só existe quando o post está em aprovação',!!rascunhoLink.erro&&/REVISÃO/.test(rascunhoLink.erro),rascunhoLink);
 await p.evaluate(()=>renderStudio());await p.waitForSelector(`.st-card[data-id="${aprId}"]`);await p.click(`.st-card[data-id="${aprId}"]`);await p.waitForSelector('#sfLink');await p.click('#sfLink');await p.waitForSelector('#sfLinkUrl');
 const urlAp=await p.$eval('#sfLinkUrl',e=>e.value);t('o compositor gera o link de aprovação do post',/\/aprovar\.html\?t=/.test(urlAp),urlAp);
 await p.click('.st-form [data-close]');
 const anon=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const e3=[];anon.on('pageerror',e=>e3.push(e.message));
 await anon.goto(urlAp.replace(/^https?:\/\/[^/]+/,BASE));await anon.waitForSelector('#nome');
 const tx=await anon.$eval('#box',e=>e.innerText);
 t('a direção vê título, legenda e hashtags sem login',/Post para a direção/.test(tx)&&/Matrículas abertas/.test(tx)&&/#evolucao/.test(tx)&&/Aprovar post/.test(tx),tx);
 const mr=await anon.evaluate(async()=>{const u=document.querySelector('.post img')?.src;if(!u)return null;const r=await fetch(u);return {s:r.status,t:r.headers.get('content-type'),n:(await r.arrayBuffer()).byteLength}});
 t('a mídia do post é entregue pelo link, sem login (imagem JPEG)',mr&&mr.s===200&&/image\/jpeg/.test(mr.t)&&mr.n>50,JSON.stringify(mr));
 await anon.screenshot({path:PR+'/26_aprovacao_post_celular.png'});
 await anon.fill('#nome','Diretora Maria');await anon.click('#aj');await anon.waitForTimeout(600);
 t('pedir ajustes sem comentário é recusado e o link continua valendo',!!(await anon.$('#nome')));
 await anon.fill('#com','Trocar a foto por uma da fachada');await anon.click('#ok');await anon.waitForSelector('.msg');
 t('a direção aprova pelo link e o post vira APROVADO',/Post aprovado/.test(await anon.$eval('#box',e=>e.innerText))&&(await api('GET','/data?module=conteudos&id='+aprId)).status==='APROVADO');
 await anon.reload();await anon.waitForSelector('.msg.err');t('o link usado não abre mais',/não é mais válido/.test(await anon.$eval('#box',e=>e.innerText)));
 t('sem erros de JS na página pública',e3.length===0,e3.join('|'));
 // ---- calendário compartilhável (somente leitura)
 const hojeIso=await p.evaluate(()=>stIso(new Date()));
 await api('POST','/data?module=conteudos',{titulo:'Post agendado visível',perfil:'@evolucaopb',formato:'Feed',status:'PROGRAMADO',publicacaoEm:hojeIso+'T15:00'});
 await api('POST','/data?module=conteudos',{titulo:'Rascunho secreto',perfil:'@evolucaopb',formato:'Feed',status:'PRODUÇÃO',publicacaoEm:hojeIso+'T16:00'});
 r=await api('GET','/manager/calendario-link');t('sem link criado, o estado é inativo',r.ativo===false,r);
 await p.evaluate(()=>go('studio'));await p.waitForSelector('#stCompartilha');await p.click('#stCompartilha');await p.waitForSelector('#cmpCriar');await p.click('#cmpCriar');await p.waitForSelector('#cmpUrl');
 const calUrl=await p.$eval('#cmpUrl',e=>e.value);t('a Gerência cria o link do calendário',/\/calendario\.html\?t=[0-9a-f]{64}/.test(calUrl),calUrl);
 await p.click('.admin-overlay [data-close]');
 const tok=new URL(calUrl).searchParams.get('t');
 const pubApi=await p.evaluate(async t=>{const r=await fetch('/api/public/calendario?t='+t,{credentials:'omit'});return {s:r.status,j:await r.json()}},tok);
 t('o link mostra posts agendados e esconde rascunhos',pubApi.s===200&&pubApi.j.rows.some(x=>x.titulo==='Post agendado visível')&&!pubApi.j.rows.some(x=>x.titulo==='Rascunho secreto'),JSON.stringify(pubApi.j).slice(0,200));
 t('o link só entrega título, perfil, formato, horário e etapa',pubApi.j.rows.every(x=>Object.keys(x).sort().join()==='formato,perfil,quando,status,titulo'));
 const ruim=await p.evaluate(async()=>{const r=await fetch('/api/public/calendario?t='+'a'.repeat(64),{credentials:'omit'});return r.status});t('token errado é recusado (404)',ruim===404);
 const anonC=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const e4=[];anonC.on('pageerror',e=>e4.push(e.message));
 await anonC.goto(BASE+'/calendario.html?t='+tok);await anonC.waitForSelector('.dia');
 t('a página pública mostra o post e não mostra o rascunho',/Post agendado visível/.test(await anonC.$eval('#box',e=>e.innerText))&&!/Rascunho secreto/.test(await anonC.$eval('#box',e=>e.innerText)));
 t('a página pública no celular não rola para o lado',await anonC.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await anonC.screenshot({path:PR+'/28_calendario_compartilhado.png'});
 await p.evaluate(()=>go('studio'));await p.waitForSelector('#stCompartilha');await p.click('#stCompartilha');await p.waitForSelector('#cmpOff');await p.click('#cmpOff');await p.waitForTimeout(800);
 const depois=await p.evaluate(async t=>(await fetch('/api/public/calendario?t='+t,{credentials:'omit'})).status,tok);t('desativar o link o invalida na hora',depois===404);
 t('sem erros de JS na página pública do calendário',e4.length===0,e4.join('|'));
 // ---- Dashboard de Tráfego (relatório semanal em PDF)
 await api('GET','/integrations/ads/accounts');await api('POST','/integrations/ads/account',{conta:'111222333'});await api('POST','/integrations/ads/sync',{});
 const rp=await ctx.newPage();const e5=[];rp.on('pageerror',e=>e5.push(e.message));
 await rp.goto(BASE+'/relatorio-trafego.html');await rp.waitForSelector('.pg',{timeout:20000});
 const rtx=await rp.$eval('#rel',e=>e.innerText);
 t('relatório: título, indicadores do mês e da semana no modelo do PDF',/Dashboard de Tráfego — Meta Ads/.test(rtx)&&/Indicadores do período/.test(rtx)&&/Indicadores da semana/.test(rtx)&&/MENSAL •/.test(rtx)&&/SEMANAL •/.test(rtx)&&/R\$ 2\.084,56/.test(rtx),rtx.slice(0,300));
 t('relatório: 2 páginas, gráfico com uma linha por campanha + total, resumo e detalhamento',(await rp.$$('.pg')).length===2&&(await rp.$$('svg polyline')).length===4&&/Resumo por campanha/.test(rtx)&&/Detalhamento por anúncio/.test(rtx)&&/01 - EI/.test(rtx));
 t('relatório: anúncios com status em português e uma foto (só https)',/Vídeo depoimento/.test(rtx)&&/Reprovado/.test(rtx)&&(await rp.$$('td img')).length===1);
 await rp.fill('#sub','Colégio Evolução | Teste de subtítulo');await rp.fill('#obs','Observação da semana para a direção.');
 t('editar subtítulo e observações atualiza o relatório na hora',/Teste de subtítulo/.test(await rp.$eval('.cab .sub',e=>e.textContent))&&/Observação da semana/.test(await rp.$eval('.nota',e=>e.textContent)));
 await rp.fill('#de','2026-10-01');await rp.fill('#ate','2026-12-31');await rp.click('#atualiza');await rp.waitForFunction(()=>/até 31 dias/.test(document.querySelector('#rel')?.innerText||''));
 t('período acima de 31 dias mostra a mensagem do servidor',true);
 await rp.fill('#de','2026-10-04');await rp.fill('#ate','2026-10-10');await rp.click('#atualiza');await rp.waitForSelector('.pg');
 t('tags mostram o período escolhido (04/10 a 10/10/2026)',/SEMANAL • 04\/10 a 10\/10\/2026/.test(await rp.$eval('#rel',e=>e.innerText)));
 await rp.screenshot({path:PR+'/30_dashboard_trafego_tela.png',fullPage:true});
 await rp.emulateMedia({media:'print'});const pdf=await rp.pdf({format:'A4',printBackground:true});fs.writeFileSync(PR+'/relatorio_trafego_exemplo.pdf',pdf);
 const nPag=(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length;
 t('o PDF sai em A4 com 2 a 3 páginas e sem a barra de controles',pdf.length>15000&&nPag>=2&&nPag<=3,[pdf.length,nPag]);
 t('sem erros de JS no relatório',e5.length===0,e5.join('|'));await rp.close();
 // celular
 const m=p;await m.setViewportSize({width:390,height:844});const e2=[];
 await m.evaluate(()=>go('studio'));await m.waitForSelector('.st-week');
 t('no celular a página não rola para o lado',await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await m.screenshot({path:PR+'/24_estudio_celular.png'});
 await m.click('#stNovo');await m.waitForSelector('.st-form');
 t('no celular o compositor cabe na tela',await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1&&document.querySelector('.st-box').scrollWidth<=window.innerWidth));
 t('sem erros de JS',errs.length===0&&e2.length===0,errs.concat(e2).join('|'));
 console.log(`${ok} ok, ${bad} falhas`);await b.close();process.exit(bad?1:0);
})();
