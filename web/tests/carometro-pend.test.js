// Carômetro Escolar, etapa 6: pendências e qualidade (calculadas na hora; decisões de "deixar como está" com motivo e autoria). Dados fictícios.
const fs = require('fs');
const sharp = require('sharp');
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const jpg = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#2a6' } }).jpeg().toBuffer();
  const raw = (H, u, o = {}) => fetch(U.B + u, { headers: { Cookie: H.H.Cookie, 'X-EVO': '1' }, ...o }).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) }));
  const foto = async (m, w, h) => { const a = (await G.get('/carometro/alunos?busca=' + m)).rows[0]; const fd = new FormData(); fd.append('aluno_id', String(a.id)); fd.append('arquivo', new Blob([await jpg(w, h)], { type: 'image/jpeg' }), 'f.jpg'); return raw(G, '/carometro/foto', { method: 'POST', body: fd }); };
  t('sem login: 401', (await fetch(U.B + '/carometro/pendencias')).status === 401);
  let d = await G.get('/carometro/pendencias');
  t('sem alunos: nenhuma pendência', d.abertas === 0 && d.rows.length === 0 && Object.keys(d.tipos).length === 6, d);
  await G.post('/imagem/alunos/importar', { linhas: [
    { matricula: 'Q-1', nome: 'Ana Pend', turma: '3º Ano A', segmento: '' }, { matricula: 'Q-2', nome: 'Bia Pend', turma: '3º Ano A', segmento: '' }, { matricula: 'Q-3', nome: 'Caio Baixa', turma: '3º Ano A', segmento: '' },
    { matricula: 'Q-4', nome: 'Davi Igual', turma: '4º Ano A', segmento: '' }, { matricula: 'Q-5', nome: 'Davi Igual', turma: '4º Ano A', segmento: '' },
    { matricula: 'Q-6', nome: 'Eva Troca', turma: '5º Ano A', segmento: '' }, { matricula: 'Q-7', nome: 'Eva Troca', turma: '5º Ano B', segmento: '' },
    { matricula: 'Q-8', nome: 'Fabi Sem Turma', turma: '', segmento: 'Anos Finais' }, { matricula: 'Q-9', nome: 'Gabi Esquisita', turma: 'Turma Zeta', segmento: 'Anos Finais' }] });
  await foto('Q-1', 600, 800); await foto('Q-3', 150, 150);
  const fd = new FormData(); fd.append('arquivo', new Blob([await jpg(600, 800)], { type: 'image/jpeg' }), 'xyz.jpg');
  await raw(G, '/carometro/lote/fotos', { method: 'POST', body: fd });
  d = await G.get('/carometro/pendencias');
  t('contagem por tipo', d.contagem.sem_foto === 7 && !Object.hasOwn(d.contagem, 'imagem_baixa') && d.contagem.duplicado === 2 && d.contagem.varias_turmas === 2 && d.contagem.sem_turma === 2 && d.contagem.arquivo_orfao === 1 && d.abertas === 14, d.contagem);
  t('foto boa não gera pendência de imagem', !d.rows.some(r => r.matricula === 'Q-1' && r.tipo !== 'x'));
  t('foto pequena (150×150) não gera pendência de qualidade', !d.rows.some(r => r.tipo === 'imagem_baixa'));
  t('turma fora do padrão e aluno sem turma são apontados', d.rows.filter(r => r.tipo === 'sem_turma').map(r => r.matricula).sort().join() === 'Q-8,Q-9');
  t('"mesmo nome em outra turma" cita a outra turma', /5º Ano B/.test(d.rows.find(r => r.tipo === 'varias_turmas' && r.matricula === 'Q-6').detalhe));
  t('arquivo sem aluno aparece com o nome e o lote', /xyz\.jpg/.test(d.rows.find(r => r.tipo === 'arquivo_orfao').detalhe));
  t('filtro por tipo', (await G.get('/carometro/pendencias?tipo=duplicado')).rows.length === 2 && (await G.get('/carometro/pendencias?tipo=duplicado')).rows.every(r => r.tipo === 'duplicado'));
  t('Equipe consulta (200)', (await E.req('GET', '/carometro/pendencias')).status === 200);
  const dup = (await G.get('/carometro/pendencias?tipo=duplicado')).rows.map(r => r.chave);
  t('Equipe não decide nada (403)', (await E.req('POST', '/carometro/pendencias/ignorar', { chaves: dup, motivo: 'gêmeos' })).status === 403 && (await E.req('POST', '/carometro/pendencias/reabrir', { chaves: dup })).status === 403);
  t('motivo curto e lista vazia são recusados (400)', (await G.req('POST', '/carometro/pendencias/ignorar', { chaves: dup, motivo: 'a' })).status === 400 && (await G.req('POST', '/carometro/pendencias/ignorar', { chaves: [], motivo: 'gêmeos' })).status === 400);
  t('chaves inventadas não gravam nada', (await G.post('/carometro/pendencias/ignorar', { chaves: ['duplicado:99999', "x'; DROP TABLE ui_alunos;--"], motivo: 'teste' })).ignoradas === 0);
  const ig = await G.post('/carometro/pendencias/ignorar', { chaves: dup, motivo: 'São gêmeos' });
  d = await G.get('/carometro/pendencias');
  t('deixar como está em lote: some das abertas, vai para as ignoradas com motivo e autor', ig.ignoradas === 2 && d.contagem.duplicado === 0 && d.abertas === 12 && d.ignoradas === 2, d);
  const lig = await G.get('/carometro/pendencias?estado=ignoradas');
  t('lista de ignoradas mostra motivo e quem decidiu', lig.rows.length === 2 && lig.rows.every(r => r.ignorada && r.motivo === 'São gêmeos' && r.por.length > 2), lig.rows[0]);
  await G.post('/carometro/pendencias/reabrir', { chaves: [dup[0]] });
  t('reabrir devolve a pendência para as abertas', (await G.get('/carometro/pendencias')).contagem.duplicado === 1);
  await foto('Q-2', 600, 800);
  t('corrigir (enviar a foto) tira a pendência sozinha', (await G.get('/carometro/pendencias')).contagem.sem_foto === 6);

  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    const cap = async n => { if (dir) await p.screenshot({ path: `${dir}/${n}-${nome}.png`, fullPage: true }); };
    await U.ir(p, 'cmpendencias', 800); await p.waitForSelector('.cm-filtro');
    t(`${nome}: subpágina Pendências com os 6 tipos`, /Pendências/.test(await p.innerText('#subtabs')) && (await p.$$('.cm-filtro')).length === 6);
    await cap('pendencias');
    await p.click('[data-tipo="sem_turma"]'); await p.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
    t(`${nome}: clicar no cartão filtra pelo tipo`, (await p.$$eval('tbody tr td:nth-child(2)', e => e.map(x => x.innerText))).every(x => /Turma não reconhecida/.test(x)));
    await p.check('#pdTodos'); await p.click('#pdLote'); await p.fill('#pdMotivo', 'Turma especial de reforço'); await p.click('#pdOk');
    await p.waitForFunction(() => /Nenhuma pendência aberta/.test(document.querySelector('#content').innerText));
    t(`${nome}: "deixar como está" pede motivo e esvazia a lista`, true);
    await p.selectOption('#pdEstado', 'ignoradas'); await p.waitForFunction(() => /Turma especial de reforço/.test(document.querySelector('#content').innerText));
    t(`${nome}: ignoradas mostram o motivo e permitem reabrir`, /Reabrir selecionadas/.test(await p.innerText('#pdLote')));
    await cap('pendencias-ignoradas');
    await p.check('#pdTodos'); await p.click('#pdLote'); await p.waitForFunction(() => document.querySelector('#pdEstado')?.value === 'ignoradas' && /Nada foi deixado/.test(document.querySelector('#content').innerText));
    t(`${nome}: reabrir devolve as pendências`, true);
    t(`${nome}: sem estouro horizontal`, await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2));
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
