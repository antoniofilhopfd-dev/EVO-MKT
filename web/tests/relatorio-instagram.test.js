// Relatório mensal do Instagram: dados do mês, PDF A4 paginado de verdade (download direto), logo com tamanho controlado e telas reais.
// Uso: CAPTURAS=pasta node relatorio-instagram.test.js <install.out>
const fs = require('fs'), os = require('os');
const { execFileSync } = require('child_process');
const U = require('./lib/ui');
const { semear, sql } = require('./lib/ig-seed');
const { t, fim } = U.contador();
const sh = c => execFileSync('bash', ['-c', c], { encoding: 'utf8' });
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const { ig1 } = await semear(G, { posts: 14 });
  const mesAtual = U.dia(0).slice(0, 7), mesVazio = '2025-01';
  sql(`UPDATE ig_posts SET miniatura=CONCAT('https://scontent.cdninstagram.com/p', MOD(CRC32(media_id), 9), '.jpg') WHERE conta='${ig1}';`);
  // ---- API ----
  const d = await G.get(`/instagram/relatorio?mes=${mesAtual}`);
  t('dados do mês: período exato, série de seguidores, semanas (dom–sáb) e publicações', d.mes === mesAtual && d.periodo.de === mesAtual + '-01' && d.periodo.ate === U.dia(0) && d.periodo.parcial === true && d.serieSeguidores.length >= 2 && Array.isArray(d.semanas) && d.posts.length >= 1, [d.periodo, d.serieSeguidores.length, d.semanas.length, d.posts.length]);
  t('semanas trazidas tocam o mês e começam no domingo', d.semanas.length >= 1 && d.semanas.every(s => new Date(s.inicio + 'T12:00:00Z').getUTCDay() === 0 && s.fim >= mesAtual + '-01'));
  const dv = await G.get(`/instagram/relatorio?mes=${mesVazio}`);
  t('mês sem dados: listas vazias, métricas nulas e nada inventado', dv.posts.length === 0 && dv.serieSeguidores.length === 0 && dv.atual === null && dv.periodo.parcial === false);
  t('sem login: 401', (await fetch(U.B + `/instagram/relatorio.pdf?mes=${mesAtual}`)).status === 401);
  // ---- PDF ----
  const pdfApi = (q, h = G.H) => fetch(U.B + '/instagram/relatorio.pdf?' + q, { headers: h });
  const r = await pdfApi('mes=' + mesAtual); const buf = Buffer.from(await r.arrayBuffer()); const arq = os.tmpdir() + '/rel-ig.pdf'; fs.writeFileSync(arq, buf);
  t('PDF: 200, application/pdf, anexo com nome do mês, sem cache', r.status === 200 && /application\/pdf/.test(r.headers.get('content-type')) && new RegExp(`attachment; filename="Relatorio-Mensal-Instagram_${mesAtual}\\.pdf"`).test(r.headers.get('content-disposition')) && r.headers.get('cache-control') === 'no-store' && buf.subarray(0, 5).toString() === '%PDF-');
  const info = sh(`pdfinfo ${arq}`), txt = sh(`pdftotext -layout ${arq} -`);
  t('PDF A4 (595×842 pt) com páginas numeradas', /Page size:\s+595\.\d+ x 841\.\d+ pts \(A4\)/.test(info) && /Página 1 de \d+/.test(txt.replace(/Pagina/g, 'Página')), info.split('\n').filter(l => /Pages|Page size/.test(l)));
  t('PDF: cabeçalho, mês, período exato e perfil', /Relatório Mensal - Instagram/.test(txt) && /de 20\d\d/.test(txt) && new RegExp(`Período: 01/${mesAtual.slice(5)}/${mesAtual.slice(0, 4)} a ${U.dia(0).split('-').reverse().join('/')} \\(mês em andamento\\)`).test(txt) && /@/.test(txt));
  t('PDF: indicadores, gráficos e seções do layout aprovado', ['Resumo do mês', 'Seguidores', 'Alcance', 'Evolução de seguidores', 'Alcance e visualizações', 'Desempenho por tipo de conteúdo', 'Interações por tipo de conteúdo', 'Melhores conteúdos do mês', 'Resumo geral do mês'].every(k => txt.includes(k)), txt.slice(0, 200));
  t('PDF: números em pt-BR e acentuação correta', /\d{1,3}(\.\d{3})+/.test(txt) && /Visualizações/.test(txt) && /Compartilhamentos/.test(txt));
  const nImg = Number(sh(`pdfimages -list ${arq} | tail -n +3 | wc -l`).trim());
  t('PDF: logo e miniaturas reais das melhores publicações como imagens', nImg >= 4, nImg);
  const pg = Number((/Pages:\s+(\d+)/.exec(info) || [])[1]);
  t('PDF paginado de verdade (nada de uma página única comprimida)', pg >= 2, pg);
  const rv = await pdfApi('mes=' + mesVazio); const bv = Buffer.from(await rv.arrayBuffer()); fs.writeFileSync(os.tmpdir() + '/rel-ig-vazio.pdf', bv);
  const tv = sh(`pdftotext ${os.tmpdir()}/rel-ig-vazio.pdf -`);
  t('PDF de mês sem dados: gera, avisa que as métricas não foram carregadas e não inventa publicações', rv.status === 200 && /não foram carregadas/.test(tv.replace(/\s+/g, ' ')) && /Nenhuma publicação sincronizada/.test(tv.replace(/\s+/g, ' ')));
  t('mês inválido cai no mês atual (sem erro)', (await pdfApi('mes=abc')).status === 200);
  t('Equipe também baixa o relatório (consulta)', (await pdfApi('mes=' + mesAtual, E.H)).status === 200);
  t('POST no PDF não é aceito', (await fetch(U.B + '/instagram/relatorio.pdf?mes=' + mesAtual, { method: 'POST', headers: G.H, body: '{}' })).status >= 400);
  // ---- telas ----
  const dir = process.env.CAPTURAS; if (dir) { fs.mkdirSync(dir, { recursive: true }); sh(`pdftoppm -r 70 -png ${arq} ${dir}/pdf-instagram`); }
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    await p.goto(U.BASE + `/relatorio-instagram.html?mes=${mesAtual}`); await p.waitForSelector('.rel', { timeout: 15000 }); await p.waitForTimeout(900);
    const logo = await p.$eval('.cab .logo', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
    t(`${nome}: logo pequena no cabeçalho (altura ≤ 50 px, largura ≤ 180 px), sem distorcer`, logo[1] <= 50 && logo[0] <= 180 && logo[0] > 40, logo);
    const rod = await p.$eval('.rodape img', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
    t(`${nome}: logo do rodapé também limitada`, rod[1] <= 32 && rod[0] <= 125, rod);
    const tx = await p.innerText('main');
    t(`${nome}: título, mês e período exato`, /Relatório Mensal — Instagram/.test(tx) && /de 20\d\d/.test(tx) && /01\/\d\d\/20\d\d a \d\d\/\d\d\/20\d\d \(mês em andamento\)/.test(tx));
    t(`${nome}: indicadores e comparação com o mês anterior`, (await p.$$('.kpis .k')).length >= 4 && /Resumo geral do mês/.test(tx) && /Mês atual × mês anterior|mês anterior/.test(tx));
    t(`${nome}: gráficos (seguidores, alcance/visualizações, tipo de conteúdo e interações)`, (await p.$$('.card svg')).length >= 3 && /Desempenho por tipo de conteúdo/.test(tx) && /Interações por tipo de conteúdo/.test(tx));
    t(`${nome}: melhores conteúdos com miniatura ou “Sem imagem” (nunca inventados)`, (await p.$$('.top .t')).length >= 1 && (await p.$$('.top .t')).length <= 5);
    t(`${nome}: sem rolagem horizontal`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await p.evaluate(() => { window.__imp = 0; window.print = () => { window.__imp++; }; });
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#baixar')]);
    t(`${nome}: Baixar PDF baixa o arquivo direto, sem abrir impressão`, new RegExp(`^Relatorio-Mensal-Instagram_${mesAtual}\\.pdf$`).test(dl.suggestedFilename()) && (await p.evaluate(() => window.__imp)) === 0 && (await p.$$('#imprime')).length === 0);
    await p.fill('#mes', mesVazio); await p.dispatchEvent('#mes', 'change'); await p.waitForTimeout(1200);
    t(`${nome}: o mês escolhido governa tudo (mês sem dados)`, /Janeiro de 2025/.test(await p.innerText('main')) && /Nenhuma publicação sincronizada/.test(await p.innerText('main')));
    await p.fill('#mes', mesAtual); await p.dispatchEvent('#mes', 'change'); await p.waitForSelector('.top .t', { timeout: 10000 });
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
    if (dir) { await p.addStyleTag({ content: 'html,body{height:auto!important}' }); await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: `${dir}/relatorio-instagram-${nome}.png`, fullPage: true }); }
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
