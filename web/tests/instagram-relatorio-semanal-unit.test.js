// Regras básicas do intervalo semanal, sem serviços externos.
const assert = require('node:assert/strict');
const domingo = new Date('2026-11-08T12:00:00Z');
assert.equal(domingo.getUTCDay(), 0);
const sabado = new Date(domingo.getTime() + 6 * 86400000);
assert.equal(sabado.toISOString().slice(0, 10), '2026-11-14');
console.log('Intervalo semanal: OK');
