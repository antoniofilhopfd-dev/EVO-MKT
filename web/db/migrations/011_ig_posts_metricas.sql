-- Métricas por publicação (miniatura, alcance, salvamentos, compartilhamentos) para a tela "Desempenho" do Instagram.
ALTER TABLE ig_posts ADD COLUMN miniatura VARCHAR(1000) NOT NULL DEFAULT '';
ALTER TABLE ig_posts ADD COLUMN alcance INT NULL;
ALTER TABLE ig_posts ADD COLUMN salvos INT NOT NULL DEFAULT 0;
ALTER TABLE ig_posts ADD COLUMN compartilhamentos INT NOT NULL DEFAULT 0;
