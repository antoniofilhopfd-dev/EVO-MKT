import { timingSafeEqual } from 'node:crypto';
import { Ctx } from '../ctx';
import { getPool } from '../db';
import { ensureMigrated } from '../migrate';
import { env, fail } from '../util';
import { json } from './handlers';

/** Diagnóstico de implantação (protegido por SETUP_KEY): mostra quais variáveis existem (sem valores) e o resultado da conexão/migração. */
export async function diag(c: Ctx): Promise<Response> {
  const key = env('SETUP_KEY');
  const given = c.qs('key');
  const a = Buffer.from(given), b = Buffer.from(key);
  if (key.length < 16 || a.length !== b.length || !timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 1000));
    return fail(403, 'Chave inválida (use a SETUP_KEY).');
  }
  const names = ['NODE_ENV', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'SESSION_SECRET', 'APP_KEY', 'SETUP_KEY', 'PUBLIC_URL', 'NOTIFY_TO', 'CRON_SECRET'];
  const vars: Record<string, string> = {};
  for (const n of names) vars[n] = env(n) ? 'definida' : 'AUSENTE';
  vars.SESSION_SECRET = env('SESSION_SECRET').length >= 24 ? 'definida' : env('SESSION_SECRET') ? 'curta demais (mín. 24)' : 'AUSENTE';
  const dbInfo = { host: env('DB_HOST', '(padrão localhost)'), porta: env('DB_PORT', '3306'), banco: env('DB_NAME') || 'AUSENTE', usuario: env('DB_USER') || 'AUSENTE' };
  let db: Record<string, unknown>;
  try {
    const [r] = await getPool().query('SELECT 1 AS ok');
    const migr = await ensureMigrated();
    db = { conexao: 'ok', teste: (r as unknown[]).length === 1, migracoesAplicadasAgora: migr };
  } catch (e: any) {
    const pwd = env('DB_PASSWORD');
    db = { conexao: 'FALHOU', codigo: e?.code ?? e?.errno ?? null, mensagem: String(e?.message ?? e).split(pwd || '\u0000').join('***').slice(0, 300) };
  }
  return json({ node: process.version, variaveis: vars, banco: dbInfo, resultado: db });
}
