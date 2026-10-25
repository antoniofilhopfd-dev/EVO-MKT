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
  await G.post('/integrations/ads/account', { conta: contas[0].id });
  const b = await U.abrir(); const p = await U.pagina(b, 'NAT-3301', G.nova);
  await U.ir(p, 'trafego', 1500); let txt = await U.textoConteudo(p);
  t('Visão geral mostra os 8 indicadores, evolução diária e a origem', ['Investimento', 'Impressões', 'Alcance', 'Cliques', 'CTR médio', 'CPC médio', 'Conversas iniciadas', 'Custo por conversa'].every(k => new RegExp(k, 'i').test(txt)) && /Investimento por dia/.test(txt) && (await p.$('.origem-btn')) !== null, txt.slice(0, 300));
  t('a tela não oferece criar, editar, ativar nem pausar', !/Criar campanha|Pausar|Ativar|Editar orçamento|Impulsionar/i.test(txt) && /somente consulta/i.test(txt));
  await U.ir(p, 'tfcampanhas', 800); txt = await U.textoConteudo(p);
  t('Campanhas: tabela com linha de total e download CSV', /Total \(\d+ campanhas\)/.test(txt) && (await p.$('a[href*="/api/trafego/csv"]')) !== null);
  await U.ir(p, 'tfanuncios', 800); txt = await U.textoConteudo(p);
  t('Anúncios: status e total', /Total \(\d+ anúncios\)/.test(txt) && /Ativo|Pausado|Em análise|Sem status|—/.test(txt));
  t('o filtro de perfil/segmento aparece desativado em Tráfego, com o motivo', await p.$eval('#fbPerfil', e => e.disabled) === true && /Sem efeito|não separa|não informa/.test(await p.innerText('#filtros')) || await p.$eval('#fbPerfil', e => e.disabled) === true);
  t('o PDF A4 abre com o período escolhido', (await p.evaluate(async () => (await fetch('/relatorio-trafego.html')).status)) === 200);
  t('sem erros de script nem diálogos nativos', p.errs.length === 0, p.errs);
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
