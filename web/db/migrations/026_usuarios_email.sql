-- E-mail passa a ficar na ficha do usuário interno (antes ficava na ficha do módulo Equipe, que deixa de existir).
ALTER TABLE users ADD COLUMN email VARCHAR(190) NOT NULL DEFAULT '';
UPDATE users u JOIN records r ON r.modulo='equipe' AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.titulo')))=LOWER(u.nome) SET u.email=JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.email')) WHERE JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.email')) LIKE '%@%' AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.email')))<=190;
