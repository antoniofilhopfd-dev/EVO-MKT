-- Uso de Imagem (etapa 1): alunos cadastrados pelo Marketing e trilha de atividade do módulo.
-- Só o necessário (nome, matrícula, turma, segmento). Alunos nunca são apagados: ficam inativos.
CREATE TABLE IF NOT EXISTS ui_alunos(
  id INT NOT NULL AUTO_INCREMENT,
  matricula VARCHAR(40) NOT NULL,
  nome VARCHAR(160) NOT NULL,
  turma VARCHAR(60) NOT NULL DEFAULT '',
  segmento VARCHAR(20) NOT NULL DEFAULT '',
  ativo TINYINT NOT NULL DEFAULT 1,
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  atualizado_em VARCHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_ui_matricula (matricula),
  KEY ix_ui_nome (nome),
  KEY ix_ui_turma (turma)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ui_eventos(
  id INT NOT NULL AUTO_INCREMENT,
  quando VARCHAR(40) NOT NULL DEFAULT '',
  ator VARCHAR(120) NOT NULL DEFAULT '',
  acao VARCHAR(40) NOT NULL DEFAULT '',
  aluno_id INT NULL,
  detalhe VARCHAR(400) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_ui_ev_quando (quando)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
