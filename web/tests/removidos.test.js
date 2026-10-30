// Tudo o que saiu do sistema continua fora: Portal, Solicitações, Planejamento, Arquivos, aprovação por link externo, módulos antigos,
// gerenciamento de anúncios e páginas/scripts antigos. Também varre o código por AdsPilot/AdFlow e por diálogos nativos do navegador.
// Uso: node removidos.test.js <install.out>
const fs = require('fs'), path = require('path');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const WEB = path.join(__dirname, '..');
const arquivos = (dir, ext, out = []) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { if (['node_modules', '.next', 'tests', '.git'].includes(f.name)) continue; const p = path.join(dir, f.name); f.isDirectory() ? arquivos(p, ext, out) : ext.test(f.name) && out.push(p); } return out; };
(async () => {
  const G = await U.entrar(process.argv[2]);
  const E = [];
  // páginas e scripts
  for (const u of ['/solicitante.html', '/solicitante', '/portal', '/portal.js', '/portal.css', '/aprovar.html', '/app.js', '/admin.js', '/studio.js', '/gerenciador.js', '/operacao.js', '/solicitacoes.js', '/planejamento.js', '/arquivos.js', '/tpgm.js', '/trafegopro.css', '/solicitacoes.css', '/planejamento.css']) { const s = (await fetch(U.BASE + u)).status; if (s !== 404) E.push(`${u}:${s}`); }
  t('páginas e scripts antigos não existem (404)', E.length === 0, E);
  // rotas
  const R = [];
  const rotas = [['POST', '/portal/login'], ['GET', '/portal/requests'], ['POST', '/portal/requests'], ['GET', '/portal/notices'], ['POST', '/portal/upload'], ['GET', '/portal/file'], ['GET', '/portal/users'], ['GET', '/solicitacoes/painel'], ['POST', '/solicitacoes/nova'], ['POST', '/solicitacoes/mover'], ['GET', '/planejamento/painel'], ['POST', '/planejamento/salvar'], ['GET', '/reports/overview'], ['GET', '/traffic/semanal'], ['GET', '/traffic/snapshots'], ['POST', '/manager/notices'], ['POST', '/manager/approval-link'], ['GET', '/public/approval'], ['POST', '/public/approval'], ['GET', '/admin/portal'], ['POST', '/admin/portal'], ['GET', '/admin/automacoes'], ['POST', '/admin/seed-equipe'], ['GET', '/arquivos/lista'], ['POST', '/arquivos/enviar'], ['POST', '/ia/legenda'], ['POST', '/escolar/solicitar'], ['POST', '/datacom/solicitar'], ['POST', '/datacom/planejar'], ['POST', '/integrations/instagram/media'], ['POST', '/integrations/google/drive/send-entregas'], ['POST', '/integrations/google/sheets/export'], ['POST', '/manager/upload'], ['POST', '/admin/import']];
  for (const [m, u] of rotas) { const x = await G.req(m, u, m === 'GET' ? undefined : {}); if (x.status !== 404) R.push(`${m} ${u}:${x.status}`); }
  t('rotas de Portal, Solicitações, Planejamento, relatórios, aprovação externa, arquivos e importação respondem 404', R.length === 0, R);
  // módulos de dados
  const M = [];
  for (const m of ['solicitacoes', 'tarefas', 'projetos', 'eventos', 'agenda', 'equipe', 'aprovacoes', 'relatorios', 'arquivos', 'integracoes', 'trafego', 'lixeira']) { const x = await G.req('GET', '/data?module=' + m); if (![400, 404].includes(x.status)) M.push(m + ':' + x.status); }
  t('módulos antigos não existem em /data', M.length === 0, M);
  const h = await G.get('/health');
  t('/health lista só os 9 módulos mantidos', h.modules.length === 9, h.modules.map(x => x.modulo || x.nome));
  // menu e telas
  const b = await U.abrir(); const p = await U.pagina(b, 'NAT-3301', G.nova);
  const nav = await p.$$eval('#nav .navitem .navlabel', e => e.map(x => x.innerText.trim()));
  t('o menu tem as áreas do marketing, Uso de Imagem e Carômetro', nav.join('|') === 'Dashboard|Calendário|Instagram|Tráfego Pago|Uso de Imagem|Carômetro|Configurações', nav);
  const caiu = [];
  for (const pg of ['arquivos', 'solicitacoes', 'planejamento', 'tarefas', 'projetos', 'eventos', 'agenda', 'equipe', 'relatorios', 'minhaarea', 'central', 'administracao', 'gerenciador']) { await p.evaluate(x => go(x), pg); await p.waitForTimeout(250); const ativo = await p.$eval('#nav .navitem.active', e => e.innerText.trim()).catch(() => ''); const titulo = await p.$eval('#pageTitle', e => e.innerText.trim()); if (/Arquivos|Solicita|Planejamento|Tarefas|Projetos|Eventos|Agenda$|Equipe|Relat|Minha|Central|Administra/.test(titulo)) caiu.push(pg + '→' + titulo); void ativo; }
  t('endereços antigos não abrem telas antigas (voltam para uma das cinco áreas)', caiu.length === 0, caiu);
  const textoMenu = await p.innerText('#sidebar');
  t('não existe Arquivos como área nem “Portal” no sistema', !/Arquivos|Portal|Solicitações/.test(textoMenu));
  t('sem erros de script', p.errs.length === 0, p.errs);
  await b.close();
  // código: nomes e diálogos
  const proibidos = [], dialogos = [];
  for (const f of arquivos(WEB, /\.(ts|tsx|js|html|css|md|json|sh|sql|mjs)$/)) {
    const rel = path.relative(WEB, f);
    if (/^docs\/(AUDITORIA_V6|RELATORIO_V6)/.test(rel) || /^package-lock/.test(rel) || /migrations\.generated|^db\/migrations\//.test(rel)) continue;
    const s = fs.readFileSync(f, 'utf8');
    if (/AdsPilot|AdFlow|Ads ?Pilot|Ad ?Flow/i.test(s)) proibidos.push(rel);
    if (/^public\/.*\.js$/.test(rel) && !/^public\/(charts|periodo)\.js$/.test(rel) && /(^|[^\w.])(alert|confirm|prompt)\s*\(/.test(s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) dialogos.push(rel);
  }
  t('nenhuma referência a AdsPilot ou AdFlow no código e na documentação', proibidos.length === 0, proibidos);
  t('nenhum alert/confirm/prompt do navegador nos scripts da interface', dialogos.length === 0, dialogos);
  fim();
})().catch(e => { console.error(e); process.exit(1); });
