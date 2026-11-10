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

// Regressões identificadas na homologação da branch.
assert.doesNotThrow(()=>new (require('node:vm').Script)(js), 'JavaScript deve ter sintaxe válida');
assert.match(js,/n\(per\?\.\[k\],k\)/, 'Taxa de engajamento atual mantém casas decimais');
assert.match(js,/n\(ant\?\.\[k\],k\)/, 'Taxa de engajamento anterior mantém casas decimais');
assert.match(js,/iso\(parse\(requested\)\)===requested/, 'Datas inexistentes devem ser recusadas');
assert.match(js,/const parcial=fim>=hoje\(\)/, 'Semana atual permanece parcial até terminar');
assert.match(js,/if\(meu!==pedido\)return/, 'Respostas antigas não sobrescrevem seleção recente');
assert.match(js,/prev\.slice\(0,4\)/, 'Comparação entre anos consulta ano anterior');
assert.match(js,/semana<start\(hoje\(\)\)/, 'Navegação não avança para semanas futuras');
assert.match(js,/America\/Fortaleza/, 'Data local usa fuso da operação');
console.log('Contrato estático do relatório semanal: OK (não substitui testes de integração).');

// Regressão: perfil Instagram não é filtro editorial PERFIS do lerFiltros.
const api=fs.readFileSync(path.resolve(__dirname,'../lib/api/operacao.ts'),'utf8');
assert.match(api,/const qs = \(k: string\) => params\[k\] \?\? \(k === 'perfil' \? '' : c\.qs\(k\)\)/);
