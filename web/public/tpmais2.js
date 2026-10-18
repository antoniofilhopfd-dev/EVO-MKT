/* Tráfego Pago: Orçamentos, Alertas e automações, Relatórios e Histórico.
   Nenhuma tela aqui altera orçamento ou anúncio sozinha: limites só avisam; regras que pausam exigem autorização explícita e ficam no histórico. */

// ================= Orçamentos =================
TP_PAGINAS.tforcamentos=async function(){
  state.module=null;
  $('#content').innerHTML=tpCabecalho('Orçamentos','Orçamento planejado, configurado na Meta e investimento realizado. Projeções são estimativas.')+'<div id="tpPg"><div class="loading"><span></span><b>Lendo orçamentos…</b></div></div>';
  tpPosCabecalho(()=>TP_PAGINAS.tforcamentos());
  const d=await tpCarregaOuErro('tforcamentos');if(!d)return;
  let painel=null,lim=[];
  try{painel=await api('/traffic/painel')}catch{}
  try{lim=(await api('/ads/limites')).rows}catch{}
  const hist=await api('/ads/acoes').then(r=>r.rows||[]).catch(()=>[]);
  const o=d.orcamentoConta||{},pc=painel&&painel.pacing,camps=tpFlat('campanha').filter(x=>tpEstadoDe(x)!=='ARCHIVED'),conj=tpFlat('conjunto').filter(x=>tpEstadoDe(x)!=='ARCHIVED');
  const dias=Math.max(1,Math.round((new Date(d.ate+'T12:00:00')-new Date(d.de+'T12:00:00'))/86400000)+1);
  const barra=(gasto,base,rot)=>{if(!base)return `<small class="kpi-note">${rot||'sem orçamento definido'}</small>`;const p=gasto/base*100;return `<div class="tf-trilho" role="img" aria-label="${Math.round(p)}% do orçamento"><i style="width:${Math.min(100,p).toFixed(1)}%;${p>=100?'background:var(--bad)':p>=85?'background:var(--accent)':''}"></i></div><small>${Math.round(p)}% de ${esc(gmBrl(base))}</small>`};
  const linha=(x,n)=>{const diario=x.orcamento&&x.orcamento.diario,total=x.orcamento&&x.orcamento.total,mediaDia=x.gasto/dias;return `<tr><td><b>${esc(x.nome)}</b><br><small>${esc(x._pai||'')}</small></td><td>${gmBadge(x.estado)}</td><td>${diario?esc(gmBrl(diario))+'<small>/dia</small>':total?esc(gmBrl(total))+'<small> total</small>':'<small>da campanha</small>'}</td><td>${esc(gmBrl(x.gasto))}</td><td>${esc(gmBrl(mediaDia))}<small>/dia</small></td><td>${diario?barra(mediaDia,diario):total?barra(x.gasto,total):'—'}</td></tr>`};
  const salvoLim=lim.map(l=>({...l}));
  $('#tpPg').innerHTML=`<div class="db-cards"><div class="db-card"><span class="db-rot">Planejado no EVO MKT (mês)</span><b>${o.planejadoEvo?esc(gmBrl(o.planejadoEvo)):'não definido'}</b><button class="db-link" id="orDef">${o.planejadoEvo?'alterar':'definir'}</button></div>
    <div class="db-card"><span class="db-rot">Configurado na Meta (ativas, por dia)</span><b>${esc(gmBrl(o.configuradoMetaDia||0))}</b><small class="db-var">soma dos orçamentos diários</small></div>
    <div class="db-card"><span class="db-rot">Investido no mês</span><b>${esc(gmBrl(o.gastoMes||0))}</b>${o.planejadoEvo?barra(o.gastoMes||0,o.planejadoEvo):''}</div>
    <div class="db-card"><span class="db-rot">Projeção do mês (estimativa)</span><b>${pc?esc(gmBrl(pc.projecao)):'—'}</b><small class="db-var">${pc?'ritmo linear dos dias já passados; não é previsão da Meta':'defina o orçamento do mês para ver a projeção'}</small></div></div>
   <div class="db-dois"><div class="db-bloco"><h3>Consumo acumulado × orçamento do mês</h3><div id="orGr"></div></div>
    <div class="db-bloco"><h3>Limites de investimento (avisos)</h3><p class="kpi-note">O sistema avisa quando o investimento chegar ao valor ou percentual definido. Só avisa: nenhum orçamento é alterado sem a sua autorização.</p><div id="orLim"></div></div></div>
   <div class="db-bloco" style="margin-top:12px"><h3>Campanhas (${esc(fmtDate(d.de))} a ${esc(fmtDate(d.ate))})</h3><div class="tablewrap"><table class="datatable"><thead><tr><th>Campanha</th><th>Status</th><th>Orçamento na Meta</th><th>Investido</th><th>Média por dia</th><th>Consumo</th></tr></thead><tbody>${camps.sort((a,b)=>b.gasto-a.gasto).map(x=>linha(x,'campanha')).join('')||'<tr><td colspan="6" class="empty compact">Sem campanhas.</td></tr>'}</tbody></table></div></div>
   <div class="db-bloco" style="margin-top:12px"><h3>Conjuntos de anúncios</h3><div class="tablewrap"><table class="datatable"><thead><tr><th>Conjunto</th><th>Status</th><th>Orçamento na Meta</th><th>Investido</th><th>Média por dia</th><th>Consumo</th></tr></thead><tbody>${conj.sort((a,b)=>b.gasto-a.gasto).slice(0,40).map(x=>linha(x,'conjunto')).join('')||'<tr><td colspan="6" class="empty compact">Sem conjuntos.</td></tr>'}</tbody></table></div></div>
   <div class="db-bloco" style="margin-top:12px"><h3>Por segmento escolar (pelo nome)</h3><div id="orSeg"></div></div>
   <div class="db-bloco" style="margin-top:12px"><h3>Histórico de alterações de orçamento</h3>${(()=>{const h=hist.filter(x=>/orcamento/i.test(x.acao));return h.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Quando</th><th>Quem</th><th>Item</th><th>Antes</th><th>Depois</th><th>Resultado</th></tr></thead><tbody>${h.slice(0,30).map(x=>`<tr><td>${esc(fmtDateTime(x.quando))}</td><td>${esc(x.quem)}</td><td>${esc(x.nome)}</td><td><small>${esc(x.antes)}</small></td><td><small>${esc(x.depois)}</small></td><td><span class="badge ${x.resultado==='OK'?'ok':'bad'}">${esc(x.resultado)}</span></td></tr>`).join('')}</tbody></table></div>`:'<small class="kpi-note">Nenhuma alteração de orçamento feita pelo EVO MKT.</small>'})()}<p class="kpi-note">Histórico local do EVO MKT; não é o histórico completo da Meta.</p></div>`;
  // gráfico de consumo
  if(painel){const dia=painel.diario.filter(x=>String(x.dia).startsWith(painel.periodo));let ac=0;const dados=dia.map(x=>{ac+=Number(x.gasto)||0;return {x:x.dia,acum:ac,orc:null}});const orc=Number(painel.orcamentoMensal)||0;if(orc&&dados.length){const [a,m]=painel.periodo.split('-').map(Number),n=new Date(a,m,0).getDate();dados.forEach(p=>{const dd=Number(p.x.slice(8,10));p.orc=orc*dd/n})}
    EvoCharts.linha($('#orGr'),{dados,series:[{k:'acum',nome:'Investido (acumulado)',fmt:v=>gmBrl(v)},...(orc?[{k:'orc',nome:'Orçamento proporcional ao dia',fmt:v=>gmBrl(v),cor:'#FF7800'}]:[])],altura:210,rotuloAcessivel:'Consumo acumulado do mês'})}
  else $('#orGr').innerHTML='<div class="ch-vazio">Sem dados diários sincronizados.</div>';
  const porSeg=new Map();camps.forEach(x=>{const k=tpSegDe(x)||'não identificado';porSeg.set(k,(porSeg.get(k)||0)+x.gasto)});
  EvoCharts.barras($('#orSeg'),{itens:[...porSeg].map(([nome,v])=>({nome,v})).sort((a,b)=>b.v-a.v),fmt:v=>gmBrl(v),vazio:'Sem investimento no período.'});
  $('#orDef').onclick=async()=>{const v=prompt('Orçamento de anúncios do mês (R$). Deixe vazio para remover:',o.planejadoEvo||'');if(v===null)return;try{await api('/integrations/ads/orcamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:Number(String(v).replace(',','.'))||0})});TP_PAGINAS.tforcamentos()}catch(e){toast(e.message,'warn')}};
  // limites
  const desenhaLim=()=>{const box=$('#orLim');box.innerHTML=`${salvoLim.map((l,i)=>`<div class="or-lim ${l.atingido?'atingido':''}"><input class="control" data-lf="nome" data-i="${i}" value="${attr(l.nome)}" aria-label="Nome do limite">
    <select class="control" data-lf="escopo" data-i="${i}"><option value="conta" ${l.escopo==='conta'?'selected':''}>Conta</option><option value="campanha" ${l.escopo==='campanha'?'selected':''}>Campanha</option></select>
    ${l.escopo==='campanha'?`<select class="control" data-lf="alvoId" data-i="${i}">${camps.map(c=>`<option value="${attr(c.id)}" ${l.alvoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select>`:''}
    <select class="control" data-lf="periodo" data-i="${i}"><option value="dia" ${l.periodo==='dia'?'selected':''} ${l.escopo==='campanha'?'disabled':''}>no dia</option><option value="mes" ${l.periodo==='mes'?'selected':''}>no mês</option></select>
    <select class="control" data-lf="tipo" data-i="${i}"><option value="valor" ${l.tipo==='valor'?'selected':''}>R$</option><option value="percentual" ${l.tipo==='percentual'?'selected':''}>% do orçamento do mês</option></select>
    <input class="control" type="number" step="any" min="0" data-lf="valor" data-i="${i}" value="${attr(l.valor)}" aria-label="Valor"><label class="check-row"><input type="checkbox" data-lf="ativo" data-i="${i}" ${l.ativo!==false?'checked':''}> ativo</label><button class="softbtn" data-ldel="${i}" aria-label="Remover">✕</button>
    <small class="or-st">${l.gasto===null||l.gasto===undefined?'sem dado de gasto ainda':`${esc(gmBrl(l.gasto))} de ${l.limite===null?'—':esc(gmBrl(l.limite))}${l.atingido?' · <b>limite atingido</b>':''}${l.semOrcamento?' · defina o orçamento do mês':''}`}</small></div>`).join('')||'<small class="kpi-note">Nenhum limite. Exemplo: avisar quando o investimento do dia chegar a R$ 20.</small>'}
    <div class="int-actions"><button class="softbtn" id="lmAdd" type="button">+ Novo limite</button><button class="btn" id="lmSalva" type="button">Salvar limites</button></div>`;
    box.querySelectorAll('[data-lf]').forEach(el=>el.onchange=()=>{const l=salvoLim[Number(el.dataset.i)],k=el.dataset.lf;l[k]=el.type==='checkbox'?el.checked:k==='valor'?Number(el.value):el.value;if(k==='escopo'){l.alvoId=l.escopo==='campanha'?(camps[0]||{}).id||'':'';l.alvoNome=l.escopo==='campanha'?(camps[0]||{}).nome||'':'';if(l.escopo==='campanha')l.periodo='mes'}if(k==='alvoId')l.alvoNome=(camps.find(c=>c.id===l.alvoId)||{}).nome||'';desenhaLim()});
    box.querySelectorAll('[data-ldel]').forEach(b=>b.onclick=()=>{salvoLim.splice(Number(b.dataset.ldel),1);desenhaLim()});
    $('#lmAdd').onclick=()=>{salvoLim.push({id:'',nome:'Limite de investimento',escopo:'conta',alvoId:'',alvoNome:'',periodo:'dia',tipo:'valor',valor:20,ativo:true});desenhaLim()};
    $('#lmSalva').onclick=async()=>{try{const r=await api('/ads/limites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:salvoLim})});salvoLim.length=0;r.rows.forEach(x=>salvoLim.push({...x}));toast('Limites salvos');desenhaLim()}catch(e){toast(e.message,'bad')}};
  };
  desenhaLim();
};

// ================= Alertas e automações =================
TP_PAGINAS.tfalertas=async function(){
  state.module=null;
  $('#content').innerHTML=tpCabecalho('Alertas e automações','Regras objetivas, com limites visíveis. Automações que alteram anúncios são opcionais e exigem autorização.')+'<div id="tpPg"><div class="loading"><span></span><b>Lendo alertas…</b></div></div>';
  tpLigaPeriodo(()=>TP_PAGINAS.tfalertas());
  $('.tp-per')&&($('.tp-per').style.display='none');
  tpSaudeChip().then(h=>{const b=$('#tpSaudeBox');if(b){b.innerHTML=h;const bt=$('#tpSaude');if(bt)bt.onclick=tpAbrirSaude}});
  await adsCarregaModo();
  let snap={alertas:[],limites:{}},ex={regras:{},relatorioSemanal:false,gestao:false},lim=[];
  try{[snap,ex,lim]=await Promise.all([api('/traffic/snapshots'),api('/ads/extras'),api('/ads/limites').then(r=>r.rows).catch(()=>[])])}catch(e){$('#tpPg').innerHTML=`<div class="empty-rich"><strong>Não foi possível carregar</strong><p>${esc(e.message)}</p></div>`;return}
  const r=ex.regras,l=snap.limites||{},admin=!!internalSession.admin;
  $('#tpPg').innerHTML=`<div class="db-dois"><div class="db-bloco"><h3>Alertas ativos</h3>${snap.alertas.length?snap.alertas.map(x=>`<div class="tf-alerta ${x.severidade==='critico'?'critico':'atencao'}"><span class="tf-sev"><b aria-hidden="true">${x.severidade==='critico'?'⛔':'⚠'}</b> ${x.severidade==='critico'?'Crítico':'Atenção'}</span><div><b>${esc(x.regra)}</b> · ${esc(x.campanha)}<br><small>${esc(x.mensagem)}</small></div></div>`).join(''):'<div class="tf-ok"><b aria-hidden="true">✓</b> Nenhum alerta no momento.</div>'}
     <h4 style="margin-top:14px">Limites de investimento</h4>${lim.length?`<ul class="tp-lista">${lim.map(x=>`<li>${x.atingido?'⚠':'○'} <b>${esc(x.nome)}</b> <small>${x.gasto===null?'sem dado':esc(gmBrl(x.gasto))+' de '+(x.limite===null?'—':esc(gmBrl(x.limite)))}</small></li>`).join('')}</ul>`:'<small class="kpi-note">Nenhum limite definido. Defina em Orçamentos.</small>'} <button class="db-link" id="alOrc">Editar limites em Orçamentos ›</button></div>
    <div class="db-bloco"><h3>Referências dos alertas</h3><p class="kpi-note">Os alertas só disparam com dados suficientes e citam o número que os gerou.</p>
     <form id="alLim" class="cm-form"><label>CTR mínimo (%)<input class="control" id="lmCtr" type="number" step="0.1" value="${attr(l.ctrMin)}" ${admin?'':'disabled'}></label><label>Frequência máxima<input class="control" id="lmFreq" type="number" step="0.1" value="${attr(l.frequenciaMax)}" ${admin?'':'disabled'}></label><label>Gasto sem resultado (R$)<input class="control" id="lmGasto" type="number" step="1" value="${attr(l.gastoSemResultado)}" ${admin?'':'disabled'}></label><label>Impressões mínimas<input class="control" id="lmImpr" type="number" step="100" value="${attr(l.impressoesMin)}" ${admin?'':'disabled'}></label>
      <div class="actions wide">${admin?'<button class="btn" type="submit">Salvar referências</button>':'<small class="kpi-note">Só o Administrador altera as referências.</small>'}</div></form></div></div>
   <div class="db-bloco" style="margin-top:12px"><h3>Automações</h3>${ex.gestao?`<p class="kpi-note">O sistema olha os anúncios ativos a cada hora e avisa (notificação e e-mail) ou, se você autorizar, pausa o que cumprir a regra. Só mexe em anúncios ativos, respeita os tetos, não repete a mesma execução e registra tudo no histórico.</p>
     <label class="check-row"><input type="checkbox" id="rgAtiva" ${r.ativa?'checked':''}> Ligar a regra automática (padrão: desligada)</label>
     <div class="st-row"><label>Quando um anúncio gastar (R$) ou mais…<input class="control" id="rgGasto" type="number" min="0" step="5" value="${attr(r.gastoSemResultado)}"></label><label>…em quantos dias<input class="control" id="rgDias" type="number" min="1" max="30" value="${attr(r.dias)}"></label></div>
     <p class="kpi-note">…sem nenhum resultado (conversa ou lead). Use 0 para desligar esta regra.</p>
     <label>Avisar também quando o custo por resultado passar de (R$; 0 = desligado)<input class="control" id="rgCusto" type="number" min="0" step="1" value="${attr(r.custoMax)}"></label>
     <label>O que fazer<select class="control" id="rgAcao"><option value="AVISAR" ${r.acao==='AVISAR'?'selected':''}>Só avisar (recomendado)</option><option value="PAUSAR" ${r.acao==='PAUSAR'?'selected':''}>Pausar o anúncio e avisar</option></select></label>
     <label class="check-row" id="rgAutW" ${r.acao==='PAUSAR'?'':'hidden'}><input type="checkbox" id="rgAut"> Autorizo o sistema a pausar anúncios sozinho quando a regra for cumprida</label>
     <div class="int-actions"><button class="softbtn" id="rgSim" type="button">Ver o que a regra pegaria agora</button><button class="btn" id="rgSalva" type="button">Salvar regra</button></div><div id="rgOut"></div>`:'<p class="kpi-note">As automações que alteram anúncios ficam disponíveis com o modo completo ligado (Configurações → Integrações).</p>'}
     <h4 style="margin-top:14px">Relatório semanal por e-mail</h4><label class="check-row"><input type="checkbox" id="rsAtivo" ${ex.relatorioSemanal?'checked':''}> Enviar toda segunda-feira o resumo da semana anterior</label><button class="softbtn" id="rsAgora" type="button">Enviar um agora (teste)</button></div>`;
  $('#alOrc').onclick=()=>go('tforcamentos');
  const gp=(u,b)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});
  if(admin)$('#alLim').onsubmit=async e=>{e.preventDefault();try{await gp('/integrations/ads/config',{ctrMin:+$('#lmCtr').value,frequenciaMax:+$('#lmFreq').value,gastoSemResultado:+$('#lmGasto').value,impressoesMin:+$('#lmImpr').value});toast('Referências salvas');TP_PAGINAS.tfalertas()}catch(x){toast(x.message,'bad')}};
  else $('#alLim').onsubmit=e=>e.preventDefault();
  if($('#rgSalva')){
    $('#rgAcao').onchange=e=>{$('#rgAutW').hidden=e.target.value!=='PAUSAR'};
    const regra=()=>({ativa:$('#rgAtiva').checked,gastoSemResultado:Number($('#rgGasto').value),dias:Number($('#rgDias').value),custoMax:Number($('#rgCusto').value),acao:$('#rgAcao').value});
    $('#rgSalva').onclick=async()=>{const b=regra();if(b.ativa&&b.acao==='PAUSAR'&&!$('#rgAut').checked)return toast('Para pausar sozinho, marque a autorização.','warn');try{await gp('/ads/regras',b);toast('Regra salva');TP_PAGINAS.tfalertas()}catch(e){toast(e.message,'warn')}};
    $('#rgSim').onclick=async()=>{const o=$('#rgOut');o.textContent='Lendo a conta…';try{await gp('/ads/regras',regra());const x=await gp('/ads/regras/simular');o.innerHTML=x.achados.length?`<ul class="tp-lista">${x.achados.map(a=>`<li><b>${esc(a.anuncio)}</b> (${esc(a.campanha)}): ${esc(a.motivo)}</li>`).join('')}</ul>`:'<p>Nenhum anúncio cumpre a regra agora.</p>'}catch(e){o.textContent=e.message}};
  }
  $('#rsAtivo').onchange=async e=>{try{await gp('/ads/relatorio-semanal',{ativo:e.target.checked});toast(e.target.checked?'Relatório semanal ligado':'Relatório semanal desligado')}catch(x){toast(x.message,'warn')}};
  $('#rsAgora').onclick=async()=>{try{await gp('/ads/relatorio-semanal',{enviarAgora:true});toast('E-mail enviado (se o e-mail de avisos estiver configurado)')}catch(e){toast(e.message,'warn')}};
};

// ================= Relatórios =================
const TP_REL_MODELOS={
 geral:{r:'Desempenho geral',nivel:'campanha',cols:['nome','estado','gasto','impressoes','alcance','cliques','ctr','conversas','custoConversa','resultados','custoResultado'],graf:'linha'},
 investimento:{r:'Investimento',nivel:'campanha',cols:['nome','estado','orcamento','gasto','criado','inicio'],graf:'barras'},
 conversas:{r:'Conversas',nivel:'campanha',cols:['nome','estado','gasto','conversas','custoConversa','leads','cpl'],graf:'barras'},
 campanhas:{r:'Campanhas',nivel:'campanha',cols:['nome','estado','objetivo','segmento','gasto','impressoes','alcance','frequencia','cliques','ctr','cpc','cpm','conversas','custoConversa','resultados','custoResultado'],graf:'barras'},
 criativos:{r:'Criativos',nivel:'anuncio',cols:['nome','pai','formato','estado','gasto','alcance','cliques','ctr','conversas','custoResultado'],graf:'barras'},
 publicos:{r:'Públicos',nivel:'conjunto',cols:['nome','pai','publico','segmento','gasto','alcance','ctr','conversas','custoConversa'],graf:'barras'},
 segmentos:{r:'Segmentos escolares',nivel:'campanha',agrupar:'segmento',cols:['segmento','gasto','impressoes','alcance','cliques','conversas','custoConversa'],graf:'empilhado'},
 mensal:{r:'Resumo mensal',nivel:'mensal',cols:[],graf:'linha'},
};
const TPR={m:'geral',campanhas:new Set(),segs:new Set(),cols:null,graf:'barras',comparar:false,met:'gasto'};
TP_PAGINAS.tfrelatorios=async function(){
  state.module=null;
  $('#content').innerHTML=tpCabecalho('Relatórios de anúncios','Escolha o modelo, o período, as campanhas, os segmentos, as métricas e o gráfico. Exporte em PDF, Excel ou CSV.')+'<div class="card" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px"><div><b>Dashboard semanal de Tráfego (PDF)</b><div class="kpi-note">O relatório aprovado, no período escolhido acima (você ainda pode mudar as datas dentro dele), com indicadores do mês e da semana, gráfico diário, resumo por campanha e detalhamento por anúncio com foto.</div></div><a class="btn" href="/relatorio-trafego.html" id="tpRelSemanal">Abrir o relatório semanal</a></div><div id="tpPg"><div class="loading"><span></span><b>Lendo a conta…</b></div></div>';
  tpPosCabecalho(()=>TP_PAGINAS.tfrelatorios());
  tpLinkRelatorio($('#tpRelSemanal'));
  const d=await tpCarregaOuErro('tfrelatorios');if(!d)return;
  const modelos=await tpPrefGet('trafego.rel.modelos',[]);
  const aplicaModelo=k=>{const m=TP_REL_MODELOS[k];TPR.m=k;TPR.cols=[...m.cols];TPR.graf=m.graf};
  if(!TPR.cols)aplicaModelo(TPR.m);
  const desenha=async()=>{
    const m=TP_REL_MODELOS[TPR.m],mensal=m.nivel==='mensal';
    const camps=d.campanhas.filter(c=>tpEstadoDe(c)!=='ARCHIVED');
    $('#tpPg').innerHTML=`<div class="rl-layout"><aside class="rl-cfg card"><h3>Configuração</h3>
      <label>Modelo<select class="control" id="rlM">${Object.entries(TP_REL_MODELOS).map(([k,x])=>`<option value="${k}" ${TPR.m===k?'selected':''}>${x.r}</option>`).join('')}${modelos.map(x=>`<option value="s:${attr(x.id)}">★ ${esc(x.nome)}</option>`).join('')}</select></label>
      ${mensal?'':`<fieldset><legend>Campanhas</legend><div class="rl-lista">${camps.map(c=>`<label class="check-row"><input type="checkbox" data-rc="${attr(c.id)}" ${TPR.campanhas.has(c.id)?'checked':''}> ${esc(c.nome)}</label>`).join('')}</div><small class="kpi-note">Sem seleção = todas.</small></fieldset>
      <fieldset><legend>Segmentos escolares</legend>${[...TP_SEG.map(s=>s[0]),'não identificado'].map(s=>`<label class="check-row"><input type="checkbox" data-rs="${attr(s)}" ${TPR.segs.has(s)?'checked':''}> ${esc(s)}</label>`).join('')}</fieldset>
      <fieldset><legend>Colunas e métricas</legend><div class="rl-lista">${colsDoNivel(m.nivel).map(c=>`<label class="check-row"><input type="checkbox" data-rcol="${c.k}" ${TPR.cols.includes(c.k)?'checked':''}> ${esc(c.r)}</label>`).join('')}</div></fieldset>`}
      <label>Gráfico<select class="control" id="rlG"><option value="barras" ${TPR.graf==='barras'?'selected':''}>Barras por item</option><option value="linha" ${TPR.graf==='linha'?'selected':''}>Evolução por dia (conta)</option><option value="empilhado" ${TPR.graf==='empilhado'?'selected':''}>Barras empilhadas por segmento</option></select></label>
      <label>Métrica do gráfico<select class="control" id="rlMt">${TP_METS.map(([k,l])=>`<option value="${k}" ${TPR.met===k?'selected':''}>${l}</option>`).join('')}</select></label>
      ${mensal?'':'<label class="check-row"><input type="checkbox" id="rlCmp" '+(TPR.comparar?'checked':'')+'> Comparar com o período anterior</label>'}
      <div class="int-actions"><button class="softbtn" id="rlSalvaM" type="button">Salvar como modelo</button></div></aside>
     <section class="rl-prev"><div class="rl-exp"><b id="rlTit"></b><span class="cm-esp"></span><button class="softbtn" data-rx="csv">CSV</button><button class="softbtn" data-rx="xlsx">Excel</button><button class="softbtn" data-rx="pdf">PDF</button></div><div id="rlG1" class="db-bloco"></div><div id="rlT" class="tablewrap"></div></section></div>`;
    $('#rlM').onchange=e=>{const v=e.target.value;if(v.startsWith('s:')){const s=modelos.find(x=>x.id===v.slice(2));if(s){TPR.m=s.base;TPR.cols=[...s.cols];TPR.graf=s.graf;TPR.met=s.met||'gasto';TPR.campanhas=new Set(s.campanhas||[]);TPR.segs=new Set(s.segs||[])}}else{aplicaModelo(v)}desenha()};
    $$('[data-rc]').forEach(i=>i.onchange=()=>{i.checked?TPR.campanhas.add(i.dataset.rc):TPR.campanhas.delete(i.dataset.rc);pinta()});
    $$('[data-rs]').forEach(i=>i.onchange=()=>{i.checked?TPR.segs.add(i.dataset.rs):TPR.segs.delete(i.dataset.rs);pinta()});
    $$('[data-rcol]').forEach(i=>i.onchange=()=>{if(i.checked){if(!TPR.cols.includes(i.dataset.rcol))TPR.cols.push(i.dataset.rcol)}else{TPR.cols=TPR.cols.filter(k=>k!==i.dataset.rcol)}pinta()});
    $('#rlG').onchange=e=>{TPR.graf=e.target.value;pinta()};$('#rlMt').onchange=e=>{TPR.met=e.target.value;pinta()};
    $('#rlCmp')&&($('#rlCmp').onchange=async e=>{TPR.comparar=e.target.checked;await pinta()});
    $('#rlSalvaM').onclick=()=>{const nome=prompt('Nome do modelo de relatório:');if(!nome)return;modelos.push({id:'R'+Date.now().toString(36),nome:nome.slice(0,60),base:TPR.m,cols:[...TPR.cols],graf:TPR.graf,met:TPR.met,campanhas:[...TPR.campanhas],segs:[...TPR.segs]});tpPrefSet('trafego.rel.modelos',modelos);toast('Modelo salvo');desenha()};
    await pinta();
  };
  let ultima=null;
  const pinta=async()=>{
    const m=TP_REL_MODELOS[TPR.m];let matriz,tit=`${m.r} · ${fmtDate(d.de)} a ${fmtDate(d.ate)}`,itens=[];
    if(m.nivel==='mensal'){
      let snap={rows:[]};try{snap=await api('/traffic/snapshots')}catch{}
      const por=new Map();(snap.rows||[]).forEach(r=>{const e=por.get(r.periodo)||{gasto:0,impressoes:0,alcance:0,cliques:0,conversas:0,resultados:0};for(const k of Object.keys(e))e[k]+=Number(r[k])||0;por.set(r.periodo,e)});
      const meses=[...por.keys()].sort();
      matriz=[['Mês','Investimento','Impressões','Cliques','Conversas','Custo por conversa','Resultados'],...meses.map(k=>{const e=por.get(k);return [k,e.gasto,e.impressoes,e.cliques,e.conversas,e.conversas?+(e.gasto/e.conversas).toFixed(2):'',e.resultados]})];
      itens=meses.map(k=>({nome:k,v:por.get(k)[TPR.met==='gasto'?'gasto':TPR.met==='conversas'?'conversas':TPR.met==='cliques'?'cliques':TPR.met==='impressoes'?'impressoes':'gasto'],g:por.get(k).gasto}));
      tit=`${m.r} · todos os meses sincronizados`;
    }else{
      let l=tpFlat(m.nivel).filter(x=>tpEstadoDe(x)!=='ARCHIVED');
      if(TPR.campanhas.size)l=l.filter(x=>TPR.campanhas.has(x._campanha));
      if(TPR.segs.size)l=l.filter(x=>TPR.segs.has(tpSegDe(x)||'não identificado'));
      l=[...l].sort((a,b)=>b.gasto-a.gasto);itens=l;
      if(m.agrupar==='segmento'){const g=new Map();l.forEach(x=>{const k=tpSegDe(x)||'não identificado';const e=g.get(k)||{nome:k,segmento:k,gasto:0,impressoes:0,alcance:0,cliques:0,conversas:0,leads:0,resultados:0};for(const c of ['gasto','impressoes','alcance','cliques','conversas','leads','resultados'])e[c]+=Number(x[c])||0;g.set(k,e)});itens=[...g.values()].map(e=>({...e,ctr:e.impressoes?e.cliques/e.impressoes*100:null,custoConversa:e.conversas?e.gasto/e.conversas:null}))}
      const cols=TPR.cols.map(k=>TP_COL[k]||{k,r:k,v:x=>x[k]}).filter(Boolean);
      const val=(c,x)=>{if(c.exp)return c.exp(x);let v=c.v(x);if(c.k==='estado')v=x.estado||x.status;else if(c.k==='inicio')v=gmInicioDe(x);return v===null||v===undefined||v==='9999'?'':(typeof v==='number'?+v.toFixed(2):v)};
      matriz=[cols.map(c=>c.r),...itens.map(x=>cols.map(c=>c.k==='segmento'&&x.segmento?x.segmento:val(c,x)))];
      if(TPR.comparar){try{const {de,ate}=tpPeriodo();const n=Math.round((new Date(ate+'T12:00:00')-new Date(de+'T12:00:00'))/86400000)+1,ad=new Date(de+'T12:00:00');ad.setDate(ad.getDate()-1);const ai=new Date(ad);ai.setDate(ai.getDate()-(n-1));const t=await api(`/ads/arvore?de=${tpIso(ai)}&ate=${tpIso(ad)}&arquivados=1`);const mapa=new Map(tpFlat(m.nivel,t).map(x=>[x.id,x]));matriz[0].push('Investimento (período anterior)','Variação');itens.forEach((x,i)=>{const a=mapa.get(x.id);matriz[i+1].push(a?+a.gasto.toFixed(2):'',a&&a.gasto?`${((x.gasto-a.gasto)/a.gasto*100).toFixed(1)}%`:'')})}catch{toast('Não foi possível ler o período anterior','warn')}}
    }
    ultima={matriz,tit};
    $('#rlTit').textContent=tit;
    const t=$('#rlT');t.innerHTML=`<table class="datatable"><thead><tr>${matriz[0].map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${matriz.slice(1,201).map(r=>`<tr>${r.map(v=>`<td>${esc(String(v))}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${matriz[0].length}" class="empty compact">Nada para mostrar.</td></tr>`}</tbody></table>${matriz.length>201?'<small class="kpi-note">Mostrando as 200 primeiras linhas; a exportação leva todas.</small>':''}`;
    const g=$('#rlG1');
    if(TPR.graf==='linha'){let dia=[];try{dia=(await api('/traffic/painel')).diario.filter(x=>x.dia>=d.de&&x.dia<=d.ate)}catch{}EvoCharts.linha(g,{dados:dia.map(x=>({x:x.dia,v:Number(x[TPR.met])||0})),series:[{k:'v',nome:(TP_COL[TPR.met]||{}).r||TPR.met,fmt:tpFmtMet[TPR.met]||gmN}],altura:210,rotuloAcessivel:'Evolução diária da conta'})}
    else if(TPR.graf==='empilhado'){const segs=[...new Set(itens.map(x=>tpSegDe(x)||'não identificado'))];const camps=[...new Set(itens.map(x=>x.nome))].slice(0,8);EvoCharts.empilhadas(g,{x:camps.map(c=>c.slice(0,16)),series:segs.map(s=>({nome:s,valores:camps.map(c=>itens.filter(x=>x.nome===c&&(tpSegDe(x)||'não identificado')===s).reduce((a,x)=>a+(Number(x.gasto)||0),0))})),fmt:v=>gmBrl(v)})}
    else EvoCharts.barras(g,{itens:itens.slice(0,10).map(x=>({nome:x.nome,v:x.v!==undefined?x.v:(TP_COL[TPR.met]?TP_COL[TPR.met].v(x):null),thumb:x.foto||''})),fmt:tpFmtMet[TPR.met]||gmBrl,vazio:'Sem dados para o gráfico.'});
    $$('[data-rx]').forEach(b=>b.onclick=()=>exporta(b.dataset.rx));
  };
  const exporta=async tipo=>{
    if(!ultima)return;const nome=`relatorio-${TPR.m}-${d.de}_a_${d.ate}`;
    if(tipo==='csv'){const csv='﻿'+ultima.matriz.map(l=>l.map(v=>{const s=String(v??'');return /[";\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(';')).join('\r\n');return tpBaixa(new Blob([csv],{type:'text/csv;charset=utf-8'}),nome+'.csv')}
    if(tipo==='xlsx'){try{const r=await fetch(API+'/reports/xlsx',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-EVO':'1'},body:JSON.stringify({titulo:ultima.tit,abas:[{nome:TP_REL_MODELOS[TPR.m].r,linhas:ultima.matriz}]})});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Falha ao gerar o Excel');return tpBaixa(await r.blob(),nome+'.xlsx')}catch(e){return toast(e.message,'bad')}}
    tpImprimir(ultima.tit,ultima.matriz);
  };
  desenha();
};

// ================= Histórico =================
TP_PAGINAS.tfhistorico=async function(){
  state.module=null;
  $('#content').innerHTML=`<div class="tp-topo"><div class="tf-head" style="margin:0"><div><small>TRÁFEGO PAGO</small><h1>Histórico</h1><p>Tudo o que foi alterado em anúncios pelo EVO MKT: quem, quando, o quê, valores anteriores e novos, e o resultado.</p></div></div><div class="tp-topo-d"><span id="tpSaudeBox"></span></div></div><div id="tpPg"><div class="loading"><span></span><b>Carregando…</b></div></div>`;
  tpSaudeChip().then(h=>{const b=$('#tpSaudeBox');if(b){b.innerHTML=h;const bt=$('#tpSaude');if(bt)bt.onclick=tpAbrirSaude}});
  let rows=[];try{rows=(await api('/ads/acoes')).rows||[]}catch(e){$('#tpPg').innerHTML=`<div class="empty-rich"><strong>Não foi possível carregar</strong><p>${esc(e.message)}</p></div>`;return}
  const F={q:'',res:'',nivel:''};
  const desenha=()=>{
    const q=F.q.toLowerCase();const l=rows.filter(x=>(!F.res||x.resultado===F.res)&&(!F.nivel||x.nivel===F.nivel)&&(!q||`${x.nome} ${x.quem} ${x.acao} ${x.objeto_id}`.toLowerCase().includes(q)));
    $('#tpPg').innerHTML=`<div class="tp-barra"><input type="search" class="control tp-busca" id="hsQ" placeholder="Pesquisar item, usuário ou operação" value="${attr(F.q)}" aria-label="Pesquisar"><select class="control" id="hsR" aria-label="Resultado"><option value="">Resultado: todos</option><option ${F.res==='OK'?'selected':''}>OK</option><option ${F.res==='ERRO'?'selected':''}>ERRO</option></select><select class="control" id="hsN" aria-label="Nível"><option value="">Nível: todos</option>${['campanha','conjunto','anuncio'].map(n=>`<option ${F.nivel===n?'selected':''}>${n}</option>`).join('')}</select></div>
     <div class="tablewrap"><table class="datatable"><thead><tr><th>Data e hora</th><th>Usuário</th><th>Operação</th><th>Item</th><th>Valores anteriores</th><th>Valores novos</th><th>Resultado</th></tr></thead><tbody>${l.map(x=>`<tr><td>${esc(fmtDateTime(x.quando))}</td><td>${esc(x.quem)}</td><td>${esc(x.acao)}</td><td>${esc(x.nome)}<br><small>${esc(x.nivel)} · ${esc(x.objeto_id)}</small></td><td><small>${esc(x.antes)}</small></td><td><small>${esc(x.depois)}</small></td><td><span class="badge ${x.resultado==='OK'?'ok':'bad'}">${esc(x.resultado)}</span>${x.erro?`<br><small>${esc(x.erro)}</small>`:''}</td></tr>`).join('')||'<tr><td colspan="7" class="empty compact">Nenhuma operação registrada.</td></tr>'}</tbody></table></div>
     <p class="kpi-note">${l.length} registro(s) (os 100 mais recentes). Este é o histórico local do EVO MKT; alterações feitas direto na Meta não aparecem aqui e este registro não substitui o histórico completo da Meta.</p>
     <details class="card tf-manual" id="hsMetaBox" open><summary>Atividade registrada na Meta (inclui o que foi feito direto na Meta)</summary><div id="hsMeta"><small class="kpi-note">Carregando…</small></div></details>
     <details class="card tf-manual"><summary>Registros manuais antigos de mídia paga</summary><div id="hsManual"><small class="kpi-note">Carregando…</small></div></details>`;
    $('#hsQ').oninput=e=>{F.q=e.target.value;clearTimeout(desenha.t);desenha.t=setTimeout(()=>{desenha();const i=$('#hsQ');i.focus();i.setSelectionRange(i.value.length,i.value.length)},250)};$('#hsR').onchange=e=>{F.res=e.target.value;desenha()};$('#hsN').onchange=e=>{F.nivel=e.target.value;desenha()};
    api('/ads/atividade').then(r=>{const m=r.rows||[];const bx=$('#hsMeta');if(!bx)return;bx.innerHTML=m.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Data e hora</th><th>Quem</th><th>O que aconteceu</th><th>Item</th></tr></thead><tbody>${m.map(x=>`<tr><td>${esc(fmtDateTime(x.quando))}</td><td>${esc(x.quem)}</td><td>${esc(x.evento)}</td><td>${esc(x.objeto)}${x.tipo?` <small>(${esc(x.tipo.toLowerCase())})</small>`:''}</td></tr>`).join('')}</tbody></table></div><p class="kpi-note">Lido da Meta (as 100 atividades mais recentes da conta).</p>`:'<small class="kpi-note">A Meta não devolveu atividades.</small>'}).catch(e=>{const bx=$('#hsMeta');if(bx)bx.innerHTML=`<small class="kpi-note">Não foi possível ler a atividade da Meta: ${esc(e.message)}</small>`});
    getRows('trafego').then(r=>{const m=r.rows||[];$('#hsManual').innerHTML=m.length?`<div class="tablewrap"><table class="datatable"><thead><tr><th>Período</th><th>Investimento</th><th>Impressões</th><th>Cliques</th><th>Conversas</th><th>Leads</th></tr></thead><tbody>${m.map(x=>`<tr><td>${esc(x.titulo||'')}</td><td>${esc(money(x.investimento))}</td><td>${esc(String(x.impressoes||''))}</td><td>${esc(String(x.cliques||''))}</td><td>${esc(String(x.conversas||''))}</td><td>${esc(String(x.leads||''))}</td></tr>`).join('')}</tbody></table></div>`:'<small class="kpi-note">Nenhum registro manual.</small>'}).catch(()=>{});
  };
  desenha();
};
