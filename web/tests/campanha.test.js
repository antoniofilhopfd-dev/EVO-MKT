// Nova campanha completa (Etapa B): todos os objetivos da Meta, travas, criativos, público, orçamento. Uso: node campanha.test.js <install.out>
const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,700))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const JPG=Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64');
(async()=>{
 const login=async(c,n)=>{let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});let ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:n})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:n})});return {...J,Cookie:cookie(r)}};
 const G=await login('NAT-3301','Nat26ab'),E=await login('ANT-3302','Ant26ab');
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const mock=async p=>(await fetch('http://127.0.0.1:8099'+p)).json();
 const novos=async()=>Object.entries((await mock('/__state')).ads_novos||{});
 const ultimo=async tipo=>{const l=(await novos()).filter(([,v])=>v.tipo===tipo);return l.length?l[l.length-1][1].params:null};
 let s,r,n=0;const chave=()=>'campanhaTeste'+String(++n).padStart(8,'0')+'abcdef';
 await call('POST','/ads/modo',{gestao:true}); // o Tráfego nasce só-leitura; estas suítes testam o modo completo
 await call('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});await call('POST','/integrations/instagram/sync',{});await call('GET','/integrations/ads/accounts');await call('POST','/integrations/ads/account',{conta:'111222333'});await call('POST','/integrations/ads/sync',{});
 await call('POST','/ads/gestao/config',{ativa:true,cidade:'João Pessoa',tetoDia:100,tetoMes:6000,diasMax:30});
 // imagem do Estúdio (JPEG anexado a um post)
 const post=(await call('POST','/data?module=conteudos',{titulo:'Arte da matrícula',legenda:'Matrículas abertas',status:'APROVADO',formato:'Feed'}))[1].id;
 const fd=new FormData();fd.append('files',new Blob([JPG]),'arte.jpg');const up=await fetch(B+'/integrations/instagram/media?id='+post,{method:'POST',headers:{Cookie:G.Cookie,'X-EVO':'1'},body:fd});
 t('imagem JPEG anexada ao post do Estúdio',up.status===200);
 const amanha=new Date(Date.now()+86400000),f=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16)};
 const base=()=>({chave:chave(),objetivo:'AWARENESS',meta:'REACH',nome:'Teste',orcamento:{tipo:'DIARIO',valor:20},dias:7,criativo:{tipo:'POST_IG',midia:'m2'}});
 // ---- opções
 [s,r]=await call('GET','/ads/campanha/opcoes');
 t('opções: 6 objetivos da Meta com seus resultados',s===200&&Object.keys(r.objetivos).join()==='AWARENESS,TRAFFIC,ENGAGEMENT,LEADS,SALES,APP'&&r.objetivos.ENGAGEMENT.metas.CONVERSATIONS&&r.objetivos.SALES.metas.OFFSITE_CONVERSIONS.exige.join()==='site,pixel',Object.keys(r.objetivos||{}));
 t('opções: pixels, públicos personalizados, formulários ativos, publicações do Instagram e imagens do Estúdio',r.pixels[0].id==='PX1'&&r.publicos[0].id==='CA1'&&r.formularios.length===1&&r.formularios[0].id==='LF1'&&r.posts.some(x=>x.id==='m2')&&r.imagens.some(x=>x.id===post),[r.pixels,r.publicos,r.formularios,r.imagens]);
 [s,r]=await call('GET','/ads/campanha/interesses?q=educ');t('pesquisa de interesses na Meta',s===200&&r.rows.length===2&&r.rows[0].nome==='Educação infantil',r);
 [s]=await call('GET','/ads/campanha/opcoes',null,E);t('Equipe usa o assistente de campanha (200)',s===200);
 // ---- validações por objetivo
 const prev=async b=>(await call('POST','/ads/campanha/previa',b))[1];
 r=await prev({...base(),objetivo:'XXX'});t('objetivo inexistente é recusado',!r.ok&&r.erros.some(e=>/objetivo/i.test(e)),r.erros);
 r=await prev({...base(),meta:'XXX'});t('resultado que não existe para o objetivo é recusado',!r.ok&&r.erros.some(e=>/resultado/i.test(e)),r.erros);
 r=await prev({...base(),objetivo:'TRAFFIC',meta:'LINK_CLICKS',criativo:{tipo:'IMAGEM',conteudoId:post,texto:'Venha conhecer'}});t('tráfego exige o endereço https do site',!r.ok&&r.erros.some(e=>/site de destino/.test(e)),r.erros);
 r=await prev({...base(),objetivo:'TRAFFIC',meta:'LINK_CLICKS',destino:{siteUrl:'http://inseguro.com'},criativo:{tipo:'IMAGEM',conteudoId:post,texto:'x'}});t('site com http (sem https) é recusado',!r.ok&&r.erros.some(e=>/https/.test(e)));
 r=await prev({...base(),objetivo:'TRAFFIC',meta:'LINK_CLICKS',destino:{siteUrl:'https://matricula.exemplo.com.br'}});t('tráfego para o site exige imagem nova (publicação existente não leva link)',!r.ok&&r.erros.some(e=>/imagem nova/.test(e)),r.erros);
 r=await prev({...base(),objetivo:'LEADS',meta:'LEAD_GENERATION',criativo:{tipo:'IMAGEM',conteudoId:post,texto:'x'}});t('leads por formulário exige o ID do formulário',!r.ok&&r.erros.some(e=>/formulário/.test(e)),r.erros);
 r=await prev({...base(),objetivo:'SALES',meta:'OFFSITE_CONVERSIONS',destino:{siteUrl:'https://x.com.br'},criativo:{tipo:'IMAGEM',conteudoId:post,texto:'x'}});t('vendas exige pixel e evento',!r.ok&&r.erros.some(e=>/pixel/i.test(e))&&r.erros.some(e=>/evento/i.test(e)),r.erros);
 r=await prev({...base(),objetivo:'APP',meta:'APP_INSTALLS',criativo:{tipo:'IMAGEM',conteudoId:post,texto:'x'}});t('app exige ID do app e link da loja',!r.ok&&r.erros.some(e=>/aplicativo/.test(e))&&r.erros.some(e=>/loja/.test(e)),r.erros);
 r=await prev({...base(),objetivo:'ENGAGEMENT',meta:'CONVERSATIONS',destino:{mensagem:'WHATSAPP'}});t('conversa no WhatsApp exige o número',!r.ok&&r.erros.some(e=>/WhatsApp/.test(e)),r.erros);
 r=await prev({...base(),objetivo:'ENGAGEMENT',meta:'POST_ENGAGEMENT',criativo:{tipo:'IMAGEM',conteudoId:post,texto:'x'}});t('engajamento com publicação só aceita publicação do Instagram',!r.ok&&r.erros.some(e=>/publicação do Instagram/.test(e)));
 r=await prev({...base(),criativo:{tipo:'POST_IG',midia:'nao-existe'}});t('publicação desconhecida é recusada',!r.ok&&r.erros.some(e=>/não foi lida/.test(e)));
 r=await prev({...base(),criativo:{tipo:'IMAGEM',conteudoId:'CON-9999',texto:'x'}});t('imagem de post inexistente é recusada',!r.ok&&r.erros.some(e=>/JPEG/.test(e)));
 // orçamento, datas e tetos
 r=await prev({...base(),orcamento:{tipo:'DIARIO',valor:150}});t('diário acima do teto: recusado',!r.ok&&r.erros.some(e=>/teto por campanha \(100\)/.test(e)));
 r=await prev({...base(),orcamento:{tipo:'DIARIO',valor:2}});t('abaixo do mínimo: recusado',!r.ok&&r.erros.some(e=>/mínimo/.test(e)));
 r=await prev({...base(),dias:undefined});t('sem término nem duração: recusado ("nenhuma campanha fica aberta para sempre")',!r.ok&&r.erros.some(e=>/aberta para sempre/.test(e)));
 r=await prev({...base(),dias:45});t('duração acima do máximo: recusada',!r.ok&&r.erros.some(e=>/máximo \(30/.test(e)));
 r=await prev({...base(),dias:undefined,inicio:f(amanha),fim:f(new Date(amanha.getTime()-3600000))});t('término antes do início: recusado',!r.ok&&r.erros.some(e=>/depois do início/.test(e)));
 r=await prev({...base(),orcamento:{tipo:'TOTAL',valor:7000}});t('orçamento total acima do teto mensal: recusado',!r.ok&&r.erros.some(e=>/teto mensal \(6000\)/.test(e)));
 r=await prev({...base(),orcamento:{tipo:'TOTAL',valor:600},dias:3});t('total dividido pelos dias não pode passar do teto diário (600÷3=200)',!r.ok&&r.erros.some(e=>/200\/dia/.test(e)),r.erros);
 r=await prev({...base(),publico:{idadeMin:10,idadeMax:70}});t('idade fora de 18 a 65: recusada',!r.ok&&r.erros.some(e=>/idade/i.test(e)));
 r=await prev({...base(),publico:{plataformas:['tiktok']}});t('plataforma inválida: recusada',!r.ok&&r.erros.some(e=>/plataforma/i.test(e)));
 r=await prev({...base(),lance:{tipo:'LIMITE_CUSTO'}});t('limite de custo exige valor',!r.ok&&r.erros.some(e=>/limite de custo/.test(e)));
 r=await prev(base());t('prévia válida (reconhecimento, R$ 20 × 7 dias = 140)',r.ok&&r.compromisso===140&&r.dias===7&&r.resumo.objetivo==='Reconhecimento'&&r.resumo.vaiAoArAtivo===true,r);
 [s]=await call('POST','/ads/campanha/lancar',{spec:base()});t('sem confirmar na tela de resumo não lança',s===400&&(await novos()).length===0);
 // ---- lançar cada objetivo e conferir os pedidos à Meta
 const lanca=async spec=>{const [st,rr]=await call('POST','/ads/campanha/lancar',{spec,confirmou:true});return [st,rr]};
 // 1) reconhecimento + alcance com post existente
 [s,r]=await lanca(base());let C=await ultimo('campanha'),S=await ultimo('conjunto'),K=await ultimo('criativo');
 t('reconhecimento/alcance: ATIVA, OUTCOME_AWARENESS, meta REACH, sem destino, post existente',s===200&&r.lancamento.estado==='ATIVO'&&C.status==='ACTIVE'&&C.objective==='OUTCOME_AWARENESS'&&S.optimization_goal==='REACH'&&!S.destination_type&&K.source_instagram_media_id==='m2',[s,r.erro,C,S]);
 // 2) tráfego com link, imagem enviada à Meta
 const seg=await mock('/__state');const antesImg=(seg.imagens_enviadas||[]).length;
 [s,r]=await lanca({...base(),objetivo:'TRAFFIC',meta:'LINK_CLICKS',destino:{siteUrl:'https://matricula.exemplo.com.br'},criativo:{tipo:'IMAGEM',conteudoId:post,texto:'Garanta a vaga',titulo:'Matrículas 2027',cta:'LEARN_MORE'}});
 C=await ultimo('campanha');S=await ultimo('conjunto');K=await ultimo('criativo');const oss=JSON.parse(K.object_story_spec||'{}');
 t('tráfego/cliques: OUTCOME_TRAFFIC, LINK_CLICKS, destino WEBSITE, imagem enviada à Meta e link no anúncio',s===200&&C.objective==='OUTCOME_TRAFFIC'&&S.optimization_goal==='LINK_CLICKS'&&S.destination_type==='WEBSITE'&&((await mock('/__state')).imagens_enviadas||[]).length===antesImg+1&&oss.link_data.image_hash==='HASH_IMG_1'&&oss.link_data.link==='https://matricula.exemplo.com.br'&&oss.link_data.call_to_action.type==='LEARN_MORE'&&oss.link_data.name==='Matrículas 2027'&&oss.page_id==='p1',[s,r.erro,oss]);
 // 3) engajamento: impulsionar publicação
 [s,r]=await lanca({...base(),objetivo:'ENGAGEMENT',meta:'POST_ENGAGEMENT'});S=await ultimo('conjunto');
 t('engajamento/publicação: OUTCOME_ENGAGEMENT, POST_ENGAGEMENT, destino ON_POST',s===200&&S.optimization_goal==='POST_ENGAGEMENT'&&S.destination_type==='ON_POST',[s,r.erro]);
 // 4) conversas no Direct, no Messenger e no WhatsApp
 [s,r]=await lanca({...base(),objetivo:'ENGAGEMENT',meta:'CONVERSATIONS',destino:{mensagem:'DIRECT'}});S=await ultimo('conjunto');K=await ultimo('criativo');
 t('conversas no Direct: CONVERSATIONS, destino INSTAGRAM_DIRECT, objeto promovido = Página, só Instagram, botão de mensagem',s===200&&S.optimization_goal==='CONVERSATIONS'&&S.destination_type==='INSTAGRAM_DIRECT'&&JSON.parse(S.promoted_object).page_id==='p1'&&JSON.parse(S.targeting).publisher_platforms.join()==='instagram'&&/INSTAGRAM_MESSAGE/.test(K.call_to_action),[s,r.erro,S]);
 [s]=await lanca({...base(),objetivo:'ENGAGEMENT',meta:'CONVERSATIONS',destino:{mensagem:'WHATSAPP',whatsapp:'+55 83 99999-0000'}});S=await ultimo('conjunto');
 t('conversas no WhatsApp: destino WHATSAPP e número no objeto promovido',s===200&&S.destination_type==='WHATSAPP'&&JSON.parse(S.promoted_object).whatsapp_phone_number==='+5583999990000',S);
 // 5) leads com formulário instantâneo
 [s,r]=await lanca({...base(),objetivo:'LEADS',meta:'LEAD_GENERATION',destino:{formId:'LF1'},criativo:{tipo:'IMAGEM',conteudoId:post,texto:'Cadastre-se',cta:'SIGN_UP'}});S=await ultimo('conjunto');K=await ultimo('criativo');
 t('leads: OUTCOME_LEADS, LEAD_GENERATION, destino ON_AD e formulário no botão do anúncio',s===200&&S.optimization_goal==='LEAD_GENERATION'&&S.destination_type==='ON_AD'&&JSON.parse(K.object_story_spec).link_data.call_to_action.value.lead_gen_form_id==='LF1',[s,r.erro]);
 // 6) vendas com pixel
 [s,r]=await lanca({...base(),objetivo:'SALES',meta:'OFFSITE_CONVERSIONS',destino:{siteUrl:'https://matricula.exemplo.com.br',pixelId:'PX1',evento:'COMPLETE_REGISTRATION'},criativo:{tipo:'IMAGEM',conteudoId:post,texto:'Matricule-se'}});S=await ultimo('conjunto');
 t('vendas: OUTCOME_SALES, OFFSITE_CONVERSIONS, pixel e evento no objeto promovido',s===200&&S.optimization_goal==='OFFSITE_CONVERSIONS'&&JSON.parse(S.promoted_object).pixel_id==='PX1'&&JSON.parse(S.promoted_object).custom_event_type==='COMPLETE_REGISTRATION',[s,r.erro,S]);
 // 7) app
 [s,r]=await lanca({...base(),objetivo:'APP',meta:'APP_INSTALLS',destino:{appId:'123456789',lojaUrl:'https://play.google.com/store/apps/details?id=br.com.evo'},criativo:{tipo:'IMAGEM',conteudoId:post,texto:'Baixe o app',cta:'INSTALL_MOBILE_APP'}});S=await ultimo('conjunto');
 t('app: OUTCOME_APP_PROMOTION, APP_INSTALLS, ID do app e loja no objeto promovido',s===200&&S.optimization_goal==='APP_INSTALLS'&&JSON.parse(S.promoted_object).application_id==='123456789'&&/play\.google/.test(JSON.parse(S.promoted_object).object_store_url),[s,r.erro]);
 // 8) visitas ao perfil e vídeo
 [s]=await lanca({...base(),objetivo:'TRAFFIC',meta:'PROFILE_VISIT'});S=await ultimo('conjunto');t('visitas ao perfil: destino INSTAGRAM_PROFILE',s===200&&S.destination_type==='INSTAGRAM_PROFILE');
 [s]=await lanca({...base(),objetivo:'ENGAGEMENT',meta:'THRUPLAY',criativo:{tipo:'POST_IG',midia:'m2'}});S=await ultimo('conjunto');t('visualizações de vídeo: THRUPLAY, destino ON_VIDEO',s===200&&S.optimization_goal==='THRUPLAY'&&S.destination_type==='ON_VIDEO');
 // ---- público, orçamento e lance
 [s,r]=await lanca({...base(),publico:{genero:'mulheres',idadeMin:30,idadeMax:45,raioKm:12,interesses:[{id:'6003107902433',nome:'Educação infantil'}],publicosPersonalizados:['CA1'],plataformas:['instagram','facebook']},orcamento:{tipo:'TOTAL',valor:400},dias:10,lance:{tipo:'LIMITE_CUSTO',valor:8.5}});S=await ultimo('conjunto');const tg=JSON.parse(S.targeting);
 t('público completo: gênero, idade, raio, interesses, público personalizado e posicionamentos manuais',s===200&&tg.genders.join()==='2'&&tg.age_min===30&&tg.age_max===45&&tg.geo_locations.cities[0].radius===12&&tg.flexible_spec[0].interests[0].id==='6003107902433'&&tg.custom_audiences[0].id==='CA1'&&tg.publisher_platforms.join()==='instagram,facebook',[s,r.erro,tg]);
 t('orçamento total vira lifetime_budget em centavos e o limite de custo vira COST_CAP com lance',S.lifetime_budget==='40000'&&!S.daily_budget&&S.bid_strategy==='COST_CAP'&&S.bid_amount==='850',S);
 [s]=await lanca({...base(),orcamento:{tipo:'DIARIO',valor:25},publico:{genero:'homens'}});S=await ultimo('conjunto');t('orçamento diário em centavos (R$ 25 = 2500) e público de homens',S.daily_budget==='2500'&&JSON.parse(S.targeting).genders.join()==='1'&&S.bid_strategy==='LOWEST_COST_WITHOUT_CAP');
 // ---- duplicidade, registro, falha
 const spec=base();[s,r]=await lanca(spec);const total=(await novos()).filter(([,v])=>v.tipo==='campanha').length;[s,r]=await lanca(spec);
 t('reenviar o mesmo pedido não cria outra campanha',s===200&&r.lancamento.repetido===true&&(await novos()).filter(([,v])=>v.tipo==='campanha').length===total,r);
 [,r]=await call('GET','/ads/gestao');t('todos os lançamentos ficam registrados como CAMPANHA, com objetivo/resultado',r.lancamentos.filter(l=>l.tipo==='CAMPANHA').length>=10&&r.lancamentos.some(l=>l.objetivo==='SALES/OFFSITE_CONVERSIONS'),r.lancamentos.slice(0,2));
 await call('POST','/integrations/meta/token',{token:'FAILSET_TOKEN'});
 [s,r]=await lanca({...base(),objetivo:'ENGAGEMENT',meta:'CONVERSATIONS',destino:{mensagem:'DIRECT'}});const falha=(await novos()).filter(([,v])=>v.tipo==='campanha').pop()[1];
 t('falha no meio: campanha incompleta pausada e removida, e o erro da Meta aparece',s===502&&/destination_type/.test(r.error)&&falha.mudancas.join()==='PAUSED,DELETED',[s,r,falha.mudancas]);
 await call('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});
 // teto mensal considera o que está em andamento
 await call('POST','/ads/gestao/config',{tetoMes:2200});r=await prev(base());t('teto mensal considera gasto do mês + campanhas em andamento',!r.ok&&r.pendente>0&&r.erros.some(e=>/campanhas em andamento/.test(e)),[r.pendente,r.erros]);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
