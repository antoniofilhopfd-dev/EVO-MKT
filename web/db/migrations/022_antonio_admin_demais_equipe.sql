-- Decisão de 18/10/2026: Antônio Filho (ANT-3302) é o Administrador; as demais fichas internas passam a Equipe de Marketing.
-- Só rebaixa as outras depois de confirmar que o Administrador existe e está ativo (nunca deixa o sistema sem administração). Não mexe em senhas nem em outras fichas (Portal).
UPDATE users SET role='manager',admin=1,label='Administrador' WHERE codigo='ANT-3302' AND ativo=1;
UPDATE users u JOIN users a ON a.codigo='ANT-3302' AND a.ativo=1 AND a.role='manager' AND a.admin=1 SET u.role='team',u.admin=0,u.label='Equipe de Marketing' WHERE u.codigo<>'ANT-3302';
