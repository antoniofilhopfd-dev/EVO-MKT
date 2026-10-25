import { q, q1 } from './db';
import { listRows } from './records';
import { Row } from './util';

export interface Achado { tipo: string; modulo: string; registro: string; detalhe: string }

/** Verificação somente leitura: vínculos quebrados, materiais sem arquivo, tabelas auxiliares órfãs e contadores de ID. Nunca altera dados. */
export async function verificarIntegridade(): Promise<{ ok: boolean; achados: Achado[]; verificados: Record<string, number> }> {
  const achados: Achado[] = [];
  const ids = new Map<string, Set<string>>();
  const noModulo = async (m: string) => ids.get(m) ?? ids.set(m, new Set((await q('SELECT id FROM records WHERE modulo=?', [m])).map((r: Row) => String(r.id)))).get(m)!;
  const verificados: Record<string, number> = {};
  const pubs = await listRows('conteudos');
  verificados.conteudos = pubs.length;
  for (const r of pubs) {
    const camp = String(r.campanhaId ?? '').trim();
    if (camp && !(await noModulo('campanhas')).has(camp)) achados.push({ tipo: 'vinculo_quebrado', modulo: 'conteudos', registro: String(r.id), detalhe: `campanhaId → ${camp} (campanhas)` });
    const origem = String(r.origemTipo ?? ''), oid = String(r.origemId ?? '').trim();
    if (oid && (origem === 'calescolar') && !(await noModulo('calescolar')).has(oid)) achados.push({ tipo: 'vinculo_quebrado', modulo: 'conteudos', registro: String(r.id), detalhe: `origem → ${oid} (calendário escolar)` });
    for (const m of Array.isArray(r.materiais) ? (r.materiais as Row[]) : []) {
      const cam = String(m.caminho ?? '');
      if (cam && !(await q1('SELECT 1 FROM arquivos WHERE caminho=?', [cam]))) achados.push({ tipo: 'material_sem_arquivo', modulo: 'conteudos', registro: String(r.id), detalhe: `${m.papel}: ${cam}` });
    }
  }
  for (const m of ['calescolar', 'datacom', 'campanhas', 'ideias', 'templates']) verificados[m] = (await noModulo(m)).size;
  // tabelas auxiliares que apontam para registros que não existem mais
  for (const tab of ['status_history', 'record_comments', 'record_checklist']) {
    const orfas = await q(`SELECT t.modulo,t.registro,COUNT(*) n FROM ${tab} t LEFT JOIN records r ON r.modulo=t.modulo AND r.id=t.registro WHERE r.id IS NULL GROUP BY t.modulo,t.registro LIMIT 50`);
    for (const o of orfas) achados.push({ tipo: 'auxiliar_orfa', modulo: String(o.modulo), registro: String(o.registro), detalhe: `${o.n} linha(s) em ${tab} sem o registro de origem` });
  }
  const vinc = await q('SELECT v.conteudo_id,COUNT(*) n FROM ads_vinculos v LEFT JOIN records r ON r.modulo=? AND r.id=v.conteudo_id WHERE r.id IS NULL GROUP BY v.conteudo_id LIMIT 50', ['conteudos']);
  for (const o of vinc) achados.push({ tipo: 'auxiliar_orfa', modulo: 'conteudos', registro: String(o.conteudo_id), detalhe: `${o.n} vínculo(s) com anúncio sem a publicação` });
  // contadores de ID: nenhum contador pode ficar abaixo do maior número já usado
  for (const c of await q('SELECT modulo,n FROM id_counters')) {
    const m = await q("SELECT MAX(CAST(SUBSTRING_INDEX(id,'-',-1) AS UNSIGNED)) mx FROM records WHERE modulo=?", [c.modulo]);
    if (Number(m[0]?.mx ?? 0) > Number(c.n)) achados.push({ tipo: 'contador_baixo', modulo: String(c.modulo), registro: '', detalhe: `contador ${c.n} < maior id usado ${m[0].mx}` });
  }
  return { ok: achados.length === 0, achados: achados.slice(0, 200), verificados };
}
