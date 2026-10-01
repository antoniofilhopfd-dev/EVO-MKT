# EVO MKT v4.0.3 — Instagram e Tráfego completos

Incremento sobre a v4.0.2. Somente `web/` (app.js, style.css) alterado; executáveis e DADOS intactos.

## Instagram
- KPIs: seguidores (+novos, crescimento), alcance, impressões, visitas ao perfil, interações, engajamento — com variação vs período anterior.
- Novo bloco de interações (curtidas, comentários, compartilhamentos, salvamentos) e evolução de seguidores.
- Mix Posts/Reels/Stories com percentual; melhores conteúdos; estado vazio com ação.

## Tráfego
- KPIs agrupados: investimento, impressões, alcance, frequência, cliques, CTR, CPC, CPM, conversas, custo/conversa, leads, CPL, com variação vs anterior (custos: queda = positivo).
- Funil com larguras proporcionais e taxas de conversão entre etapas.
- Tabela comparativa período atual × anterior; nota de preparação para Meta Ads (sem conexão ativa).
- CTR/CPC/CPM/frequência/custos são calculados ao salvar quando deixados em branco, e exibidos calculados no histórico (antes mostrava R$ 0,00).

## Correções
- Cabeçalho (hero) de Instagram/Tráfego aparecia cortado.
- Botão "+ Novo registro" quebrava em duas linhas.

## Dados
- Nenhuma planilha alterada (19/19 idênticas byte a byte à v4.0.2).

## Limitações
- CORE.exe (sem código-fonte no pacote) não foi alterado nem executado; testes de UI foram feitos em Chromium com servidor simulado da API.
- Não testado em Windows real.
