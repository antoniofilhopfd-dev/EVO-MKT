-- Métricas semanais de cada conta do Instagram (domingo a sábado), lidas da Meta. Nada é estimado: sem leitura, não há linha.
CREATE TABLE IF NOT EXISTS ig_conta_semana(
  conta VARCHAR(40) NOT NULL,
  inicio VARCHAR(10) NOT NULL,
  fim VARCHAR(10) NOT NULL,
  alcance BIGINT NULL,
  visualizacoes BIGINT NULL,
  visitas_perfil BIGINT NULL,
  interacoes BIGINT NULL,
  curtidas BIGINT NULL,
  comentarios BIGINT NULL,
  compartilhamentos BIGINT NULL,
  salvamentos BIGINT NULL,
  atualizado_em VARCHAR(40) NOT NULL,
  PRIMARY KEY (conta, inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
