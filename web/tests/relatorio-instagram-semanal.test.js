// Testes estáticos de contrato da página semanal. Execute: node web/tests/relatorio-instagram-semanal.test.js
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../public'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('relatorio-instagram-semanal.html'),js=read('relatorio-instagram-semanal.js'),visao=read('igvisao.js'),mensal=read('relatorio-instagram.js');
assert.match(html,/id="atual"/);assert.match(html,/id="anterior"/);assert.match(html,/id="voltar"/);assert.match(html,/id="avancar"/);
assert.match(html,/id="perfil"/);assert.match(html,/value="comparativo"/);assert.match(html,/id="pdf"/);
assert.match(js,/ranking-contas\?visao=semana/);assert.match(js,/start\(hoje\(\)\)/);
assert.match(js,/window\.print\(\)/);assert.match(js,/if\(!r\.ok\)throw Error/);
assert.match(js,/Alcance não é somado entre perfis/);
assert.match(visao,/relatorio-instagram-semanal\.html/);
assert.match(visao,/relatorio-instagram\.html/);
assert.match(mensal,/\/api\/instagram\/relatorio\.pdf/);
console.log('Contrato estático do relatório semanal: OK (não substitui testes de integração).');
