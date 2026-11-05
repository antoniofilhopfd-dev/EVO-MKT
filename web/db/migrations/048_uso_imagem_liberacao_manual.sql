CREATE TABLE IF NOT EXISTS ui_liberacoes_manuais (
  aluno_id INT NOT NULL,
  ano SMALLINT NOT NULL,
  status VARCHAR(24) NOT NULL,
  atualizado_em VARCHAR(40) NOT NULL,
  PRIMARY KEY (aluno_id, ano),
  CONSTRAINT fk_ui_liberacao_aluno FOREIGN KEY (aluno_id) REFERENCES ui_alunos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
