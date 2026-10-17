// Tráfego (visual novo): leitura da Meta em um painel só. Dados: /traffic/painel (mês, 30 dias, anúncios, pacing) e /traffic/snapshots (campanhas, alertas).
// Regras do gráfico: uma série por gráfico, eixo único, linha 2px, marcador com anel, dica ao passar o mouse e por teclado, tabela como alternativa.
let tfMetrica='gasto',tfDias=30,tfOrd={k:'status',d:1},tfOrdC={k:'status',d:1},tfDados=null,tfSnap=null;
const TF_MET={gasto:['Investimento','brl'],conversas:['Conversas iniciadas','n'],resultados:['Resultados','n'],cliques:['Cliques','n'],impressoes:['Impressões','n']};
const tfMes=p=>{const [a,m]=String(p).split('-');return ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][+m-1]+' de '+a};
const tfBrl=(v,m)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:m||(tfDados&&tfDados.mes.moeda)||'BRL'});
const tfN=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
const tfCompacto=v=>{const a=Math.abs(v);return a>=1e6?(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi':a>=1e3?(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:a>=1e4?0:1})+' mil':String(Math.round(v*100)/100).replace('.',',')};
const tfFmt=(v,tipo)=>tipo==='brl'?tfBrl(v):tfN(v);
const tfPct=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
// delta: sinal + seta (nunca só cor); "bomOuRuim": 1 = subir é bom, -1 = subir é ruim, 0 = neutro
function tfDelta(atual,ant,bom,rotulo){if(!ant)return `<span class="tf-d">sem ${esc(rotulo)} para comparar</span>`;const p=Math.round((atual-ant)/ant*100);if(!p)return `<span class="tf-d">= ${esc(rotulo)}</span>`;const cl=bom===0?'':((p>0)===(bom>0)?'bom':'ruim');return `<span class="tf-d ${cl}"><b aria-hidden="true">${p>0?'▲':'▼'}</b> ${p>0?'+':''}${p}% vs ${esc(rotulo)}</span>`}
const TF_PESO={ACTIVE:0,PENDING_REVIEW:1,IN_PROCESS:1,WITH_ISSUES:2,DISAPPROVED:2,PAUSED:3,CAMPAIGN_PAUSED:3,ADSET_PAUSED:3,ARCHIVED:5};
const tfPeso=st=>{const k=String(st||'').toUpperCase();return k in TF_PESO?TF_PESO[k]:4};
const tfStatusRot=st=>{const k=String(st||'').toUpperCase();return k==='ACTIVE'?'Ativo':/PAUSED/.test(k)?'Pausado':/DISAPPROVED|WITH_ISSUES/.test(k)?'Com problema':/PENDING|IN_PROCESS/.test(k)?'Em análise':k==='ARCHIVED'?'Arquivado':(st||'—')};
const tfStatusHtml=st=>{const k=String(st||'').toUpperCase();return /DISAPPROVED|WITH_ISSUES/.test(k)?'<span class="tf-st ruim"><b aria-hidden="true">⚠</b> Com problema</span>':k==='ACTIVE'?'<span class="tf-st ok"><b aria-hidden="true">●</b> Ativo</span>':/PAUSED/.test(k)?'<span class="tf-st"><b aria-hidden="true">❚❚</b> Pausado</span>':/PENDING|IN_PROCESS/.test(k)?'<span class="tf-st"><b aria-hidden="true">◔</b> Em análise</span>':`<span class="tf-st">${esc(tfStatusRot(st))}</span>`};
const tfInicioTxt=v=>{const d=String(v||'').slice(0,10);return /^\d{4}-\d\d-\d\d$/.test(d)?fmtDate(d):'—'};
function tfSpark(vals,cor){if(vals.filter(v=>v>0).length<2)return '';const w=96,h=28,mx=Math.max(...vals,1),pts=vals.map((v,i)=>`${(i*(w-4)/(vals.length-1)+2).toFixed(1)},${(h-3-(v/mx)*(h-8)).toFixed(1)}`);return `<svg class="tf-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="var(--tf-mute)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.slice(0,-1).join(' ')} ${pts.at(-2)}"/><polyline fill="none" stroke="${cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.slice(-2).join(' ')}"/><circle cx="${pts.at(-1).split(',')[0]}" cy="${pts.at(-1).split(',')[1]}" r="3" fill="${cor}"/></svg>`}
function tfDica(){let t=document.getElementById('tfDica');if(!t){t=document.createElement('div');t.id='tfDica';t.className='tf-dica';t.setAttribute('role','status');t.hidden=true;document.body.appendChild(t)}return t}
function tfMostra(ev,linhas){const t=tfDica();t.textContent='';linhas.forEach((l,i)=>{const d=document.createElement('div');if(i===0){d.className='tf-dica-v';d.textContent=l}else{d.className='tf-dica-s';d.textContent=l}t.appendChild(d)});t.hidden=false;const r=t.getBoundingClientRect();let x=ev.clientX+14,y=ev.clientY-r.height-10;if(x+r.width>innerWidth-8)x=ev.clientX-r.width-14;if(y<8)y=ev.clientY+16;t.style.left=x+'px';t.style.top=y+'px'}
const tfEscondeDica=()=>{const t=document.getElementById('tfDica');if(t)t.hidden=true};

function tfGrafico(){
  const d=tfDados.diario.slice(-tfDias),[rot,tipo]=TF_MET[tfMetrica];
  if(d.length<2)return '<div class="empty compact">Ainda sem dias suficientes. Clique em “Atualizar agora”.</div>';
  const W=640,H=240,L=46,R=64,T=14,B=28,vals=d.map(x=>Number(x[tfMetrica])||0),mx=Math.max(...vals,1);
  const passo=(()=>{const c=[1,2,5,10,20,25,50,100,200,250,500,1000,2000,5000,10000,20000,50000,100000];return c.find(x=>mx/x<=4)||200000})(),topo=Math.ceil(mx/passo)*passo;
  const x=i=>L+i*(W-L-R)/(d.length-1),y=v=>T+(H-T-B)*(1-v/topo);
  let g='';for(let v=0;v<=topo;v+=passo)g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="tf-grade"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" class="tf-eixo">${tfCompacto(v)}</text>`;
  const cada=Math.ceil(d.length/7);d.forEach((p,i)=>{if(i%cada===0||i===d.length-1)g+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle" class="tf-eixo">${esc(String(p.dia).slice(8,10)+'/'+String(p.dia).slice(5,7))}</text>`});
  const linha=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),ult=vals.length-1;
  return `<svg class="tf-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(rot)} por dia, últimos ${d.length} dias" tabindex="0" id="tfSvg">${g}
   <polygon points="${L},${y(0)} ${linha} ${x(ult).toFixed(1)},${y(0)}" class="tf-area"/><polyline points="${linha}" class="tf-linha"/>
   <line id="tfCruz" class="tf-cruz" y1="${T}" y2="${H-B}" x1="0" x2="0" visibility="hidden"/><circle id="tfPonto" r="5" class="tf-ponto" visibility="hidden"/>
   <circle cx="${x(ult)}" cy="${y(vals[ult])}" r="4" class="tf-ponto"/><text x="${x(ult)+9}" y="${y(vals[ult])+4}" class="tf-fim">${esc(tipo==='brl'?tfCompacto(vals[ult]):tfN(vals[ult]))}</text>
   <rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent" id="tfAlvo"/></svg>`;
}
function tfLigaGrafico(){
  const svg=document.getElementById('tfSvg');if(!svg)return;
  const d=tfDados.diario.slice(-tfDias),[rot,tipo]=TF_MET[tfMetrica],W=640,L=46,R=64;let idx=d.length-1;
  const vals=d.map(v=>Number(v[tfMetrica])||0),mx=Math.max(...vals,1);
  const passo=(()=>{const c=[1,2,5,10,20,25,50,100,200,250,500,1000,2000,5000,10000,20000,50000,100000];return c.find(x=>mx/x<=4)||200000})(),topo=Math.ceil(mx/passo)*passo,H=240,T=14,B=28;
  const x=i=>L+i*(W-L-R)/(d.length-1),y=v=>T+(H-T-B)*(1-v/topo);
  const mostra=(i,ev)=>{idx=Math.max(0,Math.min(d.length-1,i));const p=d[idx],cz=document.getElementById('tfCruz'),pt=document.getElementById('tfPonto');cz.setAttribute('x1',x(idx));cz.setAttribute('x2',x(idx));cz.setAttribute('visibility','visible');pt.setAttribute('cx',x(idx));pt.setAttribute('cy',y(vals[idx]));pt.setAttribute('visibility','visible');
    const o=[fmtDate(String(p.dia).slice(0,10)),`${rot}: ${tfFmt(vals[idx],tipo)}`];Object.keys(TF_MET).filter(k=>k!==tfMetrica).forEach(k=>o.push(`${TF_MET[k][0]}: ${tfFmt(p[k],TF_MET[k][1])}`));
    const r=svg.getBoundingClientRect(),e=ev||{clientX:r.left+x(idx)/W*r.width,clientY:r.top+30};tfMostra(e,[`${tfFmt(vals[idx],tipo)}`,...o.slice(0,1),...o.slice(2)])};
  const alvo=document.getElementById('tfAlvo');
  alvo.onpointermove=ev=>{const r=svg.getBoundingClientRect(),px=(ev.clientX-r.left)/r.width*W;mostra(Math.round((px-L)/((W-L-R)/(d.length-1))),ev)};
  alvo.onpointerleave=()=>{tfEscondeDica();['tfCruz','tfPonto'].forEach(i=>document.getElementById(i).setAttribute('visibility','hidden'))};
  svg.onkeydown=ev=>{if(ev.key==='ArrowLeft'){ev.preventDefault();mostra(idx-1)}else if(ev.key==='ArrowRight'){ev.preventDefault();mostra(idx+1)}else if(ev.key==='Escape')alvo.onpointerleave()};
  svg.onblur=()=>alvo.onpointerleave();
}
function tfBarras(){
  const per=tfDados.periodo,rows=(tfSnap.rows||[]).filter(r=>r.periodo===per&&Number(r.gasto)>0).sort((a,b)=>b.gasto-a.gasto);
  if(!rows.length)return '<div class="empty compact">Nenhuma campanha com gasto neste mês.</div>';
  const mx=Math.max(...rows.map(r=>Number(r.gasto)),1),topo=rows.slice(0,8),resto=rows.slice(8);
  const linha=r=>{const g=Number(r.gasto),res=Number(r.resultados),w=Math.max(2,g/mx*100);return `<div class="tf-bar" tabindex="0" data-g="${attr(tfBrl(g,r.moeda))}" data-r="${attr(tfN(Number(r.conversas))+' conversa(s) iniciada(s)'+(Number(r.conversas)?' · '+tfBrl(g/Number(r.conversas),r.moeda)+' por conversa':'')+' · '+tfN(res)+' resultado(s)')}" data-n="${attr(r.campanha)}"><span class="tf-bar-n" title="${attr(r.campanha)}">${esc(r.campanha)}</span><span class="tf-bar-t"><i style="width:${w}%"></i></span><b>${esc(tfBrl(g,r.moeda))}</b></div>`};
  return topo.map(linha).join('')+(resto.length?`<p class="tf-nota">+ ${resto.length} campanha(s) com gasto menor (${esc(tfBrl(resto.reduce((s,r)=>s+Number(r.gasto),0)))} no total). Veja todas no Gerenciador.</p>`:'');
}
function tfOrdena(lista,ord,val){const f=val[ord.k]||val.status;return [...lista].sort((a,b)=>{const x=f(a),y=f(b);const c=x<y?-1:x>y?1:0;return c?c*ord.d:(val.gasto(b)-val.gasto(a))})}
function tfTh(k,l,ord,attrN){return `<th scope="col" aria-sort="${ord.k===k?(ord.d>0?'ascending':'descending'):'none'}"><button type="button" class="tf-ord" ${attrN}="${k}">${l}${ord.k===k?(ord.d>0?' ▲':' ▼'):''}</button></th>`}
function tfTabelaAnuncios(){
  const ads=[...tfDados.anuncios].filter(a=>a.gasto>0||a.problema||/DISAPPROVED|WITH_ISSUES/i.test(a.status||''));
  const val={status:a=>tfPeso(a.status),inicio:a=>String(a.inicio||'9999'),gasto:a=>a.gasto,conversas:a=>a.conversas,resultados:a=>a.resultados,custo:a=>a.conversas?a.gasto/a.conversas:Infinity,ctr:a=>a.impressoes?a.cliques/a.impressoes:-1,nome:a=>String(a.anuncio).toLowerCase()};
  const l=tfOrdena(ads,tfOrd,val);
  if(!l.length)return '<div class="empty compact">Nenhum anúncio com gasto neste mês.</div>';
  return `<div class="tablewrap"><table class="datatable tf-tab"><thead><tr>${tfTh('nome','Anúncio',tfOrd,'data-ord')}${tfTh('status','Status',tfOrd,'data-ord')}${tfTh('inicio','Início',tfOrd,'data-ord')}${tfTh('gasto','Gasto',tfOrd,'data-ord')}${tfTh('conversas','Conversas iniciadas',tfOrd,'data-ord')}${tfTh('custo','Custo/conversa',tfOrd,'data-ord')}${tfTh('ctr','CTR',tfOrd,'data-ord')}</tr></thead><tbody>${l.slice(0,15).map(a=>`<tr><td><b>${esc(a.anuncio)}</b><br><small>${esc(a.campanha||'')}</small></td><td>${tfStatusHtml(a.status)}</td><td>${esc(tfInicioTxt(a.inicio))}</td><td>${esc(tfBrl(a.gasto,a.moeda))}</td><td>${tfN(a.conversas)}</td><td>${a.conversas?esc(tfBrl(a.gasto/a.conversas,a.moeda)):'—'}</td><td>${a.impressoes?tfPct(a.cliques/a.impressoes*100):'—'}</td></tr>`).join('')}</tbody></table></div>${l.length>15?`<p class="tf-nota">Mostrando 15 de ${l.length} anúncios.</p>`:''}`;
}
function tfTabelaCampanhas(){
  const rows=(tfSnap.rows||[]).filter(r=>r.periodo===tfDados.periodo&&(Number(r.gasto)>0||/ACTIVE/i.test(r.status||'')));
  const val={status:r=>tfPeso(r.status),inicio:r=>String(r.inicio||'9999'),gasto:r=>Number(r.gasto),conversas:r=>Number(r.conversas),custo:r=>Number(r.conversas)?Number(r.gasto)/Number(r.conversas):Infinity,resultados:r=>Number(r.resultados),nome:r=>String(r.campanha).toLowerCase()};
  const l=tfOrdena(rows,tfOrdC,val);
  if(!l.length)return '<div class="empty compact">Nenhuma campanha com gasto neste mês.</div>';
  return `<div class="tablewrap"><table class="datatable tf-tab"><thead><tr>${tfTh('nome','Campanha',tfOrdC,'data-ordc')}${tfTh('status','Status',tfOrdC,'data-ordc')}${tfTh('inicio','Início',tfOrdC,'data-ordc')}${tfTh('gasto','Gasto',tfOrdC,'data-ordc')}${tfTh('conversas','Conversas iniciadas',tfOrdC,'data-ordc')}${tfTh('custo','Custo/conversa',tfOrdC,'data-ordc')}${tfTh('resultados','Resultados',tfOrdC,'data-ordc')}</tr></thead><tbody>${l.map(r=>`<tr><td><b>${esc(r.campanha)}</b></td><td>${tfStatusHtml(r.status)}</td><td>${esc(tfInicioTxt(r.inicio))}</td><td>${esc(tfBrl(r.gasto,r.moeda))}</td><td>${tfN(r.conversas)}</td><td>${Number(r.conversas)?esc(tfBrl(Number(r.gasto)/Number(r.conversas),r.moeda)):'—'}</td><td>${tfN(r.resultados)}</td></tr>`).join('')}</tbody></table></div>`;
}
function tfOrcamento(){
  const pc=tfDados.pacing,gerente=true;
  if(!pc)return `<div class="tf-meter vazio"><small>Orçamento do mês</small><p>Defina quanto pretende investir no mês para acompanhar o ritmo e a projeção.</p>${gerente?'<button class="softbtn" id="tfOrc" type="button">Definir orçamento do mês</button>':''}</div>`;
  const pct=pc.gasto/pc.orcamento*100,proj=pc.projecao/pc.orcamento*100,cl=pct>=100?'perigo':(pct>=85||proj>110)?'alerta':'';
  const txt=proj>100?`No ritmo atual, o mês fecha em ${tfBrl(pc.projecao,pc.moeda)}, acima do orçamento.`:`No ritmo atual, o mês fecha em ${tfBrl(pc.projecao,pc.moeda)}, dentro do orçamento.`;
  return `<div class="tf-meter ${cl}"><small>Orçamento do mês · ${esc(tfBrl(pc.orcamento,pc.moeda))}${gerente?' <button class="tf-link" id="tfOrc" type="button">alterar</button>':''}</small>
   <div class="tf-trilho" role="img" aria-label="Gasto de ${Math.round(pct)}% do orçamento; projeção de ${Math.round(proj)}%"><i style="width:${Math.min(100,pct).toFixed(1)}%"></i><u style="left:${Math.min(100,proj).toFixed(1)}%" title="Projeção"></u></div>
   <div class="tf-meter-l"><span><b>${Math.round(pct)}%</b> gasto (${esc(tfBrl(pc.gasto,pc.moeda))})</span><span>${esc(txt)}</span></div></div>`;
}
function tfAlertas(){
  const a=tfSnap.alertas||[];if(!a.length)return '<div class="tf-ok"><b aria-hidden="true">✓</b> Nenhum alerta no momento.</div>';
  return a.slice(0,6).map(x=>`<div class="tf-alerta ${x.severidade==='critico'?'critico':'atencao'}"><span class="tf-sev"><b aria-hidden="true">${x.severidade==='critico'?'⛔':'⚠'}</b> ${x.severidade==='critico'?'Crítico':'Atenção'}</span><div><b>${esc(x.regra)}</b><br><small>${esc(x.mensagem)}</small></div></div>`).join('')+(a.length>6?`<p class="tf-nota">+ ${a.length-6} alerta(s). Veja todos em Tráfego → Gerenciador.</p>`:'');
}
function tfTabelaDiaria(){const d=tfDados.diario.slice(-tfDias);return `<details class="tf-tabela"><summary>Ver como tabela</summary><div class="tablewrap"><table class="datatable"><thead><tr><th>Dia</th><th>Investimento</th><th>Impressões</th><th>Cliques</th><th>Resultados</th></tr></thead><tbody>${[...d].reverse().map(x=>`<tr><td>${esc(fmtDate(String(x.dia).slice(0,10)))}</td><td>${esc(tfBrl(x.gasto))}</td><td>${tfN(x.impressoes)}</td><td>${tfN(x.cliques)}</td><td>${tfN(x.resultados)}</td></tr>`).join('')}</tbody></table></div></details>`}

function tfDesenha(){
  const d=tfDados,m=d.mes,a=d.mesAnterior,gerente=true,sa=d.saude;
  const cpr=x=>x.resultados?x.gasto/x.resultados:0,ctr=x=>x.impressoes?x.cliques/x.impressoes*100:0;
  const dia=d.diario.slice(-14),mk=(k)=>dia.map(x=>Number(x[k])||0),ctrD=dia.map(x=>x.impressoes?x.cliques/x.impressoes*100:0),cprD=dia.map(x=>x.resultados?x.gasto/x.resultados:0);
  const rotAnt=tfMes(d.anterior).split(' de ')[0];
  const tile=(l,v,dl,sp)=>`<div class="tf-tile"><small>${l}</small><strong>${v}</strong>${dl}${sp}</div>`;
  const corAcento='var(--blue,#063996)';
  const status=sa?`<span class="tf-st ${sa.ok?'ok':'ruim'}"><b aria-hidden="true">${sa.ok?'●':'⚠'}</b> Conta: ${esc(sa.rotulo)}</span>`:'';
  const html=`<div class="tf">
   <div class="tf-head"><div><small>TRÁFEGO PAGO · META ADS · SOMENTE LEITURA</small><h1>Visão do mês</h1><p>${esc(tfMes(d.periodo))}, em andamento. ${d.ultimaSync?`Atualizado em ${esc(fmtDateTime(d.ultimaSync))}.`:'Ainda não sincronizado.'}</p></div>
    <div class="tf-acoes">${status}${gerente?'<button class="softbtn" id="tfAtualiza" type="button">Atualizar agora</button><a class="softbtn" href="/relatorio-trafego.html" target="_blank" rel="noopener">Relatório semanal (PDF)</a>':''}<button class="btn" id="tfGer" type="button">Campanhas e anúncios →</button></div></div>
   <section class="tf-hero card"><div class="tf-hero-n"><small>Investimento em ${esc(tfMes(d.periodo))}</small><strong>${esc(tfBrl(m.gasto))}</strong>${tfDelta(m.gasto,a.gasto,0,rotAnt)}</div>${tfOrcamento()}</section>
   <section class="tf-kpis" aria-label="Indicadores do mês">
    ${tile('Conversas iniciadas',tfN(m.conversas),tfDelta(m.conversas,a.conversas,1,rotAnt),tfSpark(mk('conversas'),corAcento))}
    ${tile('Custo por conversa',m.conversas?tfBrl(m.gasto/m.conversas):'—',tfDelta(m.conversas?m.gasto/m.conversas:0,a.conversas?a.gasto/a.conversas:0,-1,rotAnt),tfSpark(dia.map(x=>x.conversas?x.gasto/x.conversas:0),corAcento))}
    ${tile('Resultados (conversas + leads)',tfN(m.resultados),tfDelta(m.resultados,a.resultados,1,rotAnt),tfSpark(mk('resultados'),corAcento))}
    ${tile('Custo por resultado',m.resultados?tfBrl(cpr(m)):'—',tfDelta(cpr(m),cpr(a),-1,rotAnt),tfSpark(cprD,corAcento))}
    ${tile('Alcance',tfN(m.alcance),tfDelta(m.alcance,a.alcance,1,rotAnt),'')}
    ${tile('Impressões',tfN(m.impressoes),tfDelta(m.impressoes,a.impressoes,0,rotAnt),tfSpark(mk('impressoes'),corAcento))}
    ${tile('Cliques',tfN(m.cliques),tfDelta(m.cliques,a.cliques,1,rotAnt),tfSpark(mk('cliques'),corAcento))}
    ${tile('CTR',m.impressoes?tfPct(ctr(m)):'—',tfDelta(ctr(m),ctr(a),1,rotAnt),tfSpark(ctrD,corAcento))}
   </section>
   <section class="tf-linha2"><div class="card tf-graf"><div class="tf-cab"><h3>Por dia</h3><div class="tf-chips" role="group" aria-label="Métrica">${Object.entries(TF_MET).map(([k,v])=>`<button type="button" class="tf-chip ${tfMetrica===k?'on':''}" data-met="${k}" aria-pressed="${tfMetrica===k}">${v[0]}</button>`).join('')}</div><div class="tf-chips" role="group" aria-label="Período do gráfico">${[7,14,30].map(n=>`<button type="button" class="tf-chip ${tfDias===n?'on':''}" data-dias="${n}" aria-pressed="${tfDias===n}">${n} dias</button>`).join('')}</div></div>${tfGrafico()}${tfTabelaDiaria()}</div>
    <div class="card tf-camp"><div class="tf-cab"><h3>Investimento por campanha</h3></div>${tfBarras()}</div></section>
   <section class="tf-linha3"><div class="card"><div class="tf-cab"><h3>Campanhas</h3><small>Ordene por status ou data de início</small></div>${tfTabelaCampanhas()}</div><div class="card"><div class="tf-cab"><h3>Anúncios do mês</h3><small>Ordene por status ou data de início</small></div>${tfTabelaAnuncios()}</div>
    <div class="card"><div class="tf-cab"><h3>Alertas</h3></div><div class="tf-alertas">${tfAlertas()}</div></div></section>
   <p class="tf-nota tf-rodape">Números lidos da Meta. O EVO MKT não cria, pausa nem altera anúncios neste modo.</p></div>`;
  return html;
}
function tfLiga(){
  $$('[data-met]').forEach(b=>b.onclick=()=>{tfMetrica=b.dataset.met;tfRender()});
  $$('[data-dias]').forEach(b=>b.onclick=()=>{tfDias=+b.dataset.dias;tfRender()});
  const dir=k=>['nome','custo','status','inicio'].includes(k)?1:-1;
  $$('[data-ord]').forEach(b=>b.onclick=()=>{const k=b.dataset.ord;tfOrd=tfOrd.k===k?{k,d:-tfOrd.d}:{k,d:dir(k)};tfRender()});
  $$('[data-ordc]').forEach(b=>b.onclick=()=>{const k=b.dataset.ordc;tfOrdC=tfOrdC.k===k?{k,d:-tfOrdC.d}:{k,d:dir(k)};tfRender()});
  const ger=$('#tfGer');if(ger)ger.onclick=()=>go('gerenciador');
  const at=$('#tfAtualiza');if(at)at.onclick=async()=>{at.disabled=true;at.textContent='Atualizando…';try{const r=await api('/integrations/ads/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});toast(`${r.linhas??0} linha(s) atualizadas`);go('trafego')}catch(e){toast(e.message,'warn');at.disabled=false;at.textContent='Atualizar agora'}};
  const orc=$('#tfOrc');if(orc)orc.onclick=async()=>{const v=prompt('Orçamento de anúncios do mês (R$). Deixe vazio para remover:',tfDados.orcamentoMensal||'');if(v===null)return;try{await api('/integrations/ads/orcamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:Number(String(v).replace(',','.'))||0})});go('trafego')}catch(e){toast(e.message,'warn')}};
  tfLigaGrafico();
  $$('.tf-bar').forEach(el=>{const f=ev=>tfMostra(ev,[el.dataset.g,el.dataset.n,el.dataset.r]);el.onpointermove=f;el.onpointerleave=tfEscondeDica;el.onfocus=()=>{const r=el.getBoundingClientRect();f({clientX:r.left+40,clientY:r.top})};el.onblur=tfEscondeDica});
}
function tfRender(){const c=$('#tfRaiz');if(!c)return;c.innerHTML=tfDesenha();tfLiga()}
// Retorna true se desenhou o painel novo (conta de anúncios escolhida); senão o chamador mostra a tela antiga.
async function trafegoNovo(){
  if(state.page!=='trafego')return false;
  let d,s;try{[d,s]=await Promise.all([api('/traffic/painel'),api('/traffic/snapshots')])}catch{return false}
  if(state.page!=='trafego'||!s.conta)return false;
  tfDados=d;tfSnap=s;
  const manter=['gestorAds','extrasAds'].map(id=>document.getElementById(id)).filter(Boolean);
  const manual=(state.rows||[]).length?document.querySelector('.traffic-cockpit'):null;
  const host=$('#content');host.innerHTML='<div id="tfRaiz"></div>';tfRender();
  if(manual){const dt=document.createElement('details');dt.className='card tf-manual';dt.innerHTML='<summary>Registros manuais antigos</summary>';dt.appendChild(manual);host.appendChild(dt)}
  manter.forEach(n=>host.appendChild(n));
  return true;
}
