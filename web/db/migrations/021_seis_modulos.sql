-- Dois perfis operacionais: Administrador e Equipe de Marketing. A Gerente sem administração (criada na 020) passa a Equipe, que agora opera Instagram, Tráfego e Calendário.
UPDATE users SET role='team',label='Equipe de Marketing' WHERE role='manager' AND admin=0;
-- Biblioteca de Arquivos: nome de exibição e pasta (a renomeação não muda o caminho, para não quebrar referências).
ALTER TABLE arquivos ADD COLUMN nome VARCHAR(190) NULL;
ALTER TABLE arquivos ADD COLUMN pasta VARCHAR(120) NOT NULL DEFAULT '';
-- Preferências por usuário (layout do Tráfego, colunas, filtros salvos, visões).
CREATE TABLE IF NOT EXISTS user_prefs(codigo VARCHAR(64) NOT NULL,chave VARCHAR(120) NOT NULL,valor MEDIUMTEXT NOT NULL,atualizado VARCHAR(40) NOT NULL,PRIMARY KEY(codigo,chave)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
