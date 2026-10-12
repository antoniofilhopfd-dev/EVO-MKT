import { createHmac, timingSafeEqual } from 'node:crypto';
import { appKey } from '../crypto';
import { env, fail } from '../util';

export type HttpResult = [number, any];

/** Chamada HTTP com timeout. Devolve [status, json | texto]. */
export async function httpCall(method: string, url: string, headers: Record<string, string> = {}, body?: BodyInit | null, timeoutS = 25): Promise<HttpResult> {
  // Só leituras (GET) são repetidas: falha de rede, 429 e 5xx passageiros têm até 2 novas tentativas (1 s e 3 s).
  const tentativas = method === 'GET' ? 3 : 1;
  let ultimo: HttpResult | null = null;
  let erroRede: Error | null = null;
  for (let i = 0; i < tentativas; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, i === 1 ? 1000 : 3000));
    let res: Response;
    try {
      res = await fetch(url, { method, headers, body: body ?? undefined, redirect: 'manual', signal: AbortSignal.timeout(timeoutS * 1000) });
    } catch (e: any) {
      erroRede = new Error('Falha de rede: ' + (e?.cause?.message || e?.message));
      continue;
    }
    erroRede = null;
    const txt = await res.text();
    let out: HttpResult;
    try { out = [res.status, JSON.parse(txt)]; } catch { out = [res.status, txt]; }
    if ((res.status === 429 || res.status >= 500) && i < tentativas - 1) { ultimo = out; continue; }
    return out;
  }
  if (erroRede) throw erroRede;
  return ultimo!;
}
export function httpOk(r: HttpResult, ctx: string): any {
  const [st, j] = r;
  if (st >= 200 && st < 300) return j;
  let msg: string;
  if (j && typeof j === 'object') msg = j.error?.message ?? j.error_description ?? (typeof j.error === 'string' ? j.error : JSON.stringify(j));
  else msg = String(j);
  throw new Error(`${ctx}: HTTP ${st} — ${msg.slice(0, 300)}`);
}
export const qsOf = (o: Record<string, unknown>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

export function publicUrl(reqOrigin?: string): string {
  return (env('PUBLIC_URL') || reqOrigin || 'http://localhost').replace(/\/+$/, '');
}

// ---------- state do OAuth e URLs assinadas ----------
const hmacHex = (data: string) => createHmac('sha256', appKey()).update(data).digest('hex');
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function signState(purpose: string): string {
  const p = Buffer.from(JSON.stringify({ p: purpose, t: Math.floor(Date.now() / 1000), n: Math.random().toString(16).slice(2, 14) })).toString('base64');
  return p + '.' + hmacHex(p);
}
export function checkState(state: string, purpose: string): boolean {
  const i = state.indexOf('.');
  if (i < 0) return false;
  const p = state.slice(0, i);
  if (!safeEq(hmacHex(p), state.slice(i + 1))) return false;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64').toString());
    return d.p === purpose && Date.now() / 1000 - Number(d.t) < 900;
  } catch {
    return false;
  }
}
export function signedMediaUrl(relPath: string, ttl = 3600): string {
  const e = Math.floor(Date.now() / 1000) + ttl;
  const p = Buffer.from(relPath).toString('base64url');
  return `${publicUrl()}/api/public/media?p=${p}&e=${e}&s=${hmacHex(`${p}|${e}`)}`;
}
export function verifySignedMedia(p: string, e: number, s: string): string {
  if (!p || e < Date.now() / 1000 || !safeEq(hmacHex(`${p}|${e}`), s)) fail(403, 'Link expirado ou inválido.');
  const rel = Buffer.from(p, 'base64url').toString();
  if (!rel.startsWith('ANEXOS/CONTEUDOS/') || rel.includes('..')) fail(400, 'Caminho inválido.');
  return rel;
}
