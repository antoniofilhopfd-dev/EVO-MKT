import { gCalendarSyncLogo, GCAL_MODULES } from '../integrations/google';
import { registrarNotificacao } from '../notificacoes';
import { timingSafeEqual } from 'node:crypto';
import { Ctx, setCookie } from '../ctx';
import { q, q1, run } from '../db';
import { genPassword, hashPassword, randHex, sha256, strongPassword, verifyPassword } from '../crypto';
import {
  checkCsrf, codeLoginFail, codeLoginGuard, issueAccessCode, loginMode, rateCheck,
  rateFail, registerDevice, requireAdmin, requireInternal, sessionTokenFromCookie, setSessionCookie, startSession, stepUp, validCodeFormat,
} from '../auth';
import { accessHmac, decryptSecret, encryptSecret } from '../crypto';
import { notifyMail } from '../mail';
import {
  ALLOWED_EXT, audit, notifyAssignment, deleteRow, emailForPerson, EVO_VERSION, getRow, headersOf, insertRow, listRows, logStatus, modifyRow, MODULES,
  saveRow, TEAM_WRITE, teamMayDelete, updateRow,
} from '../records';
import { serveFile } from '../files';
import { intLog, setSetting, setting } from '../settings';
import { cleanInput, env, fail, HttpError, lower, now, Row, strv } from '../util';
import { integrationsRoute } from './integrations';
import { cronRoute } from './cron';
import { operacaoRoute } from './operacao';
import { desempenhoRoute } from './desempenho';
import { sistemaRoute } from './sistema';
import { comentariosRoute } from './comentarios';
import { conteudoRoute } from './conteudo';
import { calendarioPublicoRoute } from './calendarioPublico';
import { trafegoRoute } from './trafego';
import { escolarRoute } from './escolar';
import { datacomRoute } from './datacom';
import { dashboardRoute } from './dashboard';
import { lgpdRoute } from './lgpd';
import { prefsRoute } from './prefs';
import { autoBackupIfDue, backupLog, makeBackup, restoreBackup, validateBackup } from '../backup';

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

type Out = Response;
const asUser = (u: Row) => ({ code: u.codigo, name: u.nome, role: u.role, label: u.label, admin: u.role === 'manager' && !!Number(u.admin), perfil: u.role !== 'manager' ? 'Equipe' : Number(u.admin) ? 'Administrador' : 'Gerente' });
/** Perfis internos: 'admin' (Administrador), 'manager' (Gerente), 'team' (Equipe). */
const nivelDe = (r: Row) => (r.role !== 'manager' ? 'team' : Number(r.admin) ? 'admin' : 'manager');
const nivelEntrada = (v: unknown) => (v === 'admin' ? 'admin' : 'team');
const LABEL_NIVEL: Record<string, string> = { admin: 'Administrador', manager: 'Gerente de Marketing', team: 'Equipe de Marketing' };
const adminsAtivos = async () => Number((await q1("SELECT COUNT(*) c FROM users WHERE role='manager' AND admin=1 AND ativo=1"))?.c);
const upper = (v: unknown) => strv(v).trim().toUpperCase();

export async function route(c: Ctx): Promise<Out> {
  const { method, path } = c;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') await checarCsrf(c);

  switch (true) {
    case path === '/manager/calendario-link' || path === '/public/calendario':
      return calendarioPublicoRoute(c);
    case path.startsWith('/ads/') || path.startsWith('/trafego/'):
      return trafegoRoute(c);
    case path.startsWith('/escolar/'):
      return escolarRoute(c);
    case path.startsWith('/datacom/'):
      return datacomRoute(c);
    case path.startsWith('/admin/lgpd/'):
      return lgpdRoute(c);
    case path === '/prefs':
      return prefsRoute(c);
    case path.startsWith('/dashboard/'):
      return dashboardRoute(c);
    case path.startsWith('/content/'):
      return conteudoRoute(c);
    case path === '/comments' || path === '/checklist':
      return comentariosRoute(c);
    case path === '/ia/estado' || path === '/ia/variacoes' || ['/admin/users/email', '/admin/migracao', '/admin/arquivos-sem-vinculo', '/admin/arquivos-sem-vinculo/excluir'].includes(path):
      return sistemaRoute(c);
    case ['/instagram/visao', '/instagram/geral', '/instagram/ranking', '/instagram/ranking-contas', '/instagram/mensal', '/instagram/desempenho', '/instagram/impulsionados', '/instagram/vinculo'].includes(path):
      return desempenhoRoute(c);
    case ['/notificacoes', '/notificacoes/lida', '/timeline', '/insights', '/admin/integridade', '/datas', '/studio/hashtags', '/studio/modelos', '/team'].includes(path) || path.startsWith('/instagram/'):
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
      const m = await requireAdmin(c);
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
    case path === '/data': {
      const resp = await dataRoute(c);
      // cada mudança no calendário (e nos itens que vão para a Agenda do Google) dispara a sincronização em segundo plano
      if (method !== 'GET' && resp.status < 300 && GCAL_MODULES.includes(c.qs('module'))) gCalendarSyncLogo();
      return resp;
    }
    case path === '/search': {
      const u = await requireInternal(c);
      const term = lower(c.qs('q'));
      if (!term) return json([]);
      const res: Row[] = [];
      outer: for (const m of Object.keys(MODULES)) {
        if (m === 'configuracoes' && !Number(u.admin)) continue;
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
      const u = await requireAdmin(c);
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
      await requireAdmin(c);
      return json(await validateBackup(c.qs('file')));
    }
    case path === '/backup/restore' && method === 'POST': {
      // Restaura um backup (valida, guarda um backup de segurança antes e aplica tudo em uma transação).
      const u = await requireAdmin(c);
      const input = await c.body();
      return json({ ok: true, ...(await restoreBackup(strv(input.file), u.codigo)) });
    }
    case path === '/backup/log': {
      await requireAdmin(c);
      return json(await backupLog(30));
    }
    case path === '/backup/list': {
      await requireAdmin(c);
      return json((await q('SELECT nome FROM backups ORDER BY nome DESC')).map((r) => r.nome));
    }
    case path === '/backup/download': {
      await requireAdmin(c);
      const f = c.qs('file').split('/').pop() || '';
      if (!/^evo_backup_[0-9]{8}_[0-9]{6}_[A-Za-z0-9]+\.json\.gz$/.test(f)) fail(400, 'Arquivo inválido.');
      const r = await q1('SELECT conteudo FROM backups WHERE nome=?', [f]);
      if (!r) fail(404, 'Não encontrado.');
      return new Response(new Uint8Array(r.conteudo as Buffer), { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${f}"`, 'Cache-Control': 'no-store' } });
    }
    case path === '/file': {
      await requireInternal(c);
      return serveFile(c.qs('path')); // anexos das publicações (prévia no Estúdio)
    }

    // ---------- Integrações (Instagram / Google) ----------
    case path.startsWith('/integrations/') || path === '/public/media':
      return integrationsRoute(c);

    case path === '/admin/users': {
      await requireAdmin(c);
      const o: Row[] = [];
      for (const r of await q('SELECT codigo,nome,role,label,admin,ativo,must_change,acesso_enc FROM users ORDER BY codigo'))
        o.push({ tipo: 'interno', codigo: r.codigo, nome: r.nome, role: r.role, nivel: nivelDe(r), perfil: r.label, ativo: !!r.ativo, trocarSenha: !!r.must_change, pediuReset: await pediuReset(r.codigo), email: await emailForPerson(r.nome), acesso: r.acesso_enc ? decryptSecret(r.acesso_enc) : '' });
      return json(o);
    }
    case path === '/admin/user-active' && method === 'POST': {
      const m = await requireAdmin(c);
      const input = await c.body();
      await stepUp(m, input);
      const tipo = strv(input.tipo);
      const tab = tabOf(tipo);
      const cod = upper(input.codigo);
      const on = input.ativo ? 1 : 0;
      if (tipo === 'interno' && cod === m.codigo && !on) fail(400, 'Você não pode desativar o próprio acesso.');
      if (tipo === 'interno' && !on) {
        const alvoU = await q1('SELECT role,admin FROM users WHERE codigo=?', [cod]);
        if (alvoU && nivelDe(alvoU) === 'admin' && (await adminsAtivos()) <= 1) fail(400, 'Precisa existir ao menos um Administrador ativo.');
      }
      if (!(await q1(`SELECT 1 FROM ${tab} WHERE codigo=?`, [cod]))) fail(404, 'Usuário não encontrado.');
      await run(`UPDATE ${tab} SET ativo=? WHERE codigo=?`, [on, cod]);
      if (!on) await run('DELETE FROM sessions WHERE codigo=?', [cod]);
      await audit(m.codigo, (on ? 'ativar:' : 'desativar:') + cod);
      return json({ ok: true });
    }
    case path === '/admin/users/create' && method === 'POST': {
      const m = await requireAdmin(c);
      const input = await c.body();
      await stepUp(m, input);
      const tipo = strv(input.tipo);
      const tab = tabOf(tipo);
      const nome = strv(input.nome).trim().slice(0, 120);
      if (nome.length < 2) fail(400, 'Informe o nome.');
      const sigla = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase().padEnd(3, 'X').slice(0, 3);
      // ficha: 3 letras do nome + número sequencial da série (equipe 33xx), nunca repetido
      const base = tipo === 'interno' ? 3300 : 2600;
      const used = (await q(`SELECT codigo FROM ${tab}`)).map((r) => parseInt(String(r.codigo).split('-')[1], 10) || 0);
      let n = Math.max(base, ...used) + 1;
      let codigo = `${sigla}-${n}`;
      while (await q1('SELECT 1 FROM users WHERE codigo=?', [codigo])) codigo = `${sigla}-${++n}`;
      const senha = genPassword();
      if (tipo === 'interno') {
        const nivel = nivelEntrada(input.perfil);
        await run('INSERT INTO users(codigo,nome,role,label,admin,pass_hash,must_change,ativo) VALUES(?,?,?,?,?,?,1,1)', [codigo, nome, nivel === 'team' ? 'team' : 'manager', LABEL_NIVEL[nivel], nivel === 'admin' ? 1 : 0, hashPassword(senha)]);
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
      // Muda o perfil de uma ficha da equipe: Administrador, Gerente ou Equipe. Sempre precisa existir ao menos um Administrador ativo.
      const m = await requireAdmin(c);
      const input = await c.body();
      await stepUp(m, input);
      const cod = upper(input.codigo);
      const nivel = nivelEntrada(input.perfil);
      const alvo = await q1('SELECT codigo,role,admin FROM users WHERE codigo=?', [cod]);
      if (!alvo) fail(404, 'Ficha não encontrada.');
      if (nivelDe(alvo) === 'admin' && nivel !== 'admin' && (await adminsAtivos()) <= 1) fail(400, 'Precisa existir ao menos um Administrador ativo.');
      await run('UPDATE users SET role=?,label=?,admin=? WHERE codigo=?', [nivel === 'team' ? 'team' : 'manager', LABEL_NIVEL[nivel], nivel === 'admin' ? 1 : 0, cod]);
      await run('DELETE FROM sessions WHERE codigo=? AND codigo<>?', [cod, m.codigo]); // quem mudou de perfil entra de novo
      await audit(m.codigo, `perfil:${cod}:${nivel}`);
      return json({ ok: true, perfil: nivel });
    }
    case path === '/admin/users/code' && method === 'POST': {
      // A Gerente escolhe o código de acesso de uma ficha (4 a 10 letras/números, único).
      const m = await requireAdmin(c);
      const input = await c.body();
      await stepUp(m, input);
      const tab = tabOf(strv(input.tipo));
      const cod = upper(input.codigo);
      const novo = strv(input.acesso).trim().toUpperCase();
      if (!(await q1(`SELECT 1 FROM ${tab} WHERE codigo=?`, [cod]))) fail(404, 'Ficha não encontrada.');
      if (!validCodeFormat(novo)) fail(400, 'O código deve ter de 4 a 10 letras ou números, sem espaços nem acentos.');
      const h = accessHmac(novo);
      const dono = await q1('SELECT codigo FROM users WHERE acesso_hmac=?', [h]);
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
      const m = await requireAdmin(c);
      const input = await c.body();
      await stepUp(m, input);
      const tipo = strv(input.tipo);
      const tab = tabOf(tipo);
      const cod = upper(input.codigo);
      const alvo = await q1(`SELECT * FROM ${tab} WHERE codigo=?`, [cod]);
      if (!alvo) fail(404, 'Ficha não encontrada.');
      if (tipo === 'interno' && cod === m.codigo) fail(400, 'Você não pode excluir a própria ficha.');
      if (tipo === 'interno' && nivelDe(alvo) === 'admin' && (await adminsAtivos()) <= 1) fail(400, 'Não é possível excluir o único Administrador ativo.');
      await run(`DELETE FROM ${tab} WHERE codigo=?`, [cod]);
      await run('DELETE FROM sessions WHERE codigo=?', [cod]);
      await run('DELETE FROM trusted_devices WHERE codigo=?', [cod]);
      await audit(m.codigo, 'excluir-ficha:' + cod);
      return json({ ok: true });
    }
    case path === '/auth/mode':
      return json({ modo: await loginMode() });
    case path === '/admin/mode' && method === 'POST': {
      const m = await requireAdmin(c);
      const input = await c.body();
      const novo = input.modo === 'codigo' ? 'codigo' : input.modo === 'senha' ? 'senha' : fail(400, 'Modo inválido.');
      const codes: Row[] = [];
      if (novo === 'codigo') {
        // quem já tem código (gerado ou escolhido pela Gerente) mantém; só quem não tem recebe um novo
        for (const r of await q('SELECT codigo,nome,acesso_enc FROM users WHERE ativo=1 ORDER BY codigo'))
          codes.push({ tipo: 'interno', codigo: r.codigo, nome: r.nome, acesso: r.acesso_enc ? decryptSecret(r.acesso_enc) : await issueAccessCode('users', r.codigo, r.codigo !== m.codigo) });
        await run('UPDATE users SET must_change=0 WHERE role<>?', ['manager']);
        await run('DELETE FROM sessions WHERE codigo<>?', [m.codigo]);
      }
      await setSetting('login_modo', novo);
      await audit(m.codigo, 'modo-acesso:' + novo);
      return json({ modo: novo, codigos: codes });
    }
    case path === '/admin/codes' && method === 'POST': {
      const m = await requireAdmin(c);
      const out: Row[] = [];
      for (const [tab, tipo] of [['users', 'interno']] as const)
        for (const r of await q(`SELECT codigo,nome,acesso_enc FROM ${tab} WHERE ativo=1 ORDER BY codigo`))
          out.push({ tipo, codigo: r.codigo, nome: r.nome, acesso: r.acesso_enc ? decryptSecret(r.acesso_enc) : '' });
      await audit(m.codigo, 'ver-codigos');
      return json({ modo: await loginMode(), codigos: out });
    }
    case path === '/auth/forgot' && method === 'POST': {
      const input = await c.body();
      const cod = upper(input.codigo);
      const tab = 'users';
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
      await requireAdmin(c);
      const lim = Math.min(500, Math.max(10, parseInt(c.qs('limit'), 10) || 100));
      return json(await q('SELECT quando,ator,acao,modulo,registro,ip FROM audit_log ORDER BY id DESC LIMIT ' + lim));
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
    await run("UPDATE users SET role='manager',admin=1,label='Administrador' WHERE codigo=?", [cod]);
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
    await run('INSERT INTO users(codigo,nome,role,label,admin,pass_hash,must_change,ativo) VALUES(?,?,?,?,?,?,1,1)', [cod, nome, role, label, role === 'manager' ? 1 : 0, hashPassword(p)]);
    pw.push(` - interno ${cod} (${nome}): ${p}`);
  }
  await run("INSERT INTO app_meta(k,v) VALUES('setup_done',?)", [now()]);
  return text(`INSTALAÇÃO CONCLUÍDA\n\nSenhas temporárias (anote AGORA; não serão exibidas de novo; troque no primeiro acesso):\n${pw.join('\n')}\n\nAgora remova a variável SETUP_KEY do painel da Hostinger e reinicie o app.\n`);
}

function tabOf(tipo: string): 'users' {
  if (tipo === 'interno') return 'users';
  return fail(400, 'Tipo inválido.');
}

async function checarCsrf(c: Ctx): Promise<void> {
  // login, recuperação de senha e o cron (com segredo próprio) não dependem de cookie
  if (['/auth/login', '/auth/forgot'].includes(c.path) || c.path.startsWith('/cron/')) return;
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
  const u = await requireInternal(c);
  if (!(mod in MODULES)) fail(404, 'Módulo desconhecido.');
  if (mod === 'configuracoes' && !Number(u.admin)) fail(403, 'As informações da instituição são restritas ao Administrador.');
  if (method === 'GET') {
    if (id) return json((await getRow(mod, id)) ?? fail(404, 'Registro não encontrado.'));
    return json({ headers: await headersOf(mod), rows: await listRows(mod) });
  }
  if (!Number(u.admin) && !TEAM_WRITE.includes(mod)) fail(403, 'Seu perfil não pode alterar este módulo.');
  if (mod === 'calescolar' && (method === 'POST' || method === 'PUT')) fail(400, 'O Calendário Escolar é editado pela própria tela (com validação de datas, segmentos e duplicidade).');
  if (mod === 'datacom' && (method === 'POST' || method === 'PUT')) fail(400, 'As Datas Comemorativas são editadas pela própria tela (com validação das regras e de duplicidade).');
  await autoBackupIfDue();
  if (method === 'POST') { const novo = await insertRow(mod, await c.body(), u.codigo); await notifyAssignment(mod, novo, null, String(u.nome)).catch(() => {}); return json(novo, 201); }
  if (!id) fail(400, 'Informe o id.');
  if (method === 'PUT') {
    const antes = (await getRow(mod, id)) ?? fail(404, 'Registro não encontrado.');
    const dep = await updateRow(mod, id, await c.body(), u.codigo);
    await notifyAssignment(mod, dep, antes, String(u.nome)).catch(() => {});
    return json(dep);
  }
  if (method === 'DELETE') {
    const alvo = (await getRow(mod, id)) ?? fail(404, 'Registro não encontrado.');
    if (!teamMayDelete(u, alvo)) fail(403, 'Você só pode excluir itens criados por você ou atribuídos a você.');
    await makeBackup('preexclusao');
    await deleteRow(mod, id, u.codigo);
    return json({ ok: true });
  }
  return fail(405, 'Método não permitido.');
}

export { HttpError, ALLOWED_EXT, EVO_VERSION, intLog, setting };
