-- Uso de Imagem (etapa 2): modelos de termo, solicitações por aluno (texto congelado, versão e hash) e trilha de auditoria por solicitação.
CREATE TABLE IF NOT EXISTS ui_modelos(
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  tipo VARCHAR(16) NOT NULL DEFAULT 'PADRAO',
  finalidade TEXT NOT NULL,
  canais VARCHAR(500) NOT NULL DEFAULT '',
  local_uso VARCHAR(200) NOT NULL DEFAULT '',
  periodo_tipo VARCHAR(16) NOT NULL DEFAULT 'INDETERMINADO',
  periodo_valor VARCHAR(12) NOT NULL DEFAULT '',
  observacoes TEXT NOT NULL,
  corpo MEDIUMTEXT NOT NULL,
  versao INT NOT NULL DEFAULT 1,
  ativo TINYINT NOT NULL DEFAULT 1,
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  atualizado_em VARCHAR(40) NOT NULL DEFAULT '',
  atualizado_por VARCHAR(120) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_ui_modelo_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ui_solicitacoes(
  id INT NOT NULL AUTO_INCREMENT,
  protocolo VARCHAR(24) NOT NULL DEFAULT '',
  aluno_id INT NOT NULL,
  modelo_id INT NOT NULL,
  modelo_nome VARCHAR(120) NOT NULL DEFAULT '',
  modelo_versao INT NOT NULL DEFAULT 1,
  termo_texto MEDIUMTEXT NOT NULL,
  termo_hash CHAR(64) NOT NULL DEFAULT '',
  pdf_hash CHAR(64) NOT NULL DEFAULT '',
  periodo_tipo VARCHAR(16) NOT NULL DEFAULT 'INDETERMINADO',
  periodo_valor VARCHAR(12) NOT NULL DEFAULT '',
  responsavel_nome VARCHAR(160) NOT NULL DEFAULT '',
  responsavel_email VARCHAR(190) NOT NULL DEFAULT '',
  responsavel_tel VARCHAR(20) NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'AGUARDANDO_ENVIO',
  lote VARCHAR(24) NOT NULL DEFAULT '',
  criado_por VARCHAR(120) NOT NULL DEFAULT '',
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  atualizado_em VARCHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_ui_sol_aluno (aluno_id),
  KEY ix_ui_sol_status (status),
  KEY ix_ui_sol_prot (protocolo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ui_solic_eventos(
  id INT NOT NULL AUTO_INCREMENT,
  solicitacao_id INT NOT NULL,
  quando VARCHAR(40) NOT NULL DEFAULT '',
  ator VARCHAR(120) NOT NULL DEFAULT '',
  acao VARCHAR(40) NOT NULL DEFAULT '',
  detalhe VARCHAR(400) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_ui_se_sol (solicitacao_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Modelo padrão de EXEMPLO. O texto precisa de revisão jurídica e de LGPD antes de ser enviado a responsáveis.
INSERT IGNORE INTO ui_modelos(nome,tipo,finalidade,canais,local_uso,periodo_tipo,periodo_valor,observacoes,corpo,versao,ativo,criado_em,atualizado_em,atualizado_por) VALUES(
 'Modelo padrão - atividades escolares','PADRAO',
 'Divulgação institucional das atividades do colégio, sem fins comerciais.',
 'Instagram, Facebook, Site, Materiais impressos',
 'Atividades e eventos realizados pelo colégio','INDETERMINADO','',
 '',
 'Eu, {{responsavel}}, responsável legal pelo(a) aluno(a) {{aluno}}, matrícula {{matricula}}, turma {{turma}}, {{decisao}} o {{colegio}} a utilizar fotografias e vídeos em que o(a) aluno(a) apareça, nas condições abaixo.\n\nFinalidade: {{finalidade}}\n\nCanais de divulgação: {{canais}}\n\nLocal ou evento: {{local}}\n\nPrazo: {{prazo}}\n\n{{observacoes}}Esta autorização é concedida de forma gratuita. O colégio não usará a imagem do(a) aluno(a) fora da finalidade e dos canais indicados, nem de forma que o exponha a constrangimento.\n\nO responsável pode revogar esta autorização a qualquer momento, por solicitação ao colégio. Também pode optar por NÃO autorizar, sem qualquer prejuízo ao aluno. Os dados desta solicitação são tratados somente para registrar a escolha do responsável.',
 1,1,'2026-10-28T00:00:00-03:00','2026-10-28T00:00:00-03:00','Sistema');
