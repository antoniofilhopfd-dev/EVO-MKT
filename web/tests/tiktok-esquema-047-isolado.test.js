// Testes seguros de esquema da migração 047 — sem abrir MySQL ou rede.
// Executar em web/: node tests/tiktok-esquema-047-isolado.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../lib/migrate.ts'), 'utf8');
const start = source.indexOf('async function validarEsquemaLembretesTikTok(');
const end = source.indexOf('let ready: Promise<number> | null', start);
assert(start >= 0 && end > start, 'validador da migração 047 ausente');
const js = ts.transpileModule('export ' + source.slice(start, end), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal((js.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const exposed = {};
vm.runInNewContext(js.outputText, { exports: exposed }, { filename: 'migrate047.compiled.js' });
const validar = exposed.validarEsquemaLembretesTikTok;
assert.equal(typeof validar, 'function');
const fields = ['chave','conteudo_id','tipo','destino','agendado_em','gerado_em'].map(Field => ({Field}));
const pk = [{Key_name:'PRIMARY',Column_name:'chave',Non_unique:0}];
const conn = (cols, indexes) => ({query: async sql => sql.startsWith('SHOW COLUMNS') ? [cols] : [indexes]});
(async () => {
  let n = 0;
  await validar(conn(fields,pk)); n++;
  await assert.rejects(validar(conn(fields.filter(x => x.Field !== 'tipo'),pk)),/colunas ausentes/);n++;
  await assert.rejects(validar(conn(fields,[])),/chave primária/);n++;
  await assert.rejects(validar(conn(fields,[{Key_name:'PRIMARY',Column_name:'conteudo_id',Non_unique:0}])),/chave primária/);n++;
  await assert.rejects(validar(conn(fields,[...pk,...pk])),/chave primária/);n++;
  // Restaurar snapshot pré-047 exige descarte transacional de deduplicações posteriores.
  const backup = fs.readFileSync(path.join(__dirname, '../lib/backup.ts'),'utf8');
  assert(backup.includes("if (!Array.isArray(T.tiktok_reminder_events))"), 'restauração legada não tratada');
  assert(backup.includes("await c.query('DELETE FROM tiktok_reminder_events')"), 'livro-razão anterior não é reiniciado');n++;
  console.log('OK:',n,'verificações isoladas de esquema/restauração 047 sem MySQL');
})().catch(e => {console.error(e); process.exitCode = 1});
