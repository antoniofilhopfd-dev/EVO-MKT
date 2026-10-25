// Dados de teste do Instagram: duas contas (@evolucaopb e @geracao.evolucao), publicações com miniaturas coloridas e histórico de seguidores.
// SÃO DADOS FICTÍCIOS DE TESTE, usados só para gerar capturas de tela e exercitar a interface.
const { execFileSync } = require('child_process');
const U = require('./ui');
const sql = q => execFileSync('mariadb', ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N'], { encoding: 'utf8', input: q });
const esc = s => String(s).replace(/'/g, "''");
const CORES = [['#063996', '#00A1F3'], ['#FF7800', '#FAB900'], ['#793A8C', '#d6336c'], ['#1f9d55', '#00A1F3'], ['#00275F', '#063996'], ['#d6336c', '#FF7800']];
const mini = (i, rot) => { const [a, b] = CORES[i % CORES.length]; return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="42" r="16" fill="#fff" opacity=".85"/><text x="50" y="82" font-size="11" text-anchor="middle" fill="#fff" font-family="Arial">${rot}</text></svg>`); };
const TIPOS = ['FEED', 'REELS', 'CAROUSEL_ALBUM', 'REELS', 'FEED', 'CAROUSEL_ALBUM', 'REELS'];
const LEGENDAS = ['Quando esforço vira reconhecimento! Premiação 10+', 'O que faz uma escola ser inesquecível', 'A verdadeira força do Evolução está nas conquistas', 'Um novo ciclo está prestes a começar', 'Um mundo encantado diante dos nossos olhos', 'Dia das Crianças no Paraíso dos Colibris', 'Matrículas 2027 abertas', 'Aula aberta de ciências', 'Festival de Dança 2026', 'Ser criança é encontrar felicidade', 'Bastidores da feira cultural', 'Nossos professores contam'];
async function semear(G, { posts = 30 } = {}) {
  await G.post('/integrations/meta/token', { token: 'GOOD_TOKEN' });
  const ig1 = (await G.get('/integrations/status')).instagram.igUserId, ig2 = 'IG_GERACAO_2';
  const set = (k, v) => `INSERT INTO integration_settings(k,v) VALUES('${k}','${esc(v)}') ON DUPLICATE KEY UPDATE v=VALUES(v);`;
  const contas = [{ ig: ig1, usuario: 'evolucaopb', pagina: 'Colégio Evolução PB' }, { ig: ig2, usuario: 'geracao.evolucao', pagina: 'Geração Evolução' }];
  let q = set('meta_contas', JSON.stringify(contas)) + set('ig_contas_monitoradas', JSON.stringify([ig1, ig2])) + set('ig_username', 'evolucaopb') + set('ig_last_sync', U.dia(0) + ' 14:58:00') + set('ig_sync_warning', '');
  q += `DELETE FROM ig_posts; DELETE FROM ig_seguidores;`;
  const linhas = [];
  [[ig1, posts, 0], [ig2, Math.round(posts * 0.7), 7]].forEach(([conta, n, deslocar]) => {
    for (let i = 0; i < n; i++) {
      const dia = U.dia(-((i * 2 + deslocar) % 56) - 1), hora = [18, 9, 12, 19, 14][i % 5], tipo = TIPOS[(i + deslocar) % TIPOS.length], base = 90 + ((i * 53 + deslocar * 17) % 400);
      const cur = base * 2 + (tipo === 'REELS' ? 300 : 0), com = Math.round(base / 14), sal = Math.round(base / 9), comp = Math.round(base / 7), alc = base * 25 + (tipo === 'REELS' ? 6000 : 0), vis = Math.round(alc * (tipo === 'REELS' ? 2.4 : 1.3));
      linhas.push(`('${conta}','m${conta === ig1 ? 'a' : 'b'}${i}','${dia}T${String(hora).padStart(2, '0')}:${(i * 7) % 60 < 10 ? '0' : ''}${(i * 7) % 60}:00+0000','${tipo}','${esc(LEGENDAS[(i + deslocar) % LEGENDAS.length])}',${cur},${com},${sal},${comp},${alc},${vis},${(i * 3) % 40},${Math.round(alc / 40)},'https://www.instagram.com/p/${conta === ig1 ? 'a' : 'b'}${i}/','${esc(mini(i + deslocar, tipo === 'REELS' ? 'Reels' : tipo === 'FEED' ? 'Feed' : 'Carrossel'))}','x')`);
    }
  });
  q += `INSERT INTO ig_posts(conta,media_id,publicado_em,tipo,legenda,curtidas,comentarios,salvos,compartilhamentos,alcance,visualizacoes,seguidores_novos,visitas_perfil,permalink,miniatura,atualizado_em) VALUES ${linhas.join(',')};`;
  const snaps = [], inicioSeg = '2026-10-11', hoje = U.dia(0);
  for (let d = inicioSeg, k = 0; d <= hoje; d = U.somaDia(d, 1), k++) { snaps.push(`('${d}',${8200 + k * 14},0,0,'x','${ig1}')`); snaps.push(`('${d}',${4100 + k * 9},0,0,'x','${ig2}')`); }
  q += `INSERT INTO ig_seguidores(dia,seguidores,seguindo,midias,atualizado_em,conta) VALUES ${snaps.join(',')};`;
  // métricas semanais (domingo a sábado) desde a Semana 41 de 2026 e meses de agosto a outubro
  q += `DELETE FROM ig_conta_semana;`;
  const semanas = []; [['2026-10-04', 1], ['2026-10-11', 1.1], ['2026-10-18', 1.25], ['2026-10-25', 0.3]].forEach(([ini, f]) => { [[ig1, 1], [ig2, 0.62]].forEach(([c, m]) => { const a = Math.round(28000 * f * m); semanas.push(`('${c}','${ini}','${U.somaDia(ini, 6)}',${a},${Math.round(a * 1.9)},${Math.round(a / 11)},${Math.round(a / 9)},${Math.round(a / 15)},${Math.round(a / 90)},${Math.round(a / 70)},${Math.round(a / 60)},'x')`); }); });
  q += `INSERT INTO ig_conta_semana(conta,inicio,fim,alcance,visualizacoes,visitas_perfil,interacoes,curtidas,comentarios,compartilhamentos,salvamentos,atualizado_em) VALUES ${semanas.join(',')};`;
  sql(q);
  const mes = (per, ig, f, m) => G.post('/data?module=instagram', { titulo: per + ' · ' + ig, periodo: per, dataInicio: per + '-01', origem: 'INSTAGRAM_API', idExterno: ig, status: 'ATIVO', alcance: String(Math.round(110000 * f * m)), impressoes: String(Math.round(210000 * f * m)), visitasPerfil: String(Math.round(9000 * f * m)), interacoes: String(Math.round(15000 * f * m)), curtidas: '1', comentarios: '1', compartilhamentos: '1', salvamentos: '1', posts: '8', reels: '5' });
  for (const [per, f] of [['2026-07', 0.7], ['2026-08', 0.85], ['2026-09', 1], ['2026-10', 1.2]]) { await mes(per, ig1, f, 1); await mes(per, ig2, f, 0.6); }
  return { ig1, ig2 };
}
module.exports = { semear, sql, mini };
