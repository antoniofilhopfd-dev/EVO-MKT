# EVO MKT — Operação, configuração e procedimentos

Complementa `DEPLOY_HOSTINGER.md` (publicação) e `GUIA_INTEGRACOES.md` (Meta, Google, IA).

## 1. Instalação e execução local
```bash
cd web && npm install
cp .env.example .env.local        # preencha DB_*, SESSION_SECRET, APP_KEY, SETUP_KEY (npm run gerar:segredos)
npm run dev                       # http://localhost:3000
# 1ª vez: http://localhost:3000/api/setup?key=SUA_SETUP_KEY  → mostra as fichas e os acessos temporários
npm run typecheck                 # verificação de tipos (não há script de lint no projeto)
npm run build                     # next build --webpack (a Hostinger não tem os binários nativos do Turbopack)
```
Requisitos: Node ≥ 20 (testado com 22), MySQL/MariaDB. O disco do app é descartável: **anexos e backups ficam no banco**.

## 2. Variáveis de ambiente
Obrigatórias: `DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD SESSION_SECRET APP_KEY PUBLIC_URL`. Instalação: `SETUP_KEY` (**remover depois**). Recuperação de acesso: `RECOVERY_KEY` (**remover depois**).
Opcionais: `NOTIFY_TO MAIL_FROM SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD` (e-mails), `CRON_SECRET` (cron), `TIMEZONE SESSION_HOURS BACKUP_KEEP MAX_UPLOAD_MB LOGIN_IP_MAX LOGIN_GLOBAL_MAX LOGIN_DELAY_MS`, `TRUSTED_PROXY_HOPS` (padrão 1), `FERIADOS`, `LIMITE_SOBRECARGA`, `ANTHROPIC_API_KEY IA_MODEL`, `DB_POOL`.
Só para testes/simulação: `META_GRAPH_BASE META_OAUTH_BASE GOOGLE_* ANTHROPIC_BASE_URL MAIL_LOG IG_POLL_MS IG_POLL_TRIES`. Exemplo comentado em `.env.example`. A tela **Administração → Integrações → Prontidão** confere o que falta.

## 3. Migrações
`db/migrations/NNN_*.sql` são embutidas em `lib/migrations.generated.ts` (`npm run prebuild`) e aplicadas ao iniciar o app; o que já foi aplicado fica em `schema_migrations`. São idempotentes (`IF NOT EXISTS`; erros 1050/1060/1061/1091 tolerados). Nunca edite uma migração já aplicada em produção: crie a próxima. Testes: instalação nova (toda suíte) e **atualização de instalação existente com dados** (`tests/migracoes.test.js`, 7 verificações). Aplicadas hoje: 001 base · 002 acesso/integrações · 003 arquivos/backups · 004 índices · 005 log de backup · 006 histórico de status · 007 notificações · 008 publicações do Instagram · 009 links de aprovação · 010 comentários, checklists e snapshots de anúncios.

## 4. Autenticação
- **Dois modos** (Administração → Acessos): *código* (um código pessoal) ou *senha* (6 a 8 caracteres, letras e números, bcrypt). A Gerência escolhe; o modo ativo não foi alterado por esta entrega.
- Sessão: cookie `evo_sid` assinado (HMAC), `HttpOnly`, `SameSite=Strict`, `Secure` em HTTPS, guardada no banco, expira em `SESSION_HOURS`. Logout e troca de senha encerram as sessões (a troca mantém só a atual). O Portal usa token em cabeçalho (`X-Portal-Token`).
- Limite de tentativas por IP, por conta e global; atraso fixo em falhas; aparelhos novos são registrados na auditoria. IP real = fim de `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`).
- **Recuperação de senha:** o usuário pede em "Esqueci"; a resposta é igual exista a conta ou não; a Gerência recebe aviso e gera senha temporária (troca obrigatória). Não há link de redefinição por e-mail.
- Links de aprovação sem login: token de 64 hex, hash no banco, uso único, validade 1–30 dias, limite de tentativas por IP.

## 5. Permissões (verificadas no servidor)
| Perfil | Pode |
|---|---|
| **Gerência** (`manager`) | Tudo: administração, acessos, integrações, backups, indicadores, relatórios salvos, automações |
| **Equipe** (`team`) | Ler os módulos operacionais; criar/editar nos módulos de trabalho (`TEAM_WRITE`); reatribuir só o que é seu; excluir só o que criou ou é seu; decidir revisão de conteúdo **se for o revisor indicado**. Não lê Configurações; recebe 403 em todas as rotas `/admin/*`, `/backup*`, `/integrations/*`, `/indicadores`, `/insights`, `/reports/save` |
| **Coordenação (Portal)** | Só `/portal/*`: criar, ver e acompanhar demandas **do(s) próprio(s) segmento(s)**, responder complementações, aprovar/pedir ajustes, anexar, comentar, avaliar (nota e NPS). Não altera status, responsável, prazo nem segmento |
A interface esconde o que o perfil não usa, mas **não é a barreira**: `tests/integridade.test.js` e `tests/seguranca.test.js` chamam a API direta. *Administrador* e *Gerente* compartilham o papel `manager`; não há motivo técnico hoje para um terceiro papel (registrado como limitação).

## 6. Backup e restauração
- Automático diário (ao usar o sistema) e manual (Administração → Backups). Formato 2: manifesto com contagem e SHA-256 por tabela; o backup recém-criado é validado antes de valer; **Validar** e **Restaurar** na tela.
- **Cobertura:** registros de todos os módulos, cabeçalhos, contadores e IDs usados, avisos, fichas de acesso (Equipe e Portal), configurações das integrações (segredos criptografados), vínculos do Google, publicações do Instagram, **histórico de status, notificações, links de aprovação, comentários, checklists e snapshots de anúncios**, trilha de auditoria (últimos 20 mil eventos, informativa) e, no backup "completo", os **anexos**.
- **Fora do backup:** variáveis de ambiente (guarde `APP_KEY` e `SESSION_SECRET` em cofre: sem a `APP_KEY` os tokens salvos não abrem), publicações já feitas no Instagram/Google, `ig_posts` (recalculado na próxima sincronização) e sessões ativas.
- Restauração: valida → cria backup de segurança → aplica numa transação (falha desfaz tudo) → IDs nunca voltam atrás → sessões do Portal são encerradas. Testada em ambiente isolado (`backup.test.js`, 28 verificações, incluindo backup corrompido, adulterado, sem Gerência e anterior às tabelas novas). **Nunca teste sobre a produção.** Além disso, faça cópia do banco pelo phpMyAdmin.

## 7. Testes
`tests/run-web.sh [suíte…]` (build de produção + MariaDB local + servidores simulados da Meta/Google/Anthropic). Suítes: `api acesso integrations instagram ads importar recover codigo backup integridade operacao notificacoes insights extras trabalho conteudo ui ui2 ui3 ui4 ui5 ui6 ui7 ui8 ui9 ui10 contraste seguranca-estatica seguranca xss migracoes responsive`. Auditoria de dependências: `npm audit --omit=dev`.

## 8. Procedimentos operacionais
- **Rotina diária:** olhar *Visão geral → Central Operacional* (alertas, SLA, notificações). O resumo por e-mail chega pelo cron `/api/cron/alertas`.
- **Semanal:** conferir a Prontidão, o log de integrações e o último backup (Administração → Backups → Verificar integridade dos dados).
- **Mensal:** salvar o relatório integrado no histórico; conferir `FERIADOS` e os acessos ativos.
- **Token da Meta expirou / permissão desmarcada:** Administração → Integrações → Reconectar (a Prontidão e a central avisam).
- **Esqueci o acesso da Gerência:** definir `RECOVERY_KEY` no painel, usar `/api/recover`, **remover a variável**.
- **Suspeita de vazamento:** trocar `SESSION_SECRET` (derruba todas as sessões), `CRON_SECRET`, senha do banco; trocar `APP_KEY` só reconectando as integrações depois.

## 9. Limitações conhecidas
Sem paginação no servidor (volume atual não exige; reavaliar acima de ~5 mil registros por módulo). Sem Gantt. Sem API do TikTok/YouTube (planejamento e confirmação manual). Sem indicadores institucionais (não há fonte autorizada). Integrações reais Meta/Google/Anthropic não validadas (dependem de credenciais; testadas só com servidores simulados). Sem teste com leitor de tela real. Demandas anteriores à migração 006 não têm histórico.


## Estúdio de publicações (v5.3.0)
Conteúdo → **Estúdio de publicações**: semana editorial com arrastar-e-soltar (reagenda mantendo a hora), coluna "Sem data", filtros por perfil/etapa/formato, datas comemorativas no dia e dica de melhor horário (calculada dos posts reais; abaixo de 8 posts não sugere nada).
- **Novo post:** título, perfil, formato, legenda (contador de 2.200), hashtags (contador de 30), CTA, data/hora, revisor, mídia e prévia aproximada do Instagram. Três botões: *Salvar rascunho* (PRODUÇÃO), *Enviar para aprovação* (REVISÃO) e *Agendar* (PROGRAMADO, exige data).
- **Grupos de hashtags:** salvos no servidor (`/api/studio/hashtags`), até 30 grupos de 30 tags.
- Nada é publicado sozinho: a publicação automática segue exigindo a opção marcada, status Aprovado/Agendado e mídia anexada.
