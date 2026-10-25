// Funções puras compartilhadas do Tráfego (semanas dom–sáb, agrupamento, totais, filtros e período anterior). Sem navegador nem banco.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
const root = path.join(__dirname, '..');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'public/trafego-comum.js'), 'utf8') + ';Object.assign(globalThis,{tfSemanaEpi,tfAgrupar,tfTotais,tfFiltrar,tfSerieFiltrada,tfInicioSemana,tfCabeStatus,tfSegRotulo,tfDiaLongo});', ctx);
const exp = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'lib/integrations/trafego.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exp, URL, Intl, Date, Map, Set, require: n => ({ '../util': { env: (k, d) => d, fail() {}, now: () => '' }, '../settings': {}, './metaads': {}, './meta': {} }[n] || {}) });
let ok = 0; const t = (n, c) => { assert(c, n); ok++; };
// semanas começam no domingo e terminam no sábado
t('18/10/2026 é domingo e começa a semana', ctx.tfInicioSemana('2026-10-18') === '2026-10-18' && ctx.tfInicioSemana('2026-10-24') === '2026-10-18' && ctx.tfInicioSemana('2026-10-25') === '2026-10-25');
t('semana epidemiológica de 18 a 24/10/2026 é a 42 (a semana 1 de 2026 começa em 4/1)', ctx.tfSemanaEpi('2026-10-20').semana === 42 && ctx.tfSemanaEpi('2026-10-18').semana === 42 && ctx.tfSemanaEpi('2026-10-24').semana === 42 && ctx.tfSemanaEpi('2026-01-04').semana === 1);
t('semana 1: a primeira com pelo menos 4 dias no ano (3/1/2027 é domingo, semana 1)', ctx.tfSemanaEpi('2027-01-03').semana === 1 && ctx.tfSemanaEpi('2027-01-01').ano === 2026 && ctx.tfSemanaEpi('2027-01-01').semana === 52);
t('rótulo de dia da semana', ctx.tfDiaLongo('2026-10-18') === 'Dom, 18 out' && ctx.tfDiaLongo('2026-10-24') === 'Sáb, 24 out');
// agrupamento mantém o total
const dias = []; for (let i = 0; i < 40; i++) { const d = new Date(Date.UTC(2026, 8, 20 + i, 12)); dias.push(d.toISOString().slice(0, 10)); }
const val = dias.map((_, i) => (i % 7) * 1.25 + 3);
const soma = a => a.reduce((n, x) => n + x.valor, 0), tot = val.reduce((a, b) => a + b, 0);
for (const m of ['dia', 'semana', 'mes']) t('agrupar por ' + m + ' soma o mesmo total', Math.abs(soma(ctx.tfAgrupar(dias, val, m)) - tot) < 1e-9);
t('semanas agrupadas começam no domingo', ctx.tfAgrupar(dias, val, 'semana').every(g => new Date(g.chave + 'T12:00:00Z').getUTCDay() === 0));
// totais: CTR, CPC e custo por conversa dos absolutos; divisão por zero vira null; alcance não é somado
const tt = ctx.tfTotais([{ investimento: 100, impressoes: 1000, cliques: 50, conversas: 10, alcance: 999 }, { investimento: 50, impressoes: 3000, cliques: 10, conversas: 0 }], null);
t('totais pelos absolutos', Math.abs(tt.ctr - 60 / 4000 * 100) < 1e-9 && Math.abs(tt.cpc - 150 / 60) < 1e-9 && Math.abs(tt.custoConversa - 15) < 1e-9 && tt.alcance === null);
const zero = ctx.tfTotais([], null); t('sem linhas: sem divisão por zero', zero.ctr === null && zero.cpc === null && zero.custoConversa === null && zero.investimento === 0);
// status da Meta
t('status filtra pelo valor atual da Meta, nunca por métrica', ctx.tfCabeStatus('ACTIVE', 'ativos') && !ctx.tfCabeStatus('PAUSED', 'ativos') && ctx.tfCabeStatus('CAMPAIGN_PAUSED', 'pausados') && ctx.tfCabeStatus('DISAPPROVED', 'problemas') && ctx.tfCabeStatus('', 'desconhecidos') && !ctx.tfCabeStatus('ACTIVE', 'desconhecidos'));
// filtros combinados e série filtrada
const d = { campanhas: [{ id: 'c1', nome: 'EI', status: 'ACTIVE', segmento: 'INFANTIL' }, { id: 'c2', nome: 'EM', status: 'PAUSED', segmento: 'MEDIO' }], conjuntos: [{ id: 's1', nome: 'S1', campanhaId: 'c1', status: 'ACTIVE', segmento: 'INFANTIL' }, { id: 's2', nome: 'S2', campanhaId: 'c2', status: 'PAUSED', segmento: 'MEDIO' }], anuncios: [{ id: 'a1', nome: 'A1', campanhaId: 'c1', conjuntoId: 's1', status: 'ACTIVE', segmento: 'INFANTIL' }, { id: 'a2', nome: 'A2', campanhaId: 'c2', conjuntoId: 's2', status: 'PAUSED', segmento: 'MEDIO' }] };
let r = ctx.tfFiltrar(d, { status: 'ativos' }); t('status ativos', r.campanhas.length === 1 && r.conjuntos.length === 1 && r.anuncios.length === 1 && r.filtrado);
r = ctx.tfFiltrar(d, { segmento: 'MEDIO' }); t('segmento', r.campanhas[0].id === 'c2' && r.anuncios[0].id === 'a2');
r = ctx.tfFiltrar(d, { campanha: 'c1' }); t('campanha leva conjuntos e anúncios dela', r.conjuntos.length === 1 && r.anuncios[0].id === 'a1');
r = ctx.tfFiltrar(d, { campanha: 'c2', conjunto: 's1' }); t('conjunto de outra campanha não aparece', r.anuncios.length === 0);
r = ctx.tfFiltrar(d, {}); t('sem filtro: tudo e filtrado=false', r.campanhas.length === 2 && !r.filtrado);
const dia = { dias: ['2026-10-18', '2026-10-19'], series: [{ nome: 'EI', valores: [1, 2] }, { nome: 'EM', valores: [10, 20] }], total: [11, 22] };
const sf = ctx.tfSerieFiltrada(dia, [d.campanhas[0]]); t('série diária restrita às campanhas filtradas', sf.series.length === 1 && sf.total[0] === 1 && sf.total[1] === 2);
// período anterior (servidor): semana, mês anterior e ano
const pa = exp.periodoAnterior;
t('semana → mesma janela 7 dias antes', JSON.stringify(pa('2026-10-18', '2026-10-24', 'semana')) === JSON.stringify({ de: '2026-10-11', ate: '2026-10-17' }));
t('semana parcial (domingo a hoje) compara com os mesmos dias da anterior', JSON.stringify(pa('2026-10-18', '2026-10-21', 'semana')) === JSON.stringify({ de: '2026-10-11', ate: '2026-10-14' }));
t('mês anterior → o mês antes dele, inteiro', JSON.stringify(pa('2026-09-01', '2026-09-30', 'mes_ant')) === JSON.stringify({ de: '2026-08-01', ate: '2026-08-31' }) && JSON.stringify(pa('2026-03-01', '2026-03-31', 'mes_ant')) === JSON.stringify({ de: '2026-02-01', ate: '2026-02-28' }));
t('este mês → mesmos dias do mês anterior', JSON.stringify(pa('2026-10-01', '2026-10-25', 'mes')) === JSON.stringify({ de: '2026-09-01', ate: '2026-09-25' }));
t('este ano → mesmo intervalo do ano anterior', JSON.stringify(pa('2026-01-01', '2026-10-25', 'ano')) === JSON.stringify({ de: '2025-01-01', ate: '2025-10-25' }));
t('período personalizado → mesma duração logo antes', JSON.stringify(pa('2026-10-10', '2026-10-19', 'x')) === JSON.stringify({ de: '2026-09-30', ate: '2026-10-09' }));
console.log(`OK: ${ok} verificações das funções puras do Tráfego.`);
