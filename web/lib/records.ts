import { registrarNotificacao } from './notificacoes';
import { q, q1, run, withTx } from './db';
import { cleanInput, currentIp, fail, lower, now, Row, strv } from './util';
import { validarTransicaoSolicitacao } from './fluxo';
import { automacaoAtiva, checarDependenciaAoConcluir, dadosTarefaDaSolicitacao, proximaOcorrencia, validarVinculosTarefa } from './trabalho';
import { notifyMail } from './mail';
import { env, envInt } from './util';

export const EVO_VERSION = '5.0.0-web';
export const MODULES: Record<string, string> = {
  agenda: 'AGE', aprovacoes: 'APR', arquivos: 'ARQ', calendario: 'CAL', campanhas: 'CAM', configuracoes: 'CFG', conteudos: 'CON',
  equipe: 'EQP', eventos: 'EVT', ideias: 'IDE', instagram: 'INS', integracoes: 'INT', lixeira: 'LIX', projetos: 'PRJ',
  relatorios: 'REL', solicitacoes: 'SOL', tarefas: 'TAR', templates: 'TPL', trafego: 'TRF',
};
export const BASE_HEADERS = ['id', 'titulo', 'status', 'prioridade', 'responsavel', 'segmento', 'dataInicio', 'prazo', 'descricao', 'tags', 'origem', 'idExterno', 'ultimaSincronizacao', 'criadoEm', 'atualizadoEm'];
export const TEAM_WRITE = ['agenda', 'calendario', 'tarefas', 'projetos', 'eventos', 'conteudos', 'ideias', 'campanhas', 'aprovacoes', 'instagram', 'trafego', 'templates', 'arquivos', 'solicitacoes', 'relatorios'];
export const PUBLIC_FIELDS = ['id', 'titulo', 'status', 'prioridade', 'responsavel', 'segmento', 'solicitante', 'prazo', 'descricao', 'criadoEm', 'atualizadoEm', 'tipoSolicitacao', 'objetivo', 'publicoAlvo', 'mensagemPrincipal', 'canal', 'slaDias', 'prazoSLA', 'prazoNegociado', 'referencias', 'anexos', 'triagemStatus', 'retornoSolicitante', 'respostaSolicitante', 'npsNota', 'npsComentario', 'aprovacaoSolicitante', 'motivoUrgencia', 'distribuidoEm', 'ajusteSolicitadoEm', 'respondidoSolicitanteEm', 'entregaEm', 'entregaEnviadaEm', 'aprovadoSolicitanteEm', 'arquivosEntrega', 'entregaMensagem', 'recorrente', 'recorrenciaFrequencia', 'recorrenciaFim', 'solicitanteNome', 'avaliacaoNota', 'avaliacaoComentario', 'avaliadoEm', 'npsNota', 'npsComentario'];
export const CREATE_FIELDS = ['titulo', 'tipoSolicitacao', 'segmento', 'objetivo', 'publicoAlvo', 'mensagemPrincipal', 'canal', 'prazo', 'prioridade', 'motivoUrgencia', 'referencias', 'slaDias', 'prazoSLA', 'aprovacaoSolicitante', 'recorrente', 'recorrenciaFrequencia', 'recorrenciaFim', 'solicitanteNome'];
export const UPDATE_FIELDS = ['respostaSolicitante', 'respondidoSolicitanteEm', 'aprovacaoSolicitante', 'aprovadoSolicitanteEm', 'avaliacaoNota', 'avaliacaoComentario', 'avaliadoEm', 'npsNota', 'npsComentario'];
export const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'psd', 'ai', 'svg', 'mp3', 'wav'];

export async function audit(ator: string, acao: string, mod = '', id = ''): Promise<void> {
  try {
    await run('INSERT INTO audit_log(quando,ator,acao,modulo,registro,ip) VALUES(?,?,?,?,?,?)', [now(), ator, acao, mod, id, currentIp()]);
  } catch {
    /* auditoria nunca derruba a operação */
  }
}

// ---------- IDs: únicos, sequenciais por módulo, nunca reutilizados ----------
export async function newId(mod: string): Promise<string> {
  const pre = MODULES[mod];
  for (let i = 0; i < 50; i++) {
    const id = await withTx(async (c) => {
      const [rs] = await c.query('SELECT n FROM id_counters WHERE modulo=? FOR UPDATE', [mod]);
      const cur = (rs as Row[])[0];
      const n = (cur ? Number(cur.n) : 0) + 1;
      if (cur) await c.query('UPDATE id_counters SET n=? WHERE modulo=?', [n, mod]);
      else await c.query('INSERT INTO id_counters(modulo,n) VALUES(?,?)', [mod, n]);
      const cand = `${pre}-${String(n).padStart(4, '0')}`;
      const [used] = await c.query('SELECT 1 FROM used_ids WHERE id=?', [cand]);
      if ((used as Row[]).length) return null;
      await c.query('INSERT INTO used_ids(id) VALUES(?)', [cand]);
      return cand;
    });
    if (id) return id;
  }
  return fail(500, 'Não foi possível gerar um ID único.');
}

// ---------- registros ----------
export async function headersOf(mod: string): Promise<string[]> {
  const r = await q1<{ headers: string }>('SELECT headers FROM module_headers WHERE modulo=?', [mod]);
  const h = r ? JSON.parse(r.headers) : [];
  return Array.isArray(h) && h.length ? h : BASE_HEADERS;
}
type Exec = { query: (sql: string, p?: unknown[]) => Promise<unknown> };
export async function mergeHeaders(mod: string, keys: string[], c?: Exec): Promise<void> {
  const h = await headersOf(mod);
  const add = keys.filter((k) => !h.includes(k));
  if (!add.length) return;
  const sql = 'INSERT INTO module_headers(modulo,headers) VALUES(?,?) ON DUPLICATE KEY UPDATE headers=VALUES(headers)';
  const args = [mod, JSON.stringify([...h, ...add])];
  if (c) await c.query(sql, args);
  else await run(sql, args);
}
export async function listRows(mod: string): Promise<Row[]> {
  return (await q<{ data: string }>('SELECT data FROM records WHERE modulo=? ORDER BY criado_em,id', [mod])).map((r) => JSON.parse(r.data));
}
export async function getRow(mod: string, id: string): Promise<Row | null> {
  const r = await q1<{ data: string }>('SELECT data FROM records WHERE modulo=? AND id=?', [mod, id]);
  return r ? JSON.parse(r.data) : null;
}
export async function insertRow(mod: string, input: Row, ator: string): Promise<Row> {
  const clean = cleanInput(input);
  delete clean.id;
  if (mod === 'tarefas') await validarVinculosTarefa('', clean);
  const id = await newId(mod);
  const t = now();
  const row: Row = { id, ...clean, criadoEm: t, atualizadoEm: t, criadoPor: ator };
  // registro, cabeçalhos e status inicial: tudo ou nada
  await withTx(async (c) => {
    await c.query('INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES(?,?,?,?,?)', [mod, id, JSON.stringify(row), t, t]);
    await mergeHeaders(mod, Object.keys(row), c);
    if (row.status) await logStatus(c, mod, id, '', String(row.status), ator, 'criação');
  });
  await audit(ator, 'criar', mod, id);
  return row;
}
/** Registra uma mudança de status (na mesma transação quando `c` é informado). */
export async function logStatus(c: { query: (sql: string, p: unknown[]) => Promise<unknown> } | null, mod: string, id: string, de: string, para: string, ator: string, motivo = '', campo = 'status'): Promise<void> {
  const sql = 'INSERT INTO status_history(modulo,registro,campo,de,para,ator,quando,motivo) VALUES(?,?,?,?,?,?,?,?)';
  const p = [mod, id, campo, de.slice(0, 120), para.slice(0, 120), ator.slice(0, 120), now(), motivo.slice(0, 500)];
  if (c) await c.query(sql, p);
  else await run(sql, p);
}
export async function saveRow(mod: string, row: Row): Promise<void> {
  await run('UPDATE records SET data=?,atualizado_em=? WHERE modulo=? AND id=?', [JSON.stringify(row), row.atualizadoEm, mod, row.id]);
  await mergeHeaders(mod, Object.keys(row));
}
/** Lê o registro com trava (SELECT … FOR UPDATE), aplica `fn` e grava: duas edições simultâneas não se sobrescrevem. */
export async function modifyRow(mod: string, id: string, fn: (cur: Row, c: any) => Row | Promise<Row>): Promise<Row> {
  const nw = await withTx(async (c) => {
    const [rs] = await c.query('SELECT data FROM records WHERE modulo=? AND id=? FOR UPDATE', [mod, id]);
    const cur = (rs as Row[])[0];
    if (!cur) fail(404, 'Registro não encontrado.');
    const merged = await fn(JSON.parse(cur.data), c);
    await c.query('UPDATE records SET data=?,atualizado_em=? WHERE modulo=? AND id=?', [JSON.stringify(merged), merged.atualizadoEm, mod, id]);
    return merged;
  });
  await mergeHeaders(mod, Object.keys(nw));
  return nw;
}
export async function updateRow(mod: string, id: string, patchIn: Row, ator: string): Promise<Row> {
  const patch = cleanInput(patchIn);
  for (const k of ['id', 'criadoEm', 'criadoPor', 'atualizadoPor']) delete patch[k];
  const motivoInformado = strv(patch.motivoTransicao);
  delete patch.motivoTransicao;
  let prev: Row = {};
  const nw = await modifyRow(mod, id, async (cur, c) => {
    prev = cur;
    if (patch.status !== undefined && String(patch.status) !== String(cur.status ?? '')) {
      let motivo = motivoInformado.trim();
      if (mod === 'solicitacoes') motivo = validarTransicaoSolicitacao(String(cur.status ?? ''), String(patch.status), motivoInformado).motivo;
      await logStatus(c, mod, id, String(cur.status ?? ''), String(patch.status), ator, motivo);
    }
    if (patch.responsavel !== undefined && String(patch.responsavel).trim() !== String(cur.responsavel ?? '').trim() && String(cur.responsavel ?? '').trim() !== '')
      await logStatus(c, mod, id, String(cur.responsavel ?? ''), String(patch.responsavel), ator, motivoInformado.trim(), 'responsavel');
    for (const campo of ['prazo', 'publicacaoEm']) {
      if (patch[campo] !== undefined && strv(patch[campo]) !== strv(cur[campo]) && strv(cur[campo]) !== '') await logStatus(c, mod, id, strv(cur[campo]), strv(patch[campo]), ator, motivoInformado.trim(), campo);
    }
    const merged: Row = { ...cur, ...patch, atualizadoEm: now(), atualizadoPor: ator };
    if (mod === 'tarefas') {
      if ('tarefaPaiId' in patch || 'dependeDe' in patch) await validarVinculosTarefa(id, merged);
      const concluindo = /CONCLU/i.test(strv(merged.status)) && !/CONCLU/i.test(strv(cur.status));
      if (concluindo) {
        await checarDependenciaAoConcluir(merged);
        const prox = (await automacaoAtiva('auto_recorrencia')) ? proximaOcorrencia(merged) : null;
        if (prox) {
          const nid = await newId('tarefas');
          const t = now();
          const row: Row = { id: nid, ...prox, criadoEm: t, atualizadoEm: t, criadoPor: 'automacao' };
          await c.query('INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES(?,?,?,?,?)', ['tarefas', nid, JSON.stringify(row), t, t]);
          await logStatus(c, 'tarefas', nid, '', 'NOVO', 'automacao', `Recorrência (${merged.recorrencia}) da tarefa ${id}`);
          merged.proximaCriadaId = nid;
        }
      }
    }
    return merged;
  });
  await audit(ator, 'editar', mod, id);
  if (mod === 'solicitacoes') {
    await avisosDaSolicitacao(prev, nw, ator);
    return (await tarefaDaDemanda(nw, ator)) ?? nw;
  }
  return nw;
}
/** Ao distribuir uma demanda com responsável, cria UMA tarefa vinculada (a demanda guarda o vínculo, então repetir/devolver/reabrir não duplica). */
async function tarefaDaDemanda(sol: Row, ator: string): Promise<Row | null> {
  const st = strv(sol.status).toUpperCase();
  if (!['DISTRIBUÍDA', 'EM EXECUÇÃO'].includes(st) || !strv(sol.responsavel).trim() || sol.tarefaAutoId) return null;
  if (!(await automacaoAtiva('auto_tarefa_solicitacao'))) return null;
  let reivindicou = false;
  const marcada = await modifyRow('solicitacoes', String(sol.id), (cur) => {
    if (cur.tarefaAutoId) return cur;
    reivindicou = true;
    return { ...cur, tarefaAutoId: 'PENDENTE' };
  });
  if (!reivindicou) return marcada;
  const existente = (await listRows('tarefas')).find((t) => String(t.solicitacaoId ?? '') === String(sol.id));
  const tarefa = existente ?? (await insertRow('tarefas', await dadosTarefaDaSolicitacao(sol), 'automacao'));
  return modifyRow('solicitacoes', String(sol.id), (cur) => ({ ...cur, tarefaAutoId: String(tarefa.id) }));
}
async function avisosDaSolicitacao(antes: Row, depois: Row, ator: string): Promise<void> {
  const id = String(depois.id), titulo = String(depois.titulo ?? id), portal = `portal:${depois.segmento ?? ''}`;
  const st = String(depois.status ?? '').toUpperCase();
  if (st !== String(antes.status ?? '').toUpperCase()) {
    if (st === 'AGUARDANDO SOLICITANTE') await registrarNotificacao('complementacao', portal, 'Pedido de complementação', `O Marketing precisa de mais informações em "${titulo}".`, 'solicitacoes', id);
    if (st === 'AGUARDANDO APROVAÇÃO DO SOLICITANTE') await registrarNotificacao('entrega', portal, 'Entrega pronta para aprovação', `A entrega de "${titulo}" aguarda a conferência do solicitante.`, 'solicitacoes', id);
    if (st === 'CONCLUÍDA') await registrarNotificacao('concluida', portal, 'Demanda concluída', `"${titulo}" foi concluída.`, 'solicitacoes', id);
    if (ator.startsWith('portal:') && ['EM ANÁLISE', 'EM EXECUÇÃO', 'CONCLUÍDA'].includes(st)) await registrarNotificacao('resposta_solicitante', 'gerencia', 'Resposta do solicitante', `"${titulo}" teve retorno do solicitante.`, 'solicitacoes', id);
  }
  const novoResp = String(depois.responsavel ?? '').trim();
  if (novoResp && novoResp !== String(antes.responsavel ?? '').trim()) await registrarNotificacao('responsavel', novoResp, 'Demanda atribuída a você', `"${titulo}" agora está com você.`, 'solicitacoes', id);
}
export async function trashRow(mod: string, id: string, ator: string): Promise<void> {
  const cur = (await getRow(mod, id)) ?? fail(404, 'Registro não encontrado.');
  if (mod === 'lixeira') {
    await run('DELETE FROM records WHERE modulo=? AND id=?', ['lixeira', id]);
    if (cur.origem && cur.idOriginal) for (const t of ['status_history', 'record_comments', 'record_checklist']) await run(`DELETE FROM ${t} WHERE modulo=? AND registro=?`, [String(cur.origem), String(cur.idOriginal)]);
    await audit(ator, 'excluir-permanente', 'lixeira', id);
    return;
  }
  const copy: Row = { ...cur };
  delete copy.id;
  copy.origem = mod;
  copy.idOriginal = id;
  await insertRow('lixeira', copy, ator);
  await run('DELETE FROM records WHERE modulo=? AND id=?', [mod, id]);
  await audit(ator, 'lixeira', mod, id);
}
export function publicRow(r: Row): Row {
  const o: Row = {};
  for (const k of PUBLIC_FIELDS) if (k in r) o[k] = r[k];
  return o;
}
export function teamMayDelete(u: Row, row: Row): boolean {
  if (u.role === 'manager') return true;
  const resp = String(row.responsavel ?? '').trim();
  return (row.criadoPor ?? '') === u.codigo || resp === '' || lower(resp) === lower(u.nome);
}

// ---------- e-mail por pessoa / atribuição / fichas da Equipe ----------
export async function emailForPerson(name: string): Promise<string> {
  const n = lower(name.trim());
  if (!n) return '';
  for (const r of await listRows('equipe')) {
    if (lower(String(r.titulo ?? '').trim()) === n && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email ?? '')) return r.email;
  }
  return '';
}
export async function notifyAssignment(mod: string, nw: Row, old: Row | null, actorName: string): Promise<void> {
  if (!['tarefas', 'projetos', 'conteudos', 'eventos', 'solicitacoes', 'agenda'].includes(mod)) return;
  const resp = String(nw.responsavel ?? '').trim();
  if (!resp || lower(resp) === lower(actorName)) return;
  if (old && lower(String(old.responsavel ?? '').trim()) === lower(resp)) return;
  const to = await emailForPerson(resp);
  if (!to) return;
  await notifyMail(`Nova atribuição: ${nw.titulo ?? nw.id}`, `Olá, ${resp}!\n\n${actorName} atribuiu a você: ${nw.titulo ?? ''}\nMódulo: ${mod} · Prazo: ${nw.prazo || '—'}\n\nAcesse o EVO MKT para ver os detalhes.`, to);
}
export async function seedEquipe(ator: string): Promise<number> {
  const have = (await listRows('equipe')).map((r) => lower(String(r.titulo ?? '').trim()));
  let n = 0;
  for (const u of await q('SELECT codigo,nome,role,label FROM users WHERE ativo=1 ORDER BY codigo')) {
    if (have.includes(lower(u.nome))) continue;
    await insertRow('equipe', { titulo: u.nome, status: 'ATIVO', funcao: u.label, nivelAcesso: u.role === 'manager' ? 'Administrador' : 'Marketing', capacidadeSemanal: '40', ativo: 'SIM', email: '', codigoInterno: u.codigo }, ator);
    n++;
  }
  return n;
}
export { env, strv };
