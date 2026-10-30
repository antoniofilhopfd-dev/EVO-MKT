-- Carômetro Escolar (etapa 3): importação de fotos em lote com simulação, conciliação e desfazer.
CREATE TABLE IF NOT EXISTS cm_lotes(
  id INT NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(24) NOT NULL,
  estado VARCHAR(16) NOT NULL DEFAULT 'simulado',
  criado_por VARCHAR(120) NOT NULL DEFAULT '',
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  aplicado_em VARCHAR(40) NOT NULL DEFAULT '',
  aplicado_por VARCHAR(120) NOT NULL DEFAULT '',
  desfeito_em VARCHAR(40) NOT NULL DEFAULT '',
  manifesto MEDIUMTEXT NOT NULL,
  resumo VARCHAR(400) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_cm_lote_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS cm_lote_itens(
  id INT NOT NULL AUTO_INCREMENT,
  lote_id INT NOT NULL,
  nome_arquivo VARCHAR(200) NOT NULL DEFAULT '',
  estado VARCHAR(12) NOT NULL DEFAULT 'orfa',
  regra VARCHAR(40) NOT NULL DEFAULT '',
  confianca VARCHAR(8) NOT NULL DEFAULT '',
  aluno_id INT NULL,
  motivo VARCHAR(300) NOT NULL DEFAULT '',
  caminho_original VARCHAR(255) NOT NULL DEFAULT '',
  caminho_padrao VARCHAR(255) NOT NULL DEFAULT '',
  caminho_mini VARCHAR(255) NOT NULL DEFAULT '',
  mime VARCHAR(40) NOT NULL DEFAULT '',
  largura INT NOT NULL DEFAULT 0,
  altura INT NOT NULL DEFAULT 0,
  tamanho INT NOT NULL DEFAULT 0,
  aviso VARCHAR(200) NOT NULL DEFAULT '',
  foto_id INT NULL,
  anterior_id INT NULL,
  PRIMARY KEY (id),
  KEY ix_cm_li_lote (lote_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
