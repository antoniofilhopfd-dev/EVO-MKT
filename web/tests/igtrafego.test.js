// Recursos opcionais de Instagram e Tráfego: modelos, seguidores manuais, relatório mensal, regras automáticas, relatório semanal, matrículas e rascunhos. Uso: node igtrafego.test.js <install.out>
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
 await call('POST','/integrations/meta/token',{token:'GOOD_TOKEN'});await call('POST','/integrations/instagram/sync',{});
 await call('GET','/integrations/ads/accounts');await call('POST','/integrations/ads/account',{conta:'111222333'});await call('POST','/integrations/ads/sync',{});
 // permissões
 for(const [m,u,b] of [['GET','/ads/extras'],['POST','/ads/regras',{ativa:true}],['POST','/ads/regras/simular',{}],['POST','/ads/relatorio-semanal',{ativo:true}],['POST','/ads/matriculas',{mes:'2026-01',matriculas:3}],['POST','/ads/rascunhos',{nome:'x',dados:{}}],['GET','/instagram/relatorio'],['POST','/instagram/seguidores/manual',{mes:'2025-01',seguidores:10}]]){[s]=await call(m,u,b,E);t(`Equipe não acessa ${u} (403)`,s===403)}
 // modelos de legenda (Equipe pode)
 [s,r]=await call('GET','/studio/modelos',null,E);t('modelos: lista vazia no início',s===200&&r.modelos.length===0,r);
 [s]=await call('POST','/studio/modelos',{modelos:[{nome:'',legenda:'x'}]},E);t('modelo sem nome é recusado',s===400);
 [s,r]=await call('POST','/studio/modelos',{modelos:[{nome:'Matrículas',legenda:'Matrículas abertas! {data}',cta:'Link na bio',hashtags:'#evolucao'}]},E);t('Equipe salva um modelo',s===200&&r.modelos.length===1);
 [,r]=await call('GET','/studio/modelos');t('Gerência vê o modelo salvo',r.modelos[0].nome==='Matrículas'&&r.modelos[0].cta==='Link na bio',r);
 // seguidores manuais
 [s]=await call('POST','/instagram/seguidores/manual',{mes:'2025-13',seguidores:10});t('mês inválido é recusado',s===400);
 [s]=await call('POST','/instagram/seguidores/manual',{mes:'2025-01',seguidores:-4});t('número negativo é recusado',s===400);
 [s]=await call('POST','/instagram/seguidores/manual',{mes:'2025-01',seguidores:9500});t('Gerência informa os seguidores de um mês passado',s===200);
 [,r]=await call('GET','/instagram/seguidores');t('o mês informado aparece na série mensal e anual',r.mensal.some(x=>x.periodo==='2025-01'&&x.seguidores===9500)&&r.anual.some(x=>x.periodo==='2025'),r);
 const mesAtual=new Date().toISOString().slice(0,7);
 [s]=await call('POST','/instagram/seguidores/manual',{mes:mesAtual,seguidores:1});t('mês que o sistema já registrou sozinho não é sobrescrito (409)',s===409);
 // relatório mensal do Instagram
 [s,r]=await call('GET','/instagram/relatorio?mes='+mesAtual);t('relatório mensal traz mês, posts e mês anterior',s===200&&r.mes===mesAtual&&Array.isArray(r.posts)&&/^\d{4}-\d{2}$/.test(r.anterior),r);
 const pg=await fetch(B.replace('/api','')+'/relatorio-instagram.html');t('página do relatório mensal existe',pg.status===200&&/Relatório mensal/.test(await pg.text()));
 // regras automáticas
 [,r]=await call('GET','/ads/extras');t('regras vêm desligadas por padrão, aviso como ação',r.regras.ativa===false&&r.regras.acao==='AVISAR'&&r.relatorioSemanal===false,r);
 [s,r]=await call('POST','/ads/regras',{ativa:true,acao:'QUALQUER',gastoSemResultado:25,dias:5,custoMax:12});t('ação desconhecida cai em AVISAR; valores são guardados',s===200&&r.regras.ativa===true&&r.regras.acao==='AVISAR'&&r.regras.gastoSemResultado===25&&r.regras.dias===5&&r.regras.custoMax===12,r);
 [s,r]=await call('POST','/ads/regras',{dias:999});t('dias fora da faixa são limitados a 30',r.regras.dias===30);
 [s,r]=await call('POST','/ads/regras/simular',{});t('simulação lê a conta e devolve a lista do que a regra pegaria',s===200&&Array.isArray(r.achados)&&r.simulado===true,r);
 // relatório semanal
 [s,r]=await call('POST','/ads/relatorio-semanal',{ativo:true});t('liga o relatório semanal por e-mail',s===200&&r.ativo===true);
 // matrículas
 [s]=await call('POST','/ads/matriculas',{mes:'2026-1',matriculas:3});t('mês inválido nas matrículas: 400',s===400);
 [s,r]=await call('POST','/ads/matriculas',{mes:mesAtual,matriculas:4});const linha=(r.matriculas||[]).find(x=>x.mes===mesAtual);t('matrículas do mês guardadas; custo por matrícula = investimento / matrículas',s===200&&linha&&linha.matriculas===4&&(linha.gasto===0?linha.custo===0:Math.abs(linha.custo-linha.gasto/4)<0.01),r);
 // rascunhos
 [s,r]=await call('POST','/ads/rascunhos',{nome:'Matrículas 2027',dados:{passo:2,objetivo:'ENGAGEMENT'}});const rid=r.rascunho&&r.rascunho.id;t('salva rascunho de campanha',s===200&&rid&&r.rascunhos.length===1,r);
 [s,r]=await call('POST','/ads/rascunhos',{nome:'Matrículas 2027 v2',dados:{passo:3},id:rid});t('salvar de novo com o mesmo id atualiza (não duplica)',r.rascunhos.length===1&&r.rascunhos[0].dados.passo===3,r);
 [s,r]=await call('POST','/ads/rascunhos',{excluir:rid});t('exclui o rascunho',r.rascunhos.length===0);
 console.log(`${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
