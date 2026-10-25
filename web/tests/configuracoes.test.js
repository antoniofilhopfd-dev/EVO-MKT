// Configurações em cinco áreas: hub, abas, Integrações com três cartões (sem E-mail/SMTP), permissões no servidor, dados reais do sistema.
// Uso: CAPTURAS=pasta node configuracoes.test.js <install.out>
const fs = require('fs');
const U = require('./lib/ui');
const { t, fim } = U.contador();
(async () => {
  const G = await U.entrar(process.argv[2]), E = await U.entrar(process.argv[2], 'ANT-3302', 'Ant26ab');
  // ---- servidor ----
  const s = await G.get('/admin/sistema');
  t('/admin/sistema traz valores reais (versão, ambiente, banco, arquivos, migrações)', s.versao && s.ambiente && s.node && s.banco.tabelas > 10 && s.banco.bytes > 0 && s.migracoes.aplicadas >= 30 && typeof s.arquivos.total === 'number', s);
  t('Equipe não vê dados do sistema (403)', (await E.req('GET', '/admin/sistema')).status === 403);
  t('sem login: 401', (await fetch(U.B + '/admin/sistema', { headers: { 'X-EVO': '1' } })).status === 401);
  t('/admin/sistema é só consulta (POST recusado)', (await G.req('POST', '/admin/sistema', {})).status >= 400);
  // ---- telas ----
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const foto = async (p, n) => { if (!dir) return; await p.addStyleTag({ content: 'html,body{height:auto!important;overflow:visible!important}#app,main,.main,#content{height:auto!important;max-height:none!important;overflow:visible!important}' }); await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: `${dir}/${n}.png`, fullPage: true }); };
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180 }]]) {
    const p = await U.pagina(b, 'NAT-3301', G.nova, vp);
    t(`${nome}: menu com exatamente as cinco áreas`, (await p.$$eval('#nav .navitem .navlabel', e => e.map(x => x.innerText.trim()))).join('|') === 'Dashboard|Calendário|Instagram|Tráfego Pago|Configurações');
    await U.ir(p, 'configuracoes', 900);
    t(`${nome}: tela inicial com cinco cartões`, (await p.$$eval('.cfg-cartao h2', e => e.map(x => x.textContent))).join('|') === 'Geral|Usuários e Permissões|Integrações|Segurança|Dados do Sistema');
    await foto(p, `configuracoes-inicio-${nome}`);
    const abre = async (sec, aba) => { await U.ir(p, 'configuracoes', 500); await p.click(`[data-cfg-sec="${sec}"]`); await p.waitForSelector('#cfgCorpo, .cfg-int-grade', { timeout: 10000 }); if (aba) { await p.click(`[data-cfg-aba="${aba}"]`); } await p.waitForTimeout(900); return p.evaluate(() => document.querySelector('#content').innerText); };
    let tx = await abre('geral');
    t(`${nome}: Geral com as quatro abas e trilha`, (await p.$$eval('[data-cfg-aba]', e => e.map(x => x.textContent))).join('|') === 'Informações da Escola|Aparência|Preferências|Segmentos' && /Configurações › Geral/.test(tx.replace(/\s+/g, ' ')) && /Colégio Evolução/.test(tx));
    tx = await abre('geral', 'aparencia'); t(`${nome}: Aparência com logo, paleta fixa e sem troca fingida`, /#063996/.test(tx) && /#FF7800/.test(tx) && /#793A8C/.test(tx) && /indisponível/i.test(tx) && (await p.$$('input[type="color"]')).length === 0);
    await foto(p, `configuracoes-geral-aparencia-${nome}`);
    tx = await abre('geral', 'preferencias'); t(`${nome}: Preferências (perfil, aparelho e IA para legendas)`, /Meu perfil/.test(tx) && /Modo compacto/.test(tx) && /IA para legendas/.test(tx));
    tx = await abre('geral', 'segmentos'); t(`${nome}: Segmentos do catálogo e cores do calendário`, /Educação Infantil/.test(tx) && /Anos Iniciais/.test(tx) && /Ensino Médio/.test(tx) && /Cores do Calendário Geral/.test(tx));
    tx = await abre('usuarios'); t(`${nome}: Usuários lista as pessoas com perfil e situação`, /Nova ficha/.test(tx) && (await p.$$('[data-nivel]')).length >= 2);
    await foto(p, `configuracoes-usuarios-${nome}`);
    tx = await abre('usuarios', 'perfis'); t(`${nome}: Perfis com Administrador e Equipe de Marketing`, /Administrador/.test(tx) && /Equipe de Marketing/.test(tx) && /último Administrador/.test(tx));
    tx = await abre('usuarios', 'permissoes'); t(`${nome}: Permissões por perfil, conferidas no servidor`, /Permissões por perfil/.test(tx) && /agenda do Marketing/.test(tx) && /servidor/.test(tx));
    tx = await abre('integracoes');
    t(`${nome}: Integrações com exatamente três cartões`, (await p.$$eval('.cfg-int h2', e => e.map(x => x.textContent))).join('|') === 'Google Agenda|Meta (Instagram e Tráfego Pago)|Google Drive', tx.slice(0, 200));
    t(`${nome}: sem E-mail nem SMTP em Configurações`, !/SMTP|E-mail de avisos/i.test(tx) && (await p.$$('[data-cfg="email"]')).length === 0);
    t(`${nome}: estados reais (nada de "conectado" fingido) e Drive como não implementado`, /Não implementada/.test(tx) && (await p.$$eval('.cfg-int .badge', e => e.map(x => x.textContent))).every(x => ['Conectado', 'Desconectado', 'Reconectar', 'Pendente de configuração', 'Não implementada'].includes(x)));
    await foto(p, `configuracoes-integracoes-${nome}`);
    await p.click('[data-cfg-conf="google"]'); await p.waitForTimeout(1200); tx = await U.textoConteudo(p);
    t(`${nome}: Configurar abre o Google Agenda com trilha e as agendas`, /Google Agenda/.test(tx) && /Agendas Google|agendas/i.test(tx) && (await p.$$('[data-cfg-sec="integracoes"]')).length >= 1);
    await p.click('.cfg-voltar'); await p.waitForTimeout(700);
    await p.click('[data-cfg-conf="drive"]'); await p.waitForTimeout(600); tx = await U.textoConteudo(p); t(`${nome}: Drive explica que a conexão não existe`, /não tem conexão com contas do Google Drive/.test(tx));
    tx = await abre('seguranca'); t(`${nome}: Segurança › Autenticação mostra só o que existe (2FA indisponível)`, /Verificação em duas etapas/.test(tx) && /Indisponível/.test(tx) && /Limite de tentativas/.test(tx));
    await foto(p, `configuracoes-seguranca-${nome}`);
    tx = await abre('seguranca', 'backups'); t(`${nome}: Backups`, /Backup e restauração/.test(tx) && /Backup completo/.test(tx));
    tx = await abre('seguranca', 'logs'); t(`${nome}: Logs com filtros`, (await p.$$('#lgTipo')).length === 1 && (await p.$$('#lgCorpo tr')).length >= 1 && !/senha":|token":|secret/i.test(tx));
    await p.fill('#lgBusca', 'zzzzzz'); await p.waitForTimeout(300); t(`${nome}: filtro de logs sem resultado`, /Nenhum registro com estes filtros/.test(await p.innerText('#lgCorpo')));
    tx = await abre('dados'); t(`${nome}: Dados do Sistema › Informações reais`, /Versão do sistema/.test(tx) && /6\.0\.0/.test(tx) && /tabelas/.test(tx) && /Migrações aplicadas/.test(tx));
    await foto(p, `configuracoes-dados-${nome}`);
    tx = await abre('dados', 'diagnostico'); t(`${nome}: Diagnóstico com integridade e prontidão, sem SMTP`, /Integridade dos dados/.test(tx) && /Prontidão do sistema/.test(tx) && !/SMTP|e-mail de avisos/i.test(tx));
    tx = await abre('dados', 'manutencao'); t(`${nome}: Manutenção sem ações destrutivas automáticas`, /Verificar integridade/.test(tx) && /Limpar cache/.test(tx) && !/Reiniciar|Reparar|Apagar tudo|Modo de manutenção/i.test(tx));
    t(`${nome}: sem rolagem horizontal`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    t(`${nome}: sem erros de script nem diálogos nativos`, p.errs.length === 0, p.errs);
  }
  // ---- Equipe ----
  const pe = await U.pagina(b, 'ANT-3302', E.nova); await U.ir(pe, 'configuracoes', 900);
  t('Equipe vê só Geral e Dados do Sistema', (await pe.$$eval('.cfg-cartao h2', e => e.map(x => x.textContent))).join('|') === 'Geral|Dados do Sistema');
  await pe.click('[data-cfg-sec="dados"]'); await pe.waitForTimeout(900);
  const txe = await U.textoConteudo(pe); t('Equipe vê só o diagnóstico (prontidão), sem informações administrativas', /Prontidão do sistema/.test(txe) && !/Integridade dos dados/.test(txe) && (await pe.$$('[data-cfg-aba]')).length === 0);
  t('Equipe: sem erros de script', pe.errs.length === 0, pe.errs);
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
