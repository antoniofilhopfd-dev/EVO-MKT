/* Dashboard: o que o Marketing precisa decidir hoje. Orgânico (Instagram) e pago (Tráfego) aparecem separados, cada um com a sua origem. */
const DB_CARTOES = [
  ['planejadas', 'Planejadas', 'Publicações com data no período'], ['aprovadas', 'Aprovadas', 'Prontas para agendar'], ['agendadas', 'Agendadas', 'Com data e hora marcadas'],
  ['publicadas', 'Publicadas', 'Já no ar no período'], ['aguardandoRevisao', 'Aguardando revisão', 'Esperando alguém aprovar'],
  ['semArte', 'Sem arte final', 'Ainda sem a arte pronta', true], ['semLegenda', 'Sem legenda', 'Falta escrever a legenda', true], ['semData', 'Sem data', 'Falta marcar quando publicar', true],
];
const ESTADO_ROTULO = { IDEIA: 'Ideia', RASCUNHO: 'Rascunho', 'EM PRODUÇÃO': 'Em produção', 'EM REVISÃO': 'Em revisão', APROVADO: 'Aprovado', AGENDADO: 'Agendado', PUBLICADO: 'Publicado', ARQUIVADO: 'Arquivado' };
const estadoClasse = s => ({ APROVADO: 'ok', AGENDADO: 'info', PUBLICADO: 'ok', 'EM REVISÃO': 'warn', ARQUIVADO: 'mute' }[s] || '');

/** Abre Instagram › Conteúdos já filtrado pelos registros que um cartão contou. */
function abrirRegistros(ids, titulo) { window.IG_FOCO = { ids, titulo }; go('igconteudos'); }

function kpiTrafego(rot, valor, v, bomSubir = true) { return `<div class="kpi"><small>${rot}</small><strong>${valor}</strong>${v === undefined ? '' : delta(v, { bomSubir })}</div>`; }
const kpiOrg = (rot, valor, nota = '') => `<div class="kpi"><small>${rot}</small><strong>${valor === null || valor === undefined ? '—' : fmtN(valor)}</strong>${nota ? `<i class="kd flat">${nota}</i>` : ''}</div>`;

PAGINAS.hoje = async function () {
  const d = await api('/dashboard/resumo?' + Filtros.query());
  const p = d.publicacoes, ig = d.instagram, t = d.trafego;
  
  const prox = d.proximas.length ? `<div class="tablewrap"><table class="datatable db-prox"><thead><tr><th>Quando</th><th>Perfil</th><th>Segmento</th><th>Formato</th><th>Título</th><th>Estado</th><th>Responsável</th><th>O que falta</th></tr></thead><tbody>${d.proximas.map(r => `<tr data-pub="${attr(r.id)}" tabindex="0" role="button" aria-label="Abrir ${attr(r.titulo)}"><td>${esc(fmtDateTime(r.quando))}</td><td>${esc(r.perfil || '—')}</td><td>${esc(r.segmento || '—')}</td><td>${esc(r.formato || '—')}</td><td class="titlecell">${esc(r.titulo)}</td><td><span class="badge ${estadoClasse(r.status)}">${esc(ESTADO_ROTULO[r.status] || r.status)}</span></td><td>${esc(r.responsavel || '—')}</td><td>${r.faltas.length ? r.faltas.map(f => `<span class="falta">${esc(f)}</span>`).join('') : '<span class="ok-txt">Tudo pronto</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty-rich"><strong>Nenhuma publicação prevista</strong><p>Quando houver publicações com data a partir de hoje, elas aparecem aqui.</p><button class="btn" data-nova>Nova publicação</button></div>';

  let orgHtml;
  if (!ig.conectado && ig.publicacoes === 0) orgHtml = `<div class="empty-rich"><strong>Instagram não conectado</strong><p>Conecte o perfil em Configurações › Instagram para ver o desempenho orgânico.</p><button class="btn soft" data-go="configuracoes">Abrir Configurações</button></div>`;
  else orgHtml = `<div class="kpis kpis4">${kpiOrg('Publicações no período', ig.publicacoes)}${kpiOrg('Interações', ig.interacoes)}${kpiOrg('Alcance', ig.alcance, ig.alcance === null ? 'a Meta ainda não informou' : '')}${kpiOrg('Visualizações', ig.visualizacoes)}</div>${ig.somenteVinculadas ? '<p class="kpi-note">Com segmento ou campanha editorial escolhidos, só contam as publicações ligadas a uma publicação do EVO MKT.</p>' : ''}`;

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
    <section class="card" aria-labelledby="dbProx"><div class="db-tit"><h2 id="dbProx">Próximas publicações</h2><button class="btn soft" data-go="igconteudos">Ver conteúdos</button></div>${prox}</section>
    <div class="db-duas">
      <section class="card" aria-labelledby="dbOrg"><div class="db-tit"><h2 id="dbOrg">Instagram · orgânico</h2>${origem(ig.origem)}<button class="btn soft" data-go="igvisao">Ver Instagram</button></div>${orgHtml}</section>
      <section class="card" aria-labelledby="dbTr"><div class="db-tit"><h2 id="dbTr">Tráfego Pago</h2>${origem(t.origem)}<button class="btn soft" data-go="trafego">Ver Tráfego Pago</button></div>${trHtml}${t.semEfeito?.length ? `<p class="kpi-note">Os filtros de ${t.semEfeito.map(k => ({ perfil: 'perfil', segmento: 'segmento', formato: 'formato', campanha: 'campanha editorial' }[k])).join(', ')} não existem na Meta Ads e não se aplicam a este bloco.</p>` : ''}</section>
    </div>
    <div class="db-duas">
      <section class="card" aria-labelledby="dbMel"><div class="db-tit"><h2 id="dbMel">Melhor conteúdo do período</h2>${origem(ig.origem)}</div>${melhor}</section>
      <section class="card" aria-labelledby="dbIns"><div class="db-tit"><h2 id="dbIns">Insights</h2><small>até 3, calculados dos seus dados</small></div>${insights}</section>
    </div>
    <section class="card" aria-labelledby="dbAl"><div class="db-tit"><h2 id="dbAl">Integrações</h2></div>${alertas}</section>
    <section aria-label="Atalhos"><div class="db-atalhos"><button class="btn" data-nova>Nova publicação</button><button class="btn soft" data-go="calendario">Calendário escolar</button><button class="btn soft" data-go="igvisao">Instagram</button><button class="btn soft" data-go="trafego">Tráfego Pago</button></div></section>
  </div>`;
  bindGoButtons();
  $$('[data-nova]').forEach(b => { b.onclick = () => novaPublicacao(); });
  $$('[data-pub]').forEach(tr => { const abre = () => editarPublicacao(tr.dataset.pub); tr.onclick = abre; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abre(); } }; });
};
