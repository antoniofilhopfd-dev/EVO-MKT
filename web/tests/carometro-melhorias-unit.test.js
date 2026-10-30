const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const sharp=require('sharp');
const cache=new Map();
function load(file) {
 const full=path.resolve(__dirname,'../lib',file+'.ts');
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=n=>{
  if(n.endsWith('/db')||n==='./db')return {q:async()=>[],q1:async()=>undefined,run:async()=>0};
  if(n==='./mail'||n==='./records')return {};
  if(n.startsWith('.'))return load(path.relative(path.resolve(__dirname,'../lib'),path.resolve(path.dirname(full),n)));
  return require(n);
 };
 new Function('require','module','exports',code)(req,mod,mod.exports);return mod.exports;
}
const cm=load('carometro'),foto=load('carometroFoto'),lote=load('carometroLote'),backup=load('backup');
test('seis segmentos distintos; Maternais separado de Infantil 1–3',()=>{
 assert.equal(cm.SEGMENTOS_CM.length,6);assert.equal(cm.segmentoCm('Maternal A'),'MATERNAIS');assert.equal(cm.segmentoCm('Infantil 3 B'),'INFANTIL');assert.equal(cm.segmentoCm('Infantil 4 A'),'JARDINS');assert.equal(cm.segmentoCm('1º Ano A'),'JARDINS');assert.equal(cm.segmentoCm('2º Ano A'),'INICIAIS');assert.equal(cm.segmentoCm('9º Ano A'),'FINAIS');assert.equal(cm.segmentoCm('3ª Série A'),'MEDIO');
});
test('turmas fora do padrão não são inferidas',()=>{for(const t of ['0 ano','10 ano','infantil 0','infantil 6','4 série'])assert.equal(cm.segmentoCm(t),'');});
test('matrícula associa, nomes homônimos ficam pendentes',()=>{
 const alunos=[{id:1,matricula:'A1',nome:'Ana Silva',turma:'2º Ano A'},{id:2,matricula:'A2',nome:'Ana Silva',turma:'3º Ano B'}];
 assert.equal(lote.conciliar('A1.jpg',alunos,new Map()).aluno_id,1);assert.equal(lote.conciliar('ana-silva.jpg',alunos,new Map()).estado,'ambigua');
});
test('enquadramento mantém o original e gera proporção 3:4',async()=>{
 const bruto=await sharp({create:{width:800,height:600,channels:3,background:'#789'}}).jpeg().toBuffer();const antes=Buffer.from(bruto);
 for(const giro of [0,90,180,270]){const r=await foto.enquadrarFoto(bruto,{x:0,y:0,w:1,h:1,giro});const meta=await sharp(r.padrao).metadata();assert.equal(meta.width/meta.height,0.75);assert.deepEqual(bruto,antes);}
});
test('enquadramento rejeita coordenadas e giros inválidos',async()=>{for(const d of [{x:-1,y:0,w:1,h:1},{x:0,y:0,w:2,h:1},{x:0,y:0,w:1,h:1,giro:45},{}])await assert.rejects(foto.enquadrarFoto(Buffer.from('x'),d));});
test('foto pequena recebe aviso de resolução',async()=>{const b=await sharp({create:{width:200,height:300,channels:3,background:'#789'}}).jpeg().toBuffer();const r=await foto.prepararFoto(b);assert.match(r.aviso,/Resolução baixa/);});
test('relatório do backup conta alunos, fotos e as três versões',()=>{
 const T={ui_alunos:[{id:1}],cm_fotos:[{ativa:1,caminho_original:'o',caminho_padrao:'p',caminho_mini:'m'}],arquivos:['o','p','m'].map(caminho=>({caminho}))};
 const r=backup.conferirFotosBackup(T,true);assert.equal(r.alunos,1);assert.equal(r.fotos,1);assert.equal(r.fotosAtivas,1);assert.equal(r.arquivosIncluidos,3);assert.deepEqual(r.ausentes,[]);
});
test('backup identifica foto ausente e rascunho incompleto',()=>{
 const T={cm_lotes:[{id:1,estado:'simulado'}],cm_lote_itens:[{lote_id:1,estado:'ok',caminho_original:'o',caminho_padrao:'p',caminho_mini:'m'}],arquivos:[{caminho:'o'}]};assert.deepEqual(backup.conferirFotosBackup(T,true).ausentes,['p','m']);assert.deepEqual(backup.conferirFotosBackup(T,false).ausentes,[]);
});
test('lotes cancelados não exigem staging que já foi descartado',()=>{assert.deepEqual(backup.conferirFotosBackup({cm_lotes:[{id:1,estado:'cancelado'}],cm_lote_itens:[{lote_id:1,caminho_original:'o'}]},true).ausentes,[]);});
const acesso=load('carometroAcesso');
test('política restringe turma por segmento inclusive Maternais separado',()=>{
 acesso.contextoCm.run({segmentos:['INICIAIS']},()=>{assert.equal(acesso.permiteTurma('2º Ano A'),true);assert.equal(acesso.permiteTurma('7º Ano A'),false);assert.throws(()=>acesso.exigirTurma('Maternal A'));});
 acesso.contextoCm.run({segmentos:['MATERNAIS']},()=>{assert.equal(acesso.permiteTurma('Maternal A'),true);assert.equal(acesso.permiteTurma('Infantil 1 A'),false);});
});
test('ações negadas não são liberadas por papel de gerente',async()=>{
 await acesso.contextoCm.run({usuario:{role:'manager'},segmentos:[],consultar:true,importar:true,substituir:false},async()=>{await assert.rejects(acesso.exigirCm({},'substituir'));assert.equal((await acesso.exigirCm({},'importar')).role,'manager');});
});
test('desfoque gera somente aviso; foto continua válida',async()=>{
 const b=await sharp({create:{width:600,height:800,channels:3,background:'#789'}}).jpeg().toBuffer();assert.equal(await foto.possivelDesfoque(b),true);const r=await foto.prepararFoto(b);assert.ok(!r.erro);assert.match(r.aviso,/Possível desfoque/);
});
test('transação compartilha conexão com q/run e reverte falhas',async()=>{
 const calls=[];const conn={query:async(sql)=>{calls.push(sql);return [[{ok:1}]];},beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release')};
 const pool={query:async()=>{throw new Error('Consulta escapou da transação');},getConnection:async()=>conn};
 const mod={exports:{}};const src=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../lib/db.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=n=>n==='mysql2/promise'?{createPool:()=>pool}:n==='./util'?{env:()=> 'teste',envInt:(_,v)=>v}:require(n);
 new Function('require','module','exports',src)(req,mod,mod.exports);const db=mod.exports;
 await db.withTx(async()=>{await db.q('um');await db.withTx(async()=>db.q('dois'));});assert.deepEqual(calls,['begin','um','dois','commit','release']);calls.length=0;
 await assert.rejects(db.withTx(async()=>{await db.q('erro');throw new Error('falha');}));assert.deepEqual(calls,['begin','erro','rollback','release']);
});
