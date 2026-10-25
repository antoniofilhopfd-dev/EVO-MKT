/* Monta o relatório A4 de Tráfego Pago (somente leitura). Usado pela página /relatorio-trafego.html (impressão/PDF) e pela pré-visualização
   dentro do EVO MKT (Relatórios), para que os dois mostrem exatamente os mesmos números. Depende de trafego-comum.js. */
const TfRelatorio=(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N0=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0});
const MONEY=v=>v===null||v===undefined?'—':'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const PCT=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const DM=iso=>iso.slice(8,10)+'/'+iso.slice(5,7),DMA=iso=>DM(iso)+'/'+iso.slice(0,4);
const CORES=['#063996','#19A7D8','#FF7800','#7B3FA0','#2E9F5B','#C0392B','#8A5A00','#555555'];
const KPIS=[['Investimento','investimento',MONEY],['Impressões','impressoes',N0],['Alcance','alcance',N0],['Cliques','cliques',N0],['CTR médio','ctr',PCT],['CPC médio','cpc',MONEY],['Conversas iniciadas','conversas',N0],['Custo por conversa','custoConversa',MONEY]];
const varTxt=v=>!v||v.tipo==='sem'?'sem base':v.tipo==='novo'?'novo':v.tipo==='estavel'?'estável':(v.tipo==='subiu'?'▲ ':'▼ ')+Math.abs(v.percentual).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
function kpis(d){return `<div class="kpis m">${KPIS.map(([l,k,f])=>`<div><small>${l}</small><b>${f(d.atual[k])}</b><small>${varTxt(d.variacoes[k])} vs. anterior</small></div>`).join('')}</div>`}
function passo(max){const c=[1,2,5,10,20,25,50,100,200,250,500,1000,2000,5000,10000];return c.find(x=>max/x<=6)||20000}
function grafico(g){
  const W=760,H=270,L=52,R=16,T=48,B=30,n=g.dias.length;
  if(!n||!g.series.length)return '<div class="vazio">Sem investimento por dia neste período.</div>';
  const series=[...g.series.map((s,i)=>({...s,cor:['#063996','#00A1F3','#FF7800','#793A8C'][i%4]})),{nome:'Total',valores:g.total,cor:'#00275F',total:true}];
  const max=Math.max(1,...series.flatMap(s=>s.valores)),st=passo(max),top=Math.ceil(max/st)*st;
  const x=i=>L+(n===1?(W-L-R)/2:i*(W-L-R)/(n-1)),y=v=>T+(H-T-B)*(1-v/top);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Investimento diário por campanha, total tracejado">`;
  for(let v=0;v<=top;v+=st)svg+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#DDD"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end" font-size="10" fill="#444">${v}</text>`;
  const step=Math.max(1,Math.ceil(n/9));g.dias.forEach((d,i)=>{if(i%step===0||i===n-1)svg+=`<text x="${x(i)}" y="${H-10}" text-anchor="middle" font-size="10" fill="#444">${DM(d)}</text>`});
  series.forEach((s,j)=>{
    const pts=s.valores.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
    svg+=`<polyline points="${pts}" fill="none" stroke="${s.cor}" stroke-width="${s.total?2.5:1.8}" ${s.total?'stroke-dasharray="6 4"':''}/>`;
    s.valores.forEach((v,i)=>{if(i%Math.max(1,Math.ceil(n/40))&&i!==n-1)return;svg+=s.total?`<rect x="${x(i)-2.5}" y="${y(v)-2.5}" width="5" height="5" fill="${s.cor}"/>`:`<circle cx="${x(i)}" cy="${y(v)}" r="2" fill="${s.cor}"/>`});
  });
  return `<div class="tf-rel-legenda">${series.map(s=>`<span><svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke="${s.cor}" stroke-width="2" ${s.total?'stroke-dasharray="5 3"':''}/></svg> ${esc(s.codigo||s.nome)}</span>`).join('')}</div>`+svg+'</svg>';
}

const TIPOS={geral:'Relatório geral',campanha:'Relatório por campanha',conjunto:'Relatório por conjunto de anúncios',anuncio:'Relatório por anúncio',segmento:'Relatório por segmento'};
const STATUS_ROT=Object.fromEntries(TF_STATUS_OPCOES);
const metricas=r=>`<td>${MONEY(r.investimento)}</td><td>${N0(r.impressoes)}</td><td>${N0(r.alcance)}</td><td>${N0(r.cliques)}</td><td>${PCT(r.ctr)}</td><td>${MONEY(r.cpc)}</td><td>${N0(r.conversas)}</td><td>${MONEY(r.custoConversa)}</td>`;
const CAB='<th>Invest. (R$)</th><th>Impress.</th><th>Alcance</th><th>Cliques</th><th>CTR</th><th>CPC (R$)</th><th>Conversas</th><th>Custo/Conv. (R$)</th>';
const rodape=(rot,span,t,alc)=>`<tr class="tot"><td class="l" colspan="${span}"><b>${rot}</b></td><td><b>${MONEY(t.investimento)}</b></td><td><b>${N0(t.impressoes)}</b></td><td><b>${alc===null||alc===undefined?'—':N0(alc)}</b></td><td><b>${N0(t.cliques)}</b></td><td><b>${PCT(t.ctr)}</b></td><td><b>${MONEY(t.cpc)}</b></td><td><b>${N0(t.conversas)}</b></td><td><b>${MONEY(t.custoConversa)}</b></td></tr>`;
function tabelaCamp(r){
  const t=tfTotais(r.campanhas,r.filtrado?null:r.d.atual.alcance);
  return `<table><thead><tr><th>Campanha</th><th>Status</th>${CAB}</tr></thead><tbody>${r.campanhas.map(c=>`<tr><td class="l">${esc(c.nome)}</td><td>${esc(c.statusRotulo||'—')}</td>${metricas(c)}</tr>`).join('')}</tbody><tfoot>${rodape('TOTAL',2,t,t.alcance)}</tfoot></table>`;
}
function tabelaConj(r){
  const t=tfTotais(r.conjuntos,null);
  return `<table><thead><tr><th>Conjunto de anúncios</th><th>Campanha</th><th>Status</th>${CAB}</tr></thead><tbody>${r.conjuntos.map(c=>`<tr><td class="l">${esc(c.nome)}</td><td>${esc(c.codigo||c.campanha)}</td><td>${esc(c.statusRotulo||'—')}</td>${metricas(c)}</tr>`).join('')}</tbody><tfoot>${rodape('TOTAL',3,t,null)}</tfoot></table>`;
}
function tabelaAnuncios(r){
  const t=tfTotais(r.anuncios,null);
  return `<table><thead><tr><th>Foto</th><th>Anúncio</th><th>Camp.</th><th>Status</th>${CAB}</tr></thead><tbody>${r.anuncios.map(a=>`<tr><td class="foto">${a.miniatura?`<img alt="Criativo: ${esc(a.nome)}" referrerpolicy="no-referrer" src="${esc(a.imagem||a.miniatura)}">`:'<span>Sem imagem</span>'}</td><td class="l">${esc(a.nome)}</td><td>${esc(a.codigo||a.campanha)}</td><td>${esc(a.statusRotulo||'—')}</td>${metricas(a)}</tr>`).join('')}</tbody><tfoot>${rodape('TOTAL',4,t,null)}</tfoot></table>`;
}
function tabelaSeg(r){
  const mapa=new Map();for(const c of r.campanhas){const k=c.segmento||'SEM';(mapa.get(k)||mapa.set(k,[]).get(k)).push(c)}
  const linhas=[...mapa.entries()].map(([k,cs])=>({k,...tfTotais(cs,null),campanhas:cs.length})).sort((a,b)=>b.investimento-a.investimento);
  const t=tfTotais(r.campanhas,r.filtrado?null:r.d.atual.alcance);
  return `<table><thead><tr><th>Segmento</th><th>Campanhas</th>${CAB}</tr></thead><tbody>${linhas.map(x=>`<tr><td class="l">${esc(tfSegRotulo(x.k))}</td><td>${x.campanhas}</td>${metricas(x)}</tr>`).join('')}</tbody><tfoot>${rodape('TOTAL',2,t,t.alcance)}</tfoot></table>`;
}
function tabelaSemanal(r){
  const g=r.diario;if(!g.dias.length)return '';
  const inv=tfAgrupar(g.dias,g.total,'semana'),conv=r.filtrado?null:tfAgrupar(g.dias,r.d.diario.conversas||g.dias.map(()=>0),'semana');
  const totI=inv.reduce((n,x)=>n+x.valor,0),totC=conv?conv.reduce((n,x)=>n+x.valor,0):null;
  return `<table><thead><tr><th>Semana (dom a sáb)</th><th>Período</th><th>Investimento (R$)</th>${conv?'<th>Conversas</th><th>Custo/Conv. (R$)</th>':''}</tr></thead><tbody>${inv.map((x,i)=>`<tr><td class="l">Semana ${tfSemanaEpi(x.de).semana}</td><td>${DM(x.de)} a ${DM(x.ate)}</td><td>${MONEY(x.valor)}</td>${conv?`<td>${N0(conv[i].valor)}</td><td>${MONEY(conv[i].valor?x.valor/conv[i].valor:null)}</td>`:''}</tr>`).join('')}</tbody><tfoot><tr class="tot"><td class="l" colspan="2"><b>TOTAL</b></td><td><b>${MONEY(totI)}</b></td>${conv?`<td><b>${N0(totC)}</b></td><td><b>${MONEY(totC?totI/totC:null)}</b></td>`:''}</tr></tfoot></table>`;
}
/** Dados do relatório = dados da API + os mesmos filtros do painel (trafego-comum.js), então painel, pré-visualização e PDF dão os mesmos totais. */
function recorte(d,OPC){
  const f=tfFiltrar(d,{status:OPC.status,segmento:OPC.segmento,campanha:OPC.campanha});
  const r={d,filtrado:f.filtrado,campanhas:f.campanhas,conjuntos:f.conjuntos,anuncios:f.anuncios};
  r.diario=f.filtrado?tfSerieFiltrada(d.diario,f.campanhas):d.diario;
  r.atual=f.filtrado?tfTotais(f.campanhas,null):d.atual;
  r.variacoes=f.filtrado?Object.fromEntries(Object.keys(d.atual).map(k=>[k,{tipo:'sem'}])):d.variacoes;
  return r;
}
function filtrosTxt(OPC,ultimo){
  const p=[];if(OPC.status!=='todos')p.push('status: '+STATUS_ROT[OPC.status]);if(OPC.segmento)p.push('segmento: '+tfSegRotulo(OPC.segmento));
  if(OPC.campanha&&ultimo){const c=ultimo.campanhas.find(x=>x.id===OPC.campanha);p.push('campanha: '+(c?c.nome:OPC.campanha))}
  return p.join(' · ');
}
function html(d,OPC,sub,obs){
  const r=recorte(d,OPC),p=d.periodo,ant=d.anterior,agora=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date());
  const sec=(t,corpo,cls='')=>`<section class="sec ${cls}"><div class="bloco"><h2>${t}</h2><span class="tag s">${DM(p.de)} a ${DMA(p.ate)}</span></div>${corpo}</section>`;
  const secs=[sec(r.filtrado?'Indicadores do período (recorte filtrado)':'Indicadores do período (comparados a '+DM(ant.de)+' – '+DMA(ant.ate)+')',kpis(r))];
  if(OPC.tipo==='geral'||OPC.tipo==='campanha')secs.push(sec('Investimento diário por campanha',`<div class="tw">${grafico(r.diario)}</div>`));
  if(OPC.semanal&&(OPC.tipo==='geral'||OPC.tipo==='campanha'))secs.push(sec('Recorte semanal',`<div class="tw">${tabelaSemanal(r)}</div>`));
  if(OPC.tipo==='geral'||OPC.tipo==='campanha')secs.push(sec('Resumo por campanha',`<div class="tw">${tabelaCamp(r)}</div>`));
  if(OPC.tipo==='conjunto')secs.push(sec('Detalhamento por conjunto de anúncios',`<div class="tw">${tabelaConj(r)}</div>`,'det'));
  if(OPC.tipo==='segmento')secs.push(sec('Resumo por segmento',`<div class="tw">${tabelaSeg(r)}</div>`));
  if(OPC.tipo==='geral'||OPC.tipo==='anuncio')secs.push(sec('Detalhamento por anúncio',`<div class="tw">${tabelaAnuncios(r)}</div>`,'det'));
  const avisos=[...(d.avisos||[]),...(r.filtrado?['Recorte filtrado: totais recalculados a partir das linhas exibidas; o alcance não é somado entre linhas e a comparação com o período anterior não se aplica.']:[])];
  return `<div class="pg"><header class="cab"><img class="logo" src="/api/public/logo" alt="Colégio Evolução"><div class="tit"><h1>${TIPOS[OPC.tipo]} — Tráfego Pago (Meta Ads)</h1><p class="sub">${esc(sub)}${filtrosTxt(OPC,d)?' · '+esc(filtrosTxt(OPC,d)):''}</p></div></header>
  ${secs.join('')}
  ${avisos.length?`<p class="nota">${avisos.map(esc).join(' ')}</p>`:''}${obs?`<p class="nota">${esc(obs)}</p>`:''}
  <div class="fim"><span>Colégio Evolução · EVO MKT · fonte: ${esc(d.origem.fonte)} · versão da API ${esc(d.origem.versaoApi)}</span><span>Gerado em ${esc(agora)}</span></div></div>`;
}
const obsPadrao=()=>'Conversas = conversas iniciadas pelos anúncios (não inclui leads de formulário). CTR, CPC e custo por conversa são calculados dos valores absolutos. O alcance do total não soma o das campanhas. Status é o atual na Meta. Dados lidos da Meta, somente leitura; a Meta pode ajustar números por até 72 horas.';

return {html,obsPadrao,TIPOS,STATUS_ROT};
})();
