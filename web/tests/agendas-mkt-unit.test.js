// A agenda do Marketing é reconhecida por "Marketing" ou "MKT" no nome (ex.: "AGENDA MKT"); outras agendas não.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
const root = path.join(__dirname, '..');
const out = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'lib/integrations/agendas.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: out, URL, Intl, Date, Map, Set, Buffer, require: n => (n === '../util' || n === './../util' ? { env: (k, d) => d, fail() {}, now: () => '', addDays: () => '', fmtDate: () => '', parseLocal: () => 0, strv: v => String(v ?? '') } : {}) });
const f = out.ehAgendaMarketing;
for (const n of ['Marketing', 'AGENDA MKT', 'Agenda Mkt', 'MKT - Colégio', 'Equipe Marketing 2026', 'marketing@evolucao']) assert(f(n), n);
for (const n of ['Educação Infantil', 'Maternais – Infantil 1, 2 e 3', 'Anos Iniciais', 'Smktx', 'Ensino Médio', 'Calendário escolar']) assert(!f(n), n);
console.log('OK: reconhecimento da agenda do Marketing pelo nome.');
