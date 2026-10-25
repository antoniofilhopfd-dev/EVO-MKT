/* Tráfego Pago › Relatórios: só o Relatório Geral. Período (com datas editáveis), recorte semanal, filtros, PRÉ-VISUALIZAÇÃO e download direto do PDF
   (gerado no servidor; não abre diálogo de impressão). Somente leitura. */
const TF_REL = { status: 'todos', segmento: '', campanha: '', semanal: false };
const TF_REL_PERIODOS = [['semana', 'Esta semana'], ['mes', 'Este mês'], ['mes_ant', 'Mês anterior'], ['ano', 'Este ano']];
const tfBR = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
/** "dd/mm/aaaa" → "aaaa-mm-dd" (ou '' se não for uma data real). */
function tfDataBR(txt) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(txt).trim()); if (!m) return '';
  const iso = `${m[3]}-${m[2]}-${m[1]}`, d = new Date(iso + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === iso ? iso : '';
}
function tfRelQuery(d, extra = {}) {
  const f = Filtros.get(), q = new URLSearchParams({ de: d.periodo.de, ate: d.periodo.ate, tipo: f.p, status: TF_REL.status, ...extra });
  if (TF_REL.segmento) q.set('segmento', TF_REL.segmento);
  if (TF_REL.campanha) q.set('campanha', TF_REL.campanha);
  if (TF_REL.semanal && d.periodo.dias >= 7) q.set('semanal', '1');
  return q.toString();
}
PAGINAS.tfrelatorios = async function () {
  const d = await tfPagina(() => '<div id="tfRel"></div>');
  if (!d) return;
  const f = Filtros.get(), raiz = $('#tfRel'), segs = [...new Set(d.campanhas.map(c => c.segmento || 'SEM'))];
  const opc = (v, l, atual) => `<option value="${attr(v)}" ${String(atual) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
  const semanalOk = d.periodo.dias >= 7;
  if (!semanalOk) TF_REL.semanal = false;
  const rotPersonalizado = f.p === 'x';
  raiz.innerHTML = `<section class="card tfr-form"><div class="db-tit"><h2>Período do relatório</h2><small>Relatório geral do desempenho dos anúncios no Meta Ads</small></div>
    <div class="tfr-per"><div class="fb-rapidos" role="group" aria-label="Período do relatório">${TF_REL_PERIODOS.map(([v, l]) => `<button type="button" class="pill ${f.p === v ? 'on' : ''}" data-tfr-p="${v}" aria-pressed="${f.p === v}">${l}</button>`).join('')}<button type="button" class="pill ${rotPersonalizado ? 'on' : ''}" id="tfrPers" aria-pressed="${rotPersonalizado}">Personalizado</button></div>
      <label class="fb-campo"><span>Data inicial</span><input class="control" id="tfrDe" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" value="${attr(tfBR(d.periodo.de))}" aria-describedby="tfrErro"></label>
      <label class="fb-campo"><span>Data final</span><input class="control" id="tfrAte" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" value="${attr(tfBR(d.periodo.ate))}" aria-describedby="tfrErro"></label>
      <button type="button" class="btn soft" id="tfrAplicar">Aplicar datas</button>
      <label class="tf-rel-chk ${semanalOk ? '' : 'off'}"><input type="checkbox" id="tfrSem" ${TF_REL.semanal && semanalOk ? 'checked' : ''} ${semanalOk ? '' : 'disabled'}> Exibir por semana (dom–sáb)${semanalOk ? '' : '<small>Disponível a partir de 7 dias de período.</small>'}</label></div>
    <p class="cm-erro" id="tfrErro" role="alert"></p>
    <div class="tfr-filtros"><label class="fb-campo"><span>Status</span><select class="control" id="tfrStatus">${TF_STATUS_OPCOES.map(([v, l]) => opc(v, l, TF_REL.status)).join('')}</select></label>
    <label class="fb-campo"><span>Segmento</span><select class="control" id="tfrSeg">${opc('', 'Todos os segmentos', TF_REL.segmento)}${segs.map(s => opc(s, tfSegRotulo(s), TF_REL.segmento)).join('')}</select></label>
    <label class="fb-campo"><span>Campanha</span><select class="control" id="tfrCamp">${opc('', 'Todas as campanhas', TF_REL.campanha)}${d.campanhas.map(c => opc(c.id, c.nome, TF_REL.campanha)).join('')}</select></label>
    <a class="btn soft" id="tfrAbrir" target="_blank" rel="noopener">Abrir em tela cheia</a><button type="button" class="btn" id="tfrPdf">Baixar PDF</button></div>
    <p class="kpi-note">Comparação com o período anterior de mesma duração: ${esc(tfBR(d.anterior.de))} a ${esc(tfBR(d.anterior.ate))}.</p></section>
    <section class="card tf-rel-previa"><div class="db-tit"><h2>Pré-visualização do relatório</h2><small>Relatório geral · ${esc(tfBR(d.periodo.de))} a ${esc(tfBR(d.periodo.ate))}${(TF_REL.status !== 'todos' || TF_REL.segmento || TF_REL.campanha) ? ' · com filtros' : ''}</small></div>
    <div id="tfrPrevia" class="tf-rel-previa-corpo" role="region" aria-label="Pré-visualização do relatório"></div></section>`;
  const re = alt => { Object.assign(TF_REL, alt); cfgRecarregaRel(); };
  $$('[data-tfr-p]', raiz).forEach(b => { b.onclick = () => Filtros.set({ p: b.dataset.tfrP, de: '', ate: '' }); });
  const erro = m => { $('#tfrErro').textContent = m || ''; };
  const aplicaDatas = () => {
    if (!$('#tfrDe') || !$('#tfrAte')) return;
    const a = tfDataBR($('#tfrDe').value), b = tfDataBR($('#tfrAte').value), hoje = hojeBR();
    if (!a || !b) return erro('Informe as duas datas no formato dd/mm/aaaa.');
    if (a > b) return erro('A data inicial não pode ser depois da final.');
    if (b > hoje) return erro('A data final não pode ser no futuro: a Meta só informa dias que já passaram.');
    if (Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000) + 1 > 400) return erro('O período máximo é de 400 dias.');
    erro(''); if (a !== d.periodo.de || b !== d.periodo.ate || f.p !== 'x') Filtros.set({ p: 'x', de: a, ate: b });
  };
  // aplica ao apertar Enter, tocar em “Aplicar” ou sair dos dois campos (passar de um para o outro não refaz o relatório)
  for (const id of ['#tfrDe', '#tfrAte']) { const el = $(id); el.onchange = () => setTimeout(() => { if (![$('#tfrDe'), $('#tfrAte')].includes(document.activeElement)) aplicaDatas(); }, 0); el.onkeydown = e => { if (e.key === 'Enter') aplicaDatas(); }; el.oninput = () => { el.value = el.value.replace(/[^\d/]/g, ''); }; }
  $('#tfrAplicar').onclick = aplicaDatas;
  $('#tfrPers').onclick = () => PeriodoPicker.abrir({ de: d.periodo.de, ate: d.periodo.ate, titulo: 'Período do relatório', max: hojeBR() }, (a, b) => Filtros.set({ p: 'x', de: a, ate: b }));
  $('#tfrStatus').onchange = e => re({ status: e.target.value });
  $('#tfrSeg').onchange = e => re({ segmento: e.target.value });
  $('#tfrCamp').onchange = e => re({ campanha: e.target.value });
  const sem = $('#tfrSem'); if (sem) sem.onchange = e => re({ semanal: e.target.checked });
  $('#tfrAbrir').href = '/relatorio-trafego.html?' + tfRelQuery(d);
  // pré-visualização: a mesma página do relatório, montada por trafego-relatorio.js dentro de um shadow DOM (estilo isolado do app)
  const sombra = $('#tfrPrevia').attachShadow({ mode: 'open' });
  const optRel = { status: TF_REL.status, segmento: TF_REL.segmento, campanha: TF_REL.campanha, semanal: TF_REL.semanal && semanalOk, tp: f.p };
  sombra.innerHTML = `<link rel="stylesheet" href="/relatorio-trafego.css?v=20261025-rp4"><div class="previa-pg">${TfRelatorio.html(d, optRel, TfRelatorio.obsPadrao())}</div>`;
  sombra.querySelectorAll('td.foto img').forEach(img => { img.onerror = () => img.replaceWith(Object.assign(document.createElement('span'), { textContent: 'Imagem indisponível' })); });
  // Baixar PDF: pede o arquivo ao servidor e o salva direto (sem impressão); erros aparecem na tela
  $('#tfrPdf').onclick = async () => {
    const b = $('#tfrPdf'); b.disabled = true; const rot = b.textContent; b.textContent = 'Gerando PDF…';
    try {
      const r = await fetch('/api/trafego/relatorio.pdf?' + tfRelQuery(d), { credentials: 'same-origin', headers: { 'X-EVO': '1' } });
      if (!r.ok) { let m = 'Não foi possível gerar o PDF.'; try { m = (await r.json()).error || m; } catch { /* sem corpo */ } throw new Error(m); }
      const nome = (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || 'Relatorio-Trafego-Pago.pdf';
      const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('PDF baixado');
    } catch (e) { toast(e.message, 'warn'); erro(e.message); }
    b.disabled = false; b.textContent = rot;
  };
};
/** Redesenha só esta aba (os dados já estão em cache por 60 s, então não consulta a Meta de novo). */
const cfgRecarregaRel = () => go('tfrelatorios');
