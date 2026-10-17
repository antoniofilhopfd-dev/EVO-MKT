/* Dashboard: o que importa agora, com dados reais. Não é um gerenciador de tarefas: cada linha leva ao módulo dono do registro. */
async function renderToday(){
 let d;
 try{d=await api('/dashboard/resumo')}catch(e){$('#content').innerHTML=`<div class="empty-rich"><strong>Não foi possível carregar o painel</strong><p>${esc(e.message)}</p></div>`;return}
 const fd=iso=>String(iso||'').split('-').reverse().slice(0,2).join('/');
 const hojeTxt=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date(d.hoje+'T12:00:00'));
 const nome=String(d.eu.nome||'').split(' ')[0];
 const s=d.solicitacoes;
 const stat=(l,v,etapa,cls='')=>`<button type="button" class="db-stat ${cls}" data-db-sol="${etapa}"><b>${v}</b><span>${l}</span></button>`;
 // próximos dias: compromissos, publicações e eventos escolares numa lista só, em ordem de data
 const prox=[
  ...d.compromissos.map(x=>({data:x.data,hora:x.hora,titulo:x.titulo,tag:x.tipo||'Compromisso',cls:'c',ir:'calendario'})),
  ...(d.publicacoes||[]).map(x=>({data:x.data,hora:x.hora,titulo:x.titulo,tag:'Publicação'+(x.canal?' · '+x.canal:''),cls:'p',ir:'conteudos'})),
  ...d.eventosEscolares.map(x=>({data:x.data,hora:x.horaInicio||'',titulo:x.titulo,tag:'Evento escolar',cls:'e',ir:'calendario'})),
 ].sort((a,b)=>(a.data+(a.hora||'')).localeCompare(b.data+(b.hora||''))).slice(0,9);
 const atras=s.listaAtrasadas.slice(0,3);
 $('#content').innerHTML=`<div class="db-topo"><div><small>${esc(hojeTxt)}</small><h1>Olá, ${esc(nome)}</h1></div><button class="btn" id="dbNova">+ Nova solicitação</button></div>
  <div class="db-stats" role="group" aria-label="Solicitações">${stat('Pendentes',s.pendentes,'PENDENTE')}${stat('Em andamento',s.emAndamento,'EM_ANDAMENTO')}${stat('Em aprovação',s.emAprovacao,'EM_APROVACAO')}${stat('Atrasadas',s.atrasadas,'ATRASADAS',s.atrasadas?'alerta':'')}</div>
  ${atras.length?`<div class="db-alerta" role="alert"><b>Atenção</b>${atras.map(x=>`<button type="button" data-db-abrir-sol="${attr(x.id)}">${esc(x.titulo)} <small>${esc(x.responsavel||'sem responsável')} · prazo ${esc(fd(x.prazo))}</small></button>`).join('')}</div>`:''}
  <div class="db-grade">
   <section class="db-bloco"><h2>Próximos dias</h2>${prox.length?`<ul class="db-lista">${prox.map(x=>`<li><button type="button" data-db-ir="${x.ir}"><span class="db-dia">${esc(fd(x.data))}${x.hora?`<i>${esc(x.hora)}</i>`:''}</span><span class="db-tit"><b>${esc(x.titulo)}</b><small class="db-tag ${x.cls}">${esc(x.tag)}</small></span></button></li>`).join('')}</ul>`:'<p class="db-vazio">Nada marcado para os próximos 7 dias.</p>'}</section>
   <section class="db-bloco"><h2>Ações da semana</h2>${d.acoesDaSemana.length?`<ul class="db-lista">${d.acoesDaSemana.map(x=>`<li><button type="button" data-db-acao="${attr(x.id)}"><span class="db-dia">${esc(fd(x.dataInicio))}</span><span class="db-tit"><b>${esc(x.titulo)}</b><small>${esc(x.responsavel||'sem responsável')}</small></span></button></li>`).join('')}</ul>`:'<p class="db-vazio">Nenhuma ação planejada para esta semana.</p>'}</section>
  </div>`;
 $('#dbNova').onclick=()=>go('solicitacoes').then(()=>slNova());
 $$('[data-db-sol]').forEach(b=>b.onclick=()=>{const e=b.dataset.dbSol;sl.f={q:'',resp:'',seg:'',etapa:e==='ATRASADAS'?'':e,prazo:e==='ATRASADAS'?'atrasadas':''};go('solicitacoes')});
 $$('[data-db-ir]').forEach(b=>b.onclick=()=>go(b.dataset.dbIr));
 $$('[data-db-abrir-sol]').forEach(b=>b.onclick=()=>slAbrirExterno(b.dataset.dbAbrirSol,()=>renderToday()));
 $$('[data-db-acao]').forEach(b=>b.onclick=()=>plAbrirPorId(b.dataset.dbAcao,()=>renderToday()));
}
