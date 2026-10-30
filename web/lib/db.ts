import mysql from 'mysql2/promise';
import { AsyncLocalStorage } from 'node:async_hooks';
const txContext = new AsyncLocalStorage<mysql.PoolConnection>();
import { env, envInt, Row } from './util';

let pool: mysql.Pool | undefined;

export function getPool(): mysql.Pool {
  if (!pool) {
    if (!env('DB_NAME') || !env('DB_USER')) throw new Error('Banco não configurado (DB_NAME/DB_USER).');
    pool = mysql.createPool({
      host: env('DB_HOST', 'localhost'),
      port: envInt('DB_PORT', 3306),
      database: env('DB_NAME'),
      user: env('DB_USER'),
      password: env('DB_PASSWORD'),
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: envInt('DB_POOL', 8),
      supportBigNumbers: true,
      bigNumberStrings: false,
      dateStrings: true,
    });
  }
  return pool;
}

/** SELECT: devolve as linhas. */
export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await (txContext.getStore() ?? getPool()).query(sql, params);
  return Array.isArray(rows) ? (rows as T[]) : [];
}
export async function q1<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}
/** INSERT/UPDATE/DELETE: devolve o número de linhas afetadas. */
export async function run(sql: string, params: unknown[] = []): Promise<number> {
  const [res] = await (txContext.getStore() ?? getPool()).query(sql, params);
  return (res as mysql.ResultSetHeader).affectedRows ?? 0;
}
export async function withTx<T>(fn: (c: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const atual = txContext.getStore();
  if (atual) return fn(atual);
  const c = await getPool().getConnection();
  try {
    await c.beginTransaction();
    const r = await txContext.run(c, () => fn(c));
    await c.commit();
    return r;
  } catch (e) {
    await c.rollback().catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
