import { registrarNotificacao } from '../notificacoes';
import { timingSafeEqual } from 'node:crypto';
import { Ctx, setCookie } from '../ctx';
import { q, q1, run } from '../db';
import { genPassword, hashPassword, randHex, sha256, strongPassword, verifyPassword } from '../crypto';
import {
  allowedSegment, checkCsrf, codeLoginFail, codeLoginGuard, internalUser, issueAccessCode, loginMode, portalUser, rateCheck,
  rateFail, registerDevice, requireInternal, requireManager, requirePortal, sessionTokenFromCookie, setSessionCookie, startSession, stepUp, validCodeFormat,
} from '../auth';
import { accessHmac, decryptSecret, encryptSecret } from '../crypto';
import { notifyMail } from '../mail';
import {
  ALLOWED_EXT, audit, CREATE_FIELDS, EVO_VERSION, getRow, headersOf, insertRow, listRows, logStatus, modifyRow, MODULES, notifyAssignment,
  emailForPerson, publicRow, saveRow, seedEquipe, TEAM_WRITE, teamMayDelete, trashRow, UPDATE_FIELDS, updateRow,
} from '../records';
import { saveUploads, serveFile } from '../files';
import { intLog, setSetting, setting } from '../settings';
import { cleanInput, env, fail, HttpError, lower, now, Row, strv } from '../util';
import { integrationsRoute } from './integrations';
import { cronRoute } from './cron';
import { validarTransicaoSolicitacao } from '../fluxo';
import { operacaoRoute } from './operacao';
import { trabalhoRoute } from './trabalho';
import { conteudoRoute } from './conteudo';
import { relatoriosRoute } from './relatorios';
import { aprovacaoPublicaRoute } from './aprovacaoPublica';
import { importModule } from '../xlsx';
import { autoBackupIfDue, backupLog, makeBackup, restoreBackup, validateBackup } from '../backup';
import { gConnected, gDriveSendEntregas } from '../integrations/google';

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

type Out = Response;
const asUser = (u: Row) => ({ code: u.codigo, name: u.nome, role: u.role, label: u.label });
const portalOut = (u: Row, segs: unknown) => ({ id: u.codigo, codigo: u.codigo, nome: u.nome, perfil: u.perfil, segmentos: segs, ativo: true });
const upper = (v: unknown) => strv(v).trim().toUpperCase();

export async function route(c: Ctx): Promise<Out> {
  const { method, path } = c;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') await checkCsrfOrPortal(c);

  switch (true) {
    case path === '/manager/approval-link' || path.startsWith('/public/approval'):
      return aprovacaoPublicaRoute(c);
    case path.startsWith('/reports/'):
      return relatoriosRoute(c);
    case path.startsWith('/content/'):
      return conteudoRoute(c);
    case path === '/comments' || path === '/portal/comments' || path === '/checklist' || path === '/admin/automacoes':
      return trabalhoRoute(c);
    case path === '/fluxo' || path === '/notificacoes' || path === '/notificacoes/lida' || path === '/timeline' || path === '/portal/timeline' || path === '/sla' || path === '/indicadores' || path === '/insights' || path === '/admin/integridade' || path === '/ia/legenda' || path === '/datas':
      return operacaoRoute(c);
    case path.startsWith('/cron/'):
      return cronRoute(c);

    case path === '/recover':
      return recoverRoute(c);

    case path === '/setup':
      return setupRoute(c);

    case path === '/heartbeat':
      return json({ ok: true });

    case path === '/health': {
      await requireInternal(c);
      const mods: Row[] = [];
      let total = 0;
      for (const m of Object.keys(MODULES)) {
        const r = (await q1('SELECT COUNT(*) c,COALESCE(SUM(LENGTH(data)),0) s,MAX(atualizado_em) m FROM records WHERE modulo=?', [m]))!;
        total += Number(r.c);
        mods.push({ module: m, file: `tabela:${m}`, ok: true, records: Number(r.c), size: Number(r.s), modified: r.m });
      }
      return json({ ok: true, version: EVO_VERSION, records: total, dataDir: 'Banco de dados', modules: mods });
    }

    // ---------- autenticação interna ----------
    case path === '/auth/login' && method === 'POST': {
      const input = await c.body();
      const cod = upper(input.codigo);
      const sen = strv(input.senha);
      if ((await loginMode()) === 'codigo') {
        await codeLoginGuard(c);
        const u = validCodeFormat(cod) ? await q1('SELECT * FROM users WHERE acesso_hmac=? AND ativo=1', [accessHmac(cod)]) : undefined;
        if (!u) return codeLoginFail(c, '?');
        setSessionCookie(c, await startSession('int', u.codigo));
        await audit(u.codigo, 'login');
        await registerDevice(c, 'int', u.codigo, u.nome);
        return json({ user: asUser(u), mustChange: false });
      }
      const key = `int|${c.ip}|${cod}`;
      await rateCheck(key);
      await rateCheck('ip|' + c.ip, 40);
      const u = await q1('SELECT * FROM users WHERE codigo=? AND ativo=1', [cod]);
      if (!u || !verifyPassword(sen, u.pass_hash)) {
        await rateFail(key);
        await rateFail('ip|' + c.ip);
        await audit(cod || '?', 'login-falhou');
        fail(401, 'Código ou senha inválidos.');
      }
      setSessionCookie(c, await startSession('int', cod));
      await audit(cod, 'login');
      return json({ user: asUser(u), mustChange: !!u.must_change });
    }
    case path === '/auth/me': {
      const u = await requireInternal(c);
      return json({ user: asUser(u), mustChange: (await loginMode()) === 'senha' && !!u.must_change });
    }
    case path === '/auth/logout' && method === 'POST': {
      const t = sessionTokenFromCookie(c);
      if (t) await run('DELETE FROM sessions WHERE token_hash=?', [sha256(t)]);
      setCookie(c, 'evo_sid', '', { expire: true });
      return json({ ok: true });
    }
    case path === '/auth/password' && method === 'POST': {
      const u = await requireInternal(c);
      const input = await c.body();
      const row = (await q1('SELECT pass_hash FROM users WHERE codigo=?', [u.codigo]))!;
      if (!verifyPassword(strv(input.atual), row.pass_hash)) fail(403, 'Senha atual incorreta.');
      strongPassword(strv(input.nova));
      await run('UPDATE users SET pass_hash=?,must_change=0 WHERE codigo=?', [hashPassword(strv(input.nova)), u.codigo]);
      // quem trocou a senha continua logado neste aparelho; qualquer outra sessão (e aparelho lembrado) dessa pessoa é encerrada
      await run('DELETE FROM sessions WHERE tipo=? AND codigo=? AND token_hash<>?', ['int', u.codigo, sha256(sessionTokenFromCookie(c) || '-')]);
      await audit(u.codigo, 'senha-alterada');
      return json({ ok: true });
    }
    case path === '/admin/reset-password' && method === 'POST': {
      const m = await requireManager(c);
      const input = await c.body();
      await stepUp(m, input);
      const tab = tabOf(strv(input.tipo));
      const cod = upper(input.codigo);
      if (!(await q1(`SELECT 1 FROM ${tab} WHERE codigo=?`, [cod]))) fail(404, 'Usuário não encontrado.');
      if ((await loginMode()) === 'codigo') {
        const novo = await issueAccessCode(tab, cod);
        await audit(m.codigo, 'reset-codigo:' + cod);
        return json({ codigo: cod, senhaTemporaria: novo, modo: 'codigo' });
      }
      const p = genPassword();
      await run(`UPDATE ${tab} SET pass_hash=?,must_change=1 WHERE codigo=?`, [hashPassword(p), cod]);
      await run('DELETE FROM sessions WHERE codigo=?', [cod]);
      await audit(m.codigo, 'reset-senha:' + cod);
      return json({ codigo: cod, senhaTemporaria: p });
    }

    // ---------- dados internos ----------
    case path === '/data':
      return dataRoute(c);
    case path === '/search': {
      const u = await requireInternal(c);
      const term = lower(c.qs('q'));
      if (!term) return json([]);
      const res: Row[] = [];
      outer: for (const m of Object.keys(MODULES)) {
        if (m === 'configuracoes' && u.role !== 'manager') continue;
        if (m === 'lixeira') continue; // itens excluídos não aparecem na busca global
        for (const r of await listRows(m)) {
          if (lower(Object.values(r).join(' ')).includes(term)) {
            res.push({ ...r, module: m });
            if (res.length >= 300) break outer;
          }
        }
      }
      return json(res);
    }
    case path === '/backup' && method === 'POST': {
      const u = await requireManager(c);
      const input = await c.body();
      let f: string;
      try {
        f = await makeBackup('manual', { completo: !!input.completo });
      } catch (e: any) {
        return fail(500, 'Falha ao criar o backup: ' + String(e?.message ?? e).slice(0, 200));
      }
      await audit(u.codigo, 'backup', '', f);
      return json({ ok: true, file: f });
    }
    case path === '/backup/validate': {
      await requireManager(c);
      return json(await validateBackup(c.qs('file')));
    }
    case path === '/backup/restore' && method === 'POST': {
      // Restaura um backup (valida, guarda um backup de segurança antes e aplica tudo em uma transação).
      const u = await requireManager(c);
      const input = await c.body();
      return json({ ok: true, ...(await restoreBackup(strv(input.file), u.codigo)) });
    }
    case path === '/backup/log': {
      await requireManager(c);
      return json(await backupLog(30));
    }
    case path === '/backup/list': {
      await requireManager(c);
      return json((await q('SELECT nome FROM backups ORDER BY nome DESC')).map((r) => r.nome));
    }
    case path === '/backup/download': {
      await requireManager(c);
      const f = c.qs('file').split('/').pop() || '';
      if (!/^evo_backup_[0-9]{8}_[0-9]{6}_[A-Za-z0-9]+\.json\.gz$/.test(f)) fail(400, 'Arquivo inválido.');
      const r = await q1('SELECT conteudo FROM backups WHERE nome=?', [f]);
      if (!r) fail(404, 'Não encontrado.');
      return new Response(new Uint8Array(r.conteudo as Buffer), { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${f}"`, 'Cache-Control': 'no-store' } });
    }
    case path === '/portal/users': {
      await requireManager(c);
      const o = (await q('SELECT codigo,nome,perfil,segmentos,ativo FROM portal_users ORDER BY nome')).map((r) => ({ ...r, segmentos: JSON.parse(r.segmentos), id: r.codigo, ativo: !!r.ativo }));
      return json(o);
    }
    case path === '/manager/upload' && method === 'POST': {
      const u = await requireInternal(c);
      const id = c.qs('id');
      const row = (await getRow('solicitacoes', id)) ?? fail(404, 'Solicitação não encontrada.');
      const saved = await saveUploads(c, id, 'ENTREGA');
      await modifyRow('solicitacoes', id, (r) => {
        const cur = String(r.arquivosEntrega ?? '').split('|').map((s) => s.trim()).filter(Boolean);
        return { ...r, arquivosEntrega: [...cur, ...saved].join(' | '), atualizadoEm: now() };
      });
      await audit(u.codigo, 'upload-entrega', 'solicitacoes', id);
      if ((await setting('g_auto_drive_entregas')) === '1' && (await gConnected())) {
        try { await gDriveSendEntregas(id); } catch (e: any) { await intLog('google', 'erro', 'Drive automático: ' + e.message); }
      }
      return json({ files: saved });
    }
    case path === '/file': {
      await requireInternal(c);
      return serveFile(c.qs('path'), null);
    }

    // ---------- Integrações (Instagram / Google) ----------
    case path.startsWith('/integrations/') || path === '/public/media' || path === '/traffic/snapshots':
      return integrationsRoute(c);

    // ---------- Portal do Solicitante ----------
    case path === '/portal/login' && method === 'POST': {
      const input = await c.body();
      const cod = upper(input.codigo);
      const sen = strv(input.senha);
      if ((await loginMode()) === 'codigo') {
        await codeLoginGuard(c);
        const u = validCodeFormat(cod) ? await q1('SELECT * FROM portal_users WHERE acesso_hmac=? AND ativo=1', [accessHmac(cod)]) : undefined;
        if (!u) return codeLoginFail(c, '?');
        const tok = await startSession('por', u.codigo);
        await audit(u.codigo, 'portal-login');
        await registerDevice(c, 'por', u.codigo, u.nome);
        return json({ token: tok, mustChange: false, user: portalOut(u, JSON.parse(u.segmentos)) });
      }
      const key = `por|${c.ip}|${cod}`;
      await rateCheck(key);
      await rateCheck('ip|' + c.ip, 40);
      const u = await q1('SELECT * FROM portal_users WHERE codigo=? AND ativo=1', [cod]);
      if (!u || !verifyPassword(sen, u.pass_hash)) {
        await rateFail(key);
        await rateFail('ip|' + c.ip);
        await audit(cod || '?', 'portal-login-falhou');
        fail(401, 'Código ou senha inválidos.');
      }
      const tok = await startSession('por', cod);
      await audit(cod, 'portal-login');
      return json({ token: tok, mustChange: !!u.must_change, user: portalOut(u, JSON.parse(u.segmentos)) });
    }
    case path === '/portal/password' && method === 'POST': {
      const u = await requirePortal(c);
      const input = await c.body();
      const row = (await q1('SELECT pass_hash FROM portal_users WHERE codigo=?', [u.codigo]))!;
      if (!verifyPassword(strv(input.atual), row.pass_hash)) fail(403, 'Senha atual incorreta.');
      strongPassword(strv(input.nova));
      await run('UPDATE portal_users SET pass_hash=?,must_change=0 WHERE codigo=?', [hashPassword(strv(input.nova)), u.codigo]);
      await run('DELETE FROM sessions WHERE tipo=? AND codigo=? AND token_hash<>?', ['por', u.codigo, sha256(c.header('x-portal-token') || '-')]);
      await audit(String(u.codigo), 'senha-alterada');
      return json({ ok: true });
    }
    case path === '/admin/users': {
      await requireManager(c);
      const o: Row[] = [];
      for (const r of await q('SELECT codigo,nome,role,label,ativo,must_change,acesso_enc FROM users ORDER BY codigo'))
        o.push({ tipo: 'interno', codigo: r.codigo, nome: r.nome, role: r.role, perfil: r.label, ativo: !!r.ativo, trocarSenha: !!r.must_change, pediuReset: await pediuReset(r.codigo), email: await emailForPerson(r.nome), acesso: r.acesso_enc ? decryptSecret(r.acesso_enc) : '' });
      for (const r of await q('SELECT codigo,nome,perfil,segmentos,ativo,must_change,acesso_enc FROM portal_users ORDER BY codigo'))
        o.push({ tipo: 'portal', codigo: r.codigo, nome: r.nome, perfil: JSON.parse(r.segmentos).join(', '), ativo: !!r.ativo, trocarSenha: !!r.must_change, pediuReset: await pediuReset(r.codigo), email: '', acesso: r.acesso_enc ? decryptSecret(r.acesso_enc) : '' });
      return json(o);
    }
    case path === '/admin/user-active' && method === 'POST': {
      const m = await requireManager(c);
      const input = await c.body();
      await stepUp(m, input);
      const tipo = strv(input.tipo);
      const tab = tabOf(tipo);
      const cod = upper(input.codigo);
      const on = input.ativo ? 1 : 0;
      if (tipo === 'interno' && cod === m.codigo && !on) fail(400, 'Você não pode desativar o próprio acesso.');
      if (!(await q1(`SELECT 1 FROM ${tab} WHERE codigo=?`, [cod]))) fail(404, 'Usuário não encontrado.');
      await run(`UPDATE ${tab} SET ativo=? WHERE codigo=?`, [on, cod]);
      if (!on) await run('DELETE FROM sessions WHERE codigo=?', [cod]);
      await audit(m.codigo, (on ? 'ativar:' : 'desativar:') + cod);
      return json({ ok: true });
    }
    case path === '/admin/users/create' && method === 'POST': {
      const m = await requireManager(c);
      const input = await c.body();
      await stepUp(m, input);
      const tipo = strv(input.tipo);
      const tab = tabOf(tipo);
      const nome = strv(input.nome).trim().slice(0, 120);
      if (nome.length < 2) fail(400, 'Informe o nome.');
      const sigla = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase().padEnd(3, 'X').slice(0, 3);
      // ficha: 3 letras do nome + número sequencial da série (equipe 33xx, portal 26xx), nunca repetido
      const base = tipo === 'interno' ? 3300 : 2600;
      const used = (await q(`SELECT codigo FROM ${tab}`)).map((r) => parseInt(String(r.codigo).split('-')[1], 10) || 0);
      let n = Math.max(base, ...used) + 1;
      let codigo = `${sigla}-${n}`;
      while (await q1('SELECT 1 FROM users WHERE codigo=? UNION SELECT 1 FROM portal_users WHERE codigo=?', [codigo, codigo])) codigo = `${sigla}-${++n}`;
      const senha = genPassword();
      if (tipo === 'interno') {
        const role = input.perfil === 'manager' ? 'manager' : 'team';
        await run('INSERT INTO users(codigo,nome,role,label,pass_hash,must_change,ativo) VALUES(?,?,?,?,?,1,1)', [codigo, nome, role, role === 'manager' ? 'Gerente de Marketing' : 'Equipe de Marketing', hashPassword(senha)]);
        await seedEquipe(m.codigo);
      } else {
        const segs = strv(input.segmentos).split(',').map((x) => x.trim()).filter(Boolean);
        if (!segs.length) fail(400, 'Informe ao menos um segmento (ex.: Infantil, Anos Iniciais).');
        await run('INSERT INTO portal_users(codigo,nome,perfil,segmentos,pass_hash,must_change,ativo) VALUES(?,?,?,?,?,1,1)', [codigo, nome, 'COORDENACAO', JSON.stringify(segs), hashPassword(senha)]);
      }
      let acesso = senha;
      let modo: 'senha' | 'codigo' = 'senha';
      if ((await loginMode()) === 'codigo') {
        acesso = await issueAccessCode(tab, codigo);
        await run(`UPDATE ${tab} SET must_change=0 WHERE codigo=?`, [codigo]);
        modo = 'codigo';
      }
      await audit(m.codigo, 'criar-ficha:' + codigo);
      return json({ tipo, codigo, nome, modo, acesso }, 201);
    }
    case path === '/admin/users/role' && method === 'POST': {
      // Muda o perfil de uma ficha da equipe: Gerente (acesso total) ou Equipe. Pode haver mais de uma Gerente.
      const m = await requireManager(c);
      const input = await c.body();
      await stepUp(m, input);
      const cod = upper(input.codigo);
      const role = input.perfil === 'manager' ? 'manager' : 'team';
      const alvo = await q1('SELECT codigo,role FROM users WHERE codigo=?', [cod]);
      if (!alvo) fail(404, 'Ficha não encontrada.');
      if (alvo.role === 'manager' && role === 'team' && Number((await q1("SELECT COUNT(*) c FROM users WHERE role='manager' AND ativo=1"))?.c) <= 1) fail(400, 'Precisa existir ao menos uma Gerente ativa.');
      await run('UPDATE users SET role=?,label=? WHERE codigo=?', [role, role === 'manager' ? 'Gerente de Marketing' : 'Equipe de Marketing', cod]);
      await run('DELETE FROM sessions WHERE codigo=? AND codigo<>?', [cod, m.codigo]); // quem mudou de perfil entra de novo
      await audit(m.codigo, `perfil:${cod}:${role}`);
      return json({ ok: true, perfil: role });
    }
    case path === '/admin/users/code' && method === 'POST': {
      // A Gerente escolhe o código de acesso de uma ficha (4 a 10 letras/números, único).
      const m = await requireManager(c);
      const input = await c.body();
      await stepUp(m, input);
      const tab = tabOf(strv(input.tipo));
      const cod = upper(input.codigo);
      const novo = strv(input.acesso).trim().toUpperCase();
      if (!(await q1(`SELECT 1 FROM ${tab} WHERE codigo=?`, [cod]))) fail(404, 'Ficha não encontrada.');
      if (!validCodeFormat(novo)) fail(400, 'O código deve ter de 4 a 10 letras ou números, sem espaços nem acentos.');
      const h = accessHmac(novo);
      const dono = (await q1('SELECT codigo FROM users WHERE acesso_hmac=?', [h])) ?? (await q1('SELECT codigo FROM portal_users WHERE acesso_hmac=?', [h]));
      if (dono && dono.codigo !== cod) fail(409, 'Esse código já está em uso por outra pessoa. Escolha outro.');
      await run(`UPDATE ${tab} SET acesso_hmac=?,acesso_enc=? WHERE codigo=?`, [h, encryptSecret(novo), cod]);
      if (cod !== m.codigo) {
        await run('DELETE FROM sessions WHERE codigo=?', [cod]);
        await run('DELETE FROM trusted_devices WHERE codigo=?', [cod]);
      }
      await audit(m.codigo, 'codigo-escolhido:' + cod);
      return json({ ok: true, acesso: novo });
    }
    case path === '/admin/users/delete' && method === 'POST': {
      const m = await requireManager(c);
      const input = await c.body();
      await stepUp(m, input);
      const tipo = strv(input.tipo);
      const tab = tabOf(tipo);
      const cod = upper(input.codigo);
      const alvo = await q1(`SELECT codigo${tipo === 'interno' ? ',role' : ''} FROM ${tab} WHERE codigo=?`, [cod]);
      if (!alvo) fail(404, 'Ficha não encontrada.');
      if (tipo === 'interno' && cod === m.codigo) fail(400, 'Você não pode excluir a própria ficha.');
      if (tipo === 'interno' && alvo.role === 'manager' && Number((await q1("SELECT COUNT(*) c FROM users WHERE role='manager' AND ativo=1"))?.c) <= 1) fail(400, 'Não é possível excluir a única Gerente ativa.');
      await run(`DELETE FROM ${tab} WHERE codigo=?`, [cod]);
      await run('DELETE FROM sessions WHERE codigo=?', [cod]);
      await run('DELETE FROM trusted_devices WHERE codigo=?', [cod]);
      await audit(m.codigo, 'excluir-ficha:' + cod);
      return json({ ok: true });
    }
    case path === '/auth/mode':
      return json({ modo: await loginMode() });
    case path === '/admin/mode' && method === 'POST': {
      const m = await requireManager(c);
      const input = await c.body();
      const novo = input.modo === 'codigo' ? 'codigo' : input.modo === 'senha' ? 'senha' : fail(400, 'Modo inválido.');
      const codes: Row[] = [];
      if (novo === 'codigo') {
        // quem já tem código (gerado ou escolhido pela Gerente) mantém; só quem não tem recebe um novo
        for (const r of await q('SELECT codigo,nome,acesso_enc FROM users WHERE ativo=1 ORDER BY codigo'))
          codes.push({ tipo: 'interno', codigo: r.codigo, nome: r.nome, acesso: r.acesso_enc ? decryptSecret(r.acesso_enc) : await issueAccessCode('users', r.codigo, r.codigo !== m.codigo) });
        for (const r of await q('SELECT codigo,nome,acesso_enc FROM portal_users WHERE ativo=1 ORDER BY codigo'))
          codes.push({ tipo: 'portal', codigo: r.codigo, nome: r.nome, acesso: r.acesso_enc ? decryptSecret(r.acesso_enc) : await issueAccessCode('portal_users', r.codigo) });
        await run('UPDATE users SET must_change=0 WHERE role<>?', ['manager']);
        await run('DELETE FROM sessions WHERE codigo<>?', [m.codigo]);
      }
      await setSetting('login_modo', novo);
      await audit(m.codigo, 'modo-acesso:' + novo);
      return json({ modo: novo, codigos: codes });
    }
    case path === '/admin/codes' && method === 'POST': {
      const m = await requireManager(c);
      const out: Row[] = [];
      for (const [tab, tipo] of [['users', 'interno'], ['portal_users', 'portal']] as const)
        for (const r of await q(`SELECT codigo,nome,acesso_enc FROM ${tab} WHERE ativo=1 ORDER BY codigo`))
          out.push({ tipo, codigo: r.codigo, nome: r.nome, acesso: r.acesso_enc ? decryptSecret(r.acesso_enc) : '' });
      await audit(m.codigo, 'ver-codigos');
      return json({ modo: await loginMode(), codigos: out });
    }
    case path === '/admin/import' && method === 'POST': {
      // Importa planilhas EVO_MKT_<MODULO>.xlsx (sistema antigo). Não sobrescreve nada: IDs já usados são ignorados.
      const m = await requireManager(c);
      const form = await c.req.formData();
      await stepUp(m, { senhaAdmin: form.get('senhaAdmin') ?? undefined });
      const res: Row = {};
      for (const f of form.getAll('files')) {
        if (typeof f === 'string') continue;
        const mod = f.name.match(/^EVO_MKT_([A-Z]+)\.xlsx$/i)?.[1].toLowerCase() ?? '';
        if (!(mod in MODULES)) { res[f.name] = 'ignorado (nome fora do padrão EVO_MKT_MODULO.xlsx)'; continue; }
        try { res[mod] = await importModule(mod, new Uint8Array(await f.arrayBuffer()), m.codigo); } catch (e: any) { res[f.name] = 'erro: ' + e.message; }
      }
      return json({ importados: res });
    }
    case path === '/admin/seed-equipe' && method === 'POST': {
      const m = await requireManager(c);
      return json({ criados: await seedEquipe(m.codigo) });
    }
    case path === '/auth/forgot' && method === 'POST': {
      const input = await c.body();
      const cod = upper(input.codigo);
      const tab = input.tipo === 'portal' ? 'portal_users' : 'users';
      await rateCheck('forgot|' + c.ip, 10);
      await rateFail('forgot|' + c.ip);
      const u = cod ? await q1(`SELECT nome FROM ${tab} WHERE codigo=? AND ativo=1`, [cod]) : undefined;
      if (u) {
        await audit(cod, 'esqueci-senha');
        await notifyMail('Pedido de redefinição de senha', `${u.nome} (${cod}) pediu a redefinição da senha.\nEntre em Administração → Acessos e gere uma senha temporária.`);
      }
      return json({ ok: true, mensagem: 'Se o código existir, a Gerente foi avisada e vai gerar uma senha temporária para você.' });
    }
    case path === '/admin/audit': {
      await requireManager(c);
      const lim = Math.min(500, Math.max(10, parseInt(c.qs('limit'), 10) || 100));
      return json(await q('SELECT quando,ator,acao,modulo,registro,ip FROM audit_log ORDER BY id DESC LIMIT ' + lim));
    }
    case path === '/manager/notices/remove' && method === 'POST': {
      const u = await requireManager(c);
      const id = strv((await c.body()).id);
      await run('DELETE FROM notices WHERE id=?', [id]);
      await audit(u.codigo, 'aviso-removido', '', id);
      return json({ ok: true });
    }
    case path === '/portal/notices': {
      const u = await requirePortal(c);
      const o: Row[] = [];
      for (const r of await q('SELECT data FROM notices')) {
        const n = JSON.parse(r.data);
        if (!n.ativo) continue;
        const segs: string[] = n.segmentos ?? [];
        let ok = !segs.length;
        for (const s of segs) if (s === '*' || allowedSegment(u, String(s))) ok = true;
        if (ok) o.push(n);
      }
      o.sort((a, b) => String(b.criadoEm ?? '').localeCompare(String(a.criadoEm ?? '')));
      return json({ rows: o });
    }
    case path === '/manager/notices': {
      const u = await requireManager(c);
      if (method === 'GET') return json({ rows: (await q('SELECT data FROM notices')).map((r) => JSON.parse(r.data)) });
      const input = cleanInput(await c.body());
      const id = input.id ?? 'AVI-' + randHex(6);
      const n = {
        id, titulo: input.titulo ?? '', mensagem: input.mensagem ?? '',
        segmentos: String(input.segmentos ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        ativo: (input.ativo ?? 'true') !== 'false', criadoEm: now(),
      };
      if (!n.titulo.trim()) fail(400, 'Informe o título do aviso.');
      await run('DELETE FROM notices WHERE id=?', [id]);
      await run('INSERT INTO notices(id,data) VALUES(?,?)', [id, JSON.stringify(n)]);
      await audit(u.codigo, 'aviso', '', id);
      return json(n);
    }
    case path === '/portal/requests': {
      const u = await requirePortal(c);
      if (method === 'GET') return json({ rows: (await listRows('solicitacoes')).filter((r) => allowedSegment(u, r.segmento ?? '')).map(publicRow) });
      if (method !== 'POST') fail(405, 'Método não permitido.');
      const input = await c.body();
      const seg = strv(input.segmento);
      if (!allowedSegment(u, seg)) fail(403, 'Segmento não autorizado.');
      if (!strv(input.titulo).trim() || !strv(input.objetivo).trim()) fail(400, 'Título e objetivo são obrigatórios.');
      if (strv(input.prioridade).toUpperCase() === 'URGENTE' && !strv(input.motivoUrgencia).trim()) fail(400, 'Motivo da urgência é obrigatório.');
      const row: Row = {
        titulo: strv(input.titulo), status: 'AGUARDANDO TRIAGEM', prioridade: strv(input.prioridade), segmento: seg, prazo: strv(input.prazo),
        descricao: strv(input.objetivo), origem: 'PORTAL_SOLICITANTE', solicitante: u.nome, coordenacao: u.nome, triagemStatus: 'AGUARDANDO TRIAGEM', gerenteTriagem: 'Gerente de Marketing',
      };
      for (const k of CREATE_FIELDS) if (k in input) row[k] = strv(input[k]);
      if (row.dataPublicacao && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.dataPublicacao))) fail(400, 'Data de publicação inválida.');
      if (String(row.solicitanteNome ?? '').trim()) row.solicitante = row.solicitanteNome;
      if (!row.aprovacaoSolicitante) row.aprovacaoSolicitante = 'PENDENTE';
      const novo = await insertRow('solicitacoes', row, 'portal:' + u.codigo);
      await notifyMail('Nova demanda: ' + novo.titulo, `Solicitante: ${novo.solicitante}\nSegmento: ${novo.segmento}\nPrioridade: ${novo.prioridade}\nPrazo desejado: ${novo.prazo}\nID: ${novo.id}`);
      return json(publicRow(novo), 201);
    }
    case path === '/portal/upload' && method === 'POST': {
      const u = await requirePortal(c);
      const id = c.qs('id');
      const row = (await getRow('solicitacoes', id)) ?? fail(404, 'Demanda não encontrada.');
      if (!allowedSegment(u, row.segmento ?? '')) fail(403, 'Demanda de outro segmento.');
      const saved = await saveUploads(c, id, '');
      await modifyRow('solicitacoes', id, (r) => {
        const cur = String(r.anexos ?? '').split('|').map((s) => s.trim()).filter(Boolean);
        return { ...r, anexos: [...cur, ...saved].join(' | '), atualizadoEm: now() };
      });
      await audit('portal:' + u.codigo, 'upload', 'solicitacoes', id);
      return json({ files: saved });
    }
    case path === '/portal/file': {
      const u = await requirePortal(c);
      return serveFile(c.qs('path'), u);
    }
    default:
      return fail(404, 'Rota não encontrada.');
  }
}

/** Recuperação de emergência de uma ficha da equipe (esqueceu o acesso). Exige RECOVERY_KEY no painel: cadastre, use e REMOVA. */
async function recoverRoute(c: Ctx): Promise<Response> {
  const text = (t: string, status = 200) => new Response(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  const key = env('RECOVERY_KEY');
  if (key.length < 16) return text('RECOVERY_KEY não configurada (mínimo 16 caracteres).\n', 503);
  await rateCheck('recover|' + c.ip, 10);
  const a = Buffer.from(c.qs('key')), b = Buffer.from(key);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await rateFail('recover|' + c.ip);
    await new Promise((r) => setTimeout(r, 1500));
    return text('Chave inválida.\n', 403);
  }
  const cod = upper(c.qs('codigo'));
  const u = await q1('SELECT codigo,nome,role FROM users WHERE codigo=?', [cod]);
  if (!u) return text('Ficha não encontrada: ' + cod + '\n', 404);
  if (c.qs('perfil') === 'manager' && u.role !== 'manager') {
    await run("UPDATE users SET role='manager',label='Gerente de Marketing' WHERE codigo=?", [cod]);
  }
  await run('UPDATE users SET ativo=1 WHERE codigo=?', [cod]);
  await run('DELETE FROM login_attempts');
  let msg: string;
  if ((await loginMode()) === 'codigo') {
    msg = `Novo código de acesso de ${u.nome} (${cod}): ${await issueAccessCode('users', cod)}`;
  } else {
    const p = genPassword();
    await run('UPDATE users SET pass_hash=?,must_change=1 WHERE codigo=?', [hashPassword(p), cod]);
    await run('DELETE FROM sessions WHERE codigo=?', [cod]);
    msg = `Senha temporária de ${u.nome} (${cod}): ${p}`;
  }
  await audit('recuperacao', 'recover:' + cod, '', c.qs('perfil'));
  return text(`${msg}\n\nAgora REMOVA a variável RECOVERY_KEY do painel da Hostinger e reimplante.\n`);
}

/** Instalação única: cria as contas com senhas temporárias e mostra UMA vez. Protegida por SETUP_KEY; trava depois de usada. */
async function setupRoute(c: Ctx): Promise<Response> {
  const text = (t: string, status = 200) => new Response(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  const key = env('SETUP_KEY');
  const given = c.qs('key');
  if (!key || key.length < 16) return text('SETUP_KEY não configurada (mínimo 16 caracteres).\n', 503);
  const a = Buffer.from(given), b = Buffer.from(key);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 1500));
    return text('Chave inválida.\n', 403);
  }
  if (await q1("SELECT 1 FROM app_meta WHERE k='setup_done'")) return text('Já instalado. Remova a variável SETUP_KEY do painel.\n', 409);
  const pw: string[] = [];
  const internos = [['NAT-3301', 'Natália Mello', 'manager', 'Gerente de Marketing'], ['ANT-3302', 'Antônio Filho', 'team', 'Equipe de Marketing'], ['MON-3303', 'Monique Vilante', 'team', 'Equipe de Marketing'], ['ALU-3304', 'Aluizo Junior', 'team', 'Equipe de Marketing'], ['EDU-3305', 'Maria Eduarda', 'team', 'Equipe de Marketing']];
  for (const [cod, nome, role, label] of internos) {
    if (await q1('SELECT 1 FROM users WHERE codigo=?', [cod])) continue;
    const p = genPassword();
    await run('INSERT INTO users(codigo,nome,role,label,pass_hash,must_change,ativo) VALUES(?,?,?,?,?,1,1)', [cod, nome, role, label, hashPassword(p)]);
    pw.push(` - interno ${cod} (${nome}): ${p}`);
  }
  const portal: [string, string, string, string[]][] = [['INF-2601', 'Coordenação Infantil', 'COORDENACAO', ['Infantil']], ['INI-2602', 'Coordenação Anos Iniciais', 'COORDENACAO', ['Anos Iniciais']], ['FIN-2603', 'Coordenação Anos Finais', 'COORDENACAO', ['Anos Finais']], ['MED-2604', 'Coordenação Ensino Médio', 'COORDENACAO', ['Ensino Médio']], ['AUZ-2605', 'Auzilair', 'COORDENACAO_ATENDIMENTO_GRAFICA', ['Infantil', 'Gráfica Infantil']]];
  for (const [cod, nome, perfil, segs] of portal) {
    if (await q1('SELECT 1 FROM portal_users WHERE codigo=?', [cod])) continue;
    const p = genPassword();
    await run('INSERT INTO portal_users(codigo,nome,perfil,segmentos,pass_hash,must_change,ativo) VALUES(?,?,?,?,?,1,1)', [cod, nome, perfil, JSON.stringify(segs), hashPassword(p)]);
    pw.push(` - portal ${cod} (${nome}): ${p}`);
  }
  const fichas = await seedEquipe('instalador');
  await run("INSERT INTO app_meta(k,v) VALUES('setup_done',?)", [now()]);
  return text(`INSTALAÇÃO CONCLUÍDA\n\nSenhas temporárias (anote AGORA; não serão exibidas de novo; troque no primeiro acesso):\n${pw.join('\n')}\n\nFichas de Equipe criadas: ${fichas}.\n\nAgora remova a variável SETUP_KEY do painel da Hostinger e reinicie o app.\n`);
}

function tabOf(tipo: string): 'users' | 'portal_users' {
  if (tipo === 'portal') return 'portal_users';
  if (tipo === 'interno') return 'users';
  return fail(400, 'Tipo inválido.');
}

async function checkCsrfOrPortal(c: Ctx): Promise<void> {
  // Rotas públicas de login e chamadas do Portal (token em cabeçalho) não dependem de cookie.
  if (['/auth/login', '/portal/login', '/auth/forgot'].includes(c.path) || c.path.startsWith('/cron/')) return;
  if (c.path === '/public/approval' && !c.header('cookie')) return; // resposta pelo link: sem cookie, o token é a credencial
  if (c.header('x-portal-token') && (await portalUser(c)) !== null && (await internalUser(c)) === null) return;
  checkCsrf(c);
}

async function pediuReset(cod: string): Promise<boolean> {
  const a = (await q1("SELECT MAX(id) m FROM audit_log WHERE ator=? AND acao='esqueci-senha'", [cod]))?.m ?? null;
  if (!a) return false;
  const b = (await q1('SELECT MAX(id) m FROM audit_log WHERE acao=?', ['reset-senha:' + cod]))?.m ?? null;
  return !b || Number(a) > Number(b);
}

async function dataRoute(c: Ctx): Promise<Response> {
  const { method } = c;
  const mod = c.qs('module');
  const id = c.qs('id');
  const portal = await portalUser(c);
  if (portal && !(await internalUser(c))) return portalRestrictedUpdate(c, portal, mod, id);
  const u = await requireInternal(c);
  if (!(mod in MODULES)) fail(404, 'Módulo desconhecido.');
  if (mod === 'configuracoes' && u.role !== 'manager') fail(403, 'Configurações são restritas à Gerente.');
  if (method === 'GET') {
    if (id) return json((await getRow(mod, id)) ?? fail(404, 'Registro não encontrado.'));
    return json({ headers: await headersOf(mod), rows: await listRows(mod) });
  }
  if (u.role !== 'manager' && !TEAM_WRITE.includes(mod) && mod !== 'lixeira') fail(403, 'Seu perfil não pode alterar este módulo.');
  if (u.role !== 'manager' && mod === 'lixeira' && method === 'DELETE') fail(403, 'Exclusão permanente apenas para a Gerente.');
  await autoBackupIfDue();
  if (method === 'POST') {
    const novo = await insertRow(mod, await c.body(), u.codigo);
    await notifyAssignment(mod, novo, null, u.nome);
    return json(novo, 201);
  }
  if (!id) fail(400, 'Informe o id.');
  if (method === 'PUT') {
    const patch = await c.body();
    const antes = (await getRow(mod, id)) ?? fail(404, 'Registro não encontrado.');
    if (u.role !== 'manager' && 'responsavel' in patch) {
      const dono = String(antes.responsavel ?? '').trim();
      const novoResp = strv(patch.responsavel).trim();
      if (dono && lower(dono) !== lower(u.nome) && novoResp !== dono) fail(403, 'Só a Gerente ou o responsável atual pode reatribuir este item.');
    }
    const dep = await updateRow(mod, id, patch, u.codigo);
    await notifyAssignment(mod, dep, antes, u.nome);
    return json(dep);
  }
  if (method === 'DELETE') {
    const alvo = (await getRow(mod, id)) ?? fail(404, 'Registro não encontrado.');
    if (!teamMayDelete(u, alvo)) fail(403, 'Você só pode excluir itens criados por você ou atribuídos a você.');
    if (mod === 'lixeira') await makeBackup('preexclusao');
    await trashRow(mod, id, u.codigo);
    return json({ ok: true });
  }
  return fail(405, 'Método não permitido.');
}

async function portalRestrictedUpdate(c: Ctx, u: Row, mod: string, id: string): Promise<Response> {
  if (c.method !== 'PUT') fail(403, 'Operação não permitida ao Portal.');
  if (mod !== 'solicitacoes') fail(403, 'Módulo não permitido.');
  const input = await c.body();
  const antes = (await getRow('solicitacoes', id)) ?? fail(404, 'Demanda não encontrada.');
  if (!allowedSegment(u, antes.segmento ?? '')) fail(403, 'Demanda de outro segmento.');
  const ator = 'portal:' + u.codigo;
  // Tudo dentro de UMA transação com trava: o status, o histórico e os campos mudam juntos.
  const row = await modifyRow('solicitacoes', id, async (cur0, conn) => {
    const row: Row = { ...cur0 };
    const cur = `${row.status ?? ''} ${row.triagemStatus ?? ''}`.toLocaleUpperCase('pt-BR');
    const nota = strv(input.avaliacaoNota).trim();
    if (nota) {
      if (!cur.includes('CONCLUÍDA')) fail(409, 'A avaliação só pode ser enviada após a conclusão.');
      if (!/^\d+$/.test(nota) || +nota < 1 || +nota > 5) fail(400, 'Avaliação deve estar entre 1 e 5.');
    }
    const nps = strv(input.npsNota).trim();
    if (nps) {
      if (!cur.includes('CONCLUÍDA')) fail(409, 'A pesquisa só pode ser respondida após a conclusão.');
      if (!/^\d+$/.test(nps) || +nps > 10) fail(400, 'A nota da pesquisa deve estar entre 0 e 10.');
      if (cur0.npsNota !== undefined && String(cur0.npsNota) !== '') fail(409, 'A pesquisa já foi respondida.');
    }
    for (const k of UPDATE_FIELDS) if (k in input) row[k] = strv(input[k]);
    const ap = String(row.aprovacaoSolicitante ?? '').trim().toLocaleUpperCase('pt-BR');
    const t = now();
    const traz = (k: string) => k in input; // só avalia transições quando o pedido traz o campo
    const de = String(cur0.status ?? '');
    let para = '';
    let motivo = '';
    if (traz('aprovacaoSolicitante') && ap === 'APROVADO') {
      if (!cur.includes('AGUARDANDO APROVAÇÃO')) fail(409, 'Esta demanda não está aguardando aprovação.');
      para = 'CONCLUÍDA'; motivo = 'Entrega aprovada pelo solicitante';
      row.triagemStatus = 'CONCLUÍDA';
      if (!row.aprovadoSolicitanteEm) row.aprovadoSolicitanteEm = t;
    } else if (traz('aprovacaoSolicitante') && ap === 'AJUSTES SOLICITADOS') {
      if (!cur.includes('AGUARDANDO APROVAÇÃO')) fail(409, 'Esta demanda não está aguardando aprovação.');
      para = 'EM EXECUÇÃO'; motivo = 'Ajustes solicitados pelo solicitante' + (strv(input.respostaSolicitante).trim() ? ': ' + strv(input.respostaSolicitante).trim().slice(0, 300) : '');
      row.triagemStatus = 'DISTRIBUÍDA';
      if (!row.respondidoSolicitanteEm) row.respondidoSolicitanteEm = t;
    } else if (traz('respostaSolicitante') && String(row.respostaSolicitante ?? '').trim()) {
      if (!(cur.includes('AGUARDANDO SOLICITANTE') || cur.includes('DEVOLVIDA PARA AJUSTES'))) fail(409, 'Esta demanda não está aguardando resposta.');
      para = 'EM ANÁLISE'; motivo = 'Solicitante respondeu ao pedido de complementação';
      row.triagemStatus = 'EM TRIAGEM';
      if (!row.respondidoSolicitanteEm) row.respondidoSolicitanteEm = t;
    }
    if (para) {
      // a mesma regra única de transições vale para o Portal (retornos feitos pelo Portal têm motivo automático)
      validarTransicaoSolicitacao(para === 'EM ANÁLISE' ? 'AGUARDANDO SOLICITANTE' : 'AGUARDANDO APROVAÇÃO DO SOLICITANTE', para, motivo, true);
      row.status = para;
      await logStatus(conn, 'solicitacoes', id, de, para, ator, motivo);
    }
    row.atualizadoEm = t;
    return row;
  });
  const ap = String(row.aprovacaoSolicitante ?? '').trim().toLocaleUpperCase('pt-BR');
  await audit(ator, 'editar', 'solicitacoes', id);
  if (String(row.status ?? '') !== String(antes.status ?? '')) await registrarNotificacao('resposta_solicitante', 'gerencia', 'Resposta do solicitante', `"${row.titulo ?? id}" teve retorno do solicitante (${row.status}).`, 'solicitacoes', id);
  if ('aprovacaoSolicitante' in input && (ap === 'APROVADO' || ap === 'AJUSTES SOLICITADOS'))
    await notifyMail(`Demanda ${ap === 'APROVADO' ? 'aprovada' : 'com ajustes solicitados'}: ${row.titulo ?? id}`, `ID: ${id} · Segmento: ${row.segmento ?? ''}`);
  return json({ ok: true });
}

export { HttpError, ALLOWED_EXT, EVO_VERSION, intLog, setting };
