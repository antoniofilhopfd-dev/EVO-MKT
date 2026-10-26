// Ao iniciar o servidor Node: define o fuso e aplica as migrações pendentes.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  process.env.TZ = process.env.TIMEZONE || 'America/Fortaleza';
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
  // Publicação agendada do Instagram também por um relógio interno (a cada 1 min): o cron da hospedagem pode falhar
  // ("fork failed") e o post agendado não pode depender só dele. O bloqueio no banco evita publicar em duplicidade.
  if (process.env.IG_AUTO_PUBLISH_INTERNO !== '0') {
    const rodar = async () => {
      try { const { igPublishDue } = await import('./lib/integrations/meta'); const n = await igPublishDue(); if (n) console.log(`[agendador] ${n} post(s) publicado(s)`); }
      catch (e: any) { console.error('[agendador] falha:', String(e?.message ?? e).replace(/access_token=[^&\s"]+/g, 'access_token=***')); }
    };
    setTimeout(rodar, 30_000).unref();
    setInterval(rodar, 60_000).unref();
  }
}
