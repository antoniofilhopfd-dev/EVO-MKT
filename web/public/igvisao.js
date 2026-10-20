/* Instagram › Visão geral: o resumo do perfil num relance (seguidores, publicações, interações, alcance, melhor publicação, programadas e andamento da produção).
   Usa os dados já sincronizados do Instagram e os conteúdos do Estúdio; dado inexistente aparece como "—", nunca como zero. Cada bloco abre a tela correspondente. */
MODULES.igvisao={label:'Instagram — Visão geral',icon:'◎',group:'Instagram',tone:'orange',desc:'Resumo do perfil e da produção de conteúdo.'};
const igvPer=Object.assign({p:'30',de:'',ate:''},pref('instagram.visao.periodo',null)||{});
TP_PAGINAS.igvisao=async function(){
  state.module=null;
  $('#content').innerHTML='<div class="loading"><span></span><b>Carregando a visão geral…</b></div>';
  let d,conts=[];
  if(!igContas.length)await igCarregaContas();
  [igvPer.de,igvPer.ate]=PeriodoPicker.intervalo(igvPer.p,igvPer.de,igvPer.ate);
  try{d=await api(`/dashboard/resumo?de=${igvPer.de}&ate=${igvPer.ate}`+igQ('&'))}catch(e){$('#content').innerHTML=`<div class="empty-rich"><strong>Não foi possível carregar a visão geral</strong><p>${esc(e.message)}</p></div>`;return}
  try{conts=((await getRows('conteudos')).rows||[]).filter(r=>igContas.length<2||igContaDoPost(r)===igConta)}catch{conts=[]}
  if(state.page!=='igvisao')return;
  const ig=d.instagram;
  const eng=ig.interacoes!==null&&ig.alcance?(ig.interacoes/ig.alcance)*100:null;
  const porStatus=conts.reduce((m,c)=>{const s=String(c.status||'').toUpperCase();const k=/PUBLICAD/.test(s)?'pub':/PROGRAMAD|AGENDAD/.test(s)?'prog':/APROVAD/.test(s)?'apr':/REVIS/.test(s)?'rev':/ARQUIV/.test(s)?'arq':'prod';m[k]=(m[k]||0)+1;return m},{});
  const sync=ig.ultimaSync?new Date(ig.ultimaSync).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):null;
  const andamento=[['prod','Em produção','studio'],['rev','Em revisão','aprovacoes'],['apr','Aprovados','conteudos'],['prog','Programados','editorial'],['pub','Publicados','conteudos']];
  $('#content').innerHTML=`<div class="db-topo"><div><small>INSTAGRAM${igContas.length>1?' · @'+esc((igContas.find(c=>c.ig===igConta)||{}).usuario||''):''}</small><h1>Visão geral</h1></div>
    <div class="db-acoes"><label class="db-per">Período${PeriodoPicker.selectHtml('igvPer',igvPer.p)}<small class="db-per-t">${esc(dbFd(igvPer.de))} a ${esc(dbFd(igvPer.ate))}</small></label>
    <button class="softbtn" data-ig-ir="editorial">Planejamento editorial</button><button class="softbtn" data-ig-ir="instagram">Análises</button><button class="btn" data-ig-ir="studio">Nova publicação</button></div></div>
   <div class="kpi-note" style="margin:-6px 0 12px">${ig.conectado?`Instagram conectado${sync?` · última atualização em ${esc(sync)}`:''}`:'Instagram não conectado — conecte em Configurações › Integrações para ver os números.'}</div>
   ${ig.conectado||ig.seguidores!==null?`<div class="db-cards">
     ${dbCard('Seguidores',dbN(ig.seguidores),ig.variacaoSeguidores===null?'':`<small class="db-var neutro">${ig.variacaoSeguidores>=0?'▲':'▼'} ${dbN(Math.abs(ig.variacaoSeguidores))} no período</small>`,EvoCharts.spark((ig.serieSeguidores||[]).map(x=>x.seguidores)),'instagram')}
     ${ig.visualizacoes!=null?dbCard('Visualizações',dbN(ig.visualizacoes),'<small class="db-var">das publicações com dado da Meta</small>','','igposts'):''}
     ${ig.seguidoresGerados!=null?dbCard('Seguidores gerados','+'+dbN(ig.seguidoresGerados),'<small class="db-var">novos seguidores vindos das publicações</small>','','igranking'):''}
     ${dbCard('Publicações',dbN(ig.publicacoes),'<small class="db-var">no período</small>','','conteudos')}
     ${dbCard('Interações',dbN(ig.interacoes),'<small class="db-var">curtidas, comentários e salvamentos</small>','','instagram')}
     ${dbCard('Alcance',dbN(ig.alcance),'<small class="db-var">das publicações com dado da Meta</small>','','instagram')}
     ${dbCard('Engajamento',eng===null?'—':eng.toFixed(1).replace('.',',')+'%','<small class="db-var">interações ÷ alcance das publicações</small>','','instagram')}</div>
    <div class="db-dois"><div class="db-bloco"><h3>Seguidores</h3><div id="igvGr"></div></div>
     <div class="db-bloco"><h3>Melhor publicação</h3>${ig.melhor?`<div class="db-melhor">${ig.melhor.miniatura?`<img alt="" loading="lazy" referrerpolicy="no-referrer" src="${attr(ig.melhor.miniatura)}">`:''}<div><b>${esc(ig.melhor.legenda||'(sem legenda)')}</b><small>${esc(ig.melhor.tipo||'')} · ${dbN(ig.melhor.interacoes)} interações${ig.melhor.visualizacoes!=null?' · '+dbN(ig.melhor.visualizacoes)+' visualizações':''}</small>${/^https:\/\//.test(ig.melhor.link||'')?`<a href="${attr(ig.melhor.link)}" target="_blank" rel="noopener">Abrir no Instagram ›</a>`:''}</div></div>`:'<div class="db-vazio-g">Sem publicações sincronizadas neste período.</div>'}${ig.maisSeguidores?`<h3 style="margin-top:14px">Gerou mais seguidores</h3><div class="db-melhor">${ig.maisSeguidores.miniatura?`<img alt="" loading="lazy" referrerpolicy="no-referrer" src="${attr(ig.maisSeguidores.miniatura)}">`:''}<div><b>${esc(ig.maisSeguidores.legenda||'(sem legenda)')}</b><small>+${dbN(ig.maisSeguidores.seguidores)} seguidores · ${esc(ig.maisSeguidores.tipo||'')}</small>${/^https:\/\//.test(ig.maisSeguidores.link||'')?`<a href="${attr(ig.maisSeguidores.link)}" target="_blank" rel="noopener">Abrir no Instagram ›</a>`:''}</div></div>`:''}</div></div>`:`<div class="db-vazio-g">Sem dados do Instagram ainda.</div>`}
   <div class="db-dois"><div class="db-bloco"><h3>Andamento da produção</h3><ul class="db-lista">${andamento.map(([k,r,ir])=>`<li><button type="button" data-ig-ir="${ir}"><span class="db-dia">${dbN(porStatus[k]||0)}</span><span class="db-tit">${esc(r)}</span></button></li>`).join('')}</ul></div>
    <div class="db-bloco"><h3>Próximas publicações</h3>${ig.programadas.length?`<ul class="db-lista">${ig.programadas.map(p=>`<li><button type="button" data-ig-ir="editorial"><span class="db-dia">${esc(dbFd(p.quando.slice(0,10)))}</span><span class="db-tit">${esc(p.titulo||'(sem título)')}<small>${esc([p.formato,p.status].filter(Boolean).join(' · '))}</small></span></button></li>`).join('')}</ul>`:'<div class="db-vazio-g">Nada programado. Crie uma publicação no Estúdio.</div>'}</div></div>`;
  PeriodoPicker.ligar('igvPer',igvPer,()=>{setPref('instagram.visao.periodo',{p:igvPer.p,de:igvPer.de,ate:igvPer.ate});TP_PAGINAS.igvisao()});
  $$('[data-ig-ir]').forEach(b=>b.onclick=()=>go(b.dataset.igIr));
  if($('#igvGr')&&(ig.serieSeguidores||[]).length<2)$('#igvGr').innerHTML='<div class="db-vazio-g">A evolução aparece quando houver ao menos 2 dias de dados sincronizados.</div>';
  else if($('#igvGr'))EvoCharts.linha($('#igvGr'),{dados:(ig.serieSeguidores||[]).map(x=>({x:x.dia,seg:x.seguidores})),series:[{k:'seg',nome:'Seguidores',fmt:v=>dbN(v)}],zero:false,altura:200,rotuloAcessivel:'Evolução de seguidores'});
};
