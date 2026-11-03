# TikTok manual — lembretes internos (Etapa 03/04)

## Estado
Implementação isolada na branch de correção. **Não está ativa em produção**. Não configura cron externo nem publica conteúdos no TikTok.

## Pré-requisitos de futura homologação (não executar sem autorização)
1. Validar backup completo e restauração isolada.
2. Em ambiente de homologação isolado, aplicar a migração aditiva `047_tiktok_lembretes.sql` antes de executar código que faz backup ou chama o cron. A lista do backup inclui a nova tabela; sem ela backups podem falhar.
3. Executar `node tests/tiktok-lembretes-isolados.test.js` e `npm run typecheck` num checkout isolado com dependências disponíveis.
4. Com MySQL **isolado**, validar transações de `records`, `notifications` e `tiktok_reminder_events`, concorrência, rollback e recuperação após falha.
5. Conferir `TIMEZONE=America/Fortaleza` e o uso de `CRON_SECRET` com tamanho mínimo de 16 caracteres.
6. Validar a frequência de execução na Hostinger. Recomenda-se a cada 5 minutos, sob autorização, chamando `/api/cron/tiktok-lembretes` com `Authorization: Bearer <CRON_SECRET>`.
7. Acompanhar erros do cron e os indicadores de lembretes criados; um alerta atrasado é retomado na próxima chamada bem-sucedida enquanto a publicação estiver AGENDADA.
8. Confirmar segurança de uso de imagem antes de habilitar lembretes para publicações reais (Etapa 04/04).

## Comportamento implementado
- Apenas `canal=TikTok`, `status=AGENDADO` e responsável preenchido são considerados.
- 30 minutos antes: lembrete antecipado; do horário até 15 minutos: lembrete de publicar; depois de 15 minutos: aviso atrasado.
- Se o processo ficar indisponível, o aviso atrasado pode ser recuperado quando voltar; lembretes ultrapassados não são reproduzidos fora da janela.
- Idempotência: chave SHA-256 derivada de publicação, horário, responsável e tipo de aviso, com índice único no MySQL. Notificação e chave são gravadas numa transação atômica.
- Reagendamento para outra data ou troca de responsável gera novas chaves. Avisos anteriores já entregues permanecem no histórico, mas um status diferente de AGENDADO impede novos avisos.
- A rotina **não** modifica o status editorial e **não** chama qualquer API do TikTok ou publicador Instagram.

## Limitações conhecidas e bloqueios de liberação
- A tabela não foi criada em banco real e não houve teste de MySQL, cron real, nem avaliação da disponibilidade da Hostinger.
- Alertas usam a Central de Notificações interna; não são notificações push, WhatsApp ou e-mails garantidos.
- O status visual "Atrasado" pode necessitar refinamento de interface.
- Se um agendamento antigo for recriado para a mesma data e responsável, a chave anterior pode impedir repetir o mesmo aviso. Validar regra de revisão de agendamento antes da liberação.
- A habilitação depende de verificação de autorização de uso de imagem, prevista na Etapa 04/04.

## Rollback futuro
Desativar a chamada ao cron específico (quando configurada), preservar registros `tiktok_reminder_events` e `notifications`, e reverter exclusivamente o código novo. **Não** restaurar o banco inteiro sem analisar registros posteriores ao backup.
