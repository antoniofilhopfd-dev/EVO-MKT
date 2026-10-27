// Integrações Instagram (Meta) e Google (Agenda) contra servidores simulados (mock_apis.php, porta 8099). A mídia das publicações vem dos materiais (arte final).
// Uso: EVO_DIR=<pasta do site> node integrations.test.js <install.out>
const fs=require('fs');const {execFileSync}=require('child_process');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];
const B=(process.env.BASE||'http://127.0.0.1:8080');const API=B+'/api';const MOCK='http://127.0.0.1:8099';const DIR=process.env.EVO_DIR;
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('     ',JSON.stringify(x).slice(0,300))};
async function call(p,{m='GET',b,ck,pt,raw,manual}={}){const h={};if(b&&!raw)h['Content-Type']='application/json';if(ck)h.Cookie=ck;if(pt)h['X-Portal-Token']=pt;else h['X-EVO']='1';
 const r=await fetch(API+p,{method:m,headers:h,body:b?(raw?b:JSON.stringify(b)):undefined,redirect:manual?'manual':'follow'});let j;try{j=await r.json()}catch{}return{s:r.status,j,loc:r.headers.get('location'),c:r.headers.get('set-cookie')}}
const mock=async(p,b)=>(await fetch(MOCK+p,{method:b?'POST':'GET',headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined})).json();
const cron=a=>execFileSync('php',[DIR+'/cron_integracoes.php',a],{encoding:'utf8'});
(async()=>{
 await mock('/__reset',{});
 let r=await call('/auth/login',{m:'POST',b:{codigo:'NAT-3301',senha:pw('NAT-3301')}});const G=r.c.split(';')[0];
 r=await call('/auth/login',{m:'POST',b:{codigo:'ANT-3302',senha:pw('ANT-3302')}});const E=r.c.split(';')[0];
 const rows=async mod=>(await call('/data?module='+mod,{ck:G})).j.rows;
 const put=(mod,id,b)=>call('/data?module='+mod+'&id='+id,{m:'PUT',ck:G,b});
 // ---------- configuração e segurança ----------
 r=await call('/integrations/status',{ck:E});t('Equipe vê só o status das integrações, sem credenciais',r.s===200&&!/META_SECRET|G_SECRET/.test(JSON.stringify(r.j||'')));
 r=await call('/integrations/meta/connect',{ck:G,manual:true});t('conectar sem App ID/Secret é recusado',r.s===400);
 r=await call('/integrations/settings',{m:'POST',ck:G,b:{meta_app_id:'APPID',meta_app_secret:'META_SECRET',g_client_id:'GID.apps.test',g_client_secret:'G_SECRET'}});t('salva credenciais',r.s===200);
 r=await call('/integrations/status',{ck:G});const raw=JSON.stringify(r.j);
 t('status não vaza segredos',r.s===200&&!raw.includes('META_SECRET')&&!raw.includes('G_SECRET')&&r.j.instagram.configurado&&r.j.google.configurado);
 t('status informa os redirect URIs a cadastrar',/api\/integrations\/meta\/callback$/.test(r.j.redirectUris.meta)&&/api\/integrations\/google\/callback$/.test(r.j.redirectUris.google));
 // ---------- Instagram: conectar ----------
 r=await call('/integrations/meta/connect',{ck:G,manual:true});const u=new URL(r.loc);
 t('conectar Instagram redireciona à Meta com escopos e state',r.s===302&&u.searchParams.get('client_id')==='APPID'&&/instagram_content_publish/.test(u.searchParams.get('scope'))&&u.searchParams.get('state'));
 const state=u.searchParams.get('state');
 r=await call('/integrations/meta/callback?code=GOODCODE&state=adulterado',{manual:true});t('callback com state inválido é recusado',/meta_erro/.test(r.loc||''));
 r=await call('/integrations/meta/callback?code=BADCODE&state='+encodeURIComponent(state),{manual:true});t('callback com código inválido informa erro',/meta_erro/.test(r.loc||''));
 r=await call('/integrations/meta/callback?code=GOODCODE&state='+encodeURIComponent(state),{manual:true});t('callback válido conecta',/meta_ok/.test(r.loc||''),r.loc);
 r=await call('/integrations/status',{ck:G});t('Instagram conectado como @evolucaopb',r.j.instagram.conectado&&r.j.instagram.usuario==='evolucaopb'&&!!r.j.instagram.expiraEm);
 // ---------- Instagram: métricas ----------
 r=await call('/integrations/instagram/sync',{m:'POST',ck:G,b:{}});t('sincroniza métricas (2 períodos)',r.s===200&&r.j.periodos===2,r);
 let ig=(await rows('instagram')).filter(x=>x.origem==='INSTAGRAM_API');const per=new Date().toISOString().slice(0,7);const cur=ig.find(x=>x.periodo===per);
 t('métricas gravadas na tela Instagram',cur&&cur.seguidores==='4600'&&cur.alcance==='18000'&&cur.impressoes==='26000'&&cur.visitasPerfil==='1100'&&cur.interacoes==='2300'&&cur.salvamentos==='490',cur);
 t('conta posts e reels do mês pelo /media',cur&&cur.posts==='2'&&cur.reels==='1');
 t('melhores conteúdos ordenados por interações',cur&&/^Bastidores da feira/.test(cur.melhoresConteudos));
 await call('/integrations/instagram/sync',{m:'POST',ck:G,b:{}});ig=(await rows('instagram')).filter(x=>x.origem==='INSTAGRAM_API');t('sincronizar de novo não duplica',ig.length===2);
 r=await call('/instagram/seguidores',{ck:G});const mesAtual=new Date().toISOString().slice(0,7);
 t('seguidores: guarda a foto do dia e entrega por mês e por ano',r.s===200&&r.j.mensal.length>=1&&r.j.anual.length>=1&&r.j.atual>0&&r.j.mensal[r.j.mensal.length-1].seguidores===r.j.atual,r);
 r=await call('/instagram/seguidores',{ck:E});t('seguidores: visível à Equipe',r.s===200);
 // ---------- Instagram: publicar ----------
 const jpg=Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64');
 const up=async(id,name,buf,papel='final')=>{const fd=new FormData();fd.append('id',id);fd.append('papel',papel);fd.append('files',new Blob([buf]),name);const rr=await fetch(API+'/content/material',{method:'POST',headers:{Cookie:G,'X-EVO':'1'},body:fd});return{s:rr.status,j:await rr.json().catch(()=>null)}};
 const upN=async(id,n)=>{const fd=new FormData();fd.append('id',id);fd.append('papel','final');for(let i=0;i<n;i++)fd.append('files',new Blob([jpg]),`f${i}.jpg`);const rr=await fetch(API+'/content/material',{method:'POST',headers:{Cookie:G,'X-EVO':'1'},body:fd});return rr.status};
 /* publicação pronta para o Instagram: cria, anexa a arte final, leva a revisão, aprova e (opcionalmente) agenda */
 const pronto=async(b,{agendar=true,aprovar=true,fotos=1}={})=>{const c=(await call('/data?module=conteudos',{m:'POST',ck:G,b:{legenda:b.titulo,formato:'Feed',perfil:'@evolucaopb',publicarInstagram:'SIM',status:'RASCUNHO',...b}})).j.id;
  if(fotos===1)await up(c,'a.jpg',jpg);else if(fotos>1)await upN(c,fotos);
  if(aprovar){await put('conteudos',c,{status:'EM REVISÃO'});await call('/content/decision',{m:'POST',ck:G,b:{id:c,decisao:'APROVADO'}})}
  if(agendar)await call('/content/schedule',{m:'POST',ck:G,b:{id:c,quando:b.publicacaoEm}});return c};
 r=await call('/data?module=conteudos',{m:'POST',ck:G,b:{titulo:'Post matrículas',legenda:'Matrículas abertas! #evolucao',status:'RASCUNHO',formato:'Feed',perfil:'@evolucaopb',publicarInstagram:'SIM',publicacaoEm:'2020-01-01T10:00'}});const cid=r.j.id;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
 let x=await up(cid,'arte.png',png);t('arte final PNG é aceita como material, mas não serve ao Instagram (sem JPEG, não agenda)',x.s===201&&(await put('conteudos',cid,{status:'EM REVISÃO'})).s===200);
 await call('/content/decision',{m:'POST',ck:G,b:{id:cid,decisao:'APROVADO'}});r=await call('/content/schedule',{m:'POST',ck:G,b:{id:cid,quando:'2020-01-01T10:00'}});t('agendar com publicação automática exige JPEG ou vídeo',r.s===409&&/JPEG|vídeo/i.test(r.j.error),r);
 x=await up(cid,'arte.jpg',jpg);t('arte final JPEG anexada ao conteúdo',x.s===201&&x.j.materiais.some(m=>m.papel==='final'&&/\.jpg$/.test(m.caminho)));
 r=await call('/content/schedule',{m:'POST',ck:G,b:{id:cid,quando:'2020-01-01T10:00'}});t('com JPEG, agenda',r.s===200,r);
 r=await call('/integrations/instagram/queue',{ck:E});t('fila de publicação (visível à Equipe)',r.s===200&&r.j.some(q=>q.id===cid&&q.midia&&!q.publicado));
 r=await call('/integrations/instagram/publish',{m:'POST',ck:E,b:{id:cid}});t('publica agora',r.s===200&&r.j.status==='PUBLICADO'&&/instagram\.com\/p\/MEDIA_/.test(r.j.link),r);
 const st=await mock('/__state');const cont=Object.values(st.containers)[0];
 t('Meta conseguiu baixar a mídia pela URL assinada (JPEG)',cont&&cont.bytes>0&&/jpeg/.test(cont.type)&&/api\/public\/media\?p=/.test(cont.params.image_url)&&cont.params.caption.includes('Matrículas abertas'),cont);
 let cc=(await rows('conteudos')).find(c=>c.id===cid);t('conteúdo vira PUBLICADO com link e id do Instagram',cc.status==='PUBLICADO'&&/MEDIA_/.test(cc.instagramMediaId)&&/instagram\.com/.test(cc.instagramLink));
 r=await call('/integrations/instagram/publish',{m:'POST',ck:G,b:{id:cid}});t('não publica duas vezes (já publicada não é aceita de novo)',(r.s===409||r.s===502)&&/já foi publicado|APROVADAS/.test(r.j.error),r);
 const rel=cc.midiaInstagram;const pr=await fetch(API+'/public/media?p='+Buffer.from(rel).toString('base64url')+'&e=9999999999&s=deadbeef');t('link público de mídia sem assinatura válida é negado',pr.status===403);
 // agendado: cron publica só o vencido
 const due=await pronto({titulo:'Agendado vencido',publicacaoEm:'2020-02-01T09:00'});const fut=await pronto({titulo:'Agendado futuro',publicacaoEm:'2099-01-01T09:00'});const draft=await pronto({titulo:'Rascunho vencido',publicacaoEm:'2020-02-01T09:00'},{agendar:false,aprovar:false});
 const o=cron('publicar');cc=await rows('conteudos');
 t('cron publica o agendado vencido',cc.find(c=>c.id===due).status==='PUBLICADO'&&/publicados":1/.test(o),o);
 t('cron não publica futuro nem rascunho',cc.find(c=>c.id===fut).status==='AGENDADO'&&cc.find(c=>c.id===draft).status==='RASCUNHO');
 // hashtags, primeiro comentário, carrossel, nova tentativa
 const mk2=(b,fotos=1,extra={})=>pronto({publicacaoEm:'2020-03-01T09:00',...b},{fotos,...extra});
 const hT=await mk2({titulo:'Com hashtags',hashtags:'#evolucao #matriculas'});
 const hC=await mk2({titulo:'Tags no comentario',hashtags:'#primeirocomentario #evo',hashtagsComentario:'SIM'});
 cron('publicar');const stp=await mock('/__state');const caps=Object.values(stp.containers).map(c=>c.params.caption||'');
 t('as hashtags do post entram no fim da legenda publicada',caps.some(c=>/Com hashtags[\s\S]*#evolucao #matriculas/.test(c)));
 t('com "hashtags no primeiro comentário", a legenda fica limpa',caps.some(c=>c==='Tags no comentario')&&!caps.some(c=>/Tags no comentario[\s\S]*#primeirocomentario/.test(c)));
 t('...e as hashtags vão como primeiro comentário do post publicado',Object.values(stp.comments||{}).some(l=>l.some(m=>/#primeirocomentario #evo/.test(m))),stp.comments);
 const car=await mk2({titulo:'Carrossel de teste',formato:'Carrossel'},3);
 t('carrossel: vários arquivos de uma vez viram a lista de mídias',(await call('/content/materials?id='+car,{ck:G})).j.materiais.length===3);
 cc=(await rows('conteudos')).find(c=>c.id===car);t('carrossel guarda a lista de mídias',JSON.parse(cc.midiasInstagram).length===3&&cc.midiaInstagram===JSON.parse(cc.midiasInstagram)[0]);
 cron('publicar');cc=(await rows('conteudos')).find(c=>c.id===car);const stc=await mock('/__state');const pai=Object.values(stc.containers).find(c=>c.params.media_type==='CAROUSEL');
 t('cron publica o carrossel com 3 itens filhos',cc.status==='PUBLICADO'&&pai&&pai.params.children.split(',').length===3&&pai.params.caption==='Carrossel de teste',[cc.status,pai&&pai.params]);
 const carG=await mk2({titulo:'Carrossel grande',formato:'Carrossel'},0,{agendar:false,aprovar:false});t('carrossel aceita 20 mídias',(await upN(carG,20))===201);t('carrossel com 21 mídias é recusado',(await upN(carG,1))===400);
 const car1=await mk2({titulo:'Carrossel curto',formato:'Carrossel'});
 r=await call('/integrations/instagram/publish',{m:'POST',ck:G,b:{id:car1}});t('carrossel com 1 item não publica e explica',r.s===502&&/2 a 20/.test(r.j.error),r);
 r=await call('/integrations/instagram/queue',{ck:G});t('falha aparece na fila com o motivo',r.j.find(q=>q.id===car1).estado==='ERRO');
 r=await call('/integrations/instagram/retry',{m:'POST',ck:G,b:{id:car1}});t('"Tentar de novo" libera o post para o cron',r.s===200);
 r=await call('/integrations/instagram/retry',{m:'POST',ck:G,b:{id:car1}});t('nova tentativa sem falha anterior: 409',r.s===409);
 r=await call('/integrations/prontidao',{ck:G});t('prontidão confirma que o cron de publicação rodou e mostra o comando',r.j.itens.find(i=>i.id==='cron_publicar').ok===true&&/tarefa=publicar/.test(r.j.cronPublicar),r.j.cronPublicar);
 // ---------- Google: conectar ----------
 r=await call('/integrations/google/connect',{ck:G,manual:true});const gu=new URL(r.loc);
 t('conectar Google redireciona com escopo de Agenda e acesso offline',r.s===302&&/calendar/.test(gu.searchParams.get('scope'))&&gu.searchParams.get('access_type')==='offline');
 r=await call('/integrations/google/callback?code=GOODCODE&state='+encodeURIComponent(gu.searchParams.get('state')),{manual:true});t('callback Google conecta',/google_ok/.test(r.loc||''),r.loc);
 r=await call('/integrations/status',{ck:G});t('Google conectado com e-mail da conta',r.j.google.conectado&&r.j.google.email==='marketing@colegio.test');
 // ---------- Google Agenda ----------
 const fut1=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
 await call('/data?module=calendario',{m:'POST',ck:G,b:{titulo:'Reunião de pauta',status:'NOVO',dataInicio:fut1,inicioEm:fut1+'T14:00',fimEm:fut1+'T15:00'}});
 await call('/data?module=conteudos',{m:'POST',ck:G,b:{titulo:'Reel da feira',status:'EM PRODUÇÃO',publicacaoEm:fut1+'T18:00'}});
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});t('Agenda: sem agenda escolhida, não cria nenhuma',r.s>=400&&!/cal1/.test(JSON.stringify(await mock('/__state'))),r);
 r=await call('/integrations/google/agendas-leitura',{ck:G});t('lista todas as agendas visíveis, com o papel de acesso',r.s===200&&r.j.agendas.some(a=>a.id==='cal1'&&'papel' in a&&'gravavel' in a),r);
 r=await call('/integrations/google/agendas-leitura',{m:'POST',ck:G,b:{ids:['cal1']}});t('marca uma agenda como somente leitura',r.s===200);
 r=await call('/integrations/google/eventos-leitura?de=2020-01-01&ate=2099-12-31',{ck:G});t('eventos das agendas somente leitura chegam sem entrar no sistema',r.s===200&&Array.isArray(r.j.rows)&&!(await rows('calendario')).some(c=>c.origem==='GOOGLE_AGENDA'),r);
 r=await call('/integrations/google/eventos-leitura?de=2026-05-10&ate=2026-05-01',{ck:G});t('período inválido nos eventos de leitura: 400',r.s===400);
 r=await call('/integrations/google/agendas-leitura',{m:'POST',ck:G,b:{ids:[]}});
 r=await call('/integrations/google/calendars',{ck:G});t('lista as agendas da conta',r.s===200&&r.j.rows.some(a=>a.id==='cal1'),r);
 r=await call('/integrations/google/calendar/choose',{m:'POST',ck:G,b:{id:'cal1'}});t('escolhe uma agenda existente',r.s===200,r);
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});t('Agenda: envia só os compromissos do EVO ao Google (publicações ficam de fora)',r.s===200&&r.j.para_google>=1,r);
 let s2=await mock('/__state');const evs=Object.values(s2.events);
 t('compromisso criado com módulo/ID de origem e horário; nenhuma publicação enviada ao Google',evs.some(e=>e.summary==='Reunião de pauta'&&e.extendedProperties.private.evoModule==='calendario'&&e.start.dateTime)&&!evs.some(e=>/^\[Publicação\]/.test(e.summary||'')&&e.extendedProperties&&e.extendedProperties.private.evoModule==='conteudos'));
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});t('sincronizar de novo não duplica',r.j.para_google===0&&r.j.do_google===0&&r.j.criados===0,r.j);
 const cal=(await rows('calendario')).find(c=>c.titulo==='Reunião de pauta');
 await put('calendario',cal.id,{titulo:'Reunião de pauta (nova sala)'});r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});
 s2=await mock('/__state');t('alteração no EVO atualiza o evento no Google',r.j.para_google===1&&Object.values(s2.events).some(e=>e.summary==='Reunião de pauta (nova sala)'));
 const evId=Object.values(s2.events).find(e=>e.extendedProperties?.private?.evoId===cal.id).id;
 await mock('/__google_edit',{id:evId,patch:{summary:'Reunião de pauta — editada no Google',start:{dateTime:fut1+'T16:00:00-03:00'},end:{dateTime:fut1+'T17:00:00-03:00'}}});
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});const cal2=(await rows('calendario')).find(c=>c.id===cal.id);
 t('alteração feita no Google volta para o EVO (título e horário)',r.j.do_google===1&&cal2.titulo==='Reunião de pauta — editada no Google'&&cal2.inicioEm===fut1+'T16:00',cal2);
 await mock('/__google_create',{summary:'Visita da inspetora',start:{dateTime:fut1+'T10:00:00-03:00'},end:{dateTime:fut1+'T11:00:00-03:00'},description:'criado direto no Google'});
 await mock('/__google_create',{summary:'Visita da inspetora',start:{dateTime:fut1+'T10:00:00-03:00'},end:{dateTime:fut1+'T11:00:00-03:00'},description:'cópia duplicada no Google'});
 r=await call('/integrations/settings',{m:'POST',ck:G,b:{g_importar:false}});r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});t('importação desligada: evento do Google não entra no Calendário',r.j.criados===0);
 r=await call('/integrations/settings',{m:'POST',ck:G,b:{g_importar:true}});
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});const nat=(await rows('calendario')).find(c=>c.titulo==='Visita da inspetora');
 t('evento criado direto no Google vira item do Calendário (cópia duplicada é ignorada)',r.j.criados===1&&(await rows('calendario')).filter(c=>c.titulo==='Visita da inspetora').length===1&&nat&&nat.origem==='GOOGLE_AGENDA'&&nat.inicioEm===fut1+'T10:00');
 const d0='2031-03-10',d1='2031-03-14'; // Google: dia inteiro de 10 a 13 (o fim vem como o dia seguinte ao último)
 await mock('/__google_create',{summary:'Viagem longa',start:{date:d0},end:{date:d1}});
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});const vl=(await rows('calendario')).find(c=>c.titulo==='Viagem longa');
 t('evento de vários dias do Google entra com o último dia (10 a 13), sem ficar só no primeiro',vl&&vl.dataInicio===d0&&vl.dataFim==='2031-03-13',vl);
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});const s3=await mock('/__state');const evl=Object.values(s3.events).filter(e=>e.summary==='Viagem longa');
 t('o evento continua com o mesmo intervalo no Google depois de sincronizar de novo (sem duplicar)',evl.length===1&&evl[0].start.date===d0&&evl[0].end.date===d1,evl);
 await call('/data?module=calendario',{m:'POST',ck:G,b:{titulo:'Auto sincroniza',tipoItem:'Reunião',dataInicio:'2031-04-02',diaInteiro:'Sim',status:'PLANEJADO'}});
 await new Promise(x=>setTimeout(x,8000));const s4=await mock('/__state');
 t('salvar no calendário sincroniza sozinho com o Google em segundos (sem clicar em sincronizar)',Object.values(s4.events).some(e=>e.summary==='Auto sincroniza'),Object.values(s4.events).map(e=>e.summary));
 r=await call('/integrations/google/calendar/sync?leve=1',{m:'POST',ck:G,b:{}});t('sincronização leve não repete quando acabou de rodar',r.s===200&&r.j.pulou===true,r);
 r=await call('/integrations/google/calendar/limpar-importados',{m:'POST',ck:G,b:{}});s2=await mock('/__state');t('limpar importados remove do sistema sem apagar no Google',r.s===200&&r.j.removidos>=1&&!(await rows('calendario')).some(c=>c.origem==='GOOGLE_AGENDA')&&Object.values(s2.events).some(e=>e.summary==='Visita da inspetora'),r);
 const tar=(await rows('conteudos')).find(c=>c.titulo==='Reel da feira');await call('/data?module=conteudos&id='+tar.id,{m:'DELETE',ck:G});
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});s2=await mock('/__state');
 t('excluir uma publicação não mexe no Google (publicações não vão para a agenda)',r.j.removidos===0&&!Object.values(s2.events).some(e=>e.summary==='[Publicação] Reel da feira'),r.j);
 // ---------- cron geral, log e desconexão ----------
 const o2=cron('sincronizar');t('cron sincronizar roda Instagram + Google Agenda sem erro',/instagram-metricas/.test(o2)&&/google-agenda/.test(o2)&&!/ERRO/.test(o2),o2);
 r=await call('/integrations/log',{ck:G});t('log das integrações registra as operações',r.s===200&&r.j.length>5&&r.j.some(l=>l.servico==='instagram')&&r.j.some(l=>l.servico==='google'));
 await call('/integrations/meta/disconnect',{m:'POST',ck:G,b:{}});r=await call('/integrations/instagram/sync',{m:'POST',ck:G,b:{}});t('desconectado: sincronizar avisa que não está conectado',r.s===502&&/não conectado/.test(r.j.error));
 await call('/integrations/google/disconnect',{m:'POST',ck:G,b:{}});r=await call('/integrations/status',{ck:G});t('desconectar Google',!r.j.google.conectado);
 {const ins=await call('/insights',{ck:G});t('sincronizar Instagram grava as publicações (ranking de conteúdos)',ins.s===200&&ins.j.ranking.length===4&&ins.j.ranking[0].legenda.includes('Bastidores'),ins.j.ranking)}
 {const pr=await call('/integrations/prontidao',{ck:G});const it=id=>(pr.j.itens||[]).find(x=>x.id===id);
  t('prontidão: lista itens com como corrigir e as URLs para colar na Meta/Google',pr.s===200&&pr.j.itens.length>=10&&pr.j.urls.privacidade.endsWith('/privacidade.html')&&/\/api\/integrations\/google\/callback$/.test(pr.j.urls.googleRedirect)&&pr.j.itens.every(x=>x.titulo&&x.como),pr.j);
  t('prontidão: detecta PUBLIC_URL sem https e credenciais/conexão desligadas',it('public_url').ok===false&&it('meta_conn').ok===false&&it('g_conn').ok===false&&it('cron_secret').ok===true&&pr.j.pronto===false);
  t('prontidão: só Gerência (sem sessão recusa)',[401,403].includes((await call('/integrations/prontidao',{})).s));
  t('páginas públicas de privacidade e termos existem (exigidas por Meta/Google)',(await fetch(API.replace('/api','')+'/privacidade.html')).status===200&&(await fetch(API.replace('/api','')+'/termos.html')).status===200)}
 {const lg=(await call('/integrations/log',{ck:G})).j;const erros=lg.filter(l=>/^erro/i.test(l.nivel));const nt=await call('/notificacoes',{ck:G});const mails=fs.existsSync(process.env.MAILLOG||'/nonexistent')?fs.readFileSync(process.env.MAILLOG,'utf8'):'';
  t('falha de integração (nível erro) vira notificação e e-mail à Gerência',erros.length>0&&nt.j.rows.some(n=>n.tipo==='integracao_falha')&&/falha na integração instagram/.test(mails),{erros:erros.length,notif:nt.j.rows.filter(n=>n.tipo==='integracao_falha').length})}
 console.log(`\n${ok} ok, ${bad} falhas`);process.exit(bad?1:0)})().catch(e=>{console.log('ERRO',e.stack.split('\n').slice(0,3).join(' | '));process.exit(1)});
