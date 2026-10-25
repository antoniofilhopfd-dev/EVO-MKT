/* Tráfego Pago › Relatórios: escolhe o tipo de relatório e os filtros, mostra a PRÉ-VISUALIZAÇÃO (a mesma página A4 que vira PDF) e só então imprime/baixa.
   A pré-visualização é a própria página /relatorio-trafego.html dentro da tela, então números, datas e totais são idênticos aos do PDF. Somente leitura. */
const TF_REL = { tipo: 'geral', status: 'todos', segmento: '', campanha: '', semanal: false };
const TF_REL_TIPOS = [['geral', 'Relatório geral', 'Visão completa do desempenho'], ['campanha', 'Relatório por campanha', 'Detalhamento das campanhas'], ['conjunto', 'Relatório por conjunto', 'Detalhamento dos conjuntos de anúncios'], ['anuncio', 'Relatório por anúncio', 'Detalhamento dos anúncios, com as fotos'], ['segmento', 'Relatório por segmento', 'Desempenho por segmento da escola']];
function tfRelQuery(d, extra = {}) {
  const f = Filtros.get(), q = new URLSearchParams({ de: d.periodo.de, ate: d.periodo.ate, tp: f.p, tipo: TF_REL.tipo, status: TF_REL.status, ...extra });
  if (TF_REL.segmento) q.set('segmento', TF_REL.segmento);
  if (TF_REL.campanha) q.set('campanha', TF_REL.campanha);
  if (TF_REL.semanal && (TF_REL.tipo === 'geral' || TF_REL.tipo === 'campanha')) q.set('semanal', '1');
  return q.toString();
}
PAGINAS.tfrelatorios = async function () {
  const d = await tfPagina(() => '<div id="tfRel"></div>');
  if (!d) return;
  const raiz = $('#tfRel'), segs = [...new Set(d.campanhas.map(c => c.segmento || 'SEM'))];
  const opc = (v, l, atual) => `<option value="${attr(v)}" ${String(atual) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
  const semanalOk = d.periodo.dias >= 7 && (TF_REL.tipo === 'geral' || TF_REL.tipo === 'campanha');
  raiz.innerHTML = `<div class="tf-rel-grade"><aside class="card tf-rel-menu"><div class="db-tit"><h2>Gerar relatório</h2><small>Escolha o tipo e os filtros; o período é o do filtro acima</small></div>
    <div class="tf-rel-tipos" role="radiogroup" aria-label="Tipo de relatório">${TF_REL_TIPOS.map(([k, t, s]) => `<label class="tf-rel-tipo ${TF_REL.tipo === k ? 'on' : ''}"><input type="radio" name="tfRelTipo" value="${k}" ${TF_REL.tipo === k ? 'checked' : ''}><span><b>${t}</b><small>${s}</small></span></label>`).join('')}</div>
    <label class="fb-campo"><span>Status</span><select class="control" id="tfrStatus">${TF_STATUS_OPCOES.map(([v, l]) => opc(v, l, TF_REL.status)).join('')}</select></label>
    <label class="fb-campo"><span>Segmento</span><select class="control" id="tfrSeg">${opc('', 'Todos', TF_REL.segmento)}${segs.map(s => opc(s, tfSegRotulo(s), TF_REL.segmento)).join('')}</select></label>
    <label class="fb-campo"><span>Campanha</span><select class="control" id="tfrCamp">${opc('', 'Todas', TF_REL.campanha)}${d.campanhas.map(c => opc(c.id, c.nome, TF_REL.campanha)).join('')}</select></label>
    <label class="tf-rel-chk ${semanalOk ? '' : 'off'}"><input type="checkbox" id="tfrSem" ${TF_REL.semanal && semanalOk ? 'checked' : ''} ${semanalOk ? '' : 'disabled'}> Incluir recorte semanal (dom–sáb)${semanalOk ? '' : '<small>Disponível nos relatórios geral e por campanha, em períodos de 7 dias ou mais.</small>'}</label>
    <div class="tf-rel-acoes"><button type="button" class="btn" id="tfrImprime">Imprimir / salvar PDF</button><a class="btn soft" id="tfrAbrir" target="_blank" rel="noopener">Abrir em tela cheia</a>${TF_REL.tipo === 'campanha' || TF_REL.tipo === 'anuncio' || TF_REL.tipo === 'conjunto' ? '<a class="btn soft" id="tfrCsv">Baixar CSV</a>' : ''}</div>
    <small class="kpi-note">No diálogo de impressão escolha “Salvar como PDF”, papel A4, e marque “Gráficos de segundo plano”.</small></aside>
    <section class="card tf-rel-previa"><div class="db-tit"><h2>Pré-visualização</h2><small>${esc(TF_REL_TIPOS.find(x => x[0] === TF_REL.tipo)[1])} · ${esc(fmtDate(d.periodo.de))} a ${esc(fmtDate(d.periodo.ate))}</small></div>
    <div id="tfrPrevia" class="tf-rel-previa-corpo" role="region" aria-label="Pré-visualização do relatório"></div></section></div>`;
  const re = alt => { Object.assign(TF_REL, alt); go('tfrelatorios'); };
  raiz.querySelectorAll('input[name="tfRelTipo"]').forEach(r => { r.onchange = () => re({ tipo: r.value }); });
  $('#tfrStatus').onchange = e => re({ status: e.target.value });
  $('#tfrSeg').onchange = e => re({ segmento: e.target.value });
  $('#tfrCamp').onchange = e => re({ campanha: e.target.value });
  $('#tfrSem').onchange = e => re({ semanal: e.target.checked });
  $('#tfrAbrir').href = '/relatorio-trafego.html?' + tfRelQuery(d);
  const csv = $('#tfrCsv'); if (csv) csv.href = `/api/trafego/csv?de=${d.periodo.de}&ate=${d.periodo.ate}&tipo=${encodeURIComponent(Filtros.get().p)}&nivel=${TF_REL.tipo === 'anuncio' ? 'anuncios' : TF_REL.tipo === 'conjunto' ? 'conjuntos' : 'campanhas'}&status=${TF_REL.status}`;
  // pré-visualização: a mesma página A4 do PDF, montada por trafego-relatorio.js dentro de um shadow DOM (estilo isolado do app)
  const alvo = $('#tfrPrevia'), sombra = alvo.attachShadow({ mode: 'open' });
  const optRel = { tipo: TF_REL.tipo, status: TF_REL.status, segmento: TF_REL.segmento, campanha: TF_REL.campanha, semanal: TF_REL.semanal && semanalOk };
  sombra.innerHTML = `<link rel="stylesheet" href="/relatorio-trafego.css?v=20261025-tf3"><div class="previa-pg">${TfRelatorio.html(d, optRel, `Colégio Evolução | Campanhas ${new Date().getFullYear()}`, TfRelatorio.obsPadrao())}</div>`;
  sombra.querySelectorAll('td.foto img').forEach(img => { img.onerror = () => img.replaceWith(Object.assign(document.createElement('span'), { textContent: 'Imagem indisponível' })); });
  $('#tfrImprime').onclick = () => { window.open('/relatorio-trafego.html?' + tfRelQuery(d, { imprimir: '1' }), '_blank', 'noopener'); };
};
