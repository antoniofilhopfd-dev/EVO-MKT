// Integridade: edição simultânea sem perder campos, leitura restrita, rotas sem sessão, uploads que conferem o conteúdo e a verificação de integridade
// dos dados (vínculos quebrados, material sem arquivo). Uso: node integridade.test.js <install.out>
const U = require('./lib/ui');
const { execFileSync } = require('child_process');
const { t, fim } = U.contador();
const sql = q => execFileSync('mariadb', ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N'], { encoding: 'utf8', input: q });
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  // ---- 1) edição simultânea ----
  const novo = await G.post('/data?module=ideias', { titulo: 'Concorrência', status: 'NOVA' });
  const N = 30;
  const res = await Promise.all(Array.from({ length: N }, (_, i) => fetch(U.B + '/data?module=ideias&id=' + novo.id, { method: 'PUT', headers: G.H, body: JSON.stringify({ ['campo' + i]: 'v' + i }) }).then(x => x.status)));
  const fin = await G.get('/data?module=ideias&id=' + novo.id);
  t(`${N} edições simultâneas do mesmo registro: todas respondem 200`, res.every(x => x === 200), res);
  t(`${N} edições simultâneas: nenhum campo foi perdido`, Array.from({ length: N }, (_, i) => i).every(i => fin['campo' + i] === 'v' + i));
  // ---- 2) leitura restrita ----
  t('Equipe NÃO lê Configurações (403)', (await E.req('GET', '/data?module=configuracoes')).status === 403);
  t('Administrador lê Configurações (200)', (await G.req('GET', '/data?module=configuracoes')).status === 200);
  t('Equipe lê ideias e publicações (200)', (await E.req('GET', '/data?module=ideias')).status === 200 && (await E.req('GET', '/data?module=conteudos')).status === 200);
  // ---- 3) rotas protegidas sem sessão ----
  const gets = ['/health', '/auth/me', '/data?module=ideias', '/search?q=a', '/backup/list', '/backup/log', '/backup/download?file=evo_backup_20260101_000000_x.json.gz', '/admin/users', '/admin/audit', '/admin/integridade', '/integrations/status', '/integrations/log', '/file?path=ANEXOS/CONTEUDOS/x/y.jpg', '/dashboard/resumo', '/comments?module=conteudos&id=x'];
  const posts = ['/backup', '/backup/restore', '/admin/users/create', '/admin/users/delete', '/admin/users/role', '/admin/users/code', '/admin/mode', '/admin/codes', '/admin/reset-password', '/admin/user-active', '/integrations/settings', '/integrations/meta/token', '/integrations/meta/disconnect', '/integrations/google/disconnect', '/integrations/google/calendar/sync', '/data?module=ideias'];
  const sem = [];
  for (const u of gets) { const s = (await fetch(U.B + u)).status; if (![401, 403].includes(s)) sem.push(['GET', u, s]); }
  for (const u of posts) { const s = (await fetch(U.B + u, { method: 'POST', headers: U.J, body: '{}' })).status; if (![401, 403].includes(s)) sem.push(['POST', u, s]); }
  t(`varredura: ${gets.length + posts.length} rotas protegidas recusam quem não tem sessão`, sem.length === 0, sem);
  t('POST sem cabeçalho X-EVO é recusado (CSRF)', (await fetch(U.B + '/data?module=ideias', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: G.H.Cookie }, body: '{"titulo":"x"}' })).status === 403);
  t('rotas públicas continuam públicas: heartbeat e modo de acesso', (await fetch(U.B + '/heartbeat')).status === 200 && (await fetch(U.B + '/auth/mode')).status === 200);
  // ---- 4) Equipe não usa funções do Administrador ----
  const prot = [['GET', '/admin/users'], ['GET', '/admin/audit'], ['GET', '/backup/list'], ['GET', '/backup/log'], ['POST', '/backup'], ['POST', '/backup/restore'], ['POST', '/admin/mode'], ['POST', '/admin/users/create'], ['POST', '/admin/users/delete'], ['POST', '/admin/users/code'], ['POST', '/admin/reset-password'], ['POST', '/integrations/settings'], ['POST', '/integrations/meta/token'], ['POST', '/integrations/meta/disconnect'], ['POST', '/integrations/google/disconnect']];
  const eq = []; for (const [m, u] of prot) { const s = (await E.req(m, u, m === 'POST' ? {} : undefined)).status; if (s !== 403) eq.push([m, u, s]); }
  t('Equipe recebe 403 em todas as rotas do Administrador', eq.length === 0, eq);
  // ---- 5) uploads: o conteúdo precisa corresponder ao tipo ----
  const pub = (await G.post('/data?module=conteudos', { titulo: 'Uploads', status: 'RASCUNHO' })).id;
  const envia = async (nome, conteudo, tipo, papel = 'referencia') => { const f = new FormData(); f.append('id', pub); f.append('papel', papel); f.append('files', new File([conteudo], nome, { type: tipo })); return (await fetch(U.B + '/content/material', { method: 'POST', headers: { Cookie: G.H.Cookie, 'X-EVO': '1' }, body: f })).status; };
  t('arquivo .png com texto dentro é recusado (400)', await envia('falso.png', 'isto não é imagem', 'image/png') === 400);
  t('PNG de verdade é aceito', await envia('real.png', Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n....')]), 'image/png') === 201);
  t('PDF falso é recusado, PDF de verdade é aceito', await envia('a.pdf', 'nada', 'application/pdf') === 400 && await envia('b.pdf', '%PDF-1.4 teste', 'application/pdf') === 201);
  t('SVG com script é recusado', await envia('x.svg', '<svg><script>alert(1)</script></svg>', 'image/svg+xml') === 400);
  t('texto simples continua aceito', await envia('ok.txt', 'olá', 'text/plain') === 201);
  t('arquivo executável é recusado', await envia('x.exe', 'MZ', 'application/octet-stream') === 400);
  t('arte final só aceita imagem, vídeo ou PDF', await envia('x.txt', 'olá', 'text/plain', 'final') === 400);
  // ---- 6) verificação de integridade ----
  let i = await G.get('/admin/integridade');
  t('sem problemas: a verificação passa', i.ok === true && i.verificados.conteudos >= 1, i);
  sql("DELETE FROM arquivos WHERE caminho LIKE 'ANEXOS/CONTEUDOS/%/referencia_%ok.txt'");
  await G.put('/data?module=conteudos&id=' + pub, { campanhaId: 'CAM-9999' });
  i = await G.get('/admin/integridade');
  t('material sem arquivo e vínculo quebrado são apontados', i.ok === false && i.achados.some(a => a.tipo === 'material_sem_arquivo') && i.achados.some(a => a.tipo === 'vinculo_quebrado' && /CAM-9999/.test(a.detalhe)), i.achados);
  t('a verificação só lê: nada foi alterado', (await G.get('/data?module=conteudos&id=' + pub)).campanhaId === 'CAM-9999');
  fim();
})().catch(e => { console.error(e); process.exit(1); });
