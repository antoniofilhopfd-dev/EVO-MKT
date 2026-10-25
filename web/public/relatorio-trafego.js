// Relatório de Tráfego Pago (A4, para imprimir ou salvar em PDF). Lê /api/trafego/relatorio (somente leitura) e monta a página
// com trafego-relatorio.js, o mesmo montador usado na pré-visualização dentro do EVO MKT.
const $=s=>document.querySelector(s);
const hojeBR=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const soma=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const Q=new URLSearchParams(location.search);
const OPC={tipo:TfRelatorio.TIPOS[Q.get('tipo')]?Q.get('tipo'):'geral',status:Object.hasOwn(TfRelatorio.STATUS_ROT,Q.get('status')||'')?Q.get('status'):'todos',segmento:Q.get('segmento')||'',campanha:Q.get('campanha')||'',semanal:Q.get('semanal')==='1',tp:Q.get('tp')||''};
let ultimo=null;
async function carregar(){
  const de=$('#de').value,ate=$('#ate').value;$('#rel').innerHTML='<div class="msg">Carregando da Meta…</div>';
  try{
    const r=await fetch(`/api/trafego/relatorio?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}${OPC.tp?'&tipo='+encodeURIComponent(OPC.tp):''}`,{credentials:'same-origin',headers:{'X-EVO':'1'}});let d={};try{d=await r.json()}catch{}
    if(r.status===401){$('#rel').innerHTML='<div class="msg">Entre no EVO MKT e abra este relatório de novo.</div>';return}
    if(!r.ok)throw new Error(d.error||'Não foi possível ler a Meta.');
    ultimo=d;desenhar();if(Q.get('imprimir')==='1'&&!carregar.impresso){carregar.impresso=true;setTimeout(()=>window.print(),600)}
  }catch(e){$('#rel').textContent='';const m=document.createElement('div');m.className='msg';m.textContent=e.message;$('#rel').appendChild(m)}
}
function desenhar(){if(!ultimo)return;$('#rel').innerHTML=TfRelatorio.html(ultimo,OPC,$('#sub').value,$('#obs').value.trim());document.querySelectorAll('#rel td.foto img').forEach(img=>{img.onerror=()=>img.replaceWith(Object.assign(document.createElement('span'),{textContent:'Imagem indisponível'}))})}
{
  const hoje=hojeBR();
  $('#de').value=/^\d{4}-\d\d-\d\d$/.test(Q.get('de')||'')?Q.get('de'):soma(hoje,-29);$('#ate').value=/^\d{4}-\d\d-\d\d$/.test(Q.get('ate')||'')?Q.get('ate'):hoje;
  $('#sub').value=`Colégio Evolução | Campanhas ${new Date().getFullYear()}`;$('#obs').value=TfRelatorio.obsPadrao();
  $('#escolhe').onclick=()=>PeriodoPicker.abrir({de:$('#de').value,ate:$('#ate').value,titulo:'Período do relatório',max:hoje},(a,b)=>{$('#de').value=a;$('#ate').value=b;carregar()});
  $('#atualiza').onclick=carregar;$('#imprime').onclick=()=>window.print();
  $('#sub').oninput=desenhar;$('#obs').oninput=desenhar;
  carregar();
}
