-- Seguidores que cada publicação gerou ("follows") e visitas ao perfil vindas dela ("profile_visits"). Nulo quando a Meta não informa.
ALTER TABLE ig_posts ADD COLUMN seguidores_novos BIGINT NULL;
ALTER TABLE ig_posts ADD COLUMN visitas_perfil BIGINT NULL;
