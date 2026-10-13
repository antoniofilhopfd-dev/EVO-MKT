import { q, q1, run } from './db';
import { getRow, listRows, newId } from './records';
import { setting } from './settings';
import { addDays, fail, fmtDate, now, Row } from './util';

const ymd = (s: unknown) => String(s ?? '').slice(0, 10);
const FECHADA = /CONCLU|CANCEL|ARQUIV/i;

/** Automações internas (nunca chamam serviços externos). Ligadas por padrão; a Gerência pode desligar em Administração. */
export async function automacaoAtiva(chave: 'auto_tarefa_solicitacao' | 'auto_recorrencia'): Promise<boolean> {
  return (await setting(chave, '1')) !== '0';
}

/** Valida vínculos de uma tarefa: existência, auto-referência, ciclos e subtarefa de subtarefa (um nível só). */
export async function validarVinculosTarefa(id: string, dados: Row): Promise<void> {
  const pai = String(dados.tarefaPaiId ?? '').trim();
  const dep = String(dados.dependeDe ?? '').trim();
  if (pai) {
    if (pai === id) fail(400, 'Uma tarefa não pode ser subtarefa de si mesma.');
    const p = (await getRow('tarefas', pai)) ?? fail(400, `Tarefa principal ${pai} não existe.`);
    if (String(p.tarefaPaiId ?? '').trim()) fail(400, 'Subtarefa de subtarefa não é permitido: escolha a tarefa principal.');
    if (id && (await listRows('tarefas')).some((t) => String(t.tarefaPaiId ?? '') === id)) fail(400, 'Esta tarefa já tem subtarefas; ela não pode virar subtarefa.');
  }
  if (dep) {
    if (dep === id) fail(400, 'Uma tarefa não pode depender de si mesma.');
    if (!(await getRow('tarefas', dep))) fail(400, `A tarefa da qual esta depende (${dep}) não existe.`);
    // ciclo: seguindo dependeDe a partir de dep não pode voltar para id
    const todas = new Map((await listRows('tarefas')).map((t) => [String(t.id), t]));
    let atual = dep;
    const visto = new Set<string>();
    while (atual && !visto.has(atual)) {
      if (id && atual === id) fail(400, 'Dependência circular: essa escolha criaria um ciclo entre as tarefas.');
      visto.add(atual);
      atual = String(todas.get(atual)?.dependeDe ?? '').trim();
    }
  }
}

/** Não permite concluir uma tarefa enquanto a tarefa da qual ela depende não estiver concluída. */
export async function checarDependenciaAoConcluir(dados: Row): Promise<void> {
  const dep = String(dados.dependeDe ?? '').trim();
  if (!dep) return;
  const d = await getRow('tarefas', dep);
  if (d && !/CONCLU/i.test(String(d.status ?? ''))) fail(409, `Esta tarefa depende de ${dep} (${d.titulo ?? 'sem título'}), que ainda não foi concluída.`);
}

const PASSO: Record<string, (d: string) => string> = {
  'DIÁRIA': (d) => fmtDate(addDays(new Date(d + 'T12:00:00'), 1)),
  'SEMANAL': (d) => fmtDate(addDays(new Date(d + 'T12:00:00'), 7)),
  'QUINZENAL': (d) => fmtDate(addDays(new Date(d + 'T12:00:00'), 14)),
  'MENSAL': (d) => { const x = new Date(d + 'T12:00:00'); x.setMonth(x.getMonth() + 1); return fmtDate(x); },
  'ANUAL': (d) => { const x = new Date(d + 'T12:00:00'); x.setFullYear(x.getFullYear() + 1); return fmtDate(x); },
};

/** Dados da próxima ocorrência de uma tarefa recorrente que acabou de ser concluída (ou null se não houver). */
export function proximaOcorrencia(cur: Row): Row | null {
  const regra = String(cur.recorrencia ?? '').toUpperCase();
  const passo = PASSO[regra];
  const prazo = ymd(cur.prazo);
  if (!passo || !prazo || cur.proximaCriadaId) return null;
  const novo = passo(prazo);
  if (cur.recorrenciaAte && novo > ymd(cur.recorrenciaAte)) return null;
  const { id, criadoEm, atualizadoEm, criadoPor, atualizadoPor, proximaCriadaId, ...resto } = cur as Row;
  return { ...resto, status: 'NOVO', prazo: novo, origemRecorrenciaId: String(cur.id ?? id), origem: 'RECORRENCIA' };
}

/** Cria a tarefa vinculada a uma demanda recém-distribuída, uma única vez (a demanda guarda o vínculo). */
export async function dadosTarefaDaSolicitacao(sol: Row): Promise<Row> {
  return {
    titulo: String(sol.titulo ?? 'Demanda'), status: 'NOVO', prioridade: String(sol.prioridade ?? 'MÉDIA'), responsavel: String(sol.responsavel ?? ''),
    segmento: String(sol.segmento ?? ''), prazo: ymd(sol.prazoNegociado || sol.prazoSLA || sol.prazo), solicitacaoId: String(sol.id),
    descricao: `Gerada automaticamente da demanda ${sol.id}.`, origem: 'AUTOMACAO',
  };
}

// ---------- comentários e checklist ----------
export async function comentarios(mod: string, id: string, soPublicos: boolean): Promise<Row[]> {
  return q(`SELECT id,autor,autor_tipo,quando,texto,interno FROM record_comments WHERE modulo=? AND registro=? ${soPublicos ? 'AND interno=0' : ''} ORDER BY id`, [mod, id]);
}
export async function adicionarComentario(mod: string, id: string, autor: string, tipo: 'int' | 'portal', texto: string, interno: boolean): Promise<void> {
  const t = texto.trim();
  if (t.length < 1) fail(400, 'Escreva o comentário.');
  if (t.length > 2000) fail(400, 'Comentário muito longo (máximo 2000 caracteres).');
  await run('INSERT INTO record_comments(modulo,registro,autor,autor_tipo,quando,texto,interno) VALUES(?,?,?,?,?,?,?)', [mod, id, autor.slice(0, 120), tipo, now(), t, interno ? 1 : 0]);
}
export const checklist = (mod: string, id: string) => q('SELECT id,texto,feito,ordem FROM record_checklist WHERE modulo=? AND registro=? ORDER BY ordem,id', [mod, id]);
export async function checklistItem(id: number): Promise<Row | null> {
  return (await q1('SELECT * FROM record_checklist WHERE id=?', [id])) as Row | null;
}
export async function novoIdChecklistOrdem(mod: string, id: string): Promise<number> {
  return Number((await q1('SELECT COALESCE(MAX(ordem),0)+1 n FROM record_checklist WHERE modulo=? AND registro=?', [mod, id]))?.n ?? 1);
}
export { newId, FECHADA };
