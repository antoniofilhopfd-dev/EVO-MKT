// Carômetro Escolar, etapa 5: PDF A4 (turma ou seleção), prévia fiel, matrícula opcional, nomes completos. Dados fictícios.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmpdf-'));
  const linhas = [];
  const longo = 'Maria Eduarda Fernandes de Albuquerque Cavalcanti Neto';
  for (let i = 1; i <= 43; i++) linhas.push({ matricula: 'P-' + String(i).padStart(3, '0'), nome: i === 7 ? longo : `Aluno Fictício ${String(i).padStart(2, '0')}`, turma: '3º Ano A', segmento: '' });
  linhas.push({ matricula: 'P-901', nome: 'Zeca Infantil', turma: 'Infantil 3 B', segmento: '' }, { matricula: 'P-902', nome: 'Bela Série', turma: '1ª Série A', segmento: '' });
  await G.post('/imagem/alunos/importar', { linhas });
  const al = (await G.get('/carometro/alunos?turma=' + encodeURIComponent('3º Ano A'))).rows;
  const up = async (m, cor) => { const a = (await G.get('/carometro/alunos?busca=' + m)).rows[0]; const fd = new FormData(); fd.append('aluno_id', String(a.id)); fd.append('arquivo', new Blob([await sharp({ create: { width: 600, height: 800, channels: 3, background: cor } }).jpeg().toBuffer()], { type: 'image/jpeg' }), 'f.jpg'); await fetch(U.B + '/carometro/foto', { method: 'POST', headers: { Cookie: G.H.Cookie, 'X-EVO': '1' }, body: fd }); return a.id; };
  await up('P-001', '#2a6'); await up('P-007', '#a33'); await up('P-901', '#36c');
  const pdf = (H, qs) => fetch(U.B + '/carometro/pdf?' + qs, { headers: { Cookie: H.H.Cookie, 'X-EVO': '1' } });
  const info = async (buf) => { const f = path.join(tmp, 'x' + Math.random() + '.pdf'); fs.writeFileSync(f, buf); return { f, txt: execFileSync('pdftotext', ['-layout', f, '-']).toString(), inf: execFileSync('pdfinfo', [f]).toString() }; };
  const flat = s => s.replace(/\s+/g, ' ');

  t('sem login: 401', (await fetch(U.B + '/carometro/pdf?origem=turma&turma=x')).status === 401);
  t('origem inválida (400) e turma inexistente (404)', (await pdf(G, 'origem=x')).status === 400 && (await pdf(G, 'origem=turma&turma=Fantasma')).status === 404);
  let r = await pdf(G, 'origem=turma&turma=' + encodeURIComponent('3º Ano A'));
  const buf = Buffer.from(await r.arrayBuffer()), I = await info(buf);
  t('PDF da turma: 200, application/pdf, inline, sem cache', r.status === 200 && r.headers.get('content-type') === 'application/pdf' && /^inline/.test(r.headers.get('content-disposition')) && /no-store/.test(r.headers.get('cache-control')) && buf.subarray(0, 4).toString() === '%PDF');
  t('A4 retrato, 43 alunos em mais de uma página (cabeçalho no cabeçalho de tudo)', /Page size:\s+595\.\d+ x 841\.\d+/.test(I.inf) && +r.headers.get('x-carometro-alunos') === 43 && +r.headers.get('x-carometro-paginas') >= 2 && +/Pages:\s+(\d+)/.exec(I.inf)[1] === +r.headers.get('x-carometro-paginas'), [I.inf.match(/Pages:.*/)?.[0], r.headers.get('x-carometro-paginas')]);
  t('cabeçalho com o colégio, a turma e o total', /Colégio Evolução - Carômetro/.test(I.txt) && /3º Ano A/.test(I.txt) && /43 aluno/.test(I.txt));
  t('nome longo aparece inteiro (não é cortado)', flat(I.txt).includes('Maria Eduarda Fernandes de Albuquerque Cavalcanti Neto') || ['Maria Eduarda', 'Albuquerque', 'Cavalcanti', 'Neto'].every(p => I.txt.includes(p)), I.txt.slice(0, 400));
  t('matrícula fica oculta por padrão; rodapé de uso interno e numeração', !/P-00\d/.test(I.txt) && /uso interno/.test(I.txt) && /Pagina 1 de/.test(I.txt));
  t('as 2 fotos da turma entram como imagens no PDF; os demais têm "Sem foto"', (buf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length >= 2 && /Sem foto/.test(I.txt));
  const I2 = await info(Buffer.from(await (await pdf(G, 'origem=turma&matricula=1&turma=' + encodeURIComponent('3º Ano A'))).arrayBuffer()));
  t('com matrícula=1 as matrículas aparecem', /P-001/.test(I2.txt) && /P-043/.test(I2.txt));
  const Ip = await info(Buffer.from(await (await pdf(G, 'origem=turma&orientacao=paisagem&porlinha=6&turma=' + encodeURIComponent('3º Ano A'))).arrayBuffer()));
  t('paisagem 6 por linha: A4 deitado e mais fotos por página', /Page size:\s+841\.\d+ x 595\.\d+/.test(Ip.inf) && +/Pages:\s+(\d+)/.exec(Ip.inf)[1] >= 2);
  const I4 = await info(Buffer.from(await (await pdf(G, 'origem=turma&porlinha=4&turma=' + encodeURIComponent('3º Ano A'))).arrayBuffer()));
  const I6 = await info(Buffer.from(await (await pdf(G, 'origem=turma&porlinha=6&turma=' + encodeURIComponent('3º Ano A'))).arrayBuffer()));
  t('4 por linha gera mais páginas que 6 por linha (retrato)', +/Pages:\s+(\d+)/.exec(I4.inf)[1] > +/Pages:\s+(\d+)/.exec(I6.inf)[1]);
  t('"só com autorização" sem nenhum autorizado: 404 com mensagem', (await pdf(G, 'origem=turma&so_autorizados=1&turma=' + encodeURIComponent('3º Ano A'))).status === 404);
  // seleção
  const a1 = (await G.get('/carometro/alunos?busca=P-901')).rows[0], a2 = (await G.get('/carometro/alunos?busca=P-902')).rows[0], a3 = (await G.get('/carometro/alunos?busca=P-001')).rows[0];
  const sel = await G.post('/carometro/selecao', { nome: 'Mistura', aluno_ids: [a2.id, a1.id, a3.id] });
  const Is = await info(Buffer.from(await (await pdf(G, 'origem=selecao&selecao=' + sel.id)).arrayBuffer()));
  t('PDF da seleção: várias turmas em ordem escolar, com a turma sob o nome', /Sele(ç|c)(ã|a)o: Mistura/.test(Is.txt) && Is.txt.indexOf('Zeca Infantil') < Is.txt.indexOf('Aluno Fictício 01') && Is.txt.indexOf('Aluno Fictício 01') < Is.txt.indexOf('Bela Série') && /Infantil 3 B/.test(Is.txt), Is.txt.slice(0, 500));
  t('seleção privada não vira PDF para outra pessoa (404)', (await pdf(E, 'origem=selecao&selecao=' + sel.id)).status === 404 && (await pdf(E, 'origem=selecao&selecao=999999')).status === 404);
  r = await pdf(G, 'baixar=1&origem=selecao&selecao=' + sel.id);
  t('baixar=1 vira anexo com nome de arquivo', /^attachment; filename="Carometro-Selecao-Mistura\.pdf"$/.test(r.headers.get('content-disposition')), r.headers.get('content-disposition'));
  t('Equipe também gera o PDF de turma (consulta)', (await pdf(E, 'origem=turma&turma=' + encodeURIComponent('3º Ano A'))).status === 200);

  // telas
  const dir = process.env.CAPTURAS; if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(dir + '/carometro-turma.pdf', buf); fs.writeFileSync(dir + '/carometro-selecao.pdf', Buffer.from(await (await pdf(G, 'origem=selecao&selecao=' + sel.id)).arrayBuffer())); }
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    const foto = async n => { if (dir) await p.screenshot({ path: `${dir}/${n}-${nome}.png`, fullPage: true }); };
    await U.ir(p, 'cmpdf', 900); await p.waitForSelector('#pdfPrev iframe, #pdfPrev .empty');
    t(`${nome}: subpágina Impressão e PDF com opções e prévia`, /Impressão e PDF/.test(await p.innerText('#subtabs')) && await p.$('#pdfPrev iframe') !== null && /aluno\(s\) · \d+ página/.test(await p.innerText('#pdfInfo')));
    await Promise.all([p.waitForResponse(r => /origem=turma/.test(r.url()) && /3%C2%BA\+Ano\+A|3%C2%BA%20Ano%20A/.test(r.url())), p.selectOption('#pdfTurma', '3º Ano A')]); await p.waitForFunction(() => /43 aluno/.test(document.querySelector('#pdfInfo').innerText));
    await Promise.all([p.waitForResponse(r => r.url().includes('/carometro/pdf') && /porlinha=4/.test(r.url())), p.selectOption('#pdfPor', '4')]); await p.waitForFunction(() => /página/.test(document.querySelector('#pdfInfo').innerText));
    t(`${nome}: mudar a grade refaz a prévia (mais páginas)`, +/(\d+) página/.exec(await p.innerText('#pdfInfo'))[1] >= 2);
    await Promise.all([p.waitForResponse(r => /origem=selecao/.test(r.url())), p.selectOption('#pdfOrigem', 'selecao')]); await p.waitForFunction(() => /3 aluno/.test(document.querySelector('#pdfInfo').innerText));
    t(`${nome}: origem "seleção" mostra a lista de seleções e a prévia dela`, !(await p.isHidden('#pdfSel')) && await p.isHidden('#pdfTurma'));
    await p.check('#pdfAut'); await p.waitForSelector('#pdfPrev .empty');
    t(`${nome}: filtro de autorização sem autorizados mostra a mensagem`, /autorização/i.test(await p.innerText('#pdfPrev')));
    await p.uncheck('#pdfAut'); await p.waitForSelector('#pdfPrev iframe');
    await foto('pdf-tela');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#pdfBaixar')]);
    t(`${nome}: "Gerar PDF" baixa o arquivo`, /^Carometro-.*\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    t(`${nome}: sem estouro horizontal`, await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2));
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
