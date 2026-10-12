// Etapa 03: linha do tempo de registros e painel de indicadores (dados vindos do servidor: /api/timeline e /api/indicadores).
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
 if(internalSession?.role!=='manager')return;
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
 o.el.querySelector('#notifCentral').onclick=()=>{o.close();go(internalSession?.role==='manager'?'central':'minhaarea')};
}
setTimeout(()=>{if(typeof internalSession!=='undefined'&&internalSession)atualizarSinoNotificacoes()},2500);setInterval(()=>{if(typeof internalSession!=='undefined'&&internalSession)atualizarSinoNotificacoes()},90000);

// Insights (saúde por segmento, datas comemorativas, melhores horários, ranking)
const corSaude=n=>n>=75?'#187549':n>=40?'#9a5b00':'#aa2530';
const fmtData=d=>d.slice(8,10)+'/'+d.slice(5,7);
async function painelInsights(){
 if(internalSession?.role!=='manager')return;const host=$('#content');if(!host)return;
 let d;try{d=await api('/insights')}catch{return}
 const box=document.createElement('div');box.className='dashboard-grid ins-grid';box.id='insPainel';
 box.innerHTML=`<div class="card"><div class="card-title"><div><small>ÚLTIMOS 90 DIAS</small><h3>Saúde por segmento</h3></div></div>${d.saude.map(s=>`<button class="saude" data-seg="${esc(s.segmento)}"><span>${esc(s.segmento)}</span><div><i style="width:${s.score}%;background:${corSaude(s.score)}"></i></div><b style="color:${corSaude(s.score)}">${s.score}</b><small>${s.sinais.length?esc(s.sinais.join(' · ')):'Sem alertas'} · ${s.abertas} aberta(s)</small></button>`).join('')||'<div class="empty compact">Sem demandas para avaliar.</div>'}<p class="muted">Nota 0–100 calculada de SLA vencido, devoluções, reaberturas e avaliação.</p></div>
 <div class="card"><div class="card-title"><div><small>PRÓXIMOS 90 DIAS</small><h3>Datas para planejar</h3></div></div>${d.datas.slice(0,8).map(x=>`<div class="data-row"><b>${fmtData(x.data)}</b><div><span>${esc(x.titulo)}</span><small>${esc(x.tema)} · faltam ${x.faltam} dia(s)${x.planejarAte<=today()?' · <b>planejar agora</b>':' · planejar até '+fmtData(x.planejarAte)}</small></div><button class="softbtn" data-ideia="${esc(x.titulo)}|${esc(x.data)}">+ Ideia</button></div>`).join('')||'<div class="empty compact">Sem datas nos próximos 90 dias.</div>'}</div>`;
 host.prepend(box);
 box.querySelectorAll('[data-seg]').forEach(b=>b.onclick=()=>{const s=d.saude.find(x=>x.segmento===b.dataset.seg);listaOrigem('Segmento '+s.segmento+' — SLA vencido',s.ids,'solicitacoes')});
 box.querySelectorAll('[data-ideia]').forEach(b=>b.onclick=async()=>{const [t,dt]=b.dataset.ideia.split('|');try{await api('/data?module=ideias',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({titulo:'Pauta: '+t,status:'IDEIA',sazonalidade:t,descricao:'Data: '+dt.split('-').reverse().join('/')})});invalidate('ideias');b.textContent='✔ criada';b.disabled=true}catch(e){toast(e.message,'warn')}});
}
async function painelInstagramInsights(){
 if(internalSession?.role!=='manager')return;const host=$('#content');if(!host)return;
 let d;try{d=await api('/insights')}catch{return}
 const h=d.horarios,m=h.melhor;
 const box=document.createElement('div');box.className='dashboard-grid ins-grid';
 box.innerHTML=`<div class="card"><div class="card-title"><div><small>DADOS REAIS DO INSTAGRAM</small><h3>Melhor dia e horário</h3></div></div>${m?`<p><b>${esc(m.dia)}</b> (média ${m.mediaDia} interações) · por volta das <b>${String(m.hora).padStart(2,'0')}h</b> (média ${m.mediaHora})</p>${m.confianca==='baixa'?'<p class="muted">Confiança baixa: poucos posts em cada dia/horário. Use como pista, não como regra.</p>':''}<p class="muted">Calculado com ${h.amostra} publicações sincronizadas.</p>`:`<div class="empty compact">Ainda há ${h.amostra} publicação(ões) sincronizada(s); são necessárias ${h.minimo} para calcular.</div>`}</div>
 <div class="card"><div class="card-title"><div><small>CURTIDAS + COMENTÁRIOS</small><h3>Ranking de conteúdos</h3></div></div>${d.ranking.map((r,i)=>`<div class="data-row"><b>${i+1}º</b><div><span>${esc(r.legenda||'Sem legenda')}</span><small>${esc(r.tipo)} · ${esc(String(r.quando).slice(0,10))} · ${r.interacoes} interações${r.link?` · <a href="${esc(r.link)}" target="_blank" rel="noopener">abrir</a>`:''}</small></div></div>`).join('')||'<div class="empty compact">Sincronize o Instagram para ver o ranking.</div>'}</div>`;
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
