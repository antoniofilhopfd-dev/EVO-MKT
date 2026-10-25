// Contratos isolados: não substituem as suítes HTTP/MySQL e de interface.
// node tests/consolidacao-unit.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.join(__dirname, '..');
function load(file, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => dependencies[name] || {}, URL, console });
  return exports;
}
(async () => {
  const sql = []; let total = 65, authorized = true;
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const route = load('lib/api/conteudo.ts', {
    '../auth': { requireInternal: async () => authorized ? {} : fail(401, 'Sem sessão') },
    '../db': { q1: async (query, args) => { sql.push({ query, args }); return { n: total }; }, q: async (query, args) => { sql.push({ query, args }); return [{ data: JSON.stringify({ id: 'CON-0001', status: 'RASCUNHO' }) }]; } },
    '../util': { fail, strv: v => String(v || '') },
    '../conteudo': { statusAtual: v => v, pendencias: () => [] },
    '../segmentos': { rotuloSegmento: () => 'Educação Infantil' },
    '../filtros': { lerFiltros: c => Object.fromEntries(['perfil', 'segmento', 'formato', 'campanha'].map(k => [k, c.qs(k)])) },
    './handlers': { json: x => x },
  }).conteudoRoute;
  const call = params => { const url = new URL('https://test/content/list?' + params); return route({ path: '/content/list', method: 'GET', url, qs: k => url.searchParams.get(k) || '' }); };
  let d = await call(''); assert.equal(d.total, 65); assert.equal(d.paginas, 3); assert.equal(d.rows.length, 1); assert.match(sql.at(-1).query, /LIMIT 30 OFFSET 0$/);
  d = await call('pagina=2'); assert.equal(d.pagina, 2); assert.match(sql.at(-1).query, /LIMIT 30 OFFSET 30$/);
  d = await call('pagina=999'); assert.equal(d.pagina, 3); assert.match(sql.at(-1).query, /OFFSET 60$/);
  total = 0; d = await call('pagina=2'); assert.equal(d.pagina, 1); assert.equal(d.paginas, 1);
  for (const query of ['pagina=0', 'pagina=-1', 'pagina=1.5', 'pagina=1%20OR%201=1', 'tamanho=101', 'tamanho=0', 'ids=invalid%27']) await assert.rejects(call(query), e => e.status === 400);
  total = 65;
  await call('busca=%25_%27&status=RASCUNHO&responsavel=Ana&perfil=%40evolucaopb&segmento=INFANTIL&formato=Reels&campanha=CAM-1');
  assert(sql.at(-1).args.includes("%_'")); assert(!sql.at(-1).query.includes("%_'"));
  assert(sql.at(-1).args.includes('Ana')); assert(sql.at(-1).args.includes('@evolucaopb')); assert(sql.at(-1).args.includes('Educação Infantil'));
  await call('ids=CON-1,CON-2'); assert(sql.at(-1).query.includes('r.id IN (?,?)'));
  await call('ids='); assert(sql.at(-1).query.includes('1=0'));
  authorized = false; await assert.rejects(call(''), e => e.status === 401);
  // Avisos realmente usam a coleta recebida e escapam mensagens externas.
  const source = fs.readFileSync(path.join(root, 'public/filtros.js'), 'utf8');
  const ctx = { Date, Number, esc: v => String(v).replace(/</g, '&lt;'), fmtDateTime: v => v };
  vm.createContext(ctx); vm.runInContext(source.slice(source.indexOf('function avisoAtualizacao')), ctx);
  assert.match(ctx.avisoAtualizacao(null), /Sem sincronização confirmada/);
  assert.match(ctx.avisoAtualizacao({ atualizadoEm: 'inválida' }), /Sem sincronização confirmada/);
  assert.match(ctx.avisoAtualizacao({ atualizadoEm: '2020-01-01T00:00:00-03:00' }), /atualização pendente/);
  assert(!ctx.avisoAtualizacao({ atualizadoEm: new Date().toISOString() }).includes('atualização pendente'));
  assert.match(ctx.avisoAtualizacao({ aviso: '<script>' }), /&lt;script>/);
  // Executa o próprio orquestrador igSync, isolando apenas as contas e chamadas externas.
  const meta = fs.readFileSync(path.join(root, 'lib/integrations/meta.ts'), 'utf8');
  const syncSource = meta.slice(meta.indexOf('export async function igSync('), meta.indexOf('async function igSyncConta('));
  const syncCode = ts.transpileModule(syncSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let bad = new Set(), contas = [{ ig: '1', usuario: 'um' }, { ig: '2', usuario: 'dois' }];
  const settings = new Map([['ig_last_sync', 'coleta-antiga']]);
  const syncContext = { exports: {}, Error, metaConnected: async () => true, setting: async k => settings.get(k) || '', setSetting: async (k, v) => settings.set(k, v), run: async () => {}, contasMonitoradas: async () => contas, igSyncConta: async id => { if (bad.has(id)) throw new Error('falha de teste'); return 1; }, intLog: async () => {}, now: () => 'coleta-nova' };
  vm.runInNewContext(syncCode, syncContext);
  assert.equal(await syncContext.exports.igSync(), 2); assert.equal(settings.get('ig_last_sync'), 'coleta-nova'); assert.equal(settings.get('ig_sync_warning'), '');
  settings.set('ig_last_sync', 'coleta-antiga'); bad.add('2');
  assert.equal(await syncContext.exports.igSync(), 1); assert.equal(settings.get('ig_last_sync'), 'coleta-antiga'); assert.match(settings.get('ig_sync_warning'), /incompleta/);
  bad.add('1'); await assert.rejects(syncContext.exports.igSync()); assert.equal(settings.get('ig_last_sync'), 'coleta-antiga');
  settings.set('meta_token_invalido', '1'); await assert.rejects(syncContext.exports.igSync()); assert.match(settings.get('ig_sync_warning'), /expirado/);
  settings.delete('meta_token_invalido'); contas = []; await syncContext.exports.igSync(); assert.match(settings.get('ig_sync_warning'), /Nenhum perfil/); assert.equal(settings.get('ig_last_sync'), 'coleta-antiga');
  console.log('OK: paginação, limites, filtros parametrizados, foco, autenticação, avisos e sincronização completa/parcial/com falha.');
})().catch(e => { console.error(e); process.exitCode = 1; });
