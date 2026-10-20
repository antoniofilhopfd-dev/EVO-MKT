-- Visualizações de cada publicação (métrica "views" da Meta: feed, reels e stories). Fica nulo quando a Meta não informa.
ALTER TABLE ig_posts ADD COLUMN visualizacoes BIGINT NULL;
