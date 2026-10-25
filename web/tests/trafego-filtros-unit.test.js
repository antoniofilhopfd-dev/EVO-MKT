// Contratos isolados de filtros e gráfico restaurado; não usa contas reais nem MySQL.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
const root = path.join(__dirname, '..');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const exports_ = {};
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/integrations/trafego.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const calls = [];
const cp = [{ campaign_id: '1', campaign_name: 'Campanha A', spend: '100', impressions: '1000', clicks: '100', actions: [{ action_type: 'messaging_conversation_started_7d', value: '10' }] }, { campaign_id: '2', campaign_name: 'Campanha B', spend: '40', impressions: '500', clicks: '10', actions: [] }];
vm.runInNewContext(code, { exports: exports_, URL, Intl, Date, Map, Set, require: name => ({
  '../util': { env: (k, d) => d, fail, now: () => '2026-10-25T12:00:00-03:00' },
  '../settings': { setting: async k => k === 'meta_ads_conta' ? '12345678' : '' },
  './metaads': { adsPermitido: async () => true },
  './meta': { metaConnected: async () => true, metaGet: async (url, p) => { calls.push({ url, p }); if (url.endsWith('/campaigns')) return { data: [{ id: '1', effective_status: 'ACTIVE' }, { id: '2', effective_status: 'PAUSED' }] }; if (url.endsWith('/ads')) return { data: [{ id: 'a1', effective_status: 'ACTIVE', creative: { image_url: 'https://scontent.fbcdn.net/criativo.jpg' } }, { id: 'a2', effective_status: 'CAMPAIGN_PAUSED' }] }; if (p.level === 'account') return { data: [{ reach: '900' }] }; return { data: cp.map((x, i) => ({ ...x, ad_id: 'a' + (i + 1), ad_name: 'Anúncio ' + i, ...(p.time_increment ? { date_start: '2026-10-24' } : {}) })) }; } },
}[name] || {}) });
(async () => {
  const d = await exports_.resumoTrafego('2026-10-24', '2026-10-24');
  assert.equal(d.campanhas[0].status, 'ACTIVE'); assert.equal(d.campanhas[1].status, 'PAUSED');
  assert.equal(d.diario.total[0], 140);
  assert.equal(d.anuncios[0].miniatura, 'https://scontent.fbcdn.net/criativo.jpg');
  assert.equal(d.anuncios[0].imagem, 'https://scontent.fbcdn.net/criativo.jpg');
  const active = exports_.filtrarTabelaTrafego(d, 'ativos', 'campanhas');
  assert.equal(active.campanhas.length, 1); assert.equal(active.tabela.total.investimento, 100); assert.equal(active.tabela.total.ctr, 10); assert.equal(active.tabela.total.custoConversa, 10); assert.equal(active.tabela.total.alcance, null);
  const paused = exports_.filtrarTabelaTrafego(d, 'pausados', 'anuncios');
  assert.equal(paused.anuncios.length, 1); assert.equal(paused.anuncios[0].status, 'CAMPAIGN_PAUSED'); assert.equal(paused.tabela.total.investimento, 40);
  assert.equal(exports_.filtrarTabelaTrafego(d, 'todos').tabela.total.alcance, 900);
  assert.equal(d.campanhas.length, 2); assert.equal(d.atual.investimento, 140); // Cache original intacto.
  for (const status of ['toString', 'invalido']) assert.throws(() => exports_.filtrarTabelaTrafego(d, status), e => e.status === 400);
  assert.throws(() => exports_.filtrarTabelaTrafego(d, 'ativos', 'outro'), e => e.status === 400);
  const unknown = { ...d, anuncios: [{ status: '', investimento: 4 }, { status: 'DISAPPROVED', investimento: 8 }] };
  assert.equal(exports_.filtrarTabelaTrafego(unknown, 'desconhecidos', 'anuncios').anuncios.length, 1);
  assert.equal(exports_.filtrarTabelaTrafego(unknown, 'problemas', 'anuncios').anuncios.length, 1);
  exports_.validarPeriodo('2026-01-01', '2026-10-25');
  assert.throws(() => exports_.validarPeriodo('2025-01-01', '2026-10-25'), e => e.status === 400);
  assert(calls.every(x => !('method' in x.p))); // Somente consultas.
  const chartContext = {}; vm.createContext(chartContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/charts.js'), 'utf8') + ';globalThis.charts=EvoCharts;', chartContext);
  const node = { addEventListener() {} };
  for (const dados of [[], [{ x: '2026-10-24', c: 0, total: 0 }], [{ x: '2026-10-23', c: 12, total: 12 }, { x: '2026-10-24', c: 20, total: 20 }]]) {
    const el = { classList: { add() {} }, querySelector: () => node, innerHTML: '' };
    chartContext.charts.linha(el, { dados, series: [{ k: 'c', nome: 'Campanha', marcadores: true }, { k: 'total', nome: 'Total', tracejado: true, marcadores: true }], sombreado: false });
    assert(!/NaN|Infinity/.test(el.innerHTML));
    if (dados.length) { assert(el.innerHTML.includes('stroke-dasharray="6 4"')); assert(el.innerHTML.includes('<circle')); assert(!el.innerHTML.includes('opacity=".08"')); }
  }
  console.log('OK: status real por nível, totais e alcance, cache, consulta anual e evolução diária.');
})().catch(e => { console.error(e); process.exitCode = 1; });
