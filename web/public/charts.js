/* Gráficos leves em SVG (sem bibliotecas externas): linhas com dica ao passar o mouse, barras, barras empilhadas e miniaturas de tendência.
   Cada gráfico recebe os dados reais; ausência de dado (null) não é desenhada como zero. */
const EvoCharts=(()=>{
 const COR=['#063996','#FF7800','#00A1F3','#FAB900','#793A8C','#00275F'];
 const nf=(v,d=0)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
 const abrev=v=>{const a=Math.abs(v);return a>=1e6?nf(v/1e6,1)+' mi':a>=1e4?nf(v/1e3,0)+' mil':a>=1e3?nf(v/1e3,1)+' mil':nf(v,a<10&&v%1?1:0)};
 const fmtDia=d=>{const p=String(d).slice(0,10).split('-');return p.length===3?`${p[2]}/${p[1]}`:String(d)};
 const esc_=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const escala=(vals,zero)=>{const v=vals.filter(x=>x!==null&&x!==undefined&&Number.isFinite(x));if(!v.length)return [0,1];let mn=zero?0:Math.min(...v),mx=Math.max(...v);if(mx===mn){mx=mn+1}const pad=(mx-mn)*.08;return [zero?0:mn-pad,mx+pad]};

 /** Miniatura de tendência (sem eixos). valores: números ou null. */
 function spark(valores,{cor=COR[0],w=96,h=28}={}){
  const v=valores.map(x=>x===null||x===undefined?null:Number(x));const pts=v.map((y,i)=>y===null?null:[i,y]).filter(Boolean);
  if(pts.length<2)return '<span class="ch-spark-vazio">—</span>';
  const [mn,mx]=escala(v,false),dx=w/(v.length-1||1);
  const d=pts.map(([i,y],k)=>`${k?'L':'M'}${(i*dx).toFixed(1)},${(h-((y-mn)/(mx-mn))*h).toFixed(1)}`).join('');
  return `<svg class="ch-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
 }

 /** Gráfico de linhas. dados: [{x,<serie>:valor|null}], series: [{k,nome,cor,fmt,eixo}] */
 function linha(el,{dados,series,altura=240,zero=true,rotuloAcessivel='Gráfico de linhas',marcadores=[]}){
  if(!dados.length||!series.length){el.innerHTML='<div class="ch-vazio">Sem dados no período.</div>';return}
  const W=640,H=altura,m={t:14,r:14,b:26,l:46},iw=W-m.l-m.r,ih=H-m.t-m.b;
  const todos=series.flatMap(s=>dados.map(d=>d[s.k]));
  const [mn,mx]=escala(todos,zero);
  const X=i=>m.l+(dados.length===1?iw/2:(i/(dados.length-1))*iw),Y=v=>m.t+ih-((v-mn)/(mx-mn))*ih;
  const grade=Array.from({length:5},(_,i)=>{const v=mn+(mx-mn)*i/4;return `<line x1="${m.l}" x2="${W-m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#E6E9F0"/><text x="${m.l-6}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5E6678">${esc_(abrev(v))}</text>`}).join('');
  const passo=Math.max(1,Math.ceil(dados.length/7));
  const eixoX=dados.map((d,i)=>i%passo===0?`<text x="${X(i).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="11" fill="#5E6678">${esc_(fmtDia(d.x))}</text>`:'').join('');
  const caminhos=series.map((s,si)=>{
   const cor=s.cor||COR[si%COR.length];let d='',aberto=false;
   dados.forEach((p,i)=>{const v=p[s.k];if(v===null||v===undefined||!Number.isFinite(v)){aberto=false;return}d+=`${aberto?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;aberto=true});
   const area=si===0&&dados.every(p=>p[s.k]!==null&&p[s.k]!==undefined)?`<path d="${d}L${X(dados.length-1).toFixed(1)},${(m.t+ih).toFixed(1)}L${X(0).toFixed(1)},${(m.t+ih).toFixed(1)}Z" fill="${cor}" opacity=".08"/>`:'';
   return `${area}<path d="${d}" fill="none" stroke="${cor}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  const marc=marcadores.map(mk=>{const i=dados.findIndex(d=>d.x===mk.x);return i<0?'':`<g><line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${m.t}" y2="${m.t+ih}" stroke="#FF7800" stroke-dasharray="4 3"/><text x="${X(i).toFixed(1)}" y="${m.t+10}" font-size="10" fill="#8A3F00" text-anchor="middle">${esc_(mk.rotulo)}</text></g>`}).join('');
  el.classList.add('ch-box');
  el.innerHTML=`<svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc_(rotuloAcessivel)}">${grade}${eixoX}${marc}${caminhos}<line class="ch-cruz" x1="0" x2="0" y1="${m.t}" y2="${m.t+ih}" stroke="#063996" stroke-opacity=".35" visibility="hidden"/><g class="ch-pts"></g><rect class="ch-hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg><div class="ch-dica" role="status" hidden></div>
   <div class="ch-leg">${series.map((s,si)=>`<span><i style="background:${s.cor||COR[si%COR.length]}"></i>${esc_(s.nome)}</span>`).join('')}</div>`;
  const svg=el.querySelector('svg'),dica=el.querySelector('.ch-dica'),cruz=el.querySelector('.ch-cruz'),pts=el.querySelector('.ch-pts'),hit=el.querySelector('.ch-hit');
  const mostrar=ev=>{
   const r=svg.getBoundingClientRect(),px=((ev.clientX-r.left)/r.width)*W;
   const i=Math.max(0,Math.min(dados.length-1,Math.round(((px-m.l)/iw)*(dados.length-1))));const d=dados[i];
   cruz.setAttribute('x1',X(i));cruz.setAttribute('x2',X(i));cruz.setAttribute('visibility','visible');
   pts.innerHTML=series.map((s,si)=>d[s.k]===null||d[s.k]===undefined?'':`<circle cx="${X(i).toFixed(1)}" cy="${Y(d[s.k]).toFixed(1)}" r="4" fill="#fff" stroke="${s.cor||COR[si%COR.length]}" stroke-width="2"/>`).join('');
   dica.hidden=false;dica.innerHTML=`<b>${esc_(fmtDia(d.x))}</b>${series.map((s,si)=>`<div><i style="background:${s.cor||COR[si%COR.length]}"></i>${esc_(s.nome)}: <b>${d[s.k]===null||d[s.k]===undefined?'sem dado':esc_((s.fmt||nf)(d[s.k]))}</b></div>`).join('')}`;
   const bx=el.getBoundingClientRect();let left=ev.clientX-bx.left+12;if(left+160>bx.width)left=ev.clientX-bx.left-170;dica.style.left=Math.max(0,left)+'px';dica.style.top='10px';
  };
  hit.addEventListener('mousemove',mostrar);hit.addEventListener('touchstart',e=>mostrar(e.touches[0]),{passive:true});hit.addEventListener('touchmove',e=>mostrar(e.touches[0]),{passive:true});
  hit.addEventListener('mouseleave',()=>{dica.hidden=true;cruz.setAttribute('visibility','hidden');pts.innerHTML=''});
 }

 /** Barras horizontais comparativas. itens: [{nome,v,sub,cor,thumb}] */
 function barras(el,{itens,fmt=nf,vazio='Sem dados no período.',rotuloAcessivel='Comparação'}){
  const l=itens.filter(i=>i.v!==null&&i.v!==undefined&&Number.isFinite(i.v));
  if(!l.length){el.innerHTML=`<div class="ch-vazio">${esc_(vazio)}</div>`;return}
  const mx=Math.max(...l.map(i=>i.v))||1;
  el.innerHTML=`<ul class="ch-barras" role="list" aria-label="${esc_(rotuloAcessivel)}">${l.map((i,k)=>`<li title="${esc_(i.nome)}: ${esc_(fmt(i.v))}${i.sub?' · '+esc_(i.sub):''}">${i.thumb?`<img class="ch-thumb" alt="" loading="lazy" referrerpolicy="no-referrer" src="${esc_(i.thumb)}">`:''}<span class="ch-nome">${esc_(i.nome)}${i.sub?`<small>${esc_(i.sub)}</small>`:''}</span><span class="ch-trilho"><i style="width:${Math.max(2,(i.v/mx)*100).toFixed(1)}%;background:${i.cor||COR[k%COR.length]}"></i></span><b>${esc_(fmt(i.v))}</b></li>`).join('')}</ul>`;
 }

 /** Barras empilhadas por categoria do eixo X. x: ['jan',...], series: [{nome,cor,valores:[...]}] */
 function empilhadas(el,{x,series,altura=240,fmt=nf,rotuloAcessivel='Barras empilhadas'}){
  if(!x.length||!series.length){el.innerHTML='<div class="ch-vazio">Sem dados no período.</div>';return}
  const W=640,H=altura,m={t:12,r:12,b:26,l:46},iw=W-m.l-m.r,ih=H-m.t-m.b;
  const tot=x.map((_,i)=>series.reduce((a,s)=>a+(Number(s.valores[i])||0),0)),mx=Math.max(...tot,1)*1.08,bw=Math.min(46,iw/x.length*.62);
  const Y=v=>m.t+ih-(v/mx)*ih;
  const grade=Array.from({length:5},(_,i)=>{const v=mx*i/4;return `<line x1="${m.l}" x2="${W-m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#E6E9F0"/><text x="${m.l-6}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5E6678">${esc_(abrev(v))}</text>`}).join('');
  const bars=x.map((rot,i)=>{const cx=m.l+(i+.5)*(iw/x.length);let base=0;return `<g><title>${esc_(rot)}: ${series.map(s=>`${s.nome} ${fmt(Number(s.valores[i])||0)}`).join(' · ')}</title>${series.map((s,si)=>{const v=Number(s.valores[i])||0;const y0=Y(base+v),hh=Y(base)-y0;base+=v;return v?`<rect x="${(cx-bw/2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,hh).toFixed(1)}" rx="3" fill="${s.cor||COR[si%COR.length]}"/>`:''}).join('')}<text x="${cx.toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="11" fill="#5E6678">${esc_(rot)}</text></g>`}).join('');
  el.classList.add('ch-box');
  el.innerHTML=`<svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc_(rotuloAcessivel)}">${grade}${bars}</svg><div class="ch-leg">${series.map((s,si)=>`<span><i style="background:${s.cor||COR[si%COR.length]}"></i>${esc_(s.nome)}</span>`).join('')}</div>`;
 }
 return {linha,barras,empilhadas,spark,COR,nf,abrev,fmtDia};
})();
