-- Reestruturação em cinco áreas (Dashboard, Calendário, Instagram, Tráfego Pago, Configurações).
-- Antes de rodar este arquivo, a migração faz um backup completo e guarda uma cópia dos dados removidos (ver lib/migracao6.ts).
CREATE TABLE IF NOT EXISTS relatorio_migracao(k VARCHAR(64) PRIMARY KEY,v MEDIUMTEXT NOT NULL,criado_em VARCHAR(40) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- registros dos módulos descontinuados (Solicitações, Tarefas, Projetos, Eventos, Agenda, Equipe, Aprovações, Relatórios, Arquivos, Integrações, Tráfego manual, Lixeira)
DELETE FROM status_history WHERE modulo IN ('solicitacoes','tarefas','projetos','eventos','agenda','equipe','aprovacoes','relatorios','arquivos','integracoes','trafego','lixeira');
DELETE FROM record_comments WHERE modulo IN ('solicitacoes','tarefas','projetos','eventos','agenda','equipe','aprovacoes','relatorios','arquivos','integracoes','trafego','lixeira');
DELETE FROM record_checklist WHERE modulo IN ('solicitacoes','tarefas','projetos','eventos','agenda','equipe','aprovacoes','relatorios','arquivos','integracoes','trafego','lixeira');
DELETE FROM records WHERE modulo IN ('solicitacoes','tarefas','projetos','eventos','agenda','equipe','aprovacoes','relatorios','arquivos','integracoes','trafego','lixeira');
DELETE FROM module_headers WHERE modulo IN ('solicitacoes','tarefas','projetos','eventos','agenda','equipe','aprovacoes','relatorios','arquivos','integracoes','trafego','lixeira');
DELETE FROM id_counters WHERE modulo IN ('solicitacoes','tarefas','projetos','eventos','agenda','equipe','aprovacoes','relatorios','arquivos','integracoes','trafego','lixeira');
-- Portal do Solicitante / Coordenações: fichas, códigos, sessões, aparelhos, avisos e links de aprovação
DELETE FROM sessions WHERE tipo='por';
DELETE FROM trusted_devices WHERE tipo='por';
DELETE FROM notifications WHERE destino LIKE 'portal:%' OR modulo IN ('solicitacoes','tarefas','projetos','eventos','agenda','equipe','aprovacoes','relatorios','arquivos','trafego','lixeira');
DROP TABLE IF EXISTS portal_users;
DROP TABLE IF EXISTS notices;
DROP TABLE IF EXISTS approval_links;
-- anexos das antigas solicitações que nenhuma publicação usa (os usados continuam; a biblioteca BIBLIOTECA/ nunca é apagada aqui)
DELETE FROM arquivos WHERE caminho LIKE 'ANEXOS/SOLICITACOES/%' AND NOT EXISTS (SELECT 1 FROM records r WHERE r.modulo IN ('conteudos','ideias','calendario','campanhas','templates') AND LOCATE(arquivos.caminho, r.data) > 0);
-- configurações exclusivas dos módulos removidos
DELETE FROM integration_settings WHERE k IN ('portal_ativo','auto_tarefa_solicitacao','auto_recorrencia','g_auto_drive_entregas','g_drive_folder_id','g_sheet_id','g_sheet_url','g_sheet_modules','g_last_sheet_export','trafego_gestao','meta_ads_gestao','ads_regras','ads_relatorio_semanal','ads_rascunhos','ads_teto_dia','ads_teto_mes','ads_dias_max','ads_whatsapp','ads_raio_km');
