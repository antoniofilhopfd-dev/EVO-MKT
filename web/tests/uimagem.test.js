// Uso de Imagem, etapa 1: alunos (cadastro, importação CSV/.xlsx sem apagar nada, busca, seleção manual) e painel. Dados 100% fictícios.
const fs = require('fs');
const { zipSync, strToU8 } = require('fflate');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const xlsx = linhas => {
  const compart = [], idx = s => { let i = compart.indexOf(s); if (i < 0) { compart.push(s); i = compart.length - 1; } return i; };
  const col = n => String.fromCharCode(65 + n);
  const rows = linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => `<c r="${col(c)}${r + 1}" t="s"><v>${idx(v)}</v></c>`).join('')}</row>`).join('');
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/sharedStrings.xml': strToU8(`<?xml version="1.0"?><sst>${compart.map(s => `<si><t>${s.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`),
  })).toString('base64');
};
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const imp = (linhas, previa) => G.post('/imagem/alunos/importar', { linhas, previa });
  let r = await G.get('/imagem/alunos');
  t('lista vazia no início', Array.isArray(r.rows) && r.rows.length === 0 && r.total === 0, r);
  r = await imp([
    { nome: 'Ana Fictícia Souza', matricula: 'T-1001', turma: '2º Ano A', segmento: 'Fundamental I' },
    { nome: 'Bruno Teste Lima', matricula: 'T-1002', turma: '8º Ano B', segmento: 'Anos Finais' },
    { nome: 'Carla Exemplo Dias', matricula: 'T-1003', turma: '2ª Série EM', segmento: '' },
    { nome: 'Davi Modelo Neves', matricula: 'T-1004', turma: 'Infantil 4', segmento: 'Educação Infantil' },
    { nome: '', matricula: 'T-1005', turma: 'x', segmento: '' },
    { nome: 'Eva Sem Segmento', matricula: 'T-1006', turma: '1º Ano', segmento: 'Marte' },
    { nome: 'Repetida', matricula: 'T-1001', turma: '2º Ano A', segmento: '' },
  ], true);
  t('prévia conta novos, erros e repetidos sem gravar nada', r.previa === true && r.novos === 4 && r.erros.length === 3 && r.repetidos === 1 && (await G.get('/imagem/alunos')).total === 0, r);
  r = await imp([
    { nome: 'Ana Fictícia Souza', matricula: 'T-1001', turma: '2º Ano A', segmento: 'Fundamental I' },
    { nome: 'Bruno Teste Lima', matricula: 'T-1002', turma: '8º Ano B', segmento: 'Anos Finais' },
    { nome: 'Carla Exemplo Dias', matricula: 'T-1003', turma: '2ª Série EM', segmento: '' },
    { nome: 'Davi Modelo Neves', matricula: 'T-1004', turma: 'Infantil 4', segmento: 'Educação Infantil' },
  ]);
  const l = (await G.get('/imagem/alunos')).rows;
  const seg = m => l.find(a => a.matricula === m).segmento;
  t('importa 4 alunos e reconhece o segmento (escrito ou deduzido da turma)', r.novos === 4 && seg('T-1001') === 'FUND1' && seg('T-1002') === 'FUND2' && seg('T-1003') === 'MEDIO' && seg('T-1004') === 'INFANTIL', l.map(a => [a.matricula, a.segmento]));
  r = await imp([{ nome: 'Ana Fictícia de Souza', matricula: 'T-1001', turma: '3º Ano A', segmento: 'Fundamental I' }, { nome: 'Bruno Teste Lima', matricula: 'T-1002', turma: '8º Ano B', segmento: '' }]);
  const ana = (await G.get('/imagem/alunos')).rows.find(a => a.matricula === 'T-1001');
  t('reimportar atualiza pela matrícula, sem duplicar e sem apagar quem ficou de fora', r.atualizados === 1 && r.iguais === 1 && ana.turma === '3º Ano A' && (await G.get('/imagem/alunos')).total === 4, r);
  r = await G.post('/imagem/alunos/ler-planilha', { base64: xlsx([['Nome', 'Matrícula', 'Turma', 'Segmento'], ['Fábio Planilha & Cia', 'T-2001', '5º Ano C', 'Anos Iniciais'], ['Gabi Planilha', 'T-2002', '1º Ano EM', 'Ensino Médio']]) });
  t('lê uma planilha .xlsx (acentos e &) e devolve as linhas', r.linhas && r.linhas.length === 3 && r.linhas[1][0] === 'Fábio Planilha & Cia' && r.linhas[2][3] === 'Ensino Médio', r);
  t('planilha inválida é recusada com mensagem clara', (await G.req('POST', '/imagem/alunos/ler-planilha', { base64: Buffer.from('não é zip').toString('base64') })).status === 400);
  r = await G.post('/imagem/alunos', { nome: 'Hugo Manual', matricula: 'T-3001', turma: '9º Ano', segmento: 'FUND2' });
  t('cadastra um aluno manualmente', r.ok && r.id, r);
  t('matrícula repetida é recusada (409)', (await G.req('POST', '/imagem/alunos', { nome: 'Outro', matricula: 'T-3001' })).status === 409);
  t('nome em branco é recusado (400)', (await G.req('POST', '/imagem/alunos', { nome: ' ', matricula: 'T-3999' })).status === 400);
  r = await G.get('/imagem/alunos?busca=' + encodeURIComponent('fictícia'));
  t('busca por nome (sem diferenciar maiúsculas)', r.rows.length === 1 && r.rows[0].matricula === 'T-1001', r.rows);
  r = await G.get('/imagem/alunos?busca=T-100');
  t('busca por parte da matrícula', r.rows.length === 4, r.rows.length);
  r = await G.get('/imagem/alunos?segmento=FUND2');
  t('filtro por segmento', r.rows.length === 2 && r.rows.every(a => a.segmento === 'FUND2'), r.rows.map(a => a.nome));
  const hugo = (await G.get('/imagem/alunos?busca=hugo')).rows[0];
  await G.post('/imagem/alunos/ativo', { id: hugo.id, ativo: false });
  t('inativar tira da lista padrão, mas o cadastro continua guardado', (await G.get('/imagem/alunos?busca=hugo')).rows.length === 0 && (await G.get('/imagem/alunos?busca=hugo&inativos=1')).rows.length === 1);
  r = await E.get('/imagem/alunos');
  t('a Equipe de Marketing também usa o módulo', Array.isArray(r.rows), r);
  t('sem login: 401', (await fetch(U.B + '/imagem/alunos')).status === 401);
  const painel = await G.get('/imagem/painel');
  t('painel: total de alunos ativos, segmentos e atividade recente', painel.totalAlunos === 4 && painel.segmentos.find(s => s.k === 'FUND1').n === 1 && painel.recentes.length > 0 && painel.autorizados === 0, painel);

  // ---- telas reais ----
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1100 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    const foto = async n => { if (dir) await p.screenshot({ path: `${dir}/${n}-${nome}.png` }); };
    await U.ir(p, 'uipainel', 700); await p.waitForSelector('.db-cartoes');
    t(`${nome}: o menu tem a área Uso de Imagem com Painel e Alunos`, /Uso de Imagem/.test(await p.innerText('#nav')) && /Alunos/.test(await p.innerText('#subtabs')));
    t(`${nome}: painel mostra os alunos ativos e a atividade recente`, new RegExp(nome === 'desktop' ? '4' : '6').test(await p.innerText('.db-cartoes')) && /Atividade recente/.test(await p.innerText('#content')));
    await foto('painel');
    await p.click('#uiIrAlunos'); await p.waitForSelector('.ui-tab');
    t(`${nome}: lista de alunos com os ativos e nenhum selecionado`, (await p.$$('.ui-tab tbody tr')).length === (nome === 'desktop' ? 4 : 6) && (await p.$$('[data-sel]:checked')).length === 0);
    await p.fill('#uiBusca', 'fict'); await p.waitForTimeout(700);
    t(`${nome}: busca filtra a lista`, (await p.$$('.ui-tab tbody tr')).length === 1);
    await p.fill('#uiBusca', ''); await p.waitForTimeout(700);
    await p.click('[data-sel]:nth-of-type(1)', { force: true }).catch(() => {}); const caixas = await p.$$('[data-sel]'); await caixas[0].check(); await caixas[2].check();
    t(`${nome}: seleção manual de 2 alunos mostra o contador e não marca os outros`, /2 aluno\(s\) selecionado/.test(await p.innerText('#uiSelBar')) && (await p.$$('[data-sel]:checked')).length === 2);
    await foto('alunos-selecao');
    await p.click('#uiImp'); await p.waitForSelector('#uiTxt');
    await p.fill('#uiTxt', `nome;matrícula;turma;segmento\nIris Colada;T-4001${nome === 'desktop' ? '' : '9'};4º Ano;Anos Iniciais\nJoao Colado;T-4002${nome === 'desktop' ? '' : '9'};7º Ano;Anos Finais\nAna Fictícia de Souza;T-1001;3º Ano A;Anos Iniciais`); await p.click('#uiConferir');
    await p.waitForSelector('.ui-resumo');
    t(`${nome}: importação mostra a prévia (2 novos, 1 sem mudança) antes de gravar`, /2\s*novo/.test(await p.innerText('.ui-resumo')) && /1\s*sem mudança/.test(await p.innerText('.ui-resumo')), await p.innerText('.ui-resumo'));
    await foto('importar-previa');
    await p.click('#uiOk'); await p.waitForTimeout(900);
    t(`${nome}: depois de importar, a lista cresce com os 2 novos e a seleção anterior continua`, (await p.$$('.ui-tab tbody tr')).length === (nome === 'desktop' ? 6 : 8) && (await p.$$('[data-sel]:checked')).length === 2);
    t(`${nome}: sem estouro horizontal`, await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2));
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
