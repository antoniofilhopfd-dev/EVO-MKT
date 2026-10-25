// Capturas de tela reais do Instagram (com dados fictícios de teste) e testes de ponta a ponta das novas telas.
// Uso: CAPTURAS=pasta node prints-instagram.test.js <install.out> [paginas,separadas,por,virgula]
const fs = require('fs');
const U = require('./lib/ui');
const { semear } = require('./lib/ig-seed');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]); await semear(G);
  const dir = process.env.CAPTURAS || '/tmp/prints'; fs.mkdirSync(dir, { recursive: true });
  const paginas = (process.env.PAGINAS || 'igvisao,igconteudos').split(',');
  const b = await U.abrir();
  // imagem JPEG de verdade para enviar nos testes de publicação
  const gerador = await (await b.newContext({ viewport: { width: 540, height: 540 } })).newPage();
  await gerador.setContent('<body style="margin:0"><div style="width:540px;height:540px;background:linear-gradient(135deg,#063996,#00A1F3 55%,#FF7800);display:grid;place-items:center;font:700 54px Arial;color:#fff">EVO<br>MKT</div></body>');
  const jpg = `${dir}/arte-teste.jpg`; await gerador.screenshot({ path: jpg, type: 'jpeg', quality: 90 });
  for (const [nome, vp] of [['desktop', { width: 1440, height: 1500 }], ['celular', { width: 390, height: 1800 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    for (const pg of paginas) {
      await U.ir(p, pg, 1200); await p.waitForTimeout(500);
      await p.screenshot({ path: `${dir}/${pg}-${nome}.png` });
      t(`${pg} (${nome}) sem erro de carregamento`, !/Não foi possível carregar/.test(await p.innerText('#content')));
      if (pg === 'igconteudos' && nome === 'desktop') {
        t('Publicações: lista com miniatura, perfil, formato, data e status', (await p.$$('.igl tbody tr')).length >= 10 && (await p.$$('.igl-mini img')).length >= 10 && (await p.$$('.badge')).length >= 10);
        await p.click('#igcAgora'); await p.waitForSelector('.igp');
        await p.setInputFiles('#igpArq', jpg.replace('.jpg', '.jpg')); await p.selectOption ? 0 : 0;
        await p.click('[name=igpFmt][value="Feed"]', { force: true }).catch(() => {});
        await p.setInputFiles('#igpArq', jpg); await p.fill('#igpLeg', 'Hoje é dia de aula aberta no Colégio Evolução! Venha conhecer nossos espaços. #EvoluçãoPB #AulaAberta');
        await p.waitForTimeout(400); await p.screenshot({ path: `${dir}/publicar-agora-desktop.png` });
        t('Publicar agora: perfis, formatos, mídia, legenda e prévia', (await p.$$('.igp-perfil')).length === 2 && (await p.$$('.igp-formato')).length === 4 && /aula aberta/i.test(await p.innerText('.igp-prev')) && (await p.$('.igp-prev img')) !== null);
        await p.click('#igpGo'); await p.waitForTimeout(2500);
        t('Publicar agora envia ao Instagram e fecha', (await p.$$('.igp')).length === 0, await p.innerText('#toast').catch(() => ''));
        await U.ir(p, 'igconteudos', 900);
        t('a publicação feita agora aparece como Publicada na lista', (await p.$$eval('.igl tbody tr', e => e.filter(x => /Hoje é dia de aula aberta/.test(x.innerText) && /Publicada/.test(x.innerText)).length)) === 1);
        await p.click('#igcAgendar'); await p.waitForSelector('.igp');
        await p.click('[name=igpFmt][value="Reels"]', { force: true }).catch(() => {});
        await p.fill('#igpLeg', 'Agendado: Dia das Crianças no Paraíso dos Colibris.'); await p.waitForTimeout(300);
        await p.screenshot({ path: `${dir}/agendar-desktop.png` });
        await p.click('#igpGo'); await p.waitForTimeout(600);
        t('Agendar sem mídia avisa o que falta', /Envie a mídia/.test(await p.innerText('#igpErro')));
        await p.click('.igp [data-close]'); await p.waitForTimeout(300);
        await p.click('#igcAgendar'); await p.waitForSelector('.igp'); await p.click('[name=igpFmt][value="Feed"]', { force: true }).catch(() => {});
        await p.setInputFiles('#igpArq', jpg); await p.fill('#igpLeg', 'Legenda do post agendado para amanhã.'); await p.click('#igpGo'); await p.waitForTimeout(1800);
        await U.ir(p, 'igconteudos', 900);
        t('Agendar cria a publicação como Agendada na lista', (await p.$$eval('.igl tbody tr', e => e.filter(x => /Legenda do post agendado/.test(x.innerText) && /Agendada/.test(x.innerText)).length)) === 1, await p.$$eval('.igl tbody tr', e => e.slice(0, 4).map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 120))));
        await p.screenshot({ path: `${dir}/igconteudos-desktop.png` });
      }
    }
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
  }
  await b.close(); fim();
})().catch(e => { console.error(e); process.exit(1); });
