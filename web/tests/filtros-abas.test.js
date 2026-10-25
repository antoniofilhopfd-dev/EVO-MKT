// Filtros independentes por aba: cada tela guarda o próprio período e filtros; só o perfil do Instagram é compartilhado entre as abas do Instagram.
// Uso: node filtros-abas.test.js <install.out>
const fs = require('fs');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const br = iso => iso.split('-').reverse().join('/');
(async () => {
  const G = await U.entrar(process.argv[2]), dia = U.dia, hoje = U.hoje();
  await require('./lib/ig-seed').semear(G);
  const b = await U.abrir(); const p = await U.pagina(b, 'NAT-3301', G.nova);
  const pref = k => p.evaluate(x => JSON.parse(localStorage.getItem('evo.' + x) || 'null'), k);
  const per = async k => (await pref(k) || {}).p;
  const ativoRapido = () => p.$$eval('[data-fbp].on', e => e.map(x => x.dataset.fbp));
  const trocar = async (pg, f) => { await U.ir(p, pg, 500); await f(); await p.waitForTimeout(700); };

  // 1-5. períodos diferentes em cada aba
  await trocar('igvisao', () => p.click('[data-fbp="7"]'));
  await trocar('trafego', () => p.click('[data-fbp="mes"]'));
  await trocar('hoje', () => p.click('[data-fbp="ano"]'));
  await trocar('igdesempenho', () => p.selectOption('#fbP', 'm:' + hoje.slice(0, 7)));
  await trocar('igranking', () => p.selectOption('#fbP', '365'));
  await trocar('tfdesempenho', () => p.click('[data-fbp="mes_ant"]'));
  await trocar('tfrelatorios', () => p.click('[data-fbp="ano"]'));
  t('cada aba guarda o próprio período (chaves separadas no navegador)', (await per('filtros.instagram.visao')) === '7' && (await per('filtros.trafego.visao')) === 'mes' && (await per('filtros.dashboard')) === 'ano' && (await per('filtros.instagram.desempenho')) === 'm:' + hoje.slice(0, 7) && (await per('filtros.instagram.ranking')) === '365' && (await per('filtros.trafego.desempenho')) === 'mes_ant' && (await per('filtros.trafego.relatorios')) === 'ano', await p.evaluate(() => Object.keys(localStorage).filter(k => k.includes('filtros'))));
  await U.ir(p, 'igvisao', 500); t('Instagram › Visão Geral continua em Últimos 7 dias depois de ir ao Tráfego e ao Dashboard', (await ativoRapido()).join() === '7');
  await U.ir(p, 'trafego', 500); t('Tráfego Pago › Visão Geral continua em Este mês', (await ativoRapido()).join() === 'mes');
  await U.ir(p, 'hoje', 500); t('Dashboard continua em Este ano', (await ativoRapido()).join() === 'ano');
  await U.ir(p, 'tfdesempenho', 500); const c1 = (await ativoRapido()).join();
  await U.ir(p, 'tfrelatorios', 500); const c2 = (await ativoRapido()).join();
  t('Desempenho e Relatórios têm períodos diferentes', c1 === 'mes_ant' && c2 === 'ano', [c1, c2]);
  await U.ir(p, 'igdesempenho', 500); const d1 = await p.$eval('#fbP', e => e.value);
  await U.ir(p, 'igranking', 500); const d2 = await p.$eval('#fbP', e => e.value);
  t('Visão Geral, Desempenho e Ranking do Instagram têm períodos diferentes', d1 === 'm:' + hoje.slice(0, 7) && d2 === '365', [d1, d2]);

  // 6. persistência ao recarregar
  await p.reload(); await p.waitForSelector('#nav .navitem', { timeout: 15000 });
  await U.ir(p, 'igvisao', 500); const r1 = (await ativoRapido()).join();
  await U.ir(p, 'trafego', 500); const r2 = (await ativoRapido()).join();
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
  const pedidos = []; p.on('request', r => { if (/\/api\/instagram\/geral/.test(r.url())) pedidos.push(new URL(r.url()).searchParams); });
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
  let n = 0; await p.route('**/api/instagram/geral*', async rt => { if (++n === 1) await new Promise(r => setTimeout(r, 1800)); rt.continue(); });
  await U.ir(p, 'igvisao', 300); n = 0;
  await p.click('[data-fbp="7"]'); await p.waitForTimeout(150); await p.click('[data-fbp="30"]'); await p.waitForTimeout(3500);
  const n30 = (await G.get(`/instagram/geral?de=${dia(-29)}&ate=${hoje}&perfil=@evolucaopb`)).atual.publicacoes, n7 = (await G.get(`/instagram/geral?de=${dia(-6)}&ate=${hoje}&perfil=@evolucaopb`)).atual.publicacoes;
  const mostrado = await p.$$eval('.kpi-ig', e => { const k = e.find(x => /PUBLICAÇÕES REALIZADAS/i.test(x.innerText)); return k ? Number(k.querySelector('strong').innerText.replace(/\D/g, '')) : null; });
  t('consulta lenta antiga não sobrescreve a seleção mais recente (Últimos 30 dias)', n30 !== n7 && mostrado === n30, [n7, n30, mostrado]);
  await p.unroute('**/api/instagram/geral*');

  // filtro próprio de cada tela e Limpar do Tráfego
  await U.ir(p, 'tfdesempenho', 500);
  t('o Tráfego usa os botões de período (Esta semana, Este mês, Mês anterior, Este ano, Personalizado), sem a lista de períodos do Instagram', (await p.$$('#fbP')).length === 0 && (await p.$$('#filtros .tf-periodos [data-fbp]')).length === 4 && (await p.$$('#fbPers')).length === 1);
  t('sem erros de script', p.errs.length === 0, p.errs);
  await b.close();

  // celular
  const b2 = await U.abrir(); const m = await U.pagina(b2, 'NAT-3301', G.nova, { width: 390, height: 844 });
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  for (const pg of ['igvisao', 'igdesempenho', 'trafego', 'hoje']) { await U.ir(m, pg, 700); const l = await m.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); t('celular 390: ' + pg + ' com os filtros sem rolagem horizontal', l[0] <= l[1] + 1, l); if (dir) await m.screenshot({ path: `${dir}/filtros-celular-${pg}.png` }); }
  if (dir) { await U.ir(m, 'igvisao', 700); }
  await b2.close(); fim();
})().catch(e => { console.error(e); process.exit(1); });
