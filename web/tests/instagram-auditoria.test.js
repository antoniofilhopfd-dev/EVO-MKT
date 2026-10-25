// Auditoria da área Instagram: permissões, validação, fuso horário nas datas, duplicidade entre o EVO MKT e a Meta, estados vazios e celular.
// Uso: node instagram-auditoria.test.js <install.out>
const { execFileSync } = require('child_process');
const fs = require('fs');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const sql = q => execFileSync('mariadb', ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N'], { encoding: 'utf8', input: q });
const API = (process.env.BASE || 'http://127.0.0.1:8080') + '/api';
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab'), dia = U.dia;
  await G.post('/integrations/meta/token', { token: 'GOOD_TOKEN' });
  const conta = (await G.get('/integrations/status')).instagram.igUserId;
  const gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const ins = (id, quando, tipo, leg, cur) => `('${conta}','${id}','${quando}','${tipo}','${leg}',${cur},3,2,1,800,2000,4,5,'https://www.instagram.com/p/${id}/','${gif}','x')`;
  sql(`DELETE FROM ig_posts WHERE conta='${conta}'; INSERT INTO ig_posts(conta,media_id,publicado_em,tipo,legenda,curtidas,comentarios,salvos,compartilhamentos,alcance,visualizacoes,seguidores_novos,visitas_perfil,permalink,miniatura,atualizado_em) VALUES ${[
    ins('a1', dia(-2) + 'T15:00:00+0000', 'FEED', 'Aula aberta de ciências', 100), ins('a2', dia(-6) + 'T15:00:00+0000', 'REELS', 'Reels da feira', 300),
    ins('lim', '2026-09-01T02:00:00+0000', 'FEED', 'Limite de mês no fuso', 50)].join(',')};`);

  // ---- permissões e validação ----
  const sem = await fetch(`${API}/instagram/ranking?de=${dia(-29)}&ate=${dia(0)}`, { headers: { 'X-EVO': '1' } });
  t('sem login, o ranking e as informações mensais recusam (401)', sem.status === 401 && (await fetch(`${API}/instagram/mensal`, { headers: { 'X-EVO': '1' } })).status === 401);
  const q = `de=${dia(-29)}&ate=${dia(0)}`;
  t('a Equipe vê ranking e informações mensais', (await E.req('GET', '/instagram/ranking?' + q)).status === 200 && (await E.req('GET', '/instagram/mensal?' + q)).status === 200);
  t('ranking e mensal só aceitam GET (405)', (await G.req('POST', '/instagram/ranking?' + q)).status === 405 && (await G.req('POST', '/instagram/mensal?' + q)).status === 405);
  t('datas e perfil inválidos recusados (400)', (await G.req('GET', `/instagram/ranking?de=${dia(0)}&ate=${dia(-5)}`)).status === 400 && (await G.req('GET', `/instagram/mensal?${q}&perfil=@x`)).status === 400 && (await G.req('GET', `/instagram/ranking?de=x&ate=y`)).status < 500);
  t('injeção no perfil não passa (400)', (await G.req('GET', `/instagram/ranking?${q}&perfil=${encodeURIComponent("@a' OR 1=1 --")}`)).status === 400);

  // ---- fuso horário: 01/09 02:00 UTC é 31/08 23:00 em Fortaleza ----
  const dia31 = await G.get('/instagram/ranking?de=2026-08-31&ate=2026-08-31'), dia01 = await G.get('/instagram/ranking?de=2026-09-01&ate=2026-09-01');
  t('postagem de 01/09 02:00 UTC conta em 31/08 (fuso de Fortaleza)', dia31.rows.length === 1 && dia01.rows.length === 0, [dia31.rows.length, dia01.rows.length]);
  const mens = await G.get('/instagram/mensal?' + q);
  t('informações mensais contam o mês pelo fuso de Fortaleza', mens.mensal.some(x => x.periodo === '2026-08' && x.posts === 1) && !mens.mensal.some(x => x.periodo === '2026-09' && x.posts), JSON.stringify(mens.mensal.map(x => [x.periodo, x.posts, x.reels])));

  // ---- duplicidade: publicação do EVO MKT ligada a uma postagem da Meta aparece uma vez ----
  await G.post('/data?module=conteudos', { titulo: 'Aula aberta de ciências', status: 'RASCUNHO', perfil: '@evolucaopb', formato: 'Feed', publicacaoEm: dia(-2) + 'T15:00', instagramMediaId: 'a1', legenda: 'x' });
  sql("UPDATE records SET data=JSON_SET(data,'$.instagramMediaId','a1') WHERE modulo='conteudos' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.titulo'))='Aula aberta de ciências';");
  await G.post('/data?module=conteudos', { titulo: 'Só no EVO MKT', status: 'RASCUNHO', perfil: '@evolucaopb', formato: 'Feed', publicacaoEm: dia(2) + 'T10:00' });

  const b = await U.abrir(); const p = await U.pagina(b, 'NAT-3301', G.nova);
  await U.ir(p, 'igconteudos', 900);
  t('Conteúdos: a postagem ligada não aparece duplicada na seção da Meta', (await p.$$('.igl tbody tr')).length === 4 && !/Aula aberta de ciências/.test(await p.innerText('.igl')) && /Reels da feira/.test(await p.innerText('.igl')), await p.innerText('.igl'));
  await U.ir(p, 'igcalendario', 900);
  t('Calendário: a postagem ligada aparece uma única vez', (await p.$$eval('.igcal-item', e => e.filter(x => /Aula aberta de ciências/.test(x.title)).length)) === 1);
  await U.ir(p, 'igranking', 900);
  t('Ranking: sem sublinhado azul nos títulos e nada cortado na tabela', await p.$$eval('.igr-tab a', e => e.every(x => getComputedStyle(x).textDecorationLine === 'none')) && await p.$eval('.igr-tab', e => e.parentElement.scrollWidth <= e.parentElement.clientWidth + 2), await p.$eval('.igr-tab', e => [e.parentElement.scrollWidth, e.parentElement.clientWidth]));

  // ---- estado vazio do perfil sem dados ----
  await p.selectOption('#igPerfilCabecalho', '@geracaoevolucao'); await p.waitForTimeout(500);
  for (const pg of ['igvisao', 'igconteudos', 'igcalendario', 'igdesempenho', 'igranking']) { await U.ir(p, pg, 700); t('perfil sem dados: ' + pg + ' abre com mensagem clara, sem erro', !/Não foi possível carregar/.test(await p.innerText('#content'))); }
  await p.selectOption('#igPerfilCabecalho', '').catch(() => {});
  t('desktop: sem erros de script', p.errs.length === 0, p.errs);
  await b.close();

  // ---- celular 390 px: sem rolagem horizontal e sem erros ----
  const b2 = await U.abrir(); const m = await U.pagina(b2, 'NAT-3301', G.nova, { width: 390, height: 844 });
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  for (const pg of ['igvisao', 'igconteudos', 'igcalendario', 'igdesempenho', 'igranking']) {
    await U.ir(m, pg, 900);
    const larg = await m.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, document.querySelector('#content').scrollWidth]);
    t('celular 390: ' + pg + ' sem rolagem horizontal', larg[0] <= larg[1] + 1 && larg[2] <= larg[1] + 1, larg);
    if (dir) await m.screenshot({ path: `${dir}/celular-${pg}.png`, fullPage: false });
  }
  t('celular: sem erros de script', m.errs.length === 0, m.errs);
  await b2.close(); fim();
})().catch(e => { console.error(e); process.exit(1); });
