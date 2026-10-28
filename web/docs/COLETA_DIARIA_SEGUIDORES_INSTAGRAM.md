# Registro diário de seguidores — Instagram

## Situação

O EVO MKT armazena o total de seguidores de cada conta na tabela `ig_seguidores` (chave única `conta,dia`). A coleta atual não preenche retroativamente os três anos anteriores: a API não entrega essa série histórica completa.

## Endpoint diário

`GET /api/cron/integracoes?tarefa=seguidores`

Requer `Authorization: Bearer <CRON_SECRET>` (segredo de no mínimo 16 caracteres, configurado em ambiente; jamais no repositório nem na URL). A rota já existia e foi estendida para coletar somente seguidores. O endpoint deve ser chamado **uma vez ao dia** por agendador confiável da hospedagem, com método GET e o cabeçalho de autorização.

- Faz refresh do token Meta quando necessário.
- Consulta `followers_count` para cada conta monitorada.
- Usa `INSERT ... ON DUPLICATE KEY UPDATE` por conta/data.
- Preserva todas as datas anteriores e não inventa histórico.
- Retorna `instagram-seguidores: { atualizados, falhas, aviso }`; conferir erro antes de considerar a rotina saudável.
- Se não houver contas conectadas, a resposta indicará a ausência de integração.
- O horário efetivo depende do fuso do ambiente onde a aplicação executa: verificar a variável `TIMEZONE` e o fuso do agendador.

## Checklist de ativação (Hostinger)

1. Publicar a branch `main` e confirmar o build.
2. Conferir se a conexão Meta tem acesso aos perfis desejados.
3. Conferir `CRON_SECRET` já configurado sem compartilhar seu valor.
4. Configurar agendador diário na hospedagem para acessar o endpoint **com header Authorization**; não usar agendador que só permita URL com segredo em query string.
5. Verificar que o endpoint retorna `atualizados` no número de perfis esperados e `falhas:0`.
6. No dia seguinte, confirmar nova linha em `ig_seguidores` para cada perfil, sem excluir o histórico anterior.

A mera publicação deste código **não ativa** uma tarefa agendada na Hostinger. Não há confirmação de acesso a painel de cron ou MySQL neste repositório.
