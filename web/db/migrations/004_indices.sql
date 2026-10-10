-- Índices para as consultas reais (a versão anterior só tinha chaves primárias). Idempotente: o runner tolera "índice já existe".
CREATE INDEX idx_records_modulo_criado ON records(modulo, criado_em);
CREATE INDEX idx_audit_ator_acao ON audit_log(ator, acao);
CREATE INDEX idx_audit_acao ON audit_log(acao);
CREATE INDEX idx_attempts_chave ON login_attempts(chave, quando);
CREATE INDEX idx_sessions_codigo ON sessions(codigo);
CREATE INDEX idx_sessions_expira ON sessions(expira);
CREATE INDEX idx_devices_codigo ON trusted_devices(codigo);
CREATE INDEX idx_users_hmac ON users(acesso_hmac);
CREATE INDEX idx_portal_hmac ON portal_users(acesso_hmac);
