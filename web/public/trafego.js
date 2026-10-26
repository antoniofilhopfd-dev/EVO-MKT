/* Tráfego Pago: SOMENTE CONSULTA à Meta Ads. Aqui não se cria, edita, ativa, pausa nem duplica nada: isso continua no Gerenciador de Anúncios da Meta.
   Três abas: Visão Geral (este arquivo), Desempenho (tfdesempenho.js) e Relatórios (tfrelatorios.js). Campanha, conjunto e anúncio são níveis DENTRO do Desempenho.
   Leads, matrículas e funil comercial não aparecem aqui: pertencem ao EVO CRM. Métricas do Instagram orgânico também não se misturam com as dos anúncios. */
const TF_CACHE = { chave: '', dados: null, estado: null, em: 0 };
const tfPct = v => v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
const tfN = v => v === null || v === undefined ? '—' : fmtN(v);
const tfMoney = v => v === null || v === undefined ? '—' : money(v);
const TF_INDICADORES = [['investimento', 'Investimento', money, true], ['impressoes', 'Impressões', fmtN, true], ['alcance', 'Alcance', fmtN, true], ['cliques', 'Cliques', fmtN, true], ['ctr', 'CTR médio', tfPct, true], ['cpc', 'CPC médio', money, false], ['conversas', 'Conversas iniciadas', fmtN, true], ['custoConversa', 'Custo por conversa', money, false]];
const TF_ICONES = { investimento: '＄', impressoes: '◉', alcance: '☺', cliques: '⌖', ctr: '%', cpc: '⚙', conversas: '✉', custoConversa: '◎' };

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
/** Dados do período escolhido no filtro da aba (uma consulta só; status, segmento e campanha filtram na tela, sem nova consulta). */
async function tfCarregar(forcar = false) {
  const f0 = Filtros.get(), hoje = hojeBR(), f = { ...f0, ate: f0.ate > hoje ? hoje : f0.ate };
  if (f0.de > hoje) throw new Error('O período escolhido ainda não começou: a Meta só informa dias que já passaram. Escolha um período até hoje.');
  const chave = `${f.de}|${f.ate}|${f.p}`;
  if (!forcar && TF_CACHE.chave === chave && TF_CACHE.dados && Date.now() - TF_CACHE.em < 60000) return TF_CACHE.dados;
  const d = await api(`/trafego/resumo?de=${f.de}&ate=${f.ate}&tipo=${encodeURIComponent(f.p)}${forcar ? '&forcar=1' : ''}`);
  TF_CACHE.chave = chave; TF_CACHE.dados = d; TF_CACHE.em = Date.now(); return d;
}
const tfSemanaTxt = iso => { const s = tfSemanaEpi(iso); return `Semana ${s.semana}`; };
/** Faixa do período: nome do filtro, datas com dia da semana, número da semana quando é semana e período de comparação. */
function tfFaixaPeriodo(d) {
  const f = Filtros.get(), p = d.periodo, a = d.anterior;
  const nome = f.p === 'x' ? 'Período personalizado' : (typeof PERIODOS !== 'undefined' ? (PERIODOS.find(x => x[0] === f.p) || [, 'Período'])[1] : 'Período');
  const ehSemana = f.p === 'semana' || f.p === 'semana_ant';
  const ini = tfInicioSemana(p.de), fimSem = tfSomaDias(ini, 6);
  const faixa = ehSemana ? `${tfDiaLongo(ini)} – ${tfDiaLongo(fimSem)}${fimSem > p.ate ? ` (dados até ${tfDM(p.ate)}, a Meta só informa dias que já passaram)` : ''}` : `${tfDiaLongo(p.de)} – ${tfDiaLongo(p.ate)}`;
  const semana = ehSemana ? ` · ${tfSemanaTxt(p.de)}` : '';
  return { nome, faixa, semana, comparacao: `${fmtDate(a.de)} a ${fmtDate(a.ate)}` };
}
function tfCabecalho(d, estado) {
  const x = tfFaixaPeriodo(d), o = d.origem;
  const conectado = estado ? estado.conectado && !estado.tokenInvalido : true;
  return `<div class="tf-topo2"><div class="tf-topo2-per"><small>${esc(x.nome)}${esc(x.semana)}</small><b>${esc(x.faixa)}</b><span>Comparado a ${esc(x.comparacao)} <small>(${d.periodo.dias} dia(s) no período)</small></span></div>
    <div class="tf-topo2-meta"><span class="tf-conexao ${conectado ? 'on' : ''}"><i></i>Meta Ads · ${conectado ? 'Conectado' : 'Desconectado'}</span><span class="kpi-note">Somente consulta · lido da Meta em ${esc(fmtDateTime(o.atualizadoEm))} ${origem(o)}</span><button type="button" class="btn soft" id="tfAtualiza">Atualizar agora</button></div></div>${avisoAtualizacao(o)}${(d.avisos || []).map(a => `<p class="foco-chip" role="note">${esc(a)}</p>`).join('')}`;
}
/** Carrega, desenha o corpo e liga o que é comum às três abas (atualizar, foto ampliada). */
async function tfPagina(corpo) {
  let d, estado;
  try { [d, estado] = await Promise.all([tfCarregar(), TF_CACHE.estado ? Promise.resolve(TF_CACHE.estado) : tfEstado()]); } catch (e) {
    const est = await tfEstado();
    $('#content').innerHTML = tfVazio(est, e.message); bindGoButtons(); return null;
  }
  $('#content').innerHTML = tfCabecalho(d, estado) + corpo(d); bindGoButtons(); tfLigarComum();
  return d;
}
function tfLigarComum() {
  const b = $('#tfAtualiza'); if (b) b.onclick = async () => { b.disabled = true; try { await tfCarregar(true); toast('Dados atualizados'); go(state.page); } catch (e) { toast(e.message, 'warn'); b.disabled = false; } };
  tfLigarFotos(document);
}
function tfLigarFotos(raiz) {
  raiz.querySelectorAll('[data-tffoto]').forEach(b => {
    const img = b.querySelector('img');
    const falhou = () => { b.textContent = 'Sem imagem'; b.disabled = true; b.setAttribute('aria-label', 'Imagem indisponível'); };
    if (img) { img.onerror = falhou; if (img.complete && !img.naturalWidth) falhou(); }
    b.onclick = () => {
      const dlg = dialogo(`<h3>Imagem do anúncio</h3><img class="tf-foto-ampliada" src="${attr(b.dataset.tffoto)}" alt="${attr(img ? img.alt : '')}" referrerpolicy="no-referrer"><div class="actions"><button class="btn" data-close>Fechar</button></div>`, { larga: true });
      const foto = dlg.el.querySelector('img'); foto.onerror = () => { foto.replaceWith(Object.assign(document.createElement('p'), { textContent: 'A Meta não disponibilizou esta imagem agora. Atualize os dados e tente novamente.' })); };
    };
  });
}
/** Foto real do criativo (nunca de outro anúncio); sem URL acessível, mostra o texto "Sem imagem". */
const tfFotoAnuncio = a => a.miniatura ? `<button class="tf-foto" type="button" data-tffoto="${attr(a.imagem || a.miniatura)}" aria-label="Ampliar foto de ${attr(a.nome)}"><img src="${attr(a.miniatura)}" alt="Criativo: ${attr(a.nome)}" loading="lazy" referrerpolicy="no-referrer"></button>` : '<span class="tf-sem">Sem imagem</span>';
const tfBadge = a => `<span class="badge ${a.status === 'ACTIVE' ? 'ok' : /PAUSED|ARCHIVED|DELETED/.test(a.status) ? 'mute' : 'warn'}">${esc(a.statusRotulo || 'Status indisponível')}</span>`;
const tfCelulasMetricas = r => `<td class="num">${money(r.investimento)}</td><td class="num">${fmtN(r.impressoes)}</td><td class="num">${tfN(r.alcance)}</td><td class="num">${fmtN(r.cliques)}</td><td class="num">${tfPct(r.ctr)}</td><td class="num">${tfMoney(r.cpc)}</td><td class="num">${fmtN(r.conversas)}</td><td class="num">${tfMoney(r.custoConversa)}</td>`;

/* ---------------- gráfico de evolução (linha, barras ou área) ---------------- */
function tfGraficoTempo(el, { grupos, estilo = 'linha', fmt = money, nome = 'Valor', modo = 'dia' }) {
  if (!grupos.length) { el.innerHTML = '<div class="ch-vazio">Sem dados no período.</div>'; return; }
  const W = 720, H = 260, m = { t: 16, r: 16, b: 34, l: 58 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = Math.max(1e-9, ...grupos.map(g => g.valor)), passo = (() => { const bruto = max / 4, mag = 10 ** Math.floor(Math.log10(bruto)); return [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= bruto) || bruto; })(), topo = passo * 4;
  const n = grupos.length, larg = iw / n;
  const X = i => estilo === 'barras' ? m.l + larg * i + larg / 2 : m.l + (n === 1 ? iw / 2 : i * iw / (n - 1)), Y = v => m.t + ih * (1 - v / topo);
  const rot = g => modo === 'dia' ? tfDM(g.de) : modo === 'semana' ? `${tfSemanaTxt(g.de)} · ${tfDM(g.de)}` : `${TF_MESES[Number(g.chave.slice(5, 7)) - 1].slice(0, 3)}/${g.chave.slice(2, 4)}`;
  const grade = [0, 1, 2, 3, 4].map(i => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(passo * i).toFixed(1)}" y2="${Y(passo * i).toFixed(1)}" stroke="#E6E9F0"/><text x="${m.l - 6}" y="${(Y(passo * i) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5E6678">${esc(fmt(passo * i))}</text>`).join('');
  const cada = Math.max(1, Math.ceil(n / 8));
  const eixo = grupos.map((g, i) => i % cada === 0 ? `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#5E6678">${esc(modo === 'semana' ? tfDM(g.de) : rot(g))}</text>` : '').join('');
  const pts = grupos.map((g, i) => `${X(i).toFixed(1)},${Y(g.valor).toFixed(1)}`).join(' ');
  let corpo = '';
  if (estilo === 'barras') corpo = grupos.map((g, i) => `<rect x="${(m.l + larg * i + larg * 0.18).toFixed(1)}" y="${Y(g.valor).toFixed(1)}" width="${(larg * 0.64).toFixed(1)}" height="${Math.max(0, m.t + ih - Y(g.valor)).toFixed(1)}" rx="3" fill="#063996"><title>${esc(rot(g))}: ${esc(fmt(g.valor))}</title></rect>`).join('');
  else {
    if (estilo === 'area') corpo += `<polygon points="${X(0).toFixed(1)},${m.t + ih} ${pts} ${X(n - 1).toFixed(1)},${m.t + ih}" fill="#063996" opacity=".14"/>`;
    corpo += `<polyline points="${pts}" fill="none" stroke="#063996" stroke-width="2.4" stroke-linejoin="round"/>` + grupos.map((g, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(g.valor).toFixed(1)}" r="${n > 40 ? 0 : 3.5}" fill="#fff" stroke="#063996" stroke-width="2"><title>${esc(rot(g))}: ${esc(fmt(g.valor))}</title></circle>`).join('');
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="tf-svg" role="img" aria-label="${attr(`${nome} por ${modo === 'dia' ? 'dia' : modo === 'semana' ? 'semana' : 'mês'}, em ${estilo}`)}">${grade}${corpo}${eixo}</svg>`;
}

/* ---------------- Visão Geral ---------------- */
const TF_VIS = { indicador: 'investimento', estilo: 'linha', modo: 'dia' };
function tfAlertasVisao(d) {
  const alertas = [];
  for (const a of d.anuncios) if (['DISAPPROVED', 'WITH_ISSUES', 'PENDING_BILLING_INFO'].includes(a.status)) alertas.push({ titulo: a.statusRotulo, texto: `${a.nome} · confira a situação atual no Gerenciador da Meta.`, tipo: 'problema' });
  for (const c of d.campanhas) if (c.investimento >= 100 && c.impressoes >= 1000 && c.conversas === 0) alertas.push({ titulo: 'Investimento sem conversas', texto: `${c.nome}: ${money(c.investimento)} no período. Confira se conversas são o objetivo desta campanha.`, tipo: 'revisar' });
  return alertas.length ? `<div class="tf-vis-alertas">${alertas.slice(0, 6).map(a => `<article class="tf-vis-alerta ${a.tipo}"><span class="badge ${a.tipo === 'problema' ? 'warn' : 'info'}">${a.tipo === 'problema' ? 'Atenção' : 'Conferir'}</span><div><b>${esc(a.titulo)}</b><p>${esc(a.texto)}</p></div></article>`).join('')}</div>` : '<div class="empty compact">Nenhum ponto de atenção nos dados deste período.</div>';
}
PAGINAS.trafego = async function () {
  const d = await tfPagina(d => {
    const a = d.atual, v = d.variacoes;
    const kpis = TF_INDICADORES.map(([k, rot, fmt, bom]) => `<div class="kpi tf-kpi"><span class="tf-ico" aria-hidden="true">${TF_ICONES[k]}</span><small>${rot}</small><strong>${a[k] === null || a[k] === undefined ? '—' : fmt(a[k])}</strong>${delta(v[k], { bomSubir: bom })}<i class="kd flat">vs. ${esc(k === 'investimento' ? tfMoney(d.anteriorTotais?.investimento) : (d.anteriorTotais && d.anteriorTotais[k] !== null && d.anteriorTotais[k] !== undefined ? fmt(d.anteriorTotais[k]) : 'sem base'))}</i></div>`).join('');
    const linhas = d.campanhas.map(c => `<tr><td class="titlecell"><b>${esc(c.nome)}</b>${c.segmento ? `<br><small>${esc(tfSegRotulo(c.segmento))}</small>` : ''}</td><td>${tfBadge(c)}</td>${tfCelulasMetricas(c)}</tr>`).join('');
    const t = d.atual;
    const total = `<tr><th colspan="2">Total (${d.campanhas.length} campanha(s))</th><th class="num">${money(t.investimento)}</th><th class="num">${fmtN(t.impressoes)}</th><th class="num">${tfN(t.alcance)}*</th><th class="num">${fmtN(t.cliques)}</th><th class="num">${tfPct(t.ctr)}</th><th class="num">${tfMoney(t.cpc)}</th><th class="num">${fmtN(t.conversas)}</th><th class="num">${tfMoney(t.custoConversa)}</th></tr>`;
    return `<div class="tf-visao"><div class="kpis kpis4 tf-vis-kpis tf-kpis8">${kpis}</div>
      <section class="card"><div class="db-tit"><h2>Evolução no período</h2>${origem(d.origem)}<div class="tf-controles">
        <label>Indicador <select class="control" id="tfVInd" aria-label="Indicador do gráfico"><option value="investimento">Investimento (R$)</option><option value="conversas">Conversas iniciadas</option></select></label>
        <label>Estilo <select class="control" id="tfVEst" aria-label="Estilo do gráfico"><option value="linha">Linha</option><option value="barras">Barras</option><option value="area">Área</option></select></label>
        <label>Agrupar por <select class="control" id="tfVModo" aria-label="Granularidade"><option value="dia">Dia</option><option value="semana">Semana (dom–sáb)</option><option value="mes">Mês</option></select></label></div></div>
        <div id="tfTempo"></div><details class="tf-tabela"><summary>Ver como tabela</summary><div id="tfTempoTabela"></div></details></section>
      <div class="tf-vis-graficos"><section class="card"><div class="db-tit"><h2>Investimento por campanha</h2></div><div id="tfBarrasCamp"></div></section>
      <section class="card"><div class="db-tit"><h2>Investimento e resultado por segmento</h2></div><div id="tfSegmentos"></div></section></div>
      <section class="card"><div class="db-tit"><h2>Alertas e pontos de atenção</h2><small>Baseados nos dados consultados</small></div>${tfAlertasVisao(d)}</section>
      <section class="card" id="tfVisAnuncios"><div class="db-tit"><h2>Anúncios em destaque</h2><small>os ${Math.min(6, d.anuncios.length)} que mais investiram · clique para ver o detalhe</small><button class="btn soft" id="tfVerAnuncios">Ver todos os anúncios (${d.anuncios.length})</button></div>${d.anuncios.length ? `<div class="tf-anuncios">${d.anuncios.slice(0, 6).map(x => `<article class="tf-anuncio"><button type="button" class="tf-anuncio-abre" data-tf-anuncio="${attr(x.id)}" aria-label="Ver detalhes do anúncio ${attr(x.nome)}">${x.miniatura ? `<img src="${attr(x.miniatura)}" alt="Criativo: ${attr(x.nome)}" loading="lazy" referrerpolicy="no-referrer">` : '<span class="tf-sem">Sem imagem</span>'}</button><div><b>${esc(x.nome)}</b><small>${esc(x.campanha)}${x.conjunto ? ' › ' + esc(x.conjunto) : ''}</small>${tfBadge(x)}<dl><div><dt>Investimento</dt><dd>${money(x.investimento)}</dd></div><div><dt>Conversas</dt><dd>${fmtN(x.conversas)}</dd></div><div><dt>Custo/conversa</dt><dd>${tfMoney(x.custoConversa)}</dd></div><div><dt>CTR</dt><dd>${tfPct(x.ctr)}</dd></div></dl></div></article>`).join('')}</div>` : '<div class="empty compact">Nenhum anúncio com veiculação neste período.</div>'}</section>
      <section class="card" id="tfVisCampanhas"><div class="db-tit"><h2>Campanhas</h2><button class="btn soft" data-go="tfdesempenho">Ver desempenho detalhado</button></div>${d.campanhas.length ? `<div class="tablewrap"><table class="datatable tf-tab"><thead><tr><th>Campanha</th><th>Status</th><th class="num">Investimento</th><th class="num">Impressões</th><th class="num">Alcance</th><th class="num">Cliques</th><th class="num">CTR</th><th class="num">CPC</th><th class="num">Conversas</th><th class="num">Custo/conversa</th></tr></thead><tbody>${linhas}</tbody><tfoot>${total}</tfoot></table></div>` : '<div class="empty compact">Nenhuma campanha com veiculação neste período.</div>'}</section>
      <p class="kpi-note">*Alcance total vem da conta (pessoas únicas) e não é a soma das campanhas. CTR, CPC e custo por conversa são recalculados dos valores absolutos. Conversas = conversas iniciadas pelos anúncios. Status é o atual na Meta.</p></div>`;
  });
  if (!d) return;
  $$('[data-tf-anuncio]').forEach(b => { b.onclick = () => tfDesDetalhe(d, b.dataset.tfAnuncio); });
  tfLigarFotos(document);
  $('#tfVerAnuncios').onclick = () => { TF_DES.nivel = 'anuncios'; TF_DES.pagina = 1; go('tfdesempenho'); };
  const total = d.diario.total, conv = d.diario.conversas || d.diario.dias.map(() => 0);
  const desenhar = () => {
    const ehInv = TF_VIS.indicador === 'investimento';
    const grupos = tfAgrupar(d.diario.dias, ehInv ? total : conv, TF_VIS.modo);
    tfGraficoTempo($('#tfTempo'), { grupos, estilo: TF_VIS.estilo, fmt: ehInv ? money : fmtN, nome: ehInv ? 'Investimento' : 'Conversas iniciadas', modo: TF_VIS.modo });
    const tot = grupos.reduce((s, g) => s + g.valor, 0), f = ehInv ? money : fmtN;
    $('#tfTempoTabela').innerHTML = `<div class="tablewrap"><table class="datatable"><thead><tr><th>${TF_VIS.modo === 'dia' ? 'Dia' : TF_VIS.modo === 'semana' ? 'Semana' : 'Mês'}</th><th class="num">${ehInv ? 'Investimento' : 'Conversas'}</th></tr></thead><tbody>${grupos.map(g => `<tr><td>${esc(TF_VIS.modo === 'dia' ? fmtDate(g.de) : TF_VIS.modo === 'semana' ? `${tfSemanaTxt(g.de)} · ${fmtDate(g.de)} a ${fmtDate(g.ate)}` : `${TF_MESES[Number(g.chave.slice(5, 7)) - 1]} de ${g.chave.slice(0, 4)}`)}</td><td class="num">${f(g.valor)}</td></tr>`).join('')}</tbody><tfoot><tr><th>Total</th><th class="num">${f(tot)}</th></tr></tfoot></table></div>`;
  };
  $('#tfVInd').value = TF_VIS.indicador; $('#tfVEst').value = TF_VIS.estilo; $('#tfVModo').value = TF_VIS.modo;
  $('#tfVInd').onchange = e => { TF_VIS.indicador = e.target.value; desenhar(); };
  $('#tfVEst').onchange = e => { TF_VIS.estilo = e.target.value; desenhar(); };
  $('#tfVModo').onchange = e => { TF_VIS.modo = e.target.value; desenhar(); };
  desenhar();
  EvoCharts.barras($('#tfBarrasCamp'), { itens: d.campanhas.map(c => ({ nome: c.codigo || c.nome, sub: c.nome, v: c.investimento, cor: '#063996' })), fmt: money, rotuloAcessivel: 'Investimento por campanha' });
  const segs = d.segmentos || [];
  if (segs.length) {
    $('#tfSegmentos').innerHTML = `<div id="tfRoscaSeg"></div><ul class="tf-seg-lista">${segs.map(s => `<li><b>${esc(tfSegRotulo(s.segmento))}</b><span>${money(s.investimento)}</span><small>${fmtN(s.conversas)} conversa(s) · ${s.custoConversa === null ? 'sem custo por conversa' : money(s.custoConversa) + ' por conversa'}</small></li>`).join('')}</ul><small class="kpi-note">O segmento é reconhecido pelo nome da campanha (EI, AI, AF, EM).</small>`;
    EvoCharts.rosca($('#tfRoscaSeg'), { itens: segs.map(s => ({ nome: tfSegRotulo(s.segmento), v: s.investimento })), centro: String(segs.length), sub: segs.length === 1 ? 'segmento' : 'segmentos', rotuloAcessivel: 'Distribuição do investimento por segmento' });
  } else $('#tfSegmentos').innerHTML = '<div class="empty compact">Sem investimento por segmento neste período.</div>';
};
