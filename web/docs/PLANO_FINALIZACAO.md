# EVO MKT — Plano de finalização (Prompt Mestre Definitivo)

Documento vivo. Registra o diagnóstico (Etapa 01), as decisões e o que foi feito em cada etapa. Detalhes de execução e testes: `ACOMPANHAMENTO_EXECUCAO.md`. Regras visuais: `DESIGN_SYSTEM.md`. Histórico das etapas anteriores: `AUDITORIA_01.md` e `HOMOLOGACAO.md`.

## 1. Diagnóstico inicial (Etapa 01) — confirmado no repositório em 13/10/2026

**Stack verificada:** Next.js 16 (build `--webpack`), React 19 (usado só em `app/`; a interface é HTML/JS estático em `public/`), TypeScript, Node ≥ 20, MySQL/MariaDB via `mysql2` (tabela `records(modulo,id,data JSON)` + tabelas auxiliares), sessão por cookie assinado, PWA (`sw.js`). Portal em `/solicitante`. Migrações `db/migrations/001…010`, embutidas por `scripts/prebuild.mjs` e aplicadas ao iniciar (`instrumentation.ts`).

**Migrações (todas lidas):** 001 base; 002 acesso/integrações; 003 arquivos/backups; 004 índices; 005 log de backup; 006 histórico de status; 007 notificações; 008 publicações do Instagram; 009 links de aprovação; 010 comentários, checklists e snapshots de anúncios. Nenhum conflito encontrado: todas usam `CREATE TABLE IF NOT EXISTS`/índices idempotentes; o executor tolera 1050/1060/1061/1091. Instalação nova e reinício repetido são exercitados por toda a suíte (cada suíte recria o banco e sobe o app).

| Área | Classificação | Evidência / observação |
|---|---|---|
| Solicitações (ciclo, transições, histórico, SLA, indicadores) | Implementada e validada | `operacao.test.js`, `ui2/ui8` |
| Portal `/solicitante` (criar, acompanhar, responder, anexar, NPS, histórico) | Implementada e validada | `ui2`, `extras`, `integridade` |
| Isolamento entre coordenações | Implementada e validada | `integridade` (IDOR), `trabalho` (comentários) |
| Autenticação / sessões / limite de tentativas / recuperação | Implementada e validada | `acesso`, `codigo`, `recover` |
| Backup/restauração (validação SHA-256, transação) | Implementada e validada — **correção na Etapa 04**: tabelas novas (histórico, notificações, links, comentários, checklists, anúncios) não estavam no backup | `backup.test.js` |
| Integrações Instagram/Google | Implementada e validada **com servidores simulados**; real depende de credenciais | `integrations`, `instagram` |
| Tarefas | Implementada, com correções: subtarefas/dependências/checklist eram texto livre; recorrência não existia | Etapa 06 |
| Comentários/colaboração | Parcialmente implementada: eventos soltos num campo do registro, sem visibilidade para o Portal | Etapa 06 |
| Conteúdo (calendário, status, aprovação) | Parcialmente implementada: sem canal, sem separar agendamento interno de publicação confirmada, sem decisão registrada | Etapa 07 |
| Tráfego | Parcialmente implementada: só registros manuais; sem leitura da Meta Ads | Etapa 08 |
| Relatórios | Implementada, mas sem fonte/data em cada número e sem separar API de registro manual | Etapa 08 |
| Navegação | Redundante: 24 itens, 3 telas ocultas | Etapa 02 |
| Design | Redundante: camadas de CSS por versão, gradientes decorativos | Etapa 03 |
| Acessibilidade | Parcial: sem foco visível padronizado, diálogos sem papel/aria/foco | Etapa 03 |
| CRM/clientes/propostas/serviços/contratos/faturamento | **Não aplicável e ausente** (verificado por busca; só "funil" de tráfego, que é métrica de anúncio) | Exclusão mantida |
| WhatsApp | Não implementado (decisão: fora do escopo) | — |
| TikTok/YouTube | Planejamento interno + confirmação manual; sem API | Etapa 07 |
| Dependências | `npm audit --omit=dev`: nodemailer com vulnerabilidades altas → atualizado (0 vulnerabilidades) | Etapa 10 |
| Botões sem ação | Nenhum encontrado (varredura de `<button id>` × referências) | — |
| Dados fictícios como reais | Nenhum nos módulos; seeds só de fichas de acesso | — |

## 2. Decisões

- **Autenticação:** o sistema suporta dois modos (código ou senha) e a Gerência escolhe em Administração. O prompt pede usuário/senha para as coordenações; o modo atual de produção é uma escolha da Gerência (decisão anterior: "somente código"). Nada foi alterado no modo ativo; ambos os modos permanecem testados.
- **Papéis:** `manager` (Gerência = administração + gestão) e `team` (Equipe). A separação "Administrador × Gerente" não foi criada: hoje não há permissão que justifique um terceiro papel; está registrado como limitação.
- **Comentários:** `record_comments` é a fonte oficial; os eventos antigos de colaboração continuam legíveis na ficha antiga, sem migração destrutiva.
- **Aprovações:** a fila "Aprovações" reúne cadeia interna, conteúdos em REVISÃO e entregas aguardando solicitante; não há mais um fluxo novo, só uma visão única.
- **Meta Ads:** somente leitura. Nenhuma operação que gere gasto.
- **AdFlow:** o ZIP não foi enviado nesta sessão (só Orkestrya, marca, tipografia e planilhas antigas). Registrado como pendência: reenviar para a comparação final.
