# EVO MKT v6 — Operação, configuração e procedimentos

Complementa `DEPLOY_HOSTINGER.md` (publicação), `GUIA_INTEGRACOES.md` (Meta e Google) e `RELATORIO_V6.md` (o que mudou na reestruturação).

## 1. As cinco áreas
| Área | Para que serve |
|---|---|
| **Dashboard** | O que o Marketing precisa decidir hoje: cartões de publicações (planejadas, aprovadas, agendadas, publicadas, aguardando revisão, sem arte, sem legenda, sem data), próximas publicações, resumo orgânico e de tráfego (separados), melhor conteúdo, no máximo 3 insights e alertas de integração. Cada cartão abre os registros que contou. |
| **Calendário** | Uma tela só com camadas: publicações, planejamento editorial (campanhas editoriais), calendário escolar, datas comemorativas, feriados, Google Agenda e agendas do Google somente leitura. Visões Mês, Semana, Dia e Lista, botão Hoje, criar ao clicar no dia, reagendar arrastando. Cada item mostra de onde vem. |
| **Instagram** | Quatro abas: **Visão geral** (só orgânico), **Conteúdos** (fluxo e Estúdio), **Planejamento** (pauta do mês, ideias, campanhas editoriais, modelos e hashtags) e **Desempenho** (por perfil, segmento, formato, tema, objetivo, campanha editorial, dia e horário; orgânico × impulsionado só com vínculo confirmado). “Nova publicação” existe nas quatro. |
| **Tráfego Pago** | **Somente consulta** à Meta Ads (Visão geral, Campanhas, Anúncios, CSV e PDF A4). Criar, editar, ativar e pausar anúncios continua no Gerenciador de Anúncios da Meta. Leads, matrículas e funil comercial pertencem ao EVO CRM e não aparecem. |
| **Configurações** | Geral, Perfis e segmentos, Acessos internos, Instagram, Meta Ads, Google, IA, E-mail, Backup e restauração, Auditoria e Prontidão. |

Filtros globais (período, perfil, segmento, formato, campanha editorial) valem em todas as áreas, ficam guardados no navegador, mostram sempre o intervalo e podem ser limpos. Quando uma tela não consegue aplicar um filtro (ex.: perfil em Tráfego Pago, que a Meta não separa), o filtro aparece desativado com o motivo — nunca é ignorado em silêncio. Fuso de todos os cálculos: **America/Fortaleza**.

## 2. Fluxo da publicação
`Ideia → Rascunho → Em produção → Em revisão → Aprovado → Agendado → Publicado` (mais *Arquivado*).
- A revisão e a aprovação são **internas** (quem decide fica registrado com data e versão); não existe Portal nem link externo de aprovação.
- Aprovar, agendar e confirmar a publicação têm botão próprio e conferem os requisitos no servidor (a edição comum não pula etapas). Para agendar: título, legenda, data e hora, arte final, perfil e formato (e, para publicar sozinho no Instagram, arte em JPEG ou vídeo MP4/MOV).
- *Agendado* é interno; só vira *Publicado* quando a Meta confirma (publicação automática) ou quando alguém confirma com o link da publicação.
- **Materiais** da publicação: referência, arquivo em produção, arquivo final e miniatura, com versões (substituir guarda a anterior) e link do Google Drive (só o link; o sistema não copia nada do seu Drive).
- **Estúdio** (editor): prévias de Feed, Stories e Reels, contadores de legenda (2.200) e hashtags (30), duração do roteiro, CTA, link de destino com UTM, modelos, grupos de hashtags, salvamento automático a cada 20 s, aviso de alterações não salvas, comparação de versões do texto, copiar legenda, duplicar, adaptar para o outro perfil e compartilhar nos dois perfis. A IA só gera **rascunhos** de variação de legenda e fica desligada até haver uma chave (Configurações › IA).

## 3. Instalação e execução local
```bash
cd web && npm install
cp .env.example .env.local        # preencha DB_*, SESSION_SECRET, APP_KEY, SETUP_KEY (npm run gerar:segredos)
npm run dev                       # http://localhost:3000
# 1ª vez: http://localhost:3000/api/setup?key=SUA_SETUP_KEY  → mostra as fichas e os acessos temporários
npm run typecheck
npm run build                     # next build --webpack
```
Requisitos: Node ≥ 20 (testado com 22), MySQL/MariaDB. O disco do app é descartável: **anexos e backups ficam no banco**.

## 4. Variáveis de ambiente
Obrigatórias: `DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD SESSION_SECRET APP_KEY PUBLIC_URL`. Instalação: `SETUP_KEY` (**remover depois**). Recuperação de acesso: `RECOVERY_KEY` (**remover depois**).
Opcionais: `NOTIFY_TO MAIL_FROM SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD` (e-mails), `CRON_SECRET`, `TIMEZONE` (padrão America/Fortaleza), `SESSION_HOURS BACKUP_KEEP MAX_UPLOAD_MB LOGIN_IP_MAX LOGIN_GLOBAL_MAX LOGIN_DELAY_MS`, `TRUSTED_PROXY_HOPS`, `DB_POOL`.
A chave da IA (Anthropic) fica criptografada no banco e é cadastrada em Configurações › IA. Só para testes: `META_GRAPH_BASE META_OAUTH_BASE GOOGLE_* ANTHROPIC_API_BASE MAIL_LOG IG_POLL_MS`. Configurações › Prontidão confere o que falta.

## 5. Migrações
`db/migrations/NNN_*.sql` são embutidas em `lib/migrations.generated.ts` (`npm run prebuild`) e aplicadas ao iniciar; o que já foi aplicado fica em `schema_migrations`. Nunca edite uma migração já aplicada: crie a próxima.
**Migração 027 (cinco áreas):** antes de mexer em qualquer dado ela faz um **backup completo (com anexos)** e uma cópia de tudo que vai sair (arquivo `_legadov6`, só para consulta); se o backup falhar, a migração para sem alterar nada. Depois converte status e segmentos, transforma anexos e arquivos em materiais das publicações e grava o **relatório** (Configurações › Backup e restauração): o que foi removido, mantido e migrado, e os arquivos sem vínculo (nada é apagado da biblioteca; a exclusão é uma decisão sua, com backup antes). O histórico de ações em anúncios (`ads_acoes`, `ads_criacoes`, `ads_lancamentos`) fica preservado, sem escrita nova. Em instalação nova não há o que proteger e o backup é dispensado.

## 6. Acesso e permissões
- Só a equipe de Marketing entra (`users`): **Administrador** (tudo, inclusive acessos, integrações, backup, auditoria) e **Equipe** (opera Calendário, Instagram e consulta Tráfego; não vê integrações, backup nem auditoria — o servidor devolve 403). Não existe Portal de coordenações.
- Modos de entrada: código pessoal ou código + senha (6 a 8 caracteres, letras e números). Sessão em cookie `evo_sid` (HMAC, HttpOnly, SameSite=Strict), limite de tentativas por IP, por conta e global, aparelho novo registrado na auditoria. Recuperação: a pessoa pede, a Administração gera um acesso temporário; emergência: `/api/recover` com `RECOVERY_KEY` (remova depois).
- Cada pessoa pode ter e-mail (Configurações › Acessos internos) para avisos de atribuição.
- O calendário pode ser visto **sem login, somente leitura**, por um link temporário (Calendário › “Link de leitura para a direção”): mostra só publicações em revisão, aprovadas, agendadas e publicadas; rascunhos e ideias nunca aparecem; só o hash do link fica guardado.

## 7. Backup e restauração
Automático diário (ao usar o sistema) e manual (Configurações › Backup e restauração). Formato 2 com manifesto (contagem e SHA-256 por tabela); o backup novo é validado antes de valer; restaurar valida, guarda um backup de segurança, aplica numa transação e nunca devolve IDs já usados. Backup antigo da v5 pode ser restaurado: os registros de módulos que não existem mais (Solicitações, Tarefas etc.) não voltam ao sistema. Fora do backup: variáveis de ambiente (guarde `APP_KEY` e `SESSION_SECRET` em cofre), publicações já feitas na Meta/Google e `ig_posts` (recalculado na próxima sincronização). Faça também cópia do banco pelo phpMyAdmin e **nunca teste restauração em produção**.

## 8. Tráfego Pago (regras de segurança)
Tokens só no servidor (criptografados); nada de segredo no navegador nem nos logs; datas, conta, versão e nível validados; paginação das consultas à Meta; miniaturas só de endereços https da Meta; sem raspagem; sem dados simulados em produção (sem conta, sem permissão `ads_read` ou com token expirado a tela mostra o estado vazio com o que fazer); qualquer método diferente de GET nas rotas `/trafego/*` responde 405 e as rotas antigas de criar/editar/pausar não existem (404). Indicadores: CTR, CPC e custo por conversa são recalculados dos valores absolutos; conversas iniciadas contam uma vez por conversa; o alcance do total não soma o das campanhas; a Meta pode ajustar números por até 72 horas.

## 9. Testes
`tests/run-web.sh [suíte…]` (build de produção + MariaDB local + servidores simulados da Meta e do Google; `SKIP_BUILD=1` reaproveita o build). Suítes: `api acesso codigo recover integrations instagram contas backup integridade notificacoes conteudo fluxo removidos trafego filtros painel cinco migracoes escolar datacom auditoria seguranca-estatica seguranca contraste responsive desempenho insights`. Veja o resultado completo em `RELATORIO_V6.md`.

## 10. Procedimentos
- **Diário:** Dashboard (alertas, publicações sem arte/legenda/data).
- **Semanal:** Configurações › Prontidão, log das integrações e último backup; Auditoria › integridade dos dados.
- **Token da Meta expirou / permissão desmarcada:** Configurações › Instagram › Reconectar.
- **Esqueci o acesso do Administrador:** `RECOVERY_KEY` + `/api/recover`, depois **remover a variável**.
- **Suspeita de vazamento:** trocar `SESSION_SECRET` (derruba as sessões), `CRON_SECRET` e a senha do banco; trocar `APP_KEY` só reconectando as integrações depois.
- **Cron (Hostinger):** publicação no Instagram a cada 10 min (`tarefa=publicar`) e sincronização 1 vez por dia (`tarefa=sincronizar`); os comandos aparecem em Configurações › Prontidão.

## 11. Limitações conhecidas
Sem paginação no servidor para as listas de publicações (medido com 4.000 publicações e 4.000 posts: pior resposta ~1,5 s). Sem API do TikTok/YouTube (planejamento e confirmação manual). As integrações reais Meta/Google/Anthropic dependem das suas credenciais e foram testadas contra servidores simulados. Sem teste com leitor de tela real.
