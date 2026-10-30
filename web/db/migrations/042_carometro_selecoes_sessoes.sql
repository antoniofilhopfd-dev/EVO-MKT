-- Carômetro Escolar (etapa 4): seleções salvas (várias turmas) e sessões de fotos por turma.
CREATE TABLE IF NOT EXISTS cm_selecoes(
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  dono VARCHAR(40) NOT NULL DEFAULT '',
  dono_nome VARCHAR(120) NOT NULL DEFAULT '',
  compartilhada TINYINT NOT NULL DEFAULT 0,
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  atualizado_em VARCHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS cm_selecao_itens(
  selecao_id INT NOT NULL,
  aluno_id INT NOT NULL,
  PRIMARY KEY (selecao_id, aluno_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS cm_sessoes(
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  data VARCHAR(10) NOT NULL DEFAULT '',
  turma VARCHAR(60) NOT NULL DEFAULT '',
  status VARCHAR(12) NOT NULL DEFAULT 'aberta',
  obs VARCHAR(400) NOT NULL DEFAULT '',
  criado_por VARCHAR(120) NOT NULL DEFAULT '',
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS cm_sessao_itens(
  sessao_id INT NOT NULL,
  aluno_id INT NOT NULL,
  situacao VARCHAR(12) NOT NULL DEFAULT 'pendente',
  PRIMARY KEY (sessao_id, aluno_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
