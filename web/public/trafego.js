/* Tráfego Pago: SOMENTE CONSULTA à Meta Ads. Aqui não se cria, edita, ativa nem pausa nada: isso continua no Gerenciador de Anúncios da Meta.
   Leads, matrículas e funil comercial não aparecem aqui: pertencem ao EVO CRM. */
const TF_STATUS = [['todos', 'Todos os status'], ['ativos', 'Ativos'], ['pausados', 'Pausados'], ['analise', 'Em análise'], ['problemas', 'Com problemas ou reprovados'], ['arquivados', 'Arquivados ou excluídos'], ['desconhecidos', 'Status indisponível']];
const tfNivel = () => state.page === 'tfcampanhas' ? 'campanhas' : state.page === 'tfanuncios' ? 'anuncios' : '';
const tfStatus = () => { const v = pref('tfStatus.' + tfNivel(), 'todos'); return TF_STATUS.some(x => x[0] === v) ? v : 'todos'; };
const tfParametrosStatus = () => tfNivel() ? `&nivel=${tfNivel()}&status=${tfStatus()}` : '';
const TF_CACHE = { chave: '', dados: null, estado: null };
const TF_INDICADORES = [['investimento', 'Investimento', money, true], ['impressoes', 'Impressões', fmtN, true], ['alcance', 'Alcance', fmtN, true], ['cliques', 'Cliques', fmtN, true], ['ctr', 'CTR médio', pct, true], ['cpc', 'CPC médio', money, false], ['conversas', 'Conversas iniciadas', fmtN, true], ['custoConversa', 'Custo por conversa', money, false]];

async function tfEstado() {
  const e = await api('/trafego/estado').catch(() => null);
  TF_CACHE.estado = e; return e;
}
/** Mensagem quando não dá para mostrar números: sem dados simulados em produção. */
function tfVazio(e, motivoErro) {
  let titulo = 'Tráfego Pago indisponível', texto = motivoErro || 'Não foi possível ler os anúncios agora.';
  if (e && !e.conectado) { titulo = 'Meta não conectada'; texto = 'Conecte a Meta em Configurações › Instagram para ler os anúncios.'; }
  else if (e && e.tokenInvalido) { titulo = 'Acesso à Meta expirado'; texto = 'O acesso à Meta expirou ou foi revogado. Reconecte em Configurações › Instagram.'; }
  else if (e && !e.contaEscolhida) { titulo = 'Conta de anúncios não escolhida'; texto = 'Escolha a conta de anúncios em Configurações › Meta Ads.'; }
  return `<div class="empty-rich"><strong>${esc(titulo)}</strong><p>${esc(texto)}</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>`;
}
async function tfCarregar(forcar = false) {
  const f0 = Filtros.get(), hoje = hojeBR(), f = { ...f0, ate: f0.ate > hoje ? hoje : f0.ate };
  if (f0.de > hoje) throw new Error('O período escolhido ainda não começou: a Meta só informa dias que já passaram. Escolha um período até hoje.');
  const chave = `${f.de}|${f.ate}|${f.p}|${tfNivel()}|${tfStatus()}`;
  if (!forcar && TF_CACHE.chave === chave && TF_CACHE.dados && Date.now() - (TF_CACHE.em || 0) < 60000) return TF_CACHE.dados;
  const d = await api(`/trafego/resumo?de=${f.de}&ate=${f.ate}&tipo=${encodeURIComponent(f.p)}${tfParametrosStatus()}${forcar ? '&forcar=1' : ''}`);
  TF_CACHE.chave = chave; TF_CACHE.dados = d; TF_CACHE.em = Date.now(); return d;
}
function tfCabecalho(d, extra = '') {
  const o = d.origem;
  return `<div class="tf-topo"><p class="kpi-note">Somente consulta · ${esc(fmtDate(d.periodo.de))} a ${esc(fmtDate(d.periodo.ate))} (${d.periodo.dias} dia(s)) · comparado a ${esc(fmtDate(d.anterior.de))} – ${esc(fmtDate(d.anterior.ate))} ${origem(o)}</p><div class="tf-acoes">${extra}<button type="button" class="btn soft" id="tfAtualiza">Atualizar agora</button><a class="btn soft" target="_blank" rel="noopener" href="/relatorio-trafego.html?de=${d.periodo.de}&ate=${d.periodo.ate}">${tfNivel() ? 'Relatório geral em PDF' : 'Relatório em PDF (A4)'}</a></div></div>${tfNivel() ? tfFiltrosTabela(d) : ''}${avisoAtualizacao(o)}${(d.avisos || []).map(a => `<p class="foco-chip" role="note">${esc(a)}</p>`).join('')}`;
}
function tfFiltrosTabela(d) {
  return `<div class="ig-barra"><label>Período <button type="button" class="btn soft" id="tfPeriodo">${esc(fmtDate(d.periodo.de))} a ${esc(fmtDate(d.periodo.ate))}</button></label><label>Status atual <select class="control" id="tfStatus" aria-label="Filtrar por status atual">${TF_STATUS.map(([v, l]) => `<option value="${v}" ${tfStatus() === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><small class="kpi-note">Status atual na Meta · valores do período escolhido</small></div>`;
}
async function tfPagina(corpo) {
  let d;
  try { d = await tfCarregar(); } catch (e) {
    const est = await tfEstado();
    $('#content').innerHTML = tfVazio(est, e.message); bindGoButtons(); return;
  }
  $('#content').innerHTML = corpo(d); bindGoButtons();
  $$('[data-tffoto]').forEach(b => {
    const img = b.querySelector('img');
    const falhou = () => { b.textContent = 'Sem imagem'; b.disabled = true; b.setAttribute('aria-label', 'Imagem indisponível'); };
    img.onerror = falhou; if (img.complete && !img.naturalWidth) falhou();
    b.onclick = () => {
      const dlg = dialogo(`<h3>Imagem do anúncio</h3><img class="tf-foto-ampliada" src="${attr(b.dataset.tffoto)}" alt="${attr(img.alt)}" referrerpolicy="no-referrer"><div class="actions"><button class="btn" data-close>Fechar</button></div>`, { larga: true });
      const foto = dlg.el.querySelector('img'); foto.onerror = () => { foto.replaceWith(Object.assign(document.createElement('p'), { textContent: 'A Meta não disponibilizou esta imagem agora. Atualize os dados e tente novamente.' })); };
    };
  });
  const status = $('#tfStatus'); if (status) status.onchange = () => { setPref('tfStatus.' + tfNivel(), status.value); go(state.page); };
  const periodo = $('#tfPeriodo'); if (periodo) periodo.onclick = () => PeriodoPicker.abrir({ de: d.periodo.de, ate: d.periodo.ate, titulo: 'Período de veiculação', max: hojeBR() }, (de, ate) => Filtros.set({ p: 'x', de, ate }));
  const b = $('#tfAtualiza'); if (b) b.onclick = async () => { b.disabled = true; try { await tfCarregar(true); toast('Dados atualizados'); go(state.page); } catch (e) { toast(e.message, 'warn'); b.disabled = false; } };
  return d;
}

PAGINAS.trafego = async function () {
  const d = await tfPagina(d => {
    const a = d.atual, v = d.variacoes, ds = d.destaques;
    const kpis = TF_INDICADORES.map(([k, rot, fmt, bom]) => `<div class="kpi"><small>${rot}</small><strong>${a[k] === null || a[k] === undefined ? '—' : fmt(a[k])}</strong>${delta(v[k], { bomSubir: bom })}</div>`).join('');
    const dest = (rot, c, texto) => `<div class="tf-dest"><small>${rot}</small>${c ? `<b>${esc(c.nome)}</b><span>${texto(c)}</span>` : '<span class="kpi-note">Sem dados suficientes</span>'}</div>`;
    return `${tfCabecalho(d)}<div class="kpis kpis4">${kpis}</div>
      <section class="card"><div class="db-tit"><h2>Investimento diário por campanha</h2>${origem(d.origem)}</div><div id="tfDiario"></div><details class="tf-tabela"><summary>Ver como tabela</summary><div id="tfDiarioTabela"></div></details></section>
      <div class="tf-destaques">${dest('Mais investiu', ds.maisGastou, c => `${money(c.investimento)} no período`)}${dest('Melhor custo por conversa', ds.melhorCampanha, c => `${money(c.custoConversa)} · ${fmtN(c.conversas)} conversas`)}${dest('Pior custo por conversa', ds.piorCampanha, c => `${money(c.custoConversa)} · ${fmtN(c.conversas)} conversas`)}</div>
      <p class="kpi-note">Alcance do total não soma o alcance das campanhas (pessoas se repetem). CTR, CPC e custo por conversa são recalculados dos valores absolutos. Conversas iniciadas contam uma vez por conversa (sem repetir variações da mesma ação). Nada aqui vem do EVO CRM: leads, matrículas e funil ficam lá.</p>`;
  });
  if (!d) return;
  const diario = d.diario, cores = ['#063996', '#00A1F3', '#FF7800', '#793A8C'];
  const series = diario.series.map((s, i) => ({ k: 'camp' + i, nome: s.codigo || s.nome, cor: cores[i % cores.length], fmt: money, marcadores: true }));
  series.push({ k: 'total', nome: 'Total', cor: '#00275F', fmt: money, tracejado: true, marcadores: true });
  const dados = diario.dias.map((x, i) => Object.fromEntries([['x', x], ['total', diario.total[i]], ...diario.series.map((s, n) => ['camp' + n, s.valores[i]])]));
  EvoCharts.linha($('#tfDiario'), { dados, series, sombreado: false, altura: 280, rotuloAcessivel: 'Investimento diário por campanha, com total tracejado' });
  $('#tfDiarioTabela').innerHTML = `<div class="tablewrap"><table class="datatable"><thead><tr><th>Dia</th>${series.map(s => `<th>${esc(s.nome)}</th>`).join('')}</tr></thead><tbody>${dados.map(r => `<tr><td>${esc(fmtDate(r.x))}</td>${series.map(s => `<td>${money(r[s.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
};

const tfTabela = (cab, linhas, total) => `<div class="tablewrap"><table class="datatable tf-tab"><thead><tr>${cab.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody><tfoot>${total}</tfoot></table></div>`;
PAGINAS.tfcampanhas = async function () {
  await tfPagina(d => {
    const cab = [{ t: 'Campanha' }, { t: 'Status' }, { t: 'Investimento', num: 1 }, { t: 'Impressões', num: 1 }, { t: 'Alcance', num: 1 }, { t: 'Cliques', num: 1 }, { t: 'CTR', num: 1 }, { t: 'CPC', num: 1 }, { t: 'Conversas', num: 1 }, { t: 'Custo/conversa', num: 1 }];
    const l = c => `<tr><td class="titlecell"><b>${esc(c.nome)}</b>${c.segmento ? `<br><small>${esc(c.segmento)}</small>` : ''}</td><td><span class="badge">${esc(c.statusRotulo || '—')}</span></td><td class="num">${money(c.investimento)}</td><td class="num">${fmtN(c.impressoes)}</td><td class="num">${c.alcance === null ? '—' : fmtN(c.alcance)}</td><td class="num">${fmtN(c.cliques)}</td><td class="num">${c.ctr === null ? '—' : pct(c.ctr)}</td><td class="num">${c.cpc === null ? '—' : money(c.cpc)}</td><td class="num">${fmtN(c.conversas)}</td><td class="num">${c.custoConversa === null ? '—' : money(c.custoConversa)}</td></tr>`;
    const t = d.tabela?.total || d.atual;
    const total = `<tr><th colspan="2">Total (${d.campanhas.length} campanhas)</th><th class="num">${money(t.investimento)}</th><th class="num">${fmtN(t.impressoes)}</th><th class="num">${t.alcance === null ? '—' : fmtN(t.alcance)}</th><th class="num">${fmtN(t.cliques)}</th><th class="num">${t.ctr === null ? '—' : pct(t.ctr)}</th><th class="num">${t.cpc === null ? '—' : money(t.cpc)}</th><th class="num">${fmtN(t.conversas)}</th><th class="num">${t.custoConversa === null ? '—' : money(t.custoConversa)}</th></tr>`;
    return `${tfCabecalho(d, `<a class="btn soft" href="/api/trafego/csv?de=${d.periodo.de}&ate=${d.periodo.ate}${tfParametrosStatus()}">Baixar CSV</a>`)}<section class="card"><div class="db-tit"><h2>Resumo por campanha</h2>${origem(d.origem)}</div>${d.campanhas.length ? tfTabela(cab, d.campanhas.map(l).join(''), total) : '<div class="empty compact">Nenhuma campanha com veiculação neste período e status.</div>'}</section>`;
  });
};
PAGINAS.tfanuncios = async function () {
  await tfPagina(d => {
    const cab = [{ t: 'Foto' }, { t: 'Anúncio' }, { t: 'Status' }, { t: 'Investimento', num: 1 }, { t: 'Impressões', num: 1 }, { t: 'Alcance', num: 1 }, { t: 'Cliques', num: 1 }, { t: 'CTR', num: 1 }, { t: 'CPC', num: 1 }, { t: 'Conversas', num: 1 }, { t: 'Custo/conversa', num: 1 }];
    const l = a => `<tr><td class="tf-fotocel">${a.miniatura ? `<button class="tf-foto" type="button" data-tffoto="${attr(a.imagem || a.miniatura)}" aria-label="Ampliar foto de ${attr(a.nome)}"><img src="${attr(a.miniatura)}" alt="Criativo: ${attr(a.nome)}" loading="lazy" referrerpolicy="no-referrer" width="64" height="80"></button>` : '<span class="tf-sem">Sem imagem</span>'}</td><td class="titlecell"><b>${esc(a.nome)}</b><br><small>${esc(a.campanha)} · ID ${esc(a.id)}</small></td><td><span class="badge ${/ACTIVE/.test(a.status) ? 'ok' : /PAUSED|ARCHIVED|DELETED/.test(a.status) ? 'mute' : 'warn'}">${esc(a.statusRotulo)}</span></td><td class="num">${money(a.investimento)}</td><td class="num">${fmtN(a.impressoes)}</td><td class="num">${a.alcance === null ? '—' : fmtN(a.alcance)}</td><td class="num">${fmtN(a.cliques)}</td><td class="num">${a.ctr === null ? '—' : pct(a.ctr)}</td><td class="num">${a.cpc === null ? '—' : money(a.cpc)}</td><td class="num">${fmtN(a.conversas)}</td><td class="num">${a.custoConversa === null ? '—' : money(a.custoConversa)}</td></tr>`;
    const t = d.tabela?.total || d.atual;
    const total = `<tr><th colspan="3">Total (${d.anuncios.length} anúncios)</th><th class="num">${money(t.investimento)}</th><th class="num">${fmtN(t.impressoes)}</th><th class="num">${t.alcance === null ? '—' : fmtN(t.alcance)}</th><th class="num">${fmtN(t.cliques)}</th><th class="num">${t.ctr === null ? '—' : pct(t.ctr)}</th><th class="num">${t.cpc === null ? '—' : money(t.cpc)}</th><th class="num">${fmtN(t.conversas)}</th><th class="num">${t.custoConversa === null ? '—' : money(t.custoConversa)}</th></tr>`;
    return `${tfCabecalho(d, `<a class="btn soft" href="/api/trafego/csv?de=${d.periodo.de}&ate=${d.periodo.ate}${tfParametrosStatus()}">Baixar CSV</a>`)}<section class="card"><div class="db-tit"><h2>Detalhamento por anúncio</h2>${origem(d.origem)}</div>${d.anuncios.length ? tfTabela(cab, d.anuncios.map(l).join(''), total) : '<div class="empty compact">Nenhum anúncio com veiculação neste período e status.</div>'}</section>`;
  });
};
