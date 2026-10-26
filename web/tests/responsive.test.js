// Sem rolagem horizontal nas cinco áreas (e nas abas), em computador, iPad e celular. Uso: node responsive.test.js <install.out>
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]);
  await G.post('/data?module=conteudos', { titulo: 'Publicação de exemplo com um título bem longo para testar a quebra de linha na lista', status: 'RASCUNHO', publicacaoEm: U.dia(2) + 'T10:00', perfil: '@evolucaopb', formato: 'Feed' });
  await G.post('/integrations/settings', { meta_app_id: 'APPID', meta_app_secret: 'META_SECRET' }); await G.post('/integrations/meta/token', { token: 'GOOD_TOKEN' });
  const b = await U.abrir();
  const PAGINAS = ['hoje', 'calendario', 'igvisao', 'igconteudos', 'igplan', 'igdesempenho', 'trafego', 'tfcampanhas', 'tfanuncios', 'configuracoes'];
  for (const [nome, vp] of [['computador 1440', { width: 1440, height: 900 }], ['computador 1024', { width: 1024, height: 700 }], ['iPad retrato 820', { width: 820, height: 1180 }], ['iPad paisagem 1180', { width: 1180, height: 820 }], ['celular 390', { width: 390, height: 844 }], ['celular 360', { width: 360, height: 740 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp); const ruins = [];
    for (const pg of PAGINAS) {
      await U.ir(p, pg, 400);
      const o = await p.evaluate(() => ({ bw: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      if (o.bw > 2) { ruins.push(pg + ':' + o.bw); await p.screenshot({ path: `/tmp/resp_${vp.width}_${pg}.png` }); }
    }
    // o formulário de publicação em diálogo também cabe
    await U.ir(p, 'igconteudos', 300); await p.click('#newBtn'); await p.click('[data-modo="agendar"]'); await p.waitForSelector('#igpub'); await p.waitForTimeout(300);
    const e = await p.evaluate(() => ({ bw: document.documentElement.scrollWidth - document.documentElement.clientWidth, box: document.querySelector('.st-box').scrollWidth - document.querySelector('.st-box').clientWidth }));
    if (e.bw > 2 || e.box > 2) ruins.push('estudio:' + JSON.stringify(e));
    t(`${nome}: sem estouro horizontal em ${PAGINAS.length} telas e no formulário de publicação`, ruins.length === 0, ruins);
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
    await p.context().close();
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
