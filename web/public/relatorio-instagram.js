// Relatório mensal do Instagram (orgânico): pré-visualização na tela com o layout aprovado e download direto do PDF A4 paginado.
// Lê /api/instagram/relatorio (somente leitura). O mês escolhido governa a tela e o PDF. Nada é estimado: o que a Meta não trouxe fica de fora ou "—".
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const N0=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0});
const DMA=s=>String(s).slice(8,10)+'/'+String(s).slice(5,7)+'/'+String(s).slice(0,4),DM=s=>String(s).slice(8,10)+'/'+String(s).slice(5,7);
const url=u=>/^https:\/\/[^\s"'<>]+$/.test(u||'')?u:'';
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const FMT=t=>{const x=String(t||'').toUpperCase();return x==='REELS'?'Reels':x==='STORY'?'Stories':['CAROUSEL_ALBUM','IMAGE','FEED','VIDEO'].includes(x)?'Posts':'Outros'};
const COR_FMT={Reels:'#793A8C',Posts:'#00A1F3',Stories:'#FF7800',Outros:'#8A93A6'};
const pct1=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:1});
function varia(a,b){if(a===null||b===null||a===undefined||b===undefined)return ['sem mês anterior',''];if(!b)return [a?'novo no mês':'estável',''];const p=(a-b)/b*100;if(Math.abs(p)<.05)return ['estável',''];return [(p>0?'▲ ':'▼ ')+pct1(Math.abs(p))+'% vs. mês anterior',p>0?'up':'down']}
const kpi=(rot,v,ant,fmt)=>{const [t,c]=varia(v,ant);return `<div class="k"><small>${rot}</small><b>${fmt?fmt(v):N0(v)}</b><span class="v ${c}">${esc(t)}</span></div>`};
const passo=max=>{const b=max/4||1,m=10**Math.floor(Math.log10(b));return [1,2,2.5,5,10].map(x=>x*m).find(x=>x>=b)||b};
function svgLinha(rot,val,aria){
  const W=420,H=200,L=50,R=10,T=10,B=26,n=val.length;if(n<2)return '<div class="vazio">O histórico de seguidores deste mês tem menos de 2 registros.</div>';
  const mx=Math.max(...val),mn=Math.min(...val),f=(mx-mn)||Math.max(1,mx*.05),p=passo(f),base=Math.floor(mn/p)*p,top=Math.max(base+p*4,mx),X=i=>L+i*(W-L-R)/(n-1),Y=v=>T+(H-T-B)*(1-(v-base)/((top-base)||1));
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">`;for(let i=0;i<=4;i++){const v=base+(top-base)*i/4;s+=`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#E6E9F0"/><text x="${L-5}" y="${Y(v)+3}" text-anchor="end" font-size="9" fill="#5E6678">${N0(Math.round(v))}</text>`}
  const c=Math.max(1,Math.ceil(n/7));rot.forEach((r,i)=>{if(i%c===0||i===n-1)s+=`<text x="${X(i)}" y="${H-8}" text-anchor="middle" font-size="9" fill="#5E6678">${esc(r)}</text>`});
  s+=`<polyline fill="none" stroke="#063996" stroke-width="2" points="${val.map((v,i)=>`${X(i)},${Y(v)}`).join(' ')}"/>`;if(n<=40)val.forEach((v,i)=>{s+=`<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="#fff" stroke="#063996" stroke-width="1.6"><title>${esc(rot[i])}: ${N0(v)}</title></circle>`});return s+'</svg>';
}
function svgBarras(rot,series,aria){
  const W=420,H=200,L=50,R=10,T=10,B=26,n=rot.length;if(!n||!series.some(s=>s.v.some(x=>x>0)))return '<div class="vazio">Sem dados semanais de alcance e visualizações para este mês.</div>';
  const mx=Math.max(...series.flatMap(s=>s.v),1),p=passo(mx),top=p*4,gw=(W-L-R)/n,bw=Math.min(22,gw*.7/series.length),Y=v=>T+(H-T-B)*(1-v/top);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">`;for(let i=0;i<=4;i++)s+=`<line x1="${L}" x2="${W-R}" y1="${Y(p*i)}" y2="${Y(p*i)}" stroke="#E6E9F0"/><text x="${L-5}" y="${Y(p*i)+3}" text-anchor="end" font-size="9" fill="#5E6678">${N0(p*i)}</text>`;
  rot.forEach((r,i)=>{series.forEach((se,k)=>{const x=L+gw*i+(gw-bw*series.length)/2+bw*k,y=Y(se.v[i]||0);s+=`<rect x="${x}" y="${y}" width="${bw}" height="${H-B-y}" fill="${se.cor}" rx="2"><title>${esc(r)} · ${esc(se.nome)}: ${N0(se.v[i])}</title></rect>`});s+=`<text x="${L+gw*i+gw/2}" y="${H-8}" text-anchor="middle" font-size="9" fill="#5E6678">${esc(r)}</text>`});
  return s+'</svg>';
}
function rosca(fat,centro){
  const tot=fat.reduce((s,f)=>s+f.v,0),R=44,C=2*Math.PI*R;if(!tot)return '<div class="vazio">Sem interações nas publicações do mês.</div>';let off=0;
  let s=`<svg viewBox="0 0 120 120" width="130" height="130" role="img" aria-label="Interações por tipo de conteúdo"><g transform="rotate(-90 60 60)">`;fat.filter(f=>f.v>0).forEach(f=>{const len=f.v/tot*C;s+=`<circle cx="60" cy="60" r="${R}" fill="none" stroke="${f.cor}" stroke-width="14" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}"/>`;off+=len});
  return s+`</g><text x="60" y="58" text-anchor="middle" font-size="15" font-weight="700" fill="#00275F">${esc(centro)}</text><text x="60" y="72" text-anchor="middle" font-size="8" fill="#5E6678">interações</text></svg>`;
}
let ultimo=null;
function html(d){
  const [ano,mm]=d.mes.split('-').map(Number),nome=MESES[mm-1][0].toUpperCase()+MESES[mm-1].slice(1)+' de '+ano,per=d.periodo;
  const a=d.atual,p=d.anteriorMetricas,posts=d.posts||[],seg=num(d.seguidores),segA=num(d.seguidoresAnterior),novos=seg!==null&&segA!==null?seg-segA:null;
  const top=[...posts].sort((x,y)=>(num(y.alcance)||0)-(num(x.alcance)||0)).slice(0,5);
  const cards=[];
  if(seg!==null)cards.push(kpi('Seguidores',seg,segA));
  if(novos!==null)cards.push(`<div class="k"><small>Novos seguidores</small><b>${novos>0?'+':''}${N0(novos)}</b><span class="v">no mês</span></div>`);
  if(a&&num(a.alcance)!==null)cards.push(kpi('Alcance',num(a.alcance),p?num(p.alcance):null));
  if(a&&num(a.impressoes)!==null)cards.push(kpi('Visualizações',num(a.impressoes),p?num(p.impressoes):null));
  if(a&&num(a.interacoes)!==null)cards.push(kpi('Interações',num(a.interacoes),p?num(p.interacoes):null));
  if(a&&num(a.salvamentos)!==null)cards.push(kpi('Salvamentos',num(a.salvamentos),p?num(p.salvamentos):null));
  if(a&&num(a.compartilhamentos)!==null)cards.push(kpi('Compartilhamentos',num(a.compartilhamentos),p?num(p.compartilhamentos):null));
  cards.push(`<div class="k"><small>Publicações no mês</small><b>${N0(posts.length)}</b><span class="v">sincronizadas da Meta</span></div>`);
  const ss=d.serieSeguidores||[],sem=(d.semanas||[]).filter(s=>num(s.alcance)!==null||num(s.visualizacoes)!==null);
  const por={};posts.forEach(x=>{const f=FMT(x.tipo),o=por[f]||(por[f]={alc:0,int:0,n:0});o.alc+=num(x.alcance)||0;o.int+=Number(x.interacoes)||0;o.n++});
  const fm=['Reels','Posts','Stories','Outros'].filter(f=>por[f]),tA=fm.reduce((s,f)=>s+por[f].alc,0),tI=fm.reduce((s,f)=>s+por[f].int,0);
  const lin=(r,v,ant,mais)=>v===null?'':`<tr><td>${r}</td><td>${mais&&v>0?'+':''}${N0(v)}</td><td>${esc(varia(v,ant)[0].replace(' vs. mês anterior','').replace('▲ ','↑ ').replace('▼ ','↓ '))}</td></tr>`;
  const tab=[seg!==null?lin('Seguidores (final do mês)',seg,segA):'',novos!==null?`<tr><td>Novos seguidores</td><td>${novos>0?'+':''}${N0(novos)}</td><td>—</td></tr>`:'',...(a?[['Alcance','alcance'],['Visualizações','impressoes'],['Visitas ao perfil','visitasPerfil'],['Interações','interacoes'],['Curtidas','curtidas'],['Comentários','comentarios'],['Salvamentos','salvamentos'],['Compartilhamentos','compartilhamentos']].map(([r,k])=>num(a[k])===null?'':lin(r,num(a[k]),p?num(p[k]):null)):[]),`<tr><td>Publicações sincronizadas</td><td>${N0(posts.length)}</td><td>—</td></tr>`].join('');
  const comp=[['Seguidores',seg,segA],['Alcance',a?num(a.alcance):null,p?num(p.alcance):null],['Visualizações',a?num(a.impressoes):null,p?num(p.impressoes):null],['Interações',a?num(a.interacoes):null,p?num(p.interacoes):null]].filter(r=>r[1]!==null&&r[2]!==null);
  const mxC=Math.max(1,...comp.flatMap(r=>[r[1],r[2]]));
  const agora=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date());
  return `<article class="rel"><header class="cab"><img class="logo" src="/api/public/logo" alt="Colégio Evolução"><div class="tit"><h1>Relatório Mensal — Instagram</h1><p>${esc(nome)}</p></div><div class="conta"><b>${d.conta?'@'+esc(d.conta):'Instagram'}</b>Perfil institucional</div></header>
  <div class="corpo"><div class="resumo"><div><h2>Resumo do mês</h2><p>Principais indicadores do Instagram orgânico no período. Não inclui anúncios (Tráfego Pago).</p></div><div class="periodo">Período do relatório<b>${DMA(per.de)} a ${DMA(per.ate)}${per.parcial?' (mês em andamento)':''}</b></div></div>
  ${!a?'<p class="nota">As métricas mensais da conta (alcance, visualizações, interações) deste mês ainda não foram carregadas da Meta (Instagram › Ranking › Carregar histórico), por isso não aparecem. Nada é estimado.</p>':''}
  <div class="kpis">${cards.join('')}</div>
  <div class="duas"><section class="card"><h3>Evolução de seguidores</h3><p class="sub">Registros diários de seguidores no mês${novos!==null?` · ${novos>0?'+':''}${N0(novos)} no mês`:''}</p>${svgLinha(ss.map(x=>DM(x.dia)),ss.map(x=>x.seguidores),'Seguidores por dia')}</section>
  <section class="card"><h3>Alcance e visualizações</h3><p class="sub">Por semana (domingo a sábado) que toca o mês</p>${svgBarras(sem.map(s=>DM(s.inicio)),[{nome:'Alcance',cor:'#063996',v:sem.map(s=>num(s.alcance)||0)},{nome:'Visualizações',cor:'#793A8C',v:sem.map(s=>num(s.visualizacoes)||0)}],'Alcance e visualizações por semana')}</section></div>
  <div class="duas"><section class="card"><h3>Desempenho por tipo de conteúdo</h3><p class="sub">Alcance somado das publicações do mês, por formato</p>${fm.length?`<div class="fmt">${fm.map(f=>`<div><span>${f} (${por[f].n})</span><b>${N0(por[f].alc)}</b><span>${tA?pct1(por[f].alc/tA*100):'0'}%</span><span class="trilho"><i style="width:${tA?Math.max(1,por[f].alc/tA*100):0}%;background:${COR_FMT[f]}"></i></span></div>`).join('')}</div>`:'<div class="vazio">Sem publicações sincronizadas neste mês.</div>'}</section>
  <section class="card"><h3>Interações por tipo de conteúdo</h3><p class="sub">Curtidas, comentários, salvamentos e compartilhamentos</p><div class="rosca">${rosca(fm.map(f=>({v:por[f].int,cor:COR_FMT[f]})),N0(tI))}<ul>${fm.map(f=>`<li><i style="background:${COR_FMT[f]}"></i>${f} <b>${tI?pct1(por[f].int/tI*100):'0'}%</b></li>`).join('')}</ul></div></section></div>
  <section class="card"><h3>Melhores conteúdos do mês</h3><p class="sub">Publicações com maior alcance no período</p>${top.length?`<div class="top">${top.map((x,i)=>`<div class="t"><span class="n">${i+1}</span><div class="im">${url(x.miniatura)?`<img src="${esc(url(x.miniatura))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'Sem imagem'}</div><div class="tx"><b>${esc((x.legenda||'Sem legenda').slice(0,80))}</b><small>${FMT(x.tipo)} · ${DMA(String(x.publicado_em).slice(0,10))}</small><div class="m"><span>Alcance <b>${N0(num(x.alcance))}</b></span><span>Visualiz. <b>${N0(num(x.visualizacoes))}</b></span><span>Curtidas <b>${N0(num(x.curtidas))}</b></span><span>Salvos <b>${N0(num(x.salvos))}</b></span><span>Coment. <b>${N0(num(x.comentarios))}</b></span><span>Compart. <b>${N0(num(x.compartilhamentos))}</b></span></div></div></div>`).join('')}</div>`:'<div class="vazio">Nenhuma publicação sincronizada neste mês.</div>'}</section>
  <div class="duas"><section class="card"><h3>Resumo geral do mês</h3><table><thead><tr><th>Indicador</th><th>Total no mês</th><th>vs. mês anterior</th></tr></thead><tbody>${tab}</tbody></table></section>
  <section class="card"><h3>Mês atual × mês anterior</h3><p class="sub">Só o que existe nos dois meses</p>${comp.length?`<div class="comp">${comp.map(([r,v1,v2])=>`<div class="l"><b>${r}</b><div><div class="bar"><i style="width:${Math.max(2,v1/mxC*70)}%;background:#063996"></i><span>${N0(v1)}</span></div><div class="bar"><i style="width:${Math.max(2,v2/mxC*70)}%;background:#C9D3E6"></i><span style="font-weight:400;color:#5E6678">${N0(v2)}</span></div></div></div>`).join('')}</div>`:'<div class="vazio">Sem dados do mês anterior para comparar.</div>'}</section></div>
  <p class="nota">Dados lidos da Meta (somente leitura). Alcance, visualizações e impressões são métricas diferentes e não são somadas entre si nem entre meses. Seguidores do fim do mês vêm do último registro sincronizado.</p></div>
  <footer class="rodape"><img src="/api/public/logo" alt="Colégio Evolução"><span>Relatório Mensal — Instagram · Período: ${DMA(per.de)} a ${DMA(per.ate)} · Gerado em ${esc(agora)}</span></footer></article>`;
}
const consulta=()=>'mes='+encodeURIComponent($('#mes').value)+($('#perfil').value?'&conta='+encodeURIComponent($('#perfil').value):'');
let pedido=0;
async function carregar(){
  const meu=++pedido;$('#rel').innerHTML='<div class="msg">Carregando…</div>';$('#baixar').disabled=true;
  try{
    const r=await fetch('/api/instagram/relatorio?'+consulta(),{credentials:'same-origin',headers:{'X-EVO':'1'}});let d={};try{d=await r.json()}catch{}
    if(meu!==pedido)return; // resposta antiga de outro mês: descartada
    if(r.status===401||r.status===403){$('#rel').innerHTML='<div class="msg">Entre no EVO MKT e abra este relatório de novo.</div>';return}
    if(!r.ok)throw new Error(d.error||'Não foi possível montar o relatório.');
    ultimo=d;$('#rel').innerHTML=html(d);$('#baixar').disabled=false;
    document.querySelectorAll('.t .im img').forEach(img=>{img.onerror=()=>img.replaceWith(document.createTextNode('Imagem indisponível'))});
  }catch(e){if(meu===pedido){$('#rel').textContent='';const m=document.createElement('div');m.className='msg';m.textContent=e.message;$('#rel').appendChild(m)}}
}
async function baixar(){
  const b=$('#baixar'),rot=b.textContent;b.disabled=true;b.textContent='Gerando PDF…';$('#msg').textContent='';
  try{
    const r=await fetch('/api/instagram/relatorio.pdf?'+consulta(),{credentials:'same-origin',headers:{'X-EVO':'1'}});
    if(!r.ok){let m='Não foi possível gerar o PDF.';try{m=(await r.json()).error||m}catch{}throw new Error(m)}
    const nome=(/filename="([^"]+)"/.exec(r.headers.get('content-disposition')||'')||[])[1]||'Relatorio-Mensal-Instagram.pdf';
    const u=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=u;a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);$('#msg').textContent='PDF baixado.';
  }catch(e){$('#msg').textContent=e.message}
  b.disabled=false;b.textContent=rot;
}
{
  const h=new Date(),q=new URLSearchParams(location.search);
  $('#mes').value=/^\d{4}-\d\d$/.test(q.get('mes')||'')?q.get('mes'):`${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}`;
  $('#atualiza').onclick=carregar;$('#mes').onchange=carregar;$('#perfil').onchange=carregar;$('#baixar').onclick=baixar;
  // perfis monitorados (só consulta): escolhe pelo ?conta= (id), ?perfil= (@usuário) ou o perfil principal
  (async()=>{
    try{
      const r=await fetch('/api/instagram/contas',{credentials:'same-origin',headers:{'X-EVO':'1'}});const d=await r.json();if(!r.ok)throw new Error(d.error||'');
      const cs=d.contas||[],norm=x=>String(x||'').replace(/^@/,'').replace(/[._]/g,'').toLowerCase();
      const alvo=q.get('conta')||(cs.find(c=>norm(c.usuario)===norm(q.get('perfil')))||{}).ig||d.principal||(cs[0]||{}).ig||'';
      $('#perfil').innerHTML=cs.length?cs.map(c=>`<option value="${esc(c.ig)}" ${c.ig===alvo?'selected':''}>@${esc(String(c.usuario).replace(/^@/,''))}</option>`).join(''):'<option value="">Nenhum perfil conectado</option>';
    }catch{$('#perfil').innerHTML='<option value="">Perfil principal</option>'}
    carregar();
  })();
}
