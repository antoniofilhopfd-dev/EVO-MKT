// Capturas de tela reais do Instagram (com dados fictícios de teste) e testes de ponta a ponta das novas telas.
// Uso: CAPTURAS=pasta node prints-instagram.test.js <install.out> [paginas,separadas,por,virgula]
const fs = require('fs');
const U = require('./lib/ui');
const { semear } = require('./lib/ig-seed');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]); await semear(G);
  const dir = process.env.CAPTURAS || '/tmp/prints'; fs.mkdirSync(dir, { recursive: true });
  const paginas = (process.env.PAGINAS || 'igvisao,igconteudos,igcalendario').split(',');
  await G.post('/data?module=conteudos', { titulo: 'Stories do dia', status: 'RASCUNHO', perfil: '@evolucaopb', formato: 'Stories', publicacaoEm: U.dia(2) + 'T10:00', legenda: 'Stories avulso' });
  await G.post('/data?module=conteudos', { titulo: 'Rascunho Reels da feira', status: 'RASCUNHO', perfil: '@geracaoevolucao', formato: 'Reels', publicacaoEm: U.dia(3) + 'T15:30', legenda: 'Reels em preparação' });
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
      if (pg === 'igcalendario' && nome === 'desktop') {
        const corpo = () => p.innerText('#igcalCorpo');
        t('Calendário: Mês é o padrão, só Dia, Semana e Mês, sem Lista', (await p.$$eval('[data-modo]', e => e.map(x => x.innerText.trim()))).join('|') === 'Mês|Semana|Dia' && (await p.$eval('[data-modo].btn:not(.soft)', e => e.innerText)) === 'Mês');
        t('Calendário: Stories fora da pauta; rascunho com data aparece', !/Stories do dia|Stories avulso/.test(await corpo()) && /Rascunho Reels da feira/.test(await corpo()));
        t('Calendário: publicadas, agendadas e em preparação têm miniatura e horário', (await p.$$('.igcal-item img')).length >= 5 && (await p.$$('.igcal-hora')).length >= 5);
        await p.screenshot({ path: `${dir}/igcalendario-desktop.png` });
        await p.click(`[data-add="${U.dia(4)}"]`, { force: true }); await p.waitForSelector('.igp');
        t('Calendário: "+" no dia abre Agendar com a data escolhida', (await p.inputValue('#igpDia')) === U.dia(4));
        await p.click('.igp [data-close]'); await p.waitForTimeout(300);
        await p.locator('.igcal-item[draggable=true]').first().dragTo(p.locator(`[data-solta="${U.dia(5)}"]`)); await p.waitForTimeout(1200);
        t('Calendário: arrastar reagenda a publicação para outro dia', (await p.$$eval(`[data-solta="${U.dia(5)}"] .igcal-item`, e => e.length)) >= 1);
        await p.click('[data-modo="semana"]'); await p.waitForTimeout(600); await p.screenshot({ path: `${dir}/igcalendario-semana-desktop.png` });
        await p.click('[data-modo="dia"]'); await p.waitForTimeout(600); await p.screenshot({ path: `${dir}/igcalendario-dia-desktop.png` });
        await p.click('[data-modo="mes"]'); await p.waitForTimeout(300);
      }
      if (pg === 'igranking' && nome === 'desktop') {
        t('Ranking: abas Publicações e Contas', (await p.$$eval('[data-igr-aba]', e => e.map(x => x.innerText.trim()))).join('|') === 'Publicações|Contas');
        t('Ranking de Publicações: pódio, miniaturas e colunas de visitas e seguidores', (await p.$$('.igr-podio')).length === 3 && (await p.$$('.igr-tab img')).length >= 10 && /visitas ao perfil/i.test(await p.innerText('.igr-tab thead')) && /seguidores adquiridos/i.test(await p.innerText('.igr-tab thead')));
        await p.click('[data-igr-aba="contas"]'); await p.waitForSelector('.igr-hist'); await p.waitForTimeout(500);
        const tab = () => p.innerText('.igr-hist');
        t('Ranking de Contas: semanal começa na Semana 41 (04/10/2026 a 10/10/2026), em ordem', /Semana 41/.test(await tab()) && /04\/10\/2026 a 10\/10\/2026/.test(await tab()) && /Semana 42/.test(await tab()) && /11\/10\/2026 a 17\/10\/2026/.test(await tab()) && !/Semana 40/.test(await tab()));
        t('Ranking de Contas: semanas vazias ficam ocultas por padrão', !/Semana 1\b/.test(await tab()) && (await p.$$('.igr-hist tbody tr')).length === 4);
        t('Ranking de Contas: Semana 41 sem seguidores mostra "—", nunca zero', await p.$$eval('.igr-hist tbody tr', e => /Semana 41/.test(e[0].innerText) && !/\b0\b/.test(e[0].querySelector('td:nth-child(2)').innerText) && /—/.test(e[0].querySelector('td:nth-child(2)').innerText)));
        t('Ranking de Contas: duas contas lado a lado', (await p.$$eval('.igr-hist tbody tr:first-child td:nth-child(4) .igr-par span', e => e.length)) === 2);
        await p.screenshot({ path: `${dir}/igranking-contas-semanal-desktop.png` });
        await p.click('[data-igr-visao="mes"]'); await p.waitForTimeout(700);
        t('Ranking de Contas: mensal mostra janeiro a dezembro', (await p.$$('.igr-hist tbody tr')).length === 12 && /Janeiro/.test(await tab()) && /Dezembro/.test(await tab()) && /Sem dados/.test(await tab()));
        await p.screenshot({ path: `${dir}/igranking-contas-mensal-desktop.png` });
        await p.click('[data-igr-visao="ano"]'); await p.waitForTimeout(700);
        t('Ranking de Contas: anual mostra o histórico por ano', /2026/.test(await tab()));
        await p.screenshot({ path: `${dir}/igranking-contas-anual-desktop.png` });
        await p.click('[data-igr-visao="semana"]'); await p.waitForTimeout(500); await p.click('[data-igr-aba="publicacoes"]'); await p.waitForTimeout(700);
        await p.screenshot({ path: `${dir}/igranking-desktop.png` });
      }
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
