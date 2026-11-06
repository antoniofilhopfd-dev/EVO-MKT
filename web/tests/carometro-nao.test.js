// Carômetro dos NÃO autorizados (aba do Uso de Imagem + PDF): recusou, revogou, venceu e, opcionalmente, sem resposta. Dados fictícios.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const sql = q => execFileSync('mariadb', ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N'], { encoding: 'utf8', input: q, maxBuffer: 1 << 27 });
(async () => {
  const G = await U.entrar(process.argv[2]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmnao-'));
  t('sem login: 401', (await fetch(U.B + '/carometro/nao-autorizados')).status === 401);
  await G.post('/imagem/alunos/importar', { linhas: [
    { matricula: 'X-1', nome: 'Nara Recusou', turma: '3º Ano A', segmento: '' }, { matricula: 'X-2', nome: 'Aline Autorizada', turma: '3º Ano A', segmento: '' },
    { matricula: 'X-3', nome: 'Paulo Pendente', turma: '3º Ano B', segmento: '' }, { matricula: 'X-4', nome: 'Sara Semresposta', turma: '3º Ano B', segmento: '' },
    { matricula: 'X-5', nome: 'Rui Revogado', turma: '5º Ano A', segmento: '' }, { matricula: 'X-6', nome: 'Vera Vencida', turma: '5º Ano A', segmento: '' },
    { matricula: 'X-7', nome: 'Caio Expirou', turma: '5º Ano A', segmento: '' }] });
  const al = (await G.get('/carometro/alunos')).rows, id = m => al.find(a => a.matricula === m).id;
  await G.post('/imagem/alunos/liberacao', { id: id('X-1'), status: 'NAO_AUTORIZADO' });
  await G.post('/imagem/alunos/liberacao', { id: id('X-2'), status: 'AUTORIZADO' });
  await G.post('/imagem/alunos/liberacao', { id: id('X-3'), status: 'PENDENTE' });
  // revogado / vencido / autorizado com prazo passado: direto na solicitação (como o sistema grava)
  const mod = (await G.get('/imagem/modelos')).rows.find(m => m.ativo) ?? (await G.get('/imagem/modelos')).rows[0];
  await G.post('/imagem/solicitacoes/criar', { modelo_id: mod.id, alunos: [{ id: id('X-5') }, { id: id('X-6') }, { id: id('X-7') }] });
  sql(`UPDATE ui_solicitacoes SET status='REVOGADO' WHERE aluno_id=${id('X-5')}; UPDATE ui_solicitacoes SET status='VENCIDO' WHERE aluno_id=${id('X-6')}; UPDATE ui_solicitacoes SET status='AUTORIZADO', vence_em='2020-01-01' WHERE aluno_id=${id('X-7')};`);

  t('situação inválida na liberação manual: 400', (await G.req('POST', '/imagem/alunos/liberacao', { id: id('X-1'), status: 'QUALQUER' })).status === 400);
  await G.post('/imagem/alunos/liberacao', { id: id('X-4'), status: 'NAO_AUTORIZADO' });
  t('"Sem solicitação" desfaz a marcação manual: volta a "ninguém respondeu"', (await G.post('/imagem/alunos/liberacao', { id: id('X-4'), status: 'SEM' })).status === 'SEM' && (((await G.get('/imagem/alunos?busca=X-4')).rows[0].situacao || '') === ''));
  t('desfazer sem marcação anterior também funciona (idempotente)', (await G.post('/imagem/alunos/liberacao', { id: id('X-4'), status: 'SEM' })).ok === true);
  const r = (await G.get('/carometro/nao-autorizados')).rows, motivo = m => (r.find(a => a.matricula === m) || {}).motivo;
  t('recusou, revogado, vencido (inclusive autorizado com prazo passado) e sem resposta', motivo('X-1') === 'Não autoriza' && motivo('X-5') === 'Revogado' && motivo('X-6') === 'Vencido' && motivo('X-7') === 'Vencido' && motivo('X-3') === 'Sem resposta' && motivo('X-4') === 'Sem resposta', r.map(a => [a.matricula, a.motivo]));
  t('quem está autorizado e vigente não aparece', !r.some(a => a.matricula === 'X-2') && r.length === 6);
  t('a lista traz só o necessário (sem CPF nem responsável)', r.every(a => Object.keys(a).sort().join() === 'fotoId,id,matricula,motivo,nome,turma'));
  const pdf = async qs => { const x = await fetch(U.B + '/carometro/pdf?' + qs, { headers: { Cookie: G.H.Cookie, 'X-EVO': '1' } }); return { status: x.status, ct: x.headers.get('content-type'), cd: x.headers.get('content-disposition') || '', buf: Buffer.from(await x.arrayBuffer()) }; };
  const txt = b => { const f = path.join(tmp, 'x' + Math.random() + '.pdf'); fs.writeFileSync(f, b); return execFileSync('pdftotext', ['-layout', f, '-']).toString(); };
  t('PDF sem escolher turmas e sem "todas": 400', (await pdf('origem=nao-autorizados')).status === 400);
  const p1 = await pdf('origem=nao-autorizados&todas=1'), tx1 = txt(p1.buf);
  t('PDF dos não autorizados: só quem recusou/revogou/venceu, com o motivo, e sem os que não responderam', p1.status === 200 && p1.ct === 'application/pdf' && /Carometro-NaoAutorizados\.pdf/.test(p1.cd) && /Nara Recusou/.test(tx1) && /Rui Revogado/.test(tx1) && /Vera Vencida/.test(tx1) && /Caio Expirou/.test(tx1) && /Não autoriza/.test(tx1) && !/Paulo Pendente|Sara Semresposta|Aline Autorizada/.test(tx1), tx1.slice(0, 500));
  t('o título do PDF avisa para não usar a imagem', /N.O autorizados - a fam.lia n.o autoriza a imagem nas redes sociais/i.test(tx1));
  const p2 = await pdf('origem=nao-autorizados&todas=1&pendentes=1'), tx2 = txt(p2.buf);
  t('com "incluir sem resposta" entram os pendentes e os sem resposta', /Paulo Pendente/.test(tx2) && /Sara Semresposta/.test(tx2) && /Sem resposta/.test(tx2) && !/Aline Autorizada/.test(tx2));
  const p3 = await pdf('origem=nao-autorizados&pendentes=1&turmas=' + encodeURIComponent('5º Ano A')), tx3 = txt(p3.buf);
  t('o PDF respeita as turmas escolhidas', /Rui Revogado/.test(tx3) && !/Nara Recusou|Paulo Pendente/.test(tx3));
  const pf = await pdf('origem=nao-autorizados&turmas=' + encodeURIComponent('Turma Fantasma'));
  t('turma sem nenhum não autorizado: 404 ou 403 com mensagem', pf.status === 404 || pf.status === 403);

  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const pg = await U.pagina(b, 'NAT-3301', G.nova, vp);
    await U.ir(pg, 'uinaoautorizados', 900); await pg.waitForSelector('#uiNaoGrade .cm-al');
    t(`${nome}: aba "Não autorizados" no Uso de Imagem`, /Não autorizados/.test(await pg.innerText('#subtabs')) && /Famílias que NÃO autorizam a imagem nas redes sociais/.test(await pg.innerText('#content')));
    t(`${nome}: mostra só os explícitos (4) com o motivo; sem os "sem resposta"`, (await pg.$$('#uiNaoGrade .cm-al')).length === 4 && /Não autoriza/.test(await pg.innerText('#uiNaoGrade')) && !/Sem resposta/.test(await pg.innerText('#uiNaoGrade')));
    await pg.check('#uiNaoPend'); await pg.waitForFunction(() => document.querySelectorAll('#uiNaoGrade .cm-al').length === 6);
    t(`${nome}: "incluir sem resposta" mostra os 6`, /Sem resposta/.test(await pg.innerText('#uiNaoGrade')));
    await pg.fill('#uiNaoBusca', 'nara'); await pg.waitForFunction(() => document.querySelectorAll('#uiNaoGrade .cm-al').length === 1);
    t(`${nome}: busca por nome`, /Nara Recusou/.test(await pg.innerText('#uiNaoGrade')));
    await pg.fill('#uiNaoBusca', '');
    if (dir) await pg.screenshot({ path: `${dir}/naoautorizados-${nome}.png`, fullPage: true });
    await pg.click('#uiNaoPdf'); await pg.waitForSelector('#pdfPrev iframe, #pdfPrev .empty', { timeout: 20000 });
    t(`${nome}: "Gerar PDF" abre a impressão já no modo não autorizados, com a prévia`, await pg.inputValue('#pdfOrigem') === 'nao-autorizados' && await pg.isChecked('#pdfPend') && await pg.$('#pdfPrev iframe') !== null);
    t(`${nome}: sem estouro horizontal`, await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2));
    t(`${nome}: sem erros de script`, pg.errs.length === 0, pg.errs);
    if (nome === 'desktop') {
      await U.ir(pg, 'uialunos', 900); await pg.waitForSelector('[data-lib]');
      await pg.fill('#uiBusca', 'X-4'); await pg.waitForFunction(() => document.querySelectorAll('.ui-tab tbody tr').length === 1 && /Sara Semresposta/.test(document.querySelector('.ui-tab tbody tr').innerText));
      await pg.click('[data-lib]'); await pg.waitForSelector('#uiLibStatus');
      t(`${nome}: o seletor de autorização tem "Sem solicitação" e vem marcado para quem ninguém respondeu`, (await pg.$$eval('#uiLibStatus option', o => o.map(x => x.textContent))).some(x => /Sem solicitação/.test(x)) && /Sem solicitação/.test(await pg.$eval('#uiLibStatus', e => e.selectedOptions[0].textContent)));
      await pg.selectOption('#uiLibStatus', 'NAO_AUTORIZADO'); await pg.click('#uiLib button[type=submit]'); await pg.waitForFunction(() => !document.querySelector('#uiLibStatus'));
      await pg.waitForTimeout(600); await pg.click('[data-lib]'); await pg.waitForSelector('#uiLibStatus');
      await pg.selectOption('#uiLibStatus', 'SEM'); await pg.click('#uiLib button[type=submit]'); await pg.waitForFunction(() => !document.querySelector('#uiLibStatus'));
      t(`${nome}: escolher "Sem solicitação" pelo seletor desfaz a marcação`, (((await G.get('/imagem/alunos?busca=X-4')).rows[0].situacao || '') === ''));
    }
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
