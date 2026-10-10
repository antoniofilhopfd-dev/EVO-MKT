-- Registro de cada execução de backup/validação/restauração (sucesso ou erro).
CREATE TABLE IF NOT EXISTS backup_log(id BIGINT AUTO_INCREMENT PRIMARY KEY,quando VARCHAR(40) NOT NULL,acao VARCHAR(20) NOT NULL,nome VARCHAR(120) NOT NULL,status VARCHAR(10) NOT NULL,detalhe VARCHAR(500) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
