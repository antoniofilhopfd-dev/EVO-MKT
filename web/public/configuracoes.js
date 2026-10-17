/* Configurações: tudo o que não é trabalho do dia a dia, em um só lugar.
   Seções: Meu perfil, Usuários e acessos, Integrações, Alertas, Preferências, Instituição, Segurança, Backup e manutenção.
   Só o Administrador vê usuários, integrações, instituição, segurança e backup (e o servidor confere de novo em cada rota). */
const CFG_SECOES=[['perfil','Meu perfil',false],['acessos','Usuários e acessos',true],['integracoes','Integrações',true],['alertas','Alertas',false],['preferencias','Preferências',false],['instituicao','Instituição',true],['seguranca','Segurança',true],['backups','Backup e manutenção',true]];
const cfgSecoesVisiveis=()=>CFG_SECOES.filter(([,,adm])=>!adm||internalSession?.admin);
const CFG_ALERTAS=[['orcamento','Limite de investimento'],['custo','Aumento de custo'],['desempenho','Queda de desempenho'],['reprovacao','Anúncio reprovado'],['entrega','Anúncio sem entrega'],['sync','Falha de sincronização'],['integracao','Integração desconectada'],['operacao','Operações e regras executadas']];

async function renderConfig(){
  const vis=cfgSecoesVisiveis();
  if(!vis.some(x=>x[0]===adminTab))adminTab='perfil';
  state.module=adminTab==='instituicao'?'configuracoes':null;
  $('#content').innerHTML=`<div class="cfg"><nav class="cfg-nav" aria-label="Seções de Configurações">${vis.map(([k,l])=>`<button type="button" data-cfg="${k}" class="${adminTab===k?'active':''}" ${adminTab===k?'aria-current="page"':''}>${esc(l)}</button>`).join('')}</nav><div class="cfg-body" id="cfgBody"><div id="adminBody"><div class="loading"><span></span><b>Carregando…</b></div></div></div></div>`;
  $$('[data-cfg]').forEach(b=>b.onclick=()=>{adminTab=b.dataset.cfg;renderConfig()});
  const corpo=$('#adminBody');
  try{
    if(adminTab==='perfil')corpo.innerHTML=cfgPerfil();
    else if(adminTab==='preferencias')corpo.innerHTML=cfgPreferencias();
    else if(adminTab==='alertas')return await cfgAlertas(corpo);
    else if(adminTab==='instituicao')return await cfgInstituicao(corpo);
    else return await adminRenderCorpo();
    cfgLiga();
  }catch(e){corpo.innerHTML=`<div class="error-state"><h2>Não foi possível carregar</h2><p>${esc(e.message)}</p></div>`}
}
async function renderAdministration(){return renderConfig()}
async function renderSettings(){return renderConfig()}

function cfgPerfil(){
  const u=internalSession,perfil=u.admin?'Administrador':'Equipe de Marketing';
  return `<section class="card"><div class="card-title"><div><small>MEU PERFIL</small><h3>${esc(u.name)}</h3></div></div>
   <div class="setting-row"><div><b>${esc(perfil)}</b><small>Código de acesso ${esc(u.code)}</small></div><button class="softbtn" id="meuSenha">Alterar senha</button></div>
   <p class="kpi-note">${u.admin?'O Administrador gerencia usuários, integrações, segurança e backups, e opera todos os módulos.':'A Equipe de Marketing opera Calendário, Instagram, Tráfego Pago e Arquivos, incluindo os relatórios de Instagram e de anúncios.'}</p></section>`;
}
function cfgPreferencias(){
  const compact=pref('compact',false),reduced=pref('reducedMotion',false),defaultPage=pref('defaultPage','hoje');
  return `<section class="card"><div class="card-title"><div><small>PREFERÊNCIAS</small><h3>Aparência e uso</h3></div></div>
   <label class="setting-row"><div><b>Modo compacto</b><small>Reduz espaços e mostra mais informação na tela.</small></div><input type="checkbox" id="compactToggle" ${compact?'checked':''}></label>
   <label class="setting-row"><div><b>Reduzir animações</b><small>Minimiza transições visuais.</small></div><input type="checkbox" id="motionToggle" ${reduced?'checked':''}></label>
   <label class="setting-row"><div><b>Alto contraste</b><small>Reforça contraste, bordas e foco do teclado.</small></div><input type="checkbox" id="contrastToggle" ${pref('highContrast',false)?'checked':''}></label>
   <label class="setting-row"><div><b>Escala do texto</b><small>Ajuste local de leitura.</small></div><select id="fontScale" class="control">${[['0.95','95%'],['1','100%'],['1.08','108%'],['1.15','115%']].map(([v,l])=>`<option value="${v}" ${String(pref('fontScale','1'))===v?'selected':''}>${l}</option>`).join('')}</select></label>
   <label class="setting-row"><div><b>Bloquear por inatividade</b><small>Encerra a sessão após o período escolhido.</small></div><select id="autoLock" class="control">${[['0','Desativado'],['15','15 min'],['30','30 min'],['60','60 min']].map(([v,l])=>`<option value="${v}" ${String(pref('autoLockMinutes','0'))===v?'selected':''}>${l}</option>`).join('')}</select></label>
   <label class="setting-row"><div><b>Página inicial</b><small>O primeiro módulo ao abrir.</small></div><select id="defaultPage" class="control">${[['hoje','Dashboard'],['calendario','Calendário'],['studio','Instagram'],['trafego','Tráfego Pago'],['arquivos','Arquivos']].map(([p,l])=>`<option value="${p}" ${defaultPage===p?'selected':''}>${l}</option>`).join('')}</select></label></section>`;
}
function cfgLiga(){
  $('#meuSenha')&&($('#meuSenha').onclick=()=>changeMyPassword());
  $('#compactToggle')&&($('#compactToggle').onchange=e=>{setPref('compact',e.target.checked);document.body.classList.toggle('compact',e.target.checked)});
  $('#motionToggle')&&($('#motionToggle').onchange=e=>{setPref('reducedMotion',e.target.checked);document.body.classList.toggle('reduced-motion',e.target.checked)});
  $('#contrastToggle')&&($('#contrastToggle').onchange=e=>{setPref('highContrast',e.target.checked);document.body.classList.toggle('high-contrast',e.target.checked)});
  $('#fontScale')&&($('#fontScale').onchange=e=>{setPref('fontScale',e.target.value);document.documentElement.style.setProperty('--evo-font-scale',e.target.value)});
  $('#autoLock')&&($('#autoLock').onchange=e=>setPref('autoLockMinutes',e.target.value));
  $('#defaultPage')&&($('#defaultPage').onchange=e=>setPref('defaultPage',e.target.value));
}
/** Alertas: que tipos de aviso a pessoa quer ver; as regras e limites ficam em Tráfego Pago → Alertas e automações. */
async function cfgAlertas(corpo){
  let atual={};try{const r=await api('/prefs?chave=alertas.categorias');atual=r.valor?JSON.parse(r.valor):{}}catch{}
  corpo.innerHTML=`<section class="card"><div class="card-title"><div><small>ALERTAS</small><h3>O que aparece nas minhas notificações</h3></div></div>
   <p class="kpi-note">Escolha os avisos que você quer receber no sistema. As regras, limites de investimento e automações ficam em <b>Tráfego Pago → Alertas e automações</b>.</p>
   ${CFG_ALERTAS.map(([k,l])=>`<label class="setting-row"><div><b>${esc(l)}</b></div><input type="checkbox" data-alerta="${k}" ${atual[k]===false?'':'checked'}></label>`).join('')}
   <div class="int-actions"><button class="btn" id="alertasSalvar">Salvar</button><button class="softbtn" id="alertasIr">Abrir regras no Tráfego Pago</button></div></section>`;
  $('#alertasSalvar').onclick=async()=>{const o={};$$('[data-alerta]').forEach(i=>{o[i.dataset.alerta]=i.checked});try{await api('/prefs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chave:'alertas.categorias',valor:o})});toast('Alertas salvos')}catch(e){toast(e.message,'bad')}};
  $('#alertasIr').onclick=()=>{if(typeof tpAba!=='undefined')tpAba='alertas';go('trafego')};
}
async function cfgInstituicao(corpo){
  const d=await getRows('configuracoes');state.module='configuracoes';state.rows=d.rows||[];
  corpo.innerHTML=`<section class="card"><div class="card-title"><div><small>INSTITUIÇÃO</small><h3>Colégio Evolução: missão, visão, valores e dados</h3></div><button class="btn" id="configNew">+ Nova informação</button></div>${renderTable('configuracoes',state.rows)}<div class="brand-preview" style="margin-top:14px"><div class="brandmark big">E</div><div><b>EVO MKT</b><span>Azul institucional, laranja de realce e azul claro de apoio</span></div></div></section>`;
  $('#configNew').onclick=()=>openModal();
  if(typeof bindModuleEvents==='function')bindModuleEvents();
}
