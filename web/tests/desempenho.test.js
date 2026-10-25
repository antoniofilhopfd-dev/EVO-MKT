// Medição: carrega o banco com milhares de registros e cronometra as telas mais pesadas das cinco áreas. Falha só se uma resposta passar do limite.
// Uso: node desempenho.test.js <install.out>
const { execFileSync } = require('child_process');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const sql = q => execFileSync('mariadb', ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N'], { encoding: 'utf8', input: q, maxBuffer: 1 << 28 });
(async () => {
  const G = await U.entrar(process.argv[2]);
  // 4.000 publicações e 4.000 posts de Instagram direto no banco
  const hoje = U.hoje();
  const linhas = []; for (let i = 0; i < 4000; i++) { const d = U.dia(-(i % 120)); const o = { id: `CON-9${String(i).padStart(4, '0')}`, titulo: 'Carga ' + i, status: ['IDEIA', 'RASCUNHO', 'EM PRODUÇÃO', 'EM REVISÃO', 'APROVADO', 'PUBLICADO'][i % 6], perfil: i % 2 ? '@evolucaopb' : '@geracaoevolucao', segmento: 'Ensino Médio', formato: 'Feed', publicacaoEm: d + 'T10:00', legenda: 'x'.repeat(200) }; linhas.push(`('conteudos','${o.id}','${JSON.stringify(o)}','x','x')`); }
  sql(`INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES ${linhas.join(',')}`);
  await G.post('/integrations/meta/token', { token: 'GOOD_TOKEN' });
  const conta = (await G.get('/integrations/status')).instagram.igUserId;
  const ps = []; for (let i = 0; i < 4000; i++) ps.push(`('${conta}','c${i}','${U.dia(-(i % 120))}T15:00:00+0000','${i % 3 ? 'FEED' : 'REELS'}','x',${i % 90},${i % 7},0,0,'https://i/${i}','x')`);
  sql(`INSERT INTO ig_posts(conta,media_id,publicado_em,tipo,legenda,curtidas,comentarios,salvos,compartilhamentos,permalink,atualizado_em) VALUES ${ps.join(',')}`);
  const q = `de=${U.dia(-119)}&ate=${hoje}`;
  for (const u of ['/data?module=conteudos', '/content/states', '/dashboard/resumo?' + q, '/instagram/visao?' + q, '/instagram/desempenho?dim=formato&' + q, '/instagram/desempenho?dim=horario&' + q, '/insights?' + q, '/search?q=Carga%201']) {
    const t0 = Date.now(); const r = await G.req('GET', u); await r.text(); const ms = Date.now() - t0;
    t(`${u.split('?')[0]}${u.includes('dim=') ? '?' + u.split('?')[1].split('&')[0] : ''} responde em até 3000 ms com 4.000 registros (${ms} ms)`, r.status === 200 && ms <= 3000);
  }
  fim();
})().catch(e => { console.error(e); process.exit(1); });
