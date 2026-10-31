const assert=require('node:assert/strict'),fs=require('node:fs'),sharp=require('sharp'),U=require('./lib/ui');
(async()=>{
 const G=await U.entrar(process.argv[2]);await G.post('/imagem/alunos/importar',{linhas:[{matricula:'SEL1',nome:'Aluno A',turma:'7º Ano A'},{matricula:'SEL2',nome:'Aluno B',turma:'7º Ano B'},{matricula:'SEL3',nome:'Aluno C',turma:'8º Ano A'}]});
 const b=await U.abrir();let checks=0;const ok=(nome,v)=>{assert.ok(v,nome);checks++;console.log('OK',nome);};
 try{
 const ctx=await b.newContext({bypassCSP:true,viewport:{width:1440,height:900}});await ctx.addCookies(G.H.Cookie.split('; ').map(x=>{const i=x.indexOf('=');return {name:x.slice(0,i),value:x.slice(i+1),url:U.BASE};}));
 const p=await ctx.newPage();let posts=0;const errors=[];p.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});p.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/carometro/lote'))posts++;});
 await p.route('**/selection-test',r=>r.fulfill({contentType:'text/html',body:'<div id="content"></div><div id="toast"></div>'}));await p.goto(U.BASE+'/selection-test');
 for(const css of ['style.css','design.css','areas.css'])await p.addStyleTag({content:fs.readFileSync('public/'+css,'utf8')});
 await p.addScriptTag({content:fs.readFileSync('public/core.js','utf8')});await p.addScriptTag({content:fs.readFileSync('public/carometro.js','utf8')});await p.evaluate(()=>PAGINAS.cmimport());
 const img=await sharp({create:{width:150,height:150,channels:3,background:'#678'}}).jpeg().toBuffer();
 const pick=async name=>p.setInputFiles('#cmFotos',[{name,mimeType:'image/jpeg',buffer:img}]);
 await pick('SEL1.jpg');await pick('SEL2.jpg');await pick('SEL3.jpg');
 ok('três seleções acumulam três arquivos',(await p.innerText('#cmArquivosResumo')).includes('3 grupo(s) selecionado(s) · 3 arquivo(s)'));
 ok('selecionar não cria lote nem envia fotos',posts===0&&(await G.get('/carometro/lotes')).rows.length===0);
 ok('não abre conferência durante seleção',(await p.innerText('#cmLote'))==='');
 await p.click('[data-rem-grupo="1"]');ok('remove só o grupo escolhido',await p.evaluate(()=>CM_IMP.grupos.flatMap(g=>g.arquivos.map(f=>f.name)).join(',')==='SEL1.jpg,SEL3.jpg'));
 await pick('SEL2.jpg');await p.evaluate(()=>PAGINAS.cmimport());ok('trocar de tela mantém arquivos em memória',(await p.innerText('#cmArquivosResumo')).includes('3 arquivo(s)'));
 await p.screenshot({path:'test-results/carometro-selecao-acumulada.png',fullPage:true});
 let falhar=true;await p.route('**/api/carometro/lote/fotos',async r=>{if(falhar){falhar=false;return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Falha de teste"}'});}return r.continue();});
 await p.click('#cmSimular');await p.waitForFunction(()=>!document.querySelector('#cmSimular').disabled);
 ok('falha mantém apenas arquivo não enviado',await p.evaluate(()=>CM_IMP.grupos.flatMap(g=>g.arquivos).length===1));
 const lote=await G.get('/carometro/lotes');ok('um único rascunho para várias turmas',lote.rows.length===1);
 await p.click('#cmSimular');await p.waitForFunction(()=>document.querySelector('#cmArquivosResumo').innerText.includes('0 arquivo(s)'));
 const d=await G.get('/carometro/lote?id='+lote.rows[0].id);ok('recuperação reutiliza lote sem duplicar e identifica três turmas',d.itens.length===3&&d.resumo.turmas===3&&d.resumo.prontos===3);
 ok('seleção concluída fica vazia e conferência aparece',await p.isDisabled('#cmSimular')&&!!await p.$('#cmAplicar'));
 ok('sem erros de script',errors.length===0);
 }finally{await b.close();}console.log(checks+' verificações passaram.');
})().catch(e=>{console.error(e);process.exit(1)});
