-- Data em que o responsável escolheu AUTORIZO: vai preenchida no PDF que ele baixa para assinar no GOV.BR (o PDF assinado não pode ser alterado depois).
ALTER TABLE ui_solicitacoes ADD COLUMN autorizo_em VARCHAR(40) NOT NULL DEFAULT '';
