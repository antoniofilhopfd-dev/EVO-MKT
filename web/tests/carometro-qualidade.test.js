const fs=require('node:fs'),assert=require('node:assert/strict'),sharp=require('sharp'),U=require('./lib/ui');
(async()=>{const G=await U.entrar(process.argv[2]);let checks=0;const ok=(n,v)=>{assert.ok(v,n);console.log('OK',n);checks++;};
 await G.post('/imagem/alunos/importar',{linhas:[{matricula:'QUAL1',nome:'Aluno Qualidade',turma:'7º Ano A'}]});const a=(await G.get('/carometro/alunos?busca=QUAL1')).rows[0];
 const upload=async cor=>{const fd=new FormData();fd.append('aluno_id',a.id);fd.append('arquivo',new Blob([await sharp({create:{width:150,height:150,channels:3,background:cor}}).jpeg().toBuffer()]),'QUAL1.jpg');const r=await fetch(U.B+'/carometro/foto',{method:'POST',headers:{Cookie:G.H.Cookie,'X-EVO':'1'},body:fd});assert.equal(r.status,200);};
 const pend=async estado=>(await G.get('/carometro/pendencias?estado='+estado)).rows.filter(p=>p.alunoId===a.id&&p.tipo==='imagem_baixa');
 await upload('#789');const inicial=await pend('abertas');ok('foto pequena produz aviso conferível',inicial.length===1);
 const k=inicial[0].chave;ok('aviso identifica a versão da foto',/^imagem_baixa:i\d+$/.test(k));
 const aceite=await G.post('/carometro/pendencias/ignorar',{chaves:[k],motivo:'Foto escolhida e qualidade aceita para uso no carômetro.'});ok('aceite registrado',aceite.ignoradas===1);
 ok('foto aceita sai das pendências abertas',(await pend('abertas')).length===0);
 ok('decisão continua consultável',(await pend('ignoradas')).some(p=>p.chave===k&&p.ignorada));
 await upload('#abc');const nova=await pend('abertas');ok('substituição não herda aceite da foto anterior',nova.length===1&&nova[0].chave!==k);
 const d=await G.get('/carometro/alunos?busca=QUAL1');ok('foto escolhida permanece cadastrada',!!d.rows[0].fotoId);
 const b=await U.abrir();try{
  const ctx=await b.newContext({bypassCSP:true,viewport:{width:1440,height:900}});await ctx.addCookies(G.H.Cookie.split('; ').map(x=>{const i=x.indexOf('=');return {name:x.slice(0,i),value:x.slice(i+1),url:U.BASE};}));const p=await ctx.newPage();
  await p.route('**/quality-test',r=>r.fulfill({contentType:'text/html',body:'<div id="content"></div><div id="toast"></div>'}));await p.goto(U.BASE+'/quality-test');
  for(const css of ['style.css','design.css','areas.css'])await p.addStyleTag({content:fs.readFileSync('public/'+css,'utf8')});
  for(const js of ['core.js','carometro.js'])await p.addScriptTag({content:fs.readFileSync('public/'+js,'utf8')});
  await p.evaluate(()=>{CM_PEND.tipo='imagem_baixa';return PAGINAS.cmpendencias();});
  ok('ação explícita de aceitar foto aparece',await p.locator('[data-aceitar-foto]').count()===1);await p.screenshot({path:'test-results/carometro-qualidade-aceitar.png',fullPage:true});
  await p.click('[data-aceitar-foto]');await p.click('#dlgOk');await p.waitForFunction(()=>!document.querySelector('[data-aceitar-foto]'));
  ok('aceitar pela interface resolve aviso',(await pend('abertas')).length===0);
  await G.post('/carometro/pendencias/reabrir',{chaves:[nova[0].chave]});await p.evaluate(()=>PAGINAS.cmpendencias());await p.check('#pdTodos');
  ok('seleção de qualidade oferece aceite em lote',(await p.innerText('#pdLote')).includes('Usar fotos selecionadas'));
  await p.click('#pdLote');await p.click('#dlgOk');await p.waitForFunction(()=>!document.querySelector('[data-aceitar-foto]'));ok('aceite em lote resolve aviso',(await pend('abertas')).length===0);
 }finally{await b.close();}
 console.log(checks+' verificações passaram.');
})().catch(e=>{console.error(e);process.exit(1)});
