/* Monta o Relatório Geral de Tráfego Pago (somente leitura) em HTML: pré-visualização dentro do EVO MKT (Relatórios) e página de tela cheia.
   O PDF é gerado no servidor (lib/trafegoPdf.ts) com os mesmos filtros e as mesmas funções de trafego-comum.js, então os números coincidem. */
const TfRelatorio=(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N0=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0});
const MONEY=v=>v===null||v===undefined?'—':'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const PCT=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const DM=iso=>iso.slice(8,10)+'/'+iso.slice(5,7),DMA=iso=>DM(iso)+'/'+iso.slice(0,4);
const NOME_PER={semana:'Esta semana',semana_ant:'Semana anterior',mes:'Este mês',mes_ant:'Mês anterior',ano:'Este ano',x:'Período personalizado'};
const KPIS=[['Investimento','investimento',MONEY],['Impressões','impressoes',N0],['Alcance','alcance',N0],['Cliques','cliques',N0],['CTR médio','ctr',PCT],['CPC médio','cpc',MONEY],['Conversas iniciadas','conversas',N0],['Custo por conversa','custoConversa',MONEY]];
const varTxt=v=>!v||v.tipo==='sem'?['sem base de comparação','']:v.tipo==='novo'?['novo no período','']:v.tipo==='estavel'?['estável','']:[(v.tipo==='subiu'?'▲ ':'▼ ')+Math.abs(v.percentual).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%',v.tipo==='subiu'?'up':'down'];
function kpis(r){return `<div class="kpis m">${KPIS.map(([l,k,f])=>{const [t,c]=varTxt(r.variacoes[k]);const ant=!r.filtrado&&r.d.anteriorTotais&&r.d.anteriorTotais[k]!==null&&r.d.anteriorTotais[k]!==undefined?`vs. ${f(r.d.anteriorTotais[k])}`:'';return `<div><small>${l}</small><b>${f(r.atual[k])}</b><small class="${c}">${t}</small><small>${esc(ant)}</small></div>`}).join('')}</div>`}
const passo=max=>{const b=max/4||1,m=10**Math.floor(Math.log10(b));return [1,2,2.5,5,10].map(x=>x*m).find(x=>x>=b)||b};
/** Barras verticais (e, opcionalmente, uma linha de pontos em eixo próprio). */
function graficoBarras(rotulos,barras,linha,fmtB,fmtL,aria){
  const W=380,H=210,L=50,R=linha?44:12,T=14,B=28,n=rotulos.length;
  if(!n||!barras.some(v=>v>0))return '<div class="vazio">Sem dados no período.</div>';
  const pb=passo(Math.max(...barras)),tb=pb*4,pl=linha?passo(Math.max(...linha,1e-9)):0,tl=pl*4,gw=(W-L-R)/n,bw=Math.min(28,gw*.66),y=(v,t)=>T+(H-T-B)*(1-v/t);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">`;
  for(let i=0;i<=4;i++){const yy=y(pb*i,tb);s+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#E3E7EF"/><text x="${L-5}" y="${yy+3}" text-anchor="end" font-size="9" fill="#555">${esc(fmtB(pb*i))}</text>`;if(linha)s+=`<text x="${W-R+4}" y="${yy+3}" font-size="9" fill="#FF7800">${esc(fmtL(pl*i))}</text>`}
  const cada=Math.max(1,Math.ceil(n/9));
  rotulos.forEach((r,i)=>{const bx=L+gw*i+(gw-bw)/2,by=y(barras[i],tb);s+=`<rect x="${bx}" y="${by}" width="${bw}" height="${H-B-by}" fill="${linha?'#00A1F3':'#063996'}" rx="2"><title>${esc(r)}: ${esc(fmtB(barras[i]))}</title></rect>`;if(i%cada===0||i===n-1)s+=`<text x="${L+gw*i+gw/2}" y="${H-10}" text-anchor="middle" font-size="9" fill="#555">${esc(r)}</text>`});
  if(linha){s+=`<polyline fill="none" stroke="#FF7800" stroke-width="1.8" points="${linha.map((v,i)=>`${L+gw*i+gw/2},${y(v,tl)}`).join(' ')}"/>`;linha.forEach((v,i)=>{s+=`<circle cx="${L+gw*i+gw/2}" cy="${y(v,tl)}" r="2.4" fill="#FF7800"><title>${esc(rotulos[i])}: ${esc(fmtL(v))}</title></circle>`})}
  return s+'</svg>';
}
function tabelaCamp(r){
  const t=tfTotais(r.campanhas,r.filtrado?null:r.d.atual.alcance);
  return `<table><thead><tr><th>Campanha</th><th>Status</th><th>Invest. (R$)</th><th>Impress.</th><th>Alcance</th><th>Cliques</th><th>CTR</th><th>CPC (R$)</th><th>Conv.</th><th>Custo/Conv. (R$)</th></tr></thead><tbody>${r.campanhas.map(c=>`<tr><td class="l">${esc(c.nome)}</td><td>${esc(c.statusRotulo||'—')}</td><td>${MONEY(c.investimento)}</td><td>${N0(c.impressoes)}</td><td>${N0(c.alcance)}</td><td>${N0(c.cliques)}</td><td>${PCT(c.ctr)}</td><td>${MONEY(c.cpc)}</td><td>${N0(c.conversas)}</td><td>${MONEY(c.custoConversa)}</td></tr>`).join('')}</tbody><tfoot><tr class="tot"><td class="l" colspan="2"><b>TOTAL</b></td><td><b>${MONEY(t.investimento)}</b></td><td><b>${N0(t.impressoes)}</b></td><td><b>${N0(t.alcance)}</b></td><td><b>${N0(t.cliques)}</b></td><td><b>${PCT(t.ctr)}</b></td><td><b>${MONEY(t.cpc)}</b></td><td><b>${N0(t.conversas)}</b></td><td><b>${MONEY(t.custoConversa)}</b></td></tr></tfoot></table>`;
}
function tabelaAnuncios(r){
  const t=tfTotais(r.anuncios,null);
  return `<table><thead><tr><th>Foto</th><th>Anúncio</th><th>Campanha</th><th>Status</th><th>Invest. (R$)</th><th>Impress.</th><th>Alcance</th><th>Cliques</th><th>CTR</th><th>CPC (R$)</th><th>Conv.</th><th>Custo/Conv. (R$)</th></tr></thead><tbody>${r.anuncios.map(a=>`<tr><td class="foto">${a.miniatura?`<img alt="Criativo: ${esc(a.nome)}" referrerpolicy="no-referrer" src="${esc(a.imagem||a.miniatura)}">`:'<span>Sem imagem</span>'}</td><td class="l">${esc(a.nome)}</td><td>${esc(a.codigo||a.campanha)}</td><td>${esc(a.statusRotulo||'—')}</td><td>${MONEY(a.investimento)}</td><td>${N0(a.impressoes)}</td><td>${N0(a.alcance)}</td><td>${N0(a.cliques)}</td><td>${PCT(a.ctr)}</td><td>${MONEY(a.cpc)}</td><td>${N0(a.conversas)}</td><td>${MONEY(a.custoConversa)}</td></tr>`).join('')}</tbody><tfoot><tr class="tot"><td class="l" colspan="4"><b>TOTAL</b></td><td><b>${MONEY(t.investimento)}</b></td><td><b>${N0(t.impressoes)}</b></td><td><b>—</b></td><td><b>${N0(t.cliques)}</b></td><td><b>${PCT(t.ctr)}</b></td><td><b>${MONEY(t.cpc)}</b></td><td><b>${N0(t.conversas)}</b></td><td><b>${MONEY(t.custoConversa)}</b></td></tr></tfoot></table>`;
}
function tabelaSemanal(r){
  const g=r.diario;if(!g.dias.length)return '';
  const inv=tfAgrupar(g.dias,g.total,'semana'),conv=r.filtrado?null:tfAgrupar(g.dias,r.d.diario.conversas||g.dias.map(()=>0),'semana');
  const totI=inv.reduce((n,x)=>n+x.valor,0),totC=conv?conv.reduce((n,x)=>n+x.valor,0):null;
  const dias=x=>Math.round((Date.parse(x.ate+'T12:00:00Z')-Date.parse(x.de+'T12:00:00Z'))/86400000)+1;
  return `<table><thead><tr><th>Semana (dom a sáb)</th><th>Período dentro do filtro</th><th>Dias</th><th>Investimento (R$)</th>${conv?'<th>Conversas</th><th>Custo/Conv. (R$)</th>':''}</tr></thead><tbody>${inv.map((x,i)=>`<tr><td class="l">Semana ${tfSemanaEpi(x.de).semana}</td><td>${DM(x.de)} a ${DM(x.ate)}</td><td>${dias(x)}</td><td>${MONEY(x.valor)}</td>${conv?`<td>${N0(conv[i].valor)}</td><td>${MONEY(conv[i].valor?x.valor/conv[i].valor:null)}</td>`:''}</tr>`).join('')}</tbody><tfoot><tr class="tot"><td class="l" colspan="2"><b>TOTAL</b></td><td><b>${g.dias.length}</b></td><td><b>${MONEY(totI)}</b></td>${conv?`<td><b>${N0(totC)}</b></td><td><b>${MONEY(totC?totI/totC:null)}</b></td>`:''}</tr></tfoot></table>`;
}
/** Dados do relatório = dados da API + os mesmos filtros do painel (trafego-comum.js). */
function recorte(d,OPC){
  const f=tfFiltrar(d,{status:OPC.status,segmento:OPC.segmento,campanha:OPC.campanha});
  const r={d,filtrado:f.filtrado,campanhas:f.campanhas,conjuntos:f.conjuntos,anuncios:f.anuncios};
  r.diario=f.filtrado?tfSerieFiltrada(d.diario,f.campanhas):d.diario;
  r.atual=f.filtrado?tfTotais(f.campanhas,null):d.atual;
  r.variacoes=f.filtrado?Object.fromEntries(Object.keys(d.atual).map(k=>[k,{tipo:'sem'}])):d.variacoes;
  return r;
}
function filtrosTxt(OPC,d){
  const p=[];if(OPC.status&&OPC.status!=='todos')p.push('status: '+(TF_STATUS_OPCOES.find(x=>x[0]===OPC.status)||[,OPC.status])[1]);if(OPC.segmento)p.push('segmento: '+tfSegRotulo(OPC.segmento));
  if(OPC.campanha){const c=d.campanhas.find(x=>x.id===OPC.campanha);p.push('campanha: '+(c?c.nome:OPC.campanha))}
  return p.join(' · ');
}
function html(d,OPC,obs){
  const r=recorte(d,OPC),p=d.periodo,ant=d.anterior,agora=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date());
  const sec=(t,corpo,cls='',tag=`${DM(p.de)} a ${DMA(p.ate)}`)=>`<section class="sec ${cls}"><div class="bloco"><h2>${t}</h2><span class="tag s">${tag}</span></div>${corpo}</section>`;
  const dias=r.diario.dias,modo=dias.length>200?'mes':dias.length>45?'semana':'dia';
  const rot=g=>modo==='mes'?g.chave.slice(5,7)+'/'+g.chave.slice(2,4):DM(g.de);
  const gInv=tfAgrupar(dias,r.diario.total,modo),imp=d.diario.impressoes||dias.map(()=>0),cli=d.diario.cliques||dias.map(()=>0);
  const gImp=tfAgrupar(dias,r.filtrado?dias.map(()=>0):imp,modo),gCli=tfAgrupar(dias,r.filtrado?dias.map(()=>0):cli,modo);
  const nomeModo=modo==='dia'?'diário':modo==='semana'?'semanal':'mensal';
  const f=filtrosTxt(OPC,d);
  const graf=`<div class="graf2"><div><h3>Investimento ${nomeModo}</h3>${graficoBarras(gInv.map(rot),gInv.map(g=>g.valor),null,v=>'R$ '+N0(v),N0,'Investimento '+nomeModo)}</div><div><h3>Impressões e cliques</h3>${r.filtrado?'<div class="vazio">Indisponível com filtros ativos: o dia a dia de impressões e cliques só existe para a conta inteira.</div>':`<div class="leg"><i style="background:#00A1F3"></i>Impressões <i style="background:#FF7800"></i>Cliques</div>`+graficoBarras(gImp.map(rot),gImp.map(g=>g.valor),gCli.map(g=>g.valor),N0,N0,'Impressões e cliques')}</div></div>`;
  const avisos=[...(d.avisos||[]),...(r.filtrado?['Recorte filtrado: totais recalculados a partir das linhas exibidas; o alcance não é somado entre linhas e a comparação com o período anterior não se aplica.']:[])];
  const dura=p.dias+' dia'+(p.dias===1?'':'s');
  return `<div class="pg"><header class="cab"><img class="logo" src="/api/public/logo" alt="Colégio Evolução"><div class="tit"><h1>Relatório geral — Tráfego Pago (Meta Ads)</h1><p class="sub">Colégio Evolução | ${DMA(p.de)} a ${DMA(p.ate)} (${esc(NOME_PER[OPC.tp]||'Período')}, ${dura})</p><p class="sub">Comparado a ${DMA(ant.de)} a ${DMA(ant.ate)} (${dura}, período anterior de mesma duração)${f?' · Filtros: '+esc(f):''}</p></div></header>
  ${sec(r.filtrado?'Indicadores do período (recorte filtrado)':'Indicadores do período',kpis(r))}
  ${sec('Evolução no período',graf,'',modo==='dia'?'POR DIA':modo==='semana'?'POR SEMANA (DOM–SÁB)':'POR MÊS')}
  ${OPC.semanal?sec('Recorte semanal (domingo a sábado)',`<div class="tw">${tabelaSemanal(r)}</div>`):''}
  ${sec('Resumo das campanhas (principais por investimento)',`<div class="tw">${tabelaCamp(r)}</div>`,'',r.campanhas.length+' campanha(s)')}
  ${sec('Detalhamento dos anúncios (com fotos)',`<div class="tw">${tabelaAnuncios(r)}</div>`,'det',r.anuncios.length+' anúncio(s)')}
  ${avisos.length?`<p class="nota">${avisos.map(esc).join(' ')}</p>`:''}${obs?`<p class="nota">${esc(obs)}</p>`:''}
  <div class="fim"><span>Colégio Evolução · EVO MKT · fonte: ${esc(d.origem.fonte)} · versão da API ${esc(d.origem.versaoApi)}</span><span>Gerado em ${esc(agora)}</span></div></div>`;
}
const obsPadrao=()=>'Conversas = conversas iniciadas pelos anúncios (não inclui leads de formulário). CTR, CPC e custo por conversa são calculados dos valores absolutos. O alcance do total vem da conta e não soma o das campanhas. Status é o atual na Meta. Dados lidos da Meta, somente leitura; a Meta pode ajustar números por até 72 horas.';
return {html,obsPadrao,NOME_PER};
})();
