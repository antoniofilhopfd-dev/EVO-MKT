/* Dashboard de marketing: Instagram, Tráfego Pago e calendário num relance, com dados reais já sincronizados.
   Cada bloco abre o módulo correspondente. Métrica sem dado aparece como "—", nunca como zero. */
let dbDias=pref('dashboard.dias',30);
const dbBrl=(v,m)=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:m||'BRL'});
const dbN=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0});
const dbFd=iso=>String(iso||'').split('-').reverse().slice(0,2).join('/');
/** Variação percentual sem juízo de valor: subir ou descer não é bom nem ruim por si só (custo mais alto, por exemplo). */
function dbVar(atual,anterior){
  if(atual===null||atual===undefined||anterior===null||anterior===undefined||!Number(anterior))return '<small class="db-var neutro">sem base de comparação</small>';
  const p=((atual-anterior)/anterior)*100;if(!Number.isFinite(p))return '';
  return `<small class="db-var neutro" title="Período anterior: ${esc(String(anterior))}">${p>=0?'▲':'▼'} ${Math.abs(p).toFixed(1).replace('.',',')}% vs. período anterior</small>`;
}
function dbCard(rotulo,valor,extra='',spark='',ir=''){
  return `<${ir?'button type="button" data-db-ir="'+ir+'"':'div'} class="db-card"><span class="db-rot">${esc(rotulo)}</span><b>${valor}</b>${extra}${spark?`<span class="db-sp">${spark}</span>`:''}</${ir?'button':'div'}>`;
}
async function renderToday(){
  $('#content').innerHTML='<div class="loading"><span></span><b>Carregando o painel…</b></div>';
  let d;
  if(typeof igCarregaContas==='function'&&!igContas.length)await igCarregaContas();
  try{d=await api('/dashboard/resumo?dias='+dbDias+(typeof igQ==='function'?igQ('&'):''))}catch(e){$('#content').innerHTML=`<div class="empty-rich"><strong>Não foi possível carregar o painel</strong><p>${esc(e.message)}</p></div>`;return}
  const ig=d.instagram,tp=d.trafego,nome=String(d.eu.nome||'').split(' ')[0];
  const hojeTxt=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date(d.hoje+'T12:00:00'));
  const avisos=[...d.integracoes.map(x=>({t:x.nome,m:x.msg,ir:'configuracoes'})),...d.alertas.map(a=>({t:`${a.regra} · ${a.campanha}`,m:a.mensagem,ir:'trafego',crit:a.severidade==='critico'}))];
  const ant=tp.anterior,at=tp.atual;
  $('#content').innerHTML=`<div class="db-topo"><div><small>${esc(hojeTxt)}</small><h1>Olá, ${esc(nome)}</h1></div>
    <div class="db-acoes"><label class="db-per">Período<select id="dbDias" class="control">${[[7,'7 dias'],[14,'14 dias'],[30,'30 dias'],[90,'90 dias']].map(([v,l])=>`<option value="${v}" ${d.dias===v?'selected':''}>Últimos ${l}</option>`).join('')}</select></label>
    <button class="softbtn" data-db-ir="studio">Nova publicação</button><button class="softbtn" data-db-ir="calendario">Calendário</button><button class="btn" data-db-ir="gerenciador">Gerenciador de anúncios</button></div></div>
   ${avisos.length?`<div class="db-alerta" role="alert"><b>Atenção</b>${avisos.slice(0,4).map(a=>`<button type="button" data-db-ir="${a.ir}">${esc(a.t)} <small>${esc(a.m)}</small></button>`).join('')}</div>`:''}
   <section class="db-sec"><header><h2>Instagram${typeof igContas!=='undefined'&&igContas.length>1?` <small>· @${esc((igContas.find(c=>c.ig===igConta)||{}).usuario||'')}</small>`:''}</h2><button class="db-link" data-db-ir="instagram">Ver análises ›</button></header>
    ${ig.conectado||ig.seguidores!==null?`<div class="db-cards">
     ${dbCard('Seguidores',dbN(ig.seguidores),ig.variacaoSeguidores===null?'':`<small class="db-var neutro">${ig.variacaoSeguidores>=0?'▲':'▼'} ${dbN(Math.abs(ig.variacaoSeguidores))} no período</small>`,EvoCharts.spark(ig.serieSeguidores.map(x=>x.seguidores)),'instagram')}
     ${ig.visualizacoes!=null?dbCard('Visualizações',dbN(ig.visualizacoes),'<small class="db-var">das publicações com dado da Meta</small>','','igposts'):''}
     ${dbCard('Publicações',dbN(ig.publicacoes),'<small class="db-var">no período</small>','','conteudos')}
     ${dbCard('Interações',dbN(ig.interacoes),'<small class="db-var">curtidas, comentários e salvamentos</small>','','instagram')}
     ${dbCard('Alcance',dbN(ig.alcance),'<small class="db-var">das publicações com dado da Meta</small>','','instagram')}</div>
     <div class="db-dois"><div class="db-bloco"><h3>Seguidores</h3><div id="dbGrSeg"></div></div>
      <div class="db-bloco"><h3>Melhor publicação</h3>${ig.melhor?`<div class="db-melhor">${ig.melhor.miniatura?`<img alt="" loading="lazy" referrerpolicy="no-referrer" src="${attr(ig.melhor.miniatura)}">`:''}<div><b>${esc(ig.melhor.legenda||'Sem legenda')}</b><small>${esc(dbN(ig.melhor.interacoes))} interações · ${esc(ig.melhor.tipo)}</small>${ig.melhor.link?`<a href="${attr(ig.melhor.link)}" target="_blank" rel="noopener">Abrir no Instagram</a>`:''}</div></div>`:'<p class="db-vazio">Sem publicações sincronizadas no período.</p>'}
       <h3 style="margin-top:14px">Programadas</h3>${ig.programadas.length?`<ul class="db-lista">${ig.programadas.map(p=>`<li><button type="button" data-db-ir="studio"><span class="db-dia">${esc(dbFd(p.quando.slice(0,10)))}${p.quando.length>10?`<i>${esc(p.quando.slice(11,16))}</i>`:''}</span><span class="db-tit"><b>${esc(p.titulo)}</b><small>${esc([p.formato,p.status].filter(Boolean).join(' · '))}</small></span></button></li>`).join('')}</ul>`:'<p class="db-vazio">Nenhuma publicação programada.</p>'}</div></div>`:`<div class="db-vazio-g">Instagram ainda não conectado. <button class="db-link" data-db-ir="configuracoes">Conectar em Configurações</button></div>`}
   </section>
   <section class="db-sec"><header><h2>Tráfego Pago</h2><button class="db-link" data-db-ir="trafego">Ver visão geral ›</button></header>
    ${tp.conectado&&tp.temDados?`<div class="db-cards">
     ${dbCard('Investimento',dbBrl(at.investimento,tp.moeda),dbVar(at.investimento,ant&&ant.investimento),EvoCharts.spark(tp.serie.map(x=>x.gasto)),'trafego')}
     ${dbCard('Campanhas ativas',dbN(tp.campanhasAtivas),'<small class="db-var">no mês atual</small>','','gerenciador')}
     ${dbCard('Conversas iniciadas',dbN(at.conversas),dbVar(at.conversas,ant&&ant.conversas),EvoCharts.spark(tp.serie.map(x=>x.conversas)),'trafego')}
     ${dbCard('Custo por conversa',dbBrl(tp.custoPorConversa,tp.moeda),'<small class="db-var">investimento ÷ conversas</small>','','trafego')}</div>
     <div class="db-dois"><div class="db-bloco"><h3>Investimento e conversas por dia</h3><div id="dbGrInv"></div></div>
      <div class="db-bloco"><h3>Campanhas com maior investimento</h3><div id="dbGrCamp"></div></div></div>`:`<div class="db-vazio-g">${tp.conectado?'Ainda não há dados de anúncios sincronizados neste período.':'Conta de anúncios ainda não conectada.'} <button class="db-link" data-db-ir="${tp.conectado?'trafego':'configuracoes'}">${tp.conectado?'Abrir Tráfego Pago':'Conectar em Configurações'}</button></div>`}
   </section>
   <section class="db-sec"><header><h2>Próximos dias</h2><button class="db-link" data-db-ir="calendario">Abrir calendário ›</button></header>
    <div class="db-dois"><div class="db-bloco"><h3>Eventos e compromissos</h3>${d.eventos.length?`<ul class="db-lista">${d.eventos.map(x=>`<li><button type="button" data-db-ir="calendario"><span class="db-dia">${esc(dbFd(x.data))}${x.hora?`<i>${esc(x.hora)}</i>`:''}</span><span class="db-tit"><b>${esc(x.titulo)}</b><small>${esc(x.categoria)}</small></span></button></li>`).join('')}</ul>`:'<p class="db-vazio">Nada marcado para os próximos 30 dias.</p>'}</div>
     <div class="db-bloco"><h3>Datas comemorativas</h3>${d.datas.length?`<ul class="db-lista">${d.datas.map(x=>`<li><button type="button" data-db-ir="calendario"><span class="db-dia">${esc(dbFd(x.data))}</span><span class="db-tit"><b>${esc(x.nome)}</b></span></button></li>`).join('')}</ul>`:'<p class="db-vazio">Nenhuma data relevante nos próximos 30 dias.</p>'}</div></div></section>`;
  $('#dbDias').onchange=e=>{dbDias=Number(e.target.value);setPref('dashboard.dias',dbDias);renderToday()};
  $$('[data-db-ir]').forEach(b=>b.onclick=()=>go(b.dataset.dbIr));
  if($('#dbGrSeg'))EvoCharts.linha($('#dbGrSeg'),{dados:ig.serieSeguidores.map(x=>({x:x.dia,seg:x.seguidores})),series:[{k:'seg',nome:'Seguidores',fmt:v=>dbN(v)}],zero:false,altura:190,rotuloAcessivel:'Evolução de seguidores'});
  if($('#dbGrInv'))EvoCharts.linha($('#dbGrInv'),{dados:tp.serie.map(x=>({x:x.dia,gasto:x.gasto,conv:x.conversas})),series:[{k:'gasto',nome:'Investimento',fmt:v=>dbBrl(v,tp.moeda)},{k:'conv',nome:'Conversas',fmt:dbN}],altura:190,rotuloAcessivel:'Investimento e conversas por dia'});
  if($('#dbGrCamp'))EvoCharts.barras($('#dbGrCamp'),{itens:tp.topCampanhas.map(c=>({nome:c.nome,v:c.gasto,sub:c.conversas?`${dbN(c.conversas)} conversas`:''})),fmt:v=>dbBrl(v,tp.moeda),vazio:'Sem campanhas no mês atual.',rotuloAcessivel:'Campanhas por investimento'});
}
