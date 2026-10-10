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
