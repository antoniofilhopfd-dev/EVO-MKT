-- A agenda do Marketing pode se chamar "Marketing", "AGENDA MKT" etc. Quem já cadastrou uma agenda assim (e tem escrita nela no Google)
-- passa a poder criar, editar e excluir eventos por ela. Agendas só de leitura continuam só de leitura; nada é apagado.
UPDATE google_agendas SET editavel=1
 WHERE editavel=0 AND ativa=1 AND papel IN ('owner','writer')
   AND (LOWER(nome) LIKE '%marketing%' OR LOWER(nome) REGEXP '(^|[^a-z0-9])mkt([^a-z0-9]|$)');
