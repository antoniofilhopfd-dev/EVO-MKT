// Testes isolados do motor de lembretes TikTok: sem conexão a banco, cron ou rede.
// Executar no diretório web: node tests/tiktok-lembretes-isolados.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createHash } = require('node:crypto');

const posts = new Map();
const ledger = new Set();
const notices = [];
let falharNotificacao = false;
const data = { id: 'CON-0001', canal: 'TikTok', status: 'AGENDADO', titulo: 'Vídeo da escola', responsavel: 'Marketing', publicacaoEm: '2026-11-04T18:00' };
posts.set(data.id, { ...data });
const util = {
  Row: {},
  strv: v => v === null || v === undefined ? '' : String(v),
  parseLocal: s => new Date(s.length === 16 ? s + ':00-03:00' : s),
  fmtDateTimeLocal: d => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 16),
  now: d => d.toISOString(),
};
const db = {
  withTx: async fn => {
    // Simula atomicidade: se algum INSERT falhar, desfaz as mudanças do teste.
    const oldLedger = new Set(ledger), oldLen = notices.length;
    try {
      return await fn({ query: async (sql, params) => {
        if (sql.startsWith('SELECT data')) return [[posts.has(params[1]) ? { data: JSON.stringify(posts.get(params[1])) } : undefined].filter(Boolean)];
        if (sql.startsWith('INSERT IGNORE INTO tiktok_reminder_events')) {
          if (ledger.has(params[0])) return [{ affectedRows: 0 }];
          ledger.add(params[0]);
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO notifications')) { if (falharNotificacao) throw new Error('Falha simulada em notifications'); notices.push(params); return [{ affectedRows: 1 }]; }
        throw new Error('SQL não simulada: ' + sql);
      }});
    } catch (e) {
      ledger.clear(); for (const key of oldLedger) ledger.add(key);
      notices.length = oldLen;
      throw e;
    }
  },
};
// O lembrete deve usar o conversor REAL do TikTok, e não um mock simplificado.
const conteudoSource = fs.readFileSync(path.join(__dirname, '../lib/conteudo.ts'), 'utf8');
const conteudoExp = {};
vm.runInNewContext(ts.transpileModule(conteudoSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: conteudoExp, require: name => {
    if (name === './util') return util;
    if (name === './segmentos') return { chaveSegmento: s => s };
    throw new Error('Importação inesperada no validador: ' + name);
  }, Date, Buffer, console,
}, { filename: 'conteudo.compiled.js' });
const source = fs.readFileSync(path.join(__dirname, '../lib/tiktokLembretes.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const exp = {};
vm.runInNewContext(compiled.outputText, {
  exports: exp,
  require: name => {
    if (name === 'node:crypto') return { createHash };
    if (name === './db') return db;
    if (name === './records') return { listRows: async () => [...posts.values()].map(p => ({ ...p })) };
    if (name === './util') return util;
    if (name === './conteudo') return conteudoExp;
    throw new Error('Importação inesperada: ' + name);
  },
  Date, Buffer, console,
}, { filename: 'tiktokLembretes.compiled.js' });

const at = iso => new Date(iso);
(async () => {
  assert.equal(exp.lembreteTikTokDe(data, at('2026-11-04T20:29:00Z')), null, 'antes de 30 min');
  assert.equal(exp.lembreteTikTokDe(data, at('2026-11-04T20:30:00Z')).tipo, 'antecipado');
  assert.equal(exp.lembreteTikTokDe(data, at('2026-11-04T21:00:00Z')).tipo, 'horario');
  assert.equal(exp.lembreteTikTokDe(data, at('2026-11-04T21:16:00Z')).tipo, 'atrasado');
  assert.equal(exp.lembreteTikTokDe(data, at('2026-11-05T20:59:00Z')).tipo, 'atrasado', 'recupera antes de 24h');
  assert.equal(exp.lembreteTikTokDe(data, at('2026-11-05T21:00:00Z')), null, 'não avisa após 24h');
  assert.equal(exp.lembreteTikTokDe(data, at('2026-11-12T21:00:00Z')), null, 'não gera atraso indefinido');
  assert.equal(exp.lembreteTikTokDe({ ...data, canal: 'Instagram' }, at('2026-11-04T21:00:00Z')), null);
  assert.equal(exp.lembreteTikTokDe({ ...data, status: 'PUBLICADO' }, at('2026-11-04T21:00:00Z')), null);
  assert.equal(exp.lembreteTikTokDe({ ...data, publicacaoEm: '2026-02-30T18:00' }, at('2026-03-02T21:00:00Z')), null);
  assert.equal(conteudoExp.horarioTikTokData('2026-11-04T18:00').toISOString(), '2026-11-04T21:00:00.000Z', 'fuso Fortaleza independente do servidor');
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-04T20:30:00Z'))).criados, 1);
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-04T20:31:00Z'))).criados, 0, 'não duplica');
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-04T21:00:00Z'))).criados, 1);
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-04T21:16:00Z'))).criados, 1);
  assert.equal(notices.length, 3);
  posts.set(data.id, { ...data, publicacaoEm: '2026-11-05T18:00' });
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-05T21:17:00Z'))).criados, 1, 'recuperação após falha');
  posts.set(data.id, { ...data, status: 'PUBLICADO' });
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-05T21:18:00Z'))).criados, 0);
  assert.equal(notices.length, 4);
  // Novo ciclo com a MESMA data e o MESMO responsável deve avisar novamente.
  posts.set(data.id, { ...data, agendamentoTikTokId: 'ciclo-1' });
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-04T21:16:00Z'))).criados, 1);
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-04T21:17:00Z'))).criados, 0);
  posts.set(data.id, { ...data, agendamentoTikTokId: 'ciclo-2' });
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-04T21:16:00Z'))).criados, 1, 'outro ciclo deve avisar');
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-04T21:17:00Z'))).criados, 0);
  assert.equal(notices.length, 6);
  assert.notEqual(exp.lembreteTikTokDe({ ...data, agendamentoTikTokId: 'ciclo-1' }, at('2026-11-04T21:16:00Z')).chave, exp.lembreteTikTokDe({ ...data, agendamentoTikTokId: 'ciclo-2' }, at('2026-11-04T21:16:00Z')).chave);
  // Falha na notificação reverte o livro-razão. A execução seguinte recupera.
  posts.set(data.id, { ...data, agendamentoTikTokId: 'ciclo-falha' });
  falharNotificacao = true;
  await assert.rejects(exp.executarLembretesTikTok(at('2026-11-04T21:16:00Z')));
  assert.equal(notices.length, 6);
  falharNotificacao = false;
  assert.equal((await exp.executarLembretesTikTok(at('2026-11-04T21:17:00Z'))).criados, 1);
  assert.equal(notices.length, 7);
  console.log('OK: horários Fortaleza, idempotência por ciclo, janela máxima de atraso, recuperação, rollback simulado, reagendamento e isolamento do Instagram.');
})().catch(e => { console.error(e); process.exitCode = 1; });
