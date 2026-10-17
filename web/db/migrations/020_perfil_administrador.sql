-- Separa Administrador de Gerente sem mudar o login: ambos continuam role='manager'; a coluna admin marca quem administra o sistema.
-- Compatibilidade: todas as Gerentes atuais viram Administradoras (nada deixa de funcionar); novas fichas podem ser só Gerente.
ALTER TABLE users ADD COLUMN admin TINYINT NOT NULL DEFAULT 0;
UPDATE users SET admin=1 WHERE role='manager';
