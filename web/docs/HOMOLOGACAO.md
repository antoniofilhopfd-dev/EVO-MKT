# Homologação final — EVO MKT (Etapa 06)

Estado verificado em 2026-10-10, suíte completa `tests/run-web.sh` (build de produção + MariaDB local): **18 suítes, 382 verificações, 0 falhas, e `responsive` sem estouro horizontal** (6 larguras × todas as telas).

## O que foi comprovado por teste
| Área | Evidência |
|---|---|
| Acesso só por código, sem senha, bloqueio, aparelhos, auditoria | `acesso` (36), `codigo` (13), `recover` (8) |
| Segurança de rotas (varredura sem sessão, CSRF, Equipe×Gerência, Portal×interno, IDOR entre segmentos) | `integridade` (17), `api` (69) |
| Edição simultânea sem perda de dados (30 PUTs) | `integridade` (com controle negativo) |
| Backup completo, validação por SHA-256, restauração transacional, log, anexos | `backup` (23), `ui5` |
| Fluxo solicitação→entrega, transições, histórico, SLA em dias úteis, indicadores | `operacao` (36), `ui2` (27), `ui8` (7) |
| Notificações com registro | `notificacoes` (5) |
| Integrações Meta/Google (servidores simulados), falha → notificação + e-mail | `integrations` (49) |
| Importação de planilhas | `importar` (9), `ui5` |
| Interface (telas, calendários, administração, celular) | `ui`…`ui7`, `responsive` |

## Não comprovado (dependências externas ou pendências)
1. **Integrações reais Meta/Google:** só testadas com servidores simulados. Precisam das suas credenciais e de um teste com contas reais.
2. **Deploy:** o código está na `main`; só vale em produção depois de reimplantar na Hostinger. Confira `/api/health` e a versão no rodapé.
3. **Backup do banco pela Hostinger** (phpMyAdmin) e teste de restauração fora do app: ação sua.
4. **Segredos que passaram pelo chat** (senha do banco, `SESSION_SECRET`, `APP_KEY`, `SETUP_KEY`, `CRON_SECRET`, `RECOVERY_KEY`): trocar; remover `SETUP_KEY` e `RECOVERY_KEY` do painel.
5. **Pendência técnica menor:** paginação no servidor (A14), aceitável para o volume atual. A8, A10 e A11 foram fechadas.
6. Demandas anteriores à migração 006 não têm histórico de status.
7. Telas retiradas do menu (Planejamento Editorial, Fechamento Mensal, Arquivos) continuam existindo, com dados, pelos atalhos "Ver também".

## Roteiro de aceite manual (10 minutos, após reimplantar)
1. Entrar com seu código; abrir Administração → Acessos e conferir os códigos.
2. Portal: entrar como solicitante, criar uma demanda e anexar um arquivo.
3. Painel interno: triar, distribuir, entregar; no Portal, aprovar; conferir "Ver histórico" e as notificações.
4. Central Operacional: clicar em um indicador e ver a lista de origem.
5. Administração → Backups: criar backup, **Validar**, e só então testar Restaurar em horário sem uso.
6. Abrir no celular: nenhuma tela deve exigir rolagem lateral.

## Riscos residuais
Transições de status são estritas: fluxos antigos que pulavam etapas passam a receber aviso (409). Restaurar um backup encerra as sessões do Portal. Se a Hostinger não rodar as migrações 006 e 007 ao iniciar, abra `/api/health` e reinicie o app.
