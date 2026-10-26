// Auditoria de segurança das cinco áreas: autenticação, CSRF, autorização por perfil, entradas maliciosas, limites, registro de operações e XSS.
// Uso: node auditoria.test.js <install.out>
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const dia = U.dia;
  const req = async (m, u, b, H = G.H, raw) => { const x = await fetch(U.B + u, { method: m, headers: H, body: raw !== undefined ? raw : b ? JSON.stringify(b) : undefined }); const tx = await x.text(); let j = null; try { j = JSON.parse(tx); } catch { /* texto */ } return [x.status, j, tx]; };
  const ROTAS_GET = ['/dashboard/resumo', '/escolar/painel', '/datacom/painel', '/trafego/estado', '/trafego/resumo?de=2026-01-01&ate=2026-01-02', '/trafego/csv?de=2026-01-01&ate=2026-01-02', '/instagram/visao', '/instagram/desempenho', '/instagram/impulsionados', '/instagram/posts', '/instagram/contas', '/content/states', '/content/versions?id=x', '/content/materials?id=x', '/ia/estado', '/insights', '/notificacoes', '/integrations/prontidao', '/integrations/google/eventos-leitura?de=2026-01-01&ate=2026-01-02', '/admin/lgpd/exportar', '/admin/migracao', '/admin/arquivos-sem-vinculo', '/admin/users', '/admin/audit', '/admin/integridade', '/team', '/studio/modelos', '/studio/hashtags'];
  const ROTAS_POST = ['/escolar/salvar', '/escolar/mover', '/escolar/excluir', '/escolar/publicacao', '/datacom/salvar', '/datacom/excluir', '/datacom/relevancia', '/datacom/publicacao', '/content/decision', '/content/schedule', '/content/confirm', '/content/duplicate', '/content/adapt', '/content/share', '/content/material/link', '/content/material/remove', '/instagram/vinculo', '/ia/variacoes', '/comments', '/checklist', '/backup', '/admin/users/email', '/admin/arquivos-sem-vinculo/excluir', '/integrations/settings', '/integrations/google/agendas-leitura'];
  const J = { 'Content-Type': 'application/json', 'X-EVO': '1' };
  // 1) autenticação
  const falhas = [];
  for (const u of ROTAS_GET) { const [s] = await req('GET', u, null, { ...J }); if (s !== 401) falhas.push(u + ':' + s); }
  for (const u of ROTAS_POST) { const [s] = await req('POST', u, { id: 'x' }, { ...J }); if (s !== 401) falhas.push(u + ':' + s); }
  t('todas as rotas das cinco áreas exigem login (401)', falhas.length === 0, falhas);
  // 2) CSRF
  const semCsrf = [];
  for (const u of ROTAS_POST) { const [s] = await req('POST', u, { id: 'x' }, { 'Content-Type': 'application/json', Cookie: G.H.Cookie }); if (s !== 403) semCsrf.push(u + ':' + s); }
  t('toda escrita sem o cabeçalho anti-CSRF é recusada (403)', semCsrf.length === 0, semCsrf);
  // 3) autorização por perfil
  const restritas = [['GET', '/admin/users'], ['GET', '/admin/audit'], ['GET', '/admin/migracao'], ['GET', '/admin/arquivos-sem-vinculo'], ['GET', '/admin/integridade'], ['GET', '/admin/lgpd/exportar?codigo=ANT-3302'], ['GET', '/integrations/google/agendas-leitura'], ['POST', '/backup', {}], ['POST', '/admin/users/email', { codigo: 'ANT-3302', email: 'a@b.co' }], ['POST', '/admin/arquivos-sem-vinculo/excluir', { caminhos: ['x'], confirmar: true }], ['POST', '/integrations/settings', { meta_app_id: 'x' }], ['POST', '/integrations/google/agendas-leitura', { ids: [] }], ['POST', '/admin/mode', { modo: 'codigo' }], ['POST', '/admin/reset-password', { tipo: 'interno', codigo: 'NAT-3301' }]];
  const rs = await Promise.all(restritas.map(([m, u, b]) => req(m, u, b, E.H)));
  t('a Equipe é barrada nas ações do Administrador (403)', rs.every(([s]) => s === 403), rs.map(([s], i) => restritas[i][1] + ':' + s));
  const [, aud] = await req('GET', '/admin/audit');
  t('o Administrador vê o registro de operações', Array.isArray(aud) && aud.length > 0);
  // 4) entradas maliciosas ou absurdas nunca viram erro 500 nem vazam detalhes
  const sujas = [];
  for (const v of ["x' OR '1'='1", '1; DROP TABLE records;--', '../../etc/passwd', '${7*7}', '<script>alert(1)</script>', '\u0000\u0001']) {
    for (const [u, b] of [['/escolar/mover', { id: v, data: dia(2) }], ['/escolar/publicacao', { id: v }], ['/datacom/relevancia', { id: v, relevante: 'SIM' }], ['/datacom/excluir', { id: v }], ['/datacom/publicacao', { id: v, data: dia(1) }], ['/content/decision', { id: v, decisao: 'APROVADO' }], ['/content/schedule', { id: v }], ['/content/confirm', { id: v, link: v }], ['/content/material/link', { id: v, papel: 'final', url: v }], ['/instagram/vinculo', { anuncio: v, conteudo: v }], ['/ia/variacoes', { legenda: v }], ['/data?module=ideias', { titulo: v, descricao: v, segmento: v }]]) {
      const [s, , tx] = await req('POST', u, b); if (s >= 500 || /stack|at \/|node_modules|mysql|ER_/i.test(tx)) sujas.push(`${u} ${JSON.stringify(v).slice(0, 20)} -> ${s}`);
    }
    for (const u of ['/instagram/desempenho?dim=' + encodeURIComponent(v), '/instagram/visao?perfil=' + encodeURIComponent(v), '/dashboard/resumo?segmento=' + encodeURIComponent(v), '/dashboard/resumo?campanha=' + encodeURIComponent(v), '/trafego/resumo?de=' + encodeURIComponent(v) + '&ate=2026-01-01', '/search?q=' + encodeURIComponent(v)]) {
      const [s, , tx] = await req('GET', u); if (s >= 500 || /stack|at \/|node_modules|mysql|ER_/i.test(tx)) sujas.push(`${u} -> ${s}`);
    }
  }
  t('injeção de SQL/caminho e caracteres estranhos: sempre erro tratado (4xx), sem detalhes internos', sujas.length === 0, sujas);
  let [s, , tx] = await req('POST', '/data?module=ideias', null, G.H, '{isto não é json'); t('JSON inválido: erro tratado (400), sem 500', s >= 400 && s < 500, [s, tx.slice(0, 100)]);
  [s] = await req('POST', '/data?module=ideias', null, G.H, 'x'.repeat(2_100_000)); t('corpo gigante é recusado (413)', s === 413, s);
  [s] = await req('POST', '/data?module=ideias', { titulo: 'x'.repeat(25000) }); t('campo gigante é recusado (400)', s === 400);
  let j; [s, j] = await req('POST', '/datacom/salvar', { nome: "Data com SQL '; DROP TABLE users;--", categoria: 'CULTURAL', regra: { tipo: 'fixa', dia: '3', mes: '3' }, repeteAnual: 'SIM', relevante: 'SIM' });
  t('aspas e ponto-e-vírgula no texto são só texto (gravados e devolvidos como estão)', s === 201 && j.titulo.includes('DROP TABLE users;--') && (await req('GET', '/datacom/painel'))[0] === 200);
  [s, j] = await req('GET', '/auth/me'); t('as tabelas continuam intactas após as tentativas de injeção', s === 200 && j.user && j.user.code === 'NAT-3301');
  // 5) limites de upload e tipos
  const fd = new FormData(); fd.append('id', 'CON-9999'); fd.append('papel', 'final'); fd.append('files', new Blob(['<?php echo 1;']), 'x.php');
  let r = await fetch(U.B + '/content/material', { method: 'POST', headers: { Cookie: G.H.Cookie, 'X-EVO': '1' }, body: fd }); t('upload de arquivo .php é recusado', r.status === 400 || r.status === 404, r.status);
  const pub = (await G.post('/data?module=conteudos', { titulo: 'Segurança do upload', status: 'RASCUNHO' })).id;
  const fd2 = new FormData(); fd2.append('id', pub); fd2.append('papel', 'final'); fd2.append('files', new Blob(['<?php echo 1;']), 'x.jpg');
  r = await fetch(U.B + '/content/material', { method: 'POST', headers: { Cookie: G.H.Cookie, 'X-EVO': '1' }, body: fd2 }); t('arquivo cujo conteúdo não é do tipo declarado (.jpg falso) é recusado', r.status === 400, r.status);
  [s] = await req('POST', '/content/material/link', { id: pub, papel: 'final', url: 'javascript:alert(1)' }); t('link que não é https é recusado', s === 400);
  [s] = await req('POST', '/content/material/link', { id: pub, papel: 'final', url: 'http://inseguro.com/x' }); t('link http (sem TLS) é recusado', s === 400);
  r = await fetch(U.B + '/file?path=' + encodeURIComponent('ANEXOS/CONTEUDOS/../../config.php'), { headers: G.H }); t('travessia de caminho no download é bloqueada', r.status === 400 || r.status === 404, r.status);
  // 6) registro de operações importantes
  const [, ev] = await req('POST', '/escolar/salvar', { titulo: 'Evento de auditoria', dataInicio: dia(9), segmentos: ['TODOS'], tipoEvento: 'EVENTO' });
  await req('POST', '/escolar/mover', { id: ev.id, data: dia(10) }); await req('POST', '/escolar/excluir', { id: ev.id });
  await req('POST', '/content/decision', { id: pub, decisao: 'APROVADO' });
  const [, log] = await req('GET', '/admin/audit?limit=300'); const acoes = (log || []).map(x => `${x.acao}:${x.modulo}`);
  t('criar, reagendar e excluir ficam no registro de operações (com quem e quando)', ['criar:calescolar', 'reagendar:calescolar', 'excluir:calescolar'].every(a => acoes.includes(a)) && log.every(x => x.ator && x.quando), acoes.slice(0, 12));
  // 7) XSS: textos com HTML aparecem como texto em todas as telas novas
  const carga = '"><img src=x onerror="window.__xss=1"><b>';
  await G.post('/escolar/salvar', { titulo: 'E ' + carga, dataInicio: dia(2), segmentos: ['TODOS'], tipoEvento: 'EVENTO', local: carga, descricao: carga });
  await G.post('/data?module=conteudos', { titulo: 'P ' + carga, legenda: carga, hashtags: carga, cta: carga, tema: carga, objetivo: carga, status: 'RASCUNHO', publicacaoEm: dia(2) + 'T10:00', perfil: '@evolucaopb', segmento: 'Ensino Médio', formato: 'Feed', responsavel: 'Antônio Filho' });
  await G.post('/data?module=ideias', { titulo: 'I ' + carga, descricao: carga });
  await G.post('/data?module=campanhas', { titulo: 'C ' + carga, dataInicio: dia(1), prazo: dia(5), objetivo: carga, descricao: carga });
  await G.post('/data?module=calendario', { titulo: 'K ' + carga, inicioEm: dia(2) + 'T10:00', dataInicio: dia(2), tipoItem: 'Reunião', status: 'PLANEJADO' });
  const b = await U.abrir(); const p = await U.pagina(b, 'NAT-3301', G.nova); let dialogos = 0; p.removeAllListeners('dialog'); p.on('dialog', d => { dialogos++; d.dismiss(); });
  for (const pg of ['hoje', 'calendario', 'igvisao', 'igconteudos', 'igplan', 'igdesempenho']) { await U.ir(p, pg, 500); await p.evaluate(() => document.querySelectorAll('.admin-overlay').forEach(e => e.remove())); }
  await U.ir(p, 'igplan'); await p.click('[data-aba="ideias"]'); await p.waitForTimeout(800); await p.click('[data-aba="campanhas"]').catch(() => {}); await p.waitForTimeout(800);
  await U.ir(p, 'igconteudos'); await p.click('[data-ac="editar"]').catch(() => {}); await p.waitForSelector('#igpub', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(500);
  t('HTML dentro dos textos nunca executa (Dashboard, Calendário, Instagram e Estúdio)', (await p.evaluate(() => window.__xss)) === undefined && dialogos === 0, [dialogos, p.errs]);
  t('e aparece como texto, não como elemento', (await p.$$eval('img[src="x"]', e => e.length)) === 0);
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
