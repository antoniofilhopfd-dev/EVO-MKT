// Backup completo, validação de integridade, restauração (inclusive de backup da v5) e registro de execuções. Uso: node backup.test.js <install.out>
const zlib = require('zlib'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const sha = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const sql = q => execFileSync('mariadb', ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N'], { encoding: 'utf8', input: q, maxBuffer: 1 << 27 });
const hex = o => zlib.gzipSync(Buffer.from(JSON.stringify(o))).toString('hex');
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const call = async (m, u, b) => { const x = await G.req(m, u, b); let j = null; try { j = await x.json(); } catch { /* sem corpo */ } return [x.status, j]; };
  const rows = async m => (await G.get('/data?module=' + m)).rows;
  // ---- dados de partida: ideia, ficha, publicação com material (anexo), comentário e checklist ----
  const ideia = await G.post('/data?module=ideias', { titulo: 'Ideia do backup', status: 'NOVA' });
  const alBk = await G.post('/imagem/alunos', { nome: 'Aluno Fictício do Backup', matricula: 'BK-1', turma: '1º Ano', segmento: 'FUND1' });
  const mdBk = (await G.get('/imagem/modelos')).rows[0];
  const solBk = await G.post('/imagem/solicitacoes/criar', { modelo_id: mdBk.id, alunos: [{ id: alBk.id, responsavel: 'Responsável Fictício' }] });
  await G.post('/admin/users/create', { tipo: 'interno', nome: 'Joana Teste', perfil: 'team' });
  const pub = await G.post('/data?module=conteudos', { titulo: 'Publicação com anexo', status: 'RASCUNHO' });
  const fd = new FormData(); fd.append('id', pub.id); fd.append('papel', 'referencia'); fd.append('files', new File(['conteúdo do anexo'], 'anexo.txt', { type: 'text/plain' }));
  const up = await fetch(U.B + '/content/material', { method: 'POST', headers: { Cookie: G.H.Cookie, 'X-EVO': '1' }, body: fd }); const upj = await up.json();
  t('preparação: anexo enviado à publicação', up.status === 201 && upj.novos.length === 1, upj);
  const cam = upj.novos[0].caminho;
  await G.post('/comments', { module: 'conteudos', id: pub.id, texto: 'Comentário que precisa sobreviver ao backup' }); await G.post('/checklist', { module: 'conteudos', id: pub.id, texto: 'Item do checklist no backup' });
  // ---- backup completo e validação ----
  let [s2, bk] = await call('POST', '/backup', { completo: true }); t('cria backup completo', s2 === 200 && /_manual\.json\.gz$/.test(bk.file), bk);
  let [s3, v] = await call('GET', '/backup/validate?file=' + bk.file);
  t('validação: backup íntegro, formato 2', s3 === 200 && v.ok === true && v.formato === 2 && v.erros.length === 0, v);
  t('o backup inclui fichas de acesso, configurações e anexos', v.resumo.users >= 6 && 'integration_settings' in v.resumo && v.resumo.arquivos >= 1 && !('portal_users' in v.resumo), v.resumo);
  let [, lg] = await call('GET', '/backup/log'); t('registro de execuções mostra “criar” OK', lg.some(x => x.acao === 'criar' && x.status === 'OK' && x.nome === bk.file), lg);
  // ---- mudanças depois do backup ----
  await call('DELETE', '/data?module=ideias&id=' + ideia.id);
  const tB = await G.post('/data?module=ideias', { titulo: 'Ideia criada depois do backup' });
  await call('POST', '/admin/users/delete', { tipo: 'interno', codigo: 'JOA-3306' });
  sql('DELETE FROM arquivos');
  t('antes de restaurar: ideia original sumiu, ficha excluída, anexo apagado', !(await rows('ideias')).some(x => x.id === ideia.id) && (await G.get('/admin/users')).every(u => u.codigo !== 'JOA-3306') && sql('SELECT COUNT(*) FROM arquivos').trim() === '0');
  // ---- restauração ----
  let [s4, rs] = await call('POST', '/backup/restore', { file: bk.file });
  t('restaura o backup (200) e informa o backup de segurança', s4 === 200 && rs.ok && /_prerestauracao\.json\.gz$/.test(rs.seguranca), rs);
  const ide = await rows('ideias');
  t('os alunos, modelos e solicitações do Uso de Imagem voltam com a restauração', (await G.get('/imagem/alunos?busca=BK-1')).rows.length === 1 && (await G.get('/imagem/modelos')).rows.length >= 1 && (await G.get('/imagem/solicitacoes?busca=' + solBk.criadas[0].protocolo)).rows.length === 1);
  t('a ideia original voltou com o mesmo ID', ide.some(x => x.id === ideia.id && x.titulo === 'Ideia do backup'));
  t('a ideia criada depois do backup saiu (estado do backup)', !ide.some(x => x.id === tB.id));
  t('a ficha excluída voltou', (await G.get('/admin/users')).some(u => u.codigo === 'JOA-3306'));
  t('a restauração encerrou as sessões antigas (de quem não restaurou)', (await E.req('GET', '/notificacoes')).status === 401);
  const G2 = await U.entrar(process.argv[2]).catch(() => null);
  t('o anexo voltou (a publicação abre o arquivo)', (await fetch(U.B + '/file?path=' + encodeURIComponent(cam), { headers: G.H })).status === 200);
  const tC = await G.post('/data?module=ideias', { titulo: 'Depois da restauração' });
  t('IDs nunca são reutilizados: nova ideia fica depois da que foi descartada', +tC.id.split('-')[1] > +tB.id.split('-')[1], { tB: tB.id, tC: tC.id });
  t('a sessão de quem restaurou continua válida', (await call('GET', '/auth/me'))[0] === 200);
  void G2;
  // ---- backup corrompido: truncado ----
  const nomeTr = 'evo_backup_20260101_000001_truncado.json.gz';
  sql(`INSERT INTO backups(nome,criado_em,conteudo) SELECT '${nomeTr}','2026-01-01T00:00:01-03:00',SUBSTRING(conteudo,1,LENGTH(conteudo) DIV 2) FROM backups WHERE nome='${bk.file}'`);
  let s; [s, v] = await call('GET', '/backup/validate?file=' + nomeTr); t('backup truncado: validação aponta corrupção', s === 200 && v.ok === false && /corrompido/i.test(v.erros.join(' ')), v);
  [s, rs] = await call('POST', '/backup/restore', { file: nomeTr }); t('backup truncado: restauração recusada (400)', s === 400, rs);
  // ---- backup adulterado ----
  const dump = JSON.parse(zlib.gunzipSync(Buffer.from(await (await fetch(U.B + '/backup/download?file=' + bk.file, { headers: G.H })).arrayBuffer())).toString());
  const adult = JSON.parse(JSON.stringify(dump)); adult.tabelas.records[0].data = adult.tabelas.records[0].data.replace('"', '"X');
  const nomeAd = 'evo_backup_20260101_000002_adulterado.json.gz'; sql(`INSERT INTO backups(nome,criado_em,conteudo) VALUES('${nomeAd}','2026-01-01T00:00:02-03:00',UNHEX('${hex(adult)}'))`);
  [s, v] = await call('GET', '/backup/validate?file=' + nomeAd); t('backup adulterado: hash não confere', v.ok === false && /hash/.test(v.erros.join(' ')), v);
  const antes = (await rows('ideias')).length; [s, rs] = await call('POST', '/backup/restore', { file: nomeAd });
  t('backup adulterado: restauração recusada e dados intactos', s === 400 && (await rows('ideias')).length === antes, rs);
  const rv = (await call('GET', '/backup/validate?file=' + bk.file))[1];
  t('validação lista histórico, comentários e checklists', rv.resumo.status_history > 0 && rv.resumo.record_comments === 1 && rv.resumo.record_checklist === 1 && 'ads_snapshots' in rv.resumo && 'notifications' in rv.resumo, rv.resumo);
  t('após restaurar, comentário e checklist voltaram', +sql(`SELECT COUNT(*) FROM record_comments WHERE registro='${pub.id}'`) === 1 && +sql(`SELECT COUNT(*) FROM record_checklist WHERE registro='${pub.id}'`) === 1);
  // ---- backup da v5: traz módulos que não existem mais ----
  const v5 = JSON.parse(JSON.stringify(dump)); v5.tabelas.records.push({ modulo: 'solicitacoes', id: 'SOL-0001', data: '{"id":"SOL-0001","titulo":"Demanda antiga"}', criado_em: 'x', atualizado_em: 'x' }, { modulo: 'tarefas', id: 'TAR-0001', data: '{"id":"TAR-0001"}', criado_em: 'x', atualizado_em: 'x' });
  v5.manifesto.records = { linhas: v5.tabelas.records.length, sha256: sha(v5.tabelas.records) }; v5.sha256_total = sha(v5.manifesto);
  const nomeV5 = 'evo_backup_20260301_000000_v5antigo.json.gz'; sql(`INSERT INTO backups(nome,criado_em,conteudo) VALUES('${nomeV5}','2026-03-01T00:00:00-03:00',UNHEX('${hex(v5)}'))`);
  [s, rs] = await call('POST', '/backup/restore', { file: nomeV5 });
  t('backup da v5 restaura, mas os registros de módulos que não existem mais não voltam', s === 200 && +sql("SELECT COUNT(*) FROM records WHERE modulo IN ('solicitacoes','tarefas')") === 0, rs);
  // ---- arquivo só de consulta (cópia do que a migração removeu) ----
  const so = JSON.parse(JSON.stringify(dump)); so.somenteLegado = true; const nomeSo = 'evo_backup_20260301_000001_legadov6.json.gz'; sql(`INSERT INTO backups(nome,criado_em,conteudo) VALUES('${nomeSo}','2026-03-01T00:00:01-03:00',UNHEX('${hex(so)}'))`);
  [s, rs] = await call('POST', '/backup/restore', { file: nomeSo }); t('o arquivo só de consulta (_legadov6) nunca é restaurado', s === 400 && /consulta/.test(JSON.stringify(rs)), rs);
  // ---- backup sem Administrador ativo ----
  const semG = JSON.parse(JSON.stringify(dump)); semG.tabelas.users.forEach(u => { u.role = 'team'; });
  semG.manifesto.users = { linhas: semG.tabelas.users.length, sha256: sha(semG.tabelas.users) }; semG.sha256_total = sha(semG.manifesto);
  const nomeSg = 'evo_backup_20260101_000003_semgerente.json.gz'; sql(`INSERT INTO backups(nome,criado_em,conteudo) VALUES('${nomeSg}','2026-01-01T00:00:03-03:00',UNHEX('${hex(semG)}'))`);
  [s, rs] = await call('POST', '/backup/restore', { file: nomeSg }); t('backup sem Administrador ativo: restauração recusada', s === 400 && /Administrador/.test(JSON.stringify(rs)), rs);
  // ---- formato 1 ----
  const v1 = { versao: '4.x', em: '2025-01-01', records: [], headers: [], counters: [], used_ids: [], notices: [] };
  const nomeV1 = 'evo_backup_20250101_000000_antigo.json.gz'; sql(`INSERT INTO backups(nome,criado_em,conteudo) VALUES('${nomeV1}','2025-01-01T00:00:00-03:00',UNHEX('${hex(v1)}'))`);
  [s, v] = await call('GET', '/backup/validate?file=' + nomeV1); t('formato antigo: válido, com aviso de que não tem integridade', v.ok === true && v.formato === 1 && v.avisos.length > 0, v);
  [s] = await call('GET', '/backup/validate?file=../../etc/passwd'); t('nome de arquivo inválido: 400', s === 400);
  [s] = await call('POST', '/backup/restore', { file: 'evo_backup_20990101_000000_nao.json.gz' }); t('backup inexistente: 404', s === 404);
  [, lg] = await call('GET', '/backup/log');
  t('o registro mostra restauração OK e recusas com ERRO', lg.some(x => x.acao === 'restaurar' && x.status === 'OK') && lg.some(x => x.acao === 'restaurar' && x.status === 'ERRO'), lg.slice(0, 6));
  fim();
})().catch(e => { console.error(e); process.exit(1); });
