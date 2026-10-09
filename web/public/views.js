/* EVO MKT — visões próprias: Eventos (linha do tempo) e Campanhas (cartões). */
function daysFrom(dateStr){if(!dateStr)return null;const a=new Date(String(dateStr).slice(0,10)+'T12:00:00'),b=new Date(today()+'T12:00:00');return Math.round((a-b)/86400000)}
function relDays(n){if(n===null)return '';if(n===0)return 'hoje';if(n===1)return 'amanhã';if(n===-1)return 'ontem';return n>0?`em ${n} dias`:`há ${-n} dias`}
function eventPhaseClass(s){s=String(s||'').toUpperCase();if(/PÓS|POS|ENTREGA|CONCLU/.test(s))return 'post';if(/DURANTE|COBERTURA/.test(s))return 'live';return 'pre'}
function renderTimeline(rows){
  const dated=rows.map(r=>({r,d:String(r.dataInicio||r.prazo||'').slice(0,10)})).filter(x=>x.d).sort((a,b)=>a.d.localeCompare(b.d));
  const undated=rows.filter(r=>!(r.dataInicio||r.prazo));
  if(!dated.length&&!undated.length)return emptyState('eventos');
  const t=today(),upcoming=dated.filter(x=>x.d>=t),past=dated.filter(x=>x.d<t).reverse();
  const month=d=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(d+'T12:00:00'));
  const item=({r,d})=>{const n=daysFrom(d),dt=new Date(d+'T12:00:00');return `<li class="tl-item ${eventPhaseClass(r.status)} ${n<0?'past':''}"><div class="tl-date"><b>${String(dt.getDate()).padStart(2,'0')}</b><span>${new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(dt).replace('.','')}</span></div><i class="tl-dot"></i><article class="tl-card"><div class="tl-head"><button class="linkbtn edit-row" data-id="${attr(r.id)}">${esc(r.titulo||'(sem título)')}</button><span class="status-badge ${statusClass(r.status)}">${esc(r.status||'—')}</span></div><p>${r.local?`⌖ ${esc(r.local)} · `:''}${esc(r.responsavel||'Sem responsável')}${r.segmento?` · ${esc(r.segmento)}`:''}</p><footer><em>${relDays(n)}</em>${(r.foto||r.video||r.stories||r.feed||r.reels||r.checklistCobertura)?'<span>📷 cobertura</span>':'<span class="tl-warn">sem cobertura definida</span>'}</footer></article></li>`};
  const group=(list)=>{let out='',cur='';list.forEach(x=>{const m=month(x.d);if(m!==cur){if(cur)out+='</ul>';out+=`<h4 class="tl-month">${esc(m)}</h4><ul class="timeline">`;cur=m}out+=item(x)});return out+(cur?'</ul>':'')};
  return `<div class="tl-wrap">${upcoming.length?`<div class="tl-section"><h3>Próximos eventos</h3>${group(upcoming)}</div>`:'<div class="soft-note">Nenhum evento futuro cadastrado.</div>'}${past.length?`<details class="tl-section tl-past"><summary>Eventos passados (${past.length})</summary>${group(past)}</details>`:''}${undated.length?`<div class="tl-section"><h3>Sem data definida</h3><ul class="timeline">${undated.map(r=>`<li class="tl-item pre"><div class="tl-date"><b>—</b></div><i class="tl-dot"></i><article class="tl-card"><div class="tl-head"><button class="linkbtn edit-row" data-id="${attr(r.id)}">${esc(r.titulo||'(sem título)')}</button></div><p>Defina a data para entrar no cronograma.</p></article></li>`).join('')}</ul></div>`:''}</div>`;
}
function renderCampaignCards(rows){
  if(!rows.length)return emptyState('campanhas');
  const card=r=>{const a=String(r.dataInicio||'').slice(0,10),z=String(r.prazo||r.periodoFim||'').slice(0,10);let pct=null;if(a&&z){const A=new Date(a+'T12:00:00'),Z=new Date(z+'T12:00:00'),N=new Date(today()+'T12:00:00');pct=Math.max(0,Math.min(100,Math.round((N-A)/Math.max(1,Z-A)*100)))}
    const left=z?daysFrom(z):null,done=/CONCLU|ENCERR/i.test(r.status||'');
    return `<article class="camp-card ${statusClass(r.status)}"><div class="camp-top"><span class="status-badge ${statusClass(r.status)}">${esc(r.status||'—')}</span><small>${esc(r.segmento||'Geral')}</small></div><h4><button class="linkbtn edit-row" data-id="${attr(r.id)}">${esc(r.titulo||'(sem título)')}</button></h4><p class="camp-obj">${esc(r.objetivo||r.descricao||'Sem objetivo definido')}</p><div class="camp-period"><div class="camp-bar"><i style="width:${done?100:(pct??0)}%"></i></div><small>${a?fmtDate(a):'—'} → ${z?fmtDate(z):'—'}${left!==null&&!done?` · ${left>=0?`faltam ${left} dia(s)`:`encerrou há ${-left} dia(s)`}`:''}</small></div><dl class="camp-stats"><div><dt>Orçamento</dt><dd>${r.orcamento?esc(money(r.orcamento)):'—'}</dd></div><div><dt>Conteúdos</dt><dd><span data-camp-count="${attr(r.id)}">…</span></dd></div><div><dt>Responsável</dt><dd>${esc(r.responsavel||'—')}</dd></div></dl></article>`};
  return `<div class="camp-grid">${rows.map(card).join('')}</div>`;
}
async function fillCampaignCounts(){
  try{const c=(await getRows('conteudos')).rows||[];document.querySelectorAll('[data-camp-count]').forEach(el=>{const id=el.dataset.campCount;el.textContent=c.filter(x=>x.campanhaId===id).length})}catch{document.querySelectorAll('[data-camp-count]').forEach(el=>el.textContent='—')}
}
