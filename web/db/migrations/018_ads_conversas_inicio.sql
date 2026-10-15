-- Tráfego: conversas iniciadas (separadas de leads) e data de início de campanhas/anúncios, para ordenar e mostrar no painel.
ALTER TABLE ads_snapshots ADD COLUMN conversas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ads_snapshots ADD COLUMN inicio VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE ads_diario ADD COLUMN conversas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ads_anuncios ADD COLUMN conversas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ads_anuncios ADD COLUMN inicio VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE ads_anuncios ADD COLUMN ativo TINYINT NOT NULL DEFAULT 1;
