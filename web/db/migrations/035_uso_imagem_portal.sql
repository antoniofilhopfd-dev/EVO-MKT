-- Uso de Imagem (etapa 3): acesso do responsável por link único + código, decisão (autorizo / não autorizo), assinatura e validação.
-- O token do link e o código nunca ficam guardados em texto: só o hash. Arquivos (assinatura, PDF) ficam na tabela `arquivos`.
ALTER TABLE ui_solicitacoes
  ADD COLUMN enviado_em VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN enviado_canal VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN aberto_em VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN decisao VARCHAR(16) NOT NULL DEFAULT '',
  ADD COLUMN decisao_em VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN resp_confirmado VARCHAR(160) NOT NULL DEFAULT '',
  ADD COLUMN parentesco VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN modalidade VARCHAR(12) NOT NULL DEFAULT '',
  ADD COLUMN ip_decisao VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN ua_decisao VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN validado_por VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN validado_em VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN validacao_obs VARCHAR(400) NOT NULL DEFAULT '',
  ADD COLUMN final_hash CHAR(64) NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS ui_acessos(
  id INT NOT NULL AUTO_INCREMENT,
  solicitacao_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  codigo_hash CHAR(64) NOT NULL,
  expira_em VARCHAR(40) NOT NULL,
  tentativas INT NOT NULL DEFAULT 0,
  ativo TINYINT NOT NULL DEFAULT 1,
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  criado_por VARCHAR(120) NOT NULL DEFAULT '',
  ultimo_acesso VARCHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_ui_acesso_token (token_hash),
  KEY ix_ui_acesso_sol (solicitacao_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ui_arquivos(
  id INT NOT NULL AUTO_INCREMENT,
  solicitacao_id INT NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  caminho VARCHAR(255) NOT NULL,
  nome VARCHAR(160) NOT NULL DEFAULT '',
  sha256 CHAR(64) NOT NULL DEFAULT '',
  tamanho INT NOT NULL DEFAULT 0,
  info VARCHAR(400) NOT NULL DEFAULT '',
  ativo TINYINT NOT NULL DEFAULT 1,
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  ip VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_ui_arq_sol (solicitacao_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
