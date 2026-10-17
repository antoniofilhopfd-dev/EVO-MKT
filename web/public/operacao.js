// Etapa 03: linha do tempo de registros e painel de indicadores (dados vindos do servidor: /api/timeline e /api/indicadores).
const urlSegura=u=>/^https?:\/\/[^\s"'<>]+$/i.test(String(u||''))?String(u):'';
const fmtQuando=q=>String(q||'').replace('T',' ').slice(0,16);
async function showTimeline(mod,id){
 let rows=[];try{rows=(await api(`/timeline?module=${encodeURIComponent(mod)}&id=${encodeURIComponent(id)}`)).rows}catch(e){return toast(e.message,'warn')}
 adminOverlay(`<h3>Linha do tempo · ${esc(id)}</h3><ol class="timeline-real">${rows.map(r=>`<li class="tl-${esc(r.tipo)}"><b>${esc(r.texto)}</b><small> ${esc(fmtQuando(r.quando))} · ${esc(r.ator)}</small>${r.motivo?`<div>Motivo: ${esc(r.motivo)}</div>`:''}</li>`).join('')||'<li>Sem eventos registrados.</li>'}</ol><div class="actions"><button class="btn soft" data-close>Fechar</button></div>`);
}
async function listaOrigem(titulo,ids,modulo){
 let rows=[];try{rows=(await getRows(modulo,true)).rows||[]}catch{}
 const por=new Map(rows.map(r=>[r.id,r]));
 const o=adminOverlay(`<h3>${esc(titulo)} · ${ids.length} registro(s)</h3><div class="origem-list">${ids.map(i=>{const r=por.get(i)||{};return `<button class="alert-row" data-open="${esc(i)}"><div><b>${esc(r.titulo||i)}</b><small>${esc(i)} · ${esc(r.status||'')} · ${esc(r.responsavel||'sem responsável')} · ${esc(r.segmento||'')}</small></div></button>`}).join('')||'<div class="empty compact">Nenhum registro.</div>'}</div><div class="actions"><button class="btn soft" data-close>Fechar</button></div>`);
 o.el.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{o.close();go(modulo);setTimeout(()=>{const r=(state.rows||[]).find(x=>x.id===b.dataset.open);if(r)openModal(r)},900)});
}
async function painelIndicadores(){
 if(false)return;
 const host=$('#content');if(!host)return;
 let d;try{d=await api('/indicadores')}catch{return}
 const box=document.createElement('div');box.className='card ind-card';box.id='indPainel';
 const val=i=>i.valor===null?'—':`${i.valor}${i.unidade?(i.unidade==='%'?'%':' '+i.unidade):''}`;
 box.innerHTML=`<div class="card-title"><div><small>INDICADORES · ${esc(d.periodo.de)} a ${esc(d.periodo.ate)}</small><h3>Operação de solicitações</h3></div></div><div class="ind-grid">${d.indicadores.map(i=>`<button class="ind" data-ind="${esc(i.id)}" title="${esc(i.definicao)}"><b>${esc(val(i))}</b><span>${esc(i.titulo)}</span>${i.detalhe?`<small>${esc(i.detalhe)}</small>`:''}</button>`).join('')}</div>
 <details><summary>Carga por pessoa e tempo por etapa</summary><table class="ind-table"><tr><th>Pessoa</th><th>Demandas abertas</th><th>Tarefas abertas</th><th>Em andamento</th><th>Atrasadas</th><th>Bloqueadas</th><th>SLA vencido</th></tr>${d.tabelas.cargaPorPessoa.map(p=>`<tr class="${p.sobrecarga?'sobrecarga':''}"><td>${esc(p.responsavel)}${p.sobrecarga?' ⚠':''}</td><td>${p.demandasAbertas}</td><td>${p.tarefasAbertas}</td><td>${p.tarefasEmAndamento}</td><td>${p.tarefasAtrasadas}</td><td>${p.bloqueadas}</td><td>${p.slaVencido}</td></tr>`).join('')||'<tr><td colspan="7">Sem itens abertos.</td></tr>'}</table><table class="ind-table"><tr><th>Etapa</th><th>Média (dias úteis)</th><th>Ocorrências</th></tr>${d.tabelas.porEtapa.map(e=>`<tr><td>${esc(e.etapa)}</td><td>${e.mediaDiasUteis}</td><td>${e.ocorrencias}</td></tr>`).join('')||'<tr><td colspan="3">Sem histórico no período.</td></tr>'}</table><p class="muted">Carga é situação atual, não medida de desempenho. Regras em docs/INDICADORES_E_SLA.md.</p></details>`;
 host.prepend(box);
 box.querySelectorAll('[data-ind]').forEach(b=>b.onclick=()=>{const i=d.indicadores.find(x=>x.id===b.dataset.ind);listaOrigem(i.titulo+' — '+i.definicao,i.ids,i.modulo)});
}

// Central de notificações (registro em /api/notificacoes)
const NOTIF_ROTULO={complementacao:'Complementação',entrega:'Entrega',concluida:'Concluída',resposta_solicitante:'Resposta do solicitante',responsavel:'Atribuição',integracao_falha:'Falha de integração'};
async function atualizarSinoNotificacoes(){try{const d=await api('/notificacoes');const b=$('#notifyBtn');if(b){b.classList.toggle('has-alerts',d.naoLidas>0);b.title=d.naoLidas?`${d.naoLidas} notificação(ões) não lida(s)`:'Notificações'}return d}catch{return null}}
async function abrirNotificacoes(){
 const d=await atualizarSinoNotificacoes();if(!d)return toast('Não foi possível carregar as notificações.','warn');
 const o=adminOverlay(`<h3>Notificações</h3><div class="origem-list">${d.rows.map(n=>`<div class="notif ${n.lida?'lida':''}"><b>${esc(n.titulo)}</b><small>${esc(NOTIF_ROTULO[n.tipo]||n.tipo)} · ${esc(fmtQuando(n.quando))}${n.destino.startsWith('portal:')?' · enviado ao Portal ('+esc(n.destino.slice(7))+')':''}</small><div>${esc(n.texto)}</div></div>`).join('')||'<div class="empty compact">Nenhuma notificação registrada.</div>'}</div><div class="actions"><button class="btn soft" id="notifAll">Marcar todas como lidas</button><button class="btn soft" id="notifCentral">Abrir Central Operacional</button><button class="btn soft" data-close>Fechar</button></div>`);
 o.el.querySelector('#notifAll').onclick=async()=>{await api('/notificacoes/lida',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({todas:true})});o.close();atualizarSinoNotificacoes()};
 o.el.querySelector('#notifCentral').onclick=()=>{o.close();go(true?'central':'minhaarea')};
}
setTimeout(()=>{if(typeof internalSession!=='undefined'&&internalSession)atualizarSinoNotificacoes()},2500);setInterval(()=>{if(typeof internalSession!=='undefined'&&internalSession)atualizarSinoNotificacoes()},90000);

// Insights (saúde por segmento, datas comemorativas, melhores horários, ranking)
const corSaude=n=>n>=75?'#187549':n>=40?'#9a5b00':'#aa2530';
const fmtData=d=>d.slice(8,10)+'/'+d.slice(5,7);
async function painelInsights(){
 if(false)return;const host=$('#content');if(!host)return;
 let d;try{d=await api('/insights')}catch{return}
 const box=document.createElement('div');box.className='dashboard-grid ins-grid';box.id='insPainel';
 box.innerHTML=`<div class="card"><div class="card-title"><div><small>ÚLTIMOS 90 DIAS</small><h3>Saúde por segmento</h3></div></div>${d.saude.map(s=>`<button class="saude" data-seg="${esc(s.segmento)}"><span>${esc(s.segmento)}</span><div><i style="width:${s.score}%;background:${corSaude(s.score)}"></i></div><b style="color:${corSaude(s.score)}">${s.score}</b><small>${s.sinais.length?esc(s.sinais.join(' · ')):'Sem alertas'} · ${s.abertas} aberta(s)</small></button>`).join('')||'<div class="empty compact">Sem demandas para avaliar.</div>'}<p class="muted">Nota 0–100 calculada de SLA vencido, devoluções, reaberturas e avaliação.</p></div>
 <div class="card"><div class="card-title"><div><small>PRÓXIMOS 90 DIAS</small><h3>Datas para planejar</h3></div></div>${d.datas.slice(0,8).map(x=>`<div class="data-row"><b>${fmtData(x.data)}</b><div><span>${esc(x.titulo)}</span><small>${esc(x.tema)} · faltam ${x.faltam} dia(s)${x.planejarAte<=today()?' · <b>planejar agora</b>':' · planejar até '+fmtData(x.planejarAte)}</small></div><button class="softbtn" data-ideia="${esc(x.titulo)}|${esc(x.data)}">+ Ideia</button></div>`).join('')||'<div class="empty compact">Sem datas nos próximos 90 dias.</div>'}</div>`;
 host.prepend(box);
 box.querySelectorAll('[data-seg]').forEach(b=>b.onclick=()=>{const s=d.saude.find(x=>x.segmento===b.dataset.seg);listaOrigem('Segmento '+s.segmento+' — SLA vencido',s.ids,'solicitacoes')});
 box.querySelectorAll('[data-ideia]').forEach(b=>b.onclick=async()=>{const [t,dt]=b.dataset.ideia.split('|');try{await api('/data?module=ideias',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({titulo:'Pauta: '+t,status:'IDEIA',sazonalidade:t,descricao:'Data: '+dt.split('-').reverse().join('/')})});invalidate('ideias');b.textContent='✔ criada';b.disabled=true}catch(e){toast(e.message,'warn')}});
}
async function painelInstagramInsights(){
 if(false)return;const host=$('#content');if(!host)return;
 let d;try{d=await api('/insights')}catch{return}
 const h=d.horarios,m=h.melhor;
 const box=document.createElement('div');box.className='dashboard-grid ins-grid';
 box.innerHTML=`<div class="card"><div class="card-title"><div><small>DADOS REAIS DO INSTAGRAM</small><h3>Melhor dia e horário</h3></div></div>${m?`<p><b>${esc(m.dia)}</b> (média ${m.mediaDia} interações) · por volta das <b>${String(m.hora).padStart(2,'0')}h</b> (média ${m.mediaHora})</p>${m.confianca==='baixa'?'<p class="muted">Confiança baixa: poucos posts em cada dia/horário. Use como pista, não como regra.</p>':''}<p class="muted">Calculado com ${h.amostra} publicações sincronizadas.</p>`:`<div class="empty compact">Ainda há ${h.amostra} publicação(ões) sincronizada(s); são necessárias ${h.minimo} para calcular.</div>`}</div>
 <div class="card"><div class="card-title"><div><small>CURTIDAS + COMENTÁRIOS</small><h3>Ranking de conteúdos</h3></div></div>${d.ranking.map((r,i)=>`<div class="data-row"><b>${i+1}º</b><div><span>${esc(r.legenda||'Sem legenda')}</span><small>${esc(r.tipo)} · ${esc(String(r.quando).slice(0,10))} · ${r.interacoes} interações${urlSegura(r.link)?` · <a href="${esc(urlSegura(r.link))}" target="_blank" rel="noopener">abrir</a>`:''}</small></div></div>`).join('')||'<div class="empty compact">Sincronize o Instagram para ver o ranking.</div>'}</div>`;
 host.appendChild(box);
}

// Link de aprovação sem login
async function gerarLinkAprovacao(id){
 let d;try{d=await api('/manager/approval-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,dias:7})})}catch(e){return toast(e.message,'warn')}
 const o=adminOverlay(`<h3>Link de aprovação</h3><p>Envie este link a quem vai aprovar a entrega (não precisa de login). Vale até <b>${esc(fmtDate(d.expiraEm))}</b> e só pode ser usado <b>uma vez</b>. Um novo link cancela o anterior.</p><div class="uri-row"><code id="lnkAprov">${esc(d.url)}</code><button class="softbtn" id="lnkCopy">Copiar</button></div><div class="actions"><button class="btn soft" data-close>Fechar</button></div>`);
 o.el.querySelector('#lnkCopy').onclick=()=>{navigator.clipboard?.writeText(d.url);toast('Link copiado')};
}

// Rascunho de legendas com IA (a equipe revisa; nada é publicado sozinho)
async function sugerirLegendas(modulo,id){
 const btn=$('#btnIA');if(btn){btn.disabled=true;btn.textContent='Gerando…'}
 let d;try{d=await api('/ia/legenda',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modulo,id})})}catch(e){if(btn){btn.disabled=false;btn.textContent='✨ Sugerir legendas (IA)'}return toast(e.message,'warn')}
 if(btn){btn.disabled=false;btn.textContent='✨ Sugerir legendas (IA)'}
 const o=adminOverlay(`<h3>Rascunhos de legenda</h3><p class="kpi-note">Revise antes de usar. Trechos [COMPLETAR: …] mostram o que a IA não tinha como saber.</p><div class="origem-list">${d.opcoes.map((x,i)=>`<div class="notif"><div style="white-space:pre-wrap">${esc(x.legenda)}</div><small>${esc(x.hashtags.join(' '))}</small><div><button class="softbtn" data-usar="${i}">Usar esta</button></div></div>`).join('')}</div><div class="actions"><button class="btn soft" data-close>Fechar</button></div>`);
 o.el.querySelectorAll('[data-usar]').forEach(b=>b.onclick=()=>{const x=d.opcoes[+b.dataset.usar];const txt=x.legenda+(x.hashtags.length?'\n\n'+x.hashtags.join(' '):'');const campo=document.querySelector('#formFields [name="legenda"]')||document.querySelector('#formFields [name="descricao"]');if(campo){campo.value=txt;campo.dispatchEvent(new Event('input',{bubbles:true}))}o.close();toast('Legenda colocada no formulário. Revise e salve.')});
}

// ---------- Painel de trabalho dentro da ficha: comentários, checklist, subtarefas, dependência, estado de publicação ----------
const POST=(b)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const ESTADO_COR={'PUBLICAÇÃO CONFIRMADA':'ok','FALHA NA PUBLICAÇÃO':'bad','PUBLICADO SEM CONFIRMAÇÃO':'warn','AGENDADO INTERNAMENTE':'warn','ENVIADO À PLATAFORMA':'warn'};
const badgeEstado=e=>`<span class="estado-pub ${ESTADO_COR[e]||''}">${esc(e)}</span>`;
async function montarExtrasModal(mod,row){
 const base=$('#formFields');if(!base||$('#trabalhoBox'))return;
 const TRAB=['tarefas','projetos','conteudos','eventos','campanhas','solicitacoes','aprovacoes','ideias'];if(!TRAB.includes(mod))return;
 const box=document.createElement('div');box.id='trabalhoBox';box.className='field wide trabalho-box';box.innerHTML='<small>Carregando…</small>';base.appendChild(box);
 const temChecklist=['tarefas','projetos','conteudos','eventos'].includes(mod);
 let com=[],chk=[],sub=[],dep=null,est=null;
 try{
  [com,chk]=await Promise.all([api(`/comments?module=${mod}&id=${encodeURIComponent(row.id)}`).then(r=>r.rows),temChecklist?api(`/checklist?module=${mod}&id=${encodeURIComponent(row.id)}`).then(r=>r.rows):[]]);
  if(mod==='tarefas'){const all=(await getRows('tarefas')).rows||[];sub=all.filter(t=>t.tarefaPaiId===row.id);dep=row.dependeDe?all.find(t=>t.id===row.dependeDe)||{id:row.dependeDe,titulo:'(não encontrada)',status:''}:null}
  if(mod==='conteudos')est=((await api('/content/states')).rows||[]).find(x=>x.id===row.id)
 }catch(e){box.innerHTML=`<div class="estado-erro">Não foi possível carregar: ${esc(e.message)}</div>`;return}
 const gerente=true;
 const podeDecidir=mod==='conteudos'&&row.status==='REVISÃO'&&(gerente||String(row.revisor||'').trim().toLowerCase()===String(internalSession?.name||'').trim().toLowerCase());
 let h='';
 if(est)h+=`<div><h4>Publicação</h4>${badgeEstado(est.estado)} <small>canal: ${esc(est.canal)}</small>${est.erro?`<p class="estado-erro">Falha informada pela plataforma: ${esc(est.erro)}</p>`:''}${urlSegura(row.linkPublicacao)?`<p><a href="${esc(urlSegura(row.linkPublicacao))}" target="_blank" rel="noopener">Ver publicação</a> <small>confirmada por ${esc(row.publicadoConfirmadoPor||'—')}</small></p>`:''}
  <div class="tb-add">${podeDecidir?`<button type="button" class="btn soft" id="cDecidir">Decidir revisão…</button>`:''}${['APROVADO','PROGRAMADO'].includes(row.status)?`<button type="button" class="btn soft" id="cConfirmar">Confirmar publicação manual…</button>`:''}</div>
  ${row.aprovadoPor?`<small>Última decisão: ${esc(row.aprovacaoDecisao||'')} por ${esc(row.aprovadoPor)} em ${esc(fmtDateTime(row.aprovadoEm))}${row.versaoAprovada?` · versão ${esc(row.versaoAprovada)}`:''}</small>`:''}</div>`;
 if(mod==='tarefas'){
  if(dep)h+=`<div><h4>Depende de</h4><div class="tb-item"><span>${esc(dep.id)} · ${esc(dep.titulo||'')}</span> ${/CONCLU/i.test(dep.status||'')?'<span class="badge ok">concluída</span>':'<span class="badge warn">em aberto — bloqueia a conclusão</span>'}</div></div>`;
  h+=`<div><h4>Subtarefas ${sub.length?`(${sub.filter(t=>/CONCLU/i.test(t.status||'')).length}/${sub.length})`:''}</h4>${sub.map(t=>`<div class="tb-item ${/CONCLU/i.test(t.status||'')?'feito':''}"><span>${esc(t.id)} · ${esc(t.titulo)}</span> <small>${esc(t.status||'')} ${esc(t.responsavel||'')}</small></div>`).join('')||'<small>Nenhuma. Crie uma tarefa e informe esta como "Subtarefa de".</small>'}<div class="tb-add"><button type="button" class="btn soft" id="tNovaSub">+ Criar subtarefa</button></div></div>`;
 }
 if(temChecklist)h+=`<div><h4>Checklist ${chk.length?`(${chk.filter(i=>i.feito).length}/${chk.length})`:''}</h4><div id="tbChk">${chk.map(i=>`<div class="tb-item ${i.feito?'feito':''}"><label><input type="checkbox" data-chk="${i.id}" ${i.feito?'checked':''}> <span>${esc(i.texto)}</span></label><button type="button" class="softbtn" data-chkdel="${i.id}" aria-label="Remover item">×</button></div>`).join('')||'<small>Sem itens.</small>'}</div><div class="tb-add"><input id="tbChkNovo" maxlength="300" placeholder="Novo item do checklist" aria-label="Novo item do checklist"><button type="button" class="softbtn" id="tbChkAdd">Adicionar</button></div></div>`;
 h+=`<div><h4>Comentários</h4><div id="tbCom">${com.map(c=>`<div class="tb-comment"><small><b>${esc(c.autor)}</b>${c.autor_tipo==='portal'?' (solicitante)':''} · ${esc(fmtQuando(c.quando))}${mod==='solicitacoes'?(c.interno?' · só equipe':' · visível ao solicitante'):''}</small>${esc(c.texto)}</div>`).join('')||'<small>Sem comentários.</small>'}</div><div class="tb-add"><textarea id="tbComNovo" rows="2" maxlength="2000" placeholder="Escreva um comentário" aria-label="Novo comentário"></textarea></div>${mod==='solicitacoes'?'<label><input type="checkbox" id="tbComPublico"> Visível ao solicitante</label>':''}<div class="tb-add"><button type="button" class="softbtn" id="tbComAdd">Comentar</button></div></div>`;
 box.innerHTML=h;
 const recarregar=()=>{box.remove();montarExtrasModal(mod,row)};
 const ok=async f=>{try{await f();recarregar()}catch(e){toast(e.message,'warn')}};
 $('#tbComAdd',box).onclick=()=>ok(async()=>{const t=$('#tbComNovo',box).value;if(!t.trim())throw new Error('Escreva o comentário');await api('/comments',POST({module:mod,id:row.id,texto:t,interno:!(mod==='solicitacoes'&&$('#tbComPublico',box)?.checked)}))});
 if(temChecklist){
  $('#tbChkAdd',box).onclick=()=>ok(async()=>{const t=$('#tbChkNovo',box).value;if(!t.trim())throw new Error('Escreva o item');await api('/checklist',POST({module:mod,id:row.id,texto:t}))});
  box.querySelectorAll('[data-chk]').forEach(c=>c.onchange=()=>ok(()=>api('/checklist',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:+c.dataset.chk,feito:c.checked})})));
  box.querySelectorAll('[data-chkdel]').forEach(b=>b.onclick=()=>ok(()=>api('/checklist?itemId='+b.dataset.chkdel,{method:'DELETE'})));
 }
 if(mod==='tarefas'&&$('#tNovaSub',box))$('#tNovaSub',box).onclick=async()=>{const t=prompt('Título da subtarefa:');if(!t||!t.trim())return;try{await api('/data?module=tarefas',POST({titulo:t.trim(),status:'NOVO',tarefaPaiId:row.id,responsavel:row.responsavel||'',prazo:row.prazo||'',segmento:row.segmento||''}));invalidate('tarefas');recarregar();toast('Subtarefa criada')}catch(e){toast(e.message,'warn')}};
 if($('#cDecidir',box))$('#cDecidir',box).onclick=()=>decidirConteudo(row,recarregar);
 if($('#cConfirmar',box))$('#cConfirmar',box).onclick=async()=>{const l=prompt('Cole o link https da publicação já no ar (TikTok, YouTube, Instagram…):');if(!l)return;try{await api('/content/confirm',POST({id:row.id,link:l.trim()}));invalidate('conteudos');toast('Publicação confirmada');closeModal();if(state.module==='conteudos')loadModule('conteudos',true)}catch(e){toast(e.message,'warn')}};
}
function decidirConteudo(row,depois){
 const o=adminOverlay(`<h3>Decisão de revisão · ${esc(row.id)}</h3><p>${esc(row.titulo||'')}</p><label>Versão do material <input id="dcVersao" maxlength="60" value="${esc(row.versao||'')}"></label><label>Comentário <small>(obrigatório para ajustes ou recusa)</small><textarea id="dcCom" rows="3" maxlength="500"></textarea></label><div class="actions"><button class="btn" data-d="APROVADO">Aprovar</button><button class="btn soft" data-d="AJUSTES SOLICITADOS">Pedir ajustes</button><button class="btn soft" data-d="REPROVADO">Reprovar</button><button class="btn soft" data-close>Cancelar</button></div>`);
 o.el.querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{try{await api('/content/decision',POST({id:row.id,decisao:b.dataset.d,comentario:$('#dcCom',o.el).value,versao:$('#dcVersao',o.el).value}));o.close();invalidate('conteudos');toast('Decisão registrada');closeModal();if(state.module==='conteudos')loadModule('conteudos',true)}catch(e){toast(e.message,'warn')}});
}

// Fila única de aprovações: o que aguarda decisão em Conteúdo e em Solicitações aparece junto com a cadeia de aprovação interna (sem criar outro fluxo).
{const orig=renderApprovalCenter;renderApprovalCenter=async function(){
 await orig.apply(this,arguments);
 const host=$('#content');if(!host)return;
 let cont=[],sols=[];try{cont=((await getRows('conteudos',true)).rows||[]).filter(r=>r.status==='REVISÃO');sols=((await getRows('solicitacoes',true)).rows||[]).filter(r=>r.status==='AGUARDANDO APROVAÇÃO DO SOLICITANTE')}catch{}
 const sec=document.createElement('section');sec.className='card fila-aprov';sec.id='filaUnica';
 sec.innerHTML=`<div class="card-title"><div><small>TAMBÉM AGUARDANDO DECISÃO</small><h3>Conteúdos e entregas</h3></div></div>
 <h4>Conteúdos em revisão (${cont.length})</h4>${cont.map(r=>`<div class="tb-item"><span><b>${esc(r.titulo||r.id)}</b> <small>${esc(r.canal||'Instagram')} · revisor: ${esc(r.revisor||'—')}</small></span><button class="softbtn" data-abrir="conteudos|${esc(r.id)}">Abrir e decidir</button></div>`).join('')||'<small>Nenhum conteúdo em revisão.</small>'}
 <h4>Entregas aguardando o solicitante (${sols.length})</h4>${sols.map(r=>`<div class="tb-item"><span><b>${esc(r.titulo||r.id)}</b> <small>${esc(r.segmento||'')} · ${esc(r.solicitante||'')}</small></span><button class="softbtn" data-abrir="solicitacoes|${esc(r.id)}">Abrir</button></div>`).join('')||'<small>Nenhuma entrega aguardando.</small>'}`;
 host.appendChild(sec);
 sec.querySelectorAll('[data-abrir]').forEach(b=>b.onclick=async()=>{const [m,i]=b.dataset.abrir.split('|');const d=await getRows(m,true);state.module=m;state.rows=d.rows||[];const r=state.rows.find(x=>x.id===i);if(r)openModal(r)});
}}

// Tráfego: dados reais da Meta (somente leitura) separados dos registros manuais
const fmtMoeda=(v,m)=>{const n=Number(v)||0;try{return n.toLocaleString('pt-BR',{style:'currency',currency:m||'BRL'})}catch{return n.toLocaleString('pt-BR')}};
async function painelMetaAds(){
 const host=$('#content');if(!host)return;
 let d;try{d=await api('/traffic/snapshots')}catch{return}
 const rows=d.rows||[];
 const box=document.createElement('section');box.className='card';box.id='metaAdsBox';
 const gerente=true;
 box.innerHTML=`<div class="card-title"><div><small>FONTE: META ADS · SOMENTE LEITURA</small><h3>Campanhas na plataforma</h3></div>${gerente?'<button class="softbtn" id="adsSyncAgora">Atualizar agora</button>':''}</div>
 <p class="fonte-tag">${d.conta?`Conta ${esc(d.conta)} · `:''}${d.ultimaSync?`última atualização ${esc(fmtDateTime(d.ultimaSync))}`:'ainda não sincronizado'}. O EVO MKT só lê gasto e resultados; nada é criado, ativado ou alterado na Meta. Estes números não se misturam com os registros manuais abaixo.</p>
 ${(d.alertas||[]).length?`<div><h4>Alertas (${d.alertas.length})</h4>${d.alertas.map(a=>`<div class="tb-item"><span class="badge ${a.severidade==='critico'?'bad':'warn'}">${a.severidade==='critico'?'crítico':'atenção'}</span> <span><b>${esc(a.regra)}</b> · ${esc(a.campanha)}<br><small>${esc(a.mensagem)}</small></span></div>`).join('')}<p class="fonte-tag">Regras objetivas e só com dados suficientes (≥ ${Number(d.limites.impressoesMin).toLocaleString('pt-BR')} impressões): CTR abaixo de ${d.limites.ctrMin}%, frequência acima de ${d.limites.frequenciaMax}, gasto de ${d.limites.gastoSemResultado}+ sem resultado em campanha de leads/conversas e CPC acima do dobro da média. São referências de mercado: a Gerência ajusta em Administração → Integrações. Nenhuma ação é tomada sozinha.</p></div>`:''}
 ${rows.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Período</th><th>Campanha</th><th>Status na Meta</th><th>Gasto</th><th>Impressões</th><th>Cliques</th><th>Resultados</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.periodo)}</td><td>${esc(r.campanha)}<br><small>${esc(r.objetivo||'')}</small></td><td>${esc(r.status||'—')}</td><td>${esc(fmtMoeda(r.gasto,r.moeda))}</td><td>${Number(r.impressoes).toLocaleString('pt-BR')}</td><td>${Number(r.cliques).toLocaleString('pt-BR')}</td><td>${Number(r.resultados).toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody></table></div><p class="fonte-tag">Resultados = leads + conversas iniciadas, como a Meta informa. Cada moeda é mostrada na sua própria unidade.</p>`:`<div class="empty compact">Sem dados da Meta. ${gerente?'Em Administração → Integrações, ative a leitura de anúncios, escolha a conta e sincronize.':'A Gerência pode ativar a leitura em Administração → Integrações.'}</div>`}`;
 host.appendChild(box);
 const b=$('#adsSyncAgora',box);if(b)b.onclick=async()=>{b.disabled=true;b.textContent='Atualizando…';try{const r=await api('/integrations/ads/sync',POST({}));toast(`${r.linhas} linha(s) atualizadas`);go('trafego')}catch(e){toast(e.message,'warn');b.disabled=false;b.textContent='Atualizar agora'}};
}
{const orig=renderTrafficWorkspace;renderTrafficWorkspace=async function(){await orig.apply(this,arguments);await painelMetaAds()}}

// Relatórios: painel integrado, com fonte, período e data de atualização em cada bloco
async function painelRelatorios(){
 const host=$('#content');if(!host||$('#painelInt'))return;
 const hoje=new Date().toISOString().slice(0,7);const de=pref('relDe',hoje),ate=pref('relAte',hoje);
 const box=document.createElement('section');box.className='card';box.id='painelInt';
 box.innerHTML=`<div class="card-title"><div><small>RELATÓRIO INTEGRADO</small><h3>Redes, tráfego e operação — com fonte e data</h3></div></div>
 <div class="tb-add"><label>De <input type="month" id="relDe" value="${esc(de)}"></label><label>Até <input type="month" id="relAte" value="${esc(ate)}"></label><button class="btn" id="relGo">Atualizar</button>${true?'<button class="softbtn" id="relSalvar">Salvar no histórico</button>':''}<button class="softbtn" id="relCsv">Exportar CSV</button></div><div id="relConteudo"><div class="loading"><span></span><b>Calculando…</b></div></div>`;
 host.prepend(box);
 let dados=null;
 const carregar=async()=>{
  const d1=$('#relDe').value,a1=$('#relAte').value;setPref('relDe',d1);setPref('relAte',a1);
  const c=$('#relConteudo');c.innerHTML='<div class="loading"><span></span><b>Calculando…</b></div>';
  try{dados=await api(`/reports/overview?de=${d1}&ate=${a1}`)}catch(e){c.innerHTML=`<div class="estado-erro">${esc(e.message)}</div>`;return}
  const r=dados.redes,t=dados.trafego;
  c.innerHTML=`<h4>1. Redes sociais <span class="fonte-tag">fonte: ${esc(r.fonte)} · ${esc(d1)} a ${esc(a1)}</span></h4>
  ${r.aviso?`<p class="int-warn">${esc(r.aviso)}</p>`:''}
  <p><b>Instagram (API)</b> <span class="fonte-tag">atualizado em ${esc(r.instagramApi.atualizadoEm?fmtDateTime(r.instagramApi.atualizadoEm):'—')}</span></p>
  ${r.instagramApi.meses.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Mês</th><th>Seguidores</th><th>Alcance</th><th>Impressões</th><th>Interações</th></tr></thead><tbody>${r.instagramApi.meses.map(m=>`<tr><td>${esc(m.periodo)}</td><td>${m.seguidores.toLocaleString('pt-BR')}</td><td>${m.alcance.toLocaleString('pt-BR')}</td><td>${m.impressoes.toLocaleString('pt-BR')}</td><td>${m.interacoes.toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody></table></div>`:'<small>Sem dados da API neste período (conecte e sincronize o Instagram).</small>'}
  ${r.registrosManuais.meses.length?`<p><b>Registros manuais</b> <span class="fonte-tag">não somados à API</span></p><small>${r.registrosManuais.meses.map(m=>esc(m.titulo||m.periodo)).join(' · ')}</small>`:''}
  <small>TikTok e YouTube: sem integração de métricas; os conteúdos desses canais são planejados e confirmados manualmente.</small>
  <h4>2. Tráfego pago <span class="fonte-tag">fonte: ${esc(t.fonte)}</span></h4>
  ${t.aviso?`<p class="int-warn">${esc(t.aviso)}</p>`:''}
  ${t.meta.moedas.length?t.meta.moedas.map(m=>`<div class="tb-item"><b>${esc(m.moeda)}</b> <span>gasto ${esc(fmtMoeda(m.gasto,m.moeda))} · impressões ${m.impressoes.toLocaleString('pt-BR')} · cliques ${m.cliques.toLocaleString('pt-BR')} · resultados ${m.resultados.toLocaleString('pt-BR')}</span></div>`).join('')+`<small>Atualizado em ${esc(t.meta.atualizadoEm?fmtDateTime(t.meta.atualizadoEm):'—')}. ${esc(t.meta.observacao)}</small>`:'<small>Sem dados da Meta no período.</small>'}
  ${t.planejadoVsReal.length?`<p><b>Planejado × gasto real por campanha</b></p><div class="tablewrap"><table class="datatable"><thead><tr><th>Campanha</th><th>Orçamento planejado</th><th>Gasto real</th><th>Fonte do gasto</th></tr></thead><tbody>${t.planejadoVsReal.map(c=>`<tr><td>${esc(c.titulo)}</td><td>${esc(fmtMoeda(c.orcamentoPlanejado))}</td><td>${c.gastoReal===null?'—':esc(fmtMoeda(c.gastoReal,c.moeda))}</td><td>${esc(c.fonteGasto)}</td></tr>`).join('')}</tbody></table></div>`:''}
  <h4>3. Indicadores operacionais</h4><small>${esc(dados.operacionais.ondeVer)}</small>
  <h4>4. Indicadores institucionais</h4><small>${esc(dados.institucionais.motivo)}</small>
  <p class="fonte-tag">Gerado em ${esc(fmtDateTime(dados.geradoEm))}. Nenhum valor é estimado.</p>`;
 };
 $('#relGo').onclick=carregar;
 $('#relCsv').onclick=()=>{if(!dados)return;const linhas=[['bloco','fonte','periodo','item','valor','moeda','atualizado_em']];
  dados.redes.instagramApi.meses.forEach(m=>['seguidores','alcance','impressoes','interacoes'].forEach(k=>linhas.push(['redes','Instagram API',m.periodo,k,m[k],'',dados.redes.instagramApi.atualizadoEm])));
  dados.trafego.meta.campanhas.forEach(c=>['gasto','impressoes','cliques','resultados'].forEach(k=>linhas.push(['trafego','Meta Ads',c.periodo,c.campanha+' · '+k,c[k],k==='gasto'?c.moeda:'',dados.trafego.meta.atualizadoEm])));
  const csv='﻿'+linhas.map(l=>l.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`relatorio_integrado_${$('#relDe').value}_${$('#relAte').value}.csv`;a.click()};
 const sv=$('#relSalvar');if(sv)sv.onclick=async()=>{try{const r=await api('/reports/save',POST({de:$('#relDe').value,ate:$('#relAte').value}));invalidate('relatorios');toast('Relatório salvo no histórico ('+r.id+')')}catch(e){toast(e.message,'warn')}};
 carregar();
}
