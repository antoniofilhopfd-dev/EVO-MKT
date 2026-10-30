// Ajudantes das suítes de interface (Playwright): entrada pela API, dados de exemplo e navegação entre as cinco áreas.
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8080', B = BASE + '/api';
const J = { 'Content-Type': 'application/json', 'X-EVO': '1' };
const cookie = r => r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
const somaDia = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
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
  return { H, pw, nova, cod, get: u => fetch(B + u, { headers: H }).then(x => x.json()), post: (u, b) => fetch(B + u, { method: 'POST', headers: H, body: JSON.stringify(b ?? {}) }).then(async x => ({ ...(await x.json().catch(() => ({}))), http: x.status })), put: (u, b) => fetch(B + u, { method: 'PUT', headers: H, body: JSON.stringify(b ?? {}) }).then(async x => ({ ...(await x.json().catch(() => ({}))), http: x.status })), req: (m, u, b) => fetch(B + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }) };
}
async function abrir() {
  const options={executablePath:process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:JSON.parse(process.env.CHROME_ARGS || '[]')};
  // Chromium de processo único não suporta reutilizar vários contextos. Só o ambiente local isolado usa este caminho.
  if(process.env.TEST_ISOLATED_BROWSER==='1') {
    const browsers=[];
    return {newContext:async opts=>{const b=await chromium.launch(options);browsers.push(b);return b.newContext(opts);},close:async()=>{await Promise.all(browsers.map(b=>b.close().catch(()=>{})));}};
  }
  return chromium.launch(options);
}
async function pagina(browser, cod, senha, vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  if(process.env.TEST_LOCAL_ONLY==='1') await ctx.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||!/^https?:/.test(u.protocol)?route.continue():route.abort();});
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push(m.text()); }); p.on('dialog', d => { p.errs.push('DIALOGO NATIVO: ' + d.type()); d.dismiss(); });
  await p.goto(BASE + '/'); await p.fill('#internalCode', cod); await p.fill('#internalPass', senha); await p.click('#internalLoginBtn');
  await p.waitForSelector('#nav .navitem', { timeout: 15000 });
  await p.waitForFunction(() => document.querySelector('#content') && !document.querySelector('#content .loading') && document.querySelector('#content').innerText.length > 20, null, { timeout: 20000 }).catch(() => {});
  return p;
}
async function ir(p, pg, espera = 600) {
  await p.evaluate(x => go(x), pg);
  await p.waitForFunction(() => !document.querySelector('#content .loading'), null, { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(espera);
}
const textoConteudo = p => p.evaluate(() => document.querySelector('#content').innerText);
/** Texto de modelo só para os testes (usa os marcadores de finalidade, canais, prazo etc.). O termo real do colégio é o da migração 038. */
const CORPO_TESTE = "Eu, {{responsavel}}, responsável legal pelo(a) aluno(a) {{aluno}}, matrícula {{matricula}}, turma {{turma}}, {{decisao}} o {{colegio}} a utilizar fotografias e vídeos em que o(a) aluno(a) apareça, nas condições abaixo.\n\nFinalidade: {{finalidade}}\n\nCanais de divulgação: {{canais}}\n\nLocal ou evento: {{local}}\n\nPrazo: {{prazo}}\n\n{{observacoes}}Esta autorização é concedida de forma gratuita. O colégio não usará a imagem do(a) aluno(a) fora da finalidade e dos canais indicados, nem de forma que o exponha a constrangimento.\n\nO responsável pode revogar esta autorização a qualquer momento, por solicitação ao colégio. Também pode optar por NÃO autorizar, sem qualquer prejuízo ao aluno. Os dados desta solicitação são tratados somente para registrar a escolha do responsável.";
module.exports = { CORPO_TESTE, BASE, B, J, somaDia, dia, hoje, contador, entrar, abrir, pagina, ir, textoConteudo, cookie };
