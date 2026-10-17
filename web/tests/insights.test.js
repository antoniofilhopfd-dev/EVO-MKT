// Insights: saúde por segmento, datas, melhores horários, ranking e resumo diário. Uso: node insights.test.js <install.out>
const fs=require('fs');const {execFileSync}=require('child_process');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const B=(process.env.BASE||'http://127.0.0.1:8080')+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',JSON.stringify(x).slice(0,500))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const sql=q=>execFileSync('mariadb',['--default-character-set=utf8mb4','-uroot','-S','/run/mysqld/mysqld.sock','evowebtest','-N','-e',q],{encoding:'utf8'});
(async()=>{
 const login=async(c,n)=>{let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});let ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:n})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:n})});return {...J,Cookie:cookie(r)}};
 const G=await login('NAT-3301','Nat26ab'),E=await login('ANT-3302','Ant26ab');
 const call=async(m,u,b,h=G)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 // segmentos: Infantil saudável (nenhuma vencida), Médio com 2 vencidas
 const mk=async(seg,tipo)=>(await call('POST','/data?module=solicitacoes',{titulo:'Saúde '+seg,segmento:seg,tipoSolicitacao:tipo,status:'EM EXECUÇÃO'}))[1].id;
 await mk('Infantil','Post');const a=await mk('Médio','Post'),b=await mk('Médio','Post');
 for(const id of [a,b])sql(`UPDATE records SET data=JSON_SET(data,'$.criadoEm','2026-01-05T10:00:00-03:00') WHERE modulo='solicitacoes' AND id='${id}'`);
 let [s,r]=await call('GET','/insights');
 const seg=n=>r.saude.find(x=>x.segmento===n);
 t('saúde: segmento com SLA vencido tem nota menor e lista os registros',s===200&&seg('Médio').score<seg('Infantil').score&&seg('Médio').ids.length===2&&/SLA vencido/.test(seg('Médio').sinais.join(' ')),r.saude);
 t('saúde: segmento sem alertas fica em 100',seg('Infantil').score===100);
 t('insights: a Equipe acessa (200)',(await call('GET','/insights',null,E))[0]===200);
 // horários: sem amostra mínima não inventa
 t('melhores horários: com poucas publicações não calcula (sem inventar)',r.horarios.melhor===null&&r.horarios.minimo===8);
 const ins=(i,ts,l,c)=>sql(`INSERT INTO ig_posts(media_id,publicado_em,tipo,legenda,curtidas,comentarios,permalink,atualizado_em) VALUES('p${i}','${ts}','FEED','post ${i}',${l},${c},'https://i/p${i}','x')`);
 // 9 posts: terças às 12h (UTC-3: 15:00Z) rendem mais
 for(let i=0;i<9;i++)ins(i,i<5?'2026-09-01T15:00:00+0000':`2026-09-0${2+(i%3)}T22:00:00+0000`,i<5?200:20,i<5?10:2);
 [,r]=await call('GET','/insights');
 t('melhores horários: acha terça às 12h e informa confiança alta',r.horarios.melhor&&r.horarios.melhor.dia==='Terça'&&r.horarios.melhor.hora===12&&r.horarios.melhor.confianca==='alta',r.horarios);
 t('ranking: ordenado por interações, com link',r.ranking.length===8&&r.ranking[0].interacoes===210&&r.ranking[0].link.startsWith('https://'),r.ranking.slice(0,2));
 // datas
 [s,r]=await call('GET','/datas?dias=400',null,E);
 const tit=r.rows.map(x=>x.titulo);
 t('datas: equipe vê; inclui Dia do Professor, Páscoa e Dia das Mães (móveis calculadas)',s===200&&['Dia do Professor','Páscoa','Dia das Mães','Dia dos Pais','Carnaval'].every(x=>tit.includes(x)),tit);
 t('datas: cada item tem "planejar até" 30 dias antes',r.rows.every(x=>{const d=new Date(x.data+'T00:00:00Z').getTime()-new Date(x.planejarAte+'T00:00:00Z').getTime();return d===30*86400000}));
 // resumo diário
 fs.writeFileSync(process.env.MAILLOG,'');
 const c=await fetch(B+'/cron/alertas',{headers:{Authorization:'Bearer cron-de-teste-0123456789'}});
 const mail=fs.readFileSync(process.env.MAILLOG,'utf8');
 t('resumo diário inclui bloco "Operação" com SLA vencido',c.status===200&&/Operação:/.test(mail)&&/SLA vencido/.test(mail),mail.slice(0,400));
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
