/* Relatório semanal do Instagram: consulta histórica, sem mutações. PDF via impressão do navegador. */
(()=>{'use strict';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>d.toISOString().slice(0,10),parse=s=>new Date(s+'T12:00:00Z'),add=(s,n)=>iso(new Date(parse(s).getTime()+n*86400000));
const start=s=>add(s,-parse(s).getUTCDay()),fmt=s=>s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const n=(v,k)=>num(v)===null?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:k==='engajamento'?1:0})+(k==='engajamento'?'%':'');
const campos=[['Seguidores registrados','seguidores'],['Variação líquida de seguidores','novos'],['Alcance da conta','alcance'],['Visualizações','visualizacoes'],['Visitas ao perfil','visitasPerfil'],['Interações','interacoes'],['Engajamento (%)','engajamento']];
const hoje=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=k=>p.find(x=>x.type===k)?.value;return v('year')+'-'+v('month')+'-'+v('day')};
let semana=start(hoje()),contas=[],pedido=0;
const compara=(a,b,k)=>{a=num(a);b=num(b);if(a===null||b===null)return 'Sem base anterior';if(k==='engajamento')return (a-b>0?'+':'')+(a-b).toLocaleString('pt-BR',{maximumFractionDigits:1})+' p.p.';if(!b)return a?'Novo no período':'Estável';const v=(a-b)/b*100;return (v>0?'+':'')+v.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'};
async function get(url){const r=await fetch(url,{credentials:'same-origin',headers:{'X-EVO':'1'}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||('Falha HTTP '+r.status));return d}
async function historico(ano){return get('/api/instagram/ranking-contas?visao=semana&ano='+ano)}
function linhas(per,ant){return campos.map(([rot,k])=>'<tr><td>'+esc(rot)+'</td><td>'+n(per?.[k],k)+'</td><td>'+n(ant?.[k],k)+'</td><td>'+esc(compara(per?.[k],ant?.[k],k))+'</td></tr>').join('')}
function perfil(nome,per,ant){return '<section class="card wk-profile"><h3>@'+esc(String(nome).replace(/^@/,''))+'</h3><div class="wk-table-wrap"><table class="wk-table"><thead><tr><th>Indicador</th><th>Semana selecionada</th><th>Semana anterior</th><th>Variação</th></tr></thead><tbody>'+linhas(per,ant)+'</tbody></table></div></section>'}
function card(rot,v,ant,k){return '<div class="k"><small>'+esc(rot)+'</small><b>'+n(v)+'</b><span class="v">'+esc(compara(v,ant,k))+' vs. semana anterior</span></div>'}
async function carregar(){const meu=++pedido;$('#rel').innerHTML='<div class="msg">Carregando…</div>';$('#pdf').disabled=true;$('#msg').textContent='';
const fim=add(semana,6),prev=add(semana,-7),anos=[...new Set([semana.slice(0,4),prev.slice(0,4)])];$('#periodo').textContent=fmt(semana)+' a '+fmt(fim);$('#avancar').disabled=semana>=start(hoje());
try{const dados=await Promise.all(anos.map(historico)),periodos=dados.flatMap(d=>d.periodos||[]),atual=periodos.find(p=>p.inicio===semana),anterior=periodos.find(p=>p.inicio===prev);
if(meu!==pedido)return;
const modo=$('#modo').value,alvo=$('#perfil').value,nomes=modo==='comparativo'?contas.map(c=>c.usuario):[contas.find(c=>c.ig===alvo)?.usuario||contas[0]?.usuario].filter(Boolean);
const byNome=(p,nome)=>p?.contas?.find(c=>String(c.usuario).replace(/^@/,'')===String(nome).replace(/^@/,''));
const perfis=nomes.map(nome=>({nome,at:byNome(atual,nome),ant:byNome(anterior,nome)}));
const parcial=fim>=hoje(),semDados=perfis.every(p=>!p.at||campos.every(([,k])=>num(p.at[k])===null));
const corpo=perfis.map(p=>perfil(p.nome,p.at,p.ant)).join('');
const destaque=modo==='individual'&&perfis.length?'<div class="kpis">'+[['Alcance','alcance'],['Visualizações','visualizacoes'],['Interações','interacoes'],['Seguidores','seguidores']].map(([r,k])=>card(r,perfis[0].at?.[k],perfis[0].ant?.[k],k)).join('')+'</div>':'';
$('#rel').innerHTML='<article class="rel"><header class="cab"><img class="logo" src="/api/public/logo" alt="Colégio Evolução"><div class="tit"><h1>Relatório Semanal — Instagram</h1><p>'+fmt(semana)+' a '+fmt(fim)+'</p></div><div class="conta"><b>Instagram orgânico</b>'+esc(modo==='comparativo'?'Comparação de perfis':'Perfil individual')+'</div></header><div class="corpo"><div class="resumo"><div><h2>Resultados da semana</h2><p>Comparação com '+fmt(prev)+' a '+fmt(add(prev,6))+'</p></div><div class="periodo">Período selecionado<b>'+fmt(semana)+' a '+fmt(fim)+(parcial?' · em andamento':'')+'</b></div></div>'+destaque+(semDados?'<p class="wk-note">Sem métricas semanais disponíveis para os perfis selecionados. Valores ausentes são exibidos como —.</p>':'')+corpo+'<p class="wk-note">Fonte: Instagram / Meta, histórico sincronizado do EVO MKT. Alcance não é somado entre perfis; seguidores representam registros disponíveis, e a variação líquida não significa seguidores atribuídos às publicações. Semanas incompletas e lacunas de sincronização podem afetar comparações. O relatório não inclui anúncios pagos.</p></div><footer class="rodape">Colégio Evolução · EVO MKT <span>Gerado em '+esc(new Date().toLocaleString('pt-BR'))+'</span></footer></article>';
$('#pdf').disabled=false;
}catch(e){if(meu===pedido){$('#rel').innerHTML='<div class="msg">'+esc(e.message||'Não foi possível carregar o relatório.')+'</div>';$('#msg').textContent='Falha ao carregar.'}}}
function ir(s){semana=s;carregar()}
$('#atual').onclick=()=>ir(start(hoje()));$('#anterior').onclick=()=>ir(add(start(hoje()),-7));$('#voltar').onclick=()=>ir(add(semana,-7));$('#avancar').onclick=()=>{if(semana<start(hoje()))ir(add(semana,7))};
$('#modo').onchange=()=>{$('#perfilWrap').hidden=$('#modo').value==='comparativo';carregar()};$('#perfil').onchange=carregar;
$('#pdf').onclick=()=>{if(!$('#pdf').disabled)window.print()};
(async()=>{try{const d=await get('/api/instagram/contas');contas=d.contas||[];const q=new URLSearchParams(location.search),norm=s=>String(s||'').replace(/^@/,'').replace(/[._]/g,'').toLowerCase(),sel=contas.find(c=>c.ig===q.get('conta')||norm(c.usuario)===norm(q.get('perfil')))?.ig||d.principal||contas[0]?.ig;
$('#perfil').innerHTML=contas.map(c=>'<option value="'+esc(c.ig)+'"'+(c.ig===sel?' selected':'')+'>@'+esc(c.usuario)+'</option>').join('');
$('#modo').querySelector('option[value="comparativo"]').disabled=contas.length<2;
const requested=q.get('semana');if(/^\d{4}-\d{2}-\d{2}$/.test(requested||'')&&Number.isFinite(parse(requested).getTime())&&iso(parse(requested))===requested&&requested>= '2020-01-01'&&requested<=hoje()&&start(requested)===requested)semana=requested;
if(!contas.length)throw Error('Nenhum perfil monitorado.');await carregar()
}catch(e){$('#rel').innerHTML='<div class="msg">'+esc(e.message||'Falha ao consultar contas.')+'</div>'}})();
})();