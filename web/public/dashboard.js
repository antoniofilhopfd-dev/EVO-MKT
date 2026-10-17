/* Dashboard: o que importa hoje, com dados reais. Não é um gerenciador de tarefas: cada linha leva ao módulo dono do registro. */
async function renderToday(){
 let d;
 try{d=await api('/dashboard/resumo')}catch(e){$('#content').innerHTML=`<div class="empty-rich"><strong>Não foi possível carregar o painel</strong><p>${esc(e.message)}</p></div>`;return}
 const fd=iso=>String(iso||'').split('-').reverse().slice(0,2).join('/');
 const hojeTxt=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date(d.hoje+'T12:00:00'));
 const nome=String(d.eu.nome||'').split(' ')[0];
 const s=d.solicitacoes;
 const kpi=(l,v,etapa,cls='')=>`<button type="button" class="db-kpi ${cls}" data-db-sol="${etapa}"><b>${v}</b><span>${l}</span></button>`;
 const vazio=t=>`<p class="db-vazio">${esc(t)}</p>`;
 const lista=(itens,fn,vz)=>itens.length?`<ul class="db-lista">${itens.map(fn).join('')}</ul>`:vazio(vz);
 $('#content').innerHTML=`<div class="today-banner db-topo"><div><small>${esc(hojeTxt)}</small><h1>Olá, ${esc(nome)}</h1><p>O que está em andamento no marketing e o que vem pela frente.</p></div><button class="btn" id="dbNova">+ Nova solicitação</button></div>
  <div class="db-kpis" role="group" aria-label="Solicitações">${kpi('Pendentes',s.pendentes,'PENDENTE')}${kpi('Em andamento',s.emAndamento,'EM_ANDAMENTO')}${kpi('Em aprovação',s.emAprovacao,'EM_APROVACAO')}${kpi('Atrasadas',s.atrasadas,'ATRASADAS',s.atrasadas?'alerta':'')}</div>
  ${s.listaAtrasadas.length?`<section class="db-bloco alerta"><h2>Solicitações atrasadas</h2>${lista(s.listaAtrasadas,x=>`<li><button type="button" data-db-abrir-sol="${attr(x.id)}"><b>${esc(x.titulo)}</b><small>${esc(x.responsavel||'sem responsável')} · prazo ${esc(fd(x.prazo))}</small></button></li>`,'')}</section>`:''}
  <div class="db-grade">
   <section class="db-bloco"><h2>Próximos compromissos</h2><p class="db-sub">Próximos 7 dias · Calendário de Marketing</p>${lista(d.compromissos,x=>`<li><button type="button" data-db-ir="calendario"><b>${esc(x.titulo)}</b><small>${esc(fd(x.data))}${x.hora?' · '+esc(x.hora):''} · ${esc(x.tipo)}</small></button></li>`,'Nenhum compromisso nos próximos 7 dias.')}</section>
   <section class="db-bloco"><h2>Próximos eventos escolares</h2><p class="db-sub">Calendário Escolar</p>${lista(d.eventosEscolares,x=>`<li><button type="button" data-db-ir="calescolar"><b>${esc(x.titulo)}</b><small>${esc(fd(x.data))}${x.fim&&x.fim!==x.data?' a '+esc(fd(x.fim)):''}${x.horaInicio?' · '+esc(x.horaInicio):''}${x.local?' · '+esc(x.local):''}</small></button></li>`,'Nenhum evento escolar cadastrado à frente.')}</section>
   <section class="db-bloco"><h2>Ações planejadas para a semana</h2><p class="db-sub">${esc(fd(d.semana.ini))} a ${esc(fd(d.semana.fim))} · Planejamento</p>${lista(d.acoesDaSemana,x=>`<li><button type="button" data-db-acao="${attr(x.id)}"><b>${esc(x.titulo)}</b><small>${esc(fd(x.dataInicio))}${x.dataFim!==x.dataInicio?' a '+esc(fd(x.dataFim)):''} · ${x.situacao==='EXECUCAO'?'Em execução':'Planejado'}${x.responsavel?' · '+esc(x.responsavel):''}</small></button></li>`,'Nenhuma ação planejada para esta semana.')}</section>
   <section class="db-bloco"><h2>Entregas recentes</h2><p class="db-sub">Solicitações concluídas nos últimos 14 dias</p>${lista(d.entregasRecentes,x=>`<li><button type="button" data-db-abrir-sol="${attr(x.id)}"><b>${esc(x.titulo)}</b><small>${esc(fd(x.quando))}${x.responsavel?' · '+esc(x.responsavel):''}</small></button></li>`,'Nenhuma entrega concluída nos últimos 14 dias.')}</section>
  </div>`;
 $('#dbNova').onclick=()=>go('solicitacoes').then(()=>slNova());
 $$('[data-db-sol]').forEach(b=>b.onclick=()=>{const e=b.dataset.dbSol;sl.f={q:'',resp:'',seg:'',etapa:e==='ATRASADAS'?'':e,prazo:e==='ATRASADAS'?'atrasadas':''};go('solicitacoes')});
 $$('[data-db-ir]').forEach(b=>b.onclick=()=>go(b.dataset.dbIr));
 $$('[data-db-abrir-sol]').forEach(b=>b.onclick=()=>slAbrirExterno(b.dataset.dbAbrirSol,()=>renderToday()));
 $$('[data-db-acao]').forEach(b=>b.onclick=()=>plAbrirPorId(b.dataset.dbAcao,()=>renderToday()));
}
