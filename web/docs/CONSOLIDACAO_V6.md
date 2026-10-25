# Consolidação v6 — paginação e confiabilidade dos indicadores

Base revisada: `9907556`, branch `claude/evo-mkt-development-3at9xc`.

## Alterações

- Instagram › Conteúdos usa `/content/list` autenticado: contagem e paginação no banco (30 por página na interface; máximo 100 na API), busca, status, responsável e filtros globais antes de paginar. Os estados e as pendências vêm apenas dos registros desta página. O quadro indica que mostra a página atual. Calendário e Planejamento conservam sua consulta completa para não perder eventos.
- Foco do Dashboard continua limitando a coleção aos IDs informados. Foco vazio não retorna registros. Valores de busca e filtros são parâmetros SQL; tamanho e página são inteiros limitados. Ordenação inclui ID como desempate.
- Falhas de carregamento mostram mensagem e ação de nova tentativa; respostas de buscas anteriores são descartadas quando outra busca mais recente é feita.
- Instagram › Visão geral e Desempenho, e Tráfego Pago mostram a data real da coleta, o período e avisos. Coletas com mais de 48 horas ou sem data válida ficam sinalizadas. No Tráfego a data continua sendo a da consulta original em cache, sem ser renovada pela abertura da tela.
- A data geral de sincronização do Instagram só avança quando todas as contas monitoradas concluem a coleta. Falha parcial, ausência de perfis e token inválido deixam aviso; a próxima coleta completa limpa o aviso. O timestamp global é conservador, inclusive quando o usuário filtra um único perfil.
- Sem alteração de schema, credenciais, publicação automática ou permissões na Meta.

## Validação executada

- `node tests/consolidacao-unit.test.js`: passou. Contratos isolados de paginação, filtros parametrizados, autenticação e avisos; o próprio orquestrador `igSync` é executado com contas e chamadas externas simuladas.
- `npm run typecheck`: passou.
- Verificação de sintaxe dos JavaScripts alterados e `git diff --check`: passaram.
- `npm run build`: concluiu na repetição. A primeira execução compilou, mas terminou com `SecurityFatalError`; a seguinte concluiu mantendo o aviso de vulnerabilidade na versão instalada do Next.js. A atualização e a regressão correspondentes continuam pendentes; este trabalho não certifica a segurança das dependências.

## Pendências de homologação

Não há MySQL/MariaDB nem PHP disponíveis neste ambiente. As suítes HTTP/MySQL e de restauração não foram reexecutadas. Há novos cenários de paginação em `tests/conteudo.test.js`; executar `tests/run-web.sh conteudo backup integrations contas cinco fluxo responsive desempenho` em ambiente com os pré-requisitos antes de implantar.

A revisão do código e dos testes existentes de backup confirma cobertura de anexos, usuários, comentários, checklist, restauração e recusa de arquivos corrompidos; isso não equivale a um novo ensaio de restauração. Fazer o ensaio em banco isolado com uma cópia real.

Revisão visual no computador, iPad e iPhone e testes com contas reais da Meta/Google continuam pendentes. Não foram usados dados ou credenciais de produção, nem publicações reais. Não houve deploy nem alteração na `main`.
