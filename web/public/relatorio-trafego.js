// Relatório de Tráfego Pago (A4, para imprimir ou salvar em PDF). Lê /api/trafego/relatorio (somente leitura) e monta a página.
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N0=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0});
const MONEY=v=>v===null||v===undefined?'—':'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const PCT=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const DM=iso=>iso.slice(8,10)+'/'+iso.slice(5,7),DMA=iso=>DM(iso)+'/'+iso.slice(0,4);
const hojeBR=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const soma=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const CORES=['#063996','#19A7D8','#FF7800','#7B3FA0','#2E9F5B','#C0392B','#8A5A00','#555555'];
const KPIS=[['Investimento','investimento',MONEY],['Impressões','impressoes',N0],['Alcance','alcance',N0],['Cliques','cliques',N0],['CTR médio','ctr',PCT],['CPC médio','cpc',MONEY],['Conversas iniciadas','conversas',N0],['Custo por conversa','custoConversa',MONEY]];
const varTxt=v=>!v||v.tipo==='sem'?'sem base':v.tipo==='novo'?'novo':v.tipo==='estavel'?'estável':(v.tipo==='subiu'?'▲ ':'▼ ')+Math.abs(v.percentual).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
function kpis(d){return `<div class="kpis m">${KPIS.map(([l,k,f])=>`<div><small>${l}</small><b>${f(d.atual[k])}</b><small>${varTxt(d.variacoes[k])} vs. anterior</small></div>`).join('')}</div>`}
function passo(max){const c=[1,2,5,10,20,25,50,100,200,250,500,1000,2000,5000,10000];return c.find(x=>max/x<=6)||20000}
function grafico(g){
  const W=760,H=260,L=52,R=16,T=40,B=30,n=g.dias.length;if(!n||!g.series.length)return '<div class="vazio">Sem investimento por dia neste período.</div>';
  const max=Math.max(1,...g.total),st=passo(max),top=Math.ceil(max/st)*st,bw=Math.min(40,(W-L-R)/n*.7);
  const x=i=>L+(i+.5)*(W-L-R)/n,y=v=>T+(H-T-B)*(1-v/top);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Investimento diário por campanha">`;
  for(let v=0;v<=top;v+=st)s+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#DDD" stroke-dasharray="2 3"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end" font-size="10" fill="#444">${v}</text>`;
  const passoX=Math.max(1,Math.ceil(n/12));
  g.dias.forEach((d,i)=>{if(i%passoX===0)s+=`<text x="${x(i)}" y="${H-10}" text-anchor="middle" font-size="10" fill="#444">${DM(d)}</text>`;let base=0;g.series.forEach((se,k)=>{const v=se.valores[i]||0;if(v){s+=`<rect x="${x(i)-bw/2}" y="${y(base+v)}" width="${bw}" height="${Math.max(0,y(base)-y(base+v))}" fill="${CORES[k%CORES.length]}"><title>${esc(d)} · ${esc(se.nome)}: ${MONEY(v)}</title></rect>`;base+=v}})});
  const leg=g.series.map((se,k)=>`<tspan fill="${CORES[k%CORES.length]}">■</tspan> ${esc(se.codigo||se.nome)}  `).join('');
  return s+`<text x="${L}" y="16" font-size="11" fill="#222">${leg}</text></svg>`;
}
function tabelaCamp(d){
  const t=d.atual;
  return `<table><thead><tr><th>Campanha</th><th>Invest. (R$)</th><th>Impress.</th><th>Alcance</th><th>Cliques</th><th>CTR</th><th>CPC (R$)</th><th>Conversas</th><th>Custo/Conv. (R$)</th></tr></thead><tbody>${d.campanhas.map(c=>`<tr><td class="l">${esc(c.nome)}</td><td>${MONEY(c.investimento)}</td><td>${N0(c.impressoes)}</td><td>${N0(c.alcance)}</td><td>${N0(c.cliques)}</td><td>${PCT(c.ctr)}</td><td>${MONEY(c.cpc)}</td><td>${N0(c.conversas)}</td><td>${MONEY(c.custoConversa)}</td></tr>`).join('')||'<tr><td colspan="9" class="vazio">Nenhuma campanha com veiculação neste período.</td></tr>'}<tr class="tot"><td class="l">TOTAL</td><td>${MONEY(t.investimento)}</td><td>${N0(t.impressoes)}</td><td>${N0(t.alcance)}</td><td>${N0(t.cliques)}</td><td>${PCT(t.ctr)}</td><td>${MONEY(t.cpc)}</td><td>${N0(t.conversas)}</td><td>${MONEY(t.custoConversa)}</td></tr></tbody></table>`;
}
function tabelaAnuncios(d){
  return `<table><thead><tr><th>Foto</th><th>Anúncio</th><th>Campanha</th><th>Status</th><th>Custo (R$)</th><th>Impress.</th><th>Cliques</th><th>CTR</th><th>Conv.</th><th>Custo/Conv.</th></tr></thead><tbody>${d.anuncios.map(a=>`<tr><td class="foto">${a.miniatura?`<img alt="" referrerpolicy="no-referrer" src="${esc(a.miniatura)}">`:''}</td><td class="l">${esc(a.nome)}</td><td>${esc(a.codigo||a.campanha)}</td><td>${esc(a.statusRotulo)}</td><td>${MONEY(a.investimento)}</td><td>${N0(a.impressoes)}</td><td>${N0(a.cliques)}</td><td>${PCT(a.ctr)}</td><td>${N0(a.conversas)}</td><td>${MONEY(a.custoConversa)}</td></tr>`).join('')||'<tr><td colspan="10" class="vazio">Nenhum anúncio com veiculação neste período.</td></tr>'}</tbody></table>`;
}
function html(d,sub,obs){
  const p=d.periodo,ant=d.anterior,agora=new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
  const sec=(t,corpo,cls='')=>`<section class="sec ${cls}"><div class="bloco"><h2>${t}</h2><span class="tag s">${DM(p.de)} a ${DMA(p.ate)}</span></div>${corpo}</section>`;
  return `<div class="pg"><header class="cab"><img class="logo" src="/img/logo-colegio.png" alt="Colégio Evolução"><div class="tit"><h1>Tráfego Pago — Meta Ads</h1><p class="sub">${esc(sub)}</p></div></header>
  ${sec('Indicadores do período (comparados a '+DM(ant.de)+' – '+DMA(ant.ate)+')',kpis(d))}
  ${sec('Investimento diário por campanha',`<div class="tw">${grafico(d.diario)}</div>`)}
  ${sec('Resumo por campanha',`<div class="tw">${tabelaCamp(d)}</div>`)}
  ${sec('Detalhamento por anúncio',`<div class="tw">${tabelaAnuncios(d)}</div>`,'det')}
  ${(d.avisos||[]).length?`<p class="nota">${d.avisos.map(esc).join(' ')}</p>`:''}${obs?`<p class="nota">${esc(obs)}</p>`:''}
  <div class="fim"><span>Colégio Evolução · EVO MKT · fonte: ${esc(d.origem.fonte)} · versão da API ${esc(d.origem.versaoApi)}</span><span>Gerado em ${esc(agora)}</span></div></div>`;
}
const obsPadrao=()=>'Conversas = conversas iniciadas pelos anúncios (não inclui leads de formulário). CTR, CPC e custo por conversa são calculados dos valores absolutos. O alcance do total não soma o das campanhas. Dados lidos da Meta, somente leitura; a Meta pode ajustar números por até 72 horas.';
let ultimo=null;
async function carregar(){
  const de=$('#de').value,ate=$('#ate').value;$('#rel').innerHTML='<div class="msg">Carregando da Meta…</div>';
  try{
    const r=await fetch(`/api/trafego/relatorio?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`,{credentials:'same-origin',headers:{'X-EVO':'1'}});let d={};try{d=await r.json()}catch{}
    if(r.status===401){$('#rel').innerHTML='<div class="msg">Entre no EVO MKT e abra este relatório de novo.</div>';return}
    if(!r.ok)throw new Error(d.error||'Não foi possível ler a Meta.');
    ultimo=d;desenhar();
  }catch(e){$('#rel').innerHTML=`<div class="msg">${esc(e.message)}</div>`}
}
function desenhar(){if(ultimo)$('#rel').innerHTML=html(ultimo,$('#sub').value,$('#obs').value.trim())}
{
  const q=new URLSearchParams(location.search),hoje=hojeBR();
  $('#de').value=/^\d{4}-\d\d-\d\d$/.test(q.get('de')||'')?q.get('de'):soma(hoje,-29);$('#ate').value=/^\d{4}-\d\d-\d\d$/.test(q.get('ate')||'')?q.get('ate'):hoje;
  $('#sub').value=`Colégio Evolução | Campanhas ${new Date().getFullYear()}`;$('#obs').value=obsPadrao();
  $('#escolhe').onclick=()=>PeriodoPicker.abrir({de:$('#de').value,ate:$('#ate').value,titulo:'Período do relatório',max:hoje},(a,b)=>{$('#de').value=a;$('#ate').value=b;carregar()});
  $('#atualiza').onclick=carregar;$('#imprime').onclick=()=>window.print();
  $('#sub').oninput=desenhar;$('#obs').oninput=desenhar;
  carregar();
}
