import { now } from './util';

export const anoLiberacao = () => Number(now().slice(0, 4));

/** A resposta mais recente prevalece. A marcação interna vale para o ano letivo corrente. */
export const joinsLiberacao = `LEFT JOIN ui_solicitacoes s ON s.id=(
  SELECT MAX(ultima.id) FROM ui_solicitacoes ultima
  WHERE ultima.aluno_id=a.id AND ultima.status<>'CANCELADO'
)
LEFT JOIN ui_liberacoes_manuais m ON m.aluno_id=a.id AND m.ano=?
  AND (s.id IS NULL OR m.atualizado_em > s.atualizado_em
    OR (m.atualizado_em = s.atualizado_em AND s.status NOT IN ('NAO_AUTORIZADO','REVOGADO','VENCIDO')))`;
export const statusLiberacao = "COALESCE(m.status, s.status)";
export const venceLiberacao = "CASE WHEN m.aluno_id IS NULL THEN s.vence_em ELSE CONCAT(m.ano, '-12-31') END";
