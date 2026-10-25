-- Agendas do Google Agenda cadastradas no EVO MKT (Calendário Geral escolar), eventos criados por aqui e vínculo por agenda.
-- O que o EVO MKT pode alterar é decidido por `editavel` (só a agenda Marketing) E pelo papel real que o Google devolve (`papel`).
CREATE TABLE IF NOT EXISTS google_agendas(
  calendar_id VARCHAR(190) NOT NULL,
  nome VARCHAR(160) NOT NULL DEFAULT '',
  grupo VARCHAR(20) NOT NULL DEFAULT 'GERAL',
  papel VARCHAR(20) NOT NULL DEFAULT '',
  editavel TINYINT NOT NULL DEFAULT 0,
  ativa TINYINT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'NOVA',
  erro VARCHAR(400) NOT NULL DEFAULT '',
  ultima_sync VARCHAR(40) NOT NULL DEFAULT '',
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (calendar_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS agenda_eventos(
  calendar_id VARCHAR(190) NOT NULL,
  event_id VARCHAR(190) NOT NULL,
  criado_por VARCHAR(120) NOT NULL DEFAULT '',
  criado_em VARCHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (calendar_id, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- O mapa antigo (publicações e calendário de marketing -> Google) passa a ser por agenda: trocar de agenda não apaga mais os vínculos.
ALTER TABLE google_event_map ADD COLUMN calendar_id VARCHAR(190) NOT NULL DEFAULT '';
UPDATE google_event_map SET calendar_id=COALESCE((SELECT v FROM integration_settings WHERE k='g_calendar_id'),'') WHERE calendar_id='';
ALTER TABLE google_event_map DROP PRIMARY KEY, ADD PRIMARY KEY (modulo, id, calendar_id);
