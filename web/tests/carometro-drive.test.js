// Carômetro Escolar, etapa 7: pastas do Google Drive (só referência, conferência manual, sem credenciais). Dados fictícios.
const fs = require('fs');
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const adm = (await G.get('/carometro/drive')).podeEditar;
  t('sem login: 401', (await fetch(U.B + '/carometro/drive')).status === 401);
  let d = await G.get('/carometro/drive');
  t('lista vazia; integração declarada como não operacional', d.rows.length === 0 && d.integracao === 'nao_operacional', d);
  t('Equipe consulta, mas não registra, confere nem remove (403)', (await E.get('/carometro/drive')).podeEditar === false && (await E.req('POST', '/carometro/drive', { nome: 'x', pasta: 'ABCDEFGHIJKLMNOP' })).status === 403 && (await E.req('POST', '/carometro/drive/conferir', { id: 1 })).status === 403 && (await E.req('POST', '/carometro/drive/remover', { id: 1 })).status === 403);
  if (!adm) { t('este usuário de teste não é Administrador: restante não exercitado', false); fim(); return; }
  const post = (b) => G.req('POST', '/carometro/drive', b);
  t('exige nome', (await post({ nome: '', pasta: 'ABCDEFGHIJKLMNOP' })).status === 400);
  for (const [rot, pasta] of [['http (sem TLS)', 'http://drive.google.com/drive/folders/ABCDEFGHIJKLMNOP'], ['outro domínio', 'https://evil.example.com/drive/folders/ABCDEFGHIJKLMNOP'], ['domínio parecido', 'https://drive.google.com.evil.com/drive/folders/ABCDEFGHIJKLMNOP'], ['javascript:', 'javascript:alert(1)'], ['arquivo, não pasta', 'https://drive.google.com/file/d/ABCDEFGHIJKLMNOP/view'], ['id curto', 'abc'], ['vazio', '']])
    t(`recusa link inválido: ${rot}`, (await post({ nome: 'X', pasta })).status === 400);
  t('registra por link completo (com parâmetros extras)', (await post({ nome: 'Fotos 2026 - Anos Iniciais', pasta: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing', obs: 'Pasta da secretaria' })).status === 200);
  t('registra por identificador', (await post({ nome: 'Fotos 2026 - Médio', pasta: 'ZyXwVuTsRqPoNmLk_-12' })).status === 200);
  t('a mesma pasta duas vezes: 409', (await post({ nome: 'Repetida', pasta: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp' })).status === 409);
  d = await G.get('/carometro/drive');
  t('guarda só o identificador e devolve um link normalizado', d.rows.length === 2 && d.rows.some(r => r.link === 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp') && d.rows.every(r => r.estado === 'nao_verificada' && !/usp|token|key/i.test(JSON.stringify(r))), d.rows);
  const r1 = d.rows.find(r => /Anos Iniciais/.test(r.nome));
  t('conferência manual registra data e quem', (await G.post('/carometro/drive/conferir', { id: r1.id })).ok && (await G.get('/carometro/drive')).rows.find(r => r.id === r1.id).estado === 'conferida_manual' && (await G.get('/carometro/drive')).rows.find(r => r.id === r1.id).conferidaPor.length > 2);
  t('remover tira da lista (só a referência) e permite registrar de novo', (await G.post('/carometro/drive/remover', { id: r1.id })).ok && (await G.get('/carometro/drive')).rows.length === 1 && (await post({ nome: 'Volta', pasta: '1AbCdEfGhIjKlMnOp' })).status === 200 && (await G.get('/carometro/drive')).rows.find(r => r.nome === 'Volta').estado === 'nao_verificada');
  t('pasta inexistente: 404', (await G.req('POST', '/carometro/drive/conferir', { id: 99999 })).status === 404);
  t('o Carômetro local segue funcionando sem o Drive', (await G.req('GET', '/carometro/alunos')).status === 200);

  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    await U.ir(p, 'cmdrive', 800); await p.waitForSelector('.datatable');
    t(`${nome}: aviso de sincronização não operacional e salvaguardas`, /Sincronização ainda não operacional/.test(await p.innerText('#content')) && /Salvaguardas/.test(await p.innerText('#content')));
    t(`${nome}: link do Drive abre em nova aba, sem vazar a origem`, await p.$eval('.datatable a', a => a.target === '_blank' && /noopener/.test(a.rel) && a.href.startsWith('https://drive.google.com/drive/folders/')));
    await p.click('#drvNova'); await p.fill('#drvNome', 'Pasta pela tela ' + nome); await p.fill('#drvPasta', 'https://drive.google.com/drive/folders/Tela' + nome + '1234567'); await p.click('#drvOk');
    await p.waitForFunction(n => document.querySelector('#content').innerText.includes(n), 'Pasta pela tela ' + nome);
    t(`${nome}: registrar pela tela`, true);
    await p.evaluate(() => document.querySelector('#drvNova').click()); await p.fill('#drvNome', 'Ruim'); await p.fill('#drvPasta', 'https://outro.com/x'); await p.evaluate(() => document.querySelector('#drvOk').click());
    await p.waitForFunction(() => /Informe o link/.test(document.querySelector('#drvErro').innerText));
    t(`${nome}: link inválido mostra o erro no diálogo`, true);
    await p.click('.admin-overlay [data-close]'); await p.waitForFunction(() => !document.querySelector('.admin-overlay'));
    if (dir) await p.screenshot({ path: `${dir}/drive-${nome}.png`, fullPage: true });
    t(`${nome}: sem estouro horizontal`, await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2));
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
