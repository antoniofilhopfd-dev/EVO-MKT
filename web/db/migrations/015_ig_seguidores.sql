-- Foto diária de seguidores do Instagram (a Meta não entrega histórico: o sistema passa a guardar a cada sincronização).
CREATE TABLE IF NOT EXISTS ig_seguidores(dia VARCHAR(10) NOT NULL,seguidores INT NOT NULL DEFAULT 0,seguindo INT NOT NULL DEFAULT 0,midias INT NOT NULL DEFAULT 0,atualizado_em VARCHAR(40) NOT NULL,PRIMARY KEY(dia)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
