// Criação avulsa no Gerenciador: campanha, conjunto e anúncio por vez, tudo pausado. Uso: node criar.test.js <install.out>
const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,700))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
(async()=>{
 const login=async(c,n)=>{let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});let ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:n})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:n})});return {...J,Cookie:cookie(r)}};
 const G=await login('NAT-3301','Nat26ab'),E=await login('ANT-3302','Ant26ab');
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const mock=async p=>(await fetch('http://127.0.0.1:8099'+p)).json();
 const novos=async()=>Object.entries((await mock('/__state')).ads_novos||{});
 let n=0;const chave=()=>'criarTeste'+String(++n).padStart(8,'0')+'abcdefgh';
 let s,r;
 // sem sessão / CSRF / modo leitura
 [s]=await call('POST','/ads/criar/previa',{nivel:'campanha',spec:{}},{...J});t('criar exige login (401)',s===401);
 [s]=await call('POST','/ads/criar/previa',{nivel:'campanha',spec:{}},{'Content-Type':'application/json',Cookie:G.Cookie});t('criar sem X-EVO é recusado (403)',s===403);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'campanha',spec:{nome:'x'}});t('em modo somente leitura a criação é recusada (403)',s===403,r);
 await call('POST','/ads/modo',{gestao:true});
 await call('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});await call('POST','/integrations/instagram/sync',{});await call('GET','/integrations/ads/accounts');await call('POST','/integrations/ads/account',{conta:'111222333'});await call('POST','/integrations/ads/sync',{});
 await call('POST','/ads/gestao/config',{ativa:true,cidade:'João Pessoa',tetoDia:100,tetoMes:6000,diasMax:30});
 // ---- campanha ----
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'campanha',spec:{nome:'ab',objetivo:''}});t('campanha: nome curto e objetivo ausente são recusados',s===200&&r.ok===false&&r.erros.length>=2,r);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'campanha',spec:{nome:'Matrículas 2027 — Ensino Médio',objetivo:'ENGAGEMENT'}},E);t('a Equipe de Marketing também confere a criação (200)',s===200&&r.ok===true&&/Pausada/.test(r.resumo.estado),r);
 const k1=chave();
 [s]=await call('POST','/ads/criar',{nivel:'campanha',spec:{chave:k1,nome:'Matrículas 2027 — Ensino Médio',objetivo:'ENGAGEMENT'}});t('criar sem confirmar é recusado (400)',s===400);
 [s]=await call('POST','/ads/criar',{nivel:'campanha',confirmou:true,spec:{nome:'Sem chave',objetivo:'ENGAGEMENT'}});t('pedido sem chave de segurança é recusado',s===502||s===400);
 [s,r]=await call('POST','/ads/criar',{nivel:'campanha',confirmou:true,spec:{chave:k1,nome:'Matrículas 2027 — Ensino Médio',objetivo:'ENGAGEMENT'}});
 const idC=r&&r.id;t('campanha criada (só a campanha, pausada, com o nome escolhido)',s===200&&/^CAMP_/.test(idC)&&r.estado==='PAUSED',r);
 let camp=(await novos()).filter(([,v])=>v.tipo==='campanha').pop();
 t('na Meta: PAUSED, objetivo de engajamento, sem prefixo no nome e sem orçamento na campanha',camp&&camp[1].params.status==='PAUSED'&&camp[1].params.objective==='OUTCOME_ENGAGEMENT'&&camp[1].params.name==='Matrículas 2027 — Ensino Médio'&&!camp[1].params.daily_budget,camp);
 t('nenhum conjunto nem anúncio foi criado junto',(await novos()).filter(([,v])=>v.tipo==='conjunto'||v.tipo==='anuncio').length===0);
 [s,r]=await call('POST','/ads/criar',{nivel:'campanha',confirmou:true,spec:{chave:k1,nome:'Matrículas 2027 — Ensino Médio',objetivo:'ENGAGEMENT'}});t('repetir o mesmo pedido não cria outra campanha',s===200&&r.repetido===true&&(await novos()).filter(([,v])=>v.tipo==='campanha').length===1,r);
 // ---- conjunto ----
 [s,r]=await call('GET','/ads/criar/info?nivel=campanha&id='+idC);t('info da campanha: objetivo e resultados possíveis',s===200&&r.objetivo==='ENGAGEMENT'&&!!r.metas.CONVERSATIONS&&r.comOrcamentoNaCampanha===false,r);
 const conj=(o={})=>({chave:chave(),campanhaId:idC,nome:'Conjunto Ensino Médio — João Pessoa',meta:'CONVERSATIONS',orcamento:{tipo:'DIARIO',valor:20},dias:7,publico:{raioKm:15,idadeMin:14+4,idadeMax:40,genero:'todos'},destino:{mensagem:'DIRECT'},...o});
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'conjunto',spec:conj({meta:'INEXISTENTE'})});t('conjunto: resultado inválido para o objetivo é recusado',r.ok===false&&r.erros.some(e=>/resultado/i.test(e)),r);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'conjunto',spec:conj({orcamento:{tipo:'DIARIO',valor:500}})});t('conjunto: orçamento acima do teto diário é recusado',r.ok===false&&r.erros.some(e=>/teto/i.test(e)),r);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'conjunto',spec:conj({dias:0})});t('conjunto: sem término é recusado (nada fica aberto para sempre)',r.ok===false&&r.erros.some(e=>/término/i.test(e)),r);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'conjunto',spec:conj({campanhaId:'OUTRA_1'})});t('conjunto: campanha de outra conta é recusada',r.ok===false&&r.erros.some(e=>/não pertence/.test(e)),r);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'conjunto',spec:conj({campanhaId:''})});t('conjunto: sem campanha é recusado',r.ok===false&&r.erros.some(e=>/campanha/i.test(e)),r);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'conjunto',spec:conj({publico:{raioKm:15,idadeMin:18,idadeMax:40,genero:'todos',plataformas:['instagram'],posicoes:{instagram:['story','inexistente']}}})});t('conjunto: posição inexistente é recusada',r.ok===false&&r.erros.some(e=>/Posição inválida/.test(e)),r);
 [s,r]=await call('POST','/ads/criar',{nivel:'conjunto',confirmou:true,spec:conj({nome:'Conjunto só Stories e Reels',publico:{raioKm:15,idadeMin:18,idadeMax:40,genero:'todos',plataformas:['instagram'],posicoes:{instagram:['story','reels']}}})});
 const tgPos=JSON.parse(((Object.values((await mock('/__state')).ads_novos||{}).filter(v=>v.tipo==='conjunto').pop()||{params:{}}).params.targeting)||'{}');
 t('conjunto com posicionamento manual: só Stories e Reels do Instagram',s===200&&JSON.stringify(tgPos.publisher_platforms)==='["instagram"]'&&JSON.stringify(tgPos.instagram_positions)==='["story","reels"]',[s,r,tgPos]);
 [s,r]=await call('POST','/ads/criar',{nivel:'conjunto',confirmou:true,spec:conj()});
 const idS=r&&r.id;t('conjunto criado dentro da campanha escolhida, pausado',s===200&&/^SET_/.test(idS)&&r.estado==='PAUSED',r);
 let set=(await novos()).filter(([,v])=>v.tipo==='conjunto').pop();const tg=set&&JSON.parse(set[1].params.targeting||'{}');
 t('na Meta: PAUSED, campanha certa, R$ 20/dia (2000), meta de conversas no Direct, cidade e idade do público',set&&set[1].params.status==='PAUSED'&&set[1].params.campaign_id===idC&&set[1].params.daily_budget==='2000'&&set[1].params.optimization_goal==='CONVERSATIONS'&&set[1].params.destination_type==='INSTAGRAM_DIRECT'&&tg.geo_locations.cities[0].radius===15&&tg.age_min===18&&tg.age_max===40,set&&set[1].params);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'conjunto',spec:conj({campanhaId:'c1',orcamento:undefined})});t('campanha com orçamento próprio: o conjunto dispensa orçamento e o sistema avisa',r.ok===true&&r.avisos.some(a=>/CBO|orçamento na própria campanha/i.test(a)),r);
 // ---- anúncio ----
 [s,r]=await call('GET','/ads/criar/info?nivel=conjunto&id='+idS);t('info do conjunto: resultado e tipos de criativo aceitos',s===200&&r.meta==='CONVERSATIONS'&&r.criativos.includes('POST_IG')&&r.exige.length===0,r);
 const an=(o={})=>({chave:chave(),conjuntoId:idS,nome:'Anúncio — Bastidores da feira',criativo:{tipo:'POST_IG',midia:'m2'},...o});
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'anuncio',spec:an({conjuntoId:''})});t('anúncio: sem conjunto é recusado',r.ok===false&&r.erros.some(e=>/conjunto/i.test(e)),r);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'anuncio',spec:an({criativo:{tipo:'POST_IG',midia:'nao_existe'}})});t('anúncio: publicação que não é da conta conectada é recusada',r.ok===false&&r.erros.some(e=>/publicação/i.test(e)),r);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'anuncio',spec:an({criativo:{tipo:'IMAGEM',conteudoId:'CONT-0001',texto:''}})});t('anúncio: imagem sem texto/arquivo é recusada',r.ok===false,r);
 [s,r]=await call('POST','/ads/criar',{nivel:'anuncio',confirmou:true,spec:an()});
 const idA=r&&r.id;t('anúncio criado dentro do conjunto escolhido, pausado',s===200&&/^AD_/.test(idA)&&r.estado==='PAUSED',r);
 const ad=(await novos()).filter(([,v])=>v.tipo==='anuncio').pop(),cre=(await novos()).filter(([,v])=>v.tipo==='criativo').pop();
 t('na Meta: PAUSED, no conjunto certo, criativo a partir do post do Instagram',ad&&ad[1].params.status==='PAUSED'&&ad[1].params.adset_id===idS&&cre&&cre[1].params.source_instagram_media_id==='m2',[ad&&ad[1].params,cre&&cre[1].params]);
 t('os três foram criados separadamente: 1 campanha, 1 conjunto, 1 anúncio',(await novos()).filter(([,v])=>v.tipo==='campanha').length===1&&(await novos()).filter(([,v])=>v.tipo==='conjunto').length>=1&&(await novos()).filter(([,v])=>v.tipo==='anuncio').length>=1);
 // histórico e falha da Meta
 // peça enviada pela equipe (biblioteca): imagem e vídeo
 const enviar=async(nome,tipo,bytes)=>{const fd=new FormData();fd.append('files',new Blob([bytes],{type:tipo}),nome);fd.append('pasta','Tráfego');const x=await fetch(B+'/arquivos/enviar',{method:'POST',headers:{'X-EVO':'1',Cookie:G.Cookie},body:fd});const j=await x.json();return j.arquivos&&j.arquivos[0]&&j.arquivos[0].caminho};
 const cVid=await enviar('depoimento.mp4','video/mp4',Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypmp42'),Buffer.alloc(200)]));
 const cImg=await enviar('arte.jpg','image/jpeg',Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(200)]));
 t('envia vídeo e imagem para a biblioteca',!!cVid&&!!cImg,[cVid,cImg]);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'anuncio',spec:an({criativo:{tipo:'ARQUIVO',arquivo:'BIBLIOTECA/Tráfego/nao-existe.mp4',texto:'x'}})});t('anúncio com arquivo inexistente é recusado',r.ok===false,r);
 [s,r]=await call('POST','/ads/criar/previa',{nivel:'anuncio',spec:an({criativo:{tipo:'ARQUIVO',arquivo:cVid,texto:''}})});t('anúncio com vídeo sem texto é recusado',r.ok===false,r);
 [s,r]=await call('POST','/ads/criar',{nivel:'anuncio',confirmou:true,spec:an({nome:'Vídeo Campanha de Matrículas',criativo:{tipo:'ARQUIVO',arquivo:cVid,texto:'Matrículas abertas!',titulo:'Venha conhecer'}})});
 const st1=await mock('/__state');const cr1=Object.values(st1.ads_novos||{}).filter(v=>v.tipo==='criativo').map(v=>v.params.object_story_spec||'').find(x=>/video_data/.test(x));
 t('anúncio com vídeo vira criativo de vídeo (video_id e miniatura) e o anúncio nasce pausado',s===200&&!!cr1&&/"video_id":"VID_1"/.test(cr1)&&/thumb\.jpg/.test(cr1)&&(st1.videos_enviados||[]).length===1,[s,r,cr1]);
 [s,r]=await call('POST','/ads/criar',{nivel:'anuncio',confirmou:true,spec:an({nome:'Imagem enviada',criativo:{tipo:'ARQUIVO',arquivo:cImg,texto:'Texto'}})});
 const st2=await mock('/__state');const cr2=Object.values(st2.ads_novos||{}).filter(v=>v.tipo==='criativo').map(v=>v.params.object_story_spec||'').find(x=>/image_hash/.test(x)&&/HASH_IMG_1/.test(x));
 t('anúncio com imagem enviada usa o código da imagem na Meta',s===200&&!!cr2,[s,r]);
 // ---- públicos personalizados
 const pub=async()=>(await mock('/__state'));
 [s,r]=await call('POST','/ads/publicos/criar',{tipo:'SITE',nome:'Visitantes matrícula',pixelId:'PX1',dias:30,url:'/matriculas'});t('público de site exige confirmação (400)',s===400,r);
 [s,r]=await call('POST','/ads/publicos/criar',{tipo:'SITE',nome:'Visitantes matrícula',pixelId:'PX1',dias:30,url:'/matriculas',confirmou:true});const stP=await pub();const pS=Object.values(stP.publicos_novos||{}).find(x=>x.subtype==='WEBSITE');
 t('cria público de visitantes do site com pixel e prazo',s===200&&!!pS&&/"PX1"/.test(pS.rule)&&/\/matriculas/.test(pS.rule)&&pS.retention_days==='30',[s,r,pS]);
 [s,r]=await call('POST','/ads/publicos/criar',{tipo:'CONTATOS',nome:'Responsáveis 2027',contatos:'ana@exemplo.com\n(83) 99999-1234',confirmou:true});t('lista de contatos exige a confirmação de autorização (LGPD)',s===400&&/LGPD/.test(r.error),r);
 [s,r]=await call('POST','/ads/publicos/criar',{tipo:'CONTATOS',nome:'Responsáveis 2027',contatos:'ana@exemplo.com',autorizacao:true,confirmou:true},E);t('Equipe não envia lista de contatos: só o Administrador',[400,403].includes(s)&&/apenas/.test(r.error||''),[s,r]);
 [s,r]=await call('POST','/ads/publicos/criar',{tipo:'CONTATOS',nome:'Responsáveis 2027',contatos:'Ana@Exemplo.com\n(83) 99999-1234\nlixo',autorizacao:true,confirmou:true});const stC=await pub();
 const us=Object.values(stC.publicos_usuarios||{}).flat();const txtU=JSON.stringify(us);
 t('contatos vão à Meta só em SHA-256 (nunca em texto), com 1 e-mail e 1 telefone; o inválido é ignorado',s===200&&r.enviados===2&&r.ignorados===1&&us.length===2&&!/exemplo|99999/i.test(txtU)&&/EMAIL_SHA256/.test(txtU)&&/PHONE_SHA256/.test(txtU)&&us.every(u=>u.data.every(h=>/^[0-9a-f]{64}$/.test(h))),[s,r,txtU.slice(0,200)]);
 const idCA=r.id;
 [s,r]=await call('POST','/ads/publicos/criar',{tipo:'SEMELHANTE',nome:'Parecido 1%',origemId:idCA,percentual:1,confirmou:true});const pL=Object.values((await pub()).publicos_novos||{}).find(x=>x.subtype==='LOOKALIKE');
 t('cria público semelhante (1%) a partir de outro',s===200&&!!pL&&pL.origin_audience_id===idCA&&/"ratio":0.01/.test(pL.lookalike_spec),[s,r,pL]);
 [s,r]=await call('POST','/ads/publicos/criar',{tipo:'INSTAGRAM',nome:'Quem interagiu',dias:90,confirmou:true});t('cria público de interação com o Instagram',s===200&&Object.values((await pub()).publicos_novos||{}).some(x=>x.subtype==='ENGAGEMENT'),[s,r]);
 [s]=await call('POST','/ads/publicos/editar',{id:idCA,nome:'Responsáveis renomeado'});t('renomeia o público na Meta',s===200&&JSON.stringify((await pub()).publicos_edits||{}).includes('Responsáveis renomeado'));
 [s]=await call('POST','/ads/publicos/excluir',{id:idCA});t('excluir público exige confirmação (400)',s===400);
 [s]=await call('POST','/ads/publicos/excluir',{id:idCA,confirmou:true});t('exclui o público na Meta',s===200&&((await pub()).publicos_excluidos||[]).includes(idCA));
 // ---- testes A/B, pixel e catálogos
 const fut=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,16);
 [s,r]=await call('POST','/ads/testes/criar',{nome:'Teste de público',nivel:'conjunto',ids:['s1'],inicio:fut(1),fim:fut(5),confirmou:true});t('teste A/B precisa de pelo menos 2 itens',s===400&&/2 a 5/.test(r.error),r);
 [s,r]=await call('POST','/ads/testes/criar',{nome:'Teste de público',nivel:'conjunto',ids:['s1','s2'],inicio:fut(-1),fim:fut(5),confirmou:true});t('teste A/B que começa no passado é recusado',s===400&&/no futuro/.test(r.error),r);
 [s,r]=await call('POST','/ads/testes/criar',{nome:'Teste de público',nivel:'conjunto',ids:['s1','s2'],inicio:fut(1),fim:fut(40),confirmou:true});t('teste A/B com mais de 30 dias é recusado',s===400&&/1 a 30/.test(r.error),r);
 [s,r]=await call('POST','/ads/testes/criar',{nome:'Teste de público',nivel:'conjunto',ids:['s1','s2'],inicio:fut(1),fim:fut(8)});t('teste A/B sem confirmação é recusado',s===400,r);
 [s,r]=await call('POST','/ads/testes/criar',{nome:'Teste de público',nivel:'conjunto',ids:['s1','s2'],inicio:fut(1),fim:fut(8),confirmou:true});const estudo=Object.values((await mock('/__state')).estudos||{})[0]||{};
 t('cria o teste A/B dividindo 50/50 entre dois conjuntos',s===200&&estudo.type==='SPLIT_TEST'&&JSON.parse(estudo.cells||'[]').map(c=>c.treatment_percentage).join()==='50,50'&&JSON.parse(estudo.cells).every(c=>c.adsets.length===1),[s,r,estudo]);
 [s,r]=await call('GET','/ads/testes');t('lista os testes da Meta com situação e células',s===200&&r.rows.length===1&&r.rows[0].situacao==='Agendado'&&r.rows[0].celulas.length===2,r);
 [s,r]=await call('GET','/ads/eventos');t('pixel (último disparo e eventos dos últimos 7 dias) e catálogos, só leitura',s===200&&r.pixels[0].nome==='Pixel do site'&&r.pixels[0].eventos[0].nome==='PageView'&&r.pixels[0].eventos[0].total===120&&r.catalogos[0].nome==='Catálogo de cursos',r);
 [s,r]=await call('GET','/ads/acoes');t('o histórico registra as três criações',s===200&&['campanha','conjunto','anuncio'].every(nv=>r.rows.some(x=>x.acao==='criar'&&x.nivel===nv&&x.resultado==='OK')),r.rows&&r.rows.slice(0,4));
 await call('POST','/integrations/meta/token',{token:'FAILSET_TOKEN'});
 [s,r]=await call('POST','/ads/criar',{nivel:'conjunto',confirmou:true,spec:conj()});t('se a Meta recusa, o erro aparece (502) e fica no histórico como ERRO',s===502&&/Meta recusou/.test(r.error),r);
 [,r]=await call('GET','/ads/acoes');t('histórico guarda a falha',r.rows.some(x=>x.acao==='criar'&&x.resultado==='ERRO'));
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
