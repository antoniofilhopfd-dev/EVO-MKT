/* Configurações: tudo o que não é trabalho do dia a dia.
   Geral · Perfis e segmentos · Acessos internos · Instagram · Meta Ads · Google · IA · E-mail · Backup e restauração · Auditoria · Prontidão.
   Só o Administrador vê o que mexe em acessos, integrações, backup e auditoria (o servidor confere de novo em cada rota). */
const CFG_SECOES = [['geral', 'Geral', false], ['perfis', 'Perfis e segmentos', false], ['acessos', 'Acessos internos', true], ['instagram', 'Instagram', true], ['metaads', 'Meta Ads', true], ['google', 'Google', true], ['ia', 'IA', true], ['email', 'E-mail', true], ['backup', 'Backup e restauração', true], ['auditoria', 'Auditoria', true], ['prontidao', 'Prontidão', false]];
const CFG = { aba: pref('cfgAba', 'geral') };
const cfgVisiveis = () => CFG_SECOES.filter(([, , adm]) => !adm || internalSession?.admin);
const cfgBadge = (on, ok, nao = 'Não conectado') => `<span class="badge ${on ? 'ok' : 'mute'}">${on ? esc(ok) : esc(nao)}</span>`;
const cfgUri = (rot, u) => `<div class="uri-row"><small>${esc(rot)}</small><code>${esc(u)}</code><button type="button" class="btn soft" data-copiar="${attr(u)}">Copiar</button></div>`;

PAGINAS.configuracoes = async function () {
  const vis = cfgVisiveis();
  if (!vis.some(x => x[0] === CFG.aba)) CFG.aba = 'geral';
  const q = new URLSearchParams(location.search), retorno = q.get('int');
  $('#content').innerHTML = `<div class="cfg"><nav class="cfg-nav" aria-label="Seções de Configurações">${vis.map(([k, l]) => `<button type="button" data-cfg="${k}" class="${CFG.aba === k ? 'active' : ''}" ${CFG.aba === k ? 'aria-current="page"' : ''}>${esc(l)}</button>`).join('')}</nav><div class="cfg-body" id="cfgCorpo"><div class="loading"><span></span><b>Carregando…</b></div></div></div>`;
  $$('[data-cfg]').forEach(b => { b.onclick = () => { CFG.aba = b.dataset.cfg; setPref('cfgAba', CFG.aba); go('configuracoes'); }; });
  const corpo = $('#cfgCorpo');
  try {
    await ({ geral: cfgGeral, perfis: cfgPerfis, acessos: cfgAcessos, instagram: cfgInstagram, metaads: cfgMetaAds, google: cfgGoogle, ia: cfgIA, email: cfgEmail, backup: cfgBackup, auditoria: cfgAuditoria, prontidao: cfgProntidao }[CFG.aba] || cfgGeral)(corpo);
  } catch (e) { corpo.innerHTML = `<div class="error-state"><h2>Não foi possível carregar</h2><p>${esc(e.message)}</p></div>`; }
  $$('[data-copiar]', corpo).forEach(b => { b.onclick = () => copiar(b.dataset.copiar, 'Copiado'); });
  if (retorno) { const msg = new URLSearchParams(location.search).get('msg'); toast(/_ok$/.test(retorno) ? 'Conexão concluída' : `Conexão não concluída${msg ? ': ' + msg : ''}`, /_ok$/.test(retorno) ? 'ok' : 'warn'); history.replaceState(null, '', '?page=configuracoes'); }
};
const salvaCred = async (formId, extra = {}) => { const f = Object.fromEntries(new FormData($(formId)).entries()); try { await post('/integrations/settings', { ...f, ...extra }); toast('Salvo'); go('configuracoes'); } catch (e) { toast(e.message, 'warn'); } };

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
    $('#iForm', o.el).onsubmit = async ev => { ev.preventDefault(); const b = { titulo: $('#iT', o.el).value.trim(), descricao: $('#iD', o.el).value.trim() }; if (b.titulo.length < 3) { $('#iErr', o.el).textContent = 'Dê um título.'; return; } try { if (e) await put(`/data?module=configuracoes&id=${encodeURIComponent(r.id)}`, b); else await post('/data?module=configuracoes', b); invalidate('configuracoes'); o.close(); go('configuracoes'); } catch (er) { $('#iErr', o.el).textContent = er.message; } };
    const d = $('#iDel', o.el); if (d) d.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Excluir informação', texto: `Excluir “${r.titulo}”?`, confirmar: 'Excluir', perigo: true })) return; try { await api(`/data?module=configuracoes&id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }); invalidate('configuracoes'); o.close(); go('configuracoes'); } catch (er) { toast(er.message, 'warn'); } };
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
  const recarrega = () => go('configuracoes');
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
    <div class="actions"><button class="btn" id="igSync">Sincronizar agora</button></div>` : ''}</section>
    <section class="card"><div class="db-tit"><h2>Fila de publicação automática</h2></div>${fila.length ? `<div class="tablewrap"><table class="datatable"><thead><tr><th>Publicação</th><th>Quando</th><th>Estado</th><th></th></tr></thead><tbody>${fila.map(c => `<tr><td class="titlecell">${esc(c.titulo)}<br><small>${esc(c.id)}</small></td><td>${esc(fmtDateTime(c.publicacaoEm))}</td><td>${esc(c.estado || (c.publicado ? 'Publicado' : 'Aguardando'))}${c.erro ? `<br><small class="bad">${esc(c.erro)}</small>` : ''}</td><td>${c.estado === 'ERRO' ? `<button class="btn soft" data-retry="${attr(c.id)}">Tentar de novo</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty compact">Nenhuma publicação agendada para sair sozinha.</div>'}</section>`;
  $('#metaForm').onsubmit = e => { e.preventDefault(); salvaCred('#metaForm'); };
  const d = $('#metaDesc'); if (d) d.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Desconectar a Meta', texto: 'O sistema deixa de ler o Instagram e os anúncios até reconectar. Nada é apagado na Meta.', confirmar: 'Desconectar', perigo: true })) return; try { await post('/integrations/meta/disconnect', {}); go('configuracoes'); } catch (er) { toast(er.message, 'warn'); } };
  $$('[data-mon]', corpo).forEach(cb => { cb.onchange = async () => { const ids = $$('[data-mon]', corpo).filter(x => x.checked).map(x => x.dataset.mon); try { await post('/integrations/meta/account', { monitorar: ids }); toast('Perfis acompanhados atualizados'); } catch (e) { toast(e.message, 'warn'); } }; });
  const s = $('#igSync'); if (s) s.onclick = async () => { s.disabled = true; try { await post('/integrations/instagram/sync', {}); toast('Instagram sincronizado'); go('configuracoes'); } catch (e) { toast(e.message, 'warn'); s.disabled = false; } };
  $$('[data-retry]', corpo).forEach(b => { b.onclick = async () => { try { await post('/integrations/instagram/retry', { id: b.dataset.retry }); toast('Nova tentativa na próxima rodada'); go('configuracoes'); } catch (e) { toast(e.message, 'warn'); } }; });
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
  $('#adSalva').onclick = async () => { const v = $('#adConta').value; if (!v) return toast('Escolha a conta primeiro.', 'warn'); try { await post('/integrations/ads/account', { conta: v }); toast('Conta de anúncios definida'); go('configuracoes'); } catch (e) { toast(e.message, 'warn'); } };
  $('#adSync').onclick = async () => { try { await post('/integrations/ads/sync', {}); toast('Anúncios sincronizados'); go('configuracoes'); } catch (e) { toast(e.message, 'warn'); } };
}

/* ---- Google ---- */
async function cfgGoogle(corpo) {
  const st = await api('/integrations/status'), gg = st.google;
  corpo.innerHTML = `<section class="card int-card"><div class="db-tit"><h2>Google Agenda</h2>${cfgBadge(gg.conectado, gg.email || 'conectado')}</div>
    <form id="gForm" class="admin-form"><label>Client ID<input name="g_client_id" value="${attr(gg.clientId || '')}" autocomplete="off"></label><label>Client Secret<input name="g_client_secret" type="password" placeholder="${gg.configurado ? '•••••••• (já salvo; deixe vazio para manter)' : 'Cole o Client Secret'}" autocomplete="off"></label><div class="actions"><button class="btn soft" type="submit">Salvar credenciais</button>${gg.configurado ? `<a class="btn" href="/api/integrations/google/connect">${gg.conectado ? 'Reconectar' : 'Conectar com Google'}</a>` : ''}${gg.conectado ? '<button type="button" class="btn danger-soft" id="gDisc">Desconectar</button>' : ''}</div></form>
    ${cfgUri('URI de redirecionamento autorizado (cadastre no Google Cloud):', st.redirectUris.google)}
    ${gg.conectado ? `<div class="admin-form"><label>Agenda sincronizada (leitura e escrita)<select class="control" id="gCalSel"><option value="">${gg.calendarioId ? 'Agenda atual (carregando…)' : 'Nenhuma (sincronização desligada)'}</option></select></label><p class="kpi-note">Nesta agenda o sistema grava as publicações e compromissos e importa o que for criado no Google. Última sincronização: ${gg.ultimaAgenda ? esc(fmtDateTime(gg.ultimaAgenda)) : 'nunca'}.</p><label class="check-row"><input type="checkbox" id="gImp" ${gg.importar ? 'checked' : ''}> Importar para o Calendário os eventos criados direto no Google</label><div class="actions"><button class="btn" id="gSync">Sincronizar agora</button><button class="btn soft" id="gLimpa">Remover eventos importados do sistema</button></div></div>
      <h3>Agendas somente leitura</h3><p class="kpi-note">Aparecem no Calendário, mas nunca são alteradas pelo sistema (o EVO MKT não grava nelas).</p><div id="gLeitura"><div class="loading"><span></span><b>Carregando agendas…</b></div></div>` : ''}</section>`;
  $('#gForm').onsubmit = e => { e.preventDefault(); salvaCred('#gForm'); };
  const d = $('#gDisc'); if (d) d.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Desconectar o Google', texto: 'A sincronização da Agenda para. Nada é apagado no Google.', confirmar: 'Desconectar', perigo: true })) return; try { await post('/integrations/google/disconnect', {}); go('configuracoes'); } catch (er) { toast(er.message, 'warn'); } };
  if (!gg.conectado) return;
  api('/integrations/google/calendars').then(r => { const lista = r.calendarios || r.rows || r; const sel = $('#gCalSel'); if (!sel || !Array.isArray(lista)) return; sel.innerHTML = `<option value="">Nenhuma (sincronização desligada)</option>` + lista.map(c => `<option value="${attr(c.id)}" ${c.atual ? 'selected' : ''}>${esc(c.nome)}${c.principal ? ' (principal)' : ''}</option>`).join(''); }).catch(() => {});
  $('#gCalSel').onchange = async e => { if (!await Dlg.confirmar({ titulo: 'Trocar a agenda', texto: 'Os vínculos da agenda anterior saem; os eventos que já estão lá continuam como estão. Em uma agenda que já tem eventos, o sistema só adiciona os seus.', confirmar: 'Trocar' })) return go('configuracoes'); try { await post('/integrations/google/calendar/choose', { id: e.target.value }); toast('Agenda escolhida'); go('configuracoes'); } catch (er) { toast(er.message, 'warn'); } };
  $('#gImp').onchange = async e => { try { await post('/integrations/settings', { g_importar: e.target.checked }); toast('Salvo'); } catch (er) { toast(er.message, 'warn'); } };
  $('#gSync').onclick = async () => { try { const r = await post('/integrations/google/calendar/sync', {}); toast(`Agenda sincronizada (${(r.do_google || 0) + (r.para_google || 0)} mudanças)`); go('configuracoes'); } catch (e) { toast(e.message, 'warn'); } };
  $('#gLimpa').onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Remover eventos importados', texto: 'Remove do sistema os eventos que vieram do Google. Não apaga nada no Google.', confirmar: 'Remover', perigo: true })) return; try { const r = await post('/integrations/google/calendar/limpar-importados', {}); toast(`${r.removidos ?? 0} evento(s) removido(s) do sistema`); } catch (e) { toast(e.message, 'warn'); } };
  try {
    const ag = (await api('/integrations/google/agendas-leitura')).agendas || [];
    $('#gLeitura').innerHTML = ag.length ? ag.map(a => `<label class="setting-row"><div><b>${esc(a.nome)}</b><small>${esc(a.papel || '')}${a.usadaParaEscrita ? ' · é a agenda sincronizada' : a.gravavel ? ' · você poderia editar, mas aqui fica só leitura' : ''}</small></div><input type="checkbox" data-leit="${attr(a.id)}" ${a.mostrar ? 'checked' : ''} ${a.usadaParaEscrita ? 'disabled' : ''}></label>`).join('') : '<div class="empty compact">Nenhuma outra agenda encontrada.</div>';
    $$('[data-leit]').forEach(cb => { cb.onchange = async () => { const ids = $$('[data-leit]').filter(x => x.checked).map(x => x.dataset.leit); try { await post('/integrations/google/agendas-leitura', { ids }); toast('Agendas de leitura salvas'); } catch (e) { toast(e.message, 'warn'); } }; });
  } catch (e) { $('#gLeitura').innerHTML = `<div class="empty compact">${esc(e.message)}</div>`; }
}

/* ---- IA ---- */
async function cfgIA(corpo) {
  const ia = await api('/ia/estado');
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>IA para legendas</h2>${cfgBadge(ia.ativa, 'Ligada', 'Desligada')}</div>
    <p class="kpi-note">A IA só escreve <b>rascunhos</b> de variações de legenda dentro de uma publicação. Nada é salvo nem publicado sozinho. Fica desligada até você colar uma chave. A chave é guardada criptografada no servidor e não volta para a tela.</p>
    <form id="iaForm" class="admin-form"><label>Chave da API (Anthropic)<input name="anthropic_key" type="password" autocomplete="off" placeholder="${ia.ativa ? '•••••••• (já salva; deixe vazio para manter)' : 'Cole a chave'}"></label><label>Guia de voz do Colégio (opcional)<textarea class="control" name="ia_guia_voz" rows="5" maxlength="1500" placeholder="Ex.: tom acolhedor, trate as famílias por “vocês”, evite gírias.">${esc(ia.guiaVoz || '')}</textarea></label><div class="actions"><button class="btn" type="submit">Salvar</button>${ia.ativa ? '<button type="button" class="btn danger-soft" id="iaOff">Remover a chave e desligar</button>' : ''}</div></form></section>`;
  $('#iaForm').onsubmit = e => { e.preventDefault(); salvaCred('#iaForm'); };
  const off = $('#iaOff'); if (off) off.onclick = async () => { if (!await Dlg.confirmar({ titulo: 'Desligar a IA', texto: 'A chave é apagada do servidor. As publicações não mudam.', confirmar: 'Desligar', perigo: true })) return; try { await post('/integrations/settings', { ia_remover_chave: true }); toast('IA desligada'); go('configuracoes'); } catch (er) { toast(er.message, 'warn'); } };
}

/* ---- E-mail ---- */
async function cfgEmail(corpo) {
  const pr = await api('/integrations/prontidao');
  const smtp = pr.itens.find(i => i.id === 'smtp');
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>E-mail de avisos</h2>${cfgBadge(smtp?.ok, 'Configurado', 'Não configurado')}</div>
    <p class="kpi-note">Usado para avisar a Gerência de falhas nas integrações e para avisar uma pessoa quando uma publicação é atribuída a ela (se ela tiver e-mail em Acessos internos). O servidor de e-mail é configurado nas variáveis de ambiente da hospedagem (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, MAIL_FROM e NOTIFY_TO); por segurança elas não ficam editáveis nesta tela.</p>
    <div class="setting-row"><div><b>Situação</b><small>${smtp?.ok ? 'SMTP e destinatário da Gerência definidos.' : esc(smtp?.como || '')}</small></div></div></section>`;
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
  const novo = async completo => { try { const r = await post('/backup', { completo }); toast('Backup criado: ' + r.file); go('configuracoes'); } catch (e) { toast(e.message, 'warn'); } };
  $('#bkNovo').onclick = () => novo(false); $('#bkCompleto').onclick = () => novo(true);
  $$('[data-val]', corpo).forEach(b => { b.onclick = async () => {
    try {
      const v = await api(`/backup/validate?file=${encodeURIComponent(b.dataset.val)}`);
      const o = dialogo(`<h3>Restaurar backup</h3><p><code>${esc(b.dataset.val)}</code></p>${v.ok ? '<p class="ok-txt">O arquivo é válido.</p>' : `<p class="bad">Arquivo inválido: ${esc((v.erros || []).join('; '))}</p>`}${(v.avisos || []).map(a => `<p class="kpi-note">${esc(a)}</p>`).join('')}<p class="kpi-note">Restaurar substitui os dados atuais pelos do arquivo. Antes, o sistema guarda um backup de segurança.</p><div class="actions"><span class="cm-esp"></span><button class="btn soft" data-close>Cancelar</button><button class="btn danger" id="bkOk" ${v.ok ? '' : 'disabled'}>Restaurar</button></div>`);
      $('#bkOk', o.el).onclick = async () => { $('#bkOk', o.el).disabled = true; try { const r = await post('/backup/restore', { file: b.dataset.val }); o.close(); await Dlg.aviso({ titulo: 'Backup restaurado', texto: `Pronto. Backup de segurança: ${r.seguranca}.` }); location.reload(); } catch (e) { toast(e.message, 'warn'); $('#bkOk', o.el).disabled = false; } };
    } catch (e) { toast(e.message, 'warn'); }
  }; });
  const od = $('#orfDel'); if (od) od.onclick = async () => { const sel = $$('[data-orf]').filter(x => x.checked).map(x => x.dataset.orf); if (!sel.length) return toast('Escolha ao menos um arquivo.', 'warn'); if (!await Dlg.confirmar({ titulo: 'Excluir arquivos', texto: `Excluir ${sel.length} arquivo(s) sem vínculo? Um backup completo é feito antes.`, confirmar: 'Excluir', perigo: true })) return; try { const r = await post('/admin/arquivos-sem-vinculo/excluir', { caminhos: sel, confirmar: true }); toast(`${r.excluidos} arquivo(s) excluído(s)`); go('configuracoes'); } catch (e) { toast(e.message, 'warn'); } };
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
  const pr = await api('/integrations/prontidao'), r = pr.resumo || {};
  const lin = (rot, v) => `<div class="setting-row"><div><b>${rot}</b></div><span class="pr-val">${esc(typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${{ instagram: 'Instagram', anuncios: 'Anúncios', google: 'Google' }[k] || k}: ${x ? fmtDateTime(x) : 'nunca'}`).join(' · ') : v || '—')}</span></div>`;
  corpo.innerHTML = `<section class="card"><div class="db-tit"><h2>Prontidão do sistema</h2>${cfgBadge(pr.pronto, 'Pronto', 'Falta configurar')}</div>
    ${lin('Conexão com a Meta', r.conexaoMeta)}${lin('Conexão com o Google', r.conexaoGoogle)}${lin('Última sincronização', r.ultimaSincronizacao || {})}${lin('Próxima sincronização', r.proximaSincronizacao)}${lin('Última falha', r.ultimaFalha)}${lin('Validade do token da Meta', r.validadeToken ? (/^\d{4}-/.test(r.validadeToken) ? fmtDateTime(r.validadeToken) : r.validadeToken) : '—')}${lin('Versão da API da Meta', r.versaoApi)}${lin('Último backup', r.ultimoBackup)}${lin('Integridade do banco', r.integridade)}${lin('Versão instalada', r.versaoInstalada)}${lin('Ambiente', r.ambiente)}</section>
    <section class="card"><div class="db-tit"><h2>Lista de conferência</h2><small>${pr.itens.filter(i => i.ok).length}/${pr.itens.length} itens ok</small></div><ul class="pr-lista">${pr.itens.map(i => `<li class="${i.ok ? 'ok' : i.nivel}"><span aria-hidden="true">${i.ok ? '✓' : i.nivel === 'erro' ? '✕' : '!'}</span><div><b>${esc(i.titulo)}</b>${i.ok ? '' : `<small>${esc(i.como)}</small>`}</div></li>`).join('')}</ul>
      ${internalSession?.admin ? `<div class="int-links">${cfgUri('Política de privacidade (cole na Meta e no Google):', pr.urls.privacidade)}${cfgUri('Termos de uso:', pr.urls.termos)}${cfgUri('Cron de sincronização (de hora em hora ou diário):', pr.cron)}${cfgUri('Cron de publicação no Instagram (a cada 10 minutos):', pr.cronPublicar)}</div>` : ''}</section>`;
}
