-- Carômetro Escolar: lote de fotos de uma turma só ("turma por turma").
ALTER TABLE cm_lotes ADD COLUMN turma VARCHAR(60) NULL DEFAULT NULL;
