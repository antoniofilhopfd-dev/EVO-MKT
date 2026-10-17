// Seis módulos (v5.17): Arquivos, preferências por usuário, limites de gasto, Excel, perfis Administrador/Equipe e rotas novas sem sessão.
// Uso: node seismodulos.test.js <install.out>
const fs=require('fs');
const out=fs.readFileSync(process.argv[2],'utf8');const pw=k=>out.match(new RegExp(k+'[^:]*: (\\S+)'))[1];const BASE=process.env.BASE||'http://127.0.0.1:8080';const B=BASE+'/api';
let ok=0,bad=0;const t=(n,c,x)=>{c?ok++:bad++;console.log(c?'OK  ':'FAIL',n);if(!c&&x!==undefined)console.log('    ',String(typeof x==='string'?x:JSON.stringify(x)).slice(0,600))};
const J={'Content-Type':'application/json','X-EVO':'1'};const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
(async()=>{
 const senha={'NAT-3301':'Nat26ab','ANT-3302':'Ant26ab'};const H={};
 for(const c of Object.keys(senha)){let r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:pw(c)})});const ck=cookie(r);await fetch(B+'/auth/password',{method:'POST',headers:{...J,Cookie:ck},body:JSON.stringify({atual:pw(c),nova:senha[c]})});r=await fetch(B+'/auth/login',{method:'POST',headers:J,body:JSON.stringify({codigo:c,senha:senha[c]})});H[c]={...J,Cookie:cookie(r)}}
 const A=H['NAT-3301'],E=H['ANT-3302'];
 const req=async(m,u,b,h=A)=>{const x=await fetch(B+u,{method:m,headers:h,body:b?JSON.stringify(b):undefined});let j=null;try{j=await x.json()}catch{}return [x.status,j]};
 const envia=async(h,nome,buf,pasta)=>{const f=new FormData();f.append('files',new Blob([buf],{type:'image/png'}),nome);if(pasta)f.append('pasta',pasta);const {'Content-Type':_,...hh}=h;const x=await fetch(B+'/arquivos/enviar',{method:'POST',headers:hh,body:f});let j=null;try{j=await x.json()}catch{}return [x.status,j]};

 // sem sessão
 const GETS=['/arquivos/lista','/prefs?chave=x','/ads/serie','/ads/quebra','/ads/publicos','/ads/saude','/ads/limites','/dashboard/resumo'];
 const POSTS=['/arquivos/pasta','/arquivos/enviar','/arquivos/renomear','/arquivos/mover','/arquivos/excluir','/prefs','/ads/limites','/reports/xlsx'];
 const f=[];for(const u of GETS){const [s]=await req('GET',u,null,{...J});if(s!==401)f.push(u+':'+s)}
 for(const u of POSTS){const [s]=await req('POST',u,{},{...J});if(s!==401)f.push(u+':'+s)}
 t('rotas novas exigem login (401)',f.length===0,f);
 const semCsrf=[];for(const u of POSTS){const [s]=await req('POST',u,{},{'Content-Type':'application/json',Cookie:A.Cookie});if(s!==403)semCsrf.push(u+':'+s)}
 t('escrita sem X-EVO é recusada (403)',semCsrf.length===0,semCsrf);

 // perfis: Equipe opera, mas não administra
 const adm=[['GET','/admin/users'],['GET','/admin/audit'],['GET','/backup/list'],['POST','/backup'],['POST','/admin/mode'],['POST','/admin/users/create'],['POST','/integrations/settings']];
 const rs=await Promise.all(adm.map(([m,u])=>req(m,u,m==='POST'?{}:null,E)));
 t('Equipe é barrada nas rotas de administração (403)',rs.every(([s])=>s===403),rs.map(([s],i)=>adm[i][1]+':'+s));
 const ra=await Promise.all(adm.slice(0,3).map(([m,u])=>req(m,u,null,A)));
 t('Administrador acessa a administração (200)',ra.every(([s])=>s===200),ra.map(([s])=>s));
 t('Equipe lê Arquivos e Dashboard (200)',(await req('GET','/arquivos/lista',null,E))[0]===200&&(await req('GET','/dashboard/resumo',null,E))[0]===200);

 // Arquivos
 let [s,r]=await envia(E,'logo.png',PNG,'Campanhas');t('Equipe envia imagem para uma pasta (201)',s===201&&r.arquivos[0].pasta==='Campanhas',r);
 const cam=r&&r.arquivos&&r.arquivos[0].caminho;
 [s,r]=await envia(A,'x.exe',Buffer.from('MZ'),'Geral');t('tipo não permitido é recusado (400)',s===400,r);
 [s,r]=await envia(A,'falso.png',Buffer.from('isto não é imagem'),'Geral');t('conteúdo que não bate com a extensão é recusado (400)',s===400,r);
 [s,r]=await envia(A,'a.png',PNG,'../../etc');t('nome de pasta malicioso não sai da biblioteca',s===201&&r.arquivos[0].caminho.startsWith('BIBLIOTECA/')&&!r.arquivos[0].caminho.includes('..'),r);
 [s,r]=await req('GET','/arquivos/lista');t('lista traz o arquivo, pastas e limite',s===200&&r.rows.some(x=>x.caminho===cam)&&r.pastas.includes('Campanhas')&&r.maxMb>0,r);
 [s]=await req('POST','/arquivos/pasta',{nome:'Eventos 2026'});t('cria pasta (201)',s===201);
 [s,r]=await req('POST','/arquivos/renomear',{caminho:cam,nome:'logo-novo.png'});t('renomear altera só o nome',s===200&&r.nome==='logo-novo.png');
 [s,r]=await req('POST','/arquivos/mover',{caminho:cam,pasta:'Eventos 2026'});t('mover altera só a pasta',s===200);
 [,r]=await req('GET','/arquivos/lista');const lin=r.rows.find(x=>x.caminho===cam);t('o caminho (referência) não muda ao renomear e mover',!!lin&&lin.nome==='logo-novo.png'&&lin.pasta==='Eventos 2026');
 [s]=await req('POST','/arquivos/excluir',{caminho:cam});t('excluir sem confirmação é recusado (400)',s===400);
 [s]=await req('POST','/arquivos/excluir',{caminho:'BIBLIOTECA/nao/existe.png',confirmou:true});t('excluir inexistente: 404',s===404);
 [s]=await req('POST','/data?module=conteudos',{titulo:'Post com mídia',midia:cam});
 [s]=await req('POST','/arquivos/excluir',{caminho:cam,confirmou:true});t('arquivo em uso por um registro não é excluído (409)',s===409);
 const livre=(await envia(A,'livre.png',PNG,'Geral'))[1].arquivos[0].caminho;
 [s]=await req('POST','/arquivos/excluir',{caminho:livre,confirmou:true},E);t('arquivo livre é excluído com confirmação (200)',s===200);
 t('o arquivo é baixado pelo caminho enquanto existe',(await fetch(B+'/file?path='+encodeURIComponent(cam),{headers:A})).status===200);

 // Preferências por usuário
 [s]=await req('POST','/prefs',{chave:'trafego.gm',valor:{colunas:['nome','gasto']}});t('salva preferência',s===200);
 [s,r]=await req('GET','/prefs?chave=trafego.gm');t('lê a própria preferência',s===200&&JSON.stringify(r).includes('gasto'),r);
 [,r]=await req('GET','/prefs?chave=trafego.gm',null,E);t('preferência é por usuário (a Equipe não vê a do Administrador)',!JSON.stringify(r).includes('gasto'),r);
 [s]=await req('POST','/prefs',{chave:'trafego.gm',excluir:true});t('exclui preferência',s===200);

 // Limites de gasto
 [s,r]=await req('GET','/ads/limites');t('limites de gasto legíveis',s===200&&Array.isArray(r.rows),r);
 [s]=await req('POST','/ads/limites',{rows:[{nome:'Aviso diário',escopo:'conta',periodo:'dia',tipo:'valor',valor:20}]});t('salva limite de R$ 20 por dia (200)',s===200);
 [s]=await req('POST','/ads/limites',{rows:[{valor:-3}]});t('limite negativo é recusado (400)',s===400);
 [s,r]=await req('GET','/ads/limites');t('limites persistem',s===200&&r.rows.length===1&&r.rows[0].valor===20,r);

 // Excel
 const x=await fetch(B+'/reports/xlsx',{method:'POST',headers:A,body:JSON.stringify({nome:'teste',abas:[{nome:'Resumo',linhas:[['Campanha','Gasto'],['A',12.5]]}]})});
 const buf=Buffer.from(await x.arrayBuffer());t('exporta Excel válido (zip com PK)',x.status===200&&buf.slice(0,2).toString()==='PK',x.status);

 // CRM removido
 t('rota de matrículas (CRM) não existe mais',(await req('GET','/ads/matriculas'))[0]===404);
 console.log(`\n${ok} ok, ${bad} falhas`);process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
