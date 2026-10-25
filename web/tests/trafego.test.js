// Tráfego Pago: SOMENTE LEITURA. Cálculos dos indicadores a partir de valores absolutos, conversas sem duplicar, períodos, comparação,
// validação, CSV, estados vazios (sem conta, sem permissão), nenhum dado de CRM e nenhuma rota de escrita. Uso: node trafego.test.js <install.out>
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const f = U.dia(-29), a = U.hoje();
  // ---- sem conexão: estado vazio claro, sem números inventados ----
  let r = await G.req('GET', `/trafego/resumo?de=${f}&ate=${a}`);
  t('sem Meta conectada: erro claro (409), sem dados simulados', r.status === 409 && /Meta/.test((await r.json()).error));
  let est = await G.get('/trafego/estado');
  t('estado informa que não está conectado', est.conectado === false && est.fuso === 'America/Fortaleza' && /^\d{4}-\d{2}-\d{2}$/.test(est.hoje), est);
  await G.post('/integrations/settings', { meta_app_id: 'APPID', meta_app_secret: 'META_SECRET' });
  await G.post('/integrations/meta/token', { token: 'GOOD_TOKEN' });
  r = await G.req('GET', `/trafego/resumo?de=${f}&ate=${a}`);
  t('conectado, mas sem conta de anúncios escolhida: pede para escolher (409)', r.status === 409 && /conta de anúncios/i.test((await r.json()).error));
  const contas = (await G.get('/integrations/ads/accounts')).contas;
  await G.post('/integrations/ads/account', { conta: contas[0].id });
  // ---- números ----
  const d = await G.get(`/trafego/resumo?de=${f}&ate=${a}`);
  const A = d.atual;
  t('investimento = soma das campanhas', Math.abs(A.investimento - 2084.56) < 0.005, A);
  t('impressões e cliques somados', A.impressoes === 127000 && A.cliques === 2920);
  t('CTR recalculado dos absolutos (cliques ÷ impressões), não média das médias', Math.abs(A.ctr - (2920 / 127000) * 100) < 1e-9, A.ctr);
  t('CPC recalculado dos absolutos (investimento ÷ cliques)', Math.abs(A.cpc - 2084.56 / 2920) < 1e-9, A.cpc);
  t('conversas iniciadas contadas uma vez (não soma lead, nem repete variações)', A.conversas === 20, A.conversas);
  t('custo por conversa = investimento ÷ conversas', Math.abs(A.custoConversa - 2084.56 / 20) < 1e-9, A.custoConversa);
  const c1 = d.campanhas.find(x => /Matrículas 2027/.test(x.nome));
  t('campanha tem os próprios indicadores recalculados', c1 && Math.abs(c1.ctr - (2100 / 90000) * 100) < 1e-9 && c1.conversas === 20, c1);
  t('total de campanhas bate com a soma das linhas', Math.abs(d.campanhas.reduce((s, x) => s + x.investimento, 0) - A.investimento) < 0.005);
  t('anúncios com status e miniatura (URL https da Meta)', d.anuncios.length >= 3 && d.anuncios.every(x => 'statusRotulo' in x) && d.anuncios.every(x => !x.miniatura || /^https:\/\//.test(x.miniatura)), d.anuncios.map(x => [x.nome, x.miniatura]));
  t('evolução diária cobre todos os dias do período', d.diario.dias.length === 30 && d.diario.dias[0] === f && d.diario.dias[29] === a && d.diario.total.length === 30);
  t('período anterior equivalente (mesma duração, termina na véspera)', d.anterior.ate === U.dia(-30) && d.anterior.de === U.dia(-59), d.anterior);
  t('variação traz tipo e percentual', d.variacoes.investimento && ['subiu', 'caiu', 'estavel', 'novo', 'sem'].includes(d.variacoes.investimento.tipo));
  t('origem informa fonte, período, versão da API e natureza', d.origem.fonte && d.origem.periodo === `${f} a ${a}` && d.origem.versaoApi && d.origem.natureza, d.origem);
  t('destaques: melhor, pior e quem mais gastou (com amostra)', d.destaques.maisGastou && d.destaques.maisGastou.investimento >= 1234 && 'melhorCampanha' in d.destaques);
  t('sem leads, matrículas, Pipefy nem funil comercial na resposta', !/lead|matr[ií]cula|pipefy|funil/i.test(JSON.stringify({ k: Object.keys(d), a: Object.keys(A) })), Object.keys(A));
  // ---- períodos e validação ----
  const ruim = async (n, q) => t(n, (await G.req('GET', '/trafego/resumo?' + q)).status === 400);
  await ruim('data inicial depois da final é recusada', `de=${a}&ate=${f}`);
  await ruim('data inexistente é recusada', 'de=2026-02-30&ate=2026-03-01');
  await ruim('formato de data inválido é recusado', "de=abc&ate=2026-03-01");
  await ruim('data no futuro é recusada', `de=${a}&ate=${U.dia(5)}`);
  await ruim('período acima de 400 dias é recusado', `de=${U.dia(-400)}&ate=${a}`);
  await ruim('injeção no parâmetro é recusada', "de=2026-01-01'%20OR%20'1'='1&ate=2026-01-02");
  for (const [n, de, ate] of [['hoje', a, a], ['7 dias', U.dia(-6), a], ['mês atual', a.slice(0, 8) + '01', a]]) { const x = await G.req('GET', `/trafego/resumo?de=${de}&ate=${ate}`); t(`período “${n}” é aceito`, x.status === 200); }
  const sem = await G.get(`/trafego/resumo?de=${U.dia(-6)}&ate=${a}`);
  t('comparação do período de 7 dias usa os 7 dias anteriores', sem.anterior.ate === U.dia(-7) && sem.anterior.de === U.dia(-13), sem.anterior);
  // ---- CSV ----
  const csv = await G.req('GET', `/trafego/csv?de=${f}&ate=${a}`); const buf = Buffer.from(await csv.arrayBuffer()); const tx = buf.toString('utf8');
  t('CSV de campanhas com BOM, totais e vírgula decimal', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type')) && tx.startsWith('﻿') && /TOTAL/.test(tx) && /2084,56/.test(tx), tx.slice(0, 300));
  const csv2 = await (await G.req('GET', `/trafego/csv?nivel=anuncios&de=${f}&ate=${a}`)).text();
  t('CSV de anúncios', /"Anúncio";"Campanha";"Status"/.test(csv2) && /TOTAL/.test(csv2));
  // ---- somente leitura ----
  const escritas = [];
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) for (const u of ['/trafego/resumo', '/trafego/estado', '/trafego/conta', '/trafego/csv']) { const x = await G.req(m, u, m === 'DELETE' ? undefined : {}); if (x.status !== 405) escritas.push(`${m} ${u}:${x.status}`); }
  t('toda escrita nas rotas do Tráfego responde 405', escritas.length === 0, escritas);
  const antigas = [];
  for (const [m, u] of [['POST', '/ads/campanha'], ['POST', '/ads/criar'], ['POST', '/ads/status'], ['POST', '/ads/orcamento'], ['PUT', '/ads/anuncio'], ['DELETE', '/ads/anuncio'], ['POST', '/ads/impulsionar'], ['POST', '/ads/pausar-tudo'], ['POST', '/ads/regras'], ['GET', '/ads/arvore'], ['GET', '/ads/gerenciador']]) { const x = await G.req(m, u, m === 'GET' || m === 'DELETE' ? undefined : {}); if (![404, 405].includes(x.status)) antigas.push(`${m} ${u}:${x.status}`); }
  t('rotas antigas de criar, editar, ativar, pausar e impulsionar anúncios não existem (404/405)', antigas.length === 0, antigas);
  t('Equipe consulta o Tráfego (200)', (await E.req('GET', `/trafego/resumo?de=${f}&ate=${a}`)).status === 200);
  t('sem login: 401', (await fetch(U.B + `/trafego/resumo?de=${f}&ate=${a}`)).status === 401);
  // ---- token expirado e falta de permissão ----
  await G.post('/integrations/meta/disconnect', {});
  r = await G.req('GET', `/trafego/resumo?de=${f}&ate=${a}&forcar=1`);
  t('depois de desconectar: erro claro e sem token na resposta', r.status === 409 && !/GOOD_TOKEN|access_token/.test(await r.text()));
  // ---- tela ----
  await G.post('/integrations/meta/token', { token: 'GOOD_TOKEN' });
  await G.get('/integrations/ads/accounts'); // recarrega a lista de contas depois de reconectar
  await G.post('/integrations/ads/account', { conta: contas[0].id });
  const b = await U.abrir(); const p = await U.pagina(b, 'NAT-3301', G.nova);
  await U.ir(p, 'trafego', 1500); let txt = await U.textoConteudo(p);
  t('Visão Geral mostra os 8 indicadores, evolução e a origem', ['Investimento', 'Impressões', 'Alcance', 'Cliques', 'CTR médio', 'CPC médio', 'Conversas iniciadas', 'Custo por conversa'].every(k => new RegExp(k, 'i').test(txt)) && /Evolução no período/.test(txt) && (await p.$('.origem-btn')) !== null, txt.slice(0, 300));
  t('a tela não oferece criar, editar, ativar nem pausar', !/Criar campanha|Pausar|Ativar|Editar orçamento|Impulsionar/i.test(txt) && /somente consulta/i.test(txt));
  t('exatamente três abas: Visão Geral, Desempenho e Relatórios', JSON.stringify(await p.$$eval('#subtabs .subtab', e => e.map(x => x.textContent))) === JSON.stringify(['Visão Geral', 'Desempenho', 'Relatórios']));
  t('filtro de período do Tráfego: Esta semana, Este mês, Mês anterior, Este ano e Personalizado', JSON.stringify(await p.$$eval('#filtros .tf-periodos .pill', e => e.map(x => x.textContent))) === JSON.stringify(['Esta semana', 'Este mês', 'Mês anterior', 'Este ano', 'Personalizado']));
  t('a semana mostra o número e vai de domingo a sábado', /Semana \d+/.test(txt) && /Dom, \d+ \w+ – Sáb, \d+ \w+/.test(txt), txt.slice(0, 200));
  // evolução: estilo e granularidade não mudam o total
  const totalTab = async () => (await p.$eval('#tfTempoTabela tfoot', e => e.innerText)).replace(/\s+/g, ' ');
  await p.evaluate(() => { document.querySelector('.tf-visao details summary').click(); });
  const t0 = await totalTab();
  await p.selectOption('#tfVEst', 'barras'); await p.waitForTimeout(200);
  t('estilo Barras desenha colunas', (await p.$$('#tfTempo svg rect')).length > 0);
  await p.selectOption('#tfVEst', 'area'); await p.waitForTimeout(200);
  t('estilo Área desenha o preenchimento', (await p.$$('#tfTempo svg polygon')).length === 1);
  await p.selectOption('#tfVModo', 'semana'); await p.waitForTimeout(200);
  t('agrupar por semana mantém o mesmo total do período', (await totalTab()) === t0 && /Semana \d+/.test(await p.innerText('#tfTempoTabela')), [t0, await totalTab()]);
  await p.selectOption('#tfVModo', 'mes'); await p.waitForTimeout(200);
  t('agrupar por mês mantém o mesmo total do período', (await totalTab()) === t0);
  t('há investimento e resultado por segmento e a tabela de campanhas ao final', (await p.$('#tfRoscaSeg svg')) !== null && /Total \(\d+ campanha/.test(await p.innerText('#tfVisCampanhas')));
  // ---- Desempenho ----
  await U.ir(p, 'tfdesempenho', 900); txt = await U.textoConteudo(p);
  t('Desempenho: campanha → conjunto → anúncio na mesma aba', JSON.stringify(await p.$$eval('[data-tf-nivel]', e => e.map(x => x.textContent))) === JSON.stringify(['Campanhas', 'Conjuntos', 'Anúncios']) && /Total \(\d+\)/.test(txt));
  await p.click('[data-tf-abre]'); await p.waitForTimeout(400);
  t('clicar numa campanha abre os conjuntos dela (filtro, sem nova aba)', (await p.$eval('[data-tf-nivel].on', e => e.textContent)) === 'Conjuntos' && /Todas as campanhas/.test(await p.innerText('.tf-migalha')));
  await p.click('[data-tf-abre]'); await p.waitForTimeout(400);
  t('clicar num conjunto abre os anúncios, com a foto real do criativo', (await p.$eval('[data-tf-nivel].on', e => e.textContent)) === 'Anúncios' && (await p.$$('[data-tffoto]')).length >= 1);
  await p.click('[data-tf-lim="tudo"]'); await p.click('[data-tf-nivel="anuncios"]'); await p.waitForTimeout(300);
  const nAn = (await p.$$('#tfDes tbody tr')).length;
  t('Anúncios: foto quando existe e texto “Sem imagem” quando a Meta não informa', (await p.$$('[data-tffoto]')).length >= 1 && /Sem imagem/.test(await p.innerText('#tfDes tbody')) && nAn >= 3);
  await p.click('[data-tf-abre]:text("Vídeo depoimento")'); await p.waitForSelector('.tf-det', { timeout: 5000 });
  t('detalhe do anúncio mostra campanha, conjunto e a mesma peça em outra campanha sem misturar', /Conjunto matrículas/.test(await p.innerText('.tf-det')) && /também roda em outras campanhas/.test(await p.innerText('body')) && /Cartaz antigo/.test(await p.innerText('body')) , (await p.innerText('body')).slice(-300));
  await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelector('[data-close]')?.click()); await p.waitForTimeout(200);
  await p.selectOption('#tfdStatus', 'problemas'); await p.waitForTimeout(300);
  t('filtro de status usa o status atual da Meta (reprovado aparece em problemas)', /Cartaz antigo/.test(await p.innerText('#tfDes tbody')) && (await p.$$('#tfDes tbody tr')).length === 1);
  await p.click('#tfdLimpar'); await p.fill('#tfdBusca', 'carrossel'); await p.waitForTimeout(600);
  t('busca filtra por nome', (await p.$$('#tfDes tbody tr')).length === 1);
  await p.click('#tfdLimpar'); await p.fill('#tfdBusca', 'zzzz'); await p.waitForTimeout(600);
  t('sem resultado: estado vazio claro', /Nenhum resultado com estes filtros/.test(await p.innerText('#tfDes')));
  await p.click('#tfdLimpar'); await p.waitForTimeout(200);
  await p.click('[data-tf-ord="investimento"]'); await p.waitForTimeout(200);
  t('ordenação por coluna (crescente depois de clicar de novo)', (await p.$eval('[data-tf-ord="investimento"]', e => e.closest('th').getAttribute('aria-sort'))) === 'ascending');
  // ---- Relatórios (somente Relatório Geral) ----
  await U.ir(p, 'tfrelatorios', 1500); txt = await U.textoConteudo(p);
  t('Relatórios: sem seletor de tipos (só o Relatório Geral)', !/Relatório por (campanha|conjunto|anúncio|segmento)/.test(txt) && (await p.$$('input[name="tfRelTipo"]')).length === 0 && /Relatório geral/.test(txt));
  t('Relatórios: Período do relatório no formulário com os cinco períodos', JSON.stringify(await p.$$eval('.tfr-per .pill', e => e.map(x => x.textContent))) === JSON.stringify(['Esta semana', 'Este mês', 'Mês anterior', 'Este ano', 'Personalizado']) && /Data inicial/.test(txt) && /Data final/.test(txt));
  t('Relatórios: datas em dd/mm/aaaa e comparação de mesma duração', /^\d{2}\/\d{2}\/\d{4}$/.test(await p.inputValue('#tfrDe')) && /^\d{2}\/\d{2}\/\d{4}$/.test(await p.inputValue('#tfrAte')) && /período anterior de mesma duração|Comparação com o período anterior de mesma duração/.test(txt));
  const quadro = async () => { await p.waitForFunction(() => { const r = document.querySelector('#tfrPrevia')?.shadowRoot; return r && r.querySelector('.pg'); }, null, { timeout: 20000 }); return { evaluate: () => p.evaluate(() => document.querySelector('#tfrPrevia').shadowRoot.querySelector('.previa-pg').innerText) }; };
  const fr = await quadro(); const ftxt = await fr.evaluate();
  t('prévia: indicadores, evolução, resumo das campanhas e detalhamento dos anúncios', /Indicadores do período/.test(ftxt) && /Evolução no período/.test(ftxt) && /Resumo das campanhas/.test(ftxt) && /Detalhamento dos anúncios/.test(ftxt));
  t('prévia: datas pt-BR, reais e % com vírgula, dois intervalos visíveis', /R\$ [\d.]+,\d{2}/.test(ftxt) && /\d+,\d{2}%/.test(ftxt) && /Comparado a \d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}/.test(ftxt));
  t('sem “Imprimir”, “Salvar como PDF” nem window.print na aba', !/Imprimir|Salvar como PDF/i.test(await U.textoConteudo(p)) && (await p.$('#tfrPdf')) !== null);
  // datas editáveis: validação e período personalizado
  await p.fill('#tfrDe', '31/02/2026'); await p.click('#tfrAplicar'); await p.waitForTimeout(300);
  t('data inexistente é recusada com mensagem', /dd\/mm\/aaaa/.test(await p.innerText('#tfrErro')));
  await p.fill('#tfrDe', '10/10/2026'); await p.fill('#tfrAte', '05/10/2026'); await p.click('#tfrAplicar'); await p.waitForTimeout(300);
  t('início depois do fim é recusado', /não pode ser depois/.test(await p.innerText('#tfrErro')));
  await p.fill('#tfrAte', '30/12/2099'); await p.click('#tfrAplicar'); await p.waitForTimeout(300);
  t('data final no futuro é recusada', /futuro/.test(await p.innerText('#tfrErro')));
  const d1 = U.dia(-20).split('-').reverse().join('/'), d2 = U.dia(-4).split('-').reverse().join('/');
  await p.fill('#tfrDe', d1); await p.fill('#tfrAte', d2); await p.click('#tfrAplicar'); await p.waitForTimeout(1500);
  t('datas válidas viram período personalizado e a prévia acompanha', (await p.$eval('#tfrPers', e => e.classList.contains('on'))) && (await p.inputValue('#tfrDe')) === d1 && (await p.inputValue('#tfrAte')) === d2 && new RegExp(d1.replace(/\//g, '\\/') + ' a ' + d2.replace(/\//g, '\\/')).test(await p.innerText('.tf-rel-previa .db-tit')));
  // recorte semanal: habilitado com 7 dias ou mais
  t('recorte semanal habilitado em 17 dias', (await p.$eval('#tfrSem', e => !e.disabled)));
  await p.check('#tfrSem'); await p.waitForTimeout(1200); await quadro();
  const semTxt = await p.evaluate(() => document.querySelector('#tfrPrevia').shadowRoot.querySelector('.previa-pg').innerText);
  t('recorte semanal: tabela de semanas (dom–sáb) com total igual ao do período', /Recorte semanal/.test(semTxt) && /Semana \d+/.test(semTxt));
  const dSem = await G.get(`/trafego/resumo?de=${U.dia(-20)}&ate=${U.dia(-4)}&tipo=x`);
  const totSemana = (semTxt.match(/TOTAL[^\n]*\n?[^\n]*/g) || []).join(' ');
  t('o recorte semanal não muda os totais do período', semTxt.includes(dSem.atual.investimento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })), dSem.atual.investimento);
  await p.fill('#tfrDe', U.dia(-3).split('-').reverse().join('/')); await p.fill('#tfrAte', U.dia(-1).split('-').reverse().join('/')); await p.click('#tfrAplicar'); await p.waitForTimeout(1500);
  t('com menos de 7 dias o recorte semanal fica desabilitado e explica o motivo', (await p.$eval('#tfrSem', e => e.disabled)) && /a partir de 7 dias/.test(await U.textoConteudo(p)));
  await p.click('[data-tfr-p="mes"]'); await p.waitForTimeout(1500); await quadro();
  await p.selectOption('#tfrStatus', 'ativos'); await p.waitForTimeout(1200);
  await p.waitForTimeout(1500); const fr3 = await quadro(); const t3 = await fr3.evaluate();
  t('o filtro de status vale na pré-visualização (recorte filtrado avisado)', /Recorte filtrado/.test(t3) && /com filtros/.test(await p.innerText('.tf-rel-previa .db-tit')), [/Recorte filtrado/.test(t3), await p.innerText('.tf-rel-previa .db-tit'), t3.slice(-300)]);
  await p.selectOption('#tfrStatus', 'todos'); await p.waitForTimeout(800);
  // ---- Baixar PDF: download direto, sem impressão ----
  await p.evaluate(() => { window.__imprimiu = 0; window.print = () => { window.__imprimiu++; }; });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#tfrPdf')]);
  const arq = require('os').tmpdir() + '/rel-trafego.pdf'; await dl.saveAs(arq);
  t('Baixar PDF baixa um arquivo .pdf com nome legível e datas, sem abrir impressão', /^Relatorio-Trafego-Pago_\d{2}-\d{2}-\d{4}_a_\d{2}-\d{2}-\d{4}\.pdf$/.test(dl.suggestedFilename()) && (await p.evaluate(() => window.__imprimiu)) === 0, dl.suggestedFilename());
  const bufPdf = require('fs').readFileSync(arq);
  t('o arquivo é um PDF A4 de verdade', bufPdf.subarray(0, 5).toString() === '%PDF-' && /MediaBox \[0 0 595\.28 841\.89\]/.test(bufPdf.toString('latin1')));
  const sh = (c) => require('child_process').execFileSync('bash', ['-c', c], { encoding: 'utf8' });
  const pdfTxt = sh(`pdftotext -layout ${arq} -`); const pdfInfo = sh(`pdfinfo ${arq}`);
  t('PDF: título, período, comparação, indicadores, campanhas e anúncios com fotos', /Relatório geral/.test(pdfTxt) && /Comparado a \d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}/.test(pdfTxt) && /Investimento/.test(pdfTxt) && /Resumo das campanhas/.test(pdfTxt) && /Detalhamento dos anúncios/.test(pdfTxt) && /Vídeo depoimento/.test(pdfTxt) && /Pages:\s+\d+/.test(pdfInfo), pdfTxt.slice(0, 300));
  t('PDF: acentuação correta, R$ e datas em pt-BR, página X de Y', /Conversas iniciadas/.test(pdfTxt) && /R\$ [\d.]+,\d{2}/.test(pdfTxt) && /Página 1 de \d+/.test(pdfTxt.replace(/Pagina/g, 'Página')));
  const nImg = sh(`pdfimages -list ${arq} | tail -n +3 | wc -l`).trim();
  t('PDF: logo e fotos reais dos anúncios embutidas como imagens (não só texto)', Number(nImg) >= 2, nImg);
  // servidor: mesmos filtros, validação e permissões
  const pdfApi = async (q, h = G.H) => fetch(U.B + '/trafego/relatorio.pdf?' + q, { headers: h });
  const qBase = `de=${f}&ate=${a}&tipo=x`;
  const rA = await pdfApi(qBase + '&semanal=1&status=ativos'); const bA = Buffer.from(await rA.arrayBuffer());
  t('API do PDF: 200, application/pdf, anexo com nome e sem cache', rA.status === 200 && /application\/pdf/.test(rA.headers.get('content-type')) && /attachment; filename="Relatorio-Trafego-Pago_/.test(rA.headers.get('content-disposition')) && rA.headers.get('cache-control') === 'no-store' && bA.subarray(0, 5).toString() === '%PDF-');
  require('fs').writeFileSync(require('os').tmpdir() + '/rel-filtrado.pdf', bA); t('API do PDF: com filtro de status o recorte é avisado no arquivo', /Recorte filtrado/.test(sh(`pdftotext ${require('os').tmpdir()}/rel-filtrado.pdf -`)));
  t('API do PDF: filtros inválidos 400, sem login 401, Equipe consulta 200', (await pdfApi(qBase + '&status=xx')).status === 400 && (await pdfApi(qBase + '&segmento=XX')).status === 400 && (await pdfApi(qBase + '&campanha=a%27b')).status === 400 && (await fetch(U.B + '/trafego/relatorio.pdf?' + qBase)).status === 401 && (await pdfApi(qBase, E.H)).status === 200);
  t('API do PDF: POST recusado (somente leitura)', (await fetch(U.B + '/trafego/relatorio.pdf?' + qBase, { method: 'POST', headers: G.H, body: '{}' })).status === 405);
  t('API do PDF: período inválido 400 (futuro)', (await pdfApi(`de=${a}&ate=${U.dia(5)}&tipo=x`)).status === 400);
  t('o PDF A4 abre com o período escolhido', (await p.evaluate(async () => (await fetch('/relatorio-trafego.html')).status)) === 200);
  // ---- capturas reais (desktop e tablet) quando CAPTURAS=pasta ----
  if (process.env.CAPTURAS) {
    const fs = require('fs'); fs.mkdirSync(process.env.CAPTURAS, { recursive: true });
    const foto = async (pg, nome) => { await pg.addStyleTag({ content: 'html,body{height:auto!important;overflow:visible!important}#app,main,.main,#content{height:auto!important;max-height:none!important;overflow:visible!important}' }); await pg.evaluate(() => window.scrollTo(0, 0)); await pg.screenshot({ path: `${process.env.CAPTURAS}/${nome}.png`, fullPage: true }); };
    sh(`pdftoppm -r 70 -png ${arq} ${process.env.CAPTURAS}/pdf-trafego`);
    const b2 = await U.abrir();
    for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180 }]]) {
      const q = await U.pagina(b2, 'NAT-3301', G.nova, vp);
      await U.ir(q, 'trafego', 1800); await foto(q, `visao-geral-${nome}`);
      await U.ir(q, 'tfdesempenho', 1200); await foto(q, `desempenho-campanhas-${nome}`);
      await q.click('[data-tf-nivel="anuncios"]'); await q.waitForTimeout(500); await foto(q, `desempenho-anuncios-${nome}`);
      await U.ir(q, 'tfrelatorios', 2000); await foto(q, `relatorios-${nome}`);
    }
    await b2.close();
  }
  t('sem erros de script nem diálogos nativos', p.errs.length === 0, p.errs);
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
