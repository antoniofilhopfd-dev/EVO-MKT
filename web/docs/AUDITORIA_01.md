# EVO MKT — Etapa 01/06: Auditoria (matriz de requisitos)

Base: commit `09da9ad` (main). Evidência = teste automatizado em `web/tests` (build de produção + MySQL local) ou leitura do código indicada. Nada aqui foi validado na Hostinger real, salvo onde dito.

Legenda: CONCLUÍDO · PARCIAL · COM FALHA · NÃO IMPLEMENTADO · REDUNDANTE · DEP. EXTERNA.
Prioridade: P0 crítico · P1 alto · P2 médio · P3 baixo.

## A. Fundação, dados e segurança

| # | Requisito | Status | Evidência | Problema / risco | Pri | Ação |
|---|---|---|---|---|---|---|
| A1 | Login código+senha (6–8, temporária de 8, troca no 1º acesso) | CONCLUÍDO | suítes `api`, `ui` | — | — | manter |
| A2 | Login só código (4–10, único, HMAC+AES-GCM, preserva existentes, edição manual) | CONCLUÍDO | `acesso`, `codigo`, `ui4`, `ui6` | — | — | manter |
| A3 | Nunca pedir senha no modo código | CONCLUÍDO | `ui6` (nenhum diálogo de senha), `acesso` | Decisão do cliente: sem 2º fator para ações da Gerente. Risco aceito, mitigado por limites, alerta de aparelho novo e auditoria | P2 | documentar risco; ver A9 |
| A4 | Autorização em todas as rotas | CONCLUÍDO | leitura de `handlers.ts` (toda rota não pública usa `requireInternal/Manager/Portal`, cron usa Bearer, setup/recover usam chave) | — | — | teste de regressão automático de "rota sem sessão" (A4t) |
| A5 | Isolamento de segmentos do Portal | CONCLUÍDO | `api` (Portal só vê o próprio segmento, 401/403 nas áreas internas) | — | — | manter |
| A6 | Equipe não lê dados de Gerência | **COM FALHA** | `dataRoute`: `GET /data?module=configuracoes` liberado para Equipe (só escrita é restrita) | Vazamento de configurações a quem não é Gerente | P1 | restringir leitura à Gerente |
| A7 | Atualização concorrente sem perda | **COM FALHA** | `updateRow` faz ler→mesclar→gravar sem trava | Duas pessoas editando o mesmo item: a última sobrescreve campos da outra (lost update) | P1 | trava `SELECT … FOR UPDATE` em transação |
| A8 | Criação atômica (registro + cabeçalhos + ID) | PARCIAL | `newId` é transacional; `insertRow` grava registro e cabeçalhos em passos separados | Falha no meio deixa cabeçalho sem registro (sem perda de dados) | P3 | agrupar em transação |
| A9 | Limite de tentativas, atraso, bloqueio global recuperável | CONCLUÍDO | `acesso` (bloqueio, alerta, aparelho conhecido), `recover` | Recuperação de emergência existe e é testada | — | manter |
| A10 | Sessão: cookie assinado, HttpOnly, SameSite=Strict, Secure em HTTPS; revogação | CONCLUÍDO | `acesso`, `codigo` | Tabela `sessions` só é limpa no login | P3 | limpeza periódica no cron |
| A11 | Uploads: lista de extensões, limite de tamanho, download com CSP sandbox | PARCIAL | `files.ts` | Sem checagem do conteúdo real (só extensão); arquivos grandes dependem de `max_allowed_packet` do MySQL da Hostinger | P2 | validar assinatura básica; DEP. EXTERNA: limite do MySQL |
| A12 | Rota `/api/setup` e `/api/recover` protegidas | CONCLUÍDO | `recover` (403/404), `setup` trava após uso | — | — | manter |
| A13 | Índices para consultas reais | **NÃO IMPLEMENTADO** | `db/migrations`: só chaves primárias | `listRows` filtra `modulo` e ordena por `criado_em`; auditoria ordena por `id` com filtros por ator/ação; `login_attempts` filtra por `chave` | P1 | migração 004 com índices |
| A14 | Paginação no servidor | NÃO IMPLEMENTADO | `GET /data?module=` devolve o módulo inteiro; painéis calculam no navegador | Escala: ok para o volume de uma escola, degrada com milhares de itens | P2 | paginar listas grandes; medir antes |
| A15 | Segredos fora do código/logs | CONCLUÍDO | busca no repositório; `diag` redige a senha; logs só mensagens | — | — | manter |

## B. Backups e recuperação

| # | Requisito | Status | Evidência | Problema | Pri | Ação |
|---|---|---|---|---|---|---|
| B1 | Backup diário + antes de exclusão permanente; 30 mais recentes; download .json.gz | CONCLUÍDO | `api`, `ui5` | — | — | manter |
| B2 | Backup contém tudo o que é necessário | **COM FALHA** | `makeBackup`: só `records`, `headers`, `counters`, `used_ids`, `notices` | Não inclui **fichas/acessos** (`users`, `portal_users`), **configurações de integração**, **anexos** (`arquivos`), auditoria | P0 | ampliar (acessos, anexos em modo opcional) |
| B3 | Validação de integridade do backup | **NÃO IMPLEMENTADO** | — | Backup corrompido seria aceito como válido | P0 | contagem + hash por tabela e verificação ao criar/baixar |
| B4 | Restauração testada | **NÃO IMPLEMENTADO** | — | Sem caminho de volta pela aplicação | P0 | restaurar com backup prévio, transação e teste |
| B5 | Log de execução de backup (sucesso/erro) | NÃO IMPLEMENTADO | `autoBackupIfDue` engole falha | Falha de backup passa despercebida | P1 | tabela `backup_log` + alerta por e-mail |
| B6 | Dump completo do banco | DEP. EXTERNA | guia de deploy | Depende do phpMyAdmin/hPanel | P1 | manter procedimento documentado |

## C. Fluxo solicitação → entrega

| # | Requisito | Status | Evidência | Problema | Pri | Ação |
|---|---|---|---|---|---|---|
| C1 | Portal: abrir demanda, anexos, urgência com motivo, acompanhar, responder, aprovar/ajustes, avaliar 1–5, avisos | CONCLUÍDO | `api` (68 verificações, inclui transições 409/400, avaliação), `ui2` | — | — | manter |
| C2 | Status do Portal e transições do Portal | CONCLUÍDO | `portalRestrictedUpdate` + `api` | Transições feitas pela **equipe interna** não são validadas no servidor | P1 | tabela única de transições válidas no servidor |
| C3 | Distribuir sem duplicar | CONCLUÍDO (código) | `distributeRequest` só atualiza; geração de tarefa/projeto/conteúdo grava `solicitacaoId` e checa vínculo existente | Sem teste dedicado de "gerar duas vezes" | P2 | teste |
| C4 | Histórico de mensagens/devoluções/alterações | PARCIAL | campos de data/mensagem por etapa e auditoria | Não há linha do tempo única por demanda | P1 | linha do tempo a partir da auditoria + campos |
| C5 | Prazo solicitado × prazo acordado | PARCIAL | campos `prazo`, `prazoNegociado`, `prazoSLA` existem | Telas misturam os rótulos | P2 | rotular e destacar |
| C6 | Versão final aprovada e download seguro | PARCIAL | download por segmento validado; versões de arquivo na colaboração | Falta marcar "versão aprovada" de forma explícita | P2 | marcador de versão aprovada |

## D. Operação, SLA e indicadores

| # | Requisito | Status | Evidência | Problema | Pri | Ação |
|---|---|---|---|---|---|---|
| D1 | SLA por tipo (dias úteis), alerta de vencimento | PARCIAL | cálculo no navegador (`requestSlaRules`, `workflowSla*`); alertas por cron usam prazo | Regra só no cliente; sem pausa/retomada/exceção; sem documentação | P1 | regras no servidor + documento |
| D2 | Indicadores de carga por pessoa, gargalos, urgentes sem responsável | PARCIAL | Central Operacional, Fluxos, Equipe | Calculados no navegador; critérios não documentados | P1 | extrair para função única e documentar |
| D3 | Tempo de espera/atendimento por etapa | NÃO IMPLEMENTADO | só datas pontuais por etapa | Sem histórico de transições com carimbo | P1 | registrar transições (depende de C2/C4) |
| D4 | Histórico de redistribuições | PARCIAL | auditoria registra edição, não o "de/para" | — | P2 | registrar valor anterior |

## E. Navegação e redundâncias

| # | Item | Status | Evidência | Ação |
|---|---|---|---|---|
| E1 | Painéis Dashboard/Governança/Estratégia/Saúde/Manutenção/Central de Dados/Backup/Integrações(menu)/Lixeira | REDUNDANTE → removidos | commit `d2ed6f8`, testes verdes | feito |
| E2 | Hoje × Minha Área × Central Operacional | PARCIAL | três telas com cartões parecidos | separar finalidades (Hoje = dia; Minha Área = fila pessoal; Central = gerencial) |
| E3 | Calendários | CONCLUÍDO | `ui7` | calendário geral + sub-aba por módulo |
| E4 | Planejamento Editorial × Conteúdos | PARCIAL | Editorial lê Conteúdos (sem cadastro duplo) | revisar telas |
| E5 | Relatórios × Fechamento Mensal | PARCIAL | dois lugares calculam períodos | unificar fonte |
| E6 | Arquivos × anexos por registro | PARCIAL | módulo Arquivos separado dos anexos de demanda | vincular por registro |
| E7 | Cópias antigas na raiz de `web/` (`app.js`, `index.html`, `portal.js`, `portal.css`, `solicitante.html`, `style.css`) | REDUNDANTE → **removidas** | eram da base v4.0.2; o Next só serve `public/` | feito (autorizado) |
| E8 | Pasta `online/` (PHP legado), `dist/`, `.exe`, `runtime_src/`, históricos `AUDITORIA_*`/`CHANGELOG_*` na raiz | REDUNDANTE → **removidos** | sem dados reais (`DADOS/` com 0 linhas); testes compartilhados movidos para `web/tests`; histórico preservado no Git (commit `8ff3dc6`) | feito (autorizado) |

## F. Integrações, notificações, interface, publicação

| # | Requisito | Status | Evidência | Problema | Pri |
|---|---|---|---|---|---|
| F1 | Instagram (OAuth, métricas, fila, publicação, link assinado, sem duplicar) | CONCLUÍDO só com simulação / DEP. EXTERNA | `integrations` (48, servidores simulados) | Nunca testado com a Meta real; exige app aprovado e credenciais | P1 |
| F2 | Google Agenda/Drive/Planilhas | CONCLUÍDO só com simulação / DEP. EXTERNA | `integrations` | Idem; falta definir fonte de verdade por tipo (hoje: EVO é a fonte, edição no Google só altera título/data) | P1 |
| F3 | Cron protegido por Bearer e idempotente | CONCLUÍDO | `api` (401/200), `integrations` (publicar não repete) | — | — |
| F4 | Notificações: nova demanda, atribuição, aprovação/ajuste, prazos diários | CONCLUÍDO (código) | `api`, cron | **Faltam**: pedido de complementação, entrega concluída, falha de integração (só Instagram), troca de responsável com aviso ao anterior; **sem registro** de enviadas/falhas | P1 |
| F5 | Interface responsiva e PWA | **COM FALHA** | `tests/responsive.test.js` (rodar com `./run-web.sh responsive`): **35 telas com estouro horizontal** em 360/390/412 px (Tarefas, Conteúdos, Campanhas, Eventos, Administração, Configurações, Solicitações…, ~32 px em quase todas) e `eventos` também em 800 e 1024 px | Contraria o requisito "sem overflow lateral"; a suíte está FORA do conjunto padrão até a correção (Etapa 04) | P1 |
| F6 | Estados de erro/carregamento/vazio e confirmação de ações destrutivas | PARCIAL | confirmações existem nas ações novas | Revisão tela a tela pendente | P2 |
| F7 | Exportação CSV | CONCLUÍDO | `exportCSV` | PDF **não** existe | P3 |
| F8 | Build de produção na Hostinger | CONCLUÍDO (local + deploy real do build) | log de build da Hostinger com Webpack | Cron, e-mail SMTP, uploads grandes e PWA no domínio real **não comprovados** | P1 |

## Plano por prioridade e dependência

1. **Etapa 02 (Fundação)** — P0/P1: B2–B5 (backup completo, validação, restauração, log), A13 (índices), A7/A8 (concorrência/atomicidade), A6 (leitura de configurações), A4t (teste de rotas sem sessão), A10.
2. **Etapa 03 (Operação)** — C2/C4/D3/D4 (tabela única de transições, histórico de transições, linha do tempo), D1/D2 (SLA e indicadores no servidor), C3/C5/C6.
3. **Etapa 04 (Interface e gestão)** — E2/E4/E5/E6 (finalidades das telas), E7/E8 (limpeza do repositório, com confirmação), F4 (central de notificações com registro), F6.
4. **Etapa 05 (Integrações)** — F1/F2 com credenciais reais, definição da fonte de verdade, F4 (falhas de integração).
5. **Etapa 06 (Homologação)** — F5 (mobile no pipeline), suíte completa, validação na Hostinger, documentação final.


---

## Atualização — Etapa 02/06 concluída

Linha de base antes de mexer: **289 verificações, 0 falhas** (commit `09da9ad`). Depois da Etapa 02: **331 verificações, 0 falhas**.

| # | Antes | Agora | Evidência |
|---|---|---|---|
| A6 Equipe lia Configurações | COM FALHA | CONCLUÍDO (403 para Equipe) | `integridade` |
| A7 Edições simultâneas perdiam campos | COM FALHA | CONCLUÍDO (trava `FOR UPDATE` em transação) | `integridade`: 30 PUTs simultâneos sem perda; **controle negativo**: sem a trava o teste falha |
| A13 Índices | NÃO IMPLEMENTADO | CONCLUÍDO (migração 004) | migração aplicada em todos os testes |
| A4 Rotas protegidas | CONCLUÍDO (leitura) | CONCLUÍDO (teste automático) | `integridade`: 48 rotas sem sessão = 401/403; Equipe = 403 nas rotas de Gerência; Portal = 401/403 nas internas; CSRF |
| A5 Isolamento de segmentos | CONCLUÍDO | CONCLUÍDO + IDOR testado | `integridade`: outro segmento não baixa, não anexa, não altera, não lista |
| B2 Backup incompleto | COM FALHA | CONCLUÍDO: inclui módulos, contadores, IDs usados, avisos, **fichas de acesso (Equipe e Portal), configurações e vínculos de integração**, últimos 20 000 eventos de auditoria; opção **completo** inclui anexos (até 60 MB) | `backup` |
| B3 Validação | NÃO IMPLEMENTADO | CONCLUÍDO: manifesto com contagem e SHA-256 por tabela; o backup recém-gerado é conferido antes de ser aceito; truncado, adulterado ou sem Gerente ativa é recusado | `backup` |
| B4 Restauração | NÃO IMPLEMENTADO | CONCLUÍDO: valida → cria backup de segurança → aplica em **uma transação** (falha desfaz tudo); IDs nunca voltam atrás; a sessão de quem restaurou continua | `backup`, `ui5` |
| B5 Log de backup | NÃO IMPLEMENTADO | CONCLUÍDO: tabela `backup_log` (criar, validar, restaurar; OK/ERRO), e e-mail à Gerente se o backup diário falhar (no máximo 1 por dia) | `backup`, `ui5` |

Pendentes desta etapa (não bloqueiam): A8 (criação 100% atômica, P3), A10 (limpeza periódica de sessões, P3), A11 (checagem do conteúdo dos uploads, P2), A14 (paginação no servidor, P2 — medir antes).

### Procedimento de recuperação (testado)
1. Administração → Backups → **Validar** o arquivo desejado (deve mostrar "Backup válido").
2. **Restaurar** → confirmar duas vezes. O sistema cria sozinho um backup de segurança (`…_prerestauracao`) antes de substituir módulos, fichas de acesso e configurações.
3. Todos (menos quem restaurou) precisam entrar de novo. Os números de ID nunca voltam atrás.
4. Se algo sair errado, restaure o backup `…_prerestauracao`.
5. Anexos só mudam se o backup foi criado com "Incluir anexos". O dump do banco (phpMyAdmin) continua sendo a proteção contra perda total do servidor.

Limitação conhecida: o backup guarda os dados **no mesmo banco**; ele protege contra erro humano e corrupção lógica, não contra perda do banco inteiro.


## Atualização da Etapa 03 (Operação)
- C (fluxo): transições estritas com tabela única (`lib/fluxo.ts`), retorno exige motivo, Portal usa as mesmas regras; histórico em `status_history`; sem duplicação ao distribuir/devolver/reabrir (testado). CONCLUÍDO.
- D (SLA/indicadores): `lib/sla.ts` e `/api/indicadores` com definições e lista de origem; painel na Central Operacional. CONCLUÍDO. Pendente na Etapa 04: mesmo painel em Relatórios e notificações com registro.
- Testes: `operacao.test.js` (36) e `ui8.test.js` (7).

## Atualização da Etapa 04 (Interface e gestão)
- F5 (estouro horizontal em celular): CORRIGIDO. Cabeçalho e barras de ferramentas quebram linha em ≤760 px; suíte `responsive` (6 larguras × todas as telas) passa e voltou ao conjunto padrão.
- Notificações: tabela `notifications` (migração 007) e `/api/notificacoes`; registra complementação, entrega, conclusão, resposta do solicitante, atribuição de responsável e falha de integração; sino do cabeçalho mostra não lidas. Teste `notificacoes.test.js` (5).
- Painel de indicadores também em Relatórios.
- Pendente (Etapa 05/06): envio por e-mail das falhas de integração; simplificação Relatórios×Fechamento, Editorial×Conteúdos, Arquivos×anexos (decisão de produto, depende de confirmação).
