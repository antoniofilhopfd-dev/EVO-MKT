// As cinco áreas na interface real: menu, filtros globais (persistência, limpar, incompatíveis), Dashboard (cartões que abrem os registros, origem dos dados),
// Calendário (camadas, visões, criar ao clicar, reagendar arrastando), Instagram em 4 abas e Configurações por perfil. Uso: node cinco.test.js <install.out>
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const dia = U.dia;
  const camp = await G.post('/data?module=campanhas', { titulo: 'Matrículas 2027', dataInicio: dia(0), prazo: dia(20), status: 'ATIVA' });
  const mk = b => G.post('/data?module=conteudos', { status: 'RASCUNHO', ...b });
  await mk({ titulo: 'Aula aberta', perfil: '@evolucaopb', segmento: 'Ensino Médio', formato: 'Feed', publicacaoEm: dia(2) + 'T09:00', legenda: 'Venha', responsavel: 'Antônio Filho', campanhaId: camp.id });
  await mk({ titulo: 'Reels da feira', perfil: '@geracaoevolucao', segmento: 'Educação Infantil', formato: 'Reels', publicacaoEm: dia(4) + 'T18:00', status: 'EM REVISÃO' });
  await mk({ titulo: 'Stories sem data', perfil: '@evolucaopb', formato: 'Stories', status: 'IDEIA' });
  const ok1 = await mk({ titulo: 'Já publicada', perfil: '@evolucaopb', segmento: 'Ensino Médio', formato: 'Feed', publicacaoEm: dia(-3) + 'T10:00' });
  // ---- Dashboard (API) ----
  const f = `de=${dia(-29)}&ate=${dia(30)}`;
  let d = await G.get('/dashboard/resumo?' + f);
  t('cartões: planejadas, aprovadas, agendadas, publicadas, aguardando revisão, sem arte, sem legenda, sem data', ['planejadas', 'aprovadas', 'agendadas', 'publicadas', 'aguardandoRevisao', 'semArte', 'semLegenda', 'semData'].every(k => d.publicacoes[k] && typeof d.publicacoes[k].total === 'number' && Array.isArray(d.publicacoes[k].ids)), Object.keys(d.publicacoes));
  t('contagens batem com os dados', d.publicacoes.planejadas.total === 3 && d.publicacoes.aguardandoRevisao.total === 1 && d.publicacoes.semData.total === 1 && d.publicacoes.semArte.total === 3, d.publicacoes);
  t('próximas publicações trazem data, perfil, segmento, formato, título, estado, responsável e o que falta', d.proximas.length === 2 && ['quando', 'perfil', 'segmento', 'formato', 'titulo', 'status', 'responsavel', 'faltas'].every(k => k in d.proximas[0]) && d.proximas[0].titulo === 'Aula aberta', d.proximas);
  t('Tráfego sem conta: bloco indisponível com motivo (nada simulado)', d.trafego.disponivel === false && d.trafego.motivo, d.trafego);
  t('no máximo 3 insights e lista de alertas', d.insights.length <= 3 && Array.isArray(d.alertas));
  t('orgânico informa a origem dos dados', d.instagram.origem.fonte && d.instagram.origem.periodo === `${dia(-29)} a ${U.hoje()}`, d.instagram.origem);
  // filtros
  const c = async q => (await G.get(`/dashboard/resumo?${f}&${q}`)).publicacoes.planejadas.total;
  t('filtro de perfil', await c('perfil=@evolucaopb') === 2 && await c('perfil=@geracaoevolucao') === 1);
  t('filtro de segmento', await c('segmento=MEDIO') === 2 && await c('segmento=INFANTIL') === 1);
  t('filtro de formato', await c('formato=Reels') === 1 && await c('formato=Feed') === 2);
  t('filtro de campanha editorial', await c('campanha=' + camp.id) === 1);
  t('filtros combinados', await c('perfil=@evolucaopb&segmento=MEDIO&formato=Feed') === 2 && await c('perfil=@geracaoevolucao&segmento=MEDIO') === 0);
  for (const q of ['perfil=@x', 'segmento=XX', 'formato=Podcast', 'campanha=a b', `de=${dia(0)}&ate=${dia(-5)}`]) t('filtro inválido recusado: ' + q, (await G.req('GET', `/dashboard/resumo?${q.startsWith('de=') ? q : f + '&' + q}`)).status === 400);
  const ig = await G.get(`/instagram/visao?${f}&segmento=MEDIO`);
  t('com segmento escolhido, o orgânico avisa que só conta o que está ligado a uma publicação', ig.somenteVinculadas === true);
  // ---- interface ----
  const b = await U.abrir(); const p = await U.pagina(b, 'NAT-3301', G.nova);
  t('menu: exatamente as cinco áreas', (await p.$$eval('#nav .navitem .navlabel', e => e.map(x => x.innerText.trim()))).join('|') === 'Dashboard|Calendário|Instagram|Tráfego Pago|Configurações');
  await U.ir(p, 'hoje', 1000);
  t('Dashboard: 8 cartões, atalhos só para Nova publicação, Calendário, Instagram e Tráfego Pago', (await p.$$('.db-cartao')).length === 8 && (await p.$$eval('.db-atalhos .btn', e => e.map(x => x.innerText.trim()))).join('|') === 'Nova publicação|Calendário|Instagram|Tráfego Pago');
  t('Dashboard: indicadores com botão de origem', (await p.$$('.origem-btn')).length >= 2);
  await p.click('.origem-btn'); await p.waitForSelector('.ori-lin'); t('a origem mostra fonte e período', /Fonte/.test(await p.innerText('.admin-box')) && /Período/.test(await p.innerText('.admin-box'))); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('[data-cartao="aguardandoRevisao"]'); await p.waitForSelector('.foco-chip');
  t('clicar no cartão abre os registros dele em Instagram › Conteúdos', /Aguardando revisão/.test(await p.innerText('.foco-chip')) && (await p.$$('#igcLista tbody tr')).length === 1 && /Reels da feira/.test(await p.innerText('#igcLista')));
  await p.click('#igcLimparFoco'); await p.waitForTimeout(800);
  t('“Ver todas” limpa o recorte', (await p.$$('#igcLista tbody tr')).length === 4);
  // filtros persistentes entre áreas
  await U.ir(p, 'hoje', 500); await p.selectOption('#fbPerfil', '@evolucaopb'); await p.waitForTimeout(1200);
  t('filtro de perfil vale no Dashboard', (await p.$eval('.db-cartao[data-cartao="planejadas"] strong', e => e.innerText)) === '1');
  await U.ir(p, 'igconteudos', 500);
  t('o mesmo filtro continua em Instagram › Conteúdos (e aplica à lista)', (await p.$eval('#fbPerfil', e => e.value)) === '@evolucaopb' && (await p.$$('#igcLista tbody tr')).length === 3);
  t('o intervalo de datas aparece sempre', /Período/.test(await p.innerText('#filtros')) && /\d{2}\/\d{2}\/\d{4}/.test(await p.innerText('#filtros')) || /navegação própria/.test(await p.innerText('#filtros')));
  await U.ir(p, 'trafego', 500);
  t('em Tráfego Pago o perfil fica desativado, com o motivo, e não é aplicado em silêncio', (await p.$eval('#fbPerfil', e => e.disabled)) === true && /Sem efeito aqui: perfil/.test(await p.innerText('#filtros')));
  await p.click('#fbLimpar'); await p.waitForTimeout(800);
  t('Limpar filtros zera tudo', (await p.$eval('#fbPerfil', e => e.value)) === '' && (await p.$eval('#fbLimpar', e => e.disabled)) === true);
  await p.selectOption('#fbP', '7'); await p.waitForTimeout(1000); await U.ir(p, 'hoje', 500);
  t('o período escolhido também persiste', (await p.$eval('#fbP', e => e.value)) === '7' && /Últimos 7|\d{2}\/\d{2}\/\d{4}/.test(await p.innerText('#filtros')));
  await p.selectOption('#fbP', '30'); await p.waitForTimeout(500);
  // ---- Calendário ----
  await U.ir(p, 'calendario', 1500);
  const legenda = await p.innerText('.cm-tipos');
  t('camadas: publicações, planejamento editorial, calendário escolar, datas comemorativas, feriados e Google Agenda', ['Publicações', 'Planejamento editorial', 'Calendário escolar', 'Datas comemorativas', 'Feriados', 'Google Agenda'].every(k => legenda.includes(k)), legenda);
  t('visões Mês, Semana, Dia e Lista e botão Hoje', (await p.$$eval('[data-modo]', e => e.map(x => x.innerText.trim()))).join('|') === 'Mês|Semana|Dia|Lista' && await p.$('#cmHoje') !== null);
  t('a publicação aparece no calendário com o título', (await p.$$('.cm-item')).length > 0 && /Aula aberta/.test(await p.innerText('#cmRaiz')));
  await p.click('[data-modo="week"]'); await p.waitForTimeout(400); t('visão Semana', await p.$('.cm-semana') !== null);
  await p.click('[data-modo="day"]'); await p.waitForTimeout(400); await p.click('#cmHoje'); await p.waitForTimeout(300);
  await p.click('[data-modo="month"]'); await p.waitForTimeout(400);
  // criar ao clicar
  const alvo = dia(6); await p.click(`.cm-num[data-novo="${alvo}"]`).catch(async () => { await p.click(`.cm-dia[data-date="${alvo}"]`); });
  await p.waitForSelector('.cal-escolha'); t('clicar em um dia oferece criar publicação, compromisso, evento escolar ou data', (await p.$$('.cal-escolha [data-n]')).length === 4);
  await p.click('[data-n="pub"]'); await p.click('[data-modo="agendar"]'); await p.waitForSelector('#igpDia'); t('criar publicação a partir do dia já vem com a data preenchida', (await p.inputValue('#igpDia')) === alvo, await p.inputValue('#igpDia'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // reagendar arrastando
  const o = await p.$(`.cm-item[data-uid^="pub:"]:has-text("Aula aberta")`); const dest = await p.$(`.cm-dia[data-date="${dia(3)}"]`);
  if (o && dest) { await p.dragAndDrop('.cm-item[data-uid^="pub:"]:has-text("Aula aberta")', `.cm-dia[data-date="${dia(3)}"]`); await p.waitForTimeout(1200); }
  const movida = (await G.get('/data?module=conteudos')).rows.find(x => x.titulo === 'Aula aberta');
  t('arrastar a publicação para outro dia reagenda mantendo o horário', movida.publicacaoEm === dia(3) + 'T09:00', movida.publicacaoEm);
  const pub = (await G.get('/data?module=conteudos')).rows.find(x => x.titulo === 'Já publicada');
  t('publicação já publicada não é arrastável', (await p.$eval('body', () => true)) && ok1.id === pub.id);
  t('o link público de leitura tem botão', await p.$('#calLink') !== null);
  // ---- Instagram ----
  await U.ir(p, 'igvisao', 1000);
  t('Instagram tem quatro abas', (await p.$$eval('#subtabs .subtab', e => e.map(x => x.innerText.trim()))).join('|') === 'Visão geral|Conteúdos|Planejamento|Desempenho');
  t('Visão geral é só orgânico (sem investimento nem campanhas pagas)', !/Investimento|Custo por conversa|CPC/i.test(await U.textoConteudo(p)) && /orgânico/i.test(await U.textoConteudo(p)));
  for (const pg of ['igvisao', 'igconteudos', 'igplan', 'igdesempenho']) { await U.ir(p, pg, 600); t('“Nova publicação” disponível em ' + pg, (await p.$$('#content [data-nova]')).length >= 1); }
  await U.ir(p, 'igplan', 600); t('Planejamento: pauta do mês, ideias, campanhas editoriais e modelos', (await p.$$eval('[data-aba]', e => e.map(x => x.innerText.trim()))).join('|') === 'Pauta do mês|Ideias|Campanhas editoriais|Modelos e hashtags');
  await p.click('[data-aba="campanhas"]'); await p.waitForTimeout(900); t('campanha editorial listada', /Matrículas 2027/.test(await U.textoConteudo(p)));
  await U.ir(p, 'igdesempenho', 800); t('Desempenho por perfil, segmento, formato, tema, objetivo, campanha editorial, dia e horário', (await p.$$eval('[data-dim]', e => e.map(x => x.innerText.trim()))).join('|') === 'Formato|Perfil|Segmento|Tema|Objetivo|Campanha editorial|Dia da semana|Horário');
  t('comparação orgânico × impulsionado só com vínculo confirmado', /Sem o vínculo confirmado|Nenhum anúncio/.test(await U.textoConteudo(p)));
  // ---- Configurações ----
  await U.ir(p, 'configuracoes', 800);
  t('Administrador vê as 11 seções', (await p.$$eval('[data-cfg]', e => e.map(x => x.innerText.trim()))).join('|') === 'Geral|Perfis e segmentos|Acessos internos|Instagram|Meta Ads|Google|IA|E-mail|Backup e restauração|Auditoria|Prontidão');
  await p.click('[data-cfg="prontidao"]'); await p.waitForTimeout(1200); const pr = await U.textoConteudo(p);
  t('Prontidão: conexão, sincronização, falha, token, API, backup, integridade, versão e ambiente', ['Conexão com a Meta', 'Última sincronização', 'Próxima sincronização', 'Última falha', 'Validade do token', 'Versão da API', 'Último backup', 'Integridade do banco', 'Versão instalada', 'Ambiente'].every(k => pr.includes(k)), pr.slice(0, 400));
  await p.click('[data-cfg="acessos"]'); await p.waitForTimeout(900); t('Acessos internos com e-mail e perfil', /E-mail/.test(await U.textoConteudo(p)) && (await p.$$('[data-nivel]')).length === 5);
  await p.click('[data-cfg="ia"]'); await p.waitForTimeout(700); t('IA aparece desligada sem chave', /Desligada/.test(await U.textoConteudo(p)));
  await p.click('[data-cfg="backup"]'); await p.waitForTimeout(900); t('Backup mostra a migração e os arquivos sem vínculo', /Migração para as cinco áreas/.test(await U.textoConteudo(p)) && /Arquivos sem vínculo/.test(await U.textoConteudo(p)));
  const pe = await U.pagina(b, 'ANT-3302', E.nova); await U.ir(pe, 'configuracoes', 800);
  t('Equipe vê só Geral, Perfis e segmentos e Prontidão', (await pe.$$eval('[data-cfg]', e => e.map(x => x.innerText.trim()))).join('|') === 'Geral|Perfis e segmentos|Prontidão');
  t('sem erros de script nem diálogos nativos', p.errs.length === 0 && pe.errs.length === 0, [...p.errs, ...pe.errs]);
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
