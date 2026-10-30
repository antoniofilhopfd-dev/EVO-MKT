-- Carômetro Escolar (etapa 7): referências a pastas do Google Drive. Só a referência: não há sincronização nem credenciais guardadas.
CREATE TABLE IF NOT EXISTS cm_drive_refs(
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  pasta_id VARCHAR(80) NOT NULL,
  obs VARCHAR(300) NOT NULL DEFAULT '',
  estado VARCHAR(20) NOT NULL DEFAULT 'nao_verificada',
  conferida_em VARCHAR(40) NOT NULL DEFAULT '',
  conferida_por VARCHAR(120) NOT NULL DEFAULT '',
  criado_por VARCHAR(120) NOT NULL DEFAULT '',
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  ativo TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cm_drive_pasta (pasta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
