// Central de notificações: avisos gerados pelo fluxo das publicações. Uso: node notificacoes.test.js <install.out>
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  const c = await G.post('/data?module=conteudos', { titulo: 'Aviso teste', status: 'EM REVISÃO', responsavel: 'Antônio Filho', perfil: '@evolucaopb' });
  t('cria publicação atribuída', c.http === 201 && c.id, c);
  await G.post('/content/decision', { id: c.id, decisao: 'AJUSTES SOLICITADOS', comentario: 'Trocar a arte' });
  const n = await G.get('/notificacoes');
  t('Administrador vê a contagem de não lidas', typeof n.naoLidas === 'number', n);
  const ne = await E.get('/notificacoes');
  t('Equipe vê só o que é destinado a ela', ne.rows.length > 0 && ne.rows.every(r => r.destino === 'Antônio Filho'), ne.rows);
  t('a atribuição e a decisão geram aviso para quem é responsável', ne.rows.some(r => r.tipo === 'responsavel' && r.registro === c.id) && ne.rows.some(r => /ajustes/i.test(r.titulo)), ne.rows.map(r => r.titulo));
  await E.post('/notificacoes/lida', { todas: true });
  t('marcar todas como lidas zera a contagem', (await E.get('/notificacoes')).naoLidas === 0);
  const sem = await fetch(U.B + '/notificacoes');
  t('sem sessão: 401', sem.status === 401);
  fim();
})().catch(e => { console.error(e); process.exit(1); });
