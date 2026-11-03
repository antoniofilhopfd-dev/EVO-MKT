// Verificação unitária isolada das correções TikTok da Etapa 03/04.
// Node.js + TypeScript devDependency. Não conecta ao MySQL ou à API.
// Execute em web/: node tests/tiktok-agendamento-isolado.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function transpile(file, mocks) {
  const code = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const result = {};
  vm.runInNewContext(js.outputText, {
    exports: result, require: name => {
      if (!(name in mocks)) throw new Error('Importação externa inesperada: ' + name);
      return mocks[name];
    }, Buffer, Date, process, console,
  }, { filename: file });
  return result;
}
const util = transpile('../lib/util.ts', {'node:async_hooks': require('node:async_hooks')});
const conteudo = transpile('../lib/conteudo.ts', {
  './util': util,
  './segmentos': {chaveSegmento: s => s},
});
let total = 0;
function test(name, fn) { fn(); total++; console.log('OK', name); }
const sample = {
  id:'CON-0001', canal:'TikTok', status:'APROVADO', titulo:'Vídeo', legenda:'Texto',
  perfil:'@evolucao', formato:'Vídeo', responsavel:'Marketing', publicacaoEm:'2026-11-04T18:00',
  midiaInstagram:'video.mp4', aprovadoPor:'Gerente', versaoAprovada:'1',
};
test('TikTok horário válido Fortaleza', () => assert.equal(conteudo.horarioTikTokValido('2026-11-04T18:00'), true));
test('ano bissexto válido', () => assert.equal(conteudo.horarioTikTokValido('2028-02-29T18:00'), true));
test('dia inexistente', () => assert.equal(conteudo.horarioTikTokValido('2026-02-30T18:00'), false));
test('mês inexistente', () => assert.equal(conteudo.horarioTikTokValido('2026-13-04T18:00'), false));
test('hora e minuto fora dos limites', () => {
  assert.equal(conteudo.horarioTikTokValido('2026-11-04T24:00'), false);
  assert.equal(conteudo.horarioTikTokValido('2026-11-04T18:60'), false);
});
test('sufixos malformados ou horário parcial', () => {
  assert.equal(conteudo.horarioTikTokValido('2026-11-04T18:00zzz'), false);
  assert.equal(conteudo.horarioTikTokValido('2026-11-04T18'), false);
});
test('TikTok sem responsável impede agendar', () => {
  assert(conteudo.requisitosDeAgendamento({ ...sample, responsavel:'' }).includes('responsável'));
});
test('TikTok com horário inválido impede agendar', () => {
  assert(conteudo.requisitosDeAgendamento({...sample, publicacaoEm:'2026-02-30T18:00'}).includes('data e horário de publicação'));
});
test('Instagram preserva regra de requisitos anteriores', () => {
  const insta = {...sample, canal:'Instagram', responsavel:'', publicacaoEm:'2026-11-04T18:00'};
  assert(!conteudo.requisitosDeAgendamento(insta).includes('responsável'));
});
test('mudança de horário TikTok invalida aprovação e metadados', () => {
  const novo = {...sample, publicacaoEm:'2026-11-05T18:00'};
  assert.equal(conteudo.invalidarAprovacaoTikTok(sample, novo), true);
  assert.equal(novo.status,'EM REVISÃO');
  assert.equal(Object.hasOwn(novo,'aprovadoPor'), false);
});
test('mudança de horário Instagram não invalida aprovação', () => {
  const antigo = {...sample, canal:'Instagram'};
  const novo = {...antigo,publicacaoEm:'2026-11-05T18:00'};
  assert.equal(conteudo.invalidarAprovacaoTikTok(antigo,novo),false);
  assert.equal(novo.status,'APROVADO');
});
test('repassar TikTok aprovado para outro responsável invalida aprovação', () => {
  const novo = { ...sample, responsavel:'Outra pessoa' };
  assert.equal(conteudo.invalidarAprovacaoTikTok(sample, novo), true);
  assert.equal(novo.status, 'EM REVISÃO');
});
test('horário TikTok é interpretado em Fortaleza independentemente de TIMEZONE', () => {
  const antigo = process.env.TIMEZONE;
  process.env.TIMEZONE = 'UTC';
  try {
    assert.equal(conteudo.horarioTikTokData('2026-11-04T18:00').toISOString(), '2026-11-04T21:00:00.000Z');
  } finally {
    if (antigo === undefined) delete process.env.TIMEZONE;
    else process.env.TIMEZONE = antigo;
  }
});
test('TikTok sem mudanças não invalida aprovação', () => {
  assert.equal(conteudo.invalidarAprovacaoTikTok(sample,{...sample}),false);
});
const api = fs.readFileSync(path.resolve(__dirname,'../lib/api/conteudo.ts'),'utf8');
test('rota revalida desagendamento sob lock', () => {
  const block = api.split("if (b.desagendar) {")[1].split("if (statusAtual(cur.status) !== 'APROVADO')")[0];
  assert(block.includes("if (statusAtual(r.status) !== 'AGENDADO')"));
  assert(block.indexOf("if (statusAtual(r.status) !== 'AGENDADO')") > block.indexOf("modifyRow('conteudos'"));
});
test('rota revalida requisitos TikTok na transação', () => {
  const block = api.split("if (path === '/content/schedule'")[1].split("if (path === '/content/publicar-rapido'")[0];
  assert(block.includes("const faltando = requisitosDeAgendamento(atualizado)"));
  assert(block.includes("horarioTikTokValido(quando)"));
});
console.log('PASSOU:', total, 'verificações unitárias/estáticas; nenhuma conexão externa.');
