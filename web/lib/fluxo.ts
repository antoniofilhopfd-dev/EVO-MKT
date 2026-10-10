import { fail, HttpError } from './util';

/**
 * FONTE ÚNICA das regras de fluxo de status (servidor). O navegador e o Portal leem isto em /api/fluxo.
 * - Solicitações: transições ESTRITAS (grafo abaixo).
 * - Demais módulos: os status são livres (as etapas de cada fluxo de trabalho vêm da configuração de Fluxos),
 *   mas TODA mudança é registrada no histórico (status_history).
 */
export const STATUS_SOLICITACAO = [
  'NOVA', 'AGUARDANDO TRIAGEM', 'EM ANÁLISE', 'DISTRIBUÍDA', 'EM EXECUÇÃO', 'AGUARDANDO SOLICITANTE',
  'AGUARDANDO APROVAÇÃO DO SOLICITANTE', 'CONCLUÍDA', 'CANCELADA',
] as const;

export const STATUS_BY_MODULE: Record<string, string[]> = {
  conteudos: ['IDEIA', 'BRIEFING', 'PRODUÇÃO', 'REVISÃO', 'APROVADO', 'PROGRAMADO', 'PUBLICADO', 'ARQUIVADO'],
  tarefas: ['NOVO', 'EM ANDAMENTO', 'BLOQUEADO', 'CONCLUÍDO', 'CANCELADO'],
  projetos: ['PLANEJAMENTO', 'EM ANDAMENTO', 'EM RISCO', 'PAUSADO', 'CONCLUÍDO', 'ARQUIVADO'],
  aprovacoes: ['AGUARDANDO APROVAÇÃO', 'AJUSTES SOLICITADOS', 'APROVADO', 'REPROVADO'],
  eventos: ['PRÉ-EVENTO', 'DURANTE', 'PÓS-EVENTO', 'CONCLUÍDO', 'CANCELADO'],
  campanhas: ['PLANEJAMENTO', 'ATIVA', 'PAUSADA', 'CONCLUÍDA', 'ARQUIVADA'],
  ideias: ['IDEIA', 'PRIORIZADA', 'EM PRODUÇÃO', 'UTILIZADA', 'ARQUIVADA'],
  solicitacoes: [...STATUS_SOLICITACAO],
  calendario: ['PLANEJADO', 'CONFIRMADO', 'REALIZADO', 'CANCELADO'],
  integracoes: ['DESCONECTADO', 'PREPARADO', 'CONECTADO', 'ERRO'],
};

export const FINAL_SOLICITACAO = ['CONCLUÍDA', 'CANCELADA'];
/** Etapas em que o relógio do SLA fica parado (esperando o solicitante). */
export const PAUSA_SLA = ['AGUARDANDO SOLICITANTE'];

/** de → [para...]. Marcadas com "retorno" exigem justificativa (motivo). */
const T: Record<string, { to: string; retorno?: boolean }[]> = {
  'NOVA': [{ to: 'AGUARDANDO TRIAGEM' }, { to: 'CANCELADA' }],
  'AGUARDANDO TRIAGEM': [{ to: 'EM ANÁLISE' }, { to: 'DISTRIBUÍDA' }, { to: 'EM EXECUÇÃO' }, { to: 'AGUARDANDO SOLICITANTE' }, { to: 'CANCELADA' }],
  'EM ANÁLISE': [{ to: 'DISTRIBUÍDA' }, { to: 'EM EXECUÇÃO' }, { to: 'AGUARDANDO SOLICITANTE' }, { to: 'CANCELADA' }, { to: 'AGUARDANDO TRIAGEM', retorno: true }],
  'DISTRIBUÍDA': [{ to: 'EM EXECUÇÃO' }, { to: 'AGUARDANDO SOLICITANTE' }, { to: 'CANCELADA' }, { to: 'EM ANÁLISE', retorno: true }],
  'EM EXECUÇÃO': [{ to: 'AGUARDANDO SOLICITANTE' }, { to: 'AGUARDANDO APROVAÇÃO DO SOLICITANTE' }, { to: 'CONCLUÍDA' }, { to: 'CANCELADA' }, { to: 'EM ANÁLISE', retorno: true }],
  'AGUARDANDO SOLICITANTE': [{ to: 'EM ANÁLISE' }, { to: 'EM EXECUÇÃO' }, { to: 'CANCELADA' }],
  'AGUARDANDO APROVAÇÃO DO SOLICITANTE': [{ to: 'CONCLUÍDA' }, { to: 'EM EXECUÇÃO', retorno: true }, { to: 'CANCELADA' }],
  'CONCLUÍDA': [{ to: 'EM EXECUÇÃO', retorno: true }],
  'CANCELADA': [{ to: 'AGUARDANDO TRIAGEM', retorno: true }],
};
export const TRANSICOES_SOLICITACAO = T;

export interface Mudanca { de: string; para: string; motivo: string }

/**
 * Valida a mudança de status de uma solicitação. Lança 409 se a transição não existir
 * ou se for um "retorno" sem motivo (resposta traz { motivo: true } para o navegador pedir a justificativa).
 */
export function validarTransicaoSolicitacao(de: string, para: string, motivoInformado: string, auto = false): { motivo: string } {
  const atual = (de || 'AGUARDANDO TRIAGEM').toUpperCase();
  const novo = para.toUpperCase();
  if (!(STATUS_SOLICITACAO as readonly string[]).includes(novo)) fail(400, `Status inválido para solicitação: ${para}.`);
  if (atual === novo) return { motivo: '' };
  const regra = (T[atual] ?? []).find((x) => x.to === novo);
  if (!regra) {
    const ok = (T[atual] ?? []).map((x) => x.to).join(', ') || 'nenhuma';
    fail(409, `Transição não permitida: ${atual} → ${novo}. A partir de ${atual} é possível ir para: ${ok}.`);
  }
  const motivo = motivoInformado.trim();
  if (regra.retorno && !auto && motivo.length < 3) {
    throw new HttpError(409, `Informe o motivo para voltar ${atual} → ${novo}.`, { motivo: true });
  }
  return { motivo };
}

/** Texto único dos status, enviado ao navegador e ao Portal. */
export function fluxoPublico() {
  return { status: STATUS_BY_MODULE, solicitacoes: { transicoes: T, finais: FINAL_SOLICITACAO, pausaSla: PAUSA_SLA } };
}
