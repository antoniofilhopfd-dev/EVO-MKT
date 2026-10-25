function kpiTrafego(rot, valor, v, bomSubir = true) { return `<div class="kpi"><small>${rot}</small><strong>${valor}</strong>${v === undefined ? '' : delta(v, { bomSubir })}</div>`; }
const kpiOrg = (rot, valor, nota = '') => `<div class="kpi"><small>${rot}</small><strong>${valor === null || valor === undefined ? '—' : fmtN(valor)}</strong>${nota ? `<i class="kd flat">${nota}</i>` : ''}</div>`;

PAGINAS.hoje = async function () {
  const d = await api('/dashboard/resumo?' + Filtros.query());
  const ig = d.instagram, t = d.trafego;

  let orgHtml;
  if (!ig.conectado && ig.publicacoes === 0) orgHtml = `<div class="empty-rich"><strong>Instagram não conectado</strong><p>Conecte o perfil em Configurações › Instagram para ver o desempenho orgânico.</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>`;
  else orgHtml = `<div class="kpis kpis4">${kpiOrg('Interações', ig.interacoes)}${kpiOrg('Alcance', ig.alcance, ig.alcance === null ? 'a Meta ainda não informou' : '')}${kpiOrg('Visualizações', ig.visualizacoes)}</div>${ig.somenteVinculadas ? '<p class="kpi-note">Com segmento ou campanha editorial escolhidos, só contam as publicações ligadas a uma publicação do EVO MKT.</p>' : ''}`;

  let trHtml;
  if (!t.disponivel) trHtml = `<div class="empty-rich"><strong>Tráfego Pago indisponível</strong><p>${esc(t.motivo || 'Não foi possível ler os anúncios agora.')}</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>`;
  else {
    const a = t.atual, v = t.variacoes;
    trHtml = `<div class="kpis kpis4">${kpiTrafego('Investimento', money(a.investimento), v?.investimento)}${kpiTrafego('Conversas iniciadas', fmtN(a.conversas), v?.conversas)}${kpiTrafego('Custo por conversa', a.custoConversa === null ? '—' : money(a.custoConversa), v?.custoConversa, false)}${kpiTrafego('CTR médio', a.ctr === null ? '—' : pct(a.ctr), v?.ctr)}</div>${(t.avisos || []).map(x => `<p class="kpi-note">${esc(x)}</p>`).join('')}`;
  }
  const mp = ig.melhor;
  const melhor = mp ? `<div class="db-melhor">${mp.miniatura ? `<img src="${attr(mp.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="db-sem-img">Sem imagem</div>'}<div><span class="badge">${esc(mp.formato)}</span><p>${esc(mp.tituloConteudo || mp.legenda || '(sem legenda)')}</p><small>${fmtN(mp.interacoes)} interações${mp.alcance !== null && mp.alcance !== undefined ? ` · alcance ${fmtN(mp.alcance)}` : ''} · ${esc(fmtDate(mp.quando))}</small>${mp.link ? `<a href="${attr(mp.link)}" target="_blank" rel="noopener noreferrer">Ver no Instagram ↗</a>` : ''}</div></div>` : '<div class="empty compact">Nenhuma publicação no período com os filtros escolhidos.</div>';
  const insights = d.insights.length ? d.insights.map(i => `<div class="insight"><b>${esc(i.titulo)}</b><p>${esc(i.texto)}</p><small>Fonte: ${esc(i.fonte)} · amostra: ${esc(i.amostra)}</small><button class="btn soft" data-go="${i.link.pagina}">${esc(i.link.rotulo)}</button></div>`).join('') : '<div class="empty compact">Ainda não há dados suficientes para sugerir algo com segurança. Os insights aparecem quando há amostra mínima.</div>';
  const alertas = d.alertas.length ? d.alertas.map(a => `<div class="alerta-int"><b>${esc(a.nome)}</b><span>${esc(a.msg)}</span><button class="btn soft" data-go="${a.pagina}">Resolver</button></div>`).join('') : '<div class="ok-txt">Todas as integrações estão em ordem.</div>';

  $('#content').innerHTML = `<div class="db">
    <div class="db-duas">
      <section class="card" aria-labelledby="dbOrg"><div class="db-tit"><h2 id="dbOrg">Instagram · orgânico</h2>${origem(ig.origem)}<button class="btn soft" data-go="igvisao">Ver Instagram</button></div>${orgHtml}</section>
      <section class="card" aria-labelledby="dbTr"><div class="db-tit"><h2 id="dbTr">Tráfego Pago</h2>${origem(t.origem)}<button class="btn soft" data-go="trafego">Ver Tráfego Pago</button></div>${trHtml}${t.semEfeito?.length ? `<p class="kpi-note">Os filtros de ${t.semEfeito.map(k => ({ perfil: 'perfil', segmento: 'segmento', formato: 'formato', campanha: 'campanha editorial' }[k])).join(', ')} não existem na Meta Ads e não se aplicam a este bloco.</p>` : ''}</section>
    </div>
    <div class="db-duas">
      <section class="card" aria-labelledby="dbMel"><div class="db-tit"><h2 id="dbMel">Destaque do período</h2>${origem(ig.origem)}</div>${melhor}</section>
      <section class="card" aria-labelledby="dbIns"><div class="db-tit"><h2 id="dbIns">Análises e oportunidades</h2><small>até 3, calculados dos seus dados</small></div>${insights}</section>
    </div>
    <section class="card" aria-labelledby="dbAl"><div class="db-tit"><h2 id="dbAl">Situação das integrações e pontos de atenção</h2></div>${alertas}</section>
    
  </div>`;
  bindGoButtons();
};
