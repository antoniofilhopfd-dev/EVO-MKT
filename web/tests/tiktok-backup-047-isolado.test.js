// Testa a etapa crítica do coletor de backup 047 usando o laço REAL de backup.ts.
// Execução: node tests/tiktok-backup-047-isolado.test.js
// Não abre rede, não lê credenciais, não acessa MySQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/backup.ts'), 'utf8');
const collect = source.indexOf('async function collect(');
assert(collect >= 0, 'coletor não encontrado');
const start = source.indexOf('  for (const [t, spec] of Object.entries(TABLES)) {', collect);
const end = source.indexOf('  let anexosIncompletos = false;', start);
assert(start >= 0 && end > start, 'laço do coletor não encontrado');
const loop = source.slice(start, end);
assert(loop.includes("t === 'audit_log'"), 'a proteção não pode substituir a coleta das demais tabelas');
const translated = ts.transpileModule(
  'export async function readTables(TABLES: Record<string, {cols:string[]}>,q:any,q1:any) { const tabelas: Record<string, unknown[]> = {};\n' + loop + '\nreturn tabelas; }',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true }
);
assert.equal(translated.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const exposed = {};
vm.runInNewContext(translated.outputText, { exports: exposed });
const { readTables } = exposed;
const TABLES = { records: {cols:['id']}, tiktok_reminder_events: {cols:['chave']} };
const missing = () => Object.assign(new Error('Table does not exist'), { errno: 1146 });
const q = async sql => {
  if (sql.includes('tiktok_reminder_events')) throw missing();
  return [{ id: 'CON-0001' }];
};
(async () => {
  let checks = 0;
  const pass = (condition, label) => { assert(condition, label); checks++; };
  let tbl = await readTables(TABLES, q, async () => undefined);
  pass(tbl.records.length === 1 && !Object.hasOwn(tbl,'tiktok_reminder_events'), 'migração pendente: não fabrica linha/tabela');
  await assert.rejects(readTables(TABLES, q, async () => ({name:'047_tiktok_lembretes.sql'})), /does not exist/);
  checks++;
  await assert.rejects(readTables(TABLES, q, async () => { throw new Error('schema_migrations inacessível'); }), /schema_migrations inacessível/);
  checks++;
  tbl = await readTables(TABLES, async sql => sql.includes('tiktok_reminder_events') ? [{chave:'a'}] : [{id:'CON-0001'}], async () => undefined);
  pass(tbl.tiktok_reminder_events[0].chave === 'a', 'migração aplicada: preserva lembretes');
  await assert.rejects(readTables(TABLES, async sql => {
    if (sql.includes('tiktok_reminder_events')) throw Object.assign(new Error('permissão negada'), {errno:1142});
    return [{id:'CON-0001'}];
  }, async () => undefined), /permissão negada/);
  checks++;
  await assert.rejects(readTables(TABLES, async sql => {
    if (sql.includes('FROM records')) throw missing();
    return [];
  }, async () => undefined), /does not exist/);
  checks++;
  pass(source.includes("t === 'tiktok_reminder_events' ? 'Migração 047"), 'aviso explícito ao validar backup sem tabela');
  console.log('OK: ' + checks + ' verificações isoladas do coletor 047; nenhum banco acessado.');
})().catch(e => { console.error(e); process.exitCode = 1; });
