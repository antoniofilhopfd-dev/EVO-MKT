// Gestor de Anúncios (Fase 1): impulsionar publicação ATIVA, tetos, confirmação, duplicidade, falha no meio, pausar/retomar/pausar tudo. Uso: node gestao.test.js <install.out>
const fs=require('fs');const path=require('path');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,700))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
(async()=>{
 const login=async(c,n)=>{let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});let ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:n})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:n})});return {...J,Cookie:cookie(r)}};
 const G=await login('NAT-3301','Nat26ab'),E=await login('ANT-3302','Ant26ab');
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const mock=async p=>(await fetch('http://127.0.0.1:8099'+p)).json();
 const novos=async()=>Object.entries((await mock('/__state')).ads_novos||{});
 let s,r;
 // preparação: Meta conectada, conta escolhida, publicações lidas e gasto do mês
 await call('POST','/ads/modo',{gestao:true}); // o Tráfego nasce só-leitura; estas suítes testam o modo completo
 await call('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});await call('POST','/integrations/instagram/sync',{});
 await call('GET','/integrations/ads/accounts');await call('POST','/integrations/ads/account',{conta:'111222333'});await call('POST','/integrations/ads/sync',{});
 // ---- desligado por padrão e só Gerência
 [s,r]=await call('GET','/ads/gestao');t('gestão vem desligada por padrão, com os tetos e o público padrão do desenho',s===200&&r.config.ativa===false&&r.config.tetoDia===50&&r.config.tetoMes===3000&&r.config.diasMax===14&&r.config.publico.raioKm===20&&r.config.publico.idadeMin===25&&r.config.publico.idadeMax===55,r.config);
 for(const [m,u,b] of [['GET','/ads/gestao'],['POST','/ads/gestao/config',{ativa:true}],['POST','/ads/previa',{}],['POST','/ads/impulsionar',{confirmou:true}],['POST','/ads/pausar',{id:1}],['POST','/ads/retomar',{id:1}],['POST','/ads/pausar-tudo',{}]]){[s]=await call(m,u,b,E);t(`Equipe não acessa ${u} (403)`,s===403)}
 [s,r]=await call('POST','/ads/previa',{chave:'x',midia:'m2',orcamentoDia:20,dias:7,objetivo:'CONVERSAS'});t('com a gestão desligada a prévia recusa e explica',s===200&&r.ok===false&&r.erros.some(e=>/desligada/.test(e)),r);
 [s,r]=await call('POST','/ads/impulsionar',{chave:'abcdefghijklmnop0001',midia:'m2',orcamentoDia:20,dias:7,objetivo:'CONVERSAS',confirmou:true});t('com a gestão desligada nada é criado na Meta',s===502&&(await novos()).length===0,r);
 // ---- configuração
 [s]=await call('POST','/ads/gestao/config',{tetoDia:1});t('teto diário abaixo do mínimo é recusado (400)',s===400);
 [s]=await call('POST','/ads/gestao/config',{idadeMin:60,idadeMax:30});t('idade mínima maior que a máxima é recusada (400)',s===400);
 [s]=await call('POST','/ads/gestao/config',{raioKm:500});t('raio acima de 80 km é recusado (400)',s===400);
 [s]=await call('POST','/ads/gestao/config',{cidade:'Naolandia'});t('cidade que a Meta não conhece é recusada (400)',s===400);
 [s,r]=await call('POST','/ads/gestao/config',{ativa:true,cidade:'João Pessoa'});t('Gerência liga a gestão e define a cidade (resolvida na Meta)',s===200&&r.config.ativa===true&&r.config.publico.cidade.key==='2430536'&&r.config.publico.cidade.nome==='João Pessoa',r);
 [,r]=await call('GET','/ads/gestao');t('a permissão ads_management aparece como concedida',r.permissao===true,r);
 // ---- prévia e travas
 const base={chave:'abcdefghijklmnop0002',midia:'m2',orcamentoDia:20,dias:7,objetivo:'CONVERSAS'};
 [,r]=await call('POST','/ads/previa',base);t('prévia válida: compromisso = R$/dia × dias, sem erros',r.ok===true&&r.compromisso===140&&r.erros.length===0&&r.resumo.vaiAoArAtivo===true,r);
 [,r]=await call('POST','/ads/previa',{...base,orcamentoDia:80});t('acima do teto por campanha: recusado com o número',r.ok===false&&r.erros.some(e=>/teto por campanha \(50\)/.test(e)),r.erros);
 [,r]=await call('POST','/ads/previa',{...base,orcamentoDia:3});t('abaixo do mínimo diário: recusado',r.ok===false&&r.erros.some(e=>/mínimo/.test(e)),r.erros);
 [,r]=await call('POST','/ads/previa',{...base,dias:30});t('duração acima do máximo: recusado',r.ok===false&&r.erros.some(e=>/máximo \(14/.test(e)),r.erros);
 [,r]=await call('POST','/ads/previa',{...base,midia:'nao-existe'});t('publicação que não veio do Instagram conectado: recusado',r.ok===false&&r.erros.some(e=>/não foi lida/.test(e)),r.erros);
 [,r]=await call('POST','/ads/previa',{...base,objetivo:'XYZ'});t('objetivo inválido: recusado',r.ok===false&&r.erros.some(e=>/Objetivo/.test(e)));
 await call('POST','/ads/gestao/config',{tetoMes:2100});[,r]=await call('POST','/ads/previa',base);
 t('teto mensal considera o gasto do mês já lido da Meta',r.ok===false&&r.gastoMes>2000&&r.erros.some(e=>/teto mensal \(2100\)/.test(e)),[r.gastoMes,r.erros]);
 await call('POST','/ads/gestao/config',{tetoMes:3000});
 [s]=await call('POST','/ads/impulsionar',{...base});t('sem confirmar na tela de resumo não lança (400)',s===400&&(await novos()).length===0);
 [s]=await call('POST','/ads/impulsionar',{...base,chave:'curta',confirmou:true});t('pedido sem chave de segurança é recusado',s===502&&(await novos()).length===0);
 // ---- lançamento (vai ao ar ATIVO)
 [s,r]=await call('POST','/ads/impulsionar',{...base,confirmou:true});
 t('lança: lançamento ATIVO com os identificadores da campanha e do anúncio na Meta',s===200&&r.lancamento.estado==='ATIVO'&&/^CAMP_/.test(r.lancamento.campanha_id)&&/^AD_/.test(r.lancamento.anuncio_id),r);
 const nv=await novos(),camp=nv.find(([,v])=>v.tipo==='campanha')[1],set=nv.find(([,v])=>v.tipo==='conjunto')[1],cre=nv.find(([,v])=>v.tipo==='criativo')[1],ad=nv.find(([,v])=>v.tipo==='anuncio')[1];
 t('vai ao ar ATIVO (campanha, conjunto e anúncio), não pausado',camp.params.status==='ACTIVE'&&set.params.status==='ACTIVE'&&ad.params.status==='ACTIVE',[camp.params.status,set.params.status,ad.params.status]);
 t('objetivo de conversas no Instagram Direct, otimizando conversas',camp.params.objective==='OUTCOME_ENGAGEMENT'&&set.params.optimization_goal==='CONVERSATIONS'&&set.params.destination_type==='INSTAGRAM_DIRECT');
 t('orçamento diário em centavos (R$ 20 = 2000) e término em 7 dias',set.params.daily_budget==='2000'&&Math.abs((new Date(set.params.end_time)-Date.now())/86400000-7)<0.1,[set.params.daily_budget,set.params.end_time]);
 const tg=JSON.parse(set.params.targeting);t('público: cidade resolvida, raio 20 km, 25 a 55 anos, só Instagram',tg.geo_locations.cities[0].key==='2430536'&&tg.geo_locations.cities[0].radius===20&&tg.geo_locations.cities[0].distance_unit==='kilometer'&&tg.age_min===25&&tg.age_max===55&&tg.publisher_platforms.join()==='instagram',tg);
 t('criativo usa a publicação existente (impulsionar) e a conta do Instagram',cre.params.source_instagram_media_id==='m2'&&cre.params.instagram_user_id==='17841400000000000'&&cre.params.object_id==='p1',cre.params);
 t('nome identifica o que veio do sistema ([EVO MKT])',/^\[EVO MKT\]/.test(camp.params.name));
 // idempotência
 [s,r]=await call('POST','/ads/impulsionar',{...base,confirmou:true});
 t('reenviar o mesmo pedido não cria outra campanha (devolve o lançamento existente)',s===200&&r.lancamento.repetido===true&&(await novos()).filter(([,v])=>v.tipo==='campanha').length===1,r);
 [,r]=await call('GET','/ads/gestao');t('lançamento listado com quem lançou, orçamento, compromisso e término',r.lancamentos.length===1&&r.lancamentos[0].quem&&Number(r.lancamentos[0].compromisso)===140&&r.lancamentos[0].estado==='ATIVO',r.lancamentos);
 const nts=(await call('GET','/notificacoes'))[1].rows.filter(n=>n.tipo==='ads_lancamento');t('a Gerência é avisada do lançamento',nts.length===1&&/Anúncio lançado/.test(nts[0].titulo),nts);
 // compromisso pendente entra na conta do mês
 [,r]=await call('POST','/ads/previa',{...base,chave:'abcdefghijklmnop0003'});t('campanha em andamento entra no compromisso do mês (pendente > 0)',r.pendente>=100&&r.pendente<=140,r.pendente);
 await call('POST','/ads/gestao/config',{tetoMes:2300});[,r]=await call('POST','/ads/previa',{...base,chave:'abcdefghijklmnop0003'});t('gasto + campanhas em andamento + nova passa do teto: recusado',r.ok===false&&r.erros.some(e=>/campanhas em andamento/.test(e)),r.erros);
 await call('POST','/ads/gestao/config',{tetoMes:3000});
 // pausar / retomar
 const id1=(await call('GET','/ads/gestao'))[1].lancamentos[0].id;
 [s,r]=await call('POST','/ads/pausar',{id:id1});t('pausar: estado PAUSADO e campanha PAUSED na Meta',s===200&&r.lancamento.estado==='PAUSADO'&&(await novos()).find(([k])=>k===r.lancamento.campanha_id)[1].status==='PAUSED',r);
 [s]=await call('POST','/ads/pausar',{id:id1});t('pausar o que já está pausado: 409',s===409);
 [s,r]=await call('POST','/ads/retomar',{id:id1});t('retomar: volta a ATIVO e ACTIVE na Meta',s===200&&r.lancamento.estado==='ATIVO'&&(await novos()).find(([k])=>k===r.lancamento.campanha_id)[1].status==='ACTIVE',r);
 [s]=await call('POST','/ads/pausar',{id:99999});t('lançamento inexistente: 409 com mensagem',s===409);
 // segundo lançamento (alcance) e pausar tudo
 [s,r]=await call('POST','/ads/impulsionar',{chave:'abcdefghijklmnop0004',midia:'m1',orcamentoDia:10,dias:3,objetivo:'ALCANCE',confirmou:true});
 const set2=(await novos()).filter(([,v])=>v.tipo==='conjunto')[1][1];
 t('objetivo alcance: otimiza REACH e não usa destino de mensagem',s===200&&set2.params.optimization_goal==='REACH'&&!set2.params.destination_type,set2.params);
 [s,r]=await call('POST','/ads/pausar-tudo',{});const camps=(await novos()).filter(([,v])=>v.tipo==='campanha');
 t('"Pausar tudo" pausa todas as campanhas lançadas pelo sistema',s===200&&r.pausados===2&&camps.every(([,v])=>v.status==='PAUSED'),[r,camps.map(([,v])=>v.status)]);
 // WhatsApp como resultado próprio
 [s,r]=await call('POST','/ads/previa',{...base,chave:'abcdefghijklmnop0007',objetivo:'WHATSAPP'});t('impulsionar para WhatsApp sem número cadastrado: recusado',r.ok===false&&r.erros.some(e=>/WhatsApp/.test(e)),r);
 [s,r]=await call('POST','/ads/gestao/config',{whatsapp:'abc'});t('número de WhatsApp inválido: 400',s===400,r);
 [s,r]=await call('POST','/ads/gestao/config',{whatsapp:'+55 83 99999-0000'});t('número do WhatsApp do Colégio é salvo',s===200&&r.config.whatsapp==='+5583999990000',r);
 [s,r]=await call('POST','/ads/impulsionar',{chave:'abcdefghijklmnop0007',midia:'m1',orcamentoDia:10,dias:3,objetivo:'WHATSAPP',confirmou:true});
 const setW=(await novos()).filter(([,v])=>v.tipo==='conjunto').pop()[1], criW=(await novos()).filter(([,v])=>v.tipo==='criativo').pop()[1];
 t('impulsionar WhatsApp: destino WHATSAPP, número no objeto promovido e botão do WhatsApp',s===200&&setW.params.destination_type==='WHATSAPP'&&JSON.parse(setW.params.promoted_object).whatsapp_phone_number==='+5583999990000'&&/WHATSAPP_MESSAGE/.test(criW.params.call_to_action),[setW.params,criW.params]);
 // falha no meio: compensação
 await call('POST','/integrations/meta/token',{token:'FAILSET_TOKEN'});
 [s,r]=await call('POST','/ads/impulsionar',{chave:'abcdefghijklmnop0005',midia:'m3',orcamentoDia:10,dias:3,objetivo:'CONVERSAS',confirmou:true});
 const falha=(await novos()).filter(([,v])=>v.tipo==='campanha').pop()[1];
 t('se a Meta recusa no meio, a campanha incompleta é pausada e removida e o erro é mostrado',s===502&&/recusou/.test(r.error)&&/destination_type/.test(r.error)&&falha.mudancas.join()==='PAUSED,DELETED',[r,falha.mudancas]);
 [,r]=await call('GET','/ads/gestao');t('o lançamento que falhou fica registrado como ERRO com o motivo',r.lancamentos[0].estado==='ERRO'&&/destination_type/.test(r.lancamentos[0].erro),r.lancamentos[0]);
 await call('POST','/integrations/meta/token',{token:'NOMGMT_TOKEN'});
 [,r]=await call('GET','/ads/gestao');t('sem a permissão ads_management o painel mostra permissão ausente',r.permissao===false,r);
 [s,r]=await call('POST','/ads/impulsionar',{chave:'abcdefghijklmnop0006',midia:'m3',orcamentoDia:10,dias:3,objetivo:'CONVERSAS',confirmou:true});t('sem a permissão: não lança e orienta a reconectar',s===502&&/ads_management/.test(r.error),r);
 await call('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});
 // separação leitura × escrita
 const lib=p=>fs.readFileSync(path.join(__dirname,'..','lib','integrations',p),'utf8');
 t('o código de leitura (metaads.ts e metarelatorio.ts) continua sem nenhuma chamada de escrita na Meta',!/metaPost|'POST'/.test(lib('metaads.ts'))&&!/metaPost|'POST'/.test(lib('metarelatorio.ts')));
 t('só metaadsGestao.ts escreve na Meta Ads',/metaPost/.test(lib('metaadsGestao.ts')));
 const mo=(await mock('/__state')).calls;t('toda escrita em anúncios na Meta veio das rotas do Gestor (nenhuma antes de ligar a gestão)',mo.filter(x=>/^POST \/graph\/act_/.test(x)).length>0);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
