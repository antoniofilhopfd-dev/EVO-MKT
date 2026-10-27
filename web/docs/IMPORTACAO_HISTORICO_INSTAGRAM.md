# Importação histórica do Instagram — EVO MKT

Estado: código de importação e consulta entregue; carga em produção pendente.

## Fontes validadas
- Métricas - Instagram.xlsx: 3.666 linhas não vazias
- Instagram_Planilha.xlsx: 594 linhas não vazias
- Marketing Hub — Colégio Evolução.xlsx: 54 linhas não vazias
- Total: 26 abas e 4.314 linhas; 0 chaves repetidas (arquivo + aba + linha); 0 linhas com estrutura inválida.
- A contagem inclui cabeçalhos, textos e possíveis duplicatas semânticas: **não é número de publicações únicas**.

## Antes de aplicar
1. Fazer backup verificável do banco MySQL usado pelo EVO MKT.
2. Conferir as variáveis DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_NAME, sem registrar senhas no GitHub.
3. Aplicar a migração `web/db/migrations/032_instagram_historico_planilhas.sql` pela rotina de migrações do aplicativo.
4. Disponibilizar o arquivo `manifesto_todas_as_abas.json` exclusivamente na máquina de importação, fora do diretório público. **Não publicar os dados escolares em repositório público.**
5. Na pasta `web` com dependências instaladas, rodar:
   - `node scripts/importar-historico-instagram.mjs /caminho/manifesto_todas_as_abas.json --dry-run`
   - conferir a contagem de 26 abas e 4.314 linhas
   - `node scripts/importar-historico-instagram.mjs /caminho/manifesto_todas_as_abas.json --apply`
6. Conferir a saída com `inseridas`, `jaExistentes` e `total`. Repetir a carga não deve duplicar chaves de origem.
7. No aplicativo, acessar **Instagram → Desempenho → Consultar histórico importado**, validando paginação e origem.
8. Conferir que as métricas oficiais da Meta permanecem inalteradas e separadas das planilhas.

## SQL de validação após carga
```sql
SELECT COUNT(*) AS linhas FROM instagram_historico_planilhas;
SELECT arquivo,COUNT(*) AS linhas FROM instagram_historico_planilhas GROUP BY arquivo ORDER BY arquivo;
SELECT COUNT(DISTINCT CONCAT(arquivo,CHAR(31),aba)) AS abas FROM instagram_historico_planilhas;
```
Esperado para banco previamente vazio na tabela histórica: 4.314 linhas, distribuídas em 3.666 / 594 / 54, de 26 abas.

## Limitações deliberadas
- Importação histórica **não** reescreve `ig_posts`, `ig_seguidores` nem métricas oficiais da Meta.
- As células são preservadas por posição original, sem supor que um texto seja um indicador numérico.
- Identificações entre planilhas, anúncios, contas e publicações não são inferidas sem confirmação.
- Pauta e Campanhas permanecem em standby.
- A migração de banco, o deploy e o teste com a Meta ainda não foram executados por este procedimento.
