# EVO MKT v3.3.3 — Colaboração Interna

Evolução incremental da v3.3.2, preservando runtime, Portais e 19 XLSX.

## Novidades
- Botão **Colaborar** nos itens operacionais e na caixa "Atribuído a mim".
- Timeline interna por item com autor e data/hora.
- Comentários internos com `@menções`.
- `@menções` clicáveis na timeline; a Gerente pode abrir a Minha Área do integrante mencionado.
- Pedido de ajuda vinculado ao item.
- Bloqueio/desbloqueio com motivo.
- Dependência de outro item por ID/título.
- Registro de etapa concluída, responsável e data/hora.
- Referência de arquivo por caminho de rede/local ou URL.
- Menções na colaboração alimentam as notificações pessoais existentes.

## Campos adicionais gravados somente quando usados
- `colaboracaoEquipe`
- `anexosInternos`
- `pedidoAjuda`, `pedidoAjudaPor`, `pedidoAjudaEm`
- `bloqueadoPor`, `bloqueadoEm`
- `dependenciaDe`
- `ultimaEtapaConcluida`, `etapaConcluidaPor`, `etapaConcluidaEm`

## Observação sobre anexos
O runtime interno estável não possui upload autenticado reutilizável para Tarefas/Projetos/Conteúdos/Eventos. Por segurança, esta revisão armazena **referências de arquivo** (caminho de rede/local ou URL), sem fingir que copia o arquivo para dentro do EVO MKT. O upload real do Portal continua restrito ao fluxo de Solicitações.
