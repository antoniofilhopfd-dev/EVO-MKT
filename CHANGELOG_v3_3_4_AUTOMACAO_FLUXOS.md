# EVO MKT v3.3.4 — Automação de Fluxos

Evolução incremental da v3.3.3, preservando runtime e dados.

## Novidades
- Nova área **Fluxos** exclusiva da Gerente.
- Fluxos padrão para Tarefas, Conteúdos, Solicitações, Projetos e Eventos.
- Responsável configurável por etapa.
- SLA interno por etapa em dias úteis.
- Checklist obrigatório por etapa.
- Avanço automático para a próxima etapa e próximo responsável.
- Bloqueio de avanço quando o item estiver bloqueado.
- Bloqueio de avanço quando uma dependência identificada ainda estiver aberta.
- Reinício de confirmação/execução ao trocar de responsável.
- Registro das transições na timeline de colaboração.
- Painel de gargalos com etapas mais carregadas e atrasadas.
- Painel de itens críticos: SLA vencido, bloqueio e dependência.
- Configuração editável de responsáveis, SLA e checklist pela Gerente.
- Botão Fluxo na Minha Área e nas tabelas dos módulos compatíveis.

## Fluxos padrão
- Tarefa: A fazer → Em execução → Revisão → Concluída.
- Conteúdo: Briefing → Produção → Revisão → Aprovação → Publicação.
- Demanda: Triagem → Execução → Revisão → Entrega → Aprovada.
- Projeto: Planejamento → Execução → Revisão → Concluído.
- Evento: Pré-evento → Cobertura → Pós-evento → Entrega.

## Persistência
A configuração de responsáveis/SLAs/checklists fica nas preferências locais do EVO MKT. Os campos operacionais do fluxo são gravados no próprio registro somente quando o fluxo é utilizado.

Nenhuma nova planilha foi criada.
