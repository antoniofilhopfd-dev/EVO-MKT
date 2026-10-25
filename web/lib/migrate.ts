import { getPool } from './db';
import { MIGRATIONS } from './migrations.generated';

// Erros de "já existe" tornam as migrações idempotentes (coluna/índice/tabela criados antes pela versão PHP).
const TOLERATED = new Set([1050, 1060, 1061, 1091]);

/** Passos em código antes/depois de uma migração (backup, conversões que o SQL puro não faz). */
const HOOKS: Record<string, { antes?: () => Promise<void>; depois?: () => Promise<void> }> = {
  '027_cinco_areas_limpeza.sql': {
    antes: async () => (await import('./migracao6')).antes(),
    depois: async () => (await import('./migracao6')).depois(),
  },
};

let ready: Promise<number> | null = null;

/** Aplica as migrações pendentes (uma vez por processo) e registra em schema_migrations. */
export function ensureMigrated(): Promise<number> {
  if (!ready) {
    ready = applyMigrations().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export async function applyMigrations(): Promise<number> {
  const pool = getPool();
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations(name VARCHAR(190) PRIMARY KEY, applied_at VARCHAR(40) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
  );
  const [done] = await pool.query('SELECT name FROM schema_migrations');
  const have = new Set((done as { name: string }[]).map((r) => r.name));
  let n = 0;
  for (const m of MIGRATIONS) {
    if (have.has(m.name)) continue;
    const hook = HOOKS[m.name];
    if (hook?.antes) {
      try { await hook.antes(); } catch (e: any) { throw new Error(`Migração ${m.name} interrompida antes de mexer nos dados (o backup falhou): ${e?.message}`); }
    }
    const conn = await pool.getConnection();
    try {
      for (const stmt of m.sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean)) {
        const body = stmt.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n').trim();
        if (!body) continue;
        try {
          await conn.query(body);
        } catch (e: any) {
          if (!TOLERATED.has(e?.errno)) throw new Error(`Migração ${m.name} falhou: ${e?.message}`);
        }
      }
      await conn.query('INSERT INTO schema_migrations(name, applied_at) VALUES(?, ?)', [m.name, new Date().toISOString()]);
      n++;
      if (hook?.depois) { try { await hook.depois(); } catch (e: any) { console.error(`[migrate] pós-passo de ${m.name} falhou:`, e?.message); } }
      console.log(`[migrate] aplicada ${m.name}`);
    } finally {
      conn.release();
    }
  }
  return n;
}
