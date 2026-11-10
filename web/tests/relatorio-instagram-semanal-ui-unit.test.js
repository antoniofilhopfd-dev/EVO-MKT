// Teste funcional isolado com respostas sintéticas. Executar: node web/tests/relatorio-instagram-semanal-ui-unit.test.js
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../public/relatorio-instagram-semanal.js'),'utf8');
const elementos={};
for(const id of ['rel','pdf','msg','periodo','avancar','modo','perfil','perfilWrap','atual','anterior','voltar'])elementos['#'+id]={innerHTML:'',textContent:'',disabled:false,hidden:false,value:id==='modo'?'individual':id==='perfil'?'1':'',querySelector:()=>({disabled:false})};
const dados=[{inicio:'2026-11-08',fim:'2026-11-14',contas:[{usuario:'evolucaopb',alcance:120,visualizacoes:200,interacoes:20,seguidores:500,novos:5,visitasPerfil:12,engajamento:16.7},{usuario:'geracao.evolucao',alcance:80,visualizacoes:100,interacoes:10,seguidores:200,novos:2,visitasPerfil:8,engajamento:12.5}]},{inicio:'2026-11-01',fim:'2026-11-07',contas:[{usuario:'evolucaopb',alcance:100,visualizacoes:180,interacoes:15,seguidores:495,novos:4,visitasPerfil:10,engajamento:15}]}];
const chamadas=[];const fetch=async url=>{chamadas.push(url);return{ok:true,json:async()=>url.includes('/contas')?{contas:[{ig:'1',usuario:'evolucaopb'},{ig:'2',usuario:'geracao.evolucao'}],principal:'1'}:{periodos:dados}}};
let impresso=0;
const contexto={document:{querySelector:s=>elementos[s]},fetch,window:{print:()=>impresso++},location:{search:'?semana=2026-11-08'},URLSearchParams,Intl,Date,Number,String,RegExp,Math,Promise,Set};
vm.runInNewContext(script,contexto,{filename:'relatorio-instagram-semanal.js'});
const drenar=async()=>{for(let i=0;i<25;i++)await Promise.resolve()};
(async()=>{
await drenar();
assert.equal(chamadas.length,3);
assert.ok(chamadas.some(x=>x.includes('/instagram/ranking?de=2026-11-08&ate=2026-11-14')));
assert.match(elementos['#rel'].innerHTML,/Relatório Semanal/);
assert.match(elementos['#rel'].innerHTML,/120/);
assert.match(elementos['#rel'].innerHTML,/Publicações da semana/);
assert.match(elementos['#rel'].innerHTML,/100/);
assert.match(elementos['#rel'].innerHTML,/16,7%/);
assert.equal(elementos['#pdf'].disabled,false);
elementos['#modo'].value='comparativo';elementos['#modo'].onchange();await drenar();
assert.match(elementos['#rel'].innerHTML,/@geracao\.evolucao/);
assert.match(elementos['#rel'].innerHTML,/—/); // histórico parcial do segundo perfil
elementos['#pdf'].onclick();assert.equal(impresso,1);
console.log('PASS: relatório semanal e requisição de publicações com dados sintéticos');
})().catch(e=>{console.error(e);process.exitCode=1});
