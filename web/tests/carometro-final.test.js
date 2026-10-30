// Carômetro Escolar, etapa 8: backup/restauração, arquivos protegidos, desempenho, acessibilidade e zoom. Dados fictícios.
const fs = require('fs');
const sharp = require('sharp');
const U = require('./lib/ui');
const { t, fim } = U.contador();
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgb = s => (/rgba?\((\d+), (\d+), (\d+)/.exec(s) || []).slice(1, 4).map(Number);
(async () => {
  let G = await U.entrar(process.argv[2]);
  const raw = (H, u, o = {}) => fetch(U.B + u, { headers: { Cookie: H.H.Cookie, 'X-EVO': '1' }, ...o }).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})), x }));
  const jpg = (cor = '#2a6') => sharp({ create: { width: 600, height: 800, channels: 3, background: cor } }).jpeg().toBuffer();
  const lote = async (H, nomes) => { let id = 0; for (let i = 0; i < nomes.length; i += 8) { const fd = new FormData(); if (id) fd.append('lote_id', String(id)); for (const n of nomes.slice(i, i + 8)) fd.append('arquivo', new Blob([await jpg('#' + ((Math.abs(n.split('').reduce((s, c) => s * 31 + c.charCodeAt(0), 7)) % 0xffffff).toString(16).padStart(6, '0')))], { type: 'image/jpeg' }), n); id = (await raw(H, '/carometro/lote/fotos', { method: 'POST', body: fd })).j.loteId; } return id; };
  const hrs = async f => { const a = Date.now(); const r = await f(); return [Date.now() - a, r]; };

  // ---------- dados de base: 1.500 alunos ----------
  const turmas = ['Infantil 2 A', 'Infantil 4 B', '1º Ano A', '3º Ano A', '3º Ano B', '5º Ano A', '6º Ano A', '8º Ano B', '9º Ano A', '1ª Série A', '2ª Série B', '3ª Série A'];
  const linhas = Array.from({ length: 1500 }, (_, i) => ({ matricula: 'F-' + String(i + 1).padStart(4, '0'), nome: `Aluno Teste ${String(i + 1).padStart(4, '0')} Sobrenome`, turma: turmas[i % turmas.length], segmento: '' }));
  const ti = await hrs(() => G.post('/imagem/alunos/importar', { linhas }));
  t(`importa 1.500 alunos (${ti[0]} ms)`, ti[1].novos === 1500 && ti[0] < 30000, ti[1]);

  // ---------- desempenho ----------
  let [ms, r] = await hrs(() => G.get('/carometro/alunos'));
  t(`lista geral de 1.500 alunos em < 1,5 s (${ms} ms), limitada a 600 linhas`, ms < 1500 && r.total === 1500 && r.rows.length === 600 && r.indicadores.alunos === 1500, [ms, r.total]);
  [ms, r] = await hrs(() => G.get('/carometro/alunos?busca=' + encodeURIComponent('aluno teste 0777')));
  t(`busca por nome em < 500 ms (${ms} ms)`, ms < 500 && r.rows.length === 1);
  [ms, r] = await hrs(() => G.get('/carometro/alunos?serie=' + encodeURIComponent('3º Ano')));
  t(`filtro por série em < 800 ms (${ms} ms)`, ms < 800 && r.rows.length === 250 && r.rows.every(a => /^3º Ano/.test(a.turma)), r.rows.length);
  [ms, r] = await hrs(() => G.get('/carometro/turmas'));
  t(`árvore de turmas em < 1 s (${ms} ms)`, ms < 1000 && r.total === 1500);
  [ms, r] = await hrs(() => G.get('/carometro/pendencias'));
  t(`pendências de 1.500 alunos em < 2 s (${ms} ms)`, ms < 2000 && r.contagem.sem_foto === 1500, r.contagem);

  // fotos: 40 da turma 3º Ano A (envio em lote)
  const alvo = (await G.get('/carometro/alunos?turma=' + encodeURIComponent('3º Ano A'))).rows.slice(0, 40);
  const nomes = alvo.map(a => a.matricula + '.jpg');
  const [tl, L] = await hrs(() => lote(G, nomes));
  const dl = (await raw(G, '/carometro/lote?id=' + L)).j;
  t(`simulação de lote com 40 fotos (${tl} ms): todas prontas por matrícula`, dl.resumo.prontos === 40 && dl.pendencias === 0, dl.resumo);
  const ap = await G.post('/carometro/lote/aplicar', { lote_id: L });
  t('aplica as 40 fotos', ap.aplicadas === 40);
  const fid = (await G.get('/carometro/alunos?busca=' + alvo[0].matricula)).rows[0].fotoId;
  const mini = await fetch(U.B + `/carometro/foto?id=${fid}&tam=mini`, { headers: { Cookie: G.H.Cookie, 'X-EVO': '1' } });
  const mb = Buffer.from(await mini.arrayBuffer());
  t(`miniatura ≤ 30 KB (${(mb.length / 1024).toFixed(1)} KB)`, mb.length <= 30 * 1024 && mini.status === 200);
  const pdfT = await hrs(() => fetch(U.B + '/carometro/pdf?origem=turma&matricula=0&turma=' + encodeURIComponent('3º Ano A'), { headers: { Cookie: G.H.Cookie, 'X-EVO': '1' } }).then(async x => ({ s: x.status, n: (await x.arrayBuffer()).byteLength, a: x.headers.get('x-carometro-alunos') })));
  t(`PDF de turma com 125 alunos (40 com foto) em < 5 s (${pdfT[0]} ms)`, pdfT[1].s === 200 && pdfT[0] < 5000 && +pdfT[1].a === 125, pdfT);

  // ---------- dados dos outros módulos para o backup ----------
  const sel = await G.post('/carometro/selecao', { nome: 'Para backup', aluno_ids: alvo.slice(0, 3).map(a => a.id) });
  const ses = await G.post('/carometro/sessao', { nome: 'Sessão backup', data: '2026-11-03', turma: '3º Ano B' });
  await G.post('/carometro/drive', { nome: 'Pasta backup', pasta: 'BackupPastaId1234' });
  const pend = (await G.get('/carometro/pendencias?tipo=sem_foto')).rows.slice(0, 2).map(p => p.chave);
  await G.post('/carometro/pendencias/ignorar', { chaves: pend, motivo: 'Teste de backup' });
  const abertoLote = await lote(G, ['sem-dono-backup.jpg']);

  // ---------- backup completo e restauração ----------
  const bk = (await G.req('POST', '/backup', { completo: true }).then(x => x.json()));
  const v = await G.get('/backup/validate?file=' + bk.file);
  t('backup completo íntegro, com os anexos (fotos) dentro', v.ok === true && v.resumo.arquivos >= 40 * 3, v.resumo);
  await new Promise(r => setTimeout(r, 1200)); // o nome do arquivo tem precisão de segundos
  const bk2 = (await G.req('POST', '/backup', { completo: false }).then(x => x.json()));
  const v2 = await G.get('/backup/validate?file=' + bk2.file);
  t('backup sem anexos não leva as fotos', v2.ok === true && !(v2.resumo.arquivos > 0), v2.resumo);
  t('as tabelas do Carômetro estão no backup', ['cm_fotos', 'cm_selecoes', 'cm_sessoes', 'cm_drive_refs', 'cm_pendencias_ign', 'cm_lotes', 'cm_auditoria'].every(k => k in v.resumo), Object.keys(v.resumo).filter(k => /^cm_/.test(k)));
  // estraga: exclui uma versão (definitivo), a seleção, a sessão, a pasta e a decisão
  const antigo = (await G.get('/carometro/aluno?id=' + alvo[0].id)).fotos[0].id;
  await G.post('/carometro/foto/excluir', { id: antigo }); await G.post('/carometro/selecao/excluir', { id: sel.id }); await G.post('/carometro/sessao/excluir', { id: ses.id });
  await G.post('/carometro/drive/remover', { id: (await G.get('/carometro/drive')).rows[0].id }); await G.post('/carometro/pendencias/reabrir', { chaves: pend });
  t('antes de restaurar: foto sumiu', (await raw(G, `/carometro/foto?id=${antigo}&tam=padrao`)).status === 404);
  const rs = await G.req('POST', '/backup/restore', { file: bk.file });
  t('restaura o backup completo (200)', rs.status === 200);
  G = await U.entrar(process.argv[2], 'NAT-3301', 'Nat26ab');
  const fr = [(await raw(G, `/carometro/foto?id=${antigo}&tam=padrao`)).status, (await raw(G, `/carometro/foto?id=${antigo}&tam=original`)).status, (await raw(G, `/carometro/foto?id=${antigo}&tam=mini`)).status];
  t('a foto excluída voltou (original e derivadas)', fr.every(x => x === 200), fr);
  t('seleção, sessão, pasta do Drive e decisões de pendência voltaram', (await G.get('/carometro/selecoes')).rows.some(x => x.nome === 'Para backup') && (await G.get('/carometro/sessoes')).rows.some(x => x.nome === 'Sessão backup') && (await G.get('/carometro/drive')).rows.some(x => x.nome === 'Pasta backup') && (await G.get('/carometro/pendencias?estado=ignoradas')).rows.length === 2);
  t('o lote em simulação também voltou, com a prévia', (await raw(G, '/carometro/lotes')).j.rows.some(x => x.id === abertoLote && x.estado === 'simulado'));

  // ---------- arquivos protegidos ----------
  const sv = await G.get('/admin/arquivos-sem-vinculo');
  t('fotos do Carômetro não aparecem como "arquivos sem vínculo"', !sv.rows.some(x => /^(CAROMETRO|USO-IMAGEM)\//.test(x.caminho)), sv.total);
  const x = await G.req('POST', '/admin/arquivos-sem-vinculo/excluir', { confirmar: true, caminhos: ['CAROMETRO/1/v1_x_padrao.jpg'] });
  t('e não podem ser apagadas por essa tela (400)', x.status === 400);
  t('/file não serve caminhos do Carômetro', (await fetch(U.B + '/file?path=' + encodeURIComponent('CAROMETRO/1/v1_x_padrao.jpg'), { headers: G.H })).status === 400);

  // ---------- acessibilidade e zoom ----------
  const dir = process.env.CAPTURAS; if (dir) fs.mkdirSync(dir, { recursive: true });
  const paginas = ['cmvisao', 'cmturmas', 'cmselecoes', 'cmsessoes', 'cmpdf', 'cmpendencias', 'cmdrive', 'cmimport'];
  const b = await U.abrir();
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['zoom200', { width: 640, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const p = await U.pagina(b, 'NAT-3301', 'Nat26ab', vp);
    for (const pg of paginas) {
      await U.ir(p, pg, 900);
      if (pg === 'cmsessoes') { const c = await p.$('[data-sess]'); if (c) await c.click().catch(() => {}); await p.waitForTimeout(300); }
      const sem = await p.evaluate(() => {
        const vis = e => !!(e.offsetWidth || e.offsetHeight) && getComputedStyle(e).visibility !== 'hidden';
        const nome = e => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.labels && e.labels[0] && e.labels[0].innerText) || e.closest('label')?.innerText || e.title || '').trim();
        return {
          img: [...document.querySelectorAll('#content img')].filter(i => !i.alt.trim()).length,
          campos: [...document.querySelectorAll('#content input:not([type=hidden]), #content select, #content textarea')].filter(e => vis(e) && !nome(e)).map(e => e.id || e.outerHTML.slice(0, 80)),
          botoes: [...document.querySelectorAll('#content button')].filter(e => vis(e) && !(e.innerText.trim() || e.getAttribute('aria-label'))).length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          h: document.querySelectorAll('h1,h2').length,
        };
      });
      t(`${nome} · ${pg}: imagens com alt, campos e botões com nome, sem rolagem lateral`, sem.img === 0 && sem.campos.length === 0 && sem.botoes === 0 && sem.overflow <= 2, sem);
      if (dir && nome === 'desktop') await p.screenshot({ path: `${dir}/final-${pg}.png`, fullPage: true });
    }
    t(`${nome}: sem erros de script nas 8 telas`, p.errs.length === 0, p.errs);
    if (nome === 'desktop') {
      await U.ir(p, 'cmvisao', 900); await p.waitForSelector('.cm-al');
      const ctr = await p.evaluate(() => { for (const c of ['ok', 'bad', 'mute', 'warn']) { const e = document.createElement('span'); e.className = 'cm-selo ' + c; e.textContent = 'x'; document.querySelector('#content').appendChild(e); } return [...document.querySelectorAll('#content .cm-selo')].reduce((m, e) => { const k = e.className; if (m[k]) return m; const c = getComputedStyle(e); m[k] = [c.color, c.backgroundColor]; return m; }, {}); });
      const piores = Object.entries(ctr).map(([k, [c, bg]]) => [k, contraste(rgb(c), rgb(bg))]).filter(([, r]) => r < 4.5);
      t('contraste AA (≥ 4,5) nos selos de autorização e alerta', Object.keys(ctr).length >= 4 && piores.length === 0, [ctr, piores]);
      await p.focus('.cm-ck input'); await p.keyboard.press('Tab');
      const foco = await p.evaluate(() => { const e = document.activeElement, c = getComputedStyle(e); return { cls: e.className, saida: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2 || c.boxShadow !== 'none' }; });
      t('teclado: Tab vai da caixa de seleção ao botão do aluno, com foco visível', /cm-abre/.test(foco.cls) && foco.saida, foco);
      await p.keyboard.press('Enter'); await p.waitForSelector('.cm-ficha');
      t('Enter abre a ficha (diálogo com papel e modal)', await p.$eval('.admin-box', e => e.getAttribute('role') === 'dialog' && e.getAttribute('aria-modal') === 'true'));
      await p.keyboard.press('Escape').catch(() => {});
    }
  }
  await b.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
