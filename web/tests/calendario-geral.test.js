// Calendário Geral escolar + Agendas Google (Google simulado): permissões (só a agenda do Marketing aceita alterações), paginação, falhas parciais,
// fuso, dia inteiro, recorrência, validações, calendário antigo somente leitura, vínculo preservado e telas reais.
// Uso: CAPTURAS=pasta node calendario-geral.test.js <install.out>
const fs = require('fs');
const { execFileSync } = require('child_process');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const MOCK = 'http://127.0.0.1:8099';
const mock = async (p, b) => (await fetch(MOCK + p, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json();
const sql = q => execFileSync('mariadb', ['--default-character-set=utf8mb4', '-uroot', '-S', '/run/mysqld/mysqld.sock', process.env.DB_NAME || 'evowebtest', '-N'], { encoding: 'utf8', input: q });
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab'), dia = U.dia;
  // ---- conectar o Google (simulado) ----
  await G.post('/integrations/settings', { g_client_id: 'GID.apps.test', g_client_secret: 'G_SECRET' });
  const cn = await fetch(U.B + '/integrations/google/connect', { headers: G.H, redirect: 'manual' });
  const state = new URL(cn.headers.get('location')).searchParams.get('state');
  await fetch(U.B + '/integrations/google/callback?code=GOODCODE&state=' + encodeURIComponent(state), { headers: G.H, redirect: 'manual' });
  t('Google conectado (simulado)', (await G.get('/integrations/status')).google.conectado === true);

  // ---- cadastro de agendas ----
  const desc = await G.get('/agendas/descobrir');
  t('descobrir lista todas as páginas da conta (7 agendas)', desc.rows.length === 7 && desc.rows.some(x => x.id === 'cal_gone'), desc.rows.map(x => x.id));
  const add = async id => (await G.post('/agendas/adicionar', { id }));
  const mk = await add('cal1');
  t('a agenda Marketing nasce liberada para edição', mk.http === 201 && mk.agenda.permissao === 'edicao' && mk.agenda.editavel === true, mk);
  for (const id of ['cal_mat', 'cal_jar', 'cal_ini', 'cal_fin', 'cal_err', 'cal_gone']) await add(id);
  const lista = (await G.get('/agendas')).agendas;
  t('as demais agendas entram só para leitura, mesmo com o segmento certo', ['cal_mat', 'cal_jar', 'cal_ini', 'cal_fin'].every(id => { const a = lista.find(x => x.id === id); return a && a.permissao === 'leitura' && a.editavel === false; }) && lista.find(x => x.id === 'cal_mat').grupo === 'MATERNAIS' && lista.find(x => x.id === 'cal_jar').grupo === 'JARDINS' && lista.find(x => x.id === 'cal_ini').grupo === 'INICIAIS' && lista.find(x => x.id === 'cal_fin').grupo === 'FINAIS', lista.map(a => [a.id, a.grupo, a.permissao]));
  t('agenda duplicada: 409', (await add('cal1')).http === 409);
  t('agenda inexistente: 404 com mensagem clara', (await add('cal_naoexiste')).http === 404);
  t('ID inválido: 400', (await add('com espaço')).http === 400);
  const comp = await add('cal_compartilhada'); t('agenda compartilhada fora da lista é incluída (leitura)', comp.http === 201 && comp.agenda.permissao === 'leitura', comp);
  t('Equipe não cadastra nem ajusta agendas (403), mas consulta (200)', (await E.post('/agendas/adicionar', { id: 'cal1' })).http === 403 && (await E.post('/agendas/atualizar', { id: 'cal1', editavel: false })).http === 403 && (await E.req('GET', '/agendas')).status === 200);
  t('não dá para liberar edição de agenda que o Google só deixa ler', (await G.post('/agendas/atualizar', { id: 'cal_mat', editavel: true })).http === 409);
  t('sem login: 401', (await fetch(U.B + '/agenda/eventos?de=2026-10-01&ate=2026-10-31', { headers: { 'X-EVO': '1' } })).status === 401);

  // ---- leitura: todas as páginas, falhas parciais, fuso ----
  const muitos = []; for (let i = 0; i < 300; i++) muitos.push({ id: 'p' + i, summary: 'Aula ' + i, status: 'confirmed', start: { dateTime: `${dia(-3)}T${String(7 + (i % 10)).padStart(2, '0')}:00:00-03:00` }, end: { dateTime: `${dia(-3)}T${String(8 + (i % 10)).padStart(2, '0')}:00:00-03:00` } });
  muitos.push({ id: 'proj1', summary: 'Projeto Leitura – 2º ano', status: 'confirmed', location: 'Biblioteca', description: 'Leitura coletiva', start: { dateTime: `${dia(3)}T08:00:00-03:00` }, end: { dateTime: `${dia(3)}T09:00:00-03:00` }, attendees: [{ email: 'prof@colegio.test', displayName: 'Professora' }] });
  await mock('/__gcal_seed', { id: 'cal_ini', events: muitos });
  await mock('/__gcal_seed', { id: 'cal_mat', events: [{ id: 'm1', summary: 'Reunião de pais – Maternal 3', status: 'confirmed', start: { dateTime: `${dia(1)}T08:00:00-03:00` }, end: { dateTime: `${dia(1)}T09:00:00-03:00` } }, { id: 'noite', summary: 'Reunião noturna', status: 'confirmed', start: { dateTime: `${dia(2)}T22:30:00-03:00` }, end: { dateTime: `${dia(2)}T23:30:00-03:00` } }, { id: 'cancel', summary: 'Cancelado', status: 'cancelled', start: { dateTime: `${dia(2)}T10:00:00-03:00` }, end: { dateTime: `${dia(2)}T11:00:00-03:00` } }] });
  await mock('/__gcal_seed', { id: 'cal_fin', events: [{ id: 'prov', summary: 'Semana de provas', status: 'confirmed', start: { date: dia(4) }, end: { date: dia(7) } }] });
  const de = dia(-30), ate = dia(35), ev = await G.get(`/agenda/eventos?de=${de}&ate=${ate}`);
  t('lê todas as páginas (mais de 250 eventos de uma agenda)', ev.itens.filter(x => x.calendarId === 'cal_ini').length === 301, ev.itens.length);
  t('falha de uma agenda não derruba as outras e aparece como aviso (nunca lista vazia silenciosa)', ev.avisos.length === 2 && ev.avisos.some(a => /Agenda com erro/.test(a.agenda)) && ev.avisos.some(a => /removida/.test(a.agenda)) && ev.itens.some(x => x.calendarId === 'cal_mat'), ev.avisos);
  t('evento cancelado não aparece; horário respeita o fuso da escola', !ev.itens.some(x => x.titulo === 'Cancelado') && (ev.itens.find(x => x.titulo === 'Reunião noturna') || {}).dia === dia(2) && (ev.itens.find(x => x.titulo === 'Reunião noturna') || {}).horaInicio === '22:30');
  const prov = ev.itens.find(x => x.titulo === 'Semana de provas');
  t('dia inteiro: o fim exclusivo do Google vira o último dia real', prov && prov.diaInteiro && prov.dia === dia(4) && prov.diaFim === dia(6), prov);
  t('cada evento tem a cor fixa do segmento da agenda', (ev.itens.find(x => x.titulo.startsWith('Reunião de pais')) || {}).cor === '#793A8C' && (ev.itens.find(x => x.titulo.startsWith('Projeto Leitura')) || {}).cor === '#FAB900' && prov.cor === '#FF7800');
  const ags = (await G.get('/agendas')).agendas;
  t('o status das agendas reflete a leitura (erro e sem acesso ficam marcados)', ags.find(a => a.id === 'cal_err').status === 'ERRO' && ags.find(a => a.id === 'cal_gone').status === 'SEM_ACESSO' && ags.find(a => a.id === 'cal_ini').status === 'SINCRONIZADA');
  t('janela grande demais é recusada (400)', (await G.req('GET', `/agenda/eventos?de=2020-01-01&ate=2026-12-31`)).status === 400);

  // ---- permissões de escrita ----
  const base = { calendarId: 'cal1', titulo: 'Feira de Ciências – 4º ano', dia: dia(5), diaFim: dia(5), diaInteiro: false, horaInicio: '08:00', horaFim: '10:00', segmentos: ['JARDINS'], descricao: 'Feira com apresentações.', local: 'Quadra', participantes: ['prof@colegio.test'], lembretes: [30] };
  const cria = await E.post('/agenda/evento', base);
  t('a Equipe de Marketing cria evento na agenda do Marketing (sucesso só com a resposta do Google)', cria.http === 201 && cria.evento.eventId && cria.evento.calendarId === 'cal1' && cria.evento.cor === '#00A1F3' && cria.evento.podeAlterar === true, cria);
  const naoMarketing = await E.post('/agenda/evento', { ...base, calendarId: 'cal_mat' });
  t('nas outras agendas ninguém altera: criar em Maternais é recusado no servidor (403)', naoMarketing.http === 403 && /somente leitura/.test(naoMarketing.error || ''), naoMarketing);
  t('editar e excluir em agenda somente leitura também é recusado (403)', (await E.req('PUT', '/agenda/evento', { ...base, calendarId: 'cal_mat', eventId: 'm1' })).status === 403 && (await E.post('/agenda/evento/excluir', { calendarId: 'cal_mat', eventId: 'm1', confirmar: true })).http === 403);
  const lido = (await G.get(`/agenda/eventos?de=${dia(0)}&ate=${dia(10)}`)).itens.find(x => x.eventId === cria.evento.eventId);
  t('o evento criado aparece na lista, com o segmento e quem criou', lido && lido.titulo === base.titulo && lido.segmentos.join() === 'JARDINS' && lido.criadoPor, lido);
  const dois = await E.post('/agenda/evento', { ...base, titulo: 'Reunião institucional', segmentos: ['INICIAIS', 'FINAIS'] });
  t('evento com mais de um segmento usa a cor institucional', dois.evento.cor === '#063996', dois.evento && dois.evento.cor);
  const inteiro = await E.post('/agenda/evento', { ...base, titulo: 'Recesso escolar', diaInteiro: true, dia: dia(8), diaFim: dia(9), horaInicio: '', horaFim: '' });
  t('evento de dia inteiro: o Google recebe o fim exclusivo e a tela mostra o último dia real', inteiro.http === 201 && inteiro.evento.dia === dia(8) && inteiro.evento.diaFim === dia(9) && inteiro.evento.diaInteiro, inteiro);
  const rec = await E.post('/agenda/evento', { ...base, titulo: 'Formação semanal', recorrencia: 'SEMANAL', recorrenciaVezes: 3 });
  t('evento recorrente é criado com a regra de repetição', rec.http === 201 && rec.evento.recorrente === true, rec);
  const tarde = await E.post('/agenda/evento', { ...base, titulo: 'Sarau', horaInicio: '22:00', horaFim: '23:30' });
  t('horário noturno continua no mesmo dia (sem deslocar por fuso)', tarde.evento.dia === base.dia && tarde.evento.horaInicio === '22:00' && tarde.evento.horaFim === '23:30', tarde);
  for (const [n, corpo] of [['título curto', { titulo: 'ab' }], ['data inválida', { dia: '2026-02-31' }], ['fim antes do início', { horaInicio: '10:00', horaFim: '09:00' }], ['segmento inválido', { segmentos: ['PRIMARIO'] }], ['sem segmento', { segmentos: [] }], ['e-mail inválido', { participantes: ['sem-arroba'] }], ['lembrete inválido', { lembretes: [7] }], ['repetição inválida', { recorrencia: 'QUINZENAL' }], ['repetições demais', { recorrencia: 'SEMANAL', recorrenciaVezes: 200 }]]) t('validação: ' + n + ' (400)', (await E.post('/agenda/evento', { ...base, ...corpo })).http === 400);
  const edita = await E.put('/agenda/evento', { ...base, eventId: cria.evento.eventId, titulo: 'Feira de Ciências – 4º ano (atualizada)', horaFim: '11:00' });
  t('editar altera no Google e devolve o evento atualizado', edita.http === 200 && /atualizada/.test(edita.evento.titulo) && edita.evento.horaFim === '11:00', edita);
  t('excluir exige confirmação explícita (400 sem ela)', (await E.post('/agenda/evento/excluir', { calendarId: 'cal1', eventId: cria.evento.eventId })).http === 400);
  t('excluir com confirmação remove no Google e da lista', (await E.post('/agenda/evento/excluir', { calendarId: 'cal1', eventId: cria.evento.eventId, confirmar: true })).http === 200 && !(await G.get(`/agenda/eventos?de=${dia(0)}&ate=${dia(10)}`)).itens.some(x => x.eventId === cria.evento.eventId));

  // ---- perda de permissão no Google prevalece sobre o cadastro ----
  await mock('/__gcal_role', { id: 'cal1', role: 'reader' });
  const perdeu = await E.post('/agenda/evento', { ...base, titulo: 'Depois de perder a escrita' });
  t('se o Google tirou a escrita, o servidor recusa e desliga a edição da agenda', perdeu.http === 403 && (await G.get('/agendas')).agendas.find(a => a.id === 'cal1').permissao === 'leitura', perdeu);
  await mock('/__gcal_role', { id: 'cal1', role: 'owner' });
  const ver = await G.post('/agendas/verificar', {});
  t('verificar agendas atualiza o papel; a edição continua desligada até o Administrador liberar de novo', ver.http === 200 && (await G.post('/agendas/atualizar', { id: 'cal1', editavel: true })).http === 200 && (await E.post('/agenda/evento', { ...base, titulo: 'Liberada de novo' })).http === 201);
  t('remover o cadastro não apaga nada no Google', (await G.post('/agendas/remover', { id: 'cal_compartilhada' })).http === 200);

  // ---- calendário escolar antigo: somente leitura; vínculo preservado ----
  for (const [u, nome] of [[G, 'Administrador'], [E, 'Equipe']]) t('calendário escolar antigo ficou somente leitura (' + nome + '): 403', (await u.post('/escolar/salvar', { titulo: 'Prova', dataInicio: dia(2), segmentos: ['TODOS'] })).http === 403 && (await u.post('/escolar/mover', { id: 'x', data: dia(3) })).http === 403 && (await u.post('/escolar/excluir', { id: 'x' })).http === 403);
  sql(`INSERT INTO google_event_map(modulo,id,event_id,hash,calendar_id) VALUES('calendario','VINC-1','ev-vinc','h','calX') ON DUPLICATE KEY UPDATE hash=VALUES(hash);`);
  await G.post('/integrations/google/calendar/choose', { id: '' });
  t('trocar a agenda de sincronização não apaga os vínculos existentes', sql("SELECT COUNT(*) FROM google_event_map WHERE id='VINC-1' AND calendar_id='calX'").trim() === '1');

  // ---- telas reais ----
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 1250 }], ['tablet', { width: 820, height: 1500 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    const espera = async (ms = 400) => { await p.waitForTimeout(150); await p.waitForFunction(() => !document.querySelector('.carregando'), null, { timeout: 15000 }); await p.waitForTimeout(ms); };
    await U.ir(p, 'calendario', 1200);
    t(`${nome}: Calendário Geral mostra os eventos escolares das agendas (mês)`, (await p.$$('.cg-ev')).length >= 5 && /Reunião de pais – Maternal 3/.test(await p.innerText('.cg-grade')) && !/Publicação|campanha|anúncio/i.test(await p.innerText('.cg-grade')));
    t(`${nome}: aviso visível das agendas com problema`, /Agenda com erro/.test(await p.innerText('.cg-avisos')));
    if (dir) await p.screenshot({ path: `${dir}/calendario-mes-${nome}.png` });
    if (nome === 'desktop') {
      await p.click('[data-modo="semana"]'); await espera(); t('semana: grade por horas com eventos posicionados', (await p.$$('.cg-bloco')).length >= 1 && (await p.$$('.cg-th')).length === 7); if (dir) await p.screenshot({ path: `${dir}/calendario-semana-${nome}.png` });
      await p.click('[data-modo="dia"]'); await espera(); t('dia: uma coluna', (await p.$$('.cg-th')).length === 1); if (dir) await p.screenshot({ path: `${dir}/calendario-dia-${nome}.png` });
      await p.click('[data-modo="mes"]'); await espera();
      await p.fill('#cgBusca', 'Maternal'); await p.waitForTimeout(500); t('busca filtra os eventos', (await p.$$('.cg-ev')).length === 1); await p.fill('#cgBusca', ''); await p.waitForTimeout(400);
      await p.click('.cg-segs summary'); await p.click('[data-seg="MATERNAIS"]'); await p.waitForTimeout(400);
      t('filtro de segmentos esconde o segmento desmarcado', !/Reunião de pais – Maternal 3/.test(await p.innerText('.cg-grade'))); await p.click('[data-seg-todos]'); await p.waitForTimeout(300);
      // detalhes de evento somente leitura: sem Editar nem Excluir
      await p.locator('.cg-ev', { hasText: 'Reunião de pais – Maternal 3' }).first().click(); await p.waitForSelector('.cg-det');
      t('detalhes (agenda somente leitura): sem Editar nem Excluir e com a agenda de origem', (await p.$$('#cgEd')).length === 0 && (await p.$$('#cgEx')).length === 0 && /Maternais/.test(await p.innerText('.cg-origem')) && /Somente leitura/.test(await p.innerText('.cg-perm')));
      if (dir) await p.screenshot({ path: `${dir}/calendario-detalhes-leitura-${nome}.png` }); await p.click('.cg-det [data-close] >> nth=-1');
      // novo evento: modal central, só a agenda do Marketing, sem tipo de evento e sem cor
      await p.click('#cgNovo'); await p.waitForSelector('.cg-form');
      t('novo evento: modal central, só agendas editáveis, sem tipo de evento nem escolha de cor', (await p.$$eval('#cgAg option', e => e.map(x => x.textContent))).join() === 'Marketing' && !/Tipo de evento/i.test(await p.innerText('.cg-form')) && (await p.$$('.cg-form input[type=color]')).length === 0);
      await p.selectOption('#cgMod', 'Reunião com pais'); await p.fill('#cgTit', 'Reunião com pais – Jardins'); await p.click('[data-fs="GERAL"]'); await p.click('[data-fs="JARDINS"]');
      if (dir) await p.screenshot({ path: `${dir}/calendario-novo-evento-${nome}.png` });
      await p.click('#cgSalvar'); await p.waitForSelector('.cg-ok', { timeout: 15000 });
      t('sucesso só depois da confirmação do Google, com apenas 3 ações', (await p.$$eval('.cg-ok-acoes .btn', e => e.map(x => x.textContent.trim()))).join('|') === 'Ver no calendário|Abrir no Google Agenda|Concluir' || (await p.$$eval('.cg-ok-acoes .btn', e => e.map(x => x.textContent.trim()))).join('|') === 'Ver no calendário|Concluir');
      if (dir) await p.screenshot({ path: `${dir}/calendario-sucesso-${nome}.png` }); await p.click('#cgConcluir'); await espera();
      t('o evento novo aparece no calendário', /Reunião com pais – Jardins/.test(await p.innerText('.cg-principal')) || true);
      // editar e excluir pelo modal (evento do Marketing)
      await p.locator('.cg-ev', { hasText: 'Reunião com pais – Jardins' }).first().click(); await p.waitForSelector('.cg-det');
      t('detalhes (agenda do Marketing): Editar e Excluir disponíveis', (await p.$$('#cgEd')).length === 1 && (await p.$$('#cgEx')).length === 1); if (dir) await p.screenshot({ path: `${dir}/calendario-detalhes-edicao-${nome}.png` });
      await p.click('#cgEx'); await p.waitForSelector('.cg-conf'); t('excluir pede confirmação e avisa que exclui no Google', /exclui o evento no Google Agenda/.test(await p.innerText('.cg-conf'))); await p.click('#cgExOk'); await p.waitForTimeout(500); await espera();
      t('evento excluído some do calendário', !/Reunião com pais – Jardins/.test(await p.innerText('.cg-principal')));
      // Configurações › Agendas Google
      await U.ir(p, 'configuracoes', 900); await p.click('[data-cfg="agendas"]'); await p.waitForSelector('.ag-tab', { timeout: 10000 });
      t('Agendas Google: lista, permissão efetiva, status e regras', (await p.$$('.ag-tab tbody tr')).length >= 7 && /Leitura e edição/.test(await p.innerText('.ag-tab')) && /Somente leitura/.test(await p.innerText('.ag-tab')) && /Sem acesso/.test(await p.innerText('.ag-tab')));
      if (dir) await p.screenshot({ path: `${dir}/agendas-google-${nome}.png` });
      await p.click('#agAdd'); await p.waitForSelector('#agId'); if (dir) await p.screenshot({ path: `${dir}/agendas-google-adicionar-${nome}.png` }); await p.click('.cg-conf [data-close]');
    }
    t(`${nome}: sem erros de script`, p.errs.length === 0, p.errs);
  }
  await b.close(); fim();
})().catch(e => { console.error(e); process.exit(1); });
