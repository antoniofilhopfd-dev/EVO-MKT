# Tráfego Pago — três abas (somente consulta)

Base: `main` @ 86977cd. Abas: **Visão Geral**, **Desempenho**, **Relatórios** (campanha → conjunto → anúncio é um nível *dentro* do Desempenho).

| Item do pedido | Situação |
|---|---|
| 8 indicadores, comparação, última leitura, evolução com estilo (linha/barras/área) e granularidade (dia/semana dom–sáb/mês) | implementado (Visão Geral) |
| Investimento por campanha e por segmento, tabela de campanhas ao final | implementado |
| Filtros Esta semana / Este mês / Mês anterior / Este ano / Personalizado; semana dom–sáb com número da semana (epidemiológica) | implementado (`filtros.js`, `trafego-comum.js`) |
| Status reais da Meta (ativo, pausado, análise, problemas, arquivado, indisponível) | já existia; mantido, sem inferir por métricas |
| Hierarquia Campanha → Conjunto → Anúncio, filtros (status, segmento, campanha, conjunto, busca), ordenação, paginação, estados vazio/erro | implementado (`tfdesempenho.js`; novo nível *conjuntos* na API) |
| Foto do criativo (nunca de outro anúncio; “Sem imagem” quando a Meta não informa) | mantido; detalhe do anúncio e comparação de 2 a 4 linhas |
| Mesma peça em campanhas diferentes: resultados separados | detalhe mostra os outros anúncios do mesmo criativo, sem somar |
| Relatórios: tipo (geral, campanha, conjunto, anúncio, segmento), filtros, recorte semanal, pré-visualização, impressão/PDF, CSV | implementado (`tfrelatorios.js`, `trafego-relatorio.js`) |
| Alcance não aditivo; CTR/CPC/custo por conversa dos absolutos | mantido; com filtro ativo o alcance total aparece como “—” |

Antes existiam as páginas Campanhas e Anúncios; foram incorporadas ao Desempenho (endereços antigos redirecionam).

## Limites e pendências
- Os dados de teste são simulados (mock da Meta); não houve homologação com a conta real.
- O segmento é deduzido do nome da campanha (EI, AI, AF, EM); sem código reconhecido vira “Sem segmento”.
- “Objetivo da campanha” (aparece nos mockups) não foi incluído: o filtro não consta do pedido escrito.
- XLSX não foi criado; CSV já existia.

## Rollback
Reverter o commit desta entrega; não há migração de banco. O cache do navegador é renovado pelo `sw.js`.
