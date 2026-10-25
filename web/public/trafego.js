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

const tfFotoAnuncio = a => a.miniatura ? `<button class="tf-foto" type="button" data-tffoto="${attr(a.imagem || a.miniatura)}" aria-label="Ampliar foto de ${attr(a.nome)}"><img src="${attr(a.miniatura)}" alt="Criativo: ${attr(a.nome)}" loading="lazy" referrerpolicy="no-referrer" width="64" height="80"></button>` : '<span class="tf-sem">Sem imagem</span>';
const tfBadge = a => `<span class="badge ${a.status === 'ACTIVE' ? 'ok' : /PAUSED|ARCHIVED|DELETED/.test(a.status) ? 'mute' : 'warn'}">${esc(a.statusRotulo || 'Status indisponível')}</span>`;

const TF_VIS_FILTRO={campanhas:{busca:'',status:'todos',ordem:'investimento',expandido:false},anuncios:{busca:'',status:'todos',ordem:'investimento',expandido:false,campanha:''}};
function tfVisLinhas(d,tipo) {
 const f=TF_VIS_FILTRO[tipo],norm=x=>String(x||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
 return (tipo==='anuncios'?d.anuncios:d.campanhas).filter(r=>
   norm(r.nome).includes(norm(f.busca))&&(!f.campanha||r.campanha===f.campanha)&&
   (f.status==='todos'||(f.status==='ativos'&&r.status==='ACTIVE')||(f.status==='pausados'&&String(r.status).includes('PAUSED'))||(f.status==='problemas'&&/DISAPPROVED|WITH_ISSUES|PENDING_BILLING/.test(r.status)))
 ).sort((x,y)=>f.ordem==='status'?String(x.statusRotulo||x.status).localeCompare(String(y.statusRotulo||y.status),'pt-BR'):((y[f.ordem]??-Infinity)-(x[f.ordem]??-Infinity)));
}
function tfResumoLista(d,anuncios=false) {
 const tipo=anuncios?'anuncios':'campanhas',f=TF_VIS_FILTRO[tipo],rows=tfVisLinhas(d,tipo),shown=f.expandido?rows:rows.slice(0,6);
 const campos=[['investimento','Investimento'],['conversas','Conversas'],['custoConversa','Custo por conversa'],['status','Status']];
 return `<div class="ig-barra tf-vis-filtros">
 <label>Buscar por nome <input class="control" data-tf-busca="${tipo}" placeholder="Nome ${anuncios?'do anúncio':'da campanha'}" value="${attr(f.busca)}"></label>
 <label>Status <select class="control" data-tf-status="${tipo}">${[['todos','Todos'],['ativos','Ativos'],['pausados','Pausados'],['problemas','Problemas']].map(([k,v])=>`<option value="${k}" ${f.status===k?'selected':''}>${v}</option>`).join('')}</select></label>
 <label>Ordenar <select class="control" data-tf-ordem="${tipo}">${campos.map(([k,v])=>`<option value="${k}" ${f.ordem===k?'selected':''}>${v}</option>`).join('')}</select></label>
 ${anuncios&&f.campanha?`<button class="btn soft" data-tf-limpar>Limpar campanha: ${esc(f.campanha)} ×</button>`:''}</div>
 <div class="tablewrap"><table class="datatable tf-tab"><thead><tr>${anuncios?'<th>Foto</th>':''}<th>${anuncios?'Anúncio':'Campanha'}</th><th>Status</th><th class="num">Investimento</th><th class="num">Conversas</th><th class="num">Custo/conversa</th></tr></thead><tbody>${shown.length?shown.map((r,i)=>`<tr>${anuncios?`<td class="tf-fotocel">${tfFotoAnuncio(r)}</td>`:''}<td><button class="btn soft" type="button" data-tf-${anuncios?'detalhe':'campanha'}="${i}">${esc(r.nome)}</button>${anuncios?`<br><small>${esc(r.campanha)}</small>`:''}</td><td>${tfBadge(r)}</td><td class="num">${money(r.investimento)}</td><td class="num">${fmtN(r.conversas)}</td><td class="num">${r.custoConversa===null?'—':money(r.custoConversa)}</td></tr>`).join(''):'<tr><td colspan="7">Nenhum registro corresponde aos filtros.</td></tr>'}</tbody></table></div>
 <div class="tf-vis-rodape"><small class="kpi-note">${shown.length} de ${rows.length} registros</small>${rows.length>6?`<button class="btn soft" data-tf-expand="${tipo}">${f.expandido?'Mostrar seis':'Ver todos nesta seção'}</button>`:''}</div>`;
}
function tfLigarVisao(d) {
 const render=tipo=>{
   const sec=document.getElementById(tipo==='campanhas'?'tfVisCampanhas':'tfVisAnuncios');
   const body=sec?.querySelector('.tf-vis-body');if(!body)return;
   body.innerHTML=tfResumoLista(d,tipo==='anuncios');ligar(tipo);
 };
 const ligar=tipo=>{
  const sec=document.getElementById(tipo==='campanhas'?'tfVisCampanhas':'tfVisAnuncios');if(!sec)return;
  const f=TF_VIS_FILTRO[tipo];
  const busca=sec.querySelector('[data-tf-busca]');busca.onchange=()=>{f.busca=busca.value;render(tipo);};
  sec.querySelector('[data-tf-status]').onchange=e=>{f.status=e.target.value;render(tipo);};
  sec.querySelector('[data-tf-ordem]').onchange=e=>{f.ordem=e.target.value;render(tipo);};
  const exp=sec.querySelector('[data-tf-expand]');if(exp)exp.onclick=()=>{f.expandido=!f.expandido;render(tipo);};
  const limpar=sec.querySelector('[data-tf-limpar]');if(limpar)limpar.onclick=()=>{f.campanha='';render(tipo);};
  sec.querySelectorAll('[data-tf-campanha]').forEach(btn=>btn.onclick=()=>{
    const c=tfVisLinhas(d,'campanhas')[Number(btn.dataset.tfCampanha)];
    if(!c)return;TF_VIS_FILTRO.anuncios.campanha=c.nome;TF_VIS_FILTRO.anuncios.expandido=true;
    render('anuncios');document.getElementById('tfVisAnuncios').scrollIntoView({behavior:'smooth'});
  });
  sec.querySelectorAll('[data-tf-detalhe]').forEach(btn=>btn.onclick=()=>{
   const x=tfVisLinhas(d,'anuncios')[Number(btn.dataset.tfDetalhe)];if(!x)return;
   dialogo(`<h3>${esc(x.nome)}</h3>${x.imagem||x.miniatura?`<img class="tf-foto-ampliada" src="${attr(x.imagem||x.miniatura)}" alt="Foto do anúncio" referrerpolicy="no-referrer">`:''}<p><b>Campanha:</b> ${esc(x.campanha)}</p><p><b>Status:</b> ${esc(x.statusRotulo||'—')}</p><p>Investimento: ${money(x.investimento)} · Conversas: ${fmtN(x.conversas)} · Custo por conversa: ${x.custoConversa===null?'—':money(x.custoConversa)} · CTR: ${x.ctr===null?'—':pct(x.ctr)}</p><button class="btn" data-close>Fechar</button>`,{larga:true});
  });
  sec.querySelectorAll('[data-tffoto]').forEach(btn=>btn.onclick=()=>dialogo(`<h3>Imagem do anúncio</h3><img class="tf-foto-ampliada" src="${attr(btn.dataset.tffoto)}" alt="Imagem ampliada"><button class="btn" data-close>Fechar</button>`,{larga:true}));
 };
 ligar('campanhas');ligar('anuncios');
}
function tfAlertasVisao(d) {
  const alertas = [];
  for (const a of d.anuncios) if (['DISAPPROVED', 'WITH_ISSUES', 'PENDING_BILLING_INFO'].includes(a.status)) alertas.push({ titulo: a.statusRotulo, texto: `${a.nome} · confira a situação atual no Gerenciador da Meta.`, tipo: 'problema' });
  for (const c of d.campanhas) if (c.investimento >= 100 && c.impressoes >= 1000 && c.conversas === 0) alertas.push({ titulo: 'Investimento sem conversas', texto: `${c.nome}: ${money(c.investimento)} no período. Confira se conversas são o objetivo desta campanha.`, tipo: 'revisar' });
  for (const aviso of d.avisos || []) alertas.push({ titulo: 'Aviso dos dados', texto: aviso, tipo: 'revisar' });
  return alertas.length ? `<div class="tf-vis-alertas">${alertas.slice(0, 6).map(a => `<article class="tf-vis-alerta ${a.tipo}"><span class="badge ${a.tipo === 'problema' ? 'warn' : 'info'}">${a.tipo === 'problema' ? 'Atenção' : 'Conferir'}</span><div><b>${esc(a.titulo)}</b><p>${esc(a.texto)}</p></div></article>`).join('')}</div>${alertas.length > 6 ? `<p class="kpi-note">Mais ${alertas.length - 6} aviso(s). Consulte a lista completa de anúncios.</p>` : ''}` : '<div class="empty compact">Nenhum alerta pelos critérios desta visão. Os dados podem ser atualizados pela Meta.</div>';
}
PAGINAS.trafego = async function () {
  const d = await tfPagina(d => {
    const a = d.atual, v = d.variacoes;
    const ordem = ['conversas', 'custoConversa', 'cpc', 'ctr', 'alcance', 'impressoes', 'cliques'];
    const kpis = ordem.map(k => { const [, rot, fmt, bom] = TF_INDICADORES.find(x => x[0] === k); return `<div class="kpi"><small>${rot}</small><strong>${a[k] === null || a[k] === undefined ? '—' : fmt(a[k])}</strong>${delta(v[k], { bomSubir: bom })}</div>`; }).join('');
    return `${tfCabecalho(d)}<div class="tf-visao">
      <section class="card tf-vis-hero"><div><small>Investimento no período</small><strong>${money(a.investimento)}</strong>${delta(v.investimento, { bomSubir: true })}</div><div class="tf-vis-contexto"><b>${esc(fmtDate(d.periodo.de))} a ${esc(fmtDate(d.periodo.ate))}</b><span>${d.campanhas.length} campanha(s) · ${d.anuncios.length} anúncio(s) com veiculação</span><small>Status atual na Meta; valores do período escolhido.</small></div></section>
      <div class="kpis kpis4 tf-vis-kpis">${kpis}<div class="kpi"><small>Campanhas com veiculação</small><strong>${fmtN(d.campanhas.length)}</strong><i class="kd flat">no período escolhido</i></div></div>
      <div class="tf-vis-graficos"><section class="card"><div class="db-tit"><h2>Investimento diário por campanha</h2>${origem(d.origem)}</div><div id="tfDiario"></div><details class="tf-tabela"><summary>Ver como tabela</summary><div id="tfDiarioTabela"></div></details></section><section class="card"><div class="db-tit"><h2>Investimento por campanha</h2></div><div id="tfBarrasCamp"></div></section></div>
      <section class="card" id="tfVisCampanhas"><div class="db-tit"><h2>Campanhas</h2><small>Clique numa campanha para ver seus anúncios</small></div><div class="tf-vis-body">${tfResumoLista(d)}</div></section>
      <section class="card" id="tfVisAnuncios"><div class="db-tit"><h2>Anúncios</h2><small>Detalhes e fotos disponíveis</small></div><div class="tf-vis-body">${tfResumoLista(d, true)}</div></section>
      <section class="card"><div class="db-tit"><h2>Alertas e pontos de atenção</h2><small>Baseados nos dados consultados</small></div>${tfAlertasVisao(d)}</section>
      <p class="kpi-note">Alcance total vem da conta e não soma as campanhas. CTR, CPC e custo por conversa são recalculados dos valores absolutos. Os filtros das seções são aplicados na própria Visão Geral.</p></div>`;
  });
  if (!d) return;
  tfLigarVisao(d);
  const diario = d.diario, cores = ['#063996', '#00A1F3', '#FF7800', '#793A8C'];
  const series = diario.series.map((s, i) => ({ k: 'camp' + i, nome: s.codigo || s.nome, cor: cores[i % cores.length], fmt: money, marcadores: true }));
  series.push({ k: 'total', nome: 'Total', cor: '#00275F', fmt: money, tracejado: true, marcadores: true });
  const dados = diario.dias.map((x, i) => Object.fromEntries([['x', x], ['total', diario.total[i]], ...diario.series.map((s, n) => ['camp' + n, s.valores[i]])]));
  EvoCharts.linha($('#tfDiario'), { dados, series, sombreado: false, altura: 280, rotuloAcessivel: 'Investimento diário por campanha, com total tracejado' });
  EvoCharts.barras($('#tfBarrasCamp'), { itens: d.campanhas.map(c => ({ nome: c.codigo || c.nome, sub: c.nome, v: c.investimento, cor: '#063996' })), fmt: money, rotuloAcessivel: 'Investimento por campanha' });
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
