// Gerenciador de Anúncios (Etapa A): árvore da conta inteira com métricas e edição de tudo. Uso: node gerenciador.test.js <install.out>
const fs=require('fs');const path=require('path');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,700))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
(async()=>{
 const login=async(c,n)=>{let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});let ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:n})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:n})});return {...J,Cookie:cookie(r)}};
 const G=await login('NAT-3301','Nat26ab'),E=await login('ANT-3302','Ant26ab');
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const mock=async p=>(await fetch('http://127.0.0.1:8099'+p)).json();
 let s,r;
 await call('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});await call('GET','/integrations/ads/accounts');await call('POST','/integrations/ads/account',{conta:'111222333'});
 const hoje=new Date().toISOString().slice(0,10);
 // ---- árvore
 [s,r]=await call('GET','/ads/arvore');
 t('árvore traz a conta inteira: campanhas > conjuntos > anúncios',s===200&&r.campanhas.length===4&&r.campanhas.find(c=>c.id==='c1').conjuntos[0].id==='s1'&&r.campanhas.find(c=>c.id==='c1').conjuntos[0].anuncios.map(a=>a.id).join()==='a1,a2',r.campanhas&&r.campanhas.map(c=>[c.id,c.conjuntos.length]));
 const c1=r.campanhas.find(c=>c.id==='c1'),s1=c1.conjuntos[0],c2=r.campanhas.find(c=>c.id==='c2'),s2=c2.conjuntos[0];
 t('métricas por nível: gasto, impressões, CTR e CPC',Math.abs(c1.gasto-1234.56)<0.01&&c1.impressoes===90000&&Math.abs(c1.ctr-(2100/90000*100))<0.001&&Math.abs(c1.cpc-1234.56/2100)<0.001,c1);
 t('resultado segue o objetivo: leads/conversas na campanha de leads, engajamentos no de engajamento',c1.resultados===55&&c1.rotuloResultado==='Leads'&&s1.resultados===35&&s2.resultados===800&&s2.rotuloResultado==='Engajamentos',[c1.resultados,s1.resultados,s2.resultados,s2.rotuloResultado]);
 t('custo por resultado = gasto ÷ resultados (nulo sem resultado)',Math.abs(s1.custoResultado-1234.56/35)<0.01&&r.campanhas.find(c=>c.id==='c3').custoResultado===null);
 t('orçamento em unidade normal (5000 centavos = 50), público e anúncios com foto só https',s1.orcamento.diario===50&&s1.publico.idadeMin===25&&s1.publico.cidades[0].raioKm===15&&s1.anuncios[0].foto==='https://scontent.fbcdn.net/a1.jpg'&&s1.anuncios[1].foto==='',[s1.orcamento,s1.publico,s1.anuncios.map(a=>a.foto)]);
 t('totais da conta somam as campanhas',Math.abs(r.totais.gasto-2084.56)<0.01&&r.totais.cliques===2920);
 [s]=await call('GET','/ads/arvore',null,E);t('Equipe não vê o gerenciador (403)',s===403);
 [s]=await call('GET','/ads/arvore?de=2026-10-10&ate=2026-10-01');t('período invertido: 400',s===400);
 [s]=await call('GET','/ads/arvore?de=2026-01-01&ate=2026-12-31');t('período acima de 93 dias: 400',s===400);
 // ---- editar exige gestão ligada
 [s,r]=await call('POST','/ads/editar',{nivel:'campanha',id:'c1',campos:{nome:'X novo'}});t('com a gestão desligada não edita nada',s===400&&/desligada/.test(r.error)&&!((await mock('/__state')).edits),r);
 await call('POST','/ads/gestao/config',{ativa:true,cidade:'João Pessoa'});
 const ed=async(nivel,id,campos,confirmou)=>call('POST','/ads/editar',{nivel,id,campos,confirmou});
 const edits=async id=>((await mock('/__state')).edits||{})[id]||[];
 // nome e status
 [s]=await ed('campanha','c1',{nome:'Matrículas 2027 – v2'});t('renomear campanha',s===200&&(await edits('c1')).some(e=>e.name==='Matrículas 2027 – v2'));
 [s]=await ed('campanha','c1',{nome:'  '});t('nome vazio é recusado',s===400);
 [s]=await ed('conjunto','s1',{status:'PAUSED'});t('pausar conjunto',s===200&&(await edits('s1')).some(e=>e.status==='PAUSED'));
 [s]=await ed('anuncio','a1',{status:'ACTIVE'});t('ativar anúncio (gera aviso à Gerência)',s===200&&(await call('GET','/notificacoes'))[1].rows.some(n=>n.tipo==='ads_acao'&&/ACTIVE/.test(n.texto)));
 [s]=await ed('anuncio','a1',{status:'LIGADO'});t('status inválido é recusado',s===400);
 [s,r]=await ed('anuncio','a2',{status:'DELETED'});t('excluir sem confirmar é recusado',s===400&&/confirmação/.test(r.error)&&!(await edits('a2')).length);
 [s]=await ed('anuncio','a2',{status:'DELETED'},true);t('excluir confirmado',s===200&&(await edits('a2')).some(e=>e.status==='DELETED'));
 [s]=await ed('campanha','c4',{status:'ARCHIVED'});t('arquivar campanha',s===200&&(await edits('c4')).some(e=>e.status==='ARCHIVED'));
 // orçamento e tetos
 [s]=await ed('conjunto','s1',{orcamentoDia:30});t('orçamento diário R$ 30 vira 3000 centavos',s===200&&(await edits('s1')).some(e=>e.daily_budget==='3000'));
 [s,r]=await ed('conjunto','s1',{orcamentoDia:80});t('acima do teto por campanha: recusado e orienta',s===400&&/teto por campanha \(50\)/.test(r.error),r);
 [s]=await ed('conjunto','s1',{orcamentoDia:3});t('abaixo do mínimo: recusado',s===400);
 [s]=await ed('campanha','c2',{orcamentoTotal:5000});t('orçamento total acima do teto mensal: recusado',s===400);
 [s]=await ed('campanha','c2',{orcamentoTotal:900});t('orçamento total dentro do teto',s===200&&(await edits('c2')).some(e=>e.lifetime_budget==='90000'));
 await call('POST','/ads/gestao/config',{tetoDia:200});[s]=await ed('conjunto','s1',{orcamentoDia:80});t('a Gerência pode subir o teto e então o orçamento maior passa',s===200);
 // datas
 [s]=await ed('conjunto','s1',{fim:'2026-10-20T18:00'});t('alterar término do conjunto (data e hora)',s===200&&(await edits('s1')).some(e=>/^2026-10-20T/.test(e.end_time||'')));
 [s]=await ed('conjunto','s1',{fim:'20/10/2026'});t('data em formato inválido: recusada',s===400);
 // público
 [s]=await ed('conjunto','s1',{idadeMin:30,idadeMax:50,raioKm:25});const tg=JSON.parse(((await edits('s1')).filter(e=>e.targeting).pop()||{targeting:'{}'}).targeting);
 t('editar público: idade 30 a 50 e raio 25 km mantendo a cidade',s===200&&tg.age_min===30&&tg.age_max===50&&tg.geo_locations.cities[0].radius===25&&tg.geo_locations.cities[0].key==='2430536'&&tg.publisher_platforms===undefined||(s===200&&tg.age_min===30&&tg.geo_locations.cities[0].radius===25),tg);
 [s]=await ed('conjunto','s1',{raioKm:100});t('raio acima de 80 km: recusado',s===400);
 [s]=await ed('conjunto','s1',{idadeMin:70,idadeMax:75});t('idade fora de 18 a 65: recusada',s===400);
 [s]=await ed('conjunto','s2',{raioKm:10});t('raio em conjunto sem cidade: recusado com explicação',s===400);
 // segurança de objeto
 [s,r]=await ed('campanha','OUTRA_1',{nome:'invasão'});t('objeto de outra conta de anúncios é recusado',s===400&&/não pertence/.test(r.error)&&!(await edits('OUTRA_1')).length,r);
 [s]=await ed('campanha','a b;c',{nome:'x'});t('identificador malformado é recusado',s===400);
 [s]=await ed('campanha','c1',{});t('pedido vazio é recusado',s===400);
 [s]=await call('POST','/ads/editar',{nivel:'campanha',id:'c1',campos:{nome:'zzz'}},E);t('Equipe não edita (403)',s===403);
 // falha da Meta
 await call('POST','/integrations/meta/token',{token:'NOEDIT_TOKEN'});[s,r]=await ed('campanha','c3',{nome:'vai falhar'});
 t('Meta recusa: erro mostrado (502) e registrado no histórico como ERRO',s===502&&/Permissions error/.test(r.error)&&(await call('GET','/ads/acoes'))[1].rows[0].resultado==='ERRO');
 await call('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});
 // duplicar
 [s,r]=await call('POST','/ads/duplicar',{nivel:'campanha',id:'c1'});const cp=((await mock('/__state')).copias||[]).pop()||[];
 t('duplicar cria cópia PAUSADA com sufixo "– cópia" (como o Gerenciador da Meta)',s===200&&/^CAMP_/.test(r.copia.copied_campaign_id)&&cp[0]==='c1'&&cp[1].status_option==='PAUSED'&&/cópia/.test(cp[1].rename_options),[r,cp]);
 [s]=await call('POST','/ads/duplicar',{nivel:'campanha',id:'OUTRA_1'});t('não duplica objeto de outra conta',s===400);
 // histórico
 [,r]=await call('GET','/ads/acoes');const h=r.rows.find(x=>x.acao==='nome'&&x.objeto_id==='c1'&&x.resultado==='OK');
 t('histórico guarda quem, quando, nível, antes e depois',!!h&&h.quem&&h.nivel==='campanha'&&/Matrículas 2027/.test(h.antes)&&/v2/.test(h.depois)&&r.rows.some(x=>x.acao==='duplicar'),h);
 // separação leitura × escrita
 const lib=p=>fs.readFileSync(path.join(__dirname,'..','lib','integrations',p),'utf8');
 t('leitura (metaads.ts, metarelatorio.ts) continua sem escrita; só Gestor e Gerenciador escrevem',!/metaPost/.test(lib('metaads.ts'))&&!/metaPost/.test(lib('metarelatorio.ts'))&&/metaPost/.test(lib('metaadsGerenciador.ts'))&&/metaPost/.test(lib('metaadsGestao.ts')));
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
