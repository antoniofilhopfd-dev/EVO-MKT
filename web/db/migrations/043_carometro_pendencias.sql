-- Carômetro Escolar (etapa 6): pendências que a equipe decidiu deixar como estão (com motivo e autoria).
CREATE TABLE IF NOT EXISTS cm_pendencias_ign(
  chave VARCHAR(60) NOT NULL,
  motivo VARCHAR(300) NOT NULL DEFAULT '',
  por VARCHAR(120) NOT NULL DEFAULT '',
  em VARCHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
