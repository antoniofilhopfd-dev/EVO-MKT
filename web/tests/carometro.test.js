// Carômetro Escolar, etapa 1: consulta de alunos por segmento/série/turma, indicadores, ficha e telas. Dados 100% fictícios.
const fs = require('fs');
const U = require('./lib/ui');
const sharp = require('sharp');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]);
  t('sem login: 401 em todas as rotas', (await fetch(U.B + '/carometro/alunos')).status === 401 && (await fetch(U.B + '/carometro/turmas')).status === 401 && (await fetch(U.B + '/carometro/aluno?id=1')).status === 401);
  t('só consulta: POST recusado', (await G.req('POST', '/carometro/alunos', {})).status === 405);
  let r = await G.get('/carometro/alunos');
  t('sem alunos: indicadores zerados', r.indicadores.alunos === 0 && r.rows.length === 0, r);
  const A = [['C-1', 'Ana Fictícia', 'Maternal A'], ['C-2', 'Bia Exemplo', 'Infantil 2 A'], ['C-3', 'Caio Teste', 'Infantil 4 B'], ['C-4', 'Davi Modelo', '1º Ano A'], ['C-5', 'Eva Nome', '3º Ano A'],
    ['C-6', 'Eva Nome', '3º Ano A'], ['C-7', 'Fabi Final', '7º Ano B'], ['C-8', 'Gabi Médio', '2ª Série A'], ['C-9', 'Hugo Sem Turma', ''], ['C-10', 'Iara Dez', '3º Ano B']];
  const imp = await G.post('/imagem/alunos/importar', { linhas: A.map(([matricula, nome, turma]) => ({ matricula, nome, turma, segmento: '' })) });
  t('base de teste importada', (imp.novos ?? imp.body?.novos) >= 8, imp);
  r = await G.get('/carometro/alunos');
  const seg = n => r.rows.find(a => a.nome === n)?.segmento;
  t('segmentos do carômetro deduzidos da turma', seg('Ana Fictícia') === 'MATERNAL' && seg('Bia Exemplo') === 'INFANTIL' && seg('Caio Teste') === 'JARDINS' && seg('Davi Modelo') === 'JARDINS' && seg('Eva Nome') === 'INICIAIS' && seg('Fabi Final') === 'FINAIS' && seg('Gabi Médio') === 'MEDIO' && seg('Hugo Sem Turma') === '', r.rows.map(a => [a.nome, a.segmento]));
  t('ordem escolar: maternal, infantil, 1º ano… série; sem turma por último', r.rows.map(a => a.turma).join('|').startsWith('Maternal A|Infantil 2 A|Infantil 4 B|1º Ano A|3º Ano A') && r.rows.at(-1).nome === 'Hugo Sem Turma', r.rows.map(a => a.turma));
  t('indicadores: total, sem foto, duplicados e sem turma reconhecida', r.indicadores.alunos === 10 && r.indicadores.comFoto === 0 && r.indicadores.semFoto === 10 && r.indicadores.duplicados === 2 && r.indicadores.semTurma === 1, r.indicadores);
  t('nenhuma foto nem dado extra (CPF, responsável) nas linhas', r.rows.every(a => a.fotoId === null && !('cpf' in a) && !('responsavel_nome' in a) && !('_vence' in a)));
  r = await G.get('/carometro/alunos?segmento=INICIAIS');
  t('filtro por segmento não mistura turmas', r.rows.length === 3 && r.rows.every(a => a.segmento === 'INICIAIS') && r.series.join() === '3º Ano' && r.turmas.join() === '3º Ano A,3º Ano B', r);
  r = await G.get('/carometro/alunos?serie=' + encodeURIComponent('3º Ano') + '&turma=' + encodeURIComponent('3º Ano B'));
  t('filtro por série e turma', r.rows.length === 1 && r.rows[0].nome === 'Iara Dez');
  r = await G.get('/carometro/alunos?busca=' + encodeURIComponent('EVA'));
  t('busca por nome sem acento/caixa e por matrícula', r.rows.length === 2 && (await G.get('/carometro/alunos?busca=c-7')).rows.length === 1 && (await G.get('/carometro/alunos?busca=medio')).rows.length === 1);
  t('busca inexistente devolve lista vazia', (await G.get('/carometro/alunos?busca=zzzz')).rows.length === 0);
  r = await G.get('/carometro/alunos?autorizacao=AUTORIZADO');
  t('sem solicitação: ninguém autorizado; todos "sem informação"', r.rows.length === 0 && (await G.get('/carometro/alunos?autorizacao=SEM_INFORMACAO')).rows.length === 10);
  const tr = await G.get('/carometro/turmas');
  const ini = tr.segmentos.find(s => s.k === 'INICIAIS');
  t('árvore de turmas: segmentos na ordem, contagens e séries', tr.segmentos.map(s => s.k).join() === 'MATERNAL,INFANTIL,JARDINS,INICIAIS,FINAIS,MEDIO' && ini.alunos === 3 && ini.series[0].serie === '3º Ano' && ini.series[0].turmas.map(x => x.alunos).join() === '2,1' && tr.semSegmento === 1 && tr.total === 10, tr);
  // autorização informativa vinda do Uso de Imagem
  const mod = (await G.get('/imagem/modelos')).rows.find(m => m.ativo) ?? (await G.get('/imagem/modelos')).rows[0];
  const ana = (await G.get('/carometro/alunos?busca=C-1')).rows[0];
  const cr = await G.post('/imagem/solicitacoes/criar', { modelo_id: mod.id, alunos: [{ id: ana.id }] });
  t('solicitação pendente não vira autorização', (await G.get('/carometro/aluno?id=' + ana.id)).aluno.autorizacao === 'SEM_INFORMACAO', cr);
  const f = await G.get('/carometro/aluno?id=' + ana.id);
  t('ficha traz os dados mínimos e o ano letivo', f.aluno.matricula === 'C-1' && f.aluno.turma === 'Maternal A' && f.aluno.segmento === 'MATERNAL' && f.aluno.colegasNaTurma === 1 && /^\d{4}$/.test(f.aluno.anoLetivo), f);
  t('ficha de aluno inexistente: 404', (await G.req('GET', '/carometro/aluno?id=999999')).status === 404);

  // ---- fotos (etapa 2) ----
  const E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const jpg = (w, h, cor = { r: 40, g: 90, b: 160 }, exif = true) => { let s = sharp({ create: { width: w, height: h, channels: 3, background: cor } }); if (exif) s = s.withExif({ IFD0: { Copyright: 'FOTO-PRIVADA-TESTE' } }); return s.jpeg({ quality: 90 }).toBuffer(); };
  const envia = (H, alunoId, buf, nome = 'foto.jpg', tipo = 'image/jpeg') => { const fd = new FormData(); fd.append('aluno_id', String(alunoId)); fd.append('arquivo', new Blob([buf], { type: tipo }), nome); return fetch(U.B + '/carometro/foto', { method: 'POST', headers: { Cookie: H.H.Cookie, 'X-EVO': '1' }, body: fd }).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) })); };
  const baixa = (H, u) => fetch(U.B + u, { headers: { Cookie: H.H.Cookie, 'X-EVO': '1' } });
  const iara = (await G.get('/carometro/alunos?busca=C-10')).rows[0], bia = (await G.get('/carometro/alunos?busca=C-2')).rows[0];
  t('Equipe não envia foto (403)', (await envia(E, iara.id, await jpg(600, 800))).status === 403);
  t('sem login: envio e leitura recusados (401)', (await fetch(U.B + '/carometro/foto', { method: 'POST', headers: { 'X-EVO': '1' }, body: new FormData() })).status === 401 && (await fetch(U.B + '/carometro/foto?id=1')).status === 401);
  t('arquivo que não é imagem (texto com nome .jpg) é recusado', (await envia(G, iara.id, Buffer.from('não sou uma foto'), 'x.jpg')).status === 400);
  t('GIF é recusado (formato não aceito)', (await envia(G, iara.id, await sharp({ create: { width: 300, height: 400, channels: 3, background: '#fff' } }).gif().toBuffer(), 'x.gif', 'image/gif')).status === 400);
  t('foto pequena demais (100×100) é recusada', (await envia(G, iara.id, await jpg(100, 100))).status === 400);
  t('foto de mais de 5 MB é recusada (413)', (await envia(G, iara.id, Buffer.alloc(5 * 1048576 + 10, 1))).status === 413);
  t('aluno inexistente: 404', (await envia(G, 999999, await jpg(600, 800))).status === 404);
  let up = await envia(G, iara.id, await jpg(900, 1200));
  t('Gerência envia a foto (200)', up.status === 200 && up.j.ok && up.j.id > 0, up);
  r = await G.get('/carometro/alunos?busca=C-10');
  t('lista passa a mostrar a foto e o indicador "com foto"', r.rows[0].fotoId === up.j.id && r.indicadores.comFoto === 1 && (await G.get('/carometro/alunos')).indicadores.semFoto === 9);
  const mini = await baixa(G, `/carometro/foto?id=${up.j.id}&tam=mini`), pad = await baixa(G, `/carometro/foto?id=${up.j.id}&tam=padrao`);
  const mm = await sharp(Buffer.from(await mini.arrayBuffer())).metadata(), pm = await sharp(Buffer.from(await pad.arrayBuffer())).metadata();
  t('miniatura 240×320 e foto padrão 600×800, JPEG', mini.headers.get('content-type') === 'image/jpeg' && mm.width === 240 && mm.height === 320 && pm.width === 600 && pm.height === 800, [mm.width, mm.height, pm.width, pm.height]);
  t('foto nunca é pública nem guardada em cache', /no-store/.test(pad.headers.get('cache-control')) && /private|no-store/.test(pad.headers.get('cache-control')) && pad.headers.get('x-content-type-options') === 'nosniff');
  t('derivadas sem metadados (EXIF) do original', !pm.exif && !mm.exif);
  t('Equipe vê a foto padrão, mas não baixa o original (403)', (await baixa(E, `/carometro/foto?id=${up.j.id}&tam=padrao`)).status === 200 && (await baixa(E, `/carometro/foto?id=${up.j.id}&tam=original`)).status === 403);
  const orig = await baixa(G, `/carometro/foto?id=${up.j.id}&tam=original`), ob = Buffer.from(await orig.arrayBuffer());
  t('Gerência baixa o original intacto (900×1200, com os metadados)', orig.status === 200 && /attachment/.test(orig.headers.get('content-disposition')) && (await sharp(ob).metadata()).width === 900 && !!(await sharp(ob).metadata()).exif);
  t('foto id inexistente: 404', (await baixa(G, '/carometro/foto?id=999999')).status === 404);
  const v2 = await envia(G, iara.id, await jpg(1200, 800, { r: 200, g: 100, b: 20 }), 'horizontal.jpg');
  t('substituir cria a versão 2 e avisa da foto na horizontal', v2.status === 200 && /horizontal/i.test(v2.j.aviso), v2);
  const fi = await G.get('/carometro/aluno?id=' + iara.id);
  t('histórico guarda as 2 versões; só a nova é a atual', fi.fotos.length === 2 && fi.fotos[0].versao === 2 && fi.fotos[0].ativa === 1 && fi.fotos[1].ativa === 0 && fi.podeEditar === true, fi.fotos);
  t('a versão antiga continua acessível', (await baixa(G, `/carometro/foto?id=${up.j.id}&tam=padrao`)).status === 200);
  t('restaurar uma versão já atual: 409', (await G.req('POST', '/carometro/foto/restaurar', { id: v2.j.id })).status === 409);
  r = await G.post('/carometro/foto/restaurar', { id: up.j.id });
  t('restaurar a versão 1 a torna a atual (a 2 vai para o histórico)', r.ok && (await G.get('/carometro/alunos?busca=C-10')).rows[0].fotoId === up.j.id);
  t('Equipe não restaura nem retira (403) e vê podeEditar=false', (await E.req('POST', '/carometro/foto/restaurar', { id: v2.j.id })).status === 403 && (await E.req('POST', '/carometro/foto/remover', { aluno_id: iara.id })).status === 403 && (await E.get('/carometro/aluno?id=' + iara.id)).podeEditar === false);
  r = await G.post('/carometro/foto/remover', { aluno_id: iara.id });
  t('retirar a foto atual: aluno volta a "sem foto", mas o histórico permanece', r.ok && (await G.get('/carometro/alunos?busca=C-10')).rows[0].fotoId === null && (await G.get('/carometro/aluno?id=' + iara.id)).fotos.length === 2);
  t('retirar de novo sem foto atual: 404', (await G.req('POST', '/carometro/foto/remover', { aluno_id: iara.id })).status === 404);
  t('Equipe não exclui definitivamente (403)', (await E.req('POST', '/carometro/foto/excluir', { id: v2.j.id })).status === 403 && (await E.get('/carometro/aluno?id=' + iara.id)).podeExcluir === false);
  if ((await G.get('/carometro/aluno?id=' + iara.id)).podeExcluir) {
    const x = await G.post('/carometro/foto/excluir', { id: v2.j.id });
    const dep = [(await baixa(G, `/carometro/foto?id=${v2.j.id}&tam=padrao`)).status, (await G.get('/carometro/aluno?id=' + iara.id)).fotos.length];
    t('Administrador exclui a versão definitivamente (arquivos incluídos)', x.ok && dep[0] === 404 && dep[1] === 1, [x, dep]);
  } else t('Gerente comum não exclui definitivamente (403)', (await G.req('POST', '/carometro/foto/excluir', { id: v2.j.id })).status === 403);
  await envia(G, iara.id, await jpg(600, 800), 'final.jpg');
  await envia(G, bia.id, await jpg(500, 700, { r: 20, g: 140, b: 80 }), 'bia.jpg');

  // ---- telas reais ----
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    const foto = async n => { if (dir) await p.screenshot({ path: `${dir}/${n}-${nome}.png`, fullPage: true }); };
    await U.ir(p, 'cmvisao', 700); await p.waitForSelector('.cm-grade');
    t(`${nome}: menu tem a área Carômetro com Visão geral e Segmentos e turmas`, /Carômetro/.test(await p.innerText('#nav')) && /Segmentos e turmas/.test(await p.innerText('#subtabs')));
    t(`${nome}: grade com os 10 alunos; só quem tem foto mostra imagem, servida pela API autenticada (sem URL pública)`, (await p.$$('.cm-al')).length === 10 && (await p.$$eval('.cm-al img', e => e.map(i => i.getAttribute('src')))).filter(u => /^\/api\/carometro\/foto\?id=\d+&tam=mini$/.test(u)).length === (nome === 'desktop' ? 2 : 3) && new RegExp('Com foto\\s*' + (nome === 'desktop' ? 2 : 3)).test((await p.innerText('#cmInd')).replace(/\n/g, ' ')));
    t(`${nome}: cartões de indicadores`, /Sem foto/.test(await p.innerText('#cmInd')) && /Possíveis duplicados/.test(await p.innerText('#cmInd')));
    await foto('visao-grade');
    await p.selectOption('#cmSeg', 'INICIAIS'); await p.waitForFunction(() => document.querySelectorAll('.cm-al').length === 3);
    t(`${nome}: filtrar por segmento restringe a grade e as séries`, (await p.$$eval('#cmSerie option', o => o.map(x => x.textContent))).join() === 'Todas as séries,3º Ano');
    await p.check('.cm-al [data-sel]');
    await p.selectOption('#cmSeg', ''); await p.waitForFunction(() => document.querySelectorAll('.cm-al').length === 10);
    await p.check('.cm-al:nth-child(1) [data-sel]');
    t(`${nome}: seleção de várias turmas persiste entre filtros`, /2 selecionado\(s\) de 2 turma\(s\)/.test(await p.innerText('#cmSelTxt')));
    await p.click('[data-vista="lista"]'); await p.waitForSelector('.ui-tab');
    t(`${nome}: vista em lista mantém a seleção`, (await p.$$('.ui-tab [data-sel]:checked')).length === 2);
    await foto('visao-lista');
    if (nome === 'desktop') {
      await p.fill('#cmBusca', 'caio'); await p.waitForFunction(() => document.querySelectorAll('.ui-tab tbody tr').length === 1);
      await p.click('.ui-lk'); await p.waitForSelector('#cmEnviar');
      t(`${nome}: ficha sem foto oferece "Enviar foto…"`, /Enviar foto/.test(await p.innerText('#cmEnviar')));
      await p.setInputFiles('#cmArq', { name: 'caio.jpg', mimeType: 'image/jpeg', buffer: await sharp({ create: { width: 750, height: 1000, channels: 3, background: '#2a6' } }).jpeg().toBuffer() });
      await p.waitForSelector('.cm-ficha .cm-foto img');
      t(`${nome}: foto enviada pela tela aparece na ficha e no histórico`, /Substituir foto/.test(await p.innerText('#cmEnviar')) && /Histórico da foto/.test(await p.innerText('.cm-ficha')) && (await p.$$('.cm-ficha tbody tr')).length >= 7 );
      await foto('ficha-com-foto');
      await p.click('.cm-ficha [data-close]'); await p.waitForFunction(() => !document.querySelector('.cm-ficha'));
      await p.fill('#cmBusca', ''); await p.waitForFunction(() => document.querySelectorAll('.ui-tab tbody tr').length === 10);
    }
    await p.fill('#cmBusca', 'iara'); await p.waitForFunction(() => document.querySelectorAll('.ui-tab tbody tr').length === 1);
    await p.click('.ui-lk'); await p.waitForSelector('.cm-ficha');
    t(`${nome}: ficha abre com dados e aviso de autorização`, /Iara Dez/.test(await p.innerText('.cm-ficha')) && /Sem informação/.test(await p.innerText('.cm-ficha')) && /não significa autorização/.test(await p.innerText('.cm-ficha')));
    await foto('ficha');
    await p.click('.cm-ficha [data-close]'); await p.waitForFunction(() => !document.querySelector('.cm-ficha'));
    await U.ir(p, 'cmturmas', 700); await p.waitForSelector('.cm-segs');
    t(`${nome}: segmentos e turmas lista as turmas com contagem`, /Anos Iniciais/.test(await p.innerText('.cm-segs')) && /3º Ano A\s*\(2\)/.test(await p.innerText('.cm-segs')));
    await foto('turmas');
    await p.click('[data-turma="3º Ano A"]'); await p.waitForFunction(() => document.querySelectorAll('.cm-al, .ui-tab tbody tr').length === 2);
    t(`${nome}: clicar na turma abre a visão geral filtrada`, (await p.inputValue('#cmTurma')) === '3º Ano A');
    t(`${nome}: sem estouro horizontal`, await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2));
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
