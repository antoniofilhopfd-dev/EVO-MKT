import { timingSafeEqual } from 'node:crypto';
import { Ctx } from '../ctx';
import { run } from '../db';
import { env, fail, fmtDate, addDays, parseLocal, Row, now } from '../util';
import { listRows, emailForPerson } from '../records';
import { notifyMail } from '../mail';
import { adsSync } from '../integrations/metaads';
import { resumoOperacional } from '../insights';
import { intLog, setting } from '../settings';
import { igPublishDue, igSync, metaConnected, metaRefreshIfNeeded } from '../integrations/meta';
import { gCalendarSync, gConnected } from '../integrations/google';
import { json } from './handlers';

/** Autenticação dos endpoints de cron: Authorization: Bearer CRON_SECRET (comparação em tempo constante). */
function cronAuth(c: Ctx): void {
  const secret = env('CRON_SECRET');
  if (secret.length < 16) fail(503, 'CRON_SECRET não configurado.');
  const given = (c.header('authorization').match(/^Bearer\s+(.+)$/i)?.[1] ?? '').trim();
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) fail(401, 'Não autorizado.');
}

export async function cronRoute(c: Ctx): Promise<Response> {
  cronAuth(c);
  if (c.path === '/cron/ping') return json({ ok: true, quando: now() });
  if (c.path === '/cron/alertas') return json(await alertas());
  if (c.path === '/cron/integracoes') return json(await integracoes(c.qs('tarefa') || 'tudo'));
  return fail(404, 'Rota não encontrada.');
}

async function integracoes(what: string): Promise<Row> {
  const out: Row = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn(); } catch (e: any) { out[name] = 'ERRO: ' + e.message; await intLog('cron', 'erro', `${name}: ${e.message}`); }
  };
  if (what === 'publicar' || what === 'tudo') await step('instagram-publicar', async () => ({ publicados: await igPublishDue() }));
  if (what === 'sincronizar' || what === 'tudo') {
    if (await metaConnected()) {
      await step('instagram-token', async () => { await metaRefreshIfNeeded(); return 'ok'; });
      await step('instagram-metricas', async () => ({ periodos: await igSync() }));
      if (await setting('meta_ads_conta')) await step('meta-ads', async () => ({ linhas: await adsSync() }));
    }
    if (await gConnected()) {
      if (await setting('g_calendar_id')) await step('google-agenda', () => gCalendarSync());
    }
  }
  return out;
}

/** Alertas de prazo: a cada pessoa com e-mail cadastrado em Acessos internos e o resumo do Marketing. */
async function alertas(): Promise<Row> {
  await run('DELETE FROM sessions WHERE expira<?', [Math.floor(Date.now() / 1000)]).catch(() => {});
  await run('DELETE FROM login_attempts WHERE quando < ?', [Math.floor(Date.now() / 1000) - 86400]).catch(() => {});
  const hoje = fmtDate(new Date()), amanha = fmtDate(addDays(new Date(), 1));
  const FECHADOS = /CONCLU|PUBLICADO|APROVADO|CANCEL|ARQUIV|ENTREGUE|FINAL/i;
  type Item = { mod: string; titulo: string; due: string; resp: string; atraso: boolean };
  const itens: Item[] = [];
  for (const mod of ['conteudos']) {
    for (const r of await listRows(mod)) {
      if (FECHADOS.test(`${r.status ?? ''} ${r.triagemStatus ?? ''}`)) continue;
      const due = String(r.publicacaoEm ?? r.prazo ?? r.dataInicio ?? '').slice(0, 10);
      if (!due || due > amanha) continue;
      itens.push({ mod, titulo: r.titulo ?? r.id, due, resp: String(r.responsavel ?? '').trim(), atraso: due < hoje });
    }
  }
  const op = await resumoOperacional();
  if (!itens.length) {
    if (op.length) await notifyMail('Resumo diário do EVO MKT', `Operação:\n${op.join('\n')}`);
    return { enviados: 0, resumo: op.length > 0, itens: 0 };
  }
  const br = (d: string) => parseLocal(d + 'T12:00:00').toLocaleDateString('pt-BR', { timeZone: env('TIMEZONE', 'America/Recife') });
  const linha = (i: Item) => `- [${i.mod}] ${i.titulo} — ${i.atraso ? 'ATRASADO desde ' : 'vence '}${br(i.due)}${i.resp ? ` (${i.resp})` : ''}`;
  const porPessoa: Record<string, Item[]> = {};
  for (const i of itens) if (i.resp) (porPessoa[i.resp] ??= []).push(i);
  let enviados = 0;
  for (const [nome, lista] of Object.entries(porPessoa)) {
    const to = await emailForPerson(nome);
    if (!to) continue;
    await notifyMail('Seus prazos de hoje', `Olá, ${nome}!\n\n${lista.map(linha).join('\n')}\n\nAcesse o EVO MKT para atualizar.`, to);
    enviados++;
  }
  itens.sort((a, b) => a.due.localeCompare(b.due));
  await notifyMail(`Resumo de prazos (${itens.length} itens)`, itens.map(linha).join('\n') + (op.length ? `\n\nOperação:\n${op.join('\n')}` : ''));
  return { enviados, resumo: true, itens: itens.length };
}
