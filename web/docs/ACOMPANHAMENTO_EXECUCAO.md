# Acompanhamento da execução — Prompt Mestre Definitivo

Registro objetivo, atualizado ao final de cada bloco de trabalho. Datas: 13/10/2026.

## Estado final
**Concluído com ressalvas documentadas** (seção "Pendências e dependências externas").
Suíte completa (`tests/run-web.sh`): **30 suítes de verificação, 618 verificações, 0 falhas**, mais a suíte `responsive` (6 larguras × todas as telas): sem estouro horizontal. `npm audit --omit=dev`: 0 vulnerabilidades. Build de produção (`next build --webpack`) executado em cada rodada de testes.

| Suíte | Verificações | | Suíte | Verificações |
|---|---|---|---|---|
| api | 69 | | ui (login, módulos) | 19 |
| acesso | 36 | | ui2 (fluxo completo) | 27 |
| integrations | 54 | | ui3 | 19 |
| instagram | 9 | | ui4 | 9 |
| ads (Meta Ads leitura + relatório) | 20 | | ui5 | 8 |
| importar | 9 | | ui6 | 13 |
| recover | 8 | | ui7 | 16 |
| codigo | 13 | | ui8 | 7 |
| backup | 28 | | ui9 | 8 |
| integridade | 22 | | ui10 | 22 |
| operacao | 40 | | contraste (WCAG AA) | 20 |
| notificacoes | 5 | | seguranca-estatica | 9 |
| insights | 9 | | seguranca | 28 |
| extras | 32 | | xss | 7 |
| trabalho | 29 | | migracoes | 7 |
| conteudo | 16 | | | |

## Etapas
**01 Auditoria.** Concluída: `PLANO_FINALIZACAO.md` (classificação de todas as áreas, 10 migrações lidas, varredura de botões sem ação e de dados fictícios). Achados: backup sem as tabelas novas; tarefas com vínculos em texto livre; comentários sem visibilidade para o Portal; sem separar agendamento interno de publicação confirmada; só dados manuais de tráfego; navegação com 24 itens; CSS acumulado por versão.
**02 Navegação.** Concluída: 8 áreas (`AREAS` em `app.js`) com seções em abas; telas ocultas (Editorial, Fechamento, Arquivos) agora são seções. Consolidações: Aprovações em fila única (cadeia interna + conteúdos em revisão + entregas ao solicitante); Relatórios com painel integrado; comentários unificados em `record_comments`. Nenhum dado removido.
**03 Design system.** Concluída: `public/design.css` (tokens, botões, formulários, badges, tabelas, diálogos, estados, foco, redução de movimento), gradientes e decorações removidos, Portal com cores chapadas e contraste AA, `a11y.js` (diálogos). `DESIGN_SYSTEM.md`. Limite: sem teste com leitor de tela real.
**04 Banco, migrações e recuperação.** Concluída: migração 010; backup passou a cobrir histórico, notificações, links, comentários, checklists e snapshots de anúncios (backups antigos continuam restaurando); verificação de integridade somente leitura (vínculos quebrados, ciclos, órfãos, contadores); teste de **atualização de instalação existente com dados**; exclusão permanente limpa auxiliares. Restauração testada em banco isolado.
**05 Autenticação, permissões e Portal.** Concluída: sessões encerradas na troca de senha, IP real, recusa/cancelamento sempre com motivo, coordenação e data de publicação no pedido, comentários e histórico visíveis ao solicitante, matriz de permissões documentada e testada. Limite: papéis Administrador/Gerente continuam um só (`manager`); modo de login ativo não foi alterado.
**06 Gestão do trabalho.** Concluída: subtarefas e dependências por ID (sem ciclos, bloqueia concluir), checklist, comentários, histórico de prazo/responsável, tarefas recorrentes, tarefa criada automaticamente ao distribuir uma demanda (uma vez, com chave de idempotência), automações com liga/desliga. Não implementado: Gantt.
**07 Conteúdo e redes.** Concluída: canal (Instagram/TikTok/YouTube), hashtags, versão, estado de publicação separado do status (agendado internamente ≠ publicação confirmada), decisão de revisão com motivo e versão (só Gerência ou revisor), confirmação manual com link https, filtros por canal/estado/responsável. Sem API de TikTok/YouTube.
**08 Tráfego e integrações.** Concluída no código, **não validada com contas reais**: Meta Ads **somente leitura** (contas, campanhas, gasto, resultados; upsert; moeda separada; planejado × real), painel integrado de relatórios (fonte, período, atualização, sem estimativas, sem misturar API e manual), conferência de permissões/token/contas do Instagram, Google (Agenda/Drive/Planilhas) e IA (legendas) já existentes. AdFlow: ZIP **não foi recebido** (pendência). MCP e WhatsApp: não implementados (não justificados).
**09 Testes, documentação e capturas.** Concluída: 30 suítes, documentação (`OPERACAO.md`, `DESIGN_SYSTEM.md`, `SEGURANCA_RELATORIO.md`, README, `.env.example`), 21 capturas reais com índice em `docs/screenshots/final/`. Orkestrya: ZIP inspecionado (conceitos de aprovação por link, saúde por segmento, ranking, horários, datas, NPS já incorporados; nada de CRM/clientes/propostas).
**10 Segurança.** Concluída: `SEGURANCA_RELATORIO.md` (10 achados, todos corrigidos/mitigados e revalidados; riscos residuais e itens não verificáveis listados).

## Arquivos principais alterados nesta execução
Servidor: `lib/trabalho.ts`, `lib/integridade.ts`, `lib/api/{trabalho,conteudo,relatorios,aprovacaoPublica}.ts`, `lib/integrations/metaads.ts`, `lib/records.ts`, `lib/backup.ts`, `lib/ctx.ts`, `lib/files.ts`, `lib/api/{handlers,integrations,operacao,cron}.ts`, `lib/mail.ts`, `db/migrations/010_trabalho_trafego.sql`, `next.config.mjs`, `app/api/[...path]/route.ts`.
Interface: `public/{app,admin,operacao,portal}.js`, `public/{design,portal,style}.css`, `public/a11y.js`, `public/index.html`, `public/sw.js`.
Testes: 12 suítes novas (`trabalho conteudo ads seguranca seguranca-estatica xss migracoes ui10 contraste instagram extras insights`) e ajustes (`ui2` com datas relativas, `ui7`, `responsive`, `backup`, `operacao`, `integrations`, `mock_apis.php`, `run-web.sh`).

## Problemas encontrados no caminho
- `ui2` quebrava porque datas fixas envelheceram: corrigido para datas relativas (e o resumo do `run-web.sh` agora aponta suítes com falha).
- Um commit foi feito com uma suíte falhando (`ui2`) por eu ter filtrado mal a saída; corrigido e revalidado logo em seguida (nenhuma publicação em produção).

## Pendências e dependências externas
1. **Reimplantar** na Hostinger (não houve implantação em produção nesta execução) e conferir a tela Prontidão.
2. **Credenciais**: Meta (app e `ads_read` se quiser anúncios), Google, chave da Anthropic. Sem elas, tudo foi validado só com servidores simulados.
3. **AdFlow**: reenviar o ZIP (não chegou nesta sessão) para uma comparação de conceitos.
4. Remover `SETUP_KEY` e `RECOVERY_KEY` do painel; trocar segredos que passaram pelo chat.
5. Decisão de produto: modo de login (código × senha) e se Administrador e Gerente devem ser papéis distintos.
6. Teste com leitor de tela real; varredura dinâmica externa de segurança; LGPD (exportar/excluir dados de titular).
