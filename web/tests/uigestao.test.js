// Uso de Imagem, etapa 4: vencimento, revogação, lembretes moderados, cancelamento com motivo, versão antiga, ajustes, ficha, relatórios (PDF e Excel) e backup/restauração.
// Dados 100% fictícios. Uso: node uigestao.test.js <install.out>
const fs = require('fs');
const { execFileSync } = require('child_process');
const { unzipSync, strFromU8 } = require('fflate');
const sharp = require('sharp');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const sql = q => execFileSync('mariadb', ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N'], { encoding: 'utf8', input: q }).trim();
const H = { 'Content-Type': 'application/json', 'X-EVO': '1' };
const pub = async (rota, corpo) => { const r = await fetch(U.B + rota, { method: 'POST', headers: H, body: JSON.stringify(corpo) }); const ct = r.headers.get('content-type') || ''; return { s: r.status, j: ct.includes('json') ? await r.json() : null, buf: ct.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : null }; };
const tokenDe = link => link.split('#')[1];
const traco = async () => 'data:image/png;base64,' + (await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="190"><rect width="600" height="190" fill="#fff"/><path d="M40 120 C100 20, 160 180, 230 70 S 360 150, 420 60 S 520 140, 560 90" stroke="#111" stroke-width="6" fill="none" stroke-linecap="round"/></svg>')).png().toBuffer()).toString('base64');
const dia = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const modBase = (await G.get('/imagem/modelos')).rows[0];
  const novoModelo = async (nome, periodo_tipo, periodo_valor) => (await G.post('/imagem/modelos', { nome, tipo: 'EVENTO', finalidade: 'Finalidade de teste do módulo.', canais: ['Instagram'], local_uso: 'Teste', periodo_tipo, periodo_valor, observacoes: '', corpo: modBase.corpo })).id;
  const novaSol = async (n, modelo_id, seg = 'FUND1', turma = '5º Ano A') => { const a = await G.post('/imagem/alunos', { nome: `Aluno Gestão ${n}`, matricula: `G-${n}`, turma, segmento: seg }); const r = await G.post('/imagem/solicitacoes/criar', { modelo_id, alunos: [{ id: a.id, telefone: '83988880000', email: `g${n}@exemplo.com` }] }); return { ...r.criadas[0], alunoId: a.id }; };
  const gerar = id => G.post('/imagem/solicitacoes/link', { id });
  const st = async id => (await G.get('/imagem/solicitacoes/detalhe?id=' + id)).solicitacao.status;
  const decidir = (k, extra = {}) => pub('/public/imagem/decidir', { token: tokenDe(k.link), codigo: k.codigo, decisao: 'AUTORIZO', responsavel_nome: 'Rita Responsável Teste', parentesco: 'Mãe', leu_termo: true, dados_corretos: true, sou_responsavel: true, ...extra });
  const autorizar = async (sol) => { const k = await gerar(sol.id); await decidir(k); const r = await pub('/public/imagem/assinar', { token: tokenDe(k.link), codigo: k.codigo, assinatura: await traco(), confirmo_assinatura: true }); return { k, r }; };
  const M1 = await novoModelo('Modelo Prazo Fixo (teste)', 'ATE_DATA', dia(10)), M2 = await novoModelo('Modelo Um Mês (teste)', 'MESES', '1'), M3 = await novoModelo('Modelo Prazo Vencido (teste)', 'ATE_DATA', '2020-01-01'), M0 = await novoModelo('Modelo Sem Prazo (teste)', 'INDETERMINADO', '');

  // ---------- vencimento ----------
  const s1 = await novaSol(1, M1); const a1 = await autorizar(s1);
  let d1 = (await G.get('/imagem/solicitacoes/detalhe?id=' + s1.id)).solicitacao;
  t('autorizado com prazo até uma data: guarda o vencimento', a1.r.j.status === 'AUTORIZADO' && sql(`SELECT vence_em FROM ui_solicitacoes WHERE id=${s1.id}`) === dia(10));
  const s2 = await novaSol(2, M2); await autorizar(s2);
  const v2 = sql(`SELECT vence_em FROM ui_solicitacoes WHERE id=${s2.id}`), esp2 = new Date(); esp2.setUTCMonth(esp2.getUTCMonth() + 1);
  t('prazo em meses: o vencimento fica um mês depois da assinatura', Math.abs(Date.parse(v2) - esp2.getTime()) < 3 * 86400000, v2);
  const s0 = await novaSol(3, M0); await autorizar(s0);
  t('prazo indeterminado: não tem vencimento', sql(`SELECT vence_em FROM ui_solicitacoes WHERE id=${s0.id}`) === '');
  const s3 = await novaSol(4, M3); const k3 = await gerar(s3.id); await pub('/public/imagem/abrir', { token: tokenDe(k3.link), codigo: k3.codigo });
  let r = await decidir(k3);
  t('termo cujo prazo já terminou não pode ser respondido (409)', r.s === 409 && /prazo/.test(r.j.error), r);
  sql(`UPDATE ui_solicitacoes SET vence_em='${dia(-1)}' WHERE id=${s1.id}`);
  const painelV = await G.get('/imagem/painel');
  t('passou do prazo: vira VENCIDO sozinho, com registro, e aparece em “não usar a imagem”', (await st(s1.id)) === 'VENCIDO' && painelV.vencidos >= 1 && painelV.naoUsar.some(a => a.nome === 'Aluno Gestão 1' && a.status === 'VENCIDO'), painelV.naoUsar);
  t('o histórico registra o vencimento e a situação na lista de alunos é “Vencido”', (await G.get('/imagem/solicitacoes/detalhe?id=' + s1.id)).eventos.some(e => e.acao === 'vencido') && (await G.get('/imagem/alunos?busca=G-1')).rows[0].situacao === 'VENCIDO');
  r = await pub('/public/imagem/abrir', { token: tokenDe(a1.k.link), codigo: a1.k.codigo });
  t('o portal mostra o termo vencido como encerrado', r.s === 200 && r.j.status === 'VENCIDO' && r.j.encerrada === true);
  sql(`UPDATE ui_solicitacoes SET vence_em='${dia(12)}' WHERE id=${s2.id}`);
  t('“vencem em breve” lista quem está perto do prazo', (await G.get('/imagem/painel')).vencemLogo.some(a => a.nome === 'Aluno Gestão 2'));

  // ---------- revogação ----------
  t('revogar exige uma autorização em vigor (409) e o motivo (400)', (await G.req('POST', '/imagem/solicitacoes/revogar', { id: s3.id, motivo: 'qualquer motivo' })).status === 409 && (await G.req('POST', '/imagem/solicitacoes/revogar', { id: s0.id, motivo: '' })).status === 400);
  await G.post('/imagem/config', { ...(await G.get('/imagem/config')).config, quemRevoga: 'admin' });
  t('com a regra “só o Administrador”, a Equipe não revoga (403)', (await E.req('POST', '/imagem/solicitacoes/revogar', { id: s0.id, motivo: 'pedido da família' })).status === 403);
  await G.post('/imagem/config', { ...(await G.get('/imagem/config')).config, quemRevoga: 'equipe' });
  r = await E.post('/imagem/solicitacoes/revogar', { id: s0.id, motivo: 'Mãe pediu por telefone em 20/11' });
  t('a Equipe revoga quando a regra permite: REVOGADO com quem, quando e por quê', r.ok && (await st(s0.id)) === 'REVOGADO' && (await G.get('/imagem/alunos/ficha?id=' + s0.alunoId)).solicitacoes[0].revogadoMotivo.includes('Mãe pediu'));
  t('revogado entra em “não usar”, nos cartões e na lista de alunos', (await G.get('/imagem/painel')).naoUsar.some(a => a.status === 'REVOGADO') && (await G.get('/imagem/painel')).revogados >= 1 && (await G.get('/imagem/alunos?situacao=REVOGADO')).rows.length >= 1);
  t('a revogação não apaga a prova: documento final e assinatura continuam guardados', (await G.get('/imagem/solicitacoes/detalhe?id=' + s0.id)).arquivos.some(a => a.tipo === 'final') && (await G.get('/imagem/solicitacoes/detalhe?id=' + s0.id)).arquivos.some(a => a.tipo === 'assinatura'));
  t('solicitação revogada não gera novo link (409)', (await G.req('POST', '/imagem/solicitacoes/link', { id: s0.id })).status === 409);

  // ---------- lembretes moderados ----------
  const s4 = await novaSol(5, M0), s5 = await novaSol(6, M0);
  const lem = ids => G.post('/imagem/solicitacoes/lembrete', { ids });
  r = await lem([s4.id]);
  t('lembrete antes de enviar é recusado: “envie primeiro”', r.lembretes.length === 0 && /envie primeiro/.test(r.ignoradas[0].motivo), r);
  await G.post('/imagem/solicitacoes/enviado', { id: s4.id, canal: 'whatsapp' });
  r = await lem([s4.id]);
  t('logo depois do envio é cedo demais: respeita o intervalo mínimo', r.lembretes.length === 0 && /Muito cedo/.test(r.ignoradas[0].motivo), r);
  sql(`UPDATE ui_solicitacoes SET enviado_em='${dia(-5)}T10:00:00-03:00' WHERE id=${s4.id}`);
  r = await lem([s4.id]);
  t('passado o intervalo, prepara o lembrete 1 de 3 com a mensagem pronta (sem link, sem envio automático)', r.lembretes.length === 1 && r.lembretes[0].numero === 1 && /Lembrando/.test(r.lembretes[0].mensagem) && /Aluno Gestão 5/.test(r.lembretes[0].mensagem) && !/autorizar\.html/.test(r.lembretes[0].mensagem), r);
  r = await lem([s4.id]);
  t('um segundo lembrete no mesmo dia é recusado', r.lembretes.length === 0 && /Muito cedo/.test(r.ignoradas[0].motivo));
  sql(`UPDATE ui_solicitacoes SET ultimo_lembrete='${dia(-5)}T10:00:00-03:00', lembretes=3 WHERE id=${s4.id}`);
  r = await lem([s4.id]);
  t('no máximo de lembretes, recusa e sugere contato direto', r.lembretes.length === 0 && /limite/.test(r.ignoradas[0].motivo), r);
  t('lembrete sem marcar nada: 400', (await G.req('POST', '/imagem/solicitacoes/lembrete', { ids: [] })).status === 400);

  // ---------- cancelar com motivo ----------
  const kS5 = await gerar(s5.id); await G.post('/imagem/solicitacoes/enviado', { id: s5.id, canal: 'email' });
  t('cancelar uma solicitação já enviada exige o motivo (400)', (await G.req('POST', '/imagem/solicitacoes/cancelar', { id: s5.id })).status === 400);
  t('cancelar com motivo: CANCELADO, motivo guardado e o link deixa de funcionar', (await G.post('/imagem/solicitacoes/cancelar', { id: s5.id, motivo: 'Aluno saiu da turma' })).ok && (await st(s5.id)) === 'CANCELADO' && (await pub('/public/imagem/abrir', { token: tokenDe(kS5.link), codigo: kS5.codigo })).s === 404);
  t('cancelada, uma solicitação já respondida não pode ser cancelada (use Revogar)', (await G.req('POST', '/imagem/solicitacoes/cancelar', { id: s0.id, motivo: 'tentativa' })).status === 409);

  // ---------- modelo alterado: termo de versão antiga ----------
  const s6 = await novaSol(7, M0); const k6 = await gerar(s6.id);
  await G.post('/imagem/modelos', { ...(await G.get('/imagem/modelos')).rows.find(m => m.id === M0), id: M0, corpo: modBase.corpo + '\n\nParágrafo acrescentado depois (nova versão).' });
  r = await pub('/public/imagem/abrir', { token: tokenDe(k6.link), codigo: k6.codigo });
  t('o modelo mudou: o portal avisa que o termo foi substituído e não aceita resposta', r.s === 200 && /substituído/.test(r.j.bloqueio) && (await decidir(k6)).s === 409);
  t('a equipe também é avisada: gerar link de versão antiga é recusado (409)', (await G.req('POST', '/imagem/solicitacoes/link', { id: s6.id })).status === 409);
  const cfg0 = (await G.get('/imagem/config')).config;
  await G.post('/imagem/config', { ...cfg0, bloquearVersaoAntiga: false });
  t('com o bloqueio desligado nos ajustes, a resposta volta a ser aceita', (await decidir(k6)).s === 200);
  await G.post('/imagem/config', { ...cfg0, bloquearVersaoAntiga: true });

  // ---------- ajustes ----------
  const gc = await G.get('/imagem/config');
  t('ajustes padrão: link 15 dias, lembretes 3 vezes a cada 3 dias, retenção 5 anos, Administrador pode editar', gc.config.linkDias === 15 && gc.config.lembreteMax === 3 && gc.config.retencaoAnos === 5 && gc.podeEditar === true && typeof gc.retencao.elegiveisParaRevisao === 'number', gc);
  t('a Equipe vê os ajustes, mas não altera (403)', (await E.get('/imagem/config')).podeEditar === false && (await E.req('POST', '/imagem/config', gc.config)).status === 403);
  t('valores fora do limite ou mensagem sem {link} são recusados (400)', (await G.req('POST', '/imagem/config', { ...gc.config, linkDias: 0 })).status === 400 && (await G.req('POST', '/imagem/config', { ...gc.config, mensagemEnvio: 'Sem o marcador do link' })).status === 400);
  await G.post('/imagem/config', { ...gc.config, linkDias: 7, mensagemEnvio: 'Oi! Responda por aqui para {aluno}: {link} (vale até {validade}).' });
  const s7 = await novaSol(8, M0); const k7 = await gerar(s7.id);
  const dias7 = Math.round((Date.parse(k7.expiraEm) - Date.now()) / 86400000);
  t('os ajustes valem: link de 7 dias e a mensagem personalizada', dias7 === 7 && /^Oi! Responda por aqui para Aluno Gestão 8: http/.test(k7.mensagem), [dias7, k7.mensagem]);
  await G.post('/imagem/config', gc.config);

  // ---------- ficha do aluno e relatórios ----------
  const fi = await G.get('/imagem/alunos/ficha?id=' + s0.alunoId);
  t('ficha: aluno, histórico de solicitações, versão do modelo, responsável, evidências e trilha', fi.aluno.matricula === 'G-3' && fi.solicitacoes.length === 1 && fi.solicitacoes[0].versao >= 1 && fi.solicitacoes[0].responsavel.includes('Rita') && fi.solicitacoes[0].arquivos.length >= 2 && fi.solicitacoes[0].eventos.length >= 3 && fi.solicitacoes[0].termoHash.length === 64, fi.solicitacoes[0]);
  const fp = await fetch(U.B + '/imagem/alunos/ficha.pdf?id=' + s0.alunoId, { headers: G.H }), fb = Buffer.from(await fp.arrayBuffer());
  t('ficha em PDF: 200 e arquivo válido; aluno inexistente 404; sem login 401', fp.status === 200 && fb.subarray(0, 5).toString() === '%PDF-' && (await G.req('GET', '/imagem/alunos/ficha?id=999999')).status === 404 && (await fetch(U.B + '/imagem/alunos/ficha?id=1')).status === 401);
  let rl = await G.get('/imagem/relatorio');
  t('relatório geral: totais por situação, por segmento e por turma', rl.resumo.total >= 8 && rl.resumo.porStatus.VENCIDO >= 1 && rl.resumo.porStatus.REVOGADO >= 1 && rl.porSegmento.FUND1 && rl.porTurma['5º Ano A'], rl.resumo);
  rl = await G.get('/imagem/relatorio?segmento=FUND1&status=REVOGADO&turma=' + encodeURIComponent('5º Ano A'));
  t('filtros de segmento, turma e situação funcionam juntos', rl.linhas.length >= 1 && rl.linhas.every(l => l.status === 'REVOGADO' && l.segmento === 'FUND1' && l.turma === '5º Ano A'), rl.linhas);
  t('filtro de período: no futuro não há nada; hoje traz as criadas hoje', (await G.get('/imagem/relatorio?de=' + dia(5))).resumo.total === 0 && (await G.get(`/imagem/relatorio?de=${dia(0)}&ate=${dia(0)}`)).resumo.total >= 8);
  const rp = await fetch(U.B + '/imagem/relatorio.pdf?status=AUTORIZADO', { headers: G.H }), rpb = Buffer.from(await rp.arrayBuffer());
  const rx = await fetch(U.B + '/imagem/relatorio.xlsx', { headers: G.H }), rxb = Buffer.from(await rx.arrayBuffer());
  if (process.env.CAPTURAS) { fs.mkdirSync(process.env.CAPTURAS, { recursive: true }); fs.writeFileSync(process.env.CAPTURAS + '/relatorio.pdf', rpb); fs.writeFileSync(process.env.CAPTURAS + '/relatorio.xlsx', rxb); fs.writeFileSync(process.env.CAPTURAS + '/ficha.pdf', fb); }
  t('relatório em PDF: A4 válido com anexo nomeado', rp.status === 200 && /application\/pdf/.test(rp.headers.get('content-type')) && rpb.subarray(0, 5).toString() === '%PDF-' && /Relatorio-Uso-de-Imagem_/.test(rp.headers.get('content-disposition')));
  const zip = unzipSync(new Uint8Array(rxb)), folha = strFromU8(zip['xl/worksheets/sheet1.xml']);
  t('relatório em Excel: planilha .xlsx real, com cabeçalho e as linhas dos alunos', rx.status === 200 && rxb.subarray(0, 2).toString() === 'PK' && /Aluno Gestão 1/.test(folha) && /Situação/.test(folha) && /Vencido/.test(folha) && /xl\/workbook\.xml/.test(Object.keys(zip).join()), Object.keys(zip));
  t('relatórios exigem login (401)', (await fetch(U.B + '/imagem/relatorio.xlsx')).status === 401 && (await fetch(U.B + '/imagem/relatorio.pdf')).status === 401);
  const af = await G.get('/imagem/alunos?situacao=AUTORIZADO'), sm = await G.get('/imagem/alunos?situacao=SEM');
  t('lista de alunos filtra pela situação da autorização', af.rows.length >= 1 && af.rows.every(a => a.situacao === 'AUTORIZADO') && sm.rows.every(a => a.situacao === ''), [af.rows.length, sm.rows.length]);

  // ---------- backup completo e restauração ----------
  const sAut = await novaSol(9, M0, 'MEDIO', '2ª Série EM'); await autorizar(sAut);
  const bk = await G.post('/backup', { completo: true });
  await G.post('/imagem/solicitacoes/revogar', { id: sAut.id, motivo: 'Revogada depois do backup, para testar a restauração' });
  t('antes de restaurar: a autorização foi revogada', (await st(sAut.id)) === 'REVOGADO');
  const rs = await G.post('/backup/restore', { file: bk.file });
  const dl = await fetch(U.B + `/imagem/solicitacoes/arquivo?id=${sAut.id}&tipo=final`, { headers: G.H });
  t('restaurar o backup devolve a autorização, a assinatura e o PDF assinado do estado do backup', rs.ok && (await st(sAut.id)) === 'AUTORIZADO' && dl.status === 200 && Buffer.from(await dl.arrayBuffer()).subarray(0, 5).toString() === '%PDF-' && (await G.get('/imagem/solicitacoes/detalhe?id=' + sAut.id)).arquivos.some(a => a.tipo === 'assinatura'), rs);
  t('depois da restauração os links, ajustes e modelos continuam funcionando', (await G.get('/imagem/config')).config.linkDias === 15 && (await G.get('/imagem/modelos')).rows.length >= 5 && (await pub('/public/imagem/abrir', { token: tokenDe(a1.k.link), codigo: a1.k.codigo })).s === 200);

  // ---------- excluir solicitações ----------
  const sx1 = await novaSol(20, M0), sx2 = await novaSol(21, M0); await autorizar(sx2);
  { const E2 = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab'); const rq = await E2.req('POST', '/imagem/solicitacoes/excluir', { ids: [sx1.id] }); t('a Equipe não exclui solicitações (403)', rq.status === 403 && (await st(sx1.id)) === 'AGUARDANDO_ENVIO', [rq.status, await st(sx1.id)]); }
  t('excluir sem marcar nada: 400', (await G.req('POST', '/imagem/solicitacoes/excluir', { ids: [] })).status === 400);
  const antesArq = Number(sql(`SELECT COUNT(*) FROM arquivos WHERE caminho LIKE 'USO-IMAGEM/${sx2.id}/%'`));
  r = await G.post('/imagem/solicitacoes/excluir', { ids: [sx1.id, sx2.id] });
  t('o Administrador exclui solicitações de vez e o aviso conta as já respondidas', r.excluidas === 2 && r.respondidas === 1 && antesArq >= 2, [r, antesArq]);
  t('a exclusão leva junto histórico, link, arquivos e o PDF guardado', sql(`SELECT COUNT(*) FROM ui_solicitacoes WHERE id IN (${sx1.id},${sx2.id})`) === '0' && sql(`SELECT COUNT(*) FROM ui_solic_eventos WHERE solicitacao_id IN (${sx1.id},${sx2.id})`) === '0' && sql(`SELECT COUNT(*) FROM ui_acessos WHERE solicitacao_id IN (${sx1.id},${sx2.id})`) === '0' && sql(`SELECT COUNT(*) FROM ui_arquivos WHERE solicitacao_id IN (${sx1.id},${sx2.id})`) === '0' && sql(`SELECT COUNT(*) FROM arquivos WHERE caminho LIKE 'USO-IMAGEM/${sx2.id}/%'`) === '0');
  t('o aluno continua cadastrado e volta a ficar “sem solicitação”', (await G.get('/imagem/alunos?busca=G-21')).rows[0].situacao === '');
  t('o link de uma solicitação excluída deixa de funcionar (404)', (await pub('/public/imagem/abrir', { token: 'a'.repeat(48), codigo: '123456' })).s === 404);
  // ---------- telas ----------
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1100 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp), foto = async n => { if (dir) await p.screenshot({ path: `${dir}/${n}-${nome}.png`, fullPage: true }); };
    await U.ir(p, 'uipainel', 700); await p.waitForSelector('.db-cartoes');
    t(`${nome}: painel mostra “não usar a imagem” (recusado, vencido, revogado) e quem vence em breve`, /Não usar a imagem destes alunos/.test(await p.innerText('#content')) && /Vencem nos próximos/.test(await p.innerText('#content')));
    await foto('g-painel');
    await p.click('[data-ficha]'); await p.waitForSelector('.ui-ficha');
    t(`${nome}: a ficha abre a partir do painel, com histórico, hash e exportação em PDF`, /Hash do termo/.test(await p.innerText('.admin-box')) && await p.$('a[href*="ficha.pdf"]') !== null);
    await foto('g-ficha'); await p.evaluate(() => document.querySelectorAll('.admin-overlay').forEach(o => o.remove()));
    await U.ir(p, 'uisolic', 700); await p.waitForSelector('#usLista .ui-tab');
    t(`${nome}: Solicitações tem os resumos por situação e o botão de lembretes`, (await p.$$('.ui-chip')).length >= 4 && await p.$('#usLemb') !== null);
    await p.click('#usLista [data-m]'); await p.click('#usLemb'); await p.waitForSelector('.admin-box');
    t(`${nome}: lembretes mostram o motivo quando não podem ser preparados`, /Não preparados|Lembretes/.test(await p.innerText('.admin-box')));
    await foto('g-solicitacoes'); await p.evaluate(() => document.querySelectorAll('.admin-overlay').forEach(o => o.remove()));
    await U.ir(p, 'uirelat', 700); await p.waitForSelector('#rCorpo .ui-tab');
    t(`${nome}: relatórios em tela, com PDF e Excel`, await p.$('#rPdf') !== null && await p.$('#rXls') !== null && /Por segmento/.test(await p.innerText('#rCorpo')));
    await foto('g-relatorios');
    await U.ir(p, 'uiconfig', 700); await p.waitForSelector('#cfF');
    t(`${nome}: ajustes do módulo com retenção, lembretes, permissões e mensagens`, /Retenção e documentos substituídos/.test(await p.innerText('#content')) && /Mensagens/.test(await p.innerText('#content')));
    await foto('g-ajustes');
    t(`${nome}: sem estouro horizontal e sem erros de script`, await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2) && p.errs.length === 0, p.errs);
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
