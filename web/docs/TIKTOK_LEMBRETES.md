# TikTok manual — lembretes internos (Etapa 03/04)

## Estado
Implementação isolada na branch de correção. **Não está ativa em produção**. Não configura cron externo nem publica conteúdos no TikTok.

## Pré-requisitos de futura homologação (não executar sem autorização)
1. Validar backup completo e restauração isolada.
2. Em ambiente de homologação isolado, aplicar a migração aditiva `047_tiktok_lembretes.sql` antes de chamar o cron. Se a tabela ainda não existir **e** a migração não estiver registrada, o backup omite exclusivamente a tabela de lembretes e informa essa ausência na validação. Se a migração já estiver registrada mas a tabela estiver ausente, o backup falha explicitamente. Não mascarar outras falhas SQL.
3. Executar `node tests/tiktok-lembretes-isolados.test.js` e `npm run typecheck` num checkout isolado com dependências disponíveis.
4. Com MySQL **isolado**, validar transações de `records`, `notifications` e `tiktok_reminder_events`, concorrência, rollback e recuperação após falha.
5. Conferir `TIMEZONE=America/Fortaleza` e o uso de `CRON_SECRET` com tamanho mínimo de 16 caracteres.
6. Validar a frequência de execução na Hostinger. Recomenda-se a cada 5 minutos, sob autorização, chamando `/api/cron/tiktok-lembretes` com `Authorization: Bearer <CRON_SECRET>`.
7. Acompanhar erros do cron e os indicadores de lembretes criados; um alerta atrasado é retomado na próxima chamada bem-sucedida **dentro das primeiras 24 horas**, enquanto a publicação estiver AGENDADA. Após esse prazo não há nova notificação automática.
8. Confirmar segurança de uso de imagem antes de habilitar lembretes para publicações reais (Etapa 04/04).

## Comportamento implementado
- Apenas `canal=TikTok`, `status=AGENDADO` e responsável preenchido são considerados.
- 30 minutos antes: lembrete antecipado; do horário até 15 minutos: lembrete de publicar; depois de 15 minutos: aviso atrasado.
- Política de recuperação: se a execução falhar, o sistema tenta o lembrete correspondente à janela atual na próxima execução. Não reproduz os alertas antecipados ou de horário depois de suas janelas; recupera o aviso de atraso até 24 horas após o agendamento. No limite de 24 horas ou depois, não cria aviso automático. É necessário acompanhamento operacional dos conteúdos antigos.
- Idempotência: chave SHA-256 derivada de publicação, **identificador do ciclo de agendamento**, horário, responsável e tipo de aviso, com índice único no MySQL. Notificação e chave são gravadas numa transação atômica. Publicações antigas sem identificador usam marcador estável `legado`.
- Todo novo agendamento TikTok, inclusive para a **mesma data e responsável**, recebe `agendamentoTikTokId` único na transação. O campo não pode ser editado pela API genérica nem copiado ao duplicar um conteúdo. Avisos anteriores já entregues permanecem no histórico, mas qualquer status diferente de AGENDADO impede novos avisos.
- A rotina **não** modifica o status editorial e **não** chama qualquer API do TikTok ou publicador Instagram.

## Limitações conhecidas e bloqueios de liberação
- A tabela não foi criada em banco real e não houve teste de MySQL, cron real, nem avaliação da disponibilidade da Hostinger.
- Alertas usam a Central de Notificações interna; não são notificações push, WhatsApp ou e-mails garantidos.
- O status visual "Atrasado" pode necessitar refinamento de interface.
- Registros agendados anteriores à implantação podem não ter `agendamentoTikTokId`: usam a identidade `legado` até passarem por um novo agendamento. Confirmar a migração lógica desse cenário em testes isolados.
- A rotina não contabiliza separadamente avisos expirados após 24 horas; o acompanhamento de publicações antigas continua sendo uma pendência operacional.
- O teste isolado usa mocks do banco e utilitários de horário. TypeScript completo, concorrência SQL e testes de cron real continuam pendentes.
- A habilitação depende de verificação de autorização de uso de imagem, prevista na Etapa 04/04.

## Rollback futuro
Desativar a chamada ao cron específico (quando configurada), preservar registros `tiktok_reminder_events` e `notifications`, e reverter exclusivamente o código novo. **Não** restaurar o banco inteiro sem analisar registros posteriores ao backup.
