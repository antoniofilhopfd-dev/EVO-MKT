# Carômetro — melhorias de 30/10/2026

O PR #58 reúne as melhorias aprovadas. O cadastro continua compartilhado com Uso de Imagem; fotos e histórico ficam vinculados ao mesmo ID/matrícula do aluno.

## Escopo das 25 melhorias

| Nº | Melhoria | Implementação |
|---|---|---|
| 1 | Fila de turmas | Vários lotes persistidos; seleção, resumo e aplicação conjunta em transação. |
| 2 | Conferência individual | Foto/nome maiores, correção do aluno e confirmação individual das associações por ordem. |
| 3 | Enquadramento | Recorte/rotação antes da aplicação e na ficha; preserva original e histórico. |
| 4 | Segmentos oficiais | Maternais; Infantil 1–3; Jardins; Anos Iniciais; Anos Finais; Ensino Médio. |
| 5 | Fotos no backup | Completo inclui todos os anexos disponíveis; não omite arquivos ao ultrapassar 60 MB. Falha explícita se a coleta não puder concluir. |
| 6 | Progresso salvo | Lotes e associações persistem no servidor e podem ser reabertos. Arquivos ainda não enviados precisam ser selecionados novamente após fechar o navegador. |
| 7 | Histórico individual | Data, autor, origem e restauração de versão anterior. |
| 8 | Relatório de backup | Contagens de alunos, fotos e versões incluídas no arquivo e na tela de validação. |
| 9 | Duplicidades | Conflitos no lote, aviso de outros lotes abertos e bloqueio de duplicidade na fila selecionada; manter atual, substituir ou deixar pendente. |
| 10 | Várias turmas | Pastas com subpastas por turma e ZIP; conferência dos nomes das pastas. |
| 11 | Matrícula | Associação exata por matrícula e manifesto; homônimos permanecem para escolha manual. |
| 12 | Resumo | Totais de fotos, turmas, substituições, pendências e inválidas antes da aplicação. |
| 13 | Pendências | Alunos sem foto, qualidade, duplicidades, turma e arquivos sem aluno. |
| 14 | Qualidade | Aviso de resolução, possível desfoque e orientação; editor para girar e enquadrar. |
| 15 | Desfazer lote | Recupera versão anterior onde a foto do lote ainda é a atual. |
| 16 | Falhas de envio | Progresso por arquivo e nova tentativa das falhas; fotos idênticas reenviadas no lote não são duplicadas, inclusive em ZIP. |
| 17 | Turma divergente | Turma de origem registrada no lote; alteração do cadastro exige nova conferência. |
| 18 | Revisão anual | Prévia editável, confirmação, histórico de turma por ano e preservação das fotos/matrículas. |
| 19 | Autorização | Selo e filtros de situação do módulo Uso de Imagem; foto não implica autorização. |
| 20 | Permissões | Administrador configura ações e segmentos por pessoa; verificação na API para consulta, importação, substituição, originais e PDF. |
| 21 | Auditoria | Operações registradas com data/autor, incluindo enquadramento, revisão anual e permissões. |
| 22 | Origem da foto | Origem, data e autor no histórico. Referências do Drive continuam explicitamente sem sincronização. |
| 23 | PDF | Turma ou seleção, quantidade por linha, orientação, matrícula opcional, filtro de autorizados e prévia. |
| 24 | Desempenho da listagem | Miniaturas e carregamento sob demanda; ampliação abre a versão maior. |
| 25 | Restauração conferida | Validação de referências antes de restaurar e de arquivos/vínculos no banco antes do commit. Falha reverte a restauração. |

## Garantias e limites operacionais

- POSTs do carômetro compartilham transação e bloqueio no banco. Aplicação de fila, troca de fotos, recorte e desfazer não deixam gravações parciais em caso de erro. Aplicações concorrentes do mesmo lote não duplicam fotos.
- ZIP: até 60 MB compactados, 120 MB de imagens descompactadas e 400 fotos por lote. Imagens acima de 5 MB aparecem como inválidas; limites de recursos recusam a operação explicitamente.
- Backup completo não tem mais o corte de omissão de 60 MB. Ainda depende da memória e do tamanho de pacote aceito pelo MySQL, pois o formato existente é JSON/gzip no banco. Falta de recurso é erro; não representa sucesso parcial. Validado com 64 MB de anexos.
- A cópia de segurança anterior à restauração guarda todos os arquivos disponíveis e registra referências já ausentes, permitindo recuperar uma foto perdida a partir de um backup íntegro.
- Alerta de desfoque usa variância do Laplaciano, é heurístico e pede conferência; não identifica pessoas nem rejeita automaticamente fotos.
- Segmentos configurados restringem o carômetro. Pastas gerais do Drive e seleções que misturem segmentos não permitidos não são expostas ao perfil restrito. Sem segmentos marcados, a pessoa tem acesso a todos os segmentos nas ações autorizadas. Administração mantém acesso completo.
- A revisão anual muda o cadastro compartilhado de turma após confirmação, registra a situação anterior e não promove alunos automaticamente.

## Validação

- 13 testes unitários: segmentos, matrícula/homônimos, recorte/rotação, desfoque, política de acesso, integridade de referências e transações.
- 41 verificações de integração com MariaDB: fila, rollback de falha, aplicação concorrente, ZIP, histórico, permissões, revisão anual, PDF, backup acima de 60 MB, restauração e interface.
- Suítes de regressão: carometro-lote, carometro-sel, carometro-pdf e carometro-drive, com desktop/celular.
- TypeScript, sintaxe de JavaScript e build de produção; Next.js atualizado para 16.4.3 e auditoria npm sem vulnerabilidades.

Dados de teste são fictícios. Testes de banco exigem um banco exclusivo com nome começando por `evo_cm_test`; o executor recusa outros nomes. Após build, use `node tests/run-carometro-ci.cjs` com DB_HOST/DB_USER/DB_PASSWORD de teste e Chromium do Playwright instalado. Resultados e capturas ficam em `test-results/` (ignorado pelo Git).

Nenhum deploy é executado por estas alterações.
