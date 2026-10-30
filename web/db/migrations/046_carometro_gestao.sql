-- Serializa alterações e guarda a política de acesso e a revisão anual.
CREATE TABLE IF NOT EXISTS cm_guard (id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO cm_guard(id) VALUES(1);
CREATE TABLE IF NOT EXISTS cm_permissoes (
 codigo VARCHAR(30) PRIMARY KEY,
 segmentos TEXT NOT NULL,
 consultar TINYINT NOT NULL DEFAULT 1,
 importar TINYINT NOT NULL DEFAULT 0,
 substituir TINYINT NOT NULL DEFAULT 0,
 baixar TINYINT NOT NULL DEFAULT 0,
 imprimir TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS cm_anos (
 ano INT NOT NULL,
 aluno_id INT NOT NULL,
 turma VARCHAR(60) NOT NULL,
 segmento VARCHAR(30) NOT NULL DEFAULT '',
 revisado_por VARCHAR(120) NOT NULL DEFAULT '',
 revisado_em VARCHAR(40) NOT NULL DEFAULT '',
 PRIMARY KEY(ano,aluno_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE cm_lote_itens ADD COLUMN turma_origem VARCHAR(60) NOT NULL DEFAULT '';
ALTER TABLE cm_lote_itens ADD COLUMN arquivo_hash VARCHAR(64) NOT NULL DEFAULT '';
CREATE INDEX ix_cm_item_hash ON cm_lote_itens(lote_id,arquivo_hash);
