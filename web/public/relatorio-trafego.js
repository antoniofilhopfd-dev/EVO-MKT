// Dashboard de Tráfego — Meta Ads. Lê /api/traffic/semanal (somente leitura) e monta o relatório A4 para imprimir/salvar em PDF.
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const N0=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
const MONEY=v=>'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const PCT=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const DM=iso=>iso.slice(8,10)+'/'+iso.slice(5,7),DMA=iso=>DM(iso)+'/'+iso.slice(0,4);
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const CORES=['#063996','#19A7D8','#FF7800','#7B3FA0','#2E9F5B','#C0392B','#8A5A00','#555555'];

function semanaPadrao(){ // última semana completa: domingo a sábado
  const h=new Date();h.setHours(12,0,0,0);const dow=h.getDay(),volta=((dow+1)%7)||7;
  const fim=new Date(h);fim.setDate(h.getDate()-volta);const ini=new Date(fim);ini.setDate(fim.getDate()-6);return [iso(ini),iso(fim)];
}
const kpiHtml=(k,cls)=>`<div class="kpis ${cls}">${[['Investimento',MONEY(k.investimento)],['Impressões',N0(k.impressoes)],['Alcance',N0(k.alcance)],['Cliques',N0(k.cliques)],['CTR médio',PCT(k.ctr)],['CPC médio',k.cliques?MONEY(k.cpc):'-'],['Conversas iniciadas',N0(k.conversas)],['Custo/Conversa',k.conversas?MONEY(k.custoConversa):'-']].map(([l,v])=>`<div><small>${l}</small><b>${v}</b></div>`).join('')}</div>`;

function passo(max){const c=[1,2,5,10,20,25,50,100,200,250,500,1000,2000,5000];return c.find(x=>max/x<=6)||10000}
function grafico(g,de,ate){
  const W=760,H=320,L=48,R=16,T=70,B=30,n=g.datas.length;if(!n||!g.series.length)return '<div class="vazio">Sem gasto por dia neste período.</div>';
  const max=Math.max(1,...g.total),st=passo(max),top=Math.ceil(max/st)*st;
  const x=i=>L+(n===1?(W-L-R)/2:i*(W-L-R)/(n-1)),y=v=>T+(H-T-B)*(1-v/top);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Investimento diário por campanha"><text x="${W/2}" y="16" text-anchor="middle" font-size="13" font-weight="700" fill="#00275F">Investimento diário por campanha (${DM(de)} a ${DM(ate)})</text>`;
  for(let v=0;v<=top;v+=st)s+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#DDD" stroke-dasharray="2 3"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end" font-size="10" fill="#444">${v}</text>`;
  s+=`<text transform="rotate(-90)" x="${-(T+(H-T-B)/2)}" y="12" text-anchor="middle" font-size="10" fill="#444">Investimento (R$)</text>`;
  g.datas.forEach((d,i)=>{s+=`<text x="${x(i)}" y="${H-10}" text-anchor="middle" font-size="10" fill="#444">${DM(d)}</text>`});
  g.series.forEach((se,k)=>{const c=CORES[k%CORES.length];s+=`<polyline fill="none" stroke="${c}" stroke-width="2" points="${se.valores.map((v,i)=>x(i)+','+y(v)).join(' ')}"/>`+se.valores.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${c}"/>`).join('')});
  s+=`<polyline fill="none" stroke="#00275F" stroke-width="2.2" stroke-dasharray="6 4" points="${g.total.map((v,i)=>x(i)+','+y(v)).join(' ')}"/>`+g.total.map((v,i)=>`<rect x="${x(i)-3}" y="${y(v)-3}" width="6" height="6" fill="#00275F"/>`).join('');
  const leg=[...g.series.map((se,k)=>[se.curto,CORES[k%CORES.length],false]),['Total','#00275F',true]];
  leg.forEach(([nm,c,tr],i)=>{const cx=W-R-200+(i%2)*100,cy=34+Math.floor(i/2)*14;s+=`<line x1="${cx}" x2="${cx+18}" y1="${cy}" y2="${cy}" stroke="${c}" stroke-width="2" ${tr?'stroke-dasharray="5 3"':''}/><text x="${cx+22}" y="${cy+3}" font-size="10" fill="#222">${esc(nm)}</text>`});
  return s+'</svg>';
}
function linhaTab(r){return `<td>${MONEY(r.investimento)}</td><td>${N0(r.impressoes)}</td><td>${N0(r.alcance)}</td><td>${N0(r.cliques)}</td><td>${PCT(r.ctr)}</td><td>${r.cliques?MONEY(r.cpc):'-'}</td>`}
function html(d,sub,obs){
  const m=d.mensal,mesNome=MESES[Number(m.ate.slice(5,7))-1]+'/'+m.ate.slice(0,4);
  const tagM=`MENSAL • ${mesNome}${m.parcial?` (parcial, 01 a ${DM(m.ate)})`:''}`,tagS=`SEMANAL • ${DM(d.periodo.de)} a ${DMA(d.periodo.ate)}`;
  const resumo=`<table><thead><tr><th>Campanha</th><th>Invest. (R$)</th><th>Impress.</th><th>Alcance</th><th>Cliques</th><th>CTR</th><th>CPC (R$)</th><th>Conversas</th><th>Custo/Conv. (R$)</th></tr></thead><tbody>${d.campanhas.map(c=>`<tr><td class="l">${esc(c.curto)}</td>${linhaTab(c)}<td>${N0(c.conversas)}</td><td>${c.conversas?MONEY(c.custoConversa):'-'}</td></tr>`).join('')||'<tr><td colspan="9" class="vazio">Nenhuma campanha com gasto neste período.</td></tr>'}<tr class="tot"><td class="l">TOTAL</td>${linhaTab(d.semanal)}<td>${N0(d.semanal.conversas)}</td><td>${d.semanal.conversas?MONEY(d.semanal.custoConversa):'-'}</td></tr></tbody></table>`;
  const ta=d.totalAnuncios;
  const det=`<table><thead><tr><th>Foto</th><th>Anúncio</th><th>Camp.</th><th>Status</th><th>Custo (R$)</th><th>Impress.</th><th>Alcance</th><th>Cliques</th><th>CTR</th><th>CPC (R$)</th><th>Conv.</th><th>Custo/Conv.</th></tr></thead><tbody>${d.anuncios.map(a=>`<tr><td>${a.foto?`<img alt="" referrerpolicy="no-referrer" src="${esc(a.foto)}">`:''}</td><td class="l">${esc(a.nome)}</td><td>${esc(a.camp)}</td><td>${esc(a.status)}</td><td>${MONEY(a.investimento)}</td><td>${N0(a.impressoes)}</td><td>${N0(a.alcance)}</td><td>${N0(a.cliques)}</td><td>${PCT(a.ctr)}</td><td>${a.cliques?MONEY(a.cpc):'-'}</td><td>${N0(a.conversas)}</td><td>${a.conversas?MONEY(a.custoConversa):'-'}</td></tr>`).join('')||'<tr><td colspan="12" class="vazio">Nenhum anúncio com gasto neste período.</td></tr>'}<tr class="tot"><td></td><td>TOTAL</td><td></td><td></td><td>${MONEY(ta.investimento)}</td><td>${N0(ta.impressoes)}</td><td>${N0(ta.alcance)}</td><td>${N0(ta.cliques)}</td><td>${PCT(ta.ctr)}</td><td>${ta.cliques?MONEY(ta.cpc):'-'}</td><td>${N0(ta.conversas)}</td><td>${ta.conversas?MONEY(ta.custoConversa):'-'}</td></tr></tbody></table>`;
  return `<section class="pg"><header class="cab"><h1>Dashboard de Tráfego — Meta Ads</h1><img class="sim" src="/img/logo-simbolo.png" alt=""><p class="sub">${esc(sub)}</p></header>
  <div class="bloco"><h2>Indicadores do período</h2><span class="tag m">${esc(tagM)}</span></div>${kpiHtml(m,'m')}
  <div class="bloco"><h2>Indicadores da semana</h2><span class="tag s">${esc(tagS)}</span></div>${kpiHtml(d.semanal,'s')}
  <div class="bloco"><h2>Investimento diário</h2><span class="tag s">${esc(tagS)}</span></div>${grafico(d.diario,d.periodo.de,d.periodo.ate)}</section>
  <section class="pg"><div class="bloco"><h2>Resumo por campanha</h2><span class="tag s">${esc(tagS)}</span></div>${resumo}
  <div class="bloco" style="margin-top:22px"><h2>Detalhamento por anúncio</h2><span class="tag s">${esc(tagS)}</span></div>${det}${obs?`<p class="nota">${esc(obs)}</p>`:''}</section>`;
}
function obsPadrao(d){
  const m=d.mensal,p=[];if(m.parcial)p.push(`O mensal de ${MESES[Number(m.ate.slice(5,7))-1].toLowerCase()} inclui o dia ${DM(m.ate)} em andamento (valores parciais).`);
  if(d.anunciosPausadosComGasto.length)p.push(`Anúncios pausados com gasto no período: ${d.anunciosPausadosComGasto.join('; ')}.`);
  p.push('Conversas = conversas iniciadas pelos anúncios (não inclui leads de formulário). Dados lidos da Meta; o EVO MKT não altera nada na plataforma.');
  return p.join(' ');
}
let ultimo=null;
async function carregar(){
  const de=$('#de').value,ate=$('#ate').value;$('#rel').innerHTML='<div class="msg">Carregando da Meta…</div>';
  try{
    const r=await fetch(`/api/traffic/semanal?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`,{credentials:'same-origin',headers:{'X-EVO':'1'}});let d={};try{d=await r.json()}catch{}
    if(r.status===401||r.status===403){$('#rel').innerHTML='<div class="msg">Entre no EVO MKT como Gerência e abra este relatório de novo.</div>';return}
    if(!r.ok)throw new Error(d.error||'Não foi possível ler a Meta.');
    ultimo=d;$('#obs').value=obsPadrao(d);desenhar();
  }catch(e){$('#rel').innerHTML=`<div class="msg">${esc(e.message)}</div>`}
}
function desenhar(){if(ultimo)$('#rel').innerHTML=html(ultimo,$('#sub').value,$('#obs').value.trim())}
{
  const q=new URLSearchParams(location.search),[di,df]=semanaPadrao();
  $('#de').value=/^\d{4}-\d\d-\d\d$/.test(q.get('de')||'')?q.get('de'):di;$('#ate').value=/^\d{4}-\d\d-\d\d$/.test(q.get('ate')||'')?q.get('ate'):df;
  $('#sub').value=`Colégio Evolução | Campanhas de Captação ${new Date().getFullYear()}`;
  $('#atualiza').onclick=carregar;$('#imprime').onclick=()=>window.print();
  $('#sub').oninput=desenhar;$('#obs').oninput=desenhar;
  carregar();
}
