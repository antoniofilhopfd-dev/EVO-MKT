# Visão geral do Tráfego — organização baseada no painel anterior

A Visão geral reúne investimento em destaque, oito cartões de indicadores, gráfico diário por campanha e total tracejado, barras de investimento por campanha, resumo das seis campanhas e seis anúncios com maior investimento e alertas.

As listas completas e filtros de período/status permanecem nas abas Campanhas e Anúncios, acessíveis pelos botões dos resumos. As fotos também podem ser ampliadas a partir da Visão geral. O período e a origem dos dados continuam visíveis. A variação de investimento tem cor neutra.

Os alertas distinguem problemas de entrega informados pela Meta de pontos a conferir: campanhas com pelo menos R$ 100 de investimento e 1.000 impressões sem conversas recebem uma orientação para verificar se conversas são o objetivo, sem declarar falha da campanha. Avisos de disponibilidade da consulta também aparecem. A área mostra até seis avisos e informa quando há outros.

Sem alteração de banco, credenciais ou permissões. Nenhuma escrita na Meta.

## Validação

- `node tests/trafego-visao-ui.test.js`: interface real com API interceptada e dados de exemplo, sem MySQL ou chamadas externas. Verifica cartões, tabelas, fotos e ampliação, gráfico, filtros e ausência de erros JavaScript/estouro horizontal em 1440×900, 820×1180 e 390×844.
- `node tests/trafego-filtros-unit.test.js` e `node tests/consolidacao-unit.test.js`: passaram.
- Sintaxe JavaScript, TypeScript, build e `git diff --check`: passaram.
- Capturas completas revisadas com dados de exemplo. Para capturar toda a página, o teste remove apenas a limitação de altura/overflow durante a captura, depois das verificações de interação e responsividade.

Para executar a suíte visual, use `PLAYWRIGHT` e `CHROME` conforme o ambiente (o padrão é o mesmo das suítes existentes). `CHROME_ARGS` aceita um array JSON de argumentos opcionais; `EVO_SCREENSHOT_DIR` define a pasta das capturas.

As verificações visuais com dados de exemplo não substituem a homologação autenticada com as contas reais.
