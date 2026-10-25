import { Ctx } from '../ctx';
import { rateCheck, rateFail, requireInternal } from '../auth';
import { randHex, sha256 } from '../crypto';
import { publicUrl } from '../integrations/http';
import { audit, listRows } from '../records';
import { setSetting, setting } from '../settings';
import { addDays, fail, fmtDate, now, strv } from '../util';
import { json } from './handlers';

/**
 * Calendário editorial em modo leitura, por link (para a direção). Só o hash do token fica guardado.
 * Mostra apenas posts já encaminhados (aprovação, aprovado, agendado, publicado): rascunhos e ideias nunca saem daqui.
 */
const VISIVEIS = /^(EM REVISÃO|APROVADO|AGENDADO|PUBLICADO)$/i;

export async function calendarioPublicoRoute(c: Ctx) {
  const { path, method } = c;
  if (path === '/manager/calendario-link') {
    const u = await requireInternal(c);
    if (method === 'GET') {
      const exp = await setting('cal_share_exp');
      return json({ ativo: !!(await setting('cal_share_hash')) && exp > now(), expiraEm: exp });
    }
    if (method !== 'POST') return fail(405, 'Método não permitido.');
    const b = await c.body();
    if (strv(b.acao) === 'desativar') {
      await setSetting('cal_share_hash', '');
      await setSetting('cal_share_exp', '');
      await audit(String(u.codigo), 'calendario-link-desativado');
      return json({ ok: true, ativo: false });
    }
    const dias = Math.min(90, Math.max(1, Number(b.dias) || 30));
    const token = randHex(32);
    await setSetting('cal_share_hash', sha256(token));
    await setSetting('cal_share_exp', now(addDays(new Date(), dias)));
    await audit(String(u.codigo), 'calendario-link-criado');
    return json({ ativo: true, url: `${publicUrl(c.url.origin)}/calendario.html?t=${token}`, expiraEm: await setting('cal_share_exp'), dias });
  }
  if (path === '/public/calendario' && method === 'GET') {
    await rateCheck('cal:' + c.ip, 60);
    const t = c.qs('t');
    const hash = await setting('cal_share_hash');
    if (t.length < 32 || !hash || sha256(t) !== hash || (await setting('cal_share_exp')) < now()) {
      await rateFail('cal:' + c.ip);
      fail(404, 'Este link não está mais ativo. Peça um novo ao Marketing.');
    }
    const de = fmtDate(addDays(new Date(), -7)), ate = fmtDate(addDays(new Date(), 60));
    const rows = (await listRows('conteudos'))
      .filter((r) => VISIVEIS.test(strv(r.status)) && strv(r.publicacaoEm).slice(0, 10) >= de && strv(r.publicacaoEm).slice(0, 10) <= ate)
      .sort((a, b) => strv(a.publicacaoEm).localeCompare(strv(b.publicacaoEm)))
      .map((r) => ({ titulo: strv(r.titulo), perfil: strv(r.perfil), formato: strv(r.formato), quando: strv(r.publicacaoEm), status: strv(r.status).toUpperCase() }));
    return json({ rows, de, ate });
  }
  return fail(404, 'Rota não encontrada.');
}
