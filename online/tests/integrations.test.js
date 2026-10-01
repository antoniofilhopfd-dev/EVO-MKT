// Integrações Instagram (Meta) e Google (Agenda/Drive/Planilhas) contra servidores simulados (mock_apis.php, porta 8099).
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
 r=await call('/integrations/status',{ck:E});t('Equipe não vê integrações',r.s===403);
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
 // ---------- Instagram: publicar ----------
 const jpg=Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64');
 const up=async(id,name,buf)=>{const fd=new FormData();fd.append('files',new Blob([buf]),name);const rr=await fetch(API+'/integrations/instagram/media?id='+id,{method:'POST',headers:{Cookie:G,'X-EVO':'1'},body:fd});return{s:rr.status,j:await rr.json().catch(()=>null)}};
 r=await call('/data?module=conteudos',{m:'POST',ck:G,b:{titulo:'Post matrículas',legenda:'Matrículas abertas! #evolucao',status:'APROVADO',formato:'Feed',publicarInstagram:'SIM',publicacaoEm:'2020-01-01T10:00'}});const cid=r.j.id;
 let x=await up(cid,'arte.png',jpg);t('mídia PNG é recusada (Instagram exige JPEG)',x.s===400);
 x=await up(cid,'arte.jpg',jpg);t('mídia JPEG anexada ao conteúdo',x.s===200&&/ANEXOS\/CONTEUDOS\/.+\.jpg$/.test(x.j.midia));
 r=await call('/integrations/instagram/queue',{ck:E});t('fila de publicação (visível à Equipe)',r.s===200&&r.j.some(q=>q.id===cid&&q.midia&&!q.publicado));
 r=await call('/integrations/instagram/publish',{m:'POST',ck:E,b:{id:cid}});t('publica agora',r.s===200&&r.j.status==='PUBLICADO'&&/instagram\.com\/p\/MEDIA_/.test(r.j.link),r);
 const st=await mock('/__state');const cont=Object.values(st.containers)[0];
 t('Meta conseguiu baixar a mídia pela URL assinada (JPEG)',cont&&cont.bytes>0&&/jpeg/.test(cont.type)&&/api\/public\/media\?p=/.test(cont.params.image_url)&&cont.params.caption.includes('Matrículas abertas'),cont);
 let cc=(await rows('conteudos')).find(c=>c.id===cid);t('conteúdo vira PUBLICADO com link e id do Instagram',cc.status==='PUBLICADO'&&/MEDIA_/.test(cc.instagramMediaId)&&/instagram\.com/.test(cc.instagramLink));
 r=await call('/integrations/instagram/publish',{m:'POST',ck:G,b:{id:cid}});t('não publica duas vezes',r.s===502&&/já foi publicado/.test(r.j.error));
 const rel=cc.midiaInstagram;const pr=await fetch(API+'/public/media?p='+Buffer.from(rel).toString('base64url')+'&e=9999999999&s=deadbeef');t('link público de mídia sem assinatura válida é negado',pr.status===403);
 // agendado: cron publica só o vencido
 const mk=async(titulo,publicacaoEm,status)=>{const c=(await call('/data?module=conteudos',{m:'POST',ck:G,b:{titulo,legenda:titulo,status,formato:'Feed',publicarInstagram:'SIM',publicacaoEm}})).j.id;await up(c,'a.jpg',jpg);return c};
 const due=await mk('Agendado vencido','2020-02-01T09:00','PROGRAMADO');const fut=await mk('Agendado futuro','2099-01-01T09:00','PROGRAMADO');const draft=await mk('Rascunho vencido','2020-02-01T09:00','BRIEFING');
 const o=cron('publicar');cc=await rows('conteudos');
 t('cron publica o programado vencido',cc.find(c=>c.id===due).status==='PUBLICADO'&&/publicados":1/.test(o),o);
 t('cron não publica futuro nem rascunho',cc.find(c=>c.id===fut).status==='PROGRAMADO'&&cc.find(c=>c.id===draft).status==='BRIEFING');
 // ---------- Google: conectar ----------
 r=await call('/integrations/google/connect',{ck:G,manual:true});const gu=new URL(r.loc);
 t('conectar Google redireciona com escopos de Agenda/Drive/Planilhas e acesso offline',r.s===302&&/calendar/.test(gu.searchParams.get('scope'))&&/drive.file/.test(gu.searchParams.get('scope'))&&/spreadsheets/.test(gu.searchParams.get('scope'))&&gu.searchParams.get('access_type')==='offline');
 r=await call('/integrations/google/callback?code=GOODCODE&state='+encodeURIComponent(gu.searchParams.get('state')),{manual:true});t('callback Google conecta',/google_ok/.test(r.loc||''),r.loc);
 r=await call('/integrations/status',{ck:G});t('Google conectado com e-mail da conta',r.j.google.conectado&&r.j.google.email==='marketing@colegio.test');
 // ---------- Google Agenda ----------
 const fut1=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
 await call('/data?module=calendario',{m:'POST',ck:G,b:{titulo:'Reunião de pauta',status:'NOVO',dataInicio:fut1,inicioEm:fut1+'T14:00',fimEm:fut1+'T15:00'}});
 await call('/data?module=tarefas',{m:'POST',ck:G,b:{titulo:'Entregar banner',status:'NOVO',prazo:fut1}});
 await call('/data?module=eventos',{m:'POST',ck:G,b:{titulo:'Feira de Ciências',status:'PRÉ-EVENTO',dataInicio:fut1}});
 await call('/data?module=conteudos',{m:'POST',ck:G,b:{titulo:'Reel da feira',status:'PRODUÇÃO',publicacaoEm:fut1+'T18:00'}});
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});t('Agenda: envia itens do EVO ao Google',r.s===200&&r.j.para_google>=4,r);
 let s2=await mock('/__state');const evs=Object.values(s2.events);
 t('eventos criados com módulo/ID de origem e horário',evs.some(e=>e.summary==='Reunião de pauta'&&e.extendedProperties.private.evoModule==='calendario'&&e.start.dateTime)&&evs.some(e=>e.summary==='[Tarefa] Entregar banner'&&e.start.date===fut1)&&evs.some(e=>e.summary==='[Evento] Feira de Ciências'));
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});t('sincronizar de novo não duplica',r.j.para_google===0&&r.j.do_google===0&&r.j.criados===0,r.j);
 const cal=(await rows('calendario')).find(c=>c.titulo==='Reunião de pauta');
 await put('calendario',cal.id,{titulo:'Reunião de pauta (nova sala)'});r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});
 s2=await mock('/__state');t('alteração no EVO atualiza o evento no Google',r.j.para_google===1&&Object.values(s2.events).some(e=>e.summary==='Reunião de pauta (nova sala)'));
 const evId=Object.values(s2.events).find(e=>e.extendedProperties?.private?.evoId===cal.id).id;
 await mock('/__google_edit',{id:evId,patch:{summary:'Reunião de pauta — editada no Google',start:{dateTime:fut1+'T16:00:00-03:00'},end:{dateTime:fut1+'T17:00:00-03:00'}}});
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});const cal2=(await rows('calendario')).find(c=>c.id===cal.id);
 t('alteração feita no Google volta para o EVO (título e horário)',r.j.do_google===1&&cal2.titulo==='Reunião de pauta — editada no Google'&&cal2.inicioEm===fut1+'T16:00',cal2);
 await mock('/__google_create',{summary:'Visita da inspetora',start:{dateTime:fut1+'T10:00:00-03:00'},end:{dateTime:fut1+'T11:00:00-03:00'},description:'criado direto no Google'});
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});const nat=(await rows('calendario')).find(c=>c.titulo==='Visita da inspetora');
 t('evento criado direto no Google vira item do Calendário',r.j.criados===1&&nat&&nat.origem==='GOOGLE_AGENDA'&&nat.inicioEm===fut1+'T10:00');
 const tar=(await rows('tarefas')).find(c=>c.titulo==='Entregar banner');await call('/data?module=tarefas&id='+tar.id,{m:'DELETE',ck:G});
 r=await call('/integrations/google/calendar/sync',{m:'POST',ck:G,b:{}});s2=await mock('/__state');
 t('item excluído no EVO remove o evento do Google',r.j.removidos===1&&Object.values(s2.events).find(e=>e.summary==='[Tarefa] Entregar banner').status==='cancelled',r.j);
 // ---------- Google Drive ----------
 const sid=(await call('/data?module=solicitacoes',{m:'POST',ck:G,b:{titulo:'Cartaz festa junina',status:'EM EXECUÇÃO',segmento:'Infantil'}})).j.id;
 const upE=async(name)=>{const fd=new FormData();fd.append('files',new Blob([jpg]),name);const rr=await fetch(API+'/manager/upload?id='+sid,{method:'POST',headers:{Cookie:G,'X-EVO':'1'},body:fd});return rr.status};
 t('entrega enviada (Drive automático desligado)',await upE('final1.png')===200);s2=await mock('/__state');t('nada vai ao Drive com o automático desligado',Object.keys(s2.files).length===0);
 r=await call('/integrations/google/drive/send-entregas',{m:'POST',ck:G,b:{}});s2=await mock('/__state');const f1=Object.values(s2.files)[0];
 t('envia entregas pendentes ao Drive (pasta da solicitação)',r.j.arquivos===1&&f1&&f1.name.startsWith('final1')&&f1.size>0,r);
 const fold=Object.values(s2.folders);t('estrutura de pastas: EVO MKT — Entregas / SOL-xxxx — título',fold.some(f=>/Entregas/.test(f.name)&&!f.parent)&&fold.some(f=>f.name.startsWith(sid)&&f.parent));
 const sol=(await rows('solicitacoes')).find(s=>s.id===sid);t('link do Drive gravado na solicitação',/drive\.google\.com/.test(sol.entregaDriveLinks||''));
 r=await call('/integrations/google/drive/send-entregas',{m:'POST',ck:G,b:{}});t('reenviar não duplica arquivos',r.j.arquivos===0);
 await call('/integrations/settings',{m:'POST',ck:G,b:{g_auto_drive_entregas:true}});await upE('final2.png');s2=await mock('/__state');t('com o automático ligado, nova entrega vai sozinha ao Drive',Object.keys(s2.files).length===2);
 // ---------- Google Planilhas ----------
 r=await call('/integrations/google/sheets/export',{m:'POST',ck:G,b:{}});s2=await mock('/__state');
 t('exporta módulos para a planilha do Google',r.s===200&&/docs\.google\.com\/spreadsheets/.test(r.j.url)&&r.j.abas.tarefas>=0&&s2.values.tarefas&&s2.values.tarefas[0].includes('titulo')&&s2.values.conteudos.length>=4,r);
 const n1=s2.values.conteudos.length;await call('/data?module=conteudos',{m:'POST',ck:G,b:{titulo:'Novo conteúdo',status:'IDEIA'}});
 await call('/integrations/google/sheets/export',{m:'POST',ck:G,b:{}});s2=await mock('/__state');t('exportar de novo reescreve (sem duplicar linhas)',s2.values.conteudos.length===n1+1);
 // ---------- cron geral, log e desconexão ----------
 const o2=cron('sincronizar');t('cron sincronizar roda Instagram + Google sem erro',/instagram-metricas/.test(o2)&&/google-agenda/.test(o2)&&/google-planilhas/.test(o2)&&!/ERRO/.test(o2),o2);
 r=await call('/integrations/log',{ck:G});t('log das integrações registra as operações',r.s===200&&r.j.length>5&&r.j.some(l=>l.servico==='instagram')&&r.j.some(l=>l.servico==='google'));
 await call('/integrations/meta/disconnect',{m:'POST',ck:G,b:{}});r=await call('/integrations/instagram/sync',{m:'POST',ck:G,b:{}});t('desconectado: sincronizar avisa que não está conectado',r.s===502&&/não conectado/.test(r.j.error));
 await call('/integrations/google/disconnect',{m:'POST',ck:G,b:{}});r=await call('/integrations/status',{ck:G});t('desconectar Google',!r.j.google.conectado);
 console.log(`\n${ok} ok, ${bad} falhas`);process.exit(bad?1:0)})().catch(e=>{console.log('ERRO',e.stack.split('\n').slice(0,3).join(' | '));process.exit(1)});
