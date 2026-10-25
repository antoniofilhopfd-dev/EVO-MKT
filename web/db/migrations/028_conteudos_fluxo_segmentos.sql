-- Fluxo das publicações: Ideia → Rascunho → Em produção → Em revisão → Aprovado → Agendado → Publicado.
UPDATE records SET data=JSON_SET(data,'$.status','RASCUNHO') WHERE modulo='conteudos' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))='BRIEFING';
UPDATE records SET data=JSON_SET(data,'$.status','EM PRODUÇÃO') WHERE modulo='conteudos' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))='PRODUÇÃO';
UPDATE records SET data=JSON_SET(data,'$.status','EM REVISÃO') WHERE modulo='conteudos' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))='REVISÃO';
UPDATE records SET data=JSON_SET(data,'$.status','AGENDADO') WHERE modulo='conteudos' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))='PROGRAMADO';
-- Segmentos: um catálogo só (Educação Infantil, Anos Iniciais, Anos Finais, Ensino Médio, Administrativo, Direção, Todos)
UPDATE records SET data=JSON_SET(data,'$.segmento','Educação Infantil') WHERE modulo IN ('conteudos','ideias','templates','campanhas') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.segmento')) IN ('Infantil','Educação Infantil — Maternais e Jardins');
UPDATE records SET data=JSON_SET(data,'$.segmento','Ensino Fundamental – Anos Iniciais') WHERE modulo IN ('conteudos','ideias','templates','campanhas') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.segmento')) IN ('Anos Iniciais','Anos iniciais');
UPDATE records SET data=JSON_SET(data,'$.segmento','Ensino Fundamental – Anos Finais') WHERE modulo IN ('conteudos','ideias','templates','campanhas') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.segmento')) IN ('Anos Finais','Anos finais');
UPDATE records SET data=JSON_SET(data,'$.segmento','Todos') WHERE modulo IN ('conteudos','ideias','templates','campanhas') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.segmento')) IN ('Geral','Ambos','Toda a escola');
-- Calendário escolar: "1º ano" e "2º ao 5º" voltam a ser Anos Iniciais
UPDATE records SET data=JSON_SET(data,'$.segmentos',REPLACE(JSON_UNQUOTE(JSON_EXTRACT(data,'$.segmentos')),'ANO1','FUND1')) WHERE modulo='calescolar' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.segmentos')) LIKE '%ANO1%';
