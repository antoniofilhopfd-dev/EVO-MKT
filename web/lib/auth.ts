import { portalAtivo } from './portal';
import { randomInt } from 'node:crypto';
import { Ctx, setCookie } from './ctx';
import { q, q1, run } from './db';
import { accessHmac, decryptSecret, encryptSecret, randHex, sha256, signValue, unsignValue, verifyPassword } from './crypto';
import { setting } from './settings';
import { notifyMail } from './mail';
import { emailForPerson, audit } from './records';
import { envInt, fail, lower, now, nowSec, Row } from './util';

// ---------- limite de tentativas ----------
export async function rateCheck(chave: string, max = 5): Promise<void> {
  await run('DELETE FROM login_attempts WHERE quando<?', [nowSec() - 900]);
  const r = await q1<{ c: number }>('SELECT COUNT(*) c FROM login_attempts WHERE chave=?', [chave]);
  if (Number(r?.c ?? 0) >= max) fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
}
export const rateFail = (chave: string) => run('INSERT INTO login_attempts(chave,quando) VALUES(?,?)', [chave, nowSec()]).then(() => undefined);

// ---------- sessão ----------
const sessionHours = () => envInt('SESSION_HOURS', 12);

export async function startSession(tipo: 'int' | 'por', codigo: string): Promise<string> {
  const tok = randHex(32);
  await run('INSERT INTO sessions(token_hash,tipo,codigo,expira) VALUES(?,?,?,?)', [sha256(tok), tipo, codigo, nowSec() + sessionHours() * 3600]);
  await run('DELETE FROM sessions WHERE expira<?', [nowSec()]);
  return tok;
}
async function sessionFor(tok: string, tipo: 'int' | 'por'): Promise<Row | null> {
  if (!tok) return null;
  const s = await q1('SELECT * FROM sessions WHERE token_hash=? AND tipo=? AND expira>?', [sha256(tok), tipo, nowSec()]);
  if (!s) return null;
  if (tipo === 'int') return (await q1('SELECT codigo,nome,role,label,must_change FROM users WHERE codigo=? AND ativo=1', [s.codigo])) ?? null;
  const u = await q1('SELECT codigo,nome,perfil,segmentos,must_change FROM portal_users WHERE codigo=? AND ativo=1', [s.codigo]);
  if (!u) return null;
  u.segmentos = JSON.parse(u.segmentos);
  return u;
}
/** Define o cookie de sessão interna (valor assinado com SESSION_SECRET). */
export function setSessionCookie(c: Ctx, tok: string): void {
  setCookie(c, 'evo_sid', signValue(tok), { maxAge: sessionHours() * 3600 });
}
export function sessionTokenFromCookie(c: Ctx): string {
  const raw = c.cookies['evo_sid'];
  return raw ? unsignValue(raw) : '';
}
export const internalUser = (c: Ctx) => sessionFor(sessionTokenFromCookie(c), 'int');
/** Com o Portal suspenso ninguém é reconhecido como solicitante, mesmo com sessão ou código válidos. */
export const portalUser = async (c: Ctx) => ((await portalAtivo()) ? sessionFor(c.header('x-portal-token'), 'por') : null);
export async function requireInternal(c: Ctx): Promise<Row> {
  return (await internalUser(c)) ?? fail(401, 'Sessão expirada. Entre novamente.');
}
export async function requireManager(c: Ctx): Promise<Row> {
  const u = await requireInternal(c);
  if (u.role !== 'manager') fail(403, 'Ação disponível apenas para a Gerente.');
  return u;
}
export async function requirePortal(c: Ctx): Promise<Row> {
  return (await portalUser(c)) ?? fail(401, 'Sessão expirada');
}
export function checkCsrf(c: Ctx): void {
  if (c.header('x-evo') !== '1') fail(403, 'Requisição inválida.');
}
export function allowedSegment(u: Row, seg: string): boolean {
  return (u.segmentos as string[]).some((s) => lower(s.trim()) === lower(String(seg).trim()));
}

// ---------- modo de acesso (senha | codigo) ----------
export async function loginMode(): Promise<'senha' | 'codigo'> {
  return (await setting('login_modo', 'senha')) === 'codigo' ? 'codigo' : 'senha';
}
/** Códigos: de 4 a 10 letras/números, sem espaços (os gerados automaticamente têm 2 letras + 4 números; a Gerente pode escolher outro). */
export const validCodeFormat = (c: string) => /^[A-Z0-9]{4,10}$/.test(c.trim().toUpperCase());

/** 2 letras (sem I e O) + 4 números, sem sequências óbvias. */
export async function genAccessCode(): Promise<string> {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let i = 0; i < 200; i++) {
    const n = String(randomInt(0, 10000)).padStart(4, '0');
    if (/^(\d)\1{3}$/.test(n) || ['1234', '4321', '0123', '3210'].includes(n)) continue;
    const c = L[randomInt(24)] + L[randomInt(24)] + n;
    const h = accessHmac(c);
    if (!(await q1('SELECT 1 FROM users WHERE acesso_hmac=?', [h])) && !(await q1('SELECT 1 FROM portal_users WHERE acesso_hmac=?', [h]))) return c;
  }
  throw new Error('Não foi possível gerar um código único.');
}
export async function issueAccessCode(tab: 'users' | 'portal_users', codigo: string, dropSessions = true): Promise<string> {
  const c = await genAccessCode();
  await run(`UPDATE ${tab} SET acesso_hmac=?,acesso_enc=? WHERE codigo=?`, [accessHmac(c), encryptSecret(c), codigo]);
  if (dropSessions) {
    await run('DELETE FROM sessions WHERE codigo=?', [codigo]);
    await run('DELETE FROM trusted_devices WHERE codigo=?', [codigo]);
  }
  return c;
}
export { decryptSecret };

// ---------- aparelhos conhecidos ----------
async function knownDevice(c: Ctx): Promise<boolean> {
  const d = c.cookies['evo_dev'];
  return !!d && !!(await q1('SELECT 1 FROM trusted_devices WHERE hash=?', [sha256(d)]));
}
export async function registerDevice(c: Ctx, tipo: 'int' | 'por', codigo: string, nome: string): Promise<void> {
  let dev = c.cookies['evo_dev'] || '';
  const row = dev ? await q1('SELECT 1 FROM trusted_devices WHERE hash=? AND codigo=?', [sha256(dev), codigo]) : undefined;
  if (!row) {
    dev = randHex(24);
    await run('INSERT INTO trusted_devices(hash,codigo,tipo,criado,visto) VALUES(?,?,?,?,?)', [sha256(dev), codigo, tipo, now(), now()]);
    await audit(codigo, 'novo-dispositivo');
    const d = new Date();
    const msg = `${nome} (${codigo}) entrou de um aparelho novo.\nIP: ${c.ip}\nNavegador: ${c.ua.slice(0, 120)}\nHorário: ${d.toLocaleString('pt-BR', { timeZone: process.env.TIMEZONE || 'America/Recife' })}\n\nSe não foi essa pessoa, gere um novo código em Administração → Acessos.`;
    await notifyMail('Novo acesso: ' + nome, msg);
    const mine = await emailForPerson(nome);
    if (mine) await notifyMail('Novo acesso à sua conta no EVO MKT', msg, mine);
  } else {
    await run('UPDATE trusted_devices SET visto=? WHERE hash=?', [now(), sha256(dev)]);
  }
  setCookie(c, 'evo_dev', dev, { maxAge: 365 * 86400 });
}

// ---------- proteção contra adivinhação de códigos ----------
const countAttempts = async (key: string) => Number((await q1('SELECT COUNT(*) c FROM login_attempts WHERE chave=? AND quando>?', [key, nowSec() - 900]))?.c ?? 0);
export async function codeLoginGuard(c: Ctx): Promise<void> {
  await run('DELETE FROM login_attempts WHERE quando<?', [nowSec() - 900]);
  const n = await countAttempts('cip|' + c.ip);
  if (n >= envInt('LOGIN_IP_MAX', 10)) fail(429, 'Muitas tentativas deste endereço. Aguarde 15 minutos.');
  if ((await countAttempts('cglobal')) >= envInt('LOGIN_GLOBAL_MAX', 150) && !(await knownDevice(c)))
    fail(429, 'Proteção ativada: houve muitas tentativas recentes. Entre por um aparelho em que você já acessou ou aguarde alguns minutos.');
  const delay = envInt('LOGIN_DELAY_MS', 300);
  if (n > 0 && delay > 0) await new Promise((r) => setTimeout(r, Math.min(n, 5) * delay));
}
export async function codeLoginFail(c: Ctx, quem: string): Promise<never> {
  await rateFail('cip|' + c.ip);
  await rateFail('cglobal');
  await audit(quem, 'login-falhou');
  const g = await countAttempts('cglobal');
  if (g === envInt('LOGIN_GLOBAL_MAX', 150))
    await notifyMail('Alerta: muitas tentativas de acesso', `Foram registradas ${g} tentativas de código inválido nos últimos 15 minutos. O modo de proteção foi ativado: só aparelhos já conhecidos conseguem entrar. Último IP: ${c.ip}`);
  return fail(401, 'Código inválido.');
}

// ---------- ações sensíveis ----------
// Decisão do cliente: o sistema NÃO pede senha em nenhuma ação (a sessão por código basta).
// As ações perigosas pedem apenas uma confirmação simples na tela ("Tem certeza?").
export async function stepUp(_m: Row, _input: Row): Promise<void> {
  return;
}
export { q };
