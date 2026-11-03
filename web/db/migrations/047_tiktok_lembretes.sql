-- TikTok manual: livro-razão de lembretes. Migração aditiva; não executa cron nem publica mídia.
CREATE TABLE IF NOT EXISTS tiktok_reminder_events (
  chave CHAR(64) NOT NULL,
  conteudo_id VARCHAR(64) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  destino VARCHAR(120) NOT NULL,
  agendado_em VARCHAR(40) NOT NULL,
  gerado_em VARCHAR(40) NOT NULL,
  PRIMARY KEY (chave),
  KEY ix_tiktok_reminder_conteudo (conteudo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
