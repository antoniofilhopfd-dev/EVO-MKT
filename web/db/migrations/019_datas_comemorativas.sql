-- Datas Comemorativas: o catálogo e as regras de cálculo ficam no código (sem copiar datas por ano para o banco);
-- aqui ficam só os ajustes da equipe sobre o catálogo (relevância/observações) e as categorias criadas por ela.
-- As datas personalizadas são registros do módulo "datacom" (tabela records), com regra de recorrência.
CREATE TABLE IF NOT EXISTS datacom_ajustes(catalogo_id VARCHAR(80) NOT NULL,relevante VARCHAR(3) NOT NULL DEFAULT '',observacoes TEXT NOT NULL,atualizado_em VARCHAR(40) NOT NULL DEFAULT '',atualizado_por VARCHAR(60) NOT NULL DEFAULT '',PRIMARY KEY(catalogo_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS datacom_categorias(codigo VARCHAR(40) NOT NULL,nome VARCHAR(80) NOT NULL,criado_em VARCHAR(40) NOT NULL DEFAULT '',criado_por VARCHAR(60) NOT NULL DEFAULT '',PRIMARY KEY(codigo)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
