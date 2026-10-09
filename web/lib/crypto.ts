import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env, fail } from './util';

/** Chave de 32 bytes derivada de APP_KEY (igual à versão PHP: sha256 binário). */
export function appKey(): Buffer {
  const k = env('APP_KEY') || env('SESSION_SECRET');
  if (!k) fail(500, 'APP_KEY não configurada.');
  return createHash('sha256').update(k).digest();
}
export function sessionSecret(): string {
  const s = env('SESSION_SECRET');
  if (s.length < 24) fail(500, 'SESSION_SECRET ausente ou curto demais (mínimo 24 caracteres).');
  return s;
}

/** AES-256-GCM no mesmo formato do PHP: "enc:" + base64(iv12 + tag16 + ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', appKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'enc:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function decryptSecret(stored: string): string {
  if (!stored.startsWith('enc:')) return stored;
  try {
    const raw = Buffer.from(stored.slice(4), 'base64');
    const d = createDecipheriv('aes-256-gcm', appKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randHex = (bytes: number) => randomBytes(bytes).toString('hex');

export function accessHmac(code: string): string {
  return createHmac('sha256', appKey()).update(code.trim().toUpperCase()).digest('hex');
}

/** Cookie assinado: "valor.assinatura" (HMAC-SHA256 com SESSION_SECRET). */
export function signValue(v: string): string {
  return v + '.' + createHmac('sha256', sessionSecret()).update(v).digest('base64url');
}
export function unsignValue(s: string): string {
  const i = s.lastIndexOf('.');
  if (i < 1) return '';
  const v = s.slice(0, i);
  const want = createHmac('sha256', sessionSecret()).update(v).digest('base64url');
  const a = Buffer.from(s.slice(i + 1));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b) ? v : '';
}

// Senhas: bcrypt compatível com password_hash/password_verify do PHP ($2y$).
export function hashPassword(p: string): string {
  return bcrypt.hashSync(p, 10).replace(/^\$2[ab]\$/, '$2y$');
}
export function verifyPassword(p: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(p, hash.replace(/^\$2y\$/, '$2b$'));
  } catch {
    return false;
  }
}
export function genPassword(): string {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += a[randomInt(a.length)];
  return s;
}
export function strongPassword(p: string): void {
  if (p.length < 10 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) fail(400, 'A senha deve ter ao menos 10 caracteres, com letras e números.');
}
