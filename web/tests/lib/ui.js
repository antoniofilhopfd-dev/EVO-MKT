// Ajudantes das suítes de interface (Playwright): entrada pela API, dados de exemplo e navegação entre as cinco áreas.
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8080', B = BASE + '/api';
const J = { 'Content-Type': 'application/json', 'X-EVO': '1' };
const cookie = r => r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
const dia = n => { const d = new Date(hoje() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function contador() {
  let ok = 0, bad = 0;
  const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'OK  ' : 'FAIL', n); if (!c && x !== undefined) console.log('    ', String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 600)); };
  return { t, fim: () => { console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0); } };
}
/** Senhas temporárias impressas na instalação -> cabeçalhos autenticados (troca a senha obrigatória). */
async function entrar(installOut, cod = 'NAT-3301', nova = 'Nat26ab') {
  const out = fs.readFileSync(installOut, 'utf8');
  const pw = out.match(new RegExp(cod + '[^:]*: (\\S+)'))[1];
  let r = await fetch(B + '/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ codigo: cod, senha: pw }) });
  const ck = cookie(r);
  await fetch(B + '/auth/password', { method: 'POST', headers: { ...J, Cookie: ck }, body: JSON.stringify({ atual: pw, nova }) });
  r = await fetch(B + '/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ codigo: cod, senha: nova }) });
  const H = { ...J, Cookie: cookie(r) };
  return { H, pw, nova, cod, get: u => fetch(B + u, { headers: H }).then(x => x.json()), post: (u, b) => fetch(B + u, { method: 'POST', headers: H, body: JSON.stringify(b ?? {}) }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) })), put: (u, b) => fetch(B + u, { method: 'PUT', headers: H, body: JSON.stringify(b ?? {}) }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) })), req: (m, u, b) => fetch(B + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }) };
}
async function abrir() { return chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
async function pagina(browser, cod, senha, vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push(m.text()); }); p.on('dialog', d => { p.errs.push('DIALOGO NATIVO: ' + d.type()); d.dismiss(); });
  await p.goto(BASE + '/'); await p.fill('#internalCode', cod); await p.fill('#internalPass', senha); await p.click('#internalLoginBtn');
  await p.waitForSelector('#nav .navitem', { timeout: 15000 });
  return p;
}
async function ir(p, pg, espera = 600) {
  await p.evaluate(x => go(x), pg);
  await p.waitForFunction(() => !document.querySelector('#content .loading'), null, { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(espera);
}
const textoConteudo = p => p.evaluate(() => document.querySelector('#content').innerText);
module.exports = { BASE, B, J, dia, hoje, contador, entrar, abrir, pagina, ir, textoConteudo, cookie };
