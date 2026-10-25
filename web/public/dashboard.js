
/* Histórico de seguidores a partir de 11/10/2026. Nenhuma contagem é estimada. */
const DB_SEGUIDORES_INICIO='2026-10-11';
const DB_SEG_MODOS=[['semana','Semana'],['mes','Mês'],['ano','Ano']];
let DB_SEG_MODO='semana';
function dbSegDados(d) {
 const serie=(d?.seguidores?.serie||[]).filter(p=>p.dia>=DB_SEGUIDORES_INICIO&&Number.isFinite(Number(p.seguidores)))
   .map(p=>({dia:p.dia,valor:Number(p.seguidores)})).sort((a,b)=>a.dia.localeCompare(b.dia));
 return [...new Map(serie.map(p=>[p.dia,p])).values()].sort((a,b)=>a.dia.localeCompare(b.dia));
}
function dbSegAgrupar(serie,modo) {
 const chave=dia=>{
   if(modo==='ano')return dia.slice(0,4);
   if(modo==='mes')return dia.slice(0,7);
   const d=new Date(dia+'T12:00:00Z'),w=d.getUTCDay();d.setUTCDate(d.getUTCDate()-w);
   return d.toISOString().slice(0,10);
 };
 const map=new Map();
 serie.forEach(p=>{const k=chave(p.dia);if(!map.has(k))map.set(k,[]);map.get(k).push(p)});
 return [...map.entries()].map(([k,val])=>{
   const primeiro=val[0],ultimo=val[val.length-1];
   const rotulo=modo==='ano'?k:modo==='mes'?k.slice(5,7)+'/'+k.slice(0,4):fmtDate(k)+' a '+fmtDate((()=>{const d=new Date(k+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+6);return d.toISOString().slice(0,10)})());
   return {rotulo,primeiro,ultimo,variacao:val.length>1?ultimo.valor-primeiro.valor:null,amostras:val.length};
 });
}
function dbSegTabela(serie,modo) {
 const linhas=dbSegAgrupar(serie,modo);
 return linhas.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Período</th><th>Primeiro registro</th><th>Último registro</th><th class="num">Seguidores</th><th class="num">Variação*</th></tr></thead><tbody>${linhas.map(r=>`<tr><td>${esc(r.rotulo)}</td><td>${fmtDate(r.primeiro.dia)}</td><td>${fmtDate(r.ultimo.dia)}</td><td class="num"><b>${fmtN(r.ultimo.valor)}</b></td><td class="num">${r.variacao===null?'sem base':(r.variacao>0?'+':'')+fmtN(r.variacao)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty compact">Ainda não existem registros de seguidores desde 11/10/2026 para este perfil.</div>';
}
function kpiTrafego(rot, valor, v, bomSubir = true) { return `<div class="kpi"><small>${rot}</small><strong>${valor}</strong>${v === undefined ? '' : delta(v, { bomSubir })}</div>`; }
const kpiOrg = (rot, valor, nota = '') => `<div class="kpi"><small>${rot}</small><strong>${valor === null || valor === undefined ? '—' : fmtN(valor)}</strong>${nota ? `<i class="kd flat">${nota}</i>` : ''}</div>`;

PAGINAS.hoje = async function () {
  const d = await api('/dashboard/resumo?' + Filtros.query());
  const ig = d.instagram, t = d.trafego;
  const filtroPerfil = Filtros.get().perfil;
  const hoje = hojeBR();
  const seguidores = await api('/instagram/visao?'+new URLSearchParams({de:DB_SEGUIDORES_INICIO,ate:hoje,...(filtroPerfil?{perfil:filtroPerfil}:{})}).toString()).catch(()=>null);
  const serieSeguidores=dbSegDados(seguidores);

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
    <section class="card" aria-labelledby="dbSeg"><div class="db-tit"><h2 id="dbSeg">Evolução de seguidores</h2><small>Histórico desde 11/10/2026 · ${esc(filtroPerfil || 'Todos os perfis')}</small></div>
      <div class="pills" role="group" aria-label="Agrupar seguidores por período">${DB_SEG_MODOS.map(([k,rot])=>`<button type="button" class="pill ${DB_SEG_MODO===k?'on':''}" data-db-seg="${k}">${rot}</button>`).join('')}</div>
      <div id="dbSegTabela">${dbSegTabela(serieSeguidores,DB_SEG_MODO)}</div>
      <p class="kpi-note">*Variação entre o primeiro e o último registro disponível em cada período. Com apenas uma medição, aparece “sem base”. Os dados anteriores à primeira sincronização não são reconstruídos. Fonte: histórico do Instagram ${seguidores?.origem?origem(seguidores.origem):'(sincronização indisponível)'}.</p>
    </section>
    <div class="db-duas">
      <section class="card" aria-labelledby="dbMel"><div class="db-tit"><h2 id="dbMel">Destaque do período</h2>${origem(ig.origem)}</div>${melhor}</section>
      <section class="card" aria-labelledby="dbIns"><div class="db-tit"><h2 id="dbIns">Análises e oportunidades</h2><small>até 3, calculados dos seus dados</small></div>${insights}</section>
    </div>
    <section class="card" aria-labelledby="dbAl"><div class="db-tit"><h2 id="dbAl">Situação das integrações e pontos de atenção</h2></div>${alertas}</section>
    
  </div>`;
  bindGoButtons();
  $('[data-db-seg]').forEach(b=>b.onclick=()=>{
    DB_SEG_MODO=b.dataset.dbSeg;
    $('[data-db-seg]').forEach(x=>x.classList.toggle('on',x.dataset.dbSeg===DB_SEG_MODO));
    $('#dbSegTabela').innerHTML=dbSegTabela(serieSeguidores,DB_SEG_MODO);
  });
};
