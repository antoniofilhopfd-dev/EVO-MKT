-- Histórico das 26 abas de métricas e marketing, separado dos dados sincronizados com a API Meta.
-- Chave estável por arquivo/aba/linha: importações repetidas não geram novas linhas.
-- Nunca sobrescreve ig_posts, ig_seguidores ou métricas oriundas da Meta.
CREATE TABLE IF NOT EXISTS instagram_historico_planilhas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  arquivo VARCHAR(180) NOT NULL,
  aba VARCHAR(180) NOT NULL,
  linha_origem INT UNSIGNED NOT NULL,
  conta VARCHAR(80) NULL,
  categoria VARCHAR(48) NOT NULL DEFAULT 'historico',
  data_referencia VARCHAR(40) NULL,
  identificador VARCHAR(255) NULL,
  valores_json LONGTEXT NOT NULL,
  atualizado_em VARCHAR(40) NOT NULL,
  UNIQUE KEY uk_ig_planilha_origem (arquivo, aba, linha_origem),
  KEY ix_ig_planilha_conta_data (conta, data_referencia),
  KEY ix_ig_planilha_categoria (categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
