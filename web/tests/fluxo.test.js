// Fluxo da publicação no Estúdio (interface real): criar, prévias, materiais com versões, revisão, aprovação, agendamento, confirmação,
// duplicar, adaptar, compartilhar, comparar versões, aviso de alterações não salvas e ausência de diálogos nativos do navegador.
// Uso: node fluxo.test.js <install.out>
const U = require('./lib/ui');
const { t, fim } = U.contador();
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
(async () => {
  const a = await U.entrar(process.argv[2]);
  const b = await U.abrir();
  const p = await U.pagina(b, 'NAT-3301', a.nova);
  await U.ir(p, 'igconteudos');
  // ---- criar ----
  await p.click('#newBtn');
  await p.waitForSelector('#estForm');
  t('abre o Estúdio em um diálogo interno', await p.$('.est-box') !== null);
  await p.fill('#fTitulo', 'Matrículas abertas');
  await p.selectOption('#fPerfil', '@evolucaopb'); await p.selectOption('#fSeg', 'Ensino Médio'); await p.selectOption('#fFmt', 'Feed');
  await p.fill('#fLeg', 'Venha conhecer o Colégio Evolução e garanta a vaga do seu filho para o próximo ano letivo. ' + 'x'.repeat(80));
  await p.fill('#fTags', '#evolucao #matriculas');
  await p.fill('#fCta', 'Link na bio');
  await p.fill('#fLink', 'https://colegioevolucao.com.br/matriculas'); await p.fill('#uCam', 'matriculas2027');
  t('contador da legenda e das hashtags', /\/2200/.test(await p.innerText('#cLeg')) && /2\/30/.test(await p.innerText('#cTag')));
  t('prévia do Feed mostra a legenda cortada em 125 letras', /Venha conhecer/.test(await p.innerText('#prevBox')) && /mais/.test(await p.innerText('#prevBox')));
  t('link com UTM montado', /utm_campaign=matriculas2027/.test(await p.innerText('#uOut')) && /utm_source=instagram/.test(await p.innerText('#uOut')), await p.innerText('#uOut'));
  await p.click('[data-prev="Stories"]');
  t('prévia de Stories 9:16', await p.$('.prev-midia.p916') !== null);
  await p.click('[data-prev="Reels"]'); await p.fill('#fRot', 'Cena 1 mostra a fachada da escola. Cena 2 mostra a sala de aula. '.repeat(3));
  t('prévia de Reels mostra a duração do roteiro', /cerca de \d+s/.test(await p.innerText('#prevBox')), await p.innerText('#prevBox'));
  await p.click('#aSalvar'); await p.waitForSelector('#mArq', { state: 'attached', timeout: 10000 });
  let rows = (await a.get('/data?module=conteudos')).rows;
  const pub = rows.find(r => r.titulo === 'Matrículas abertas');
  t('publicação criada com perfil, segmento, formato e UTM', pub && pub.perfil === '@evolucaopb' && pub.segmento === 'Ensino Médio' && pub.formato === 'Feed' && pub.utmCampaign === 'matriculas2027', pub);
  const id = pub.id;
  // ---- materiais ----
  await p.selectOption('#mPapel', 'final');
  await p.setInputFiles('#mArq', { name: 'arte.jpg', mimeType: 'image/jpeg', buffer: JPEG });
  await p.waitForSelector('.mat', { timeout: 10000 }); await p.waitForTimeout(500);
  let mats = (await a.get(`/content/materials?id=${id}`)).materiais;
  t('arte final anexada como material da publicação', mats.length === 1 && mats[0].papel === 'final' && mats[0].versao === 1, mats);
  t('a prévia usa a arte final', await p.$('.prev-midia img') !== null);
  await p.selectOption('#mPapel', 'referencia'); await p.fill('#mUrl', 'https://drive.google.com/file/d/ABC123/view'); await p.click('#mUrlAdd');
  await p.waitForFunction(() => document.body.innerText.includes('Abrir no Drive'), null, { timeout: 10000 });
  mats = (await a.get(`/content/materials?id=${id}`)).materiais;
  t('link do Drive guardado só como link, com botão Abrir no Drive', mats.some(m => m.tipo === 'drive' && /drive.google.com/.test(m.url)) && !mats.some(m => m.tipo === 'drive' && m.caminho), mats);
  // substituir versão da arte final
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-subst][data-papel="final"]')]);
  await fc.setFiles({ name: 'arte-v2.jpg', mimeType: 'image/jpeg', buffer: JPEG });
  await p.waitForFunction(() => document.body.innerText.includes('Versões anteriores'), null, { timeout: 10000 });
  mats = (await a.get(`/content/materials?id=${id}`)).materiais;
  t('substituir versão guarda a anterior', mats.filter(m => m.papel === 'final').length === 2 && mats.filter(m => m.papel === 'final' && m.substituido).length === 1 && mats.find(m => m.papel === 'final' && !m.substituido).versao === 2, mats);
  // ---- fluxo ----
  await p.fill('#fQuando', U.dia(3) + 'T10:00'); await p.fill('#fResp', 'x').catch(() => {});
  await p.selectOption('#fResp', { label: 'Antônio Filho' }); await p.selectOption('#fRev', { label: 'Natália Mello' });
  await p.click('#aSalvar'); await p.waitForTimeout(800);
  await p.click('#aRev'); await p.waitForFunction(() => document.querySelector('#aAprovar'), null, { timeout: 10000 });
  let r = (await a.get('/data?module=conteudos')).rows.find(x => x.id === id);
  t('enviada para revisão', r.status === 'EM REVISÃO', r.status);
  const semAprov = await a.put(`/data?module=conteudos&id=${id}`, { status: 'APROVADO' });
  t('aprovar pela edição comum é recusado (só pela decisão de revisão)', semAprov.http === 400 || semAprov.http === 409, semAprov);
  await p.click('#aAprovar'); await p.waitForSelector('#dlgForm'); await p.fill('#dlgIn', 'Pode seguir.'); await p.click('#dlgForm button[type=submit]');
  await p.waitForFunction(() => document.querySelector('#aAgendar'), null, { timeout: 10000 });
  r = (await a.get('/data?module=conteudos')).rows.find(x => x.id === id);
  t('aprovada internamente com quem aprovou e quando', r.status === 'APROVADO' && r.aprovadoPor === 'Natália Mello' && r.aprovadoEm, r);
  await p.click('#aAgendar'); await p.waitForFunction(() => document.querySelector('#aDesagendar'), null, { timeout: 10000 });
  r = (await a.get('/data?module=conteudos')).rows.find(x => x.id === id);
  t('agendada', r.status === 'AGENDADO', r.status);
  await p.click('#aConfirmar'); await p.waitForSelector('#dlgForm'); await p.fill('#dlgIn', 'https://www.instagram.com/p/ABC/'); await p.click('#dlgForm button[type=submit]');
  await p.waitForFunction(() => !document.querySelector('#aAgendar') && !document.querySelector('#aDesagendar') && document.querySelector('#aDup'), null, { timeout: 10000 });
  r = (await a.get('/data?module=conteudos')).rows.find(x => x.id === id);
  t('publicação confirmada com link e quem confirmou', r.status === 'PUBLICADO' && /instagram.com/.test(r.linkPublicacao) && r.publicadoConfirmadoPor, r);
  t('publicada fica só para consulta', await p.$('#aSalvar') === null);
  const hist = await a.get(`/timeline?module=conteudos&id=${id}`);
  t('linha do tempo registra revisão, aprovação, agendamento e publicação', hist.rows.filter(x => x.tipo === 'status').length >= 4, hist.rows.map(x => x.texto));
  // ---- duplicar / adaptar / compartilhar (API usada pelos botões) ----
  await p.click('#aDup'); await p.waitForTimeout(1200);
  rows = (await a.get('/data?module=conteudos')).rows;
  const copia = rows.find(x => x.duplicadoDe === id);
  t('duplicar cria rascunho sem data, sem arte final e sem publicação', copia && copia.status === 'RASCUNHO' && !copia.publicacaoEm && !(copia.materiais || []).some(m => m.papel === 'final') && !copia.instagramLink, copia);
  const ad = await a.post('/content/adapt', { id, perfil: '@geracaoevolucao' });
  t('adaptar cria cópia para o outro perfil', ad.perfil === '@geracaoevolucao' && ad.adaptadoDe === id, ad);
  const sh = await a.post('/content/share', { id: copia.id, compartilhado: true });
  t('compartilhar marca nos dois perfis', sh.perfil === 'Ambos' && sh.compartilhado === 'SIM', sh);
  // ---- versões do texto e comparação ----
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await U.ir(p, 'igconteudos');
  await p.click(`[data-pub="${copia.id}"]`); await p.waitForSelector('#estForm');
  await p.fill('#fLeg', 'Legenda nova da cópia.'); await p.click('#aSalvar'); await p.waitForTimeout(800);
  await p.fill('#fLeg', 'Legenda nova da cópia, agora revisada.'); await p.click('#aSalvar'); await p.waitForTimeout(800);
  await p.click('#aVers'); await p.waitForSelector('.vers-cmp');
  t('comparação de versões mostra diferenças', (await p.$$('.vers-cmp ins, .vers-cmp del')).length > 0);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // ---- aviso de alterações não salvas ----
  await p.fill('#fTitulo', 'Título alterado sem salvar');
  await p.click('#aFechar'); await p.waitForTimeout(400);
  t('fechar com alterações pede confirmação em diálogo interno', /Alterações não salvas/.test(await p.innerText('body')));
  await p.click('#dlgOk'); await p.waitForTimeout(400);
  t('confirmar sair descarta a alteração', await p.$('#estForm') === null && (await a.get('/data?module=conteudos')).rows.find(x => x.id === copia.id).titulo !== 'Título alterado sem salvar');
  t('nenhum diálogo nativo (alert/confirm/prompt) foi aberto e nenhum erro de script', p.errs.length === 0, p.errs);
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
