/* Configurações: cinco áreas (Geral, Usuários e Permissões, Integrações, Segurança e Dados do Sistema), cada uma com as próprias abas.
   O que mexe em acessos, integrações, backup e logs é só do Administrador; o servidor confere de novo em cada rota.
   E-mail (SMTP) não é mais configurado aqui. Google Drive aparece como integração ainda não implementada, sem afirmar nada que não exista. */
const CFG_AREAS = [
  { k: 'geral', t: 'Geral', d: 'Informações da escola, aparência, preferências e segmentos.', ic: '⚙', adm: false, abas: [['escola', 'Informações da Escola'], ['aparencia', 'Aparência'], ['preferencias', 'Preferências'], ['segmentos', 'Segmentos']] },
  { k: 'usuarios', t: 'Usuários e Permissões', d: 'Gerencie usuários, perfis e permissões de acesso.', ic: '☺', adm: true, abas: [['usuarios', 'Usuários'], ['perfis', 'Perfis'], ['permissoes', 'Permissões']] },
  { k: 'integracoes', t: 'Integrações', d: 'Conecte e gerencie Google Agenda, Meta (Instagram e Tráfego Pago) e Google Drive.', ic: '∞', adm: true, abas: [] },
  { k: 'seguranca', t: 'Segurança', d: 'Autenticação, backups e logs de acesso e alterações.', ic: '◈', adm: true, abas: [['autenticacao', 'Autenticação'], ['backups', 'Backups'], ['logs', 'Logs de Acesso']] },
  { k: 'dados', t: 'Dados do Sistema', d: 'Informações do sistema, diagnóstico e manutenção.', ic: '▤', adm: false, abas: [['informacoes', 'Informações'], ['diagnostico', 'Diagnóstico'], ['manutencao', 'Manutenção']] },
];
const CFG = { sec: '', aba: '', sub: '', interno: false };
/** Redesenha Configurações mantendo a área e a aba abertas; chegar de outra página (menu ou atalho) volta à tela inicial. */
const cfgIr = () => { CFG.interno = true; go('configuracoes'); };
const cfgAdm = () => !!internalSession?.admin;
const cfgAreasVisiveis = () => CFG_AREAS.filter(a => !a.adm || cfgAdm());
/** Abas de uma área para esta pessoa: quem não é Administrador só vê o Diagnóstico (prontidão) em Dados do Sistema. */
const cfgAbasDe = a => a.k === 'dados' && !cfgAdm() ? a.abas.filter(x => x[0] === 'diagnostico') : a.abas;
const cfgBadge = (on, ok, nao = 'Não conectado') => `<span class="badge ${on ? 'ok' : 'mute'}">${on ? esc(ok) : esc(nao)}</span>`;
const cfgUri = (rot, u) => `<div class="uri-row"><small>${esc(rot)}</small><code>${esc(u)}</code><button type="button" class="btn soft" data-copiar="${attr(u)}">Copiar</button></div>`;
const salvaCred = async (formId, extra = {}) => { const f = Object.fromEntries(new FormData($(formId)).entries()); try { await post('/integrations/settings', { ...f, ...extra }); toast('Salvo'); cfgIr(); } catch (e) { toast(e.message, 'warn'); } };

/* ---- Geral ---- */
async function cfgGeral(corpo) {
  const u = internalSession, compact = pref('compact', false), reduced = pref('reducedMotion', false);
  const inst = ((await getRows('configuracoes', true)).rows || []);
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Meu perfil</h2></div><div class="setting-row"><div><b>${esc(u.name)}</b><small>${u.admin ? 'Administrador' : 'Equipe de Marketing'} · código ${esc(u.code)}</small></div><button class="btn soft" id="cfgSenha">Alterar senha</button></div></section>
    <section class="card"><div class="db-tit"><h2>Preferências deste aparelho</h2></div>
      <label class="setting-row"><div><b>Modo compacto</b><small>Reduz espaços e mostra mais informação.</small></div><input type="checkbox" id="pCompact" ${compact ? 'checked' : ''}></label>
      <label class="setting-row"><div><b>Reduzir animações</b></div><input type="checkbox" id="pMotion" ${reduced ? 'checked' : ''}></label>
      <label class="setting-row"><div><b>Alto contraste</b><small>Reforça bordas, contraste e foco do teclado.</small></div><input type="checkbox" id="pContrast" ${pref('highContrast', false) ? 'checked' : ''}></label>
      <label class="setting-row"><div><b>Tamanho do texto</b></div><select id="pFonte" class="control">${[['0.95', '95%'], ['1', '100%'], ['1.08', '108%'], ['1.15', '115%']].map(([v, l]) => `<option value="${v}" ${String(pref('fontScale', '1')) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="setting-row"><div><b>Bloquear por inatividade</b></div><select id="pLock" class="control">${[['0', 'Desativado'], ['15', '15 min'], ['30', '30 min'], ['60', '60 min']].map(([v, l]) => `<option value="${v}" ${String(pref('autoLockMinutes', '0')) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="setting-row"><div><b>Página inicial</b></div><select id="pInicio" class="control">${[['hoje', 'Dashboard'], ['calendario', 'Calendário'], ['igvisao', 'Instagram'], ['trafego', 'Tráfego Pago']].map(([v, l]) => `<option value="${v}" ${pref('defaultPage', 'hoje') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></section>
    <section class="card"><div class="db-tit"><h2>Dados da instituição</h2><button class="btn soft" id="instNova">+ Nova informação</button></div><p class="kpi-note">Missão, visão, valores e dados do Colégio usados como referência pela equipe.</p>${inst.length ? inst.map(r => `<div class="mod-item"><b>${esc(r.titulo)}</b><p>${esc(r.descricao || '')}</p><button class="btn soft" data-inst="${attr(r.id)}">Editar</button></div>`).join('') : '<div class="empty compact">Nenhuma informação cadastrada.</div>'}</section>`;
  $('#cfgSenha').onclick = changeMyPassword;
  $('#pCompact').onchange = e => { setPref('compact', e.target.checked); document.body.classList.toggle('compact', e.target.checked); };
  $('#pMotion').onchange = e => { setPref('reducedMotion', e.target.checked); document.body.classList.toggle('reduced-motion', e.target.checked); };
  $('#pContrast').onchange = e => { setPref('highContrast', e.target.checked); document.body.classList.toggle('high-contrast', e.target.checked); };
  $('#pFonte').onchange = e => { setPref('fontScale', e.target.value); document.documentElement.style.setProperty('--evo-font-scale', e.target.value); };
  $('#pLock').onchange = e => setPref('autoLockMinutes', e.target.value);
  $('#pInicio').onchange = e => setPref('defaultPage', e.target.value);
  const form = r => {
    const e = !!r; r = r || {};
    const o = dialogo(`<h3>${e ? 'Editar informação' : 'Nova informação'}</h3><form class="cm-form" id="iForm"><label class="wide">Título *<input class="control" id="iT" maxlength="140" value="${attr(r.titulo || '')}"></label><label class="wide">Texto<textarea class="control" id="iD" rows="5" maxlength="2000">${esc(r.descricao || '')}</textarea></label><div class="cm-erro wide" id="iErr" role="alert"></div><div class="actions wide">${e ? '<button type="button" class="btn danger-soft" id="iDel">Excluir</button>' : ''}<span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>`);
    $('#iForm', o.el).onsubmit = async ev => { ev.preventDefault(); const b = { titulo: $('#iT', o.el).value.trim(), descricao: $('#iD', o.el).value.trim() }; if (b.titulo.length < 3) { $('#iErr', o.el).textContent = 'Dê um título.'; return; } try { if (e) await put(`/data?module=configuracoes&id=${encodeURIComponent(r.id)}`, b); else await post('/data?module=configuracoes', b); invalidate('configuracoes'); o.close(); cfgIr(); } catch (er) { $('#iErr', o.el).textContent = er.message; } };
    const d = $('#iDel', o.el); if (d) d.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Excluir informação', texto: `Excluir “${r.titulo}”?`, confirmar: 'Excluir', perigo: true })) return; try { await api(`/data?module=configuracoes&id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }); invalidate('configuracoes'); o.close(); cfgIr(); } catch (er) { toast(er.message, 'warn'); } };
  };
  $('#instNova').onclick = () => form(null);
  $$('[data-inst]').forEach(b => { b.onclick = () => form(inst.find(r => r.id === b.dataset.inst)); });
}

/* ---- Perfis e segmentos ---- */
async function cfgPerfis(corpo) {
  const st = internalSession?.admin ? await api('/integrations/status').catch(() => null) : null;
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Perfis do Instagram</h2></div><p class="kpi-note">Os dois perfis do Colégio. Cada publicação pertence a um perfil (ou aos dois, quando compartilhada).</p>
    ${['@evolucaopb', '@geracaoevolucao'].map(p => { const c = (st?.instagram?.contas || []).find(x => '@' + String(x.usuario).replace(/^@/, '') === p); const mon = c && ((st.instagram.monitoradas || []).includes(c.ig) || st.instagram.igUserId === c.ig); return `<div class="setting-row"><div><b>${p}</b><small>${c ? (mon ? 'Conta conectada e acompanhada' : 'Conta encontrada, ainda não acompanhada (Configurações › Instagram)') : st ? 'Conta ainda não encontrada na conexão com a Meta' : 'Conexão visível apenas ao Administrador'}</small></div>${cfgBadge(!!mon, 'Acompanhado', 'Sem dados')}</div>`; }).join('')}</section>
    <section class="card"><div class="db-tit"><h2>Segmentos</h2></div><p class="kpi-note">Catálogo único usado em filtros, calendário, publicações e relatórios. Os nomes são fixos para que os números sempre combinem.</p><ul class="seg-lista">${SEG_LISTA.filter(s => s[0]).map(s => `<li>${esc(s[1])}</li>`).join('')}<li>Todos</li></ul></section>`;
}

/* ---- Acessos internos ---- */
async function cfgAcessos(corpo) {
  const [users, modo] = await Promise.all([api('/admin/users'), api('/auth/mode').then(m => m.modo)]);
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Acessos internos</h2><div><button class="btn soft" id="modoBtn">${modo === 'codigo' ? 'Voltar a código + senha' : 'Entrar só com código'}</button> <button class="btn" id="novaFicha">+ Nova ficha</button></div></div>
    <p class="kpi-note">Só a equipe de Marketing tem acesso. Não existe Portal para outras áreas. O e-mail é usado para avisos de atribuição.</p>
    <div class="tablewrap"><table class="datatable"><thead><tr><th>Código</th>${modo === 'codigo' ? '<th>Acesso</th>' : ''}<th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${users.map(u => `<tr><td>${esc(u.codigo)}</td>${modo === 'codigo' ? `<td><code>${esc(u.acesso || '—')}</code></td>` : ''}<td class="titlecell">${esc(u.nome)}</td><td>${esc(u.email || '—')} <button class="btn soft" data-email="${attr(u.codigo)}|${attr(u.email || '')}" aria-label="Editar e-mail de ${attr(u.nome)}">Editar</button></td><td><select class="control" data-nivel="${attr(u.codigo)}" aria-label="Perfil de ${attr(u.nome)}"><option value="team" ${u.nivel !== 'admin' ? 'selected' : ''}>Equipe</option><option value="admin" ${u.nivel === 'admin' ? 'selected' : ''}>Administrador</option></select></td><td>${u.ativo ? '<span class="badge ok">Ativo</span>' : '<span class="badge mute">Inativo</span>'}${u.pediuReset ? ' <span class="badge warn">pediu nova senha</span>' : ''}</td><td class="acoes-cel"><button class="btn soft" data-reset="${attr(u.codigo)}">${modo === 'codigo' ? 'Novo código' : 'Nova senha'}</button><button class="btn soft" data-ativo="${attr(u.codigo)}|${u.ativo ? 0 : 1}">${u.ativo ? 'Desativar' : 'Ativar'}</button><button class="btn soft" data-exp="${attr(u.codigo)}">Exportar dados</button><button class="btn danger-soft" data-del="${attr(u.codigo)}|${attr(u.nome)}">Excluir</button></td></tr>`).join('')}</tbody></table></div></section>`;
  const recarrega = () => cfgIr();
  const mostraAcesso = (titulo, texto, valor) => dialogo(`<h3>${esc(titulo)}</h3><p>${esc(texto)}</p><div class="temp-pass">${esc(valor)}</div><p class="kpi-note">Anote agora: depois disso a senha temporária não aparece de novo.</p><div class="actions"><button class="btn soft" data-close id="okAcesso">Fechar</button></div>`, { aoFechar: recarrega });
  $('#modoBtn').onclick = async () => { const novo = modo === 'codigo' ? 'senha' : 'codigo'; if (!await Dlg.confirmar({ titulo: 'Mudar o modo de entrada', texto: novo === 'codigo' ? 'Entrar só com código: quem ainda não tem código recebe um novo; ninguém precisará de senha.' : 'Voltar a código + senha: cada pessoa precisará definir uma senha no próximo acesso.', confirmar: 'Mudar' })) return; try { await post('/admin/mode', { modo: novo }); toast('Modo atualizado'); recarrega(); } catch (e) { toast(e.message, 'warn'); } };
  $('#novaFicha').onclick = () => {
    const o = dialogo(`<h3>Nova ficha</h3><form class="cm-form" id="fichaForm"><label class="wide">Nome *<input class="control" id="fN" maxlength="120" autocomplete="off"></label><label>Perfil<select class="control" id="fP"><option value="team">Equipe</option><option value="admin">Administrador</option></select></label><div class="cm-erro wide" id="fErr" role="alert"></div><div class="actions wide"><span class="cm-esp"></span><button type="button" class="btn soft" data-close>Cancelar</button><button class="btn" type="submit">Criar ficha</button></div></form>`);
    $('#fN', o.el).focus();
    $('#fichaForm', o.el).onsubmit = async e => { e.preventDefault(); try { const r = await post('/admin/users/create', { tipo: 'interno', nome: $('#fN', o.el).value, perfil: $('#fP', o.el).value }); o.close(); mostraAcesso('Ficha criada', `${r.nome} (${r.codigo}) — ${r.modo === 'codigo' ? 'código de acesso:' : 'senha temporária:'}`, r.acesso); } catch (er) { $('#fErr', o.el).textContent = er.message; } };
  };
  $$('[data-nivel]', corpo).forEach(s => { s.onchange = async () => { if (!await Dlg.confirmar({ titulo: 'Mudar perfil', texto: `Mudar ${s.dataset.nivel} para ${s.value === 'admin' ? 'Administrador' : 'Equipe'}? ${s.value === 'admin' ? 'O Administrador gerencia acessos, integrações, backup e auditoria.' : ''}`, confirmar: 'Mudar' })) return recarrega(); try { await post('/admin/users/role', { codigo: s.dataset.nivel, perfil: s.value }); toast('Perfil atualizado'); } catch (e) { toast(e.message, 'warn'); recarrega(); } }; });
  $$('[data-email]', corpo).forEach(b => { b.onclick = async () => { const [cod, atual] = b.dataset.email.split('|'); const v = await Dlg.perguntar({ titulo: 'E-mail da pessoa', rotulo: 'E-mail (deixe vazio para remover)', valor: atual, tipo: 'email', obrigatorio: false }); if (v === null) return; try { await post('/admin/users/email', { codigo: cod, email: v }); toast('E-mail salvo'); recarrega(); } catch (e) { toast(e.message, 'warn'); } }; });
  $$('[data-reset]', corpo).forEach(b => { b.onclick = async () => { if (!await Dlg.confirmar({ titulo: modo === 'codigo' ? 'Gerar novo código' : 'Gerar nova senha', texto: `Gerar ${modo === 'codigo' ? 'um novo código de acesso' : 'uma senha temporária'} para ${b.dataset.reset}? A pessoa será desconectada.`, confirmar: 'Gerar' })) return; try { const r = await post('/admin/reset-password', { tipo: 'interno', codigo: b.dataset.reset }); mostraAcesso(modo === 'codigo' ? 'Novo código' : 'Senha temporária', `${b.dataset.reset}:`, r.senhaTemporaria); } catch (e) { toast(e.message, 'warn'); } }; });
  $$('[data-ativo]', corpo).forEach(b => { b.onclick = async () => { const [cod, on] = b.dataset.ativo.split('|'); if (on === '0' && !await Dlg.confirmar({ titulo: 'Desativar acesso', texto: `${cod} perde o acesso agora.`, confirmar: 'Desativar', perigo: true })) return; try { await post('/admin/user-active', { tipo: 'interno', codigo: cod, ativo: on === '1' }); toast('Acesso atualizado'); recarrega(); } catch (e) { toast(e.message, 'warn'); } }; });
  $$('[data-exp]', corpo).forEach(b => { b.onclick = async () => { try { const d = await api(`/admin/lgpd/exportar?codigo=${encodeURIComponent(b.dataset.exp)}`); const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `dados_${b.dataset.exp}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } catch (e) { toast(e.message, 'warn'); } }; });
  $$('[data-del]', corpo).forEach(b => { b.onclick = async () => { const [cod, nome] = b.dataset.del.split('|'); if (!await Dlg.confirmar({ titulo: 'Excluir ficha', texto: `Excluir a ficha de ${nome} (${cod})? A pessoa perde o acesso. O que ela criou continua no sistema.`, confirmar: 'Excluir', perigo: true })) return; try { await post('/admin/users/delete', { tipo: 'interno', codigo: cod }); toast('Ficha excluída'); recarrega(); } catch (e) { toast(e.message, 'warn'); } }; });
}

/* ---- Instagram ---- */
async function cfgInstagram(corpo) {
  const st = await api('/integrations/status'), ig = st.instagram;
  const fila = await api('/integrations/instagram/queue').catch(() => []);
  corpo.innerHTML = `<section class="card int-card"><div class="db-tit"><h2>Conexão com a Meta (Instagram)</h2>${cfgBadge(ig.conectado, '@' + (ig.usuario || 'conectado'))}</div>
    <form id="metaForm" class="admin-form"><label>App ID da Meta<input name="meta_app_id" value="${attr(ig.appId || '')}" autocomplete="off"></label><label>App Secret<input name="meta_app_secret" type="password" placeholder="${ig.configurado ? '•••••••• (já salvo; deixe vazio para manter)' : 'Cole o App Secret'}" autocomplete="off"></label><div class="actions"><button class="btn soft" type="submit">Salvar credenciais</button>${ig.configurado ? `<a class="btn" href="/api/integrations/meta/connect">${ig.conectado ? 'Reconectar' : 'Conectar com Facebook/Instagram'}</a>` : ''}${ig.conectado ? '<button type="button" class="btn danger-soft" id="metaDesc">Desconectar</button>' : ''}</div></form>
    ${cfgUri('URI de redirecionamento OAuth (cadastre na Meta):', st.redirectUris.meta)}
    ${ig.tokenInvalido ? '<p class="int-warn">⚠ O acesso à Meta expirou ou foi revogado. Clique em Reconectar.</p>' : ''}${ig.permissoesFaltando?.length ? `<p class="int-warn">⚠ Permissões não aceitas: ${esc(ig.permissoesFaltando.join(', '))}. Reconecte e deixe todas marcadas.</p>` : ''}
    ${ig.conectado ? `<p class="kpi-note">Página: ${esc(ig.pagina || '—')} · token válido até ${ig.expiraEm ? esc(fmtDate(ig.expiraEm)) : '—'} (renovado sozinho) · última sincronização: ${ig.ultimaSync ? esc(fmtDateTime(ig.ultimaSync)) : 'nunca'}</p>
    <h3>Perfis acompanhados</h3>${(ig.contas || []).map(c => `<label class="setting-row"><div><b>@${esc(c.usuario)}</b><small>${esc(c.pagina || '')}</small></div><input type="checkbox" data-mon="${attr(c.ig)}" ${(ig.monitoradas || []).includes(c.ig) ? 'checked' : ''} ${c.ig === ig.igUserId ? 'disabled title="Perfil principal"' : ''}></label>`).join('') || '<div class="empty compact">Nenhum perfil encontrado nas Páginas desta conexão.</div>'}
    <p id="igTentativa" class="kpi-note">${ig.ultimaTentativa ? `Última tentativa: ${esc(fmtDateTime(ig.ultimaTentativa))}` : ''}</p><div id="igSyncResultado" class="int-warn" role="status" aria-live="polite" ${ig.avisoSync ? '' : 'hidden'}>${esc(ig.avisoSync || '')}</div><div class="actions"><button type="button" class="btn" id="igSync">Sincronizar Instagram agora</button></div>` : ''}</section>
    <section class="card"><div class="db-tit"><h2>Fila de publicação automática</h2></div>${fila.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Publicação</th><th>Quando</th><th>Estado</th><th></th></tr></thead><tbody>${fila.map(c => `<tr><td class="titlecell">${esc(c.titulo)}<br><small>${esc(c.id)}</small></td><td>${esc(fmtDateTime(c.publicacaoEm))}</td><td>${esc(c.estado || (c.publicado ? 'Publicado' : 'Aguardando'))}${c.erro ? `<br><small class="bad">${esc(c.erro)}</small>` : ''}</td><td>${c.estado === 'ERRO' ? `<button class="btn soft" data-retry="${attr(c.id)}">Tentar de novo</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty compact">Nenhuma publicação agendada para sair sozinha.</div>'}</section>`;
  $('#metaForm').onsubmit = e => { e.preventDefault(); salvaCred('#metaForm'); };
  const d = $('#metaDesc'); if (d) d.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Desconectar a Meta', texto: 'O sistema deixa de ler o Instagram e os anúncios até reconectar. Nada é apagado na Meta.', confirmar: 'Desconectar', perigo: true })) return; try { await post('/integrations/meta/disconnect', {}); cfgIr(); } catch (er) { toast(er.message, 'warn'); } };
  $$('[data-mon]', corpo).forEach(cb => { cb.onchange = async () => { const ids = $$('[data-mon]', corpo).filter(x => x.checked).map(x => x.dataset.mon); try { await post('/integrations/meta/account', { monitorar: ids }); toast('Perfis acompanhados atualizados'); } catch (e) { toast(e.message, 'warn'); } }; });
  const s = $('#igSync'); if (s) s.onclick = async () => {
    if(s.disabled)return;
    const resultado=$('#igSyncResultado');s.disabled=true;s.textContent='Sincronizando Instagram…';resultado.hidden=false;resultado.textContent='Consultando os perfis acompanhados. Aguarde o resultado.';
    $('#igTentativa').textContent='Tentativa iniciada: '+fmtDateTime(new Date().toISOString());
    try {
      const r=await post('/integrations/instagram/sync',{});
      resultado.textContent=r.aviso ? 'Sincronização parcial: '+r.aviso : `Instagram sincronizado: ${r.periodos} período(s) atualizado(s).${r.ultimaSync?' Última sincronização completa: '+fmtDateTime(r.ultimaSync):''}`;
      resultado.setAttribute('role',r.aviso?'alert':'status');toast(r.aviso?'Sincronização parcial. Confira o resultado abaixo.':'Instagram sincronizado',r.aviso?'warn':'ok');
    } catch(e) {resultado.setAttribute('role','alert');resultado.textContent='A sincronização do Instagram falhou: '+mensagemErro(e);toast('Falha na sincronização. Confira a mensagem abaixo.','warn');}
    finally{s.disabled=false;s.textContent='Sincronizar Instagram agora';}
  };
  $$('[data-retry]', corpo).forEach(b => { b.onclick = async () => { try { await post('/integrations/instagram/retry', { id: b.dataset.retry }); toast('Nova tentativa na próxima rodada'); cfgIr(); } catch (e) { toast(e.message, 'warn'); } }; });
}

/* ---- Meta Ads ---- */
async function cfgMetaAds(corpo) {
  const st = await api('/integrations/status'), ad = st.ads || {};
  let contas = ad.contas || [];
  corpo.innerHTML = `<section class="card int-card"><div class="db-tit"><h2>Meta Ads (somente leitura)</h2>${cfgBadge(!!ad.conta, 'Conta ' + (ad.conta || ''), 'Sem conta escolhida')}</div>
    <p class="kpi-note">O sistema só lê gasto e resultados dos anúncios para Dashboard e Tráfego Pago. Criar, editar, ativar ou pausar anúncios continua no Gerenciador de Anúncios da Meta. A permissão necessária é <b>ads_read</b>.</p>
    ${!st.instagram.conectado ? '<p class="int-warn">Conecte a Meta em Configurações › Instagram primeiro.</p>' : ad.permitido === false ? '<p class="int-warn">⚠ A permissão ads_read não foi concedida. Reconecte a Meta e aceite todas as permissões.</p>' : ''}
    <div class="admin-form"><label>Conta de anúncios<select class="control" id="adConta"><option value="">${ad.conta ? 'Conta atual: ' + esc(ad.conta) : 'Escolha a conta'}</option>${contas.map(c => `<option value="${attr(c.id)}" ${c.id === ad.conta ? 'selected' : ''}>${esc(c.nome || c.id)}</option>`).join('')}</select></label>
    <div class="actions"><button class="btn soft" id="adLista">Buscar contas na Meta</button><button class="btn" id="adSalva">Usar esta conta</button><button class="btn soft" id="adSync">Sincronizar agora</button></div></div>
    <p class="kpi-note">Última sincronização: ${ad.ultimaSync ? esc(fmtDateTime(ad.ultimaSync)) : 'nunca'}</p></section>`;
  $('#adLista').onclick = async () => { try { const r = await api('/integrations/ads/accounts'); contas = r.contas || []; const sel = $('#adConta'); sel.innerHTML = '<option value="">Escolha a conta</option>' + contas.map(c => `<option value="${attr(c.id)}">${esc(c.nome || c.id)}</option>`).join(''); toast(`${contas.length} conta(s) encontrada(s)`); } catch (e) { toast(e.message, 'warn'); } };
  $('#adSalva').onclick = async () => { const v = $('#adConta').value; if (!v) return toast('Escolha a conta primeiro.', 'warn'); try { await post('/integrations/ads/account', { conta: v }); toast('Conta de anúncios definida'); cfgIr(); } catch (e) { toast(e.message, 'warn'); } };
  $('#adSync').onclick = async () => { try { await post('/integrations/ads/sync', {}); toast('Anúncios sincronizados'); cfgIr(); } catch (e) { toast(e.message, 'warn'); } };
}

/* ---- Google ---- */
async function cfgGoogle(corpo) {
  const st = await api('/integrations/status'), gg = st.google;
  corpo.innerHTML = `<section class="card int-card"><div class="db-tit"><h2>Google Agenda</h2>${cfgBadge(gg.conectado, gg.email || 'conectado')}</div>
    <form id="gForm" class="admin-form"><label>Client ID<input name="g_client_id" value="${attr(gg.clientId || '')}" autocomplete="off"></label><label>Client Secret<input name="g_client_secret" type="password" placeholder="${gg.configurado ? '•••••••• (já salvo; deixe vazio para manter)' : 'Cole o Client Secret'}" autocomplete="off"></label><div class="actions"><button class="btn soft" type="submit">Salvar credenciais</button>${gg.configurado ? `<a class="btn" href="/api/integrations/google/connect">${gg.conectado ? 'Reconectar' : 'Conectar com Google'}</a>` : ''}${gg.conectado ? '<button type="button" class="btn danger-soft" id="gDisc">Desconectar</button>' : ''}</div></form>
    ${cfgUri('URI de redirecionamento autorizado (cadastre no Google Cloud):', st.redirectUris.google)}
    <p class="kpi-note">As agendas que aparecem no Calendário Geral são cadastradas em <b>Agendas Google</b>, logo abaixo.</p></section>`;
  $('#gForm').onsubmit = e => { e.preventDefault(); salvaCred('#gForm'); };
  const d = $('#gDisc'); if (d) d.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Desconectar o Google', texto: 'A sincronização da Agenda para. Nada é apagado no Google.', confirmar: 'Desconectar', perigo: true })) return; try { await post('/integrations/google/disconnect', {}); cfgIr(); } catch (er) { toast(er.message, 'warn'); } };
}

/* ---- IA ---- */
async function cfgIA(corpo) {
  const ia = await api('/ia/estado');
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>IA para legendas</h2>${cfgBadge(ia.ativa, 'Ligada', 'Desligada')}</div>
    <p class="kpi-note">A IA só escreve <b>rascunhos</b> de variações de legenda dentro de uma publicação. Nada é salvo nem publicado sozinho. Fica desligada até você colar uma chave. A chave é guardada criptografada no servidor e não volta para a tela.</p>
    <form id="iaForm" class="admin-form"><label>Chave da API (Anthropic)<input name="anthropic_key" type="password" autocomplete="off" placeholder="${ia.ativa ? '•••••••• (já salva; deixe vazio para manter)' : 'Cole a chave'}"></label><label>Guia de voz do Colégio (opcional)<textarea class="control" name="ia_guia_voz" rows="5" maxlength="1500" placeholder="Ex.: tom acolhedor, trate as famílias por “vocês”, evite gírias.">${esc(ia.guiaVoz || '')}</textarea></label><div class="actions"><button class="btn" type="submit">Salvar</button>${ia.ativa ? '<button type="button" class="btn danger-soft" id="iaOff">Remover a chave e desligar</button>' : ''}</div></form></section>`;
  $('#iaForm').onsubmit = e => { e.preventDefault(); salvaCred('#iaForm'); };
  const off = $('#iaOff'); if (off) off.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Desligar a IA', texto: 'A chave é apagada do servidor. As publicações não mudam.', confirmar: 'Desligar', perigo: true })) return; try { await post('/integrations/settings', { ia_remover_chave: true }); toast('IA desligada'); cfgIr(); } catch (er) { toast(er.message, 'warn'); } };
}

/* ---- Backup e restauração ---- */
async function cfgBackup(corpo) {
  const [lista, log, mig, orf] = await Promise.all([api('/backup/list'), api('/backup/log'), api('/admin/migracao').catch(() => null), api('/admin/arquivos-sem-vinculo').catch(() => null)]);
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Backup e restauração</h2><div><button class="btn soft" id="bkNovo">Backup dos dados</button> <button class="btn" id="bkCompleto">Backup completo (com anexos)</button></div></div>
    <p class="kpi-note">O backup automático diário guarda os dados. O completo inclui também os anexos das publicações. Antes de restaurar, o sistema valida o arquivo e guarda um backup de segurança.</p>
    ${lista.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Arquivo</th><th></th></tr></thead><tbody>${lista.slice(0, 40).map(n => `<tr><td><code>${esc(n)}</code></td><td class="acoes-cel"><a class="btn soft" href="/api/backup/download?file=${encodeURIComponent(n)}">Baixar</a><button class="btn soft" data-val="${attr(n)}">Validar e restaurar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty compact">Nenhum backup ainda.</div>'}</section>
    <section class="card"><div class="db-tit"><h2>Migração para as cinco áreas</h2></div>${mig?.relatorio ? cfgRelatorioMigracao(mig.relatorio, mig.criadoEm) : '<div class="empty compact">Esta instalação não passou pela migração (instalação nova).</div>'}</section>
    <section class="card"><div class="db-tit"><h2>Arquivos sem vínculo</h2></div><p class="kpi-note">Arquivos guardados que nenhuma publicação usa. Nada é apagado sozinho: você escolhe, e um backup completo é feito antes.</p>${orf && orf.total ? `<p>${orf.total} arquivo(s), ${(orf.bytes / 1048576).toFixed(1)} MB</p><div class="tablewrap"><table class="datatable"><tbody>${orf.rows.map(r => `<tr><td><label><input type="checkbox" data-orf="${attr(r.caminho)}"> <code>${esc(r.caminho)}</code></label></td><td class="num">${(r.tamanho / 1024).toFixed(0)} KB</td></tr>`).join('')}</tbody></table></div><div class="actions"><button class="btn danger-soft" id="orfDel">Excluir os selecionados</button></div>` : '<div class="empty compact">Nenhum arquivo sem vínculo.</div>'}</section>
    <section class="card"><div class="db-tit"><h2>Histórico de backups</h2></div>${log.length ? `<div class="tablewrap"><table class="datatable"><tbody>${log.slice(0, 15).map(l => `<tr><td>${esc(fmtDateTime(l.quando))}</td><td>${esc(l.acao)}</td><td>${esc(l.status)}</td><td>${esc(l.detalhe || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty compact">Sem registros.</div>'}</section>`;
  const novo = async completo => { try { const r = await post('/backup', { completo }); toast('Backup criado: ' + r.file); cfgIr(); } catch (e) { toast(e.message, 'warn'); } };
  $('#bkNovo').onclick = () => novo(false); $('#bkCompleto').onclick = () => novo(true);
  $$('[data-val]', corpo).forEach(b => { b.onclick = async () => {
    try {
      const v = await api(`/backup/validate?file=${encodeURIComponent(b.dataset.val)}`);
      const o = dialogo(`<h3>Restaurar backup</h3><p><code>${esc(b.dataset.val)}</code></p>${v.carometro ? `<p><b>Carômetro:</b> ${v.carometro.alunos} aluno(s), ${v.carometro.fotos} foto(s), ${v.carometro.arquivosIncluidos}/${v.carometro.arquivosReferenciados} arquivo(s) incluídos.</p>` : ''}${v.ok ? '<p class="ok-txt">O arquivo é válido.</p>' : `<p class="bad">Arquivo inválido: ${esc((v.erros || []).join('; '))}</p>`}${(v.avisos || []).map(a => `<p class="kpi-note">${esc(a)}</p>`).join('')}<p class="kpi-note">Restaurar substitui os dados atuais pelos do arquivo. Antes, o sistema guarda um backup de segurança.</p><div class="actions"><span class="cm-esp"></span><button class="btn soft" data-close>Cancelar</button><button class="btn danger" id="bkOk" ${v.ok ? '' : 'disabled'}>Restaurar</button></div>`);
      $('#bkOk', o.el).onclick = async () => { $('#bkOk', o.el).disabled = true; try { const r = await post('/backup/restore', { file: b.dataset.val }); o.close(); await Dlg.aviso({ titulo: 'Backup restaurado', texto: `Pronto. Backup de segurança: ${r.seguranca}.` }); location.reload(); } catch (e) { toast(e.message, 'warn'); $('#bkOk', o.el).disabled = false; } };
    } catch (e) { toast(e.message, 'warn'); }
  }; });
  const od = $('#orfDel'); if (od) od.onclick = async () => { const sel = $$('[data-orf]').filter(x => x.checked).map(x => x.dataset.orf); if (!sel.length) return toast('Escolha ao menos um arquivo.', 'warn'); if (!await Dlg.confirmar({ titulo: 'Excluir arquivos', texto: `Excluir ${sel.length} arquivo(s) sem vínculo? Um backup completo é feito antes.`, confirmar: 'Excluir', perigo: true })) return; try { const r = await post('/admin/arquivos-sem-vinculo/excluir', { caminhos: sel, confirmar: true }); toast(`${r.excluidos} arquivo(s) excluído(s)`); cfgIr(); } catch (e) { toast(e.message, 'warn'); } };
}
function cfgRelatorioMigracao(r, quando) {
  const rem = Object.entries(r.removidos || {}).filter(([, n]) => n);
  return `<p class="kpi-note">Executada em ${esc(fmtDateTime(quando))}, a partir da v${esc(r.versaoAnterior)}. Backup antes de mexer: <code>${esc(r.backup)}</code>. Cópia dos dados removidos (só consulta): <code>${esc(r.copiaDosDadosRemovidos)}</code>.</p>
    <div class="kpis kpis4"><div class="kpi"><small>Publicações mantidas</small><strong>${fmtN(r.mantidos?.publicacoes)}</strong></div><div class="kpi"><small>Materiais migrados para as publicações</small><strong>${fmtN(r.materiaisMigrados)}</strong></div><div class="kpi"><small>Arquivos sem vínculo</small><strong>${fmtN(r.arquivosSemVinculo?.total)}</strong></div><div class="kpi"><small>Tipos de registro removidos</small><strong>${rem.length}</strong></div></div>
    ${rem.length ? `<details><summary>O que foi removido</summary><ul>${rem.map(([k, n]) => `<li>${esc(k)}: ${fmtN(n)}</li>`).join('')}</ul></details>` : ''}`;
}

/* ---- Auditoria ---- */
async function cfgAuditoria(corpo) {
  const [log, integ] = await Promise.all([api('/admin/audit?limit=150'), api('/admin/integridade').catch(() => null)]);
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Integridade dos dados</h2>${integ ? cfgBadge(integ.ok, 'Sem problemas', integ.achados.length + ' achado(s)') : ''}</div>${integ ? (integ.ok ? '<p class="kpi-note">Vínculos, materiais e contadores conferidos: nada a corrigir.</p>' : `<ul class="falta-lista">${integ.achados.slice(0, 30).map(a => `<li><b>${esc(a.modulo)} ${esc(a.registro)}</b> — ${esc(a.tipo)}: ${esc(a.detalhe)}</li>`).join('')}</ul>`) : '<div class="empty compact">Não foi possível verificar.</div>'}</section>
    <section class="card"><div class="db-tit"><h2>Auditoria</h2><small>150 ações mais recentes</small></div><div class="tablewrap"><table class="datatable"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Registro</th></tr></thead><tbody>${log.map(l => `<tr><td>${esc(fmtDateTime(l.quando))}</td><td>${esc(l.ator)}</td><td>${esc(l.acao)}</td><td>${esc([l.modulo, l.registro].filter(Boolean).join(' '))}</td></tr>`).join('')}</tbody></table></div></section>`;
}

/* ---- Prontidão ---- */
async function cfgProntidao(corpo) {
  const pr0 = await api('/integrations/prontidao'), r = pr0.resumo || {};
  const pr = { ...pr0, itens: pr0.itens.filter(i => i.id !== 'smtp') }; pr.pronto = !pr.itens.some(i => !i.ok && i.nivel === 'erro'); // e-mail (SMTP) não é mais configurado aqui
  const lin = (rot, v) => `<div class="setting-row"><div><b>${rot}</b></div><span class="pr-val">${esc(typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${{ instagram: 'Instagram', anuncios: 'Anúncios', google: 'Google' }[k] || k}: ${x ? fmtDateTime(x) : 'nunca'}`).join(' · ') : v || '—')}</span></div>`;
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Prontidão do sistema</h2>${cfgBadge(pr.pronto, 'Pronto', 'Falta configurar')}</div>
    ${lin('Conexão com a Meta', r.conexaoMeta)}${lin('Conexão com o Google', r.conexaoGoogle)}${lin('Última sincronização', r.ultimaSincronizacao || {})}${lin('Próxima sincronização', r.proximaSincronizacao)}${lin('Última falha', r.ultimaFalha)}${lin('Validade do token da Meta', r.validadeToken ? (/^\d{4}-/.test(r.validadeToken) ? fmtDateTime(r.validadeToken) : r.validadeToken) : '—')}${lin('Versão da API da Meta', r.versaoApi)}${lin('Último backup', r.ultimoBackup)}${lin('Integridade do banco', r.integridade)}${lin('Versão instalada', r.versaoInstalada)}${lin('Ambiente', r.ambiente)}</section>
    <section class="card"><div class="db-tit"><h2>Lista de conferência</h2><small>${pr.itens.filter(i => i.ok).length}/${pr.itens.length} itens ok</small></div><ul class="pr-lista">${pr.itens.map(i => `<li class="${i.ok ? 'ok' : i.nivel}"><span aria-hidden="true">${i.ok ? '✓' : i.nivel === 'erro' ? '✕' : '!'}</span><div><b>${esc(i.titulo)}</b>${i.ok ? '' : `<small>${esc(i.como)}</small>`}</div></li>`).join('')}</ul>
      ${internalSession?.admin ? `<div class="int-links">${cfgUri('Política de privacidade (cole na Meta e no Google):', pr.urls.privacidade)}${cfgUri('Termos de uso:', pr.urls.termos)}${cfgUri('Cron de sincronização (de hora em hora ou diário):', pr.cron)}${cfgUri('Cron de publicação no Instagram (a cada 10 minutos):', pr.cronPublicar)}</div>` : ''}</section>`;
}

/* ---- Agendas Google (Calendário Geral escolar) ---- */
async function cfgAgendas(corpo) {
  const d = await api('/agendas');
  const nomeG = k => (d.grupos.find(g => g.k === k) || { nome: k }).nome;
  const linhas = d.agendas.map(a => `<tr><td><div class="ag-nome"><i style="background:${a.cor}"></i><div><b>${esc(a.nome)}</b><small>${esc(a.id)}</small></div></div></td>
    <td><select class="control" data-ag-grupo="${attr(a.id)}" aria-label="Segmento">${d.grupos.map(g => `<option value="${g.k}" ${g.k === a.grupo ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}</select></td>
    <td><i class="ag-cor" style="background:${a.cor}" title="Cor fixa do segmento"></i></td>
    <td><span class="ag-perm ${a.permissao}">${a.permissao === 'edicao' ? 'Leitura e edição' : 'Somente leitura'}</span><small class="kpi-note">Google: ${esc(a.papel || '—')}</small></td>
    <td><label class="check-row"><input type="checkbox" data-ag-edit="${attr(a.id)}" ${a.editavel ? 'checked' : ''} ${['owner', 'writer'].includes(a.papel) ? '' : 'disabled title="A conta conectada só lê esta agenda no Google"'}> Editar no EVO MKT</label><label class="check-row"><input type="checkbox" data-ag-ativa="${attr(a.id)}" ${a.ativa ? 'checked' : ''}> Mostrar no calendário</label></td>
    <td><span class="ag-st ${a.status === 'SINCRONIZADA' ? 'ok' : 'bad'}">${a.status === 'SINCRONIZADA' ? '● Sincronizada' : a.status === 'SEM_ACESSO' ? '● Sem acesso' : a.status === 'ERRO' ? '● Erro' : '● Nova'}</span>${a.erro ? `<small class="kpi-note">${esc(a.erro)}</small>` : ''}</td>
    <td>${a.ultimaSync ? esc(fmtDateTime(a.ultimaSync)) : '—'}</td><td><button type="button" class="btn soft" data-ag-rm="${attr(a.id)}" aria-label="Remover o cadastro de ${attr(a.nome)}">Remover</button></td></tr>`).join('');
  corpo.innerHTML = `<section class="card"><div class="ag-cab"><div><h2>Agendas Google</h2><p class="kpi-note">Conecte e gerencie as agendas compartilhadas do Google Agenda para exibir os eventos no Calendário Geral.</p></div>
    <div class="ag-cab"><div class="kpi-note">${d.conectado ? `<b>Conta conectada</b><br>${esc(d.conta || '')}<br>Última sincronização: ${d.ultimaSync ? esc(fmtDateTime(d.ultimaSync)) : '—'}` : '<b>Google não conectado.</b><br>Conecte em Configurações › Google.'}</div><button type="button" class="btn soft" id="agVer" ${d.conectado ? '' : 'disabled'}>Verificar agendas</button><button type="button" class="btn" id="agAdd" ${d.conectado ? '' : 'disabled'}>+ Adicionar agenda</button></div></div>
    <p class="foco-chip">As agendas aparecem no Calendário Geral conforme as permissões da conta Google. No EVO MKT, <b>só a agenda do Marketing</b> aceita criar, editar e excluir eventos; as demais ficam somente para consulta.</p>
    ${d.agendas.length ? `<div class="tablewrap"><table class="datatable ag-tab"><thead><tr><th>Agenda</th><th>Segmento / área</th><th>Cor</th><th>Permissão</th><th>Regras</th><th>Status</th><th>Última sincronização</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>` : '<div class="empty compact">Nenhuma agenda cadastrada ainda. Use “Adicionar agenda”.</div>'}
    <div class="ag-info"><section class="ok"><b>Como funciona</b><ul><li>Os eventos das agendas cadastradas aparecem no Calendário Geral.</li><li>Criar e editar eventos: apenas na agenda marcada “Editar no EVO MKT” (Marketing) e se a conta Google tiver escrita nela.</li><li>As cores são fixas e definidas pelo segmento.</li></ul></section><section><b>Importante</b><ul><li>Para ver uma agenda, ela precisa estar compartilhada com a conta Google conectada.</li><li>Remover o cadastro não exclui nenhum evento no Google Agenda.</li><li>Se a sincronização falhar, o aviso aparece e o Calendário não finge que está tudo certo.</li></ul></section></div></section>`;
  const recarrega = () => cfgAgendas(corpo);
  $$('[data-ag-grupo]', corpo).forEach(s => { s.onchange = async () => { try { await post('/agendas/atualizar', { id: s.dataset.agGrupo, grupo: s.value }); toast('Segmento salvo'); recarrega(); } catch (e) { toast(e.message, 'warn'); recarrega(); } }; });
  $$('[data-ag-edit]', corpo).forEach(c => { c.onchange = async () => { try { await post('/agendas/atualizar', { id: c.dataset.agEdit, editavel: c.checked }); toast(c.checked ? 'Edição liberada nesta agenda' : 'Agenda agora somente leitura'); recarrega(); } catch (e) { toast(e.message, 'warn'); recarrega(); } }; });
  $$('[data-ag-ativa]', corpo).forEach(c => { c.onchange = async () => { try { await post('/agendas/atualizar', { id: c.dataset.agAtiva, ativa: c.checked }); toast('Salvo'); recarrega(); } catch (e) { toast(e.message, 'warn'); recarrega(); } }; });
  $$('[data-ag-rm]', corpo).forEach(b => { b.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Remover o cadastro da agenda', texto: 'Os eventos desta agenda deixam de aparecer no Calendário Geral. Nenhum evento é excluído no Google Agenda.', confirmar: 'Remover', perigo: true })) return; try { await post('/agendas/remover', { id: b.dataset.agRm }); toast('Agenda removida do cadastro'); recarrega(); } catch (e) { toast(e.message, 'warn'); } }; });
  const ver = $('#agVer', corpo); if (ver) ver.onclick = async () => { ver.disabled = true; ver.textContent = 'Verificando…'; try { await post('/agendas/verificar', {}); toast('Agendas verificadas'); } catch (e) { toast(e.message, 'warn'); } recarrega(); };
  const add = $('#agAdd', corpo); if (add) add.onclick = async () => {
    let lista = []; try { lista = (await api('/agendas/descobrir')).rows.filter(x => !x.cadastrada); } catch (e) { toast(e.message, 'warn'); }
    const o = dialogo(`<div class="cg-conf" style="min-width:min(92vw,520px)"><h3>Adicionar agenda Google</h3><p class="kpi-note">Escolha uma agenda da conta conectada ou digite o ID de uma agenda compartilhada com ela.</p>
      <label>Agendas da conta conectada<select class="control" id="agSel"><option value="">Escolher…</option>${lista.map(x => `<option value="${attr(x.id)}">${esc(x.nome)} (${esc(x.papel === 'owner' || x.papel === 'writer' ? 'leitura e edição' : 'somente leitura')})</option>`).join('')}</select></label>
      <label>ou ID da agenda<input class="control" id="agId" placeholder="id-da-agenda@group.calendar.google.com" autocomplete="off"></label>
      <p class="kpi-note">Registrar uma agenda não dá permissão de escrita: quem decide é o Google (a conta conectada) e a regra do EVO MKT (só o Marketing edita).</p>
      <div class="cg-erro" id="agErro" role="alert" hidden></div><div class="cg-acoes"><button type="button" class="btn soft" data-close>Cancelar</button><button type="button" class="btn" id="agOk">Cadastrar agenda</button></div></div>`);
    $('#agSel', o.el).onchange = e => { if (e.target.value) $('#agId', o.el).value = e.target.value; };
    $('#agOk', o.el).onclick = async ev => { const b = ev.currentTarget, id = $('#agId', o.el).value.trim(); b.disabled = true; try { await post('/agendas/adicionar', { id }); o.close(); toast('Agenda cadastrada'); recarrega(); } catch (e) { const x = $('#agErro', o.el); x.textContent = e.message; x.hidden = false; b.disabled = false; } };
  };
}


/* ================= nova navegação: hub de cinco áreas ================= */
/** Reaproveita uma tela antiga que desenha vários cartões, mantendo só os cartões pedidos (os eventos já foram ligados dentro dela). */
async function cfgPartes(corpo, fn, indices) { await fn(corpo); [...corpo.querySelectorAll(':scope > section.card')].forEach((c, i) => { if (!indices.includes(i)) c.remove(); }); }
const cfgVoltar = (rot, alvo) => `<button type="button" class="btn soft cfg-voltar" data-cfg-sec="${alvo}">‹ ${esc(rot)}</button>`;

PAGINAS.configuracoes = async function () {
  const q = new URLSearchParams(location.search), retorno = q.get('int');
  if (!CFG.interno && !retorno) { CFG.sec = ''; CFG.aba = ''; CFG.sub = ''; }
  CFG.interno = false;
  if (retorno) { CFG.sec = 'integracoes'; CFG.sub = /^(g|google)/i.test(retorno) ? 'google' : 'meta'; }
  const vis = cfgAreasVisiveis(), area = vis.find(a => a.k === CFG.sec);
  if (!area) { CFG.sec = ''; CFG.aba = ''; CFG.sub = ''; }
  if (area && !CFG.aba && area.abas.length) CFG.aba = cfgAbasDe(area)[0][0];
  if (area && area.abas.length && !cfgAbasDe(area).some(x => x[0] === CFG.aba)) CFG.aba = cfgAbasDe(area)[0][0];
  if (!CFG.sec) {
    $('#content').innerHTML = `<div class="cfg2"><div class="cfg-cartoes">${vis.map(a => `<article class="card cfg-cartao"><span class="cfg-ico" aria-hidden="true">${a.ic}</span><div><h2>${esc(a.t)}</h2><p>${esc(a.d)}</p></div><button type="button" class="btn soft" data-cfg-sec="${a.k}">Acessar →</button></article>`).join('')}</div></div>`;
  } else {
    const abas = cfgAbasDe(area);
    const trilha = `<nav class="cfg-mig" aria-label="Caminho"><button type="button" data-cfg-sec="">Configurações</button> › ${CFG.sub ? `<button type="button" data-cfg-sec="${area.k}" data-cfg-sub="">${esc(area.t)}</button> › <span>${esc({ google: 'Google Agenda', meta: 'Meta (Instagram e Tráfego Pago)', drive: 'Google Drive' }[CFG.sub] || '')}</span>` : `<span>${esc(area.t)}</span>`}</nav>`;
    $('#content').innerHTML = `<div class="cfg2">${trilha}${abas.length > 1 ? `<div class="cfg-tabs" role="tablist" aria-label="Seções de ${attr(area.t)}">${abas.map(([k, l]) => `<button type="button" role="tab" data-cfg-aba="${k}" aria-selected="${CFG.aba === k}" class="${CFG.aba === k ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>` : ''}<div class="cfg-body" id="cfgCorpo"><div class="loading"><span></span><b>Carregando…</b></div></div></div>`;
  }
  $$('[data-cfg-sec]').forEach(b => { b.onclick = () => { CFG.sec = b.dataset.cfgSec; CFG.aba = ''; CFG.sub = ''; cfgIr(); }; });
  $$('[data-cfg-aba]').forEach(b => { b.onclick = () => { CFG.aba = b.dataset.cfgAba; cfgIr(); }; });
  if (!CFG.sec) return;
  const corpo = $('#cfgCorpo');
  const mapa = {
    'geral/escola': cfgEscola, 'geral/aparencia': cfgAparencia, 'geral/preferencias': cfgPreferencias, 'geral/segmentos': cfgSegmentos,
    'usuarios/usuarios': cfgAcessos, 'usuarios/perfis': cfgPerfisAcesso, 'usuarios/permissoes': cfgPermissoes,
    'integracoes/': cfgIntegracoes, 'seguranca/autenticacao': cfgAutenticacao, 'seguranca/backups': cfgBackup, 'seguranca/logs': cfgLogs,
    'dados/informacoes': cfgInformacoes, 'dados/diagnostico': cfgDiagnostico, 'dados/manutencao': cfgManutencao,
  };
  try { await (mapa[`${CFG.sec}/${CFG.sec === 'integracoes' ? '' : CFG.aba}`] || cfgEscola)(corpo); }
  catch (e) { corpo.innerHTML = `<div class="error-state"><h2>Não foi possível carregar</h2><p>${esc(e.message)}</p></div>`; }
  $$('[data-copiar]', corpo).forEach(b => { b.onclick = () => copiar(b.dataset.copiar, 'Copiado'); });
  if (retorno) { const msg = new URLSearchParams(location.search).get('msg'); toast(/_ok$/.test(retorno) ? 'Conexão concluída' : `Conexão não concluída${msg ? ': ' + msg : ''}`, /_ok$/.test(retorno) ? 'ok' : 'warn'); history.replaceState(null, '', '?page=configuracoes'); }
};

/* ---- Geral ---- */
async function cfgEscola(corpo) {
  corpo.innerHTML = '<section class="card"><div class="db-tit"><h2>Colégio Evolução</h2></div><p class="kpi-note">Cadastre abaixo os dados institucionais usados como referência pela equipe (CNPJ, telefone, e-mail institucional, endereço, missão, visão e valores). Nada aparece aqui sem ter sido cadastrado.</p></section><div id="cfgInst"></div>';
  await cfgPartes($('#cfgInst'), cfgGeral, [2]);
}
async function cfgAparencia(corpo) {
  const cores = [['Azul institucional', '#063996'], ['Laranja', '#FF7800'], ['Azul escuro', '#00275F'], ['Azul claro', '#00A1F3'], ['Amarelo', '#FAB900'], ['Roxo', '#793A8C'], ['Branco', '#FFFFFF']];
  const info = cfgAdm() ? await api('/admin/logo').catch(() => null) : null;
  const regras = info?.regras || { maxBytes: 1000000, larguraMin: 300, larguraMax: 4000, alturaMin: 60, alturaMax: 2000, proporcaoMin: 1.5, proporcaoMax: 8 };
  corpo.innerHTML = `<div class="cfg-duas"><section class="card"><div class="db-tit"><h2>Logo e identidade visual</h2>${info ? cfgBadge(info.personalizada, 'Logo enviada', 'Logo original') : ''}</div>
    <div class="cfg-logo"><img id="logoAtual" src="/api/public/logo?v=${Date.now()}" alt="Logo do Colégio Evolução"></div>
    <p class="kpi-note">Usada na tela de entrada, nos relatórios em PDF, na impressão e nas páginas públicas. ${info?.personalizada ? `Enviada em ${esc(fmtDateTime(info.atualizadoEm))} · ${info.largura}×${info.altura} px · ${cfgBytes(info.bytes)}.` : 'Hoje é a logo original do sistema.'} O menu lateral continua com a versão branca do símbolo.</p>
    ${info ? `<p class="kpi-note">Formato PNG ou JPEG, até ${cfgBytes(regras.maxBytes)}, largura de ${regras.larguraMin} a ${regras.larguraMax} px, altura de ${regras.alturaMin} a ${regras.alturaMax} px, horizontal (largura de 1,5 a 8 vezes a altura). Recomendado: PNG com fundo transparente.</p>
    <div class="cfg-logo-acoes"><label class="btn soft" for="logoArq">Escolher nova logo…</label><input type="file" id="logoArq" accept="image/png,image/jpeg" hidden>${info.personalizada ? '<button type="button" class="btn soft" id="logoOrig">Voltar à logo original</button>' : ''}</div>
    <div id="logoPrevia"></div>` : '<p class="kpi-note">Somente o Administrador troca a logo.</p>'}</section>
    <section class="card"><div class="db-tit"><h2>Cores do sistema</h2></div><p class="kpi-note">Paleta institucional fixa: as cores não são editáveis.</p><ul class="cfg-cores">${cores.map(([n, h]) => `<li><i style="background:${h}"></i><span>${n}</span><code>${h}</code></li>`).join('')}</ul></section></div>`;
  if (!info) return;
  const lerArquivo = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(f); });
  const dimensoes = url => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.onerror = () => no(new Error('O arquivo não é uma imagem válida.')); im.src = url; });
  $('#logoArq').onchange = async e => {
    const f = e.target.files[0], box = $('#logoPrevia'); if (!f) return;
    box.innerHTML = '';
    const erro = m => { box.innerHTML = `<div class="foco-chip" role="alert">${esc(m)}</div>`; e.target.value = ''; };
    if (!/^image\/(png|jpeg)$/.test(f.type)) return erro('Formato não aceito. Envie a logo em PNG ou JPEG.');
    if (f.size > regras.maxBytes) return erro(`A logo tem ${cfgBytes(f.size)}; o máximo é ${cfgBytes(regras.maxBytes)}.`);
    let url, w, h;
    try { url = await lerArquivo(f); [w, h] = await dimensoes(url); } catch (er) { return erro(er.message); }
    if (w < regras.larguraMin || w > regras.larguraMax || h < regras.alturaMin || h > regras.alturaMax) return erro(`Dimensões ${w}×${h} px fora do aceito (largura ${regras.larguraMin}–${regras.larguraMax} px, altura ${regras.alturaMin}–${regras.alturaMax} px).`);
    const p = w / h; if (p < regras.proporcaoMin || p > regras.proporcaoMax) return erro('A logo deve ser horizontal (largura entre 1,5 e 8 vezes a altura), como a logo atual.');
    box.innerHTML = `<div class="cfg-logo-nova"><div><small>Nova logo (${w}×${h} px · ${cfgBytes(f.size)})</small><div class="cfg-logo"><img src="${attr(url)}" alt="Prévia da nova logo"></div></div><button type="button" class="btn" id="logoUsar">Usar esta logo</button></div>`;
    $('#logoUsar').onclick = async () => {
      if (!await Dlg.confirmar({ titulo: 'Substituir a logo', texto: 'A logo atual será substituída na tela de entrada, nos relatórios e na impressão. A anterior fica guardada e você pode voltar à original quando quiser.', confirmar: 'Substituir a logo' })) return;
      try { await post('/admin/logo', { dados: url, confirmar: true }); toast('Logo atualizada'); cfgIr(); } catch (er) { toast(er.message, 'warn'); }
    };
  };
  const orig = $('#logoOrig'); if (orig) orig.onclick = async () => {
    if (!await Dlg.confirmar({ titulo: 'Voltar à logo original', texto: 'A logo enviada deixa de ser usada e a logo original do sistema volta. A enviada fica guardada.', confirmar: 'Voltar à original' })) return;
    try { await post('/admin/logo/restaurar', { confirmar: true }); toast('Logo original restaurada'); cfgIr(); } catch (er) { toast(er.message, 'warn'); }
  };
}
async function cfgPreferencias(corpo) {
  corpo.innerHTML = '<div id="cfgP"></div><div id="cfgIAbox"></div>';
  await cfgPartes($('#cfgP'), cfgGeral, [0, 1]);
  if (cfgAdm()) await cfgIA($('#cfgIAbox'));
}
async function cfgSegmentos(corpo) {
  const segs = SEG_LISTA.filter(x => x[0] && x[0] !== 'TODOS');
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Segmentos escolares</h2></div><p class="kpi-note">Catálogo único usado em filtros, calendário, conteúdos e Tráfego. Alterar a taxonomia exige migração não destrutiva e testes, por isso a lista é somente leitura aqui; os cadastros e vínculos existentes são preservados.</p>
    <ul class="cfg-segs">${segs.map(([k, n]) => `<li><b>${esc(n)}</b><code>${esc(k)}</code></li>`).join('')}</ul></section>
    <section class="card"><div class="db-tit"><h2>Cores do Calendário Geral</h2></div><p class="kpi-note">Cada evento das agendas do Google usa a cor fixa do segmento (evento com mais de um segmento usa a cor institucional).</p><ul class="cfg-cores">${(typeof CG_GRUPOS !== 'undefined' ? CG_GRUPOS : []).map(([k, n, h]) => `<li><i style="background:${h}"></i><span>${esc(n)}</span><code>${h}</code></li>`).join('')}</ul></section><div id="cfgPerf"></div>`;
  await cfgPerfis($('#cfgPerf'));
}

/* ---- Usuários e Permissões ---- */
async function cfgPerfisAcesso(corpo) {
  const users = await api('/admin/users'), adm = users.filter(u => u.nivel === 'admin' && u.ativo).length, eq = users.filter(u => u.nivel !== 'admin' && u.ativo).length;
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Perfis de acesso</h2></div><div class="tablewrap"><table class="datatable"><thead><tr><th>Perfil</th><th>O que pode</th><th class="num">Usuários ativos</th></tr></thead><tbody>
    <tr><td><b>Administrador</b></td><td>Tudo da equipe, mais usuários e perfis, integrações, agendas do Google, backups e restauração, logs e dados do sistema.</td><td class="num">${adm}</td></tr>
    <tr><td><b>Equipe de Marketing</b></td><td>Consulta Dashboard, Calendário, Instagram e Tráfego Pago; cria e edita publicações e eventos da agenda do Marketing; gera relatórios.</td><td class="num">${eq}</td></tr></tbody></table></div>
    <p class="kpi-note">O sistema nunca deixa o último Administrador ativo ser rebaixado ou desativado. Mudanças de perfil ficam registradas nos logs. O acesso é por perfil: não há permissão separada por segmento.</p></section>`;
}
async function cfgPermissoes(corpo) {
  const sim = '<span class="badge ok">Sim</span>', nao = '<span class="badge mute">Não</span>';
  const L = [['Consultar Dashboard, Calendário, Instagram e Tráfego Pago', 1, 1], ['Criar e editar publicações e ideias', 1, 1], ['Criar, editar e excluir eventos na agenda do Marketing (Google)', 1, 1], ['Gerar relatórios do Tráfego Pago e do Instagram', 1, 1], ['Cadastrar e ajustar agendas do Google', 0, 1], ['Gerenciar usuários e perfis', 0, 1], ['Conectar ou desconectar Google e Meta', 0, 1], ['Fazer, baixar e restaurar backups', 0, 1], ['Ver logs de acesso e alterações', 0, 1], ['Ver dados do sistema e integridade', 0, 1]];
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Permissões por perfil</h2></div><div class="tablewrap"><table class="datatable"><thead><tr><th>Ação</th><th>Equipe de Marketing</th><th>Administrador</th></tr></thead><tbody>${L.map(([a, e, ad]) => `<tr><td>${esc(a)}</td><td>${e ? sim : nao}</td><td>${ad ? sim : nao}</td></tr>`).join('')}</tbody></table></div><p class="kpi-note">Estas regras são conferidas no servidor em cada rota; esconder um botão não é a proteção. Nas agendas do Google, só a agenda do Marketing aceita alterações; as demais são somente leitura.</p></section>`;
}

/* ---- Integrações: três cartões ---- */
async function cfgIntegracoes(corpo) {
  if (CFG.sub) {
    const volta = `<div class="cfg-linha">${cfgVoltar('Integrações', 'integracoes')}</div>`;
    corpo.innerHTML = volta + '<div id="cfgSubA"></div><div id="cfgSubB"></div>';
    if (CFG.sub === 'google') { await cfgGoogle($('#cfgSubA')); await cfgAgendas($('#cfgSubB')); }
    else if (CFG.sub === 'meta') { await cfgInstagram($('#cfgSubA')); await cfgMetaAds($('#cfgSubB')); }
    else $('#cfgSubA').innerHTML = cfgDriveHtml();
    $$('[data-cfg-sec]', corpo).forEach(b => { b.onclick = () => { CFG.sub = ''; cfgIr(); }; });
    return;
  }
  const [st, pr] = await Promise.all([api('/integrations/status'), api('/integrations/prontidao').catch(() => null)]);
  const sync = (pr && pr.resumo && pr.resumo.ultimaSincronizacao) || {};
  const g = st.google, ig = st.instagram, ads = st.ads;
  const estado = (on, invalido, configurado) => on ? ['ok', 'Conectado'] : invalido ? ['warn', 'Reconectar'] : configurado ? ['mute', 'Desconectado'] : ['mute', 'Pendente de configuração'];
  const eg = estado(g.conectado, false, g.configurado), em = estado(ig.conectado && !ig.tokenInvalido, ig.tokenInvalido, ig.configurado);
  const card = (k, nome, logo, txt, [cl, rot], conta, ult, podeDesconectar) => `<article class="card cfg-int"><div class="cfg-int-topo"><span class="cfg-int-logo" aria-hidden="true">${logo}</span><div><h2>${nome}</h2><span class="badge ${cl}">${esc(rot)}</span></div></div><p>${txt}</p>
    <dl><div><dt>Conta conectada</dt><dd>${conta ? esc(conta) : '—'}</dd></div><div><dt>Última sincronização</dt><dd>${ult ? esc(fmtDateTime(ult)) : 'Ainda sem sincronização'}</dd></div></dl>
    <div class="cfg-int-acoes"><button type="button" class="btn" data-cfg-conf="${k}">${k === 'drive' ? 'Ver detalhes' : cl === 'ok' ? 'Configurar' : cl === 'warn' ? 'Reconectar' : 'Conectar'}</button>${podeDesconectar ? `<button type="button" class="btn soft" data-cfg-desc="${k}" aria-label="Desconectar ${attr(nome)}">Desconectar</button>` : ''}</div></article>`;
  corpo.innerHTML = `<div class="cfg-int-grade">${card('google', 'Google Agenda', '31', 'Calendário Geral escolar: lê os eventos das agendas cadastradas; só a agenda do Marketing aceita alterações.', eg, g.conectado ? g.email : '', g.ultimaAgenda || sync.google, g.conectado)}
    ${card('meta', 'Meta (Instagram e Tráfego Pago)', '∞', 'Métricas do Instagram e dos anúncios. O Tráfego Pago é somente consulta: nada é criado, editado nem pausado.', em, ig.conectado ? [ig.pagina, ig.usuario ? '@' + ig.usuario : '', ads && ads.conta ? 'anúncios ' + ads.conta : ''].filter(Boolean).join(' · ') : '', ig.ultimaSync || sync.instagram, ig.conectado)}
    ${card('drive', 'Google Drive', '▲', 'Os materiais das publicações aceitam o link de um arquivo do Drive. A conexão com a conta do Drive ainda não existe neste sistema.', ['mute', 'Não implementada'], '', '', false)}</div>`;
  $$('[data-cfg-conf]', corpo).forEach(b => { b.onclick = () => { CFG.sub = b.dataset.cfgConf; cfgIr(); }; });
  $$('[data-cfg-desc]', corpo).forEach(b => { b.onclick = async () => {
    const k = b.dataset.cfgDesc, nome = k === 'google' ? 'Google Agenda' : 'Meta';
    if (!await Dlg.confirmar({ titulo: `Desconectar ${nome}`, texto: k === 'google' ? 'O Calendário Geral deixa de ler as agendas do Google até reconectar. Nenhum evento é apagado no Google.' : 'Instagram e Tráfego Pago deixam de sincronizar até reconectar. Os dados já guardados não são apagados.', confirmar: 'Desconectar', perigo: true })) return;
    try { await post(k === 'google' ? '/integrations/google/disconnect' : '/integrations/meta/disconnect', {}); toast(nome + ' desconectado'); cfgIr(); } catch (e) { toast(e.message, 'warn'); }
  }; });
}
const cfgDriveHtml = () => '<section class="card"><div class="db-tit"><h2>Google Drive</h2><span class="badge mute">Não implementada</span></div><p>O EVO MKT não tem conexão com contas do Google Drive: nada é sincronizado nem lido do Drive. Nas publicações, o material pode ser registrado como <b>link</b> de um arquivo do Drive (o arquivo continua no Drive de quem o criou).</p><p class="kpi-note">Se a conexão for desenvolvida, usará o menor escopo necessário e tratará erros de permissão e de cota.</p></section>';

/* ---- Segurança ---- */
async function cfgAutenticacao(corpo) {
  const modo = await api('/auth/mode').then(m => m.modo).catch(() => '');
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Autenticação e sessões</h2></div>
    <div class="setting-row"><div><b>Forma de entrada</b><small>${modo === 'codigo' ? 'Só com o código do acesso.' : 'Código e senha.'} Altere em Usuários e Permissões › Usuários.</small></div><span class="badge ok">Ativa</span></div>
    <div class="setting-row"><div><b>Senha obrigatória no primeiro acesso</b><small>Quem entra com a senha temporária é obrigado a trocá-la.</small></div><span class="badge ok">Ativa</span></div>
    <div class="setting-row"><div><b>Limite de tentativas de login</b><small>Muitas tentativas erradas bloqueiam o acesso por 15 minutos e geram aviso por e-mail ao Administrador, quando o e-mail estiver configurado no servidor.</small></div><span class="badge ok">Ativo</span></div>
    <div class="setting-row"><div><b>Sessões</b><small>Expiram sozinhas após algumas horas. A lista de sessões ativas por pessoa não existe nesta versão.</small></div><span class="badge mute">Sem gestão individual</span></div>
    <div class="setting-row"><div><b>Verificação em duas etapas (2FA)</b><small>Não implementada.</small></div><span class="badge mute">Indisponível</span></div>
    <div class="setting-row"><div><b>Bloqueio por inatividade</b><small>Preferência deste aparelho, em Geral › Preferências.</small></div><span class="badge ${String(pref('autoLockMinutes', '0')) === '0' ? 'mute' : 'ok'}">${String(pref('autoLockMinutes', '0')) === '0' ? 'Desativado' : pref('autoLockMinutes', '0') + ' min'}</span></div></section>`;
}
async function cfgLogs(corpo) {
  const log = await api('/admin/audit?limit=300');
  const tipos = [['', 'Todos os registros'], ['acesso', 'Acessos'], ['alteracao', 'Alterações']];
  const ehAcesso = l => /^(login|logout|senha|recuper|acesso)/i.test(String(l.acao));
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Logs de acesso e alterações</h2><small>${log.length} registros mais recentes</small></div><p class="kpi-note">Quem fez o quê e quando. Senhas, chaves e tokens nunca são gravados nestes registros.</p>
    <div class="cfg-filtros"><label class="fb-campo"><span>Tipo</span><select class="control" id="lgTipo">${tipos.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label class="fb-campo"><span>Buscar</span><input class="control" id="lgBusca" type="search" placeholder="Pessoa, ação ou registro"></label><span class="kpi-note" id="lgCont"></span></div>
    <div class="tablewrap"><table class="datatable"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Registro</th></tr></thead><tbody id="lgCorpo"></tbody></table></div></section>`;
  const norm = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const desenha = () => {
    const t = $('#lgTipo').value, b = norm($('#lgBusca').value);
    const r = log.filter(l => (!t || (t === 'acesso') === ehAcesso(l)) && (!b || norm([l.ator, l.acao, l.modulo, l.registro].join(' ')).includes(b)));
    $('#lgCorpo').innerHTML = r.length ? r.slice(0, 150).map(l => `<tr><td>${esc(fmtDateTime(l.quando))}</td><td>${esc(l.ator)}</td><td>${esc(l.acao)}</td><td>${esc([l.modulo, l.registro].filter(Boolean).join(' '))}</td></tr>`).join('') : '<tr><td colspan="4"><div class="empty compact">Nenhum registro com estes filtros.</div></td></tr>';
    $('#lgCont').textContent = `${r.length} registro(s)${r.length > 150 ? ' (mostrando 150)' : ''}`;
  };
  $('#lgTipo').onchange = desenha; $('#lgBusca').oninput = desenha; desenha();
}

/* ---- Dados do Sistema ---- */
const cfgBytes = n => n >= 1073741824 ? (n / 1073741824).toFixed(2).replace('.', ',') + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
async function cfgInformacoes(corpo) {
  const s = await api('/admin/sistema');
  const lin = (r, v) => `<div class="setting-row"><div><b>${r}</b></div><span class="pr-val">${esc(v)}</span></div>`;
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Informações gerais</h2></div><p class="kpi-note">Lidas agora do servidor; nada aqui é fixo.</p>
    ${lin('Versão do sistema', s.versao)}${lin('Ambiente', s.ambiente)}${lin('Servidor (Node)', s.node)}${lin('Fuso da escola', s.fuso)}${lin('Banco de dados', `${fmtN(s.banco.tabelas)} tabelas · ${cfgBytes(s.banco.bytes)}`)}${lin('Registros do sistema', fmtN(s.registros))}${lin('Arquivos anexados', `${fmtN(s.arquivos.total)} arquivo(s) · ${cfgBytes(s.arquivos.bytes)}`)}${lin('Migrações aplicadas', `${fmtN(s.migracoes.aplicadas)}${s.migracoes.ultima ? ' · última: ' + s.migracoes.ultima : ''}`)}${lin('Último backup', s.ultimoBackup ? `${fmtDateTime(s.ultimoBackup.criadoEm)} · ${s.ultimoBackup.nome}` : 'Nenhum backup registrado')}</section>`;
}
async function cfgDiagnostico(corpo) {
  corpo.innerHTML = '<div id="cfgDg"></div><div id="cfgPr"></div>';
  if (cfgAdm()) await cfgPartes($('#cfgDg'), cfgAuditoria, [0]);
  await cfgProntidao($('#cfgPr'));
}
async function cfgManutencao(corpo) {
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Manutenção</h2></div><p class="kpi-note">Nada é executado sozinho. Cada ação pede confirmação e só mexe no que está descrito.</p>
    <div class="setting-row"><div><b>Verificar integridade dos dados</b><small>Somente leitura: confere vínculos, materiais e contadores sem alterar nada.</small></div><button type="button" class="btn soft" id="mtInt">Verificar agora</button></div>
    <div class="setting-row"><div><b>Backup dos dados</b><small>Criação e restauração ficam em Segurança › Backups.</small></div><button type="button" class="btn soft" id="mtBk">Abrir Backups</button></div>
    <div class="setting-row"><div><b>Limpar o cache do aplicativo neste aparelho</b><small>Apaga só os arquivos guardados pelo navegador (telas e scripts). Seus dados e preferências não são tocados; a página recarrega.</small></div><button type="button" class="btn soft" id="mtCache">Limpar cache</button></div></section><div id="mtRes"></div>`;
  $('#mtInt').onclick = async () => { $('#mtInt').disabled = true; try { await cfgPartes($('#mtRes'), cfgAuditoria, [0]); toast('Verificação concluída'); } catch (e) { toast(e.message, 'warn'); } $('#mtInt').disabled = false; };
  $('#mtBk').onclick = () => { CFG.sec = 'seguranca'; CFG.aba = 'backups'; cfgIr(); };
  $('#mtCache').onclick = async () => {
    if (!await Dlg.confirmar({ titulo: 'Limpar o cache', texto: 'Os arquivos guardados pelo navegador serão apagados e a página recarregada. Nenhum dado do sistema é alterado.', confirmar: 'Limpar cache' })) return;
    try { if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k); toast('Cache limpo'); setTimeout(() => location.reload(), 600); } catch (e) { toast(e.message, 'warn'); }
  };
  if (!cfgAdm()) $('#mtInt').closest('.setting-row').remove();
}
