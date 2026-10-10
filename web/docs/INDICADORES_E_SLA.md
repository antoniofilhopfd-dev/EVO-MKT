# Fluxo, SLA e indicadores (Etapa 03)

Fonte única das regras: `lib/fluxo.ts` (status e transições) e `lib/sla.ts` (prazos). O navegador e o Portal leem as regras em `GET /api/fluxo`.

## Status e transições de solicitações
NOVA → AGUARDANDO TRIAGEM → EM ANÁLISE → DISTRIBUÍDA → EM EXECUÇÃO → AGUARDANDO APROVAÇÃO DO SOLICITANTE → CONCLUÍDA.
Também: AGUARDANDO SOLICITANTE (pedido de complementação, pausa o SLA) e CANCELADA.
Transições fora do grafo respondem **409** e listam as permitidas. **Retornos** exigem motivo (resposta `{motivo:true}`; o navegador pergunta e repete):
EM ANÁLISE→AGUARDANDO TRIAGEM, DISTRIBUÍDA→EM ANÁLISE, EM EXECUÇÃO→EM ANÁLISE, AGUARDANDO APROVAÇÃO→EM EXECUÇÃO (ajustes), CONCLUÍDA→EM EXECUÇÃO (reabertura), CANCELADA→AGUARDANDO TRIAGEM.
Demais módulos (tarefas, conteúdos etc.) têm status livres, mas toda mudança é registrada.

## Histórico
Tabela `status_history` (módulo, registro, campo status|responsavel, de, para, ator, quando, motivo), gravada na mesma transação da alteração. Criação registra o status inicial. Troca de responsável = redistribuição. Distribuir, devolver e reabrir **atualizam** o registro; nunca criam outro.
Linha do tempo: `GET /api/timeline?module&id` (interna: histórico + auditoria) e `GET /api/portal/timeline?id` (Portal: só histórico; atores internos aparecem como "Marketing").

## SLA (dias úteis)
- **Início**: data de recebimento (`criadoEm`). **Dias úteis**: segunda a sexta, menos feriados da variável `FERIADOS` (AAAA-MM-DD separados por vírgula).
- **Prazo**: `slaDias` da demanda ou o padrão do tipo — Stories 2, Aviso 2, Post 3, Reels/Arte impressa/Material gráfico/Foto/Outro 5, Vídeo/Evento 7, Campanha 10 (padrão 5).
- **Pausa**: em AGUARDANDO SOLICITANTE o relógio para; ao sair, o vencimento avança os dias úteis parados.
- **Exceção**: `prazoNegociado` substitui o cálculo e é final (pausa não o altera).
- **Fim**: transição para CONCLUÍDA (no prazo se ≤ vencimento). CANCELADA não entra no cumprimento.
- Estados: ok, atenção (0–1 dia útil), vencido, pausado, concluído no prazo/atrasado, cancelada. `GET /api/sla?id`.

## Indicadores (`GET /api/indicadores`, só Gerência)
Filtros: `de`, `ate` (padrão últimos 30 dias), `segmento`, `responsavel`, `tipo`. Todo indicador traz `definicao` e `ids` (registros de origem, até 200); na Central Operacional cada cartão abre essa lista.
Recebidas, distribuídas, concluídas, abertas, aguardando triagem, urgentes sem responsável, SLA vencido/atenção/pausado, aguardando aprovação, reabertas, devolvidas/ajustes, redistribuídas, cumprimento do SLA (null sem dados), tempo médio de atendimento, avaliação média.
Tabelas: por segmento, por tipo, tempo médio por etapa, carga por pessoa (limite de sobrecarga `LIMITE_SOBRECARGA`, padrão 8 itens abertos, ou 3+ tarefas atrasadas — é carga atual, não produtividade) e motivos de bloqueio.
Tudo é calculado de registros reais; sem dados mostra "—", nunca zero inventado.

## Limites conhecidos
Demandas anteriores à migração 006 não têm histórico: a linha do tempo começa na primeira mudança após a atualização, e métricas por etapa só contam períodos registrados.
