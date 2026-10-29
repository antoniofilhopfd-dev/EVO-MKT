// Uso de Imagem, etapa 3: link único + código, portal do responsável (autorizo / não autorizo), assinatura desenhada (touch e mouse), GOV.BR com validação manual.
// Dados 100% fictícios. Uso: node uiportal.test.js <install.out>
const fs = require('fs');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const sql = q => execFileSync('mariadb', ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N'], { encoding: 'utf8', input: q }).trim();
const BASE = U.B.replace(/\/api$/, '');
const H = { 'Content-Type': 'application/json', 'X-EVO': '1' };
const pub = async (rota, corpo) => { const r = await fetch(U.B + rota, { method: 'POST', headers: H, body: JSON.stringify(corpo) }); const ct = r.headers.get('content-type') || ''; return { s: r.status, j: ct.includes('json') ? await r.json() : null, buf: ct.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : null, ct }; };
const tokenDe = link => link.split('#')[1];
const traco = async (ink = true) => { // PNG como o canvas gera: fundo branco; com traço preto quando ink
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="190"><rect width="600" height="190" fill="#fff"/>${ink ? '<path d="M40 120 C100 20, 160 180, 230 70 S 360 150, 420 60 S 520 140, 560 90" stroke="#111" stroke-width="6" fill="none" stroke-linecap="round"/>' : ''}</svg>`;
  return 'data:image/png;base64,' + (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
};
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const mod = { id: (await G.post('/imagem/modelos', { nome: 'Modelo de teste do portal', tipo: 'EVENTO', finalidade: 'Finalidade de teste.', canais: ['Instagram'], local_uso: 'Teste', periodo_tipo: 'INDETERMINADO', periodo_valor: '', observacoes: '', corpo: U.CORPO_TESTE })).id };
  const novoAluno = async (n, resp) => { const a = await G.post('/imagem/alunos', { nome: `Aluno Portal ${n}`, matricula: `P-${n}`, turma: '4º Ano B', segmento: 'FUND1' }); const r = await G.post('/imagem/solicitacoes/criar', { modelo_id: mod.id, alunos: [{ id: a.id, responsavel: resp || '', telefone: '83999990000', email: `resp${n}@exemplo.com` }] }); return r.criadas[0]; };
  const gerar = async id => G.post('/imagem/solicitacoes/link', { id, dias: 15 });
  const decidir = (tk, cod, extra = {}) => pub('/public/imagem/decidir', { token: tk, codigo: cod, decisao: 'AUTORIZO', responsavel_nome: 'Maria Responsável Teste', parentesco: 'Mãe', leu_termo: true, dados_corretos: true, sou_responsavel: true, ...extra });
  const status = async id => (await G.get('/imagem/solicitacoes/detalhe?id=' + id)).solicitacao.status;

  // ---------- link e código ----------
  const A = await novoAluno(1);
  t('sem login, gerar link é recusado (401)', (await fetch(U.B + '/imagem/solicitacoes/link', { method: 'POST', headers: H, body: JSON.stringify({ id: A.id }) })).status === 401);
  const kA = await gerar(A.id);
  t('o link é único e longo, com código de 6 números; o token vai depois do # (não chega ao servidor)', /\/autorizar\.html#[0-9a-f]{48}$/.test(kA.link) && /^\d{6}$/.test(kA.codigo) && /ficam|expira|Olá/.test(kA.mensagem) && kA.mensagem.includes(kA.link) && !kA.mensagem.includes(kA.codigo), kA);
  t('no banco ficam só os hashes: o token e o código não aparecem em lugar nenhum', sql(`SELECT COUNT(*) FROM ui_acessos WHERE token_hash='${tokenDe(kA.link)}' OR codigo_hash='${kA.codigo}'`) === '0');
  const tkA = tokenDe(kA.link);
  let r = await pub('/public/imagem/abrir', { token: 'x'.repeat(48), codigo: '123456' });
  t('link inexistente: 404 genérico', r.s === 404 && /não é válido/.test(r.j.error), r);
  r = await pub('/public/imagem/abrir', { token: 'curto', codigo: '123456' });
  t('link incompleto: 404', r.s === 404);
  r = await pub('/public/imagem/abrir', { token: tkA, codigo: kA.codigo === '000000' ? '111111' : '000000' });
  t('código errado: 403 com as tentativas restantes', r.s === 403 && /Restam 4/.test(r.j.error), r);
  r = await pub('/public/imagem/abrir', { token: tkA, codigo: kA.codigo });
  t('código certo abre o termo: protocolo, aluno, texto integral, sem dados de outros alunos nem contatos', r.s === 200 && r.j.protocolo === A.protocolo && /Aluno Portal 1/.test(r.j.aluno) && /AUTORIZO/.test(r.j.texto) && r.j.status === 'ABERTO' && !JSON.stringify(r.j).match(/83999990000|resp1@|Aluno Portal [2-9]/) && !('matricula' in r.j), r.j);
  t('o status passou a ABERTO e o histórico registra a abertura', (await status(A.id)) === 'ABERTO' && (await G.get('/imagem/solicitacoes/detalhe?id=' + A.id)).eventos.some(e => e.acao === 'aberto'));

  // ---------- bloqueio por tentativas ----------
  const B0 = await novoAluno(2), kB0 = await gerar(B0.id), tB0 = tokenDe(kB0.link), errado = kB0.codigo === '999999' ? '888888' : '999999';
  const respostas = []; for (let i = 0; i < 5; i++) respostas.push((await pub('/public/imagem/abrir', { token: tB0, codigo: errado })).s);
  r = await pub('/public/imagem/abrir', { token: tB0, codigo: kB0.codigo });
  t('5 códigos errados bloqueiam o link, mesmo com o código certo depois (423)', respostas.join() === '403,403,403,403,403' && r.s === 423, [respostas, r.s]);
  const kB1 = await gerar(B0.id);
  t('gerar um novo link troca o anterior: o velho não vale mais e o novo abre', (await pub('/public/imagem/abrir', { token: tB0, codigo: kB0.codigo })).s === 404 && (await pub('/public/imagem/abrir', { token: tokenDe(kB1.link), codigo: kB1.codigo })).s === 200);
  sql(`UPDATE ui_acessos SET expira_em='2020-01-01T00:00:00-03:00' WHERE token_hash=SHA2('${tokenDe(kB1.link)}',256)`);
  r = await pub('/public/imagem/abrir', { token: tokenDe(kB1.link), codigo: kB1.codigo });
  t('link vencido: 410 com mensagem clara', r.s === 410 && /expirou/.test(r.j.error), r);

  // ---------- NÃO AUTORIZO ----------
  const base = { token: tkA, codigo: kA.codigo };
  t('sem as três confirmações a decisão é recusada (400)', (await decidir(tkA, kA.codigo, { leu_termo: false })).s === 400 && (await decidir(tkA, kA.codigo, { dados_corretos: false })).s === 400);
  t('nome incompleto ou grau de responsabilidade inválido: 400', (await decidir(tkA, kA.codigo, { responsavel_nome: 'Maria' })).s === 400 && (await decidir(tkA, kA.codigo, { parentesco: 'Vizinho' })).s === 400 && (await decidir(tkA, kA.codigo, { decisao: 'TALVEZ' })).s === 400);
  r = await decidir(tkA, kA.codigo, { decisao: 'NAO_AUTORIZO' });
  t('NÃO AUTORIZO fica registrado como NÃO AUTORIZADO, sem assinatura', r.s === 200 && r.j.status === 'NAO_AUTORIZADO' && (await status(A.id)) === 'NAO_AUTORIZADO', r);
  t('depois de respondida, nova decisão é recusada (409)', (await decidir(tkA, kA.codigo)).s === 409);
  r = await pub('/public/imagem/pdf', { ...base, tipo: 'final' });
  t('o registro de não autorização pode ser baixado em PDF', r.s === 200 && r.buf.subarray(0, 5).toString() === '%PDF-', r.s);
  let det = await G.get('/imagem/solicitacoes/detalhe?id=' + A.id);
  t('o histórico guarda a recusa e o documento tem hash', det.eventos.some(e => e.acao === 'nao-autorizado') && det.solicitacao.decisao === 'NAO_AUTORIZO' && det.arquivos.some(a => a.tipo === 'final' && a.sha256.length === 64), det.arquivos);

  // ---------- AUTORIZO + assinatura desenhada ----------
  const C = await novoAluno(3), kC = await gerar(C.id), tC = tokenDe(kC.link);
  await pub('/public/imagem/abrir', { token: tC, codigo: kC.codigo });
  r = await decidir(tC, kC.codigo);
  t('AUTORIZO ainda NÃO autoriza: fica aguardando a assinatura', r.s === 200 && r.j.status === 'AGUARDANDO_ASSINATURA' && (await status(C.id)) === 'AGUARDANDO_ASSINATURA');
  const ass = (png, extra = {}) => pub('/public/imagem/assinar', { token: tC, codigo: kC.codigo, assinatura: png, confirmo_assinatura: true, ...extra });
  t('assinatura em branco é recusada (400)', (await ass(await traco(false))).s === 400);
  t('assinatura que não é PNG, ou texto digitado no lugar, é recusada', (await ass('data:text/plain;base64,QUJD')).s === 400 && (await ass('Maria Responsável')).s === 400 && (await ass('data:image/png;base64,AAAA')).s === 400);
  t('sem a confirmação “a assinatura é minha”: 400', (await ass(await traco(true), { confirmo_assinatura: false })).s === 400);
  r = await ass(await traco(true));
  t('assinatura desenhada válida: AUTORIZADO', r.s === 200 && r.j.status === 'AUTORIZADO' && (await status(C.id)) === 'AUTORIZADO', r);
  t('assinar de novo é recusado (409)', (await ass(await traco(true))).s === 409);
  r = await pub('/public/imagem/pdf', { token: tC, codigo: kC.codigo, tipo: 'final' });
  const orig = await pub('/public/imagem/pdf', { token: tC, codigo: kC.codigo, tipo: 'original' });
  t('PDF final traz a assinatura e é maior que o termo original em branco', r.s === 200 && r.buf.subarray(0, 5).toString() === '%PDF-' && r.buf.length > orig.buf.length + 800, [r.buf.length, orig.buf.length]);
  if (process.env.CAPTURAS) { fs.mkdirSync(process.env.CAPTURAS, { recursive: true }); fs.writeFileSync(process.env.CAPTURAS + '/termo-assinado.pdf', r.buf); }
  det = await G.get('/imagem/solicitacoes/detalhe?id=' + C.id);
  t('a equipe vê modalidade, quem assinou e as evidências (hash, IP não exposto em texto)', det.solicitacao.modalidade === 'DESENHADA' && det.solicitacao.respConfirmado === 'Maria Responsável Teste' && det.arquivos.some(a => a.tipo === 'assinatura') && det.arquivos.some(a => a.tipo === 'final') && !JSON.stringify(det).includes('127.0.0.1'), det.arquivos);
  const dl = await fetch(U.B + `/imagem/solicitacoes/arquivo?id=${C.id}&tipo=final`, { headers: G.H });
  t('a equipe baixa o documento final; sem login é 401', dl.status === 200 && (await dl.arrayBuffer()).byteLength > 1000 && (await fetch(U.B + `/imagem/solicitacoes/arquivo?id=${C.id}&tipo=final`)).status === 401);

  // ---------- GOV.BR ----------
  const D = await novoAluno(4), kD = await gerar(D.id), tD = tokenDe(kD.link);
  await decidir(tD, kD.codigo, { responsavel_nome: 'João Responsável Teste', parentesco: 'Pai' });
  const original = (await pub('/public/imagem/pdf', { token: tD, codigo: kD.codigo, tipo: 'original' })).buf;
  const assinado = Buffer.concat([original, Buffer.from('\n9 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 100 200 300] /Contents <00> >>\nendobj\ntrailer\n<< >>\nstartxref\n0\n%%EOF\n')]);
  const up = async (buf, nome = 'termo.pdf') => { const fd = new FormData(); fd.append('token', tD); fd.append('codigo', kD.codigo); fd.append('arquivo', new File([buf], nome, { type: 'application/pdf' })); const x = await fetch(U.B + '/public/imagem/govbr', { method: 'POST', headers: { 'X-EVO': '1' }, body: fd }); return { s: x.status, j: await x.json() }; };
  t('arquivo que não é PDF é recusado (400)', (await up(Buffer.from('isto é um texto qualquer, não um pdf'.repeat(40)))).s === 400);
  r = await up(original);
  t('PDF sem assinatura digital (ex.: “imprimir em PDF”) é recusado com orientação', r.s === 400 && /não tem assinatura digital/.test(r.j.error), r);
  r = await up(assinado);
  t('PDF com assinatura é recebido, mas NÃO vira autorizado: aguarda validação', r.s === 200 && r.j.status === 'AGUARDANDO_VALIDACAO' && (await status(D.id)) === 'AGUARDANDO_VALIDACAO', r);
  det = await G.get('/imagem/solicitacoes/detalhe?id=' + D.id);
  t('a equipe vê o arquivo, o hash e se ele contém o termo original', det.arquivos.some(a => a.tipo === 'govbr' && /assinatura_detectada=sim; contem_original=sim/.test(a.info) && a.sha256.length === 64), det.arquivos);
  t('com o arquivo em validação, o responsável não consegue trocar a decisão (409)', (await decidir(tD, kD.codigo, { decisao: 'NAO_AUTORIZO' })).s === 409);
  const txtPdfC = buf => { const f = require('path').join(require('os').tmpdir(), 'comp_' + Date.now() + '.pdf'); fs.writeFileSync(f, buf); try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); } };
  const compPub = await pub('/public/imagem/pdf', { token: tD, codigo: kD.codigo, tipo: 'comprovante' }), txtC1 = txtPdfC(compPub.buf);
  t('comprovante de recebimento (responsável): data e hora do envio, SHA-256 do arquivo e “aguardando validação”', compPub.s === 200 && /COMPROVANTE DE RECEBIMENTO DO TERMO ASSINADO/.test(txtC1) && /Data e hora do recebimento\s+\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(txtC1) && txtC1.replace(/\s/g, '').includes(require('crypto').createHash('sha256').update(assinado).digest('hex')) && /Aguardando validação da equipe/.test(txtC1) && /Ainda não validado/.test(txtC1), txtC1.slice(0, 1200));
  if (process.env.CAPTURAS) { fs.mkdirSync(process.env.CAPTURAS, { recursive: true }); fs.writeFileSync(process.env.CAPTURAS + '/comprovante.pdf', compPub.buf); }
  const compStaff = await fetch(U.B + '/imagem/solicitacoes/comprovante?id=' + D.id, { headers: G.H });
  t('a equipe baixa o mesmo comprovante; sem login é 401; sem arquivo enviado é 404', compStaff.status === 200 && (await fetch(U.B + '/imagem/solicitacoes/comprovante?id=' + D.id)).status === 401 && (await G.req('GET', '/imagem/solicitacoes/comprovante?id=' + A.id)).status === 404);
  t('validar sem a conferência marcada é recusado (400)', (await G.req('POST', '/imagem/solicitacoes/validar', { id: D.id, resultado: 'VALIDO' })).status === 400);
  t('recusar o arquivo exige o motivo (400)', (await G.req('POST', '/imagem/solicitacoes/validar', { id: D.id, resultado: 'INVALIDO', obs: '' })).status === 400);
  await G.post('/imagem/solicitacoes/validar', { id: D.id, resultado: 'INVALIDO', obs: 'O nome no certificado não é o do responsável.' });
  r = await pub('/public/imagem/abrir', { token: tD, codigo: kD.codigo });
  t('arquivo recusado: volta para assinatura e o responsável lê o motivo', r.j.status === 'AGUARDANDO_ASSINATURA' && /nome no certificado/.test(r.j.recusaDoArquivo), r.j);
  r = await up(assinado, 'termo2.pdf');
  t('o responsável envia outro arquivo', r.s === 200 && (await status(D.id)) === 'AGUARDANDO_VALIDACAO');
  r = await G.post('/imagem/solicitacoes/validar', { id: D.id, resultado: 'VALIDO', obs: 'Assinatura válida; titular confere.', conferido_no_validar: true });
  det = await G.get('/imagem/solicitacoes/detalhe?id=' + D.id);
  t('validação manual registrada (quem, quando, resultado) e só então AUTORIZADO', r.ok && det.solicitacao.status === 'AUTORIZADO' && det.solicitacao.validadoPor && det.solicitacao.validadoEm && det.solicitacao.modalidade === 'GOVBR' && det.eventos.some(e => e.acao === 'validado'), det.solicitacao);
  const txtC2 = txtPdfC((await pub('/public/imagem/pdf', { token: tD, codigo: kD.codigo, tipo: 'comprovante' })).buf);
  t('depois da validação, o comprovante mostra quem validou, quando e “Autorizado (assinatura conferida)”', /Autorizado \(assinatura conferida\)/.test(txtC2) && /Validado por\s+\S+/.test(txtC2) && /Data e hora da validação\s+\d{2}\/\d{2}\/\d{4}/.test(txtC2) && /Assinatura válida; titular confere/.test(txtC2), txtC2.slice(0, 1500));
  const fin = await pub('/public/imagem/pdf', { token: tD, codigo: kD.codigo, tipo: 'final' });
  t('o responsável baixa exatamente o arquivo assinado que enviou (bytes preservados)', fin.s === 200 && fin.buf.equals(assinado));
  t('validar uma solicitação que não está aguardando é recusado (409)', (await G.req('POST', '/imagem/solicitacoes/validar', { id: D.id, resultado: 'VALIDO', conferido_no_validar: true })).status === 409);

  // ---------- envio manual e painel ----------
  const F = await novoAluno(5);
  t('marcar como enviado: só quando a equipe confirma, uma vez', (await G.post('/imagem/solicitacoes/enviado', { id: F.id, canal: 'whatsapp' })).ok && (await status(F.id)) === 'ENVIADO' && (await G.req('POST', '/imagem/solicitacoes/enviado', { id: F.id })).status === 409);
  t('a Equipe de Marketing também gera link e vê detalhes', (await E.post('/imagem/solicitacoes/link', { id: F.id })).link.includes('/autorizar.html#') && (await E.get('/imagem/solicitacoes/detalhe?id=' + F.id)).eventos.length > 0);
  t('solicitação encerrada não gera novo link (409)', (await G.req('POST', '/imagem/solicitacoes/link', { id: A.id })).status === 409);
  const pn = await G.get('/imagem/painel');
  t('painel conta autorizados e não autorizados reais', pn.autorizados === 2 && pn.naoAutorizados === 1, pn);
  t('a resposta do portal não é guardada em cache', (await fetch(U.B + '/public/imagem/abrir', { method: 'POST', headers: H, body: JSON.stringify({ token: tC, codigo: kC.codigo }) })).headers.get('cache-control') === 'no-store');


  // ---------- termo real do colégio (mídia paga): CPF, opção marcada, data e layout ----------
  const txtPdf = buf => { const f = require('path').join(require('os').tmpdir(), 'uiportal_' + Date.now() + '.pdf'); fs.writeFileSync(f, buf); try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); } };
  const termoReal = (await G.get('/imagem/modelos')).rows.find(m => /mídia paga/i.test(m.nome));
  const aR = await G.post('/imagem/alunos', { nome: 'Aluno Termo Real', matricula: 'P-CPF', turma: '3º Ano B', segmento: 'FUND1' });
  const sR = (await G.post('/imagem/solicitacoes/criar', { modelo_id: termoReal.id, alunos: [{ id: aR.id }] })).criadas[0], kR = await gerar(sR.id), tR = tokenDe(kR.link);
  const brancoR = txtPdf(await fetch(U.B + '/imagem/solicitacoes/pdf?ids=' + sR.id, { headers: G.H }).then(x => x.arrayBuffer()).then(b => Buffer.from(b)));
  t('o PDF da equipe antes da resposta sai em branco, para imprimir: nome, CPF, opção e data para preencher à mão', /Nome do\(a\) responsável legal: _{20,}/.test(brancoR) && /CPF do\(a\) responsável legal: _{15,}/.test(brancoR) && /\[\s*\] AUTORIZO/.test(brancoR) && /João Pessoa, ____ de ________________ de \d{4}\./.test(brancoR) && /Assinatura do\(a\) responsável legal/.test(brancoR), brancoR.slice(0, 800));
  let vR = await pub('/public/imagem/abrir', { token: tR, codigo: kR.codigo });
  t('o termo do colégio pede o CPF no portal e traz o texto exato com título, seções e Meta Ads / Google Ads / TikTok Ads', vR.j.pedeCpf === true && /^# TERMO DE AUTORIZAÇÃO PARA USO DE IMAGEM EM CAMPANHAS DE MÍDIA PAGA/m.test(vR.j.texto) && /Google Ads, TikTok Ads/.test(vR.j.texto), vR.j.pedeCpf);
  const dec = (extra = {}) => pub('/public/imagem/decidir', { token: tR, codigo: kR.codigo, decisao: 'AUTORIZO', responsavel_nome: 'Sandra Responsável Teste', parentesco: 'Mãe', leu_termo: true, dados_corretos: true, sou_responsavel: true, ...extra });
  t('autorizar sem CPF, ou com CPF inválido, é recusado (400)', (await dec()).s === 400 && (await dec({ cpf: '11111111111' })).s === 400 && (await dec({ cpf: '52998224726' })).s === 400);
  t('para NÃO autorizar o CPF não é pedido', await (async () => { const sn = (await G.post('/imagem/solicitacoes/criar', { modelo_id: termoReal.id, alunos: [{ id: (await G.post('/imagem/alunos', { nome: 'Aluno Recusa Real', matricula: 'P-CPF2', turma: '1º Ano', segmento: 'FUND1' })).id }] })).criadas[0]; const kn = await gerar(sn.id); const rn = await pub('/public/imagem/decidir', { token: tokenDe(kn.link), codigo: kn.codigo, decisao: 'NAO_AUTORIZO', responsavel_nome: 'Pai Que Recusa', parentesco: 'Pai', leu_termo: true, dados_corretos: true, sou_responsavel: true }); return rn.s === 200 && rn.j.status === 'NAO_AUTORIZADO'; })());
  t('com um CPF válido (digitado com pontos) a escolha AUTORIZO é aceita', (await dec({ cpf: '529.982.247-25' })).s === 200 && (await status(sR.id)) === 'AGUARDANDO_ASSINATURA');
  const origR = await pub('/public/imagem/pdf', { token: tR, codigo: kR.codigo, tipo: 'original' }), txtO = txtPdf(origR.buf);
  t('PDF para o GOV.BR: já sai com o nome, o CPF, a opção marcada e a data em que o responsável escolheu AUTORIZO', /Nome do\(a\) responsável legal: Sandra Responsável Teste/.test(txtO) && /CPF do\(a\) responsável legal: 529\.982\.247-25/.test(txtO) && /\[ X \] AUTORIZO/.test(txtO) && /João Pessoa, \d{1,2} de [a-zç]+ de \d{4}\./.test(txtO) && !/____ de ________________ de/.test(txtO), txtO.slice(-900));
  r = await pub('/public/imagem/assinar', { token: tR, codigo: kR.codigo, assinatura: await traco(true), confirmo_assinatura: true });
  const finR = await pub('/public/imagem/pdf', { token: tR, codigo: kR.codigo, tipo: 'final' }), txtF = txtPdf(finR.buf);
  if (process.env.CAPTURAS) { fs.mkdirSync(process.env.CAPTURAS, { recursive: true }); fs.writeFileSync(process.env.CAPTURAS + '/termo-midia-paga-assinado.pdf', finR.buf); fs.writeFileSync(process.env.CAPTURAS + '/termo-midia-paga-branco.pdf', (await fetch(U.B + '/imagem/solicitacoes/pdf?ids=' + sR.id, { headers: G.H }).then(x => x.arrayBuffer()).then(b => Buffer.from(b)))); }
  t('PDF assinado: título, identificação, finalidade, condições, base legal, nome, CPF, “[ X ] AUTORIZO” e a data de hoje no “João Pessoa, … de … de …”', r.s === 200 && /TERMO DE AUTORIZAÇÃO PARA USO DE IMAGEM EM CAMPANHAS DE MÍDIA PAGA \(TRÁFEGO\s+PAGO\)/.test(txtF) && /Identificação/.test(txtF) && /Condições de uso/.test(txtF) && /Manifestação de vontade/.test(txtF) && /Meta Ads/.test(txtF) && /Lei nº 15\.211\/2025/.test(txtF) && /CPF do\(a\) responsável legal: 529\.982\.247-25/.test(txtF) && /\[ X \] AUTORIZO/.test(txtF) && /João Pessoa, \d{1,2} de [a-zç]+ de \d{4}\./.test(txtF) && /Rua Ovídio Mendonça, 130/.test(txtF) && /3244-7711/.test(txtF), txtF.slice(0, 1500));
  const detR = (await G.get('/imagem/solicitacoes/detalhe?id=' + sR.id)).solicitacao;
  t('a equipe vê o CPF só parcialmente (***.982.247-**), nunca inteiro, e ele não vai para os relatórios', detR.cpfResponsavel === '***.982.247-**' && !JSON.stringify(detR).includes('52998224725') && !JSON.stringify(await G.get('/imagem/relatorio')).includes('52998224725') && !JSON.stringify(await G.get('/imagem/alunos/ficha?id=' + aR.id)).includes('52998224725'), detR.cpfResponsavel);

  // ---------- telas reais do portal (celular com toque, e computador) ----------
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir(), b2 = b;
  const G5 = await novoAluno(6), k5 = await gerar(G5.id);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(String(e))); p.on('dialog', d => { erros.push('dialogo: ' + d.message()); d.dismiss(); });
  const foto = async n => { if (dir) await p.screenshot({ path: `${dir}/portal-${n}.png`, fullPage: true }); };
  await p.goto(BASE + '/autorizar.html#' + tokenDe(k5.link)); await p.waitForSelector('#codigo');
  await foto('1-codigo');
  await p.fill('#codigo', '000000'.replace(/0/g, k5.codigo === '000000' ? '1' : '0')); await p.click('#fCod button'); await p.waitForSelector('#eCod:not([hidden])');
  t('portal: código errado mostra a mensagem e as tentativas restantes', /Restam/.test(await p.innerText('#eCod')));
  await p.fill('#codigo', k5.codigo); await p.click('#fCod button'); await p.waitForSelector('.aut-doc');
  t('portal: mostra o termo inteiro, o aluno e a turma', /AUTORIZAÇÃO PARA USO DE IMAGEM/.test(await p.innerText('.aut-doc')) && /Aluno Portal 6/.test(await p.innerText('#autRaiz')));
  await foto('2-termo');
  await p.click('#fTermo button[type=submit]'); await p.waitForSelector('#eT:not([hidden])');
  t('portal: sem escolher e sem confirmar não avança', /Escolha AUTORIZO/.test(await p.innerText('#eT')));
  await p.check('[value=AUTORIZO]'); await p.fill('#rNome', 'Ana Responsável Teste'); await p.selectOption('#rPar', 'Mãe'); await p.check('#c1'); await p.check('#c2'); await p.check('#c3');
  await p.click('#fTermo button[type=submit]'); await p.waitForSelector('#bDes');
  t('portal: só existem duas formas de assinar (tela ou GOV.BR) e nenhuma é “digitar o nome”', (await p.$$('.aut-cartao')).length === 2 && /Assinar escrevendo na tela/.test(await p.innerText('#bDes')) && /GOV\.BR/.test(await p.innerText('#bGov')) && (await p.$$('input[type=text], input:not([type])')).length === 0);
  await foto('3-escolha');
  await p.click('#bGov'); await p.waitForSelector('#fGov');
  const link = await p.$eval('a[href*="assinador.iti.br"]', a => [a.href, a.rel, a.target]);
  t('portal GOV.BR: abre o serviço oficial em outra aba, sem pedir senha, e explica o PDF assinado', link[0] === 'https://assinador.iti.br/' && /noopener/.test(link[1]) && link[2] === '_blank' && /Imprimir em PDF/.test(await p.innerText('#autRaiz')) && /nunca pede a sua senha/.test(await p.innerText('#autRaiz')));
  await foto('4-govbr');
  const [dlp] = await Promise.all([p.waitForEvent('download'), p.click('#bBaixa')]);
  t('portal GOV.BR: baixa o PDF original do termo', /\.pdf$/.test(dlp.suggestedFilename()));
  await p.click('#bV'); await p.waitForSelector('#bDes'); await p.click('#bDes'); await p.waitForSelector('#cv');
  await p.click('#bFim'); await p.waitForSelector('#eA:not([hidden])');
  t('portal: concluir sem desenhar é barrado', /Desenhe a sua assinatura/.test(await p.innerText('#eA')));
  // toque de verdade (eventos de toque pelo protocolo do navegador)
  const cdp = await ctx.newCDPSession(p); const box = await p.$eval('#cv', c => { const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  const ponto = (x, y) => [{ x: box[0] + x * box[2], y: box[1] + y * box[3], id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: ponto(.1, .6) });
  for (let i = 1; i <= 24; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: ponto(.1 + i * .035, .5 + Math.sin(i / 2.5) * .3) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(200);
  t('portal: o desenho com o dedo aparece no quadro', await p.$eval('#cv', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++; return n > 150; }));
  await foto('5-desenho');
  await p.click('#bLimpa'); t('portal: “Limpar e refazer” apaga o quadro', await p.$eval('#cv', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) return false; return true; }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: ponto(.1, .6) });
  for (let i = 1; i <= 24; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: ponto(.1 + i * .035, .5 + Math.sin(i / 2.5) * .3) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.click('#bFim'); await p.waitForSelector('#eA:not([hidden])');
  t('portal: sem marcar a confirmação não conclui', /Marque a confirmação/.test(await p.innerText('#eA')));
  await p.check('#cOk'); await p.click('#bFim'); await p.waitForSelector('.aut-ok');
  t('portal: confirmação final com protocolo e situação “Autorizado”', new RegExp(k5.protocolo || 'UI-').test(await p.innerText('.aut-ok')) && /Autorizado/.test(await p.innerText('.aut-ok')) && /Assinatura desenhada/.test(await p.innerText('.aut-ok')));
  await foto('6-confirmacao');
  const [dlf] = await Promise.all([p.waitForEvent('download'), p.click('#bFinal')]);
  t('portal: o responsável baixa o documento assinado', /\.pdf$/.test(dlf.suggestedFilename()));
  t('portal: sem estouro horizontal e sem erros de script', await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2) && erros.length === 0, erros);

  // portal com o termo real: o CPF só aparece para quem escolhe AUTORIZO; o termo aparece com título e seções
  { const aT = await G.post('/imagem/alunos', { nome: 'Aluno Termo Tela', matricula: 'P-CPF3', turma: 'Infantil 5 B', segmento: 'INFANTIL' });
    const sT = (await G.post('/imagem/solicitacoes/criar', { modelo_id: termoReal.id, alunos: [{ id: aT.id }] })).criadas[0], kT = await gerar(sT.id);
    const cx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), pt = await cx.newPage();
    await pt.goto(BASE + '/autorizar.html#' + tokenDe(kT.link)); await pt.waitForSelector('#codigo'); await pt.fill('#codigo', kT.codigo); await pt.click('#fCod button'); await pt.waitForSelector('.aut-doc');
    t('portal: o termo aparece com o título e as seções do documento do colégio', /TERMO DE AUTORIZAÇÃO PARA USO DE IMAGEM EM CAMPANHAS DE MÍDIA PAGA/.test(await pt.innerText('.aut-doc h2')) && (await pt.$$('.aut-doc h3')).length >= 4 && /Turma \/ Ano letivo: Infantil 5 B/.test(await pt.innerText('.aut-doc')));
    if (dir) await pt.screenshot({ path: `${dir}/portal-9-termo-real.png`, fullPage: true });
    t('portal: nome e CPF do responsável são campos para digitar dentro do próprio termo (linhas de Identificação), mesmo sem o colégio ter preenchido', await pt.isVisible('.aut-doc #rNome') && await pt.isVisible('.aut-doc #rCpf') && (await pt.inputValue('#rNome')) === '' && (await pt.$$('#fTermo #rNome')).length === 0 && /nas linhas de Identificação/.test(await pt.innerText('#fTermo')));
    await pt.fill('#rCpf', '52998224725'); t('portal: o CPF ganha pontos e traço enquanto é digitado', (await pt.inputValue('#rCpf')) === '529.982.247-25'); await pt.fill('#rCpf', '');
    await pt.check('[value=AUTORIZO]'); await pt.fill('#rNome', 'Teresa Responsável Teste'); await pt.selectOption('#rPar', 'Mãe'); await pt.check('#c1'); await pt.check('#c2'); await pt.check('#c3');
    await pt.click('#fTermo button[type=submit]'); await pt.waitForSelector('#eT:not([hidden])');
    t('portal: AUTORIZO sem CPF mostra a mensagem e leva o cursor ao campo do CPF', /CPF/.test(await pt.innerText('#eT')) && await pt.evaluate(() => document.activeElement && document.activeElement.id === 'rCpf'));
    await pt.fill('#rCpf', '529.982.247-25'); await pt.click('#fTermo button[type=submit]'); await pt.waitForSelector('#bDes');
    t('portal: com o CPF correto avança para a escolha da assinatura', await pt.$('#bGov') !== null);
    await cx.close(); }
  // mouse no computador (recusa) e link vencido
  const pc = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const H6 = await novoAluno(7), k6 = await gerar(H6.id);
  await pc.goto(BASE + '/autorizar.html#' + tokenDe(k6.link)); await pc.fill('#codigo', k6.codigo); await pc.click('#fCod button'); await pc.waitForSelector('.aut-doc');
  await pc.check('[value=NAO_AUTORIZO]'); await pc.fill('#rNome', 'Carlos Responsável Teste'); await pc.selectOption('#rPar', 'Pai'); await pc.check('#c1'); await pc.check('#c2'); await pc.check('#c3');
  await pc.click('#fTermo button[type=submit]'); await pc.waitForSelector('#mS');
  if (dir) await pc.screenshot({ path: `${dir}/portal-7-confirma-recusa-desktop.png` });
  await pc.click('#mS'); await pc.waitForSelector('.aut-ok');
  t('portal (computador): recusa registrada, em tom neutro, e sem botão de assinatura', /Recusa registrada/.test(await pc.innerText('#autRaiz')) && await pc.$('#bDes') === null && (await status(H6.id)) === 'NAO_AUTORIZADO');
  if (dir) await pc.screenshot({ path: `${dir}/portal-8-recusa-desktop.png`, fullPage: true });
  await pc.goto(BASE + '/autorizar.html#' + tokenDe(kB1.link)); await pc.reload(); await pc.fill('#codigo', kB1.codigo); await pc.click('#fCod button'); await pc.waitForSelector('.aut-erro');
  t('portal: link vencido mostra mensagem clara', /expirou/.test(await pc.innerText('#autRaiz')));

  // ---------- telas da equipe: link de envio e validação ----------
  const V = await novoAluno(8), kV = await gerar(V.id), tV = tokenDe(kV.link);
  await decidir(tV, kV.codigo, { responsavel_nome: 'Paula Responsável Teste', parentesco: 'Mãe' });
  { const fd = new FormData(); fd.append('token', tV); fd.append('codigo', kV.codigo); fd.append('arquivo', new File([assinado], 'v.pdf', { type: 'application/pdf' })); await fetch(U.B + '/public/imagem/govbr', { method: 'POST', headers: { 'X-EVO': '1' }, body: fd }); }
  const pe = await U.pagina(b2, 'NAT-3301', G.nova, { width: 1440, height: 900 });
  await U.ir(pe, 'uisolic', 700); await pe.waitForSelector('#usLista .ui-tab');
  t('equipe: a lista oferece “Link de envio”, “Validar” e “Detalhes”', (await pe.$$('[data-link]')).length >= 1 && /Validar/.test(await pe.innerText('#usLista')) && (await pe.$$('[data-det]')).length >= 3);
  await pe.click('[data-link]'); await pe.waitForTimeout(400); if (await pe.$('#dlgOk')) await pe.click('#dlgOk'); await pe.waitForSelector('#lkL');
  t('equipe: o link de envio mostra link, código separado, mensagem pronta e avisa que nada é enviado sozinho', /não envia nada sozinho/.test(await pe.innerText('.admin-box')) && /\/autorizar\.html#/.test(await pe.inputValue('#lkL')) && /^\d{6}$/.test(await pe.$eval('.ui-cod', e => e.value)));
  if (dir) await pe.screenshot({ path: `${dir}/equipe-link.png` });
  await pe.evaluate(() => document.querySelectorAll('.admin-overlay').forEach(o => o.remove()));
  await pe.click(`button.btn:has-text("Validar")`); await pe.waitForSelector('#vSim');
  t('equipe: a validação explica a conferência em validar.iti.gov.br e exige marcar a conferência', /validar\.iti\.gov\.br/.test(await pe.innerText('.ui-valida')));
  if (dir) await pe.screenshot({ path: `${dir}/equipe-validar.png` });
  await pe.click('#vSim'); await pe.waitForSelector('#vE:not([hidden])');
  t('equipe: validar sem marcar a conferência mostra o erro', /Confirme que a assinatura/.test(await pe.innerText('#vE')));
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
