# EVO MKT v3.3.5 — Aprovação Interna Profissional

Evolução incremental da v3.3.4.

## Novidades
- Central de Aprovações conectada aos fluxos automáticos.
- Fila "Aguardando minha aprovação" por integrante; Gerente vê a fila completa.
- Aprovação ou reprovação/ajuste com motivo obrigatório.
- Reprovação devolve automaticamente o item à etapa anterior do fluxo.
- Aprovação em cadeia com múltiplos aprovadores em ordem configurável.
- Entrada automática em aprovação ao chegar a etapas de Revisão/Aprovação.
- Fluxo não avança enquanto a aprovação estiver pendente.
- Snapshots do registro a cada versão enviada para aprovação.
- Comparação lado a lado da versão anterior com a versão atual, destacando campos alterados.
- Histórico de decisões com aprovador, data/hora, motivo e duração.
- Métrica de tempo médio gasto em aprovações.
- Notificações pessoais para itens aguardando aprovação do integrante.
- Configuração das cadeias de aprovação pela Gerente.

## Persistência
Os campos são gravados no próprio registro apenas quando usados, incluindo:
`aprovacaoInternaStatus`, `aprovacaoInternaEtapa`, `aprovacaoInternaCadeia`,
`aprovacaoInternaIndice`, `aprovacaoInternaAprovador`, `aprovacaoInternaSolicitadaEm`,
`aprovacaoInternaRespondidaEm`, `aprovacaoInternaMotivo`, `aprovacaoInternaHistorico`,
`aprovacaoVersao` e `aprovacaoVersoes`.

Nenhuma nova planilha foi criada.
