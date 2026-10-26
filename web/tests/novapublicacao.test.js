// "+ Nova publicação" abre o fluxo novo (Agendar / Publicar agora) e não o formulário antigo do Estúdio.
const fs = require('fs');
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]);
  await G.post('/integrations/settings', { meta_app_id: 'APPID', meta_app_secret: 'META_SECRET' }); await G.post('/integrations/meta/token', { token: 'GOOD_TOKEN' });
  const b = await U.abrir(); const p = await U.pagina(b, 'NAT-3301', G.nova);
  const dir = process.env.CAPTURAS; const foto = async n => { if (dir) { fs.mkdirSync(dir, { recursive: true }); await p.screenshot({ path: `${dir}/${n}.png` }); } };
  await U.ir(p, 'igconteudos', 600);
  await p.click('#newBtn'); await p.waitForSelector('.igp-escolha');
  t('o botão abre o seletor Agendar / Publicar agora', (await p.$$('.igp-op')).length === 2 && await p.$('#estForm') === null);
  await foto('nova-escolha');
  await p.click('[data-modo="agendar"]'); await p.waitForSelector('#igpub');
  t('Agendar abre o formulário novo, com Salvar rascunho', await p.$('#igpRasc') !== null && await p.$('#estForm') === null);
  await foto('nova-agendar');
  await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('.admin-overlay').forEach(o => o.remove()));
  await p.click('#newBtn'); await p.waitForSelector('.igp-escolha'); await p.click('[data-modo="agora"]'); await p.waitForSelector('#igpub');
  t('Publicar agora abre o formulário novo', await p.$('#igpGo') !== null);
  fim();
})().catch(e => { console.error(e); process.exit(1); });
