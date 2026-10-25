// Configurações em cinco áreas: hub, abas, Integrações com três cartões (sem E-mail/SMTP), permissões no servidor, dados reais do sistema.
// Uso: CAPTURAS=pasta node configuracoes.test.js <install.out>
const fs = require('fs');
const zlib = require('zlib');
/** PNG sólido w×h (RGB) gerado na hora, só com cabeçalhos válidos, para exercitar as regras da logo. */
const crc = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
const png = (w, h, [r, g, b]) => { const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); }; const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; } const raw = Buffer.concat(Array.from({ length: h }, () => row)); return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]); };
const url = b => 'data:image/png;base64,' + b.toString('base64');
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
  // ---- logo institucional ----
  const lg0 = await G.get('/admin/logo'); t('começa com a logo original e traz as regras de validação', lg0.personalizada === false && lg0.regras.maxBytes === 1000000, lg0);
  const orig = await fetch(U.BASE + '/api/public/logo', { redirect: 'manual' }); t('a logo é pública (aparece na tela de entrada) e, sem envio, aponta para a original', orig.status === 302 && /logo-colegio\.png/.test(orig.headers.get('location')));
  const bom = png(1000, 210, [6, 57, 150]);
  const envia = (dados, extra = {}) => G.post('/admin/logo', { dados, confirmar: true, ...extra });
  t('Equipe não troca a logo (403)', (await E.post('/admin/logo', { dados: url(bom), confirmar: true })).http === 403 && (await E.req('GET', '/admin/logo')).status === 403);
  t('sem confirmação: 400', (await G.post('/admin/logo', { dados: url(bom) })).http === 400);
  t('formato inválido (GIF/texto): 400', (await envia('data:image/gif;base64,R0lGODlhAQABAAAAACw=')).http === 400 && (await envia('qualquer coisa')).http === 400);
  t('conteúdo que não é imagem com tipo PNG: 400', (await envia('data:image/png;base64,' + Buffer.from('<?php echo 1; ?>').toString('base64'))).http === 400);
  t('dimensões pequenas demais: 400 com a medida na mensagem', /100×20/.test((await envia(url(png(100, 20, [0, 0, 0])))).error || ''));
  t('proporção não horizontal (quadrada): 400', /horizontal/.test((await envia(url(png(800, 800, [0, 0, 0])))).error || ''));
  t('tamanho acima de 1 MB: 400', (await envia('data:image/png;base64,' + Buffer.concat([png(1000, 210, [1, 2, 3]), Buffer.alloc(1_100_000, 7)]).toString('base64'))).http === 400);
  t('JPEG declarado como PNG é recusado', (await envia('data:image/png;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 210, 3, 232, 3, 1, 34, 0, 2, 17, 1, 3, 17, 1, 0xff, 0xd9]).toString('base64'))).http === 400);
  const ok1 = await envia(url(bom)); t('logo válida é aceita e registrada', ok1.http === 200 && ok1.largura === 1000 && ok1.altura === 210, ok1);
  const nova = await fetch(U.BASE + '/api/public/logo'); const bufNova = Buffer.from(await nova.arrayBuffer());
  t('a logo enviada passa a ser servida (PNG, nosniff)', nova.status === 200 && nova.headers.get('content-type') === 'image/png' && nova.headers.get('x-content-type-options') === 'nosniff' && bufNova.equals(bom));
  const seg = png(1200, 250, [255, 120, 0]); await envia(url(seg));
  const lg1 = await G.get('/admin/logo'); t('a logo anterior fica guardada para voltar', lg1.personalizada && lg1.temAnterior && lg1.largura === 1200, lg1);
  t('a logo não aparece como arquivo sem vínculo e não pode ser excluída por lá', !JSON.stringify(await G.get('/admin/arquivos-sem-vinculo')).includes('CONFIG/') && (await G.post('/admin/arquivos-sem-vinculo/excluir', { caminhos: ['CONFIG/logo-colegio'], confirmar: true })).http === 400);
  t('o log registra quem trocou a logo', (await G.get('/admin/audit?limit=50')).some(l => l.acao === 'logo-trocada'));
  t('restaurar exige confirmação', (await G.post('/admin/logo/restaurar', {})).http === 400);
  t('voltar à original funciona e a rota volta a apontar para o arquivo original', (await G.post('/admin/logo/restaurar', { confirmar: true })).http === 200 && (await fetch(U.BASE + '/api/public/logo', { redirect: 'manual' })).status === 302 && (await G.post('/admin/logo/restaurar', { confirmar: true })).http === 409);
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
    tx = await abre('geral', 'aparencia'); t(`${nome}: Aparência com logo, paleta fixa e troca de logo`, /#063996/.test(tx) && /#FF7800/.test(tx) && /#793A8C/.test(tx) && /Escolher nova logo/.test(tx) && (await p.$$('input[type="color"]')).length === 0);
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
  // ---- troca da logo pela tela ----
  const pl = await U.pagina(b, 'NAT-3301', G.nova, { width: 1440, height: 900 }); await U.ir(pl, 'configuracoes', 700); await pl.click('[data-cfg-sec="geral"]'); await pl.click('[data-cfg-aba="aparencia"]'); await pl.waitForSelector('#logoArq', { state: 'attached' });
  const tmp = require('os').tmpdir() + '/logo-teste.png', tmpRuim = require('os').tmpdir() + '/logo-ruim.png';
  fs.writeFileSync(tmp, png(1000, 240, [0, 39, 95])); fs.writeFileSync(tmpRuim, png(900, 900, [0, 0, 0]));
  await pl.setInputFiles('#logoArq', tmpRuim); await pl.waitForSelector('#logoPrevia .foco-chip');
  t('tela: logo quadrada é recusada antes de enviar, com o motivo', /horizontal/.test(await pl.innerText('#logoPrevia')) && (await pl.$$('#logoUsar')).length === 0);
  await pl.setInputFiles('#logoArq', tmp); await pl.waitForSelector('#logoUsar');
  t('tela: mostra a prévia da nova logo antes de substituir', /Nova logo \(1000×240 px/.test(await pl.innerText('#logoPrevia')));
  if (dir) { await foto(pl, 'configuracoes-logo-previa-desktop'); }
  await pl.click('#logoUsar'); await pl.waitForSelector('.admin-box [data-ok], .admin-box .btn:not(.soft)', { timeout: 5000 }).catch(() => {});
  t('tela: troca só acontece depois da confirmação (diálogo central)', /Substituir a logo/.test(await pl.innerText('body')));
  await pl.click('.admin-box .btn:not(.soft)'); await pl.waitForTimeout(1500);
  const txl = await U.textoConteudo(pl); t('tela: depois de confirmar aparece “Logo enviada” e o botão de voltar à original', /Logo enviada/.test(txl) && (await pl.$$('#logoOrig')).length === 1, txl.slice(0, 200));
  t('tela: a nova logo é a servida pelo sistema', Buffer.from(await (await fetch(U.BASE + '/api/public/logo')).arrayBuffer()).equals(fs.readFileSync(tmp)));
  if (dir) { await foto(pl, 'configuracoes-logo-enviada-desktop'); }
  await pl.click('#logoOrig'); await pl.waitForTimeout(500); await pl.click('.admin-box .btn:not(.soft)'); await pl.waitForTimeout(1200);
  t('tela: voltar à original com confirmação', /Logo original/.test(await U.textoConteudo(pl)) && (await fetch(U.BASE + '/api/public/logo', { redirect: 'manual' })).status === 302);
  t('tela da logo: sem erros de script', pl.errs.length === 0, pl.errs);
  // ---- Equipe ----
  const pe = await U.pagina(b, 'ANT-3302', E.nova); await U.ir(pe, 'configuracoes', 900);
  t('Equipe vê só Geral e Dados do Sistema', (await pe.$$eval('.cfg-cartao h2', e => e.map(x => x.textContent))).join('|') === 'Geral|Dados do Sistema');
  await pe.click('[data-cfg-sec="dados"]'); await pe.waitForTimeout(900);
  const txe = await U.textoConteudo(pe); t('Equipe vê só o diagnóstico (prontidão), sem informações administrativas', /Prontidão do sistema/.test(txe) && !/Integridade dos dados/.test(txe) && (await pe.$$('[data-cfg-aba]')).length === 0);
  t('Equipe: sem erros de script', pe.errs.length === 0, pe.errs);
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
