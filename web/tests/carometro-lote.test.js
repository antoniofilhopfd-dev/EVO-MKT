// Carômetro Escolar, etapa 3: importação de fotos em lote (simulação, conciliação por matrícula, conflitos, aplicar, desfazer). Dados fictícios.
const fs = require('fs');
const sharp = require('sharp');
const { zipSync, strToU8 } = require('fflate');
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const jpg = (w = 600, h = 800, cor = '#2a6') => sharp({ create: { width: w, height: h, channels: 3, background: cor } }).jpeg().toBuffer();
  const png = () => sharp({ create: { width: 500, height: 700, channels: 3, background: '#a33' } }).png().toBuffer();
  const raw = (H, u, o = {}) => fetch(U.B + u, { headers: { Cookie: H.H.Cookie, 'X-EVO': '1' }, ...o }).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) }));
  const lote = (H, arqs, manifesto, loteId) => { const fd = new FormData(); if (loteId) fd.append('lote_id', String(loteId)); else if (manifesto) fd.append('manifesto', manifesto); for (const [n, b, ty] of arqs) fd.append('arquivo', new Blob([b], { type: ty || 'image/jpeg' }), n); return raw(H, '/carometro/lote/fotos', { method: 'POST', body: fd }); };
  const envia = (alunoId, buf) => { const fd = new FormData(); fd.append('aluno_id', String(alunoId)); fd.append('arquivo', new Blob([buf], { type: 'image/jpeg' }), 'f.jpg'); return raw(G, '/carometro/foto', { method: 'POST', body: fd }); };

  t('sem login: 401', (await fetch(U.B + '/carometro/lotes')).status === 401);
  t('Equipe não usa o lote (403)', (await E.req('GET', '/carometro/lotes')).status === 403 && (await lote(E, [['a.jpg', await jpg()]])).status === 403);
  await G.post('/imagem/alunos/importar', { linhas: [
    { matricula: 'M-001', nome: 'Ana Silva', turma: '3º Ano A', segmento: '' }, { matricula: 'M-002', nome: 'Bruno Costa', turma: '3º Ano A', segmento: '' },
    { matricula: 'M-003', nome: 'Carlos Mesmo Nome', turma: '4º Ano A', segmento: '' }, { matricula: 'M-004', nome: 'Carlos Mesmo Nome', turma: '4º Ano B', segmento: '' },
    { matricula: 'M-005', nome: 'Davi Lima', turma: '5º Ano A', segmento: '' }] });
  const al = (await G.get('/carometro/alunos')).rows, id = m => al.find(a => a.matricula === m).id;
  const velha = await envia(id('M-002'), await jpg(600, 800, '#999'));
  t('foto individual prévia do M-002', velha.status === 200);

  const man = 'matricula;nome_arquivo;origem\nM-005;foto-do-davi.jpg;pasta_local\nM-999;fantasma.jpg;drive';
  let r = await lote(G, [['M-001.jpg', await jpg()], ['ana_silva.jpg', await jpg(600, 800, '#36c')], ['m-002.PNG', await png(), 'image/png']], man);
  const L = r.j.loteId;
  t('cria o lote (simulação) com as 3 primeiras fotos', r.status === 200 && L > 0, r);
  r = await lote(G, [['carlos_mesmo_nome.jpg', await jpg()], ['desconhecido.jpg', await jpg()], ['foto-do-davi.jpg', await jpg()]], '', L);
  t('acrescenta mais fotos ao mesmo lote', r.status === 200 && r.j.loteId === L);
  r = await lote(G, [['quebrada.jpg', Buffer.from('isto não é imagem')], ['fantasma.jpg', await jpg()]], '', L);
  let d = (await raw(G, '/carometro/lote?id=' + L)).j;
  const it = n => d.itens.find(i => i.arquivo === n);
  t('matrícula exata (inclusive em maiúscula e PNG) = pronta, confiança alta', it('m-002.PNG').estado === 'ok' && it('m-002.PNG').regra === 'Matrícula exata' && it('m-002.PNG').confianca === 'alta' && it('m-002.PNG').alunoId === id('M-002'), it('m-002.PNG'));
  t('o manifesto associa o arquivo à matrícula', it('foto-do-davi.jpg').estado === 'ok' && it('foto-do-davi.jpg').regra === 'Manifesto' && it('foto-do-davi.jpg').alunoId === id('M-005'));
  t('nome do arquivo só SUGERE (baixa confiança), nunca vira pronta sozinha', it('ana_silva.jpg').estado === 'sugerida' && it('ana_silva.jpg').confianca === 'baixa');
  t('nome repetido em dois alunos = ambígua, sem aluno escolhido', it('carlos_mesmo_nome.jpg').estado === 'ambigua' && it('carlos_mesmo_nome.jpg').alunoId === null);
  t('arquivo sem aluno = órfã; manifesto com matrícula inexistente também', it('desconhecido.jpg').estado === 'orfa' && it('fantasma.jpg').estado === 'orfa' && /não existe/.test(it('fantasma.jpg').motivo));
  t('arquivo que não é imagem = inválido, com o motivo', it('quebrada.jpg').estado === 'invalida' && /ler esta imagem/.test(it('quebrada.jpg').motivo));
  t('duas fotos para o mesmo aluno = conflito nas duas', it('M-001.jpg').conflito && it('ana_silva.jpg').conflito && d.resumo.conflitos === 2, d.resumo);
  t('foto que substituiria uma existente é sinalizada', it('m-002.PNG').substitui === true && d.resumo.substituem === 1);
  t('resumo da simulação', d.resumo.prontos === 2 && d.resumo.sugeridas === 1 && d.resumo.ambiguas === 1 && d.resumo.orfas === 2 && d.resumo.invalidas === 1 && d.pendencias === 5, d.resumo);
  t('simulação não grava nada nas fichas', (await G.get('/carometro/alunos')).indicadores.comFoto === 1 && (await G.get('/carometro/aluno?id=' + id('M-001'))).fotos.length === 0);
  t('a prévia do item abre (mas não sem login)', (await fetch(U.B + `/carometro/lote/foto?item=${it('M-001.jpg').id}`, { headers: { Cookie: G.H.Cookie, 'X-EVO': '1' } })).status === 200 && (await fetch(U.B + `/carometro/lote/foto?item=${it('M-001.jpg').id}`)).status === 401);
  t('aplicar com pendências é recusado (409)', (await G.req('POST', '/carometro/lote/aplicar', { lote_id: L })).status === 409);
  const res = (item, acao, extra = {}) => G.post('/carometro/lote/resolver', { lote_id: L, item_id: item, acao, ...extra });
  await res(it('ana_silva.jpg').id, 'ignorar');
  await res(it('desconhecido.jpg').id, 'vincular', { aluno_id: id('M-003') });
  await res(it('carlos_mesmo_nome.jpg').id, 'vincular', { aluno_id: id('M-004') });
  await res(it('fantasma.jpg').id, 'ignorar');
  d = (await raw(G, '/carometro/lote?id=' + L)).j;
  t('decididas as pendências: conflito some e nada mais bloqueia', d.pendencias === 0 && d.resumo.prontos === 5 && d.resumo.ignoradas === 2, d.resumo);
  t('inválida não pode ser vinculada (409)', (await G.req('POST', '/carometro/lote/resolver', { lote_id: L, item_id: it('quebrada.jpg').id, acao: 'vincular', aluno_id: id('M-001') })).status === 409);
  t('vincular a aluno inexistente: 404', (await G.req('POST', '/carometro/lote/resolver', { lote_id: L, item_id: it('M-001.jpg').id, acao: 'vincular', aluno_id: 99999 })).status === 404);
  const ap = await G.post('/carometro/lote/aplicar', { lote_id: L });
  t('aplicar: 5 fotos, 1 substituiu uma anterior', ap.ok && ap.aplicadas === 5 && ap.substituidas === 1, ap);
  let lista = await G.get('/carometro/alunos');
  t('os 5 alunos passam a ter foto', lista.indicadores.comFoto === 5 && lista.rows.every(a => a.fotoId), lista.indicadores);
  const h2 = (await G.get('/carometro/aluno?id=' + id('M-002'))).fotos;
  t('M-002 guarda a antiga no histórico e a origem do lote', h2.length === 2 && h2[0].origem === 'lote-' + L && h2[1].ativa === 0, h2);
  t('lote aplicado não aceita nova decisão nem novo aplicar (409)', (await G.req('POST', '/carometro/lote/aplicar', { lote_id: L })).status === 409 && (await G.req('POST', '/carometro/lote/resolver', { lote_id: L, item_id: 1, acao: 'ignorar' })).status === 409);
  t('a prévia temporária do lote foi apagada', (await fetch(U.B + `/carometro/lote/foto?item=${it('M-001.jpg').id}`, { headers: { Cookie: G.H.Cookie, 'X-EVO': '1' } })).status === 404);
  // alteração posterior: M-005 recebe outra foto depois do lote
  await envia(id('M-005'), await jpg(600, 800, '#111'));
  const de = await G.post('/carometro/lote/desfazer', { lote_id: L });
  t('desfazer: reverte o que não mudou e mantém o que foi alterado depois', de.ok && de.desfeitas === 4 && de.mantidas === 1, de);
  lista = await G.get('/carometro/alunos');
  t('M-001, M-003 e M-004 voltam a sem foto; M-002 volta à foto antiga; M-005 mantém a nova', lista.rows.filter(a => !a.fotoId).map(a => a.matricula).sort().join() === 'M-001,M-003,M-004' && (await G.get('/carometro/aluno?id=' + id('M-002'))).fotos.find(f => f.ativa === 1).versao === 1 && lista.rows.find(a => a.matricula === 'M-005').fotoId, lista.indicadores);
  t('desfazer duas vezes: 409', (await G.req('POST', '/carometro/lote/desfazer', { lote_id: L })).status === 409);
  // cancelar
  r = await lote(G, [['M-001.jpg', await jpg()]]); const L2 = r.j.loteId;
  const itc = (await raw(G, '/carometro/lote?id=' + L2)).j.itens[0];
  t('cancelar o lote descarta tudo e não altera fichas', (await G.post('/carometro/lote/cancelar', { lote_id: L2 })).ok && (await fetch(U.B + `/carometro/lote/foto?item=${itc.id}`, { headers: { Cookie: G.H.Cookie, 'X-EVO': '1' } })).status === 404 && (await G.get('/carometro/aluno?id=' + id('M-001'))).fotos.filter(f => f.ativa).length === 0 && (await G.req('POST', '/carometro/lote/aplicar', { lote_id: L2 })).status === 409);
  t('lotes recentes listam os 2 com a situação', (await raw(G, '/carometro/lotes')).j.rows.map(x => x.estado).join() === 'cancelado,desfeito');
  r = await lote(G, Array.from({ length: 3 }, (_, i) => [`x${i}.jpg`, Buffer.from('x')]), '', 424242);
  t('lote inexistente: 404', r.status === 404);

  // ---- lote de uma turma só ----
  await G.post('/imagem/alunos/importar', { linhas: [
    { matricula: 'T-1', nome: 'João Pedro Silva', turma: 'Turma T 1º Ano A', segmento: 'Anos Iniciais' }, { matricula: 'T-2', nome: 'Maria Clara Souza', turma: 'Turma T 1º Ano A', segmento: 'Anos Iniciais' },
    { matricula: 'T-3', nome: 'Maria Clara Lima', turma: 'Turma T 1º Ano A', segmento: 'Anos Iniciais' }, { matricula: 'T-4', nome: 'Pedro Alves', turma: 'Turma T 1º Ano A', segmento: 'Anos Iniciais' },
    { matricula: 'U-1', nome: 'Uma Aluna', turma: '2º Ano U', segmento: '' }, { matricula: 'U-2', nome: 'Outro Aluno', turma: '2º Ano U', segmento: '' }] });
  const TT = 'Turma T 1º Ano A';
  const loteT = (arqs, turma) => { const fd = new FormData(); if (turma) fd.append('turma', turma); for (const [n, b] of arqs) fd.append('arquivo', new Blob([b], { type: 'image/jpeg' }), n); return raw(G, '/carometro/lote/fotos', { method: 'POST', body: fd }); };
  t('turma sem alunos: 404', (await loteT([['a.jpg', await jpg()]], 'Turma Fantasma')).status === 404);
  r = await loteT([['T-1.jpg', await jpg()], ['maria-souza.jpg', await jpg()], ['maria-clara.jpg', await jpg()], ['M-001.jpg', await jpg()], ['pedro.jpg', await jpg()]], TT);
  const LT = r.j.loteId; d = (await raw(G, '/carometro/lote?id=' + LT)).j;
  const itT = n => d.itens.find(i => i.arquivo === n);
  t('lote da turma: guarda a turma e lista os 4 alunos dela', d.lote.turma === TT && d.alunosTurma.length === 4 && d.faltam.length === 2, d.lote);
  t('matrícula exata dentro da turma = pronta', itT('T-1.jpg').estado === 'ok' && itT('T-1.jpg').alunoId === (await G.get('/carometro/alunos?busca=T-1')).rows[0].id);
  t('parte do nome ("maria souza") que aponta para um só aluno da turma = sugestão', itT('maria-souza.jpg').estado === 'sugerida' && itT('maria-souza.jpg').aluno === 'Maria Clara Souza', itT('maria-souza.jpg'));
  t('parte do nome que serve para dois alunos = ambígua, sem escolher', itT('maria-clara.jpg').estado === 'ambigua' && itT('pedro.jpg').estado === 'ambigua' && itT('pedro.jpg').alunoId === null);
  t('matrícula de aluno de OUTRA turma não vale neste lote (órfã)', itT('M-001.jpg').estado === 'orfa' && /desta turma/.test(itT('M-001.jpg').motivo));
  t('vincular a aluno de outra turma é recusado (409)', (await G.req('POST', '/carometro/lote/resolver', { lote_id: LT, item_id: itT('maria-clara.jpg').id, acao: 'vincular', aluno_id: id('M-002') })).status === 409);
  const tId = m => (d.alunosTurma.find(a => a.matricula === m) || {}).id;
  await G.post('/carometro/lote/resolver', { lote_id: LT, item_id: itT('maria-clara.jpg').id, acao: 'vincular', aluno_id: tId('T-3') });
  await G.post('/carometro/lote/resolver', { lote_id: LT, item_id: itT('maria-souza.jpg').id, acao: 'confirmar' });
  await G.post('/carometro/lote/resolver', { lote_id: LT, item_id: itT('pedro.jpg').id, acao: 'ignorar' });
  await G.post('/carometro/lote/resolver', { lote_id: LT, item_id: itT('M-001.jpg').id, acao: 'ignorar' });
  d = (await raw(G, '/carometro/lote?id=' + LT)).j;
  t('depois de decidir: faltam só os alunos sem foto no lote (Pedro Alves)', d.pendencias === 0 && d.faltam.map(a => a.matricula).join() === 'T-4', d.faltam);
  const apT = await G.post('/carometro/lote/aplicar', { lote_id: LT });
  t('aplica as 3 fotos da turma', apT.aplicadas === 3 && (await G.get('/carometro/alunos?turma=' + encodeURIComponent(TT))).rows.filter(a => a.fotoId).length === 3);
  t('lotes recentes mostram a turma', (await raw(G, '/carometro/lotes')).j.rows.some(x => x.id === LT && x.turma === TT));

  // ---- turma completa: ZIP + ligar pela ordem ----
  await G.post('/imagem/alunos/importar', { linhas: ['Ana Z', 'Bia Z', 'Caio Z', 'Davi Z'].map((nome, i) => ({ matricula: 'Z-' + (i + 1), nome, turma: 'Turma Z 3º Ano A', segmento: 'Anos Iniciais' })) });
  const TZ = 'Turma Z 3º Ano A';
  const zipDe = async n => zipSync({ ...Object.fromEntries(await Promise.all(Array.from({ length: n }, async (_, i) => ['fotos/IMG_' + String(i + 1).padStart(4, '0') + '.jpg', new Uint8Array(await jpg())]))), '__MACOSX/fotos/._IMG_0001.jpg': strToU8('lixo'), 'fotos/leiame.txt': strToU8('nada') });
  const enviaZip = (bytes, turma, nome = 'turma.zip') => { const fd = new FormData(); if (turma) fd.append('turma', turma); fd.append('arquivo', new Blob([bytes], { type: 'application/zip' }), nome); return raw(G, '/carometro/lote/fotos', { method: 'POST', body: fd }); };
  t('ZIP inválido e ZIP sem fotos são recusados (400)', (await enviaZip(Buffer.from('não é zip'), TZ)).status === 400 && (await enviaZip(zipSync({ 'a.txt': strToU8('x') }), TZ)).status === 400);
  r = await enviaZip(await zipDe(4), TZ);
  const LZ = r.j.loteId; d = (await raw(G, '/carometro/lote?id=' + LZ)).j;
  t('o ZIP vira uma foto por imagem (ignora lixo do Mac e texto)', r.status === 200 && d.itens.length === 4 && d.itens.map(i => i.arquivo).join() === 'IMG_0001.jpg,IMG_0002.jpg,IMG_0003.jpg,IMG_0004.jpg' && d.itens.every(i => i.estado === 'orfa'), d.itens.map(i => [i.arquivo, i.estado]));
  t('ligar pela ordem só vale para lote de turma e exige fotos soltas', (await G.req('POST', '/carometro/lote/preencher-ordem', { lote_id: L })).status === 409 || (await G.req('POST', '/carometro/lote/preencher-ordem', { lote_id: L })).status === 400);
  const po = await G.post('/carometro/lote/preencher-ordem', { lote_id: LZ });
  const itZ = po.itens;
  t('ligar pela ordem: arquivo 1 → 1º aluno (ordem alfabética), como sugestão de baixa confiança', po.ligadas === 4 && po.sobraram === 0 && itZ.map(i => i.aluno).join() === 'Ana Z,Bia Z,Caio Z,Davi Z' && itZ.every(i => i.estado === 'sugerida' && i.regra === 'Ordem dos arquivos' && i.confianca === 'baixa'), itZ.map(i => [i.arquivo, i.aluno, i.estado]));
  t('sugestões ainda bloqueiam o aplicar (409)', (await G.req('POST', '/carometro/lote/aplicar', { lote_id: LZ })).status === 409);
  const ct = await G.post('/carometro/lote/confirmar-todas', { lote_id: LZ });
  t('confirmar todas as sugestões libera o lote', ct.confirmadas === 4 && ct.pendencias === 0 && ct.resumo.prontos === 4, ct.resumo);
  t('ligar pela ordem de novo: 409 (nada solto)', (await G.req('POST', '/carometro/lote/preencher-ordem', { lote_id: LZ })).status === 409);
  t('aplica a turma inteira de uma vez', (await G.post('/carometro/lote/aplicar', { lote_id: LZ })).aplicadas === 4 && (await G.get('/carometro/alunos?turma=' + encodeURIComponent(TZ))).rows.every(a => a.fotoId));
  // menos fotos que alunos: sobram alunos; mais fotos que alunos: sobram fotos
  r = await enviaZip(await zipDe(6), 'Turma T 1º Ano A'); const LM = r.j.loteId;
  const pm = await G.post('/carometro/lote/preencher-ordem', { lote_id: LM });
  t('mais fotos que alunos livres: liga até acabar os alunos e avisa que sobraram', pm.ligadas >= 1 && pm.sobraram === 6 - pm.ligadas && pm.itens.filter(i => i.estado === 'orfa').length === pm.sobraram, [pm.ligadas, pm.sobraram]);
  await G.post('/carometro/lote/cancelar', { lote_id: LM });

  // ---- telas reais ----
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    const foto = async n => { if (dir) await p.screenshot({ path: `${dir}/${n}-${nome}.png`, fullPage: true }); };
    await U.ir(p, 'cmimport', 700); await p.waitForSelector('#cmSimular');
    t(`${nome}: subpágina Importação no menu do Carômetro`, /Importação/.test(await p.innerText('#subtabs')) && /Lotes recentes/.test(await p.innerText('#content')));
    const nomes = nome === 'desktop' ? ['M-003.jpg', 'M-004.jpg', 'sem-dono.jpg'] : ['M-001.jpg'];
    await p.setInputFiles('#cmFotos', await Promise.all(nomes.map(async n => ({ name: n, mimeType: 'image/jpeg', buffer: await jpg() }))));
    await p.click('#cmSimular'); await p.waitForSelector('.cm-lote tbody tr');
    t(`${nome}: simulação mostra uma linha por foto, com prévia`, (await p.$$('.cm-lote tbody tr')).length === nomes.length && (await p.$$('.cm-lote .cm-mini')).length === nomes.length);
    await foto('importacao-simulacao');
    if (nome === 'desktop') {
      t(`${nome}: foto sem aluno bloqueia o "Aplicar lote"`, await p.isDisabled('#cmAplicar') && /Sem aluno/.test(await p.innerText('#cmLoteCard')));
      await p.click('.cm-lote tbody tr:last-child [data-ign]'); await p.waitForFunction(() => !document.querySelector('#cmAplicar').disabled);
    }
    await p.click('#cmAplicar'); await p.click('#dlgOk');
    await p.waitForFunction(() => /Aplicado/.test(document.querySelector('#cmLoteCard h2')?.innerText || ''));
    t(`${nome}: lote aplicado aparece em "Lotes recentes" com opção de desfazer`, /Desfazer/.test(await p.innerText('#cmLotes')));
    if (nome === 'desktop') {
      t(`${nome}: a seção "turma por turma" lista as turmas`, (await p.$$eval('#cmTurmaLote option', o => o.length)) >= 5);
      await p.selectOption('#cmTurmaLote', '2º Ano U');
      await p.setInputFiles('#cmFotosT', await Promise.all(['U-1.jpg', 'qualquer-coisa.jpg'].map(async n => ({ name: n, mimeType: 'image/jpeg', buffer: await jpg() }))));
      await p.click('#cmSimularT'); await p.waitForFunction(() => /2º Ano U/.test(document.querySelector('#cmLoteCard h2')?.innerText || ''));
      t(`${nome}: lote da turma mostra quem ainda está sem foto e um seletor com os alunos da turma`, /Ainda sem foto neste lote \(1 de 2\)/.test(await p.innerText('#cmLoteCard')) && await p.$('[data-alu]') !== null);
      await p.selectOption('[data-alu]', { label: 'Outro Aluno (U-2)' });
      await p.waitForFunction(() => /Todos os alunos da turma têm foto neste lote/.test(document.querySelector('#cmLoteCard').innerText));
      await p.click('#cmAplicar'); await p.click('#dlgOk');
      await p.waitForFunction(() => /Aplicado/.test(document.querySelector('#cmLoteCard h2')?.innerText || ''));
      t(`${nome}: vincular pelo seletor e aplicar a turma`, true);
      await foto('importacao-turma');
    }
    await foto('importacao-aplicado');
    t(`${nome}: sem estouro horizontal`, await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2));
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
