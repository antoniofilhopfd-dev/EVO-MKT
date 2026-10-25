# Tráfego: filtros das tabelas e gráfico de referência

- Campanhas e Anúncios têm acesso direto ao período e filtro independente de status atual: Todos, Ativos, Pausados, Em análise, Com problemas ou reprovados, Arquivados ou excluídos e Status indisponível.
- Campanhas usam seu próprio `effective_status`, lido da Meta. Anúncios usam o status efetivo já consultado; pausas herdadas de campanha/conjunto entram em Pausados. Status ausente não vira Ativo.
- Os valores continuam sendo da veiculação no período escolhido. Itens sem veiculação nesse período não integram estas tabelas. O status é o atual na última consulta, não o histórico da data do gasto. O cache da Meta dura cinco minutos; Atualizar agora força nova consulta.
- Total e CSV acompanham o filtro. CTR, CPC e custo por conversa são recalculados dos absolutos. Alcance do recorte por status aparece indisponível, pois somar alcance de anúncios/campanhas duplicaria pessoas. O PDF acessado pelas tabelas está explicitamente rotulado como relatório geral, sem recorte de status.
- Períodos de até 400 dias permitem consultar Este ano e preservam o limite de proteção da API. A interface envia também o tipo de período para calcular a comparação adequada.
- Gráfico no painel e relatório segue o PDF enviado como referência: uma linha por campanha nas cores azul, ciano, laranja e roxo; Total azul escuro tracejado com marcadores quadrados; sem área preenchida. Marcadores são espaçados em períodos longos. O painel tem alternativa em tabela.

Anúncios têm coluna Foto com miniatura maior e ampliação em diálogo interno. A imagem original da Meta serve de alternativa quando a miniatura não existe. Imagens ausentes ou com erro têm identificação explícita, inclusive no PDF. URLs continuam restritas aos domínios de mídia autorizados da Meta.

Validação executada: testes isolados de filtros, totais, alcance, preservação do cache, consulta anual, evolução diária e SVG para nenhum dia, um dia e vários dias; testes isolados da consolidação anterior; TypeScript; sintaxe JS; build. O SVG do relatório foi renderizado e conferido com dados de exemplo. Isso não equivale à homologação autenticada da conta real ou a testes de interface em navegador.

As suítes HTTP/MySQL continuam pendentes neste ambiente sem MySQL/MariaDB e PHP. A suíte de Tráfego foi atualizada para o limite de 400 dias.
