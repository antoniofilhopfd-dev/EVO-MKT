-- Uso de Imagem (etapa 4): vencimento, revogação, lembretes e cancelamento com motivo.
ALTER TABLE ui_solicitacoes
  ADD COLUMN vence_em VARCHAR(10) NOT NULL DEFAULT '',
  ADD COLUMN revogado_em VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN revogado_por VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN revogado_motivo VARCHAR(400) NOT NULL DEFAULT '',
  ADD COLUMN lembretes INT NOT NULL DEFAULT 0,
  ADD COLUMN ultimo_lembrete VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN cancelado_motivo VARCHAR(400) NOT NULL DEFAULT '';
