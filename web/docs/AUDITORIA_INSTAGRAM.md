# Auditoria da área Instagram

Escopo: Visão geral, Conteúdos, Calendário, Desempenho e Ranking, o seletor de perfil do cabeçalho, as informações mensais da conta e a sincronização com a Meta. Não inclui Dashboard, Calendário Escolar, Tráfego Pago nem Configurações.
Método: leitura do código, testes automáticos em navegador real (desktop 1440 px e celular 390 px) contra um servidor Meta simulado, e conferência das capturas de tela do uso real.

## Problemas encontrados e corrigidos
| # | Problema | Onde | Correção |
|---|---|---|---|
| 1 | **Fuso horário**: o servidor filtrava e contava por data UTC da Meta, enquanto as telas mostram Fortaleza. Uma postagem das 23h do último dia do mês contava no mês seguinte (ex.: 01/09 02:00 UTC é 31/08 em Fortaleza). | `lib/painel.ts`, `lib/api/desempenho.ts` (ranking, mensal, visão geral, interações por dia) | Novo `diaLocal()` converte para America/Fortaleza; a consulta busca um dia a mais de cada lado e filtra pelo dia local. |
| 2 | Rotas novas aceitavam qualquer método HTTP. | `/instagram/ranking`, `/mensal`, `/visao`, `/desempenho`, `/impulsionados` | Só GET (405 nos outros); só `/vinculo` aceita POST. |
| 3 | Tabela do Ranking cortada à direita e títulos como link azul sublinhado. | `areas.css` | Colunas compactas, título em até 2 linhas, links sem sublinhado (hover em azul), sem corte. |
| 4 | Cartões do Desempenho com métricas cortadas (Alcance, Comentários, Compartilhamentos). | `areas.css` | Rótulo acima do valor, duas colunas, sem corte. |
| 5 | O botão "Relatório mensal (PDF)" aparecia sublinhado. | `areas.css` | `a.btn` sem sublinhado. |
| 6 | Novas consultas com interpolação de SQL fora da lista revisada (`seguranca-estatica`). | `lib/api/desempenho.ts` | Mesmo padrão já revisado (`marcas`, só `?`). |
| 7 | O filtro de segmento ou de campanha, guardado no navegador, podia esconder postagens no Instagram sem aparecer na tela. | `public/filtros.js` | No Instagram esses filtros não existem: nunca entram na consulta nem na lista. |
| 8 | Postagem da Meta ligada a uma publicação do EVO MKT aparecia duas vezes (Conteúdos e Calendário). | `igconteudos.js`, `igcalendario.js` | Remove da lista da Meta o que já tem ficha (`instagramMediaId`). Coberto por teste. |

## Verificado e sem problema
- Sem login: 401. Equipe vê ranking e informações mensais; Administrador faz tudo. Datas inválidas, início depois do fim e perfil inválido: 400. Tentativa de injeção no perfil: 400.
- Consultas com parâmetros (`?`); nenhum segredo nem token no navegador; link externo com `rel="noopener noreferrer"`.
- Dado inexistente aparece como "—", nunca zero. Engajamento = interações ÷ alcance.
- Perfil sem dados: as cinco telas abrem com mensagem clara, sem erro.
- Celular 390 px: nenhuma das cinco telas tem rolagem horizontal. Sem erro de script no desktop nem no celular.
- Contraste de cores (suíte `contraste`) e telas responsivas (`responsive`) sem falhas.
- O seletor de perfil do cabeçalho é único, continua ao trocar de aba e fica escondido fora do Instagram.

## Pendências e limites conhecidos
- **Sincronização com a Meta** (verificar em produção): o aviso "Sincronização incompleta" aparece quando um perfil falha. Agora o aviso mostra o último erro da Meta para diagnosticar. Depende do token e das permissões reais, que só se testam com a conta real.
- Publicações **programadas dentro da própria Meta** (ainda não postadas) não aparecem: a sincronização só lê o que já foi publicado.
- Visitas ao perfil e seguidores adquiridos por publicação dependem de a Meta devolver esses números; quando não devolve, aparece "—".
- Sem paginação no servidor: o ranking devolve até 1.000 publicações por consulta.
- Sem teste com leitor de tela real.
- `cinco` e `seguranca-estatica` seguem com falhas antigas fora do Instagram (Dashboard sem os 8 cartões; paginação em `lib/api/conteudo.ts`).

## Testes
`instagram-auditoria` (22 verificações), `instagram6` (26), `instagram`, `conteudo`, `desempenho`, `insights`, `contraste`, `responsive`.
Capturas: `docs/screenshots/instagram6/` (desktop e `celular-*.png`).
