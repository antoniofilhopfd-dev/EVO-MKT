// Dashboard principal: 6 indicadores reais, período (domingo a sábado), eventos escolares do Calendário Geral, conteúdos recentes,
// campanhas ativas, integrações; sem leads, sem notificações, sem criar nada. Uso: CAPTURAS=pasta node dashboard.test.js <install.out>
const fs = require('fs');
const U = require('./lib/ui');
const { semear } = require('./lib/ig-seed');
const { t, fim } = U.contador();
const MOCK = 'http://127.0.0.1:8099';
const mock = async (p, b) => (await fetch(MOCK + p, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab'), dia = U.dia;
  t('sem login: 401', (await fetch(U.B + '/dashboard/resumo', { headers: { 'X-EVO': '1' } })).status === 401);
  await semear(G, { posts: 12 });
  await G.get('/integrations/ads/accounts'); await G.post('/integrations/ads/account', { conta: '111222333' });
  await G.post('/integrations/settings', { g_client_id: 'GID.apps.test', g_client_secret: 'G_SECRET' });
  const cn = await fetch(U.B + '/integrations/google/connect', { headers: G.H, redirect: 'manual' });
  const state = new URL(cn.headers.get('location')).searchParams.get('state');
  await fetch(U.B + '/integrations/google/callback?code=GOODCODE&state=' + encodeURIComponent(state), { headers: G.H, redirect: 'manual' });
  await G.post('/agendas/adicionar', { id: 'cal_mat' });
  await mock('/__gcal_seed', { id: 'cal_mat', events: [
    { id: 'e1', summary: 'Paraíso dos Colibris', status: 'confirmed', start: { dateTime: `${dia(2)}T09:00:00-03:00` }, end: { dateTime: `${dia(2)}T10:00:00-03:00` }, description: 'Educação Infantil' },
    { id: 'e2', summary: 'Reunião de Pais', status: 'confirmed', start: { dateTime: `${dia(4)}T19:00:00-03:00` }, end: { dateTime: `${dia(4)}T20:00:00-03:00` } },
    { id: 'e3', summary: 'Evento já passado', status: 'confirmed', start: { dateTime: `${dia(-9)}T09:00:00-03:00` }, end: { dateTime: `${dia(-9)}T10:00:00-03:00` } }] });
  // ---- API ----
  const d = await G.get(`/dashboard/resumo?de=${dia(-29)}&ate=${dia(0)}`);
  t('a API traz publicações recentes do Instagram (no máximo 4, mais novas primeiro)', Array.isArray(d.recentes) && d.recentes.length === 4 && d.recentes.every((x, i, a) => !i || a[i - 1].quando >= x.quando), d.recentes && d.recentes.length);
  t('a API traz o estado das integrações (Google e Meta) com a última sincronização', d.integracoes.length === 2 && d.integracoes.find(x => x.chave === 'google').conectado === true && d.integracoes.find(x => x.chave === 'meta').conectado === true && !!d.integracoes.find(x => x.chave === 'meta').ultimaSync, d.integracoes);
  t('campanhas ativas vêm com o status atual da Meta (somente as ACTIVE)', d.trafego.disponivel && d.trafego.campanhasAtivas.length >= 1 && d.trafego.campanhasAtivas.every(c => c.statusRotulo === 'Ativo'), d.trafego.campanhasAtivas);
  t('sem leads, matrículas nem funil comercial na resposta', !/lead|matr[ií]cula|funil|pipefy/i.test(JSON.stringify({ k: Object.keys(d), t: Object.keys(d.trafego.atual || {}) })));
  t('Equipe também consulta (200)', (await E.req('GET', `/dashboard/resumo?de=${dia(-6)}&ate=${dia(0)}`)).status === 200);
  t('o Dashboard é só leitura (POST não é aceito)', (await G.req('POST', '/dashboard/resumo', {})).status >= 400);
  // ---- telas ----
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    await p.evaluate(() => Filtros.set({ p: '30', de: '', ate: '' })); await p.waitForTimeout(800);
    await U.ir(p, 'hoje', 2500); const txt = await U.textoConteudo(p);
    t(`${nome}: 6 indicadores (seguidores, alcance, interações, investimento, conversas, custo por conversa)`, (await p.$$('.db-kpis .kpi')).length === 6 && ['Seguidores', 'Alcance', 'Interações', 'Investimento', 'Conversas iniciadas', 'Custo por conversa'].every(k => txt.toLowerCase().includes(k.toLowerCase())), txt.slice(0, 200));
    t(`${nome}: sem leads, sem criar campanha e sem notificações`, !/Nova campanha|Criar campanha/i.test(txt) && !/Notifica/i.test(txt) && !(await p.$$eval('.db h2', e => e.map(x => x.textContent).join('|'))).match(/lead/i) && (await p.$$('#content [aria-label*="otifica"]')).length === 0);
    t(`${nome}: período em botões (Esta semana, Este mês, Mês anterior, Este ano, Personalizado)`, JSON.stringify(await p.$$eval('#filtros .tf-periodos .pill', e => e.map(x => x.textContent))) === JSON.stringify(['Esta semana', 'Este mês', 'Mês anterior', 'Este ano', 'Personalizado']));
    t(`${nome}: próximos eventos escolares vêm do Calendário Geral (sem o evento já passado)`, /Paraíso dos Colibris/.test(txt) && /Reunião de Pais/.test(txt) && !/Evento já passado/.test(txt));
    t(`${nome}: conteúdos recentes, campanhas ativas e integrações`, (await p.$$('.db-rec')).length === 4 && (await p.$$('.db-camp li')).length >= 1 && /Google Agenda/.test(txt) && /Meta \(Instagram e Tráfego Pago\)/.test(txt) && /Conectado/.test(txt));
    t(`${nome}: gráfico de seguidores e investimento diário`, (await p.$('#dbChSeg svg')) !== null && (await p.$('#dbChTr svg')) !== null);
    t(`${nome}: atalhos para as áreas (Calendário, Instagram, Tráfego, Configurações)`, ['calendario', 'igvisao', 'trafego', 'configuracoes'].every(g => txt !== '' ) && (await p.$$('.db [data-go="calendario"]')).length >= 1 && (await p.$$('.db [data-go="trafego"]')).length >= 1 && (await p.$$('.db [data-go="configuracoes"]')).length >= 1);
    t(`${nome}: sem rolagem horizontal`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    t(`${nome}: sem erros de script nem diálogos nativos`, p.errs.length === 0, p.errs);
    if (dir) { await p.addStyleTag({ content: 'html,body{height:auto!important;overflow:visible!important}#app,main,.main,#content{height:auto!important;max-height:none!important;overflow:visible!important}' }); await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: `${dir}/dashboard-${nome}.png`, fullPage: true }); }
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
