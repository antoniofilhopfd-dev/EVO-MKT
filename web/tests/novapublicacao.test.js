// "+ Nova publicação" abre o fluxo novo (Agendar / Publicar agora) e não o formulário antigo do Estúdio.
const fs = require('fs');
const U = require('./lib/ui');
const sharp = require('sharp');
const imagem = (w, h, cor) => sharp({ create: { width: w, height: h, channels: 3, background: cor } }).jpeg().toBuffer();
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
  // ---- prévia proporcional à mídia ----
  const razao = async () => p.evaluate(() => { const q = document.querySelector('.igp-quadrado'), r = q.getBoundingClientRect(); return r.width / r.height; });
  await p.click('[name=igpFmt][value="Feed"]', { force: true }).catch(async () => { await p.evaluate(() => document.querySelector('[name=igpFmt][value="Feed"]').click()); });
  await p.fill('#igpLeg', 'Matrículas abertas para 2027. Venha conhecer o Colégio Evolução e garanta a vaga do seu filho. ' + 'Texto longo '.repeat(12));
  t('sem mídia, a prévia do Feed é um quadrado com aviso de espaço vazio', Math.abs(await razao() - 1) < 0.02 && await p.$('.igp-vazio') !== null);
  const casos = [['paisagem', 1600, 900, 1600 / 900], ['retrato', 1080, 1350, 0.8], ['muito alta', 600, 1600, 0.8], ['quadrada', 1000, 1000, 1]];
  for (const [nome, w, h, esperado] of casos) {
    await p.setInputFiles('#igpArq', { name: nome.replace(' ', '-') + '.jpg', mimeType: 'image/jpeg', buffer: await imagem(w, h, { r: 30, g: 90, b: 200 }) });
    await p.waitForFunction(r => { const q = document.querySelector('.igp-quadrado'); return q && Math.abs(q.getBoundingClientRect().width / q.getBoundingClientRect().height - r) < 0.03; }, esperado, { timeout: 5000 }).catch(() => {});
    t(`Feed ${nome}: a prévia segue a proporção real da foto (limitada entre 1,91:1 e 4:5)`, Math.abs(await razao() - esperado) < 0.03, await razao());
    await foto('nova-previa-' + nome.replace(' ', '-'));
  }
  t('a legenda longa é cortada com “mais”', await p.$('.igp-leg .igp-mais') !== null);
  await p.evaluate(() => document.querySelector('[name=igpFmt][value="Stories"]').click()); await p.waitForSelector('.igp-tela');
  await p.setInputFiles('#igpArq', { name: 'story.jpg', mimeType: 'image/jpeg', buffer: await imagem(1600, 900, { r: 214, g: 51, b: 108 }) });
  await p.waitForSelector('.igp-aviso', { timeout: 5000 }).catch(() => {});
  const q = await p.evaluate(() => { const r = document.querySelector('.igp-tela').getBoundingClientRect(); return r.width / r.height; });
  t('Stories fica 9:16 e avisa quando o arquivo é horizontal', Math.abs(q - 9 / 16) < 0.03 && await p.$('.igp-aviso') !== null, q);
  await foto('nova-previa-stories');
  fim();
})().catch(e => { console.error(e); process.exit(1); });
