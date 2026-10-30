-- Carômetro Escolar (etapa 2): fotos dos alunos com histórico de versões e trilha de auditoria.
-- Os arquivos ficam na tabela `arquivos` (nunca em URL pública); aqui só o registro e o caminho.
CREATE TABLE IF NOT EXISTS cm_fotos(
  id INT NOT NULL AUTO_INCREMENT,
  aluno_id INT NOT NULL,
  versao INT NOT NULL DEFAULT 1,
  caminho_original VARCHAR(255) NOT NULL,
  caminho_padrao VARCHAR(255) NOT NULL,
  caminho_mini VARCHAR(255) NOT NULL,
  nome_original VARCHAR(160) NOT NULL DEFAULT '',
  mime VARCHAR(40) NOT NULL DEFAULT '',
  largura INT NOT NULL DEFAULT 0,
  altura INT NOT NULL DEFAULT 0,
  tamanho INT NOT NULL DEFAULT 0,
  sha256 CHAR(64) NOT NULL DEFAULT '',
  origem VARCHAR(40) NOT NULL DEFAULT 'envio-individual',
  aviso VARCHAR(200) NOT NULL DEFAULT '',
  ativa TINYINT NOT NULL DEFAULT 0,
  enviado_por VARCHAR(120) NOT NULL DEFAULT '',
  enviado_em VARCHAR(40) NOT NULL DEFAULT '',
  desativada_em VARCHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_cm_foto_aluno (aluno_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS cm_auditoria(
  id INT NOT NULL AUTO_INCREMENT,
  quando VARCHAR(40) NOT NULL DEFAULT '',
  ator VARCHAR(120) NOT NULL DEFAULT '',
  acao VARCHAR(40) NOT NULL DEFAULT '',
  aluno_id INT NULL,
  detalhe VARCHAR(400) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_cm_aud_quando (quando)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
