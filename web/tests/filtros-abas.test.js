// Filtros independentes por aba: cada tela guarda o próprio período e filtros; só o perfil do Instagram é compartilhado entre as abas do Instagram.
// Uso: node filtros-abas.test.js <install.out>
const fs = require('fs');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const br = iso => iso.split('-').reverse().join('/');
(async () => {
  const G = await U.entrar(process.argv[2]), dia = U.dia, hoje = U.hoje();
  const conta = (await (async () => { await G.post('/integrations/meta/token', { token: 'GOOD_TOKEN' }); return (await G.get('/integrations/status')).instagram.igUserId; })());
  const b = await U.abrir(); const p = await U.pagina(b, 'NAT-3301', G.nova);
  const pref = k => p.evaluate(x => JSON.parse(localStorage.getItem('evo.' + x) || 'null'), k);
  const per = async k => (await pref(k) || {}).p;
  const ativoRapido = () => p.$$eval('[data-fbp].on', e => e.map(x => x.dataset.fbp));
  const trocar = async (pg, f) => { await U.ir(p, pg, 500); await f(); await p.waitForTimeout(700); };

  // 1-5. períodos diferentes em cada aba
  await trocar('igvisao', () => p.click('[data-fbp="7"]'));
  await trocar('trafego', () => p.selectOption('#fbP', 'mes'));
  await trocar('hoje', () => p.selectOption('#fbP', '90'));
  await trocar('igdesempenho', () => p.selectOption('#fbP', 'm:' + hoje.slice(0, 7)));
  await trocar('igranking', () => p.selectOption('#fbP', '365'));
  await trocar('tfcampanhas', () => p.selectOption('#fbP', 'semana'));
  await trocar('tfanuncios', () => p.selectOption('#fbP', '7'));
  t('cada aba guarda o próprio período (chaves separadas no navegador)', (await per('filtros.instagram.visao')) === '7' && (await per('filtros.trafego.visao')) === 'mes' && (await per('filtros.dashboard')) === '90' && (await per('filtros.instagram.desempenho')) === 'm:' + hoje.slice(0, 7) && (await per('filtros.instagram.ranking')) === '365' && (await per('filtros.trafego.campanhas')) === 'semana' && (await per('filtros.trafego.anuncios')) === '7', await p.evaluate(() => Object.keys(localStorage).filter(k => k.includes('filtros'))));
  await U.ir(p, 'igvisao', 500); t('Instagram › Visão Geral continua em Últimos 7 dias depois de ir ao Tráfego e ao Dashboard', (await ativoRapido()).join() === '7');
  await U.ir(p, 'trafego', 500); t('Tráfego Pago › Visão Geral continua em Este mês', (await p.$eval('#fbP', e => e.value)) === 'mes');
  await U.ir(p, 'hoje', 500); t('Dashboard continua em Últimos 90 dias', (await p.$eval('#fbP', e => e.value)) === '90');
  await U.ir(p, 'tfcampanhas', 500); const c1 = await p.$eval('#fbP', e => e.value);
  await U.ir(p, 'tfanuncios', 500); const c2 = await p.$eval('#fbP', e => e.value);
  t('Campanhas e Anúncios têm períodos diferentes', c1 === 'semana' && c2 === '7', [c1, c2]);
  await U.ir(p, 'igdesempenho', 500); const d1 = await p.$eval('#fbP', e => e.value);
  await U.ir(p, 'igranking', 500); const d2 = await p.$eval('#fbP', e => e.value);
  t('Visão Geral, Desempenho e Ranking do Instagram têm períodos diferentes', d1 === 'm:' + hoje.slice(0, 7) && d2 === '365', [d1, d2]);

  // 6. persistência ao recarregar
  await p.reload(); await p.waitForSelector('#nav .navitem', { timeout: 15000 });
  await U.ir(p, 'igvisao', 500); const r1 = (await ativoRapido()).join();
  await U.ir(p, 'trafego', 500); const r2 = await p.$eval('#fbP', e => e.value);
  t('as escolhas continuam depois de recarregar a página', r1 === '7' && r2 === 'mes', [r1, r2]);

  // 9. perfil compartilhado só no Instagram, sem mexer nos períodos
  await U.ir(p, 'igvisao', 500); await p.selectOption('#igPerfilCabecalho', '@evolucaopb'); await p.waitForTimeout(600);
  t('trocar o perfil não muda o período', (await ativoRapido()).join() === '7' && (await per('filtros.instagram.ranking')) === '365');
  await U.ir(p, 'igranking', 500); t('o perfil escolhido vale em todas as abas do Instagram', (await p.$eval('#igPerfilCabecalho', e => e.value)) === '@evolucaopb');
  await U.ir(p, 'trafego', 500); t('o perfil do Instagram não vai para o Tráfego Pago (sem seletor e sem parâmetro)', (await p.$$('#fbPerfil')).length === 0 && (await p.$$('#igPerfilCabecalho:visible')).length === 0 && (await p.evaluate(() => Filtros.get('trafego').perfil)) === '' || (await p.$eval('#headerIgProfile', e => e.hidden)));
  await U.ir(p, 'hoje', 500); t('o Dashboard tem o próprio filtro de perfil (não usa o do cabeçalho)', (await p.$eval('#fbPerfil', e => e.value)) === '');

  // 10. limpar só afeta a aba atual
  await U.ir(p, 'igranking', 500); await p.click('#fbLimpar'); await p.waitForTimeout(700);
  t('Limpar filtros restaura só o Ranking (período 30 dias) e mantém as outras abas e o perfil', (await per('filtros.instagram.ranking')) === '30' && (await per('filtros.instagram.visao')) === '7' && (await per('filtros.trafego.visao')) === 'mes' && (await p.$eval('#igPerfilCabecalho', e => e.value)) === '@evolucaopb');
  await U.ir(p, 'igvisao', 500); t('Visão Geral continua em 7 dias depois de limpar o Ranking', (await ativoRapido()).join() === '7');

  // 5/12. intervalos exatos e consultas com as datas certas
  const pedidos = []; p.on('request', r => { if (/\/api\/instagram\/visao/.test(r.url())) pedidos.push(new URL(r.url()).searchParams); });
  await trocar('igvisao', () => p.click('[data-fbp="mes"]'));
  t('Este mês: do dia 1 até hoje, no texto e na consulta', (await p.innerText('#fbInfo')).includes(`${br(hoje.slice(0, 8) + '01')} a ${br(hoje)}`) && pedidos.some(q => q.get('de') === hoje.slice(0, 8) + '01' && q.get('ate') === hoje));
  await trocar('igvisao', () => p.selectOption('#fbMes', 'm:2026-09'));
  t('Mês escolhido (setembro) aplica o mês completo e o botão rápido deixa de estar ativo', (await p.innerText('#fbInfo')).includes('01/09/2026 a 30/09/2026') && (await ativoRapido()).length === 0);
  await trocar('igvisao', () => p.selectOption('#fbAno', 'a:2026'));
  t('Ano escolhido vai de 01/01 até hoje (limite da data atual)', (await p.innerText('#fbInfo')).includes(`01/01/2026 a ${br(hoje)}`));
  await trocar('igvisao', () => p.click('[data-fbp="semana"]')); t('Esta semana ativa só o botão Esta semana', (await ativoRapido()).join() === 'semana');
  t('a Visão Geral só oferece Mês, Ano e quatro botões rápidos', (await p.$$('[data-fbp]')).length === 4 && (await p.$$('#fbP')).length === 0 && (await p.$$('#fbSeg')).length === 0);

  if (process.env.CAPTURAS) { fs.mkdirSync(process.env.CAPTURAS, { recursive: true }); await p.screenshot({ path: process.env.CAPTURAS + '/filtros-visao-geral.png' }); await U.ir(p, 'igranking', 600); await p.screenshot({ path: process.env.CAPTURAS + '/filtros-ranking.png' }); await U.ir(p, 'trafego', 600); await p.screenshot({ path: process.env.CAPTURAS + '/filtros-trafego.png' }); await U.ir(p, 'igvisao', 500); }
  // 11. resposta antiga não sobrescreve a mais nova
  let n = 0; await p.route('**/api/instagram/visao*', async rt => { if (++n === 1) await new Promise(r => setTimeout(r, 1800)); rt.continue(); });
  await U.ir(p, 'igvisao', 300); n = 0;
  await p.click('[data-fbp="7"]'); await p.waitForTimeout(150); await p.click('[data-fbp="30"]'); await p.waitForTimeout(3500);
  const texto = await p.innerText('#content');
  t('consulta lenta antiga não sobrescreve a seleção mais recente (Últimos 30 dias)', texto.includes(br(dia(-29))) && !texto.includes(`período ${br(dia(-6))} a`), texto.slice(0, 300));
  await p.unroute('**/api/instagram/visao*');

  // filtro próprio de cada tela e Limpar do Tráfego
  await U.ir(p, 'tfcampanhas', 500); const temStatus = (await p.$$('#tfStatus')).length;
  if (temStatus) { await p.selectOption('#tfStatus', (await p.$$eval('#tfStatus option', e => e.map(x => x.value))).find(v => v !== 'todos')); await p.waitForTimeout(600); await U.ir(p, 'tfanuncios', 500); t('o status de Campanhas não aparece em Anúncios', (await p.$eval('#tfStatus', e => e.value)) === 'todos'); }
  t('sem erros de script', p.errs.length === 0, p.errs);
  await b.close();

  // celular
  const b2 = await U.abrir(); const m = await U.pagina(b2, 'NAT-3301', G.nova, { width: 390, height: 844 });
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  for (const pg of ['igvisao', 'igdesempenho', 'trafego', 'hoje']) { await U.ir(m, pg, 700); const l = await m.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); t('celular 390: ' + pg + ' com os filtros sem rolagem horizontal', l[0] <= l[1] + 1, l); if (dir) await m.screenshot({ path: `${dir}/filtros-celular-${pg}.png` }); }
  if (dir) { await U.ir(m, 'igvisao', 700); }
  await b2.close(); fim();
})().catch(e => { console.error(e); process.exit(1); });
