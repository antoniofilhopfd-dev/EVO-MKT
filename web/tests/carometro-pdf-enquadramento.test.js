// Regressão visual: uma foto quadrada deve preencher o quadro 3×4 do carômetro.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),ts=require('typescript'),sharp=require('sharp'),PDFDocument=require('pdfkit');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/pdf.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports:out,Buffer,process,console,require:n=>n.startsWith('.')?{}:require(n)});
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});
 const img=await sharp({create:{width:150,height:150,channels:3,background:'#e02020'}}).jpeg().toBuffer();
 const doc=new PDFDocument({size:[300,200],margin:0}),chunks=[];
 const done=new Promise((ok,no)=>{doc.on('data',b=>chunks.push(b));doc.on('end',ok);doc.on('error',no);});
 assert.equal(out.imagemNaCaixa(doc,img,30,30,90,120,'#F3F5F9',true),true);
 assert.equal(out.imagemNaCaixa(doc,img,160,30,90,120),true);
 doc.end();await done;const base='test-results/carometro-pdf-enquadramento';fs.writeFileSync(base+'.pdf',Buffer.concat(chunks));
 execFileSync('pdftoppm',['-png','-singlefile','-r','72',base+'.pdf',base]);
 const {data,info}=await sharp(base+'.png').removeAlpha().raw().toBuffer({resolveWithObject:true});
 const pixel=(x,y)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
 const red=c=>c[0]>180&&c[1]<80&&c[2]<80;
 assert.ok(red(pixel(75,35))&&red(pixel(75,145)),'foto preenche topo e base do quadro 3×4');
 assert.ok(!red(pixel(205,35)),'outros relatórios mantêm encaixe sem recorte');
 assert.ok(!red(pixel(75,155)),'recorte não invade o nome abaixo da foto');
 console.log('3 verificações visuais passaram.');
})().catch(e=>{console.error(e);process.exit(1)});
