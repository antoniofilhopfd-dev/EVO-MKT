import { registrarNotificacao } from './notificacoes';
import { notifyMail } from './mail';
import { q, q1, run } from './db';
import { decryptSecret, encryptSecret } from './crypto';
import { now } from './util';

const SECRET_KEYS = ['meta_app_secret', 'meta_token', 'g_client_secret', 'g_refresh_token', 'g_access_token', 'anthropic_key'];

export async function setting(k: string, def = ''): Promise<string> {
  const r = await q1<{ v: string }>('SELECT v FROM integration_settings WHERE k=?', [k]);
  if (!r) return def;
  return SECRET_KEYS.includes(k) ? decryptSecret(r.v) : r.v;
}
export async function setSetting(k: string, v: string): Promise<void> {
  const store = SECRET_KEYS.includes(k) && v !== '' ? encryptSecret(v) : v;
  await run('INSERT INTO integration_settings(k,v) VALUES(?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, store]);
}
export async function intLog(servico: string, nivel: string, msg: string): Promise<void> {
  try {
    if (/^erro/i.test(nivel)) await avisarFalha(servico, msg);
    await run('INSERT INTO integration_log(quando,servico,nivel,msg) VALUES(?,?,?,?)', [now(), servico, nivel, msg.slice(0, 480)]);
    await run('DELETE FROM integration_log WHERE id < (SELECT m FROM (SELECT MAX(id)-500 m FROM integration_log) x)');
  } catch {
    /* melhor esforço */
  }
}
export { q };

/** Falha de integração: registra na central e avisa a Gerência por e-mail (no máximo 1 e-mail por serviço a cada hora). */
async function avisarFalha(servico: string, msg: string): Promise<void> {
  await registrarNotificacao('integracao_falha', 'gerencia', `Falha na integração ${servico}`, msg, 'integracoes', servico);
  const ult = await q1<{ quando: string }>("SELECT quando FROM notifications WHERE tipo='integracao_falha' AND registro=? ORDER BY id DESC LIMIT 1 OFFSET 1", [servico]);
  if (ult && Date.now() - new Date(ult.quando).getTime() < 3600_000) return;
  await notifyMail(`EVO MKT: falha na integração ${servico}`, `${msg}\n\nAbra Administração → Integrações para ver o registro.`);
}
