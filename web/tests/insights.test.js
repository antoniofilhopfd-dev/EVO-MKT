// Insights: melhores horários, ranking, datas e os insights determinísticos (no máximo 3, com amostra mínima, fonte e atalho).
// Uso: node insights.test.js <install.out>
const { execFileSync } = require('child_process');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const sql = q => execFileSync('mariadb', ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N', '-e', q], { encoding: 'utf8' });
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  let r = await G.get('/insights');
  t('sem dados: nenhum insight de desempenho inventado', Array.isArray(r.insights) && r.insights.every(i => i.id === 'producao'), r.insights);
  t('melhores horários: com poucas publicações não calcula', r.horarios.melhor === null && r.horarios.minimo === 8);
  t('a Equipe acessa os insights', (await E.req('GET', '/insights')).status === 200);
  // conta e posts de exemplo
  await G.post('/integrations/meta/token', { token: 'GOOD_TOKEN' });
  const conta = (await G.get('/integrations/status')).instagram.igUserId;
  const ins = (i, ts, tipo, l, c) => sql(`INSERT INTO ig_posts(conta,media_id,publicado_em,tipo,legenda,curtidas,comentarios,salvos,compartilhamentos,permalink,atualizado_em) VALUES('${conta}','p${i}','${ts}','${tipo}','post ${i}',${l},${c},0,0,'https://i/p${i}','x')`);
  const hoje = U.hoje();
  // 10 posts nos últimos dias: Reels (5, bem acima) e Feed (5); terças 12h rendem mais
  for (let i = 0; i < 10; i++) { const d = U.dia(-1 - i); ins(i, `${d}T15:00:00+0000`, i < 5 ? 'REELS' : 'FEED', i < 5 ? 300 : 40, i < 5 ? 20 : 4); }
  const f = `de=${U.dia(-29)}&ate=${hoje}`;
  r = await G.get('/insights?' + f);
  const fmt = r.insights.find(i => i.id === 'formato');
  t('insight de formato aparece com amostra, fonte e atalho', fmt && /Reels/.test(fmt.titulo) && /\d+ de 10/.test(fmt.amostra) && fmt.fonte && fmt.link.pagina === 'igdesempenho', r.insights);
  t('nunca mais de 3 insights', r.insights.length <= 3);
  t('ranking ordenado por interações, com link', r.ranking[0].interacoes === 320 && r.ranking[0].link.startsWith('https://'), r.ranking.slice(0, 2));
  const rf = await G.get(`/insights?${f}&formato=Feed`);
  t('com o filtro de formato Feed, o insight de formato some (amostra insuficiente de formatos)', !rf.insights.some(i => i.id === 'formato'), rf.insights);
  // pendências de produção entram como insight operacional
  await G.post('/data?module=conteudos', { titulo: 'Próxima sem arte', status: 'RASCUNHO', publicacaoEm: U.dia(2) + 'T10:00', perfil: '@evolucaopb', formato: 'Feed' });
  r = await G.get('/insights?' + f);
  t('publicação dos próximos 7 dias sem arte gera insight de produção (prioridade primeiro)', r.insights[0].id === 'producao' && /sem arte/.test(r.insights[0].texto), r.insights);
  // datas
  const d = await E.get('/datas?dias=400'); const tit = d.rows.map(x => x.titulo);
  t('datas: inclui Dia do Professor, Páscoa e Dia das Mães (móveis calculadas)', ['Dia do Professor', 'Páscoa', 'Dia das Mães', 'Dia dos Pais', 'Carnaval'].every(x => tit.includes(x)), tit);
  t('datas: cada item tem "planejar até" 30 dias antes', d.rows.every(x => new Date(x.data + 'T00:00:00Z') - new Date(x.planejarAte + 'T00:00:00Z') === 30 * 86400000));
  // filtros inválidos
  t('período inválido é recusado (400)', (await G.req('GET', '/insights?de=2026-05-10&ate=2026-05-01')).status === 400);
  t('perfil inválido é recusado (400)', (await G.req('GET', '/insights?perfil=@outro')).status === 400);
  fim();
})().catch(e => { console.error(e); process.exit(1); });
