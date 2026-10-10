-- Histórico de mudanças de status e de responsável (qualquer módulo): base do SLA, da linha do tempo e dos indicadores.
CREATE TABLE IF NOT EXISTS status_history(id BIGINT AUTO_INCREMENT PRIMARY KEY,modulo VARCHAR(64) NOT NULL,registro VARCHAR(64) NOT NULL,campo VARCHAR(20) NOT NULL DEFAULT 'status',de VARCHAR(120) NOT NULL,para VARCHAR(120) NOT NULL,ator VARCHAR(120) NOT NULL,quando VARCHAR(40) NOT NULL,motivo VARCHAR(500) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_history_registro ON status_history(modulo, registro, id);
CREATE INDEX idx_history_quando ON status_history(modulo, quando);
