-- Várias contas de Instagram: posts e fotos de seguidores passam a pertencer a uma conta (o que já existia fica na conta em uso).
ALTER TABLE ig_posts ADD COLUMN conta VARCHAR(40) NOT NULL DEFAULT '';
UPDATE ig_posts SET conta=COALESCE((SELECT v FROM integration_settings WHERE k='ig_user_id'),'') WHERE conta='';
ALTER TABLE ig_seguidores ADD COLUMN conta VARCHAR(40) NOT NULL DEFAULT '';
UPDATE ig_seguidores SET conta=COALESCE((SELECT v FROM integration_settings WHERE k='ig_user_id'),'') WHERE conta='';
ALTER TABLE ig_seguidores DROP PRIMARY KEY, ADD PRIMARY KEY(conta,dia);
