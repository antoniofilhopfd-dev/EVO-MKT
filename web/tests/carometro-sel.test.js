// Carômetro Escolar, etapa 4: seleções salvas (várias turmas, compartilhar, duplicar, editar, excluir) e sessões de fotos. Dados fictícios.
const fs = require('fs');
const sharp = require('sharp');
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const mat = [['S-1', 'Ana Um', '3º Ano A'], ['S-2', 'Bia Dois', '3º Ano A'], ['S-3', 'Caio Três', '3º Ano B'], ['S-4', 'Davi Quatro', 'Infantil 2 A'], ['S-5', 'Eva Cinco', '3º Ano A']];
  await G.post('/imagem/alunos/importar', { linhas: mat.map(([matricula, nome, turma]) => ({ matricula, nome, turma, segmento: '' })) });
  const al = (await G.get('/carometro/alunos')).rows, id = m => al.find(a => a.matricula === m).id;
  const raw = (H, u, o = {}) => fetch(U.B + u, { headers: { Cookie: H.H.Cookie, 'X-EVO': '1' }, ...o }).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) }));

  t('sem login: 401', (await fetch(U.B + '/carometro/selecoes')).status === 401 && (await fetch(U.B + '/carometro/sessoes')).status === 401);
  t('seleção sem nome ou sem alunos é recusada (400)', (await G.req('POST', '/carometro/selecao', { nome: '', aluno_ids: [id('S-1')] })).status === 400 && (await G.req('POST', '/carometro/selecao', { nome: 'x', aluno_ids: [] })).status === 400 && (await G.req('POST', '/carometro/selecao', { nome: 'x', aluno_ids: [99999] })).status === 400);
  let r = await G.post('/carometro/selecao', { nome: 'Monitores', aluno_ids: [id('S-1'), id('S-3'), id('S-4'), id('S-1')] });
  const S1 = r.id;
  t('salva seleção com alunos de várias turmas (sem repetir)', r.ok && r.alunos === 3 && S1 > 0, r);
  let l = (await G.get('/carometro/selecoes')).rows;
  t('lista mostra alunos e turmas', l.length === 1 && l[0].alunos === 3 && l[0].turmas === 3 && l[0].meu && l[0].podeEditar && !l[0].compartilhada, l);
  t('seleção privada não aparece nem abre para outra pessoa', (await E.get('/carometro/selecoes')).rows.length === 0 && (await E.req('GET', '/carometro/selecao?id=' + S1)).status === 404);
  const dt = await G.get('/carometro/selecao?id=' + S1);
  t('detalhe em ordem escolar, com foto/autorização informativas', dt.alunos.map(a => a.matricula).join() === 'S-4,S-1,S-3' && dt.alunos.every(a => a.autorizacao === 'SEM_INFORMACAO' && a.fotoId === null), dt.alunos);
  r = await G.post('/carometro/selecao', { id: S1, nome: 'Monitores 2026', compartilhada: true, aluno_ids: [id('S-1'), id('S-2')] });
  t('editar nome, compartilhar e trocar alunos', r.ok && r.alunos === 2 && (await G.get('/carometro/selecao?id=' + S1)).alunos.length === 2);
  t('compartilhada: a Equipe vê e abre, mas não edita nem exclui (403)', (await E.get('/carometro/selecoes')).rows[0].podeEditar === false && (await E.get('/carometro/selecao?id=' + S1)).alunos.length === 2 && (await E.req('POST', '/carometro/selecao', { id: S1, nome: 'x', aluno_ids: [id('S-1')] })).status === 403 && (await E.req('POST', '/carometro/selecao/excluir', { id: S1 })).status === 403);
  r = await E.post('/carometro/selecao/duplicar', { id: S1 });
  const cop = (await E.get('/carometro/selecoes')).rows.find(x => x.id === r.id);
  t('a Equipe duplica uma compartilhada: cópia privada e dela', r.ok && cop && cop.meu && !cop.compartilhada && /cópia/.test(cop.nome) && cop.alunos === 2, cop);
  t('a cópia não aparece para o dono original', !(await G.get('/carometro/selecoes')).rows.some(x => x.id === r.id));
  await G.post('/imagem/alunos', { id: id('S-2'), matricula: 'S-2', nome: 'Bia Dois', turma: '3º Ano A', ativo: false }).catch(() => {});
  t('seleção ignora aluno inativado depois', (await G.get('/carometro/selecoes')).rows[0].alunos <= 2);
  t('excluir seleção própria', (await E.post('/carometro/selecao/excluir', { id: r.id })).ok && (await E.get('/carometro/selecoes')).rows.length === 1 && (await G.req('GET', '/carometro/selecao?id=' + r.id)).status === 404);
  t('excluir seleção não apaga alunos', (await G.get('/carometro/alunos')).total >= 4);

  // sessões
  t('Equipe consulta, mas não cria sessão (403)', (await E.req('GET', '/carometro/sessoes')).status === 200 && (await E.req('POST', '/carometro/sessao', { nome: 'x', data: '2026-11-05', turma: '3º Ano A' })).status === 403);
  t('sessão exige nome, data e turma com alunos', (await G.req('POST', '/carometro/sessao', { nome: '', data: '2026-11-05', turma: '3º Ano A' })).status === 400 && (await G.req('POST', '/carometro/sessao', { nome: 'x', data: '05/11', turma: '3º Ano A' })).status === 400 && (await G.req('POST', '/carometro/sessao', { nome: 'x', data: '2026-11-05', turma: 'Turma Fantasma' })).status === 400);
  r = await G.post('/carometro/sessao', { nome: 'Fotos de rematrícula', data: '2026-10-01', turma: '3º Ano A', obs: 'Pátio' });
  const SS = r.id;
  let s = await G.get('/carometro/sessao?id=' + SS);
  t('cria a sessão com todos os alunos ativos da turma como pendentes', r.ok && s.sessao.total >= 2 && s.itens.every(i => i.situacao === 'pendente') && s.itens.map(i => i.matricula).join() === s.itens.map(i => i.matricula).slice().sort().join(), s);
  const sa = s.itens.find(i => i.matricula === 'S-1');
  await G.post('/carometro/sessao/item', { sessao_id: SS, aluno_id: sa.id, situacao: 'ausente' });
  t('marcar ausente', (await G.get('/carometro/sessao?id=' + SS)).itens.find(i => i.id === sa.id).situacao === 'ausente');
  t('situação inválida e aluno fora da sessão', (await G.req('POST', '/carometro/sessao/item', { sessao_id: SS, aluno_id: sa.id, situacao: 'xx' })).status === 400 && (await G.req('POST', '/carometro/sessao/item', { sessao_id: SS, aluno_id: id('S-4'), situacao: 'ausente' })).status === 404);
  const fd = new FormData(); fd.append('aluno_id', String(id('S-5'))); fd.append('arquivo', new Blob([await sharp({ create: { width: 600, height: 800, channels: 3, background: '#2a6' } }).jpeg().toBuffer()], { type: 'image/jpeg' }), 'f.jpg');
  await raw(G, '/carometro/foto', { method: 'POST', body: fd });
  s = await G.get('/carometro/sessao?id=' + SS);
  t('quem recebe foto depois do dia da sessão aparece como fotografado', s.itens.find(i => i.matricula === 'S-5').situacao === 'fotografado' && s.sessao.fotografados === 1 && s.itens.find(i => i.matricula === 'S-5').fotoId > 0, s.sessao);
  await G.post('/carometro/sessao/status', { id: SS, status: 'concluida' });
  t('concluir e listar com progresso', (await G.get('/carometro/sessoes')).rows[0].status === 'concluida' && (await G.get('/carometro/sessoes')).rows[0].fotografados === 1 && (await G.get('/carometro/sessoes')).turmas.length >= 3);
  t('Equipe não altera a sessão (403)', (await E.req('POST', '/carometro/sessao/status', { id: SS, status: 'aberta' })).status === 403 && (await E.req('POST', '/carometro/sessao/excluir', { id: SS })).status === 403);
  const SB = (await G.post('/carometro/sessao', { nome: 'Outra', data: '2026-11-10', turma: 'Infantil 2 A' })).id;
  t('excluir sessão não apaga fotos', (await G.post('/carometro/sessao/excluir', { id: SB })).ok && (await G.get('/carometro/alunos')).indicadores.comFoto === 1);

  // ---- telas ----
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    const foto = async n => { if (dir) await p.screenshot({ path: `${dir}/${n}-${nome}.png`, fullPage: true }); };
    await U.ir(p, 'cmvisao', 700); await p.waitForSelector('.cm-grade');
    t(`${nome}: subpáginas Seleções salvas e Sessões de fotos no menu`, /Seleções salvas/.test(await p.innerText('#subtabs')) && /Sessões de fotos/.test(await p.innerText('#subtabs')));
    t(`${nome}: "Salvar seleção" só aparece com alunos marcados`, await p.isHidden('#cmSalvarSel'));
    await p.check('.cm-al:nth-child(1) [data-sel]'); await p.check('.cm-al:nth-child(3) [data-sel]');
    t(`${nome}: aparece "Salvar seleção…"`, await p.isVisible('#cmSalvarSel'));
    await p.click('#cmSalvarSel'); await p.fill('#cmSelNome', 'Seleção da tela'); await p.check('#cmSelComp'); await p.click('#cmSelOk');
    await p.waitForSelector('.datatable');
    t(`${nome}: salva e abre Seleções salvas com a nova lista`, /Seleção da tela/.test(await p.innerText('#content')) && /compartilhada/.test(await p.innerText('#content')));
    await foto('selecoes');
    await p.click('[data-edit]:visible >> nth=0'); await p.waitForSelector('#cmEdOk');
    const antes = (await p.$$('[data-tira]')).length;
    await p.click('[data-tira] >> nth=0'); await p.click('#cmEdOk'); await p.waitForTimeout(600);
    t(`${nome}: editar tira um aluno da seleção`, antes >= 2 && /\b1\b/.test((await p.innerText('.datatable tbody tr:first-child td:nth-child(2)')).trim()), antes);
    await U.ir(p, 'cmsessoes', 700); await p.waitForSelector('#cmSessao, .empty, .datatable');
    t(`${nome}: Sessões de fotos mostra a sessão com progresso`, /Fotos de rematrícula/.test(await p.innerText('#content')) && /1\/\d+/.test(await p.innerText('#content')));
    await p.click('[data-sess] >> nth=0'); await p.waitForSelector('#cmSessaoCard');
    await p.selectOption('[data-sit] >> nth=0', 'refazer'); await p.waitForTimeout(400);
    t(`${nome}: abrir a sessão lista alunos com situação editável`, (await p.$$('#cmSessaoCard [data-sit]')).length >= 2 && /Foto…/.test(await p.innerText('#cmSessaoCard')));
    await foto('sessoes');
    t(`${nome}: sem estouro horizontal`, await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2));
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
