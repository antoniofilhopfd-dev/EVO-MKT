// Ao iniciar o servidor Node: define o fuso e aplica as migrações pendentes.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  process.env.TZ = process.env.TIMEZONE || 'America/Recife';
  if (!process.env.DB_NAME) {
    console.warn('[startup] DB_NAME não definido — migrações adiadas.');
    return;
  }
  try {
    const { ensureMigrated } = await import('./lib/migrate');
    const n = await ensureMigrated();
    console.log(`[startup] banco pronto (${n} migração(ões) aplicada(s) agora)`);
  } catch (e) {
    console.error('[startup] falha ao aplicar migrações:', e);
  }
}
