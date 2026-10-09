export type Row = Record<string, any>;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

export function env(name: string, def = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? def : v;
}
export function envInt(name: string, def: number): number {
  const n = parseInt(env(name), 10);
  return Number.isFinite(n) ? n : def;
}

const tz = () => env('TIMEZONE', 'America/Recife');

/** ISO 8601 com o deslocamento do fuso (igual ao date('c') do PHP), ex.: 2026-10-01T13:54:11-03:00 */
export function now(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const x of parts) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offMin = Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sign = offMin < 0 ? '-' : '+';
  const a = Math.abs(offMin);
  const hh = String(Math.floor(a / 60)).padStart(2, '0');
  const mm = String(a % 60).padStart(2, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${hh}:${mm}`;
}
export const nowSec = () => Math.floor(Date.now() / 1000);

export function strv(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return JSON.stringify(v);
}
export function cleanInput(input: Row): Row {
  const o: Row = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k)) continue;
    const s = strv(v);
    if (Buffer.byteLength(s) > 20000) fail(400, `Campo '${k}' muito longo.`);
    o[k] = s;
  }
  return o;
}
export const safePart = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
export const lower = (s: string) => s.toLocaleLowerCase('pt-BR');
export const asBool = (v: unknown) => v === 1 || v === '1' || v === true || v === 'true';

import { AsyncLocalStorage } from 'node:async_hooks';
/** IP da requisição corrente (para a auditoria), sem passar o contexto por todas as funções. */
export const reqStore = new AsyncLocalStorage<{ ip: string }>();
export const currentIp = () => reqStore.getStore()?.ip ?? '-';
