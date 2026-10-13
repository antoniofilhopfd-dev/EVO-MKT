import { q } from './db';
import { listRows } from './records';
import { Row } from './util';

/** Campo de vínculo → módulo ao qual ele aponta. */
export const VINCULOS: Record<string, string> = {
  solicitacaoId: 'solicitacoes', campanhaId: 'campanhas', projetoId: 'projetos', eventoId: 'eventos',
  conteudoId: 'conteudos', tarefaPaiId: 'tarefas', dependeDe: 'tarefas',
};
const MODULOS_COM_VINCULO = ['tarefas', 'projetos', 'conteudos', 'aprovacoes', 'eventos', 'campanhas', 'arquivos', 'configuracoes'];

export interface Achado { tipo: string; modulo: string; registro: string; detalhe: string }

/** Verificação somente leitura: vínculos quebrados, vínculos com itens na lixeira, ciclos de dependência e tabelas auxiliares órfãs. Nunca altera dados. */
export async function verificarIntegridade(): Promise<{ ok: boolean; achados: Achado[]; verificados: Record<string, number> }> {
  const achados: Achado[] = [];
  const ids = new Map<string, Set<string>>();
  const noModulo = async (m: string) => ids.get(m) ?? ids.set(m, new Set((await q('SELECT id FROM records WHERE modulo=?', [m])).map((r: Row) => String(r.id)))).get(m)!;
  const lixeira = new Set((await listRows('lixeira')).map((r) => `${r.origem}/${r.idOriginal}`));
  const verificados: Record<string, number> = {};
  const tarefas = new Map<string, Row>();
  for (const mod of MODULOS_COM_VINCULO) {
    const rows = await listRows(mod);
    verificados[mod] = rows.length;
    for (const r of rows) {
      if (mod === 'tarefas') tarefas.set(String(r.id), r);
      for (const [campo, alvo] of Object.entries(VINCULOS)) {
        const v = String(r[campo] ?? '').trim();
        if (!v) continue;
        if (!(await noModulo(alvo)).has(v)) {
          achados.push({ tipo: lixeira.has(`${alvo}/${v}`) ? 'vinculo_com_item_excluido' : 'vinculo_quebrado', modulo: mod, registro: String(r.id), detalhe: `${campo} → ${v} (${alvo})` });
        }
      }
    }
  }
  // ciclos de dependência entre tarefas
  for (const [id] of tarefas) {
    const visto = new Set<string>([id]);
    let atual = String(tarefas.get(id)?.dependeDe ?? '').trim();
    while (atual) {
      if (visto.has(atual)) { achados.push({ tipo: 'ciclo_dependencia', modulo: 'tarefas', registro: id, detalhe: `ciclo passando por ${atual}` }); break; }
      visto.add(atual);
      atual = String(tarefas.get(atual)?.dependeDe ?? '').trim();
    }
  }
  // tabelas auxiliares que apontam para registros que não existem mais
  const aux: [string, string][] = [['status_history', 'registro'], ['record_comments', 'registro'], ['record_checklist', 'registro']];
  for (const [tab] of aux) {
    const orfas = await q(`SELECT t.modulo,t.registro,COUNT(*) n FROM ${tab} t LEFT JOIN records r ON r.modulo=t.modulo AND r.id=t.registro WHERE r.id IS NULL GROUP BY t.modulo,t.registro LIMIT 50`);
    for (const o of orfas) if (!lixeira.has(`${o.modulo}/${o.registro}`)) achados.push({ tipo: 'auxiliar_orfa', modulo: String(o.modulo), registro: String(o.registro), detalhe: `${o.n} linha(s) em ${tab} sem o registro de origem` });
  }
  const links = await q('SELECT l.solicitacao,COUNT(*) n FROM approval_links l LEFT JOIN records r ON r.modulo=? AND r.id=l.solicitacao WHERE r.id IS NULL GROUP BY l.solicitacao', ['solicitacoes']);
  for (const o of links) achados.push({ tipo: 'auxiliar_orfa', modulo: 'solicitacoes', registro: String(o.solicitacao), detalhe: `${o.n} link(s) de aprovação sem a demanda` });
  // contadores de ID: nenhum contador pode ficar abaixo do maior número já usado
  const cont = await q('SELECT modulo,n FROM id_counters');
  for (const c of cont) {
    const m = await q("SELECT MAX(CAST(SUBSTRING_INDEX(id,'-',-1) AS UNSIGNED)) mx FROM records WHERE modulo=?", [c.modulo]);
    if (Number(m[0]?.mx ?? 0) > Number(c.n)) achados.push({ tipo: 'contador_baixo', modulo: String(c.modulo), registro: '', detalhe: `contador ${c.n} < maior id usado ${m[0].mx}` });
  }
  return { ok: achados.length === 0, achados: achados.slice(0, 200), verificados };
}
