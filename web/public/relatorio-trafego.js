// Relatório geral de Tráfego Pago em tela cheia (SOMENTE visualização; o arquivo PDF é baixado em Tráfego Pago › Relatórios).
// Lê /api/trafego/relatorio (somente leitura) e monta a página com trafego-relatorio.js, o mesmo montador da pré-visualização.
const $=s=>document.querySelector(s);
const Q=new URLSearchParams(location.search);
const OPC={status:Q.get('status')||'todos',segmento:Q.get('segmento')||'',campanha:Q.get('campanha')||'',semanal:Q.get('semanal')==='1',tp:Q.get('tp')||Q.get('tipo')||''};
const dataOk=v=>/^\d{4}-\d\d-\d\d$/.test(v||'')?v:'';
(async()=>{
  const de=dataOk(Q.get('de')),ate=dataOk(Q.get('ate'));
  if(!de||!ate){$('#rel').innerHTML='<div class="msg">Abra este relatório por Tráfego Pago › Relatórios.</div>';return}
  try{
    const r=await fetch(`/api/trafego/relatorio?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}${OPC.tp?'&tipo='+encodeURIComponent(OPC.tp):''}`,{credentials:'same-origin',headers:{'X-EVO':'1'}});let d={};try{d=await r.json()}catch{}
    if(r.status===401){$('#rel').innerHTML='<div class="msg">Entre no EVO MKT e abra este relatório de novo.</div>';return}
    if(!r.ok)throw new Error(d.error||'Não foi possível ler a Meta.');
    $('#rel').innerHTML=TfRelatorio.html(d,{...OPC,semanal:OPC.semanal&&d.periodo.dias>=7},TfRelatorio.obsPadrao());
    document.querySelectorAll('#rel td.foto img').forEach(img=>{img.onerror=()=>img.replaceWith(Object.assign(document.createElement('span'),{textContent:'Imagem indisponível'}))});
  }catch(e){$('#rel').textContent='';const m=document.createElement('div');m.className='msg';m.textContent=e.message;$('#rel').appendChild(m)}
})();
