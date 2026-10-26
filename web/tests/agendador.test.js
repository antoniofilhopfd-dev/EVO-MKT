// Agendador do Instagram: só uma execução por vez publica (bloqueio no banco), mesmo com o cron da hospedagem e o relógio interno juntos.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const mariadb = ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N'];
const sql = q => execFileSync('mariadb', mariadb, { encoding: 'utf8', input: q }).trim();
(async () => {
  const G = await U.entrar(process.argv[2]);
  const cron = tarefa => fetch(U.B + '/cron/integracoes?tarefa=' + tarefa, { headers: { Authorization: 'Bearer ' + (process.env.CRON_SECRET || 'cron-de-teste-0123456789') } }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
  await G.post('/integrations/settings', { meta_app_id: 'APPID', meta_app_secret: 'META_SECRET' }); await G.post('/integrations/meta/token', { token: 'GOOD_TOKEN' });
  sql("INSERT INTO integration_settings(k,v) VALUES('ig_last_publish_run','') ON DUPLICATE KEY UPDATE v='';");
  let r = await cron('publicar');
  t('cron de publicação responde 200 e registra a execução', r.s === 200 && r.j['instagram-publicar'] && r.j['instagram-publicar'].publicados === 0 && sql("SELECT v FROM integration_settings WHERE k='ig_last_publish_run'") !== '', r);
  // outra execução segurando o bloqueio: esta não publica nem registra nada, e não dá erro
  sql("INSERT INTO integration_settings(k,v) VALUES('ig_last_publish_run','marca') ON DUPLICATE KEY UPDATE v='marca';");
  const preso = spawn('mariadb', mariadb, { stdio: ['pipe', 'ignore', 'ignore'] });
  preso.stdin.end("SELECT GET_LOCK('evo_ig_publish', 0), SLEEP(5);\n");
  await new Promise(ok => setTimeout(ok, 1200));
  r = await cron('publicar');
  t('com outra execução em andamento, o cron não publica em duplicidade e não falha', r.s === 200 && r.j['instagram-publicar'].publicados === 0 && sql("SELECT v FROM integration_settings WHERE k='ig_last_publish_run'") === 'marca', r);
  await new Promise(ok => preso.on('close', ok));
  r = await cron('publicar');
  t('liberado o bloqueio, a próxima execução volta a rodar', r.s === 200 && sql("SELECT v FROM integration_settings WHERE k='ig_last_publish_run'") !== 'marca', r);
  const rs = await Promise.all([cron('publicar'), cron('publicar'), cron('publicar'), cron('publicar')]);
  t('quatro chamadas ao mesmo tempo: todas respondem sem erro', rs.every(x => x.s === 200 && !/ERRO/.test(JSON.stringify(x.j))), rs.map(x => x.j));
  t('sem a chave do cron: 401', (await fetch(U.B + '/cron/integracoes?tarefa=publicar')).status === 401);
  fim();
})().catch(e => { console.error(e); process.exit(1); });
