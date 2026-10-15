// Relatório mensal do Instagram. Lê /api/instagram/relatorio (somente leitura) e monta o A4 para imprimir/salvar em PDF.
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const N0=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
const DMA=s=>String(s).slice(8,10)+'/'+String(s).slice(5,7)+'/'+String(s).slice(0,4);
const url=u=>/^https:\/\/[^\s"'<>]+$/.test(u||'')?u:'';
const delta=(a,b)=>{if(b===null||b===undefined||b===''||!Number(b))return '';const p=(Number(a)-Number(b))/Number(b)*100;return `<small class="${p>=0?'up':'down'}" style="color:${p>=0?'#2E9F5B':'#C0392B'}">${p>=0?'▲':'▼'} ${Math.abs(p).toLocaleString('pt-BR',{maximumFractionDigits:1})}% vs. mês anterior</small>`};
let ultimo=null;
const kpi=(rot,v,ant)=>`<div class="k"><small>${rot}</small><b>${v===null||v===undefined?'—':N0(v)}</b>${delta(v,ant)}</div>`;
function html(d,sub,obs){
  const a=d.atual||{},p=d.anteriorMetricas||{},mes=MESES[Number(d.mes.slice(5,7))-1]+'/'+d.mes.slice(0,4);
  const posts=d.posts,top=posts.slice(0,5);
  const tipos={};posts.forEach(x=>{const t=x.tipo==='REELS'?'Reels':x.tipo==='STORY'?'Stories':x.tipo==='CAROUSEL_ALBUM'?'Carrossel':'Feed';tipos[t]=(tipos[t]||0)+1});
  const seg=d.seguidores!==null?Number(d.seguidores):null,segA=d.seguidoresAnterior!==null?Number(d.seguidoresAnterior):null;
  return `<section class="pg"><header class="cab"><h1>Relatório mensal — Instagram${d.conta?' @'+esc(d.conta):''}</h1><img class="sim" src="/img/logo-simbolo.png" alt=""><p class="sub">${esc(sub)}</p></header>
  <div class="bloco"><h2>Indicadores de ${esc(mes)}</h2><span class="tag m">MENSAL</span></div>
  <div class="kpis m">${kpi('Seguidores',seg,segA)}${kpi('Alcance',a.alcance,p.alcance)}${kpi('Visualizações',a.impressoes,p.impressoes)}${kpi('Visitas ao perfil',a.visitasPerfil,p.visitasPerfil)}${kpi('Interações',a.interacoes,p.interacoes)}${kpi('Curtidas',a.curtidas,p.curtidas)}${kpi('Comentários',a.comentarios,p.comentarios)}${kpi('Compartilhamentos',a.compartilhamentos,p.compartilhamentos)}${kpi('Salvamentos',a.salvamentos,p.salvamentos)}${kpi('Publicações',posts.length,null)}</div>
  <p class="nota">Formatos publicados: ${Object.entries(tipos).map(([k,v])=>`${esc(k)} ${v}`).join(' · ')||'—'}.${seg!==null&&segA!==null?` Variação de seguidores no mês: ${seg-segA>=0?'+':''}${N0(seg-segA)}.`:''}</p></section>
  <section class="pg"><div class="bloco"><h2>Melhores publicações do mês</h2><span class="tag s">TOP 5 POR INTERAÇÕES</span></div>
  <table><thead><tr><th>Foto</th><th>Publicação</th><th>Alcance</th><th>Curtidas</th><th>Coment.</th><th>Salvos</th><th>Compart.</th><th>Interações</th></tr></thead><tbody>${top.map(x=>`<tr><td>${url(x.miniatura)?`<img src="${esc(url(x.miniatura))}" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:6px" referrerpolicy="no-referrer">`:''}</td><td class="l">${url(x.permalink)?`<a href="${esc(url(x.permalink))}">${esc((x.legenda||'Sem legenda').slice(0,70))}</a>`:esc((x.legenda||'Sem legenda').slice(0,70))}<br><small>${DMA(String(x.publicado_em).slice(0,10))}</small></td><td>${x.alcance===null?'—':N0(x.alcance)}</td><td>${N0(x.curtidas)}</td><td>${N0(x.comentarios)}</td><td>${N0(x.salvos)}</td><td>${N0(x.compartilhamentos)}</td><td><b>${N0(x.interacoes)}</b></td></tr>`).join('')||'<tr><td colspan="8">Sem publicações neste mês.</td></tr>'}</tbody></table>${obs?`<p class="nota">${esc(obs)}</p>`:''}</section>`;
}
function obsPadrao(d){const p=[];if(!d.atual)p.push('As métricas deste mês ainda não foram carregadas da Meta (Instagram → Ranking → Carregar histórico).');p.push('Dados lidos da Meta; o EVO MKT não altera nada na plataforma. Alcance e visualizações não somam entre meses.');return p.join(' ')}
async function carregar(){
  $('#rel').innerHTML='<div class="msg">Carregando…</div>';
  try{
    const r=await fetch('/api/instagram/relatorio?mes='+encodeURIComponent($('#mes').value),{credentials:'same-origin',headers:{'X-EVO':'1'}});let d={};try{d=await r.json()}catch{}
    if(r.status===401||r.status===403){$('#rel').innerHTML='<div class="msg">Entre no EVO MKT como Gerência e abra este relatório de novo.</div>';return}
    if(!r.ok)throw new Error(d.error||'Não foi possível montar o relatório.');
    ultimo=d;$('#obs').value=obsPadrao(d);desenhar();
  }catch(e){$('#rel').innerHTML=`<div class="msg">${esc(e.message)}</div>`}
}
function desenhar(){if(ultimo)$('#rel').innerHTML=html(ultimo,$('#sub').value,$('#obs').value.trim())}
{
  const h=new Date(),q=new URLSearchParams(location.search);
  $('#mes').value=/^\d{4}-\d\d$/.test(q.get('mes')||'')?q.get('mes'):`${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}`;
  $('#sub').value=`Colégio Evolução | Instagram ${h.getFullYear()}`;
  $('#atualiza').onclick=carregar;$('#imprime').onclick=()=>window.print();$('#sub').oninput=desenhar;$('#obs').oninput=desenhar;carregar();
}
