// Publicação (interface real): criar rascunho pelo formulário novo, editar, excluir e as regras de revisão/duplicar/adaptar/compartilhar pela API.
// Uso: node fluxo.test.js <install.out>
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const a = await U.entrar(process.argv[2]);
  await a.post('/integrations/settings', { meta_app_id: 'APPID', meta_app_secret: 'META_SECRET' }); await a.post('/integrations/meta/token', { token: 'GOOD_TOKEN' });
  const b = await U.abrir();
  const p = await U.pagina(b, 'NAT-3301', a.nova);
  await U.ir(p, 'igconteudos');
  // ---- criar rascunho ----
  await p.click('#newBtn'); await p.click('[data-modo="agendar"]'); await p.waitForSelector('#igpub');
  await p.fill('#igpLeg', 'Matrículas abertas para 2027. Venha conhecer o Colégio Evolução.');
  await p.click('#igpRasc'); await p.waitForTimeout(1200);
  let rows = (await a.get('/data?module=conteudos')).rows;
  const pub = rows.find(r => /Matrículas abertas/.test(r.legenda || ''));
  t('rascunho criado pelo formulário novo', pub && pub.status === 'RASCUNHO' && pub.canal === 'Instagram', pub);
  const id = pub.id;
  // ---- editar pelo formulário novo ----
  await U.ir(p, 'igconteudos');
  await p.click(`[data-ac="editar"][data-id="${id}"]`); await p.waitForSelector('#igpub');
  t('editar abre o formulário novo com a legenda salva', /Matrículas abertas/.test(await p.inputValue('#igpLeg')) && await p.$('#estForm') === null);
  await p.fill('#igpLeg', 'Matrículas abertas para 2027 (revisada).'); await p.click('#igpRasc'); await p.waitForTimeout(1200);
  t('a edição foi salva', (await a.get('/data?module=conteudos')).rows.find(r => r.id === id).legenda.includes('revisada'));
  // ---- regras pela API ----
  const semAprov = await a.put(`/data?module=conteudos&id=${id}`, { status: 'APROVADO' });
  t('aprovar pela edição comum é recusado', semAprov.http === 400 || semAprov.http === 409, semAprov);
  const dup = await a.post('/content/duplicate', { id });
  t('duplicar cria rascunho sem data', dup.status === 'RASCUNHO' && !dup.publicacaoEm, dup);
  const ad = await a.post('/content/adapt', { id, perfil: '@geracaoevolucao' });
  t('adaptar cria cópia para o outro perfil', ad.perfil === '@geracaoevolucao' && ad.adaptadoDe === id, ad);
  const sh = await a.post('/content/share', { id: dup.id, compartilhado: true });
  t('compartilhar marca nos dois perfis', sh.perfil === 'Ambos' && sh.compartilhado === 'SIM', sh);
  // ---- excluir ----
  await U.ir(p, 'igconteudos');
  const bt = await p.$(`[data-ac="excluir"][data-id="${dup.id}"]`); t('a lista oferece Excluir para o rascunho', !!bt); await bt.evaluate(e => e.click()); await p.waitForSelector('#dlgOk'); await p.click('#dlgOk'); await p.waitForTimeout(1000);
  t('excluir remove a publicação depois de confirmar', !(await a.get('/data?module=conteudos')).rows.some(r => r.id === dup.id));
  t('nenhum diálogo nativo nem erro de script', p.errs.length === 0, p.errs);
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
