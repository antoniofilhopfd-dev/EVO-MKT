# EVO MKT — Next.js + MySQL

Versão web do sistema de marketing do Colégio Evolução, pronta para a Hostinger (**Node.js Web App**).

- **Next.js 16** (App Router) · **mysql2** · TypeScript · Node 20/22.
- **API** em `app/api/[...path]/route.ts` → `lib/api/*` (mesmos endpoints `/api/*` da versão PHP).
- **Front-end** (HTML/JS/CSS, PWA) em `public/`; `proxy.ts` entrega `/` e `/solicitante` e bloqueia arquivos ocultos.
- **Banco**: migrações automáticas em `db/migrations/NNN_nome.sql`, embutidas por `scripts/prebuild.mjs` (`npm run prebuild`/`build`) em `lib/migrations.generated.ts` (não versionado). O app aplica as pendentes ao iniciar e registra em `schema_migrations`. **Nunca edite uma migração já aplicada: crie uma nova.** O esquema é compatível com a versão PHP, então o banco antigo pode ser reaproveitado.
- **Login**: senha (bcrypt, compatível com o PHP) ou só código; cookie de sessão **assinado** (`SESSION_SECRET`) com a sessão guardada no MySQL; limite de tentativas; auditoria; CSRF por cabeçalho `X-EVO`.
- **Anexos e backups** ficam no MySQL (o disco do app pode ser recriado a cada deploy).
- **Cron** protegido por `CRON_SECRET`: `/api/cron/integracoes?tarefa=publicar|sincronizar|tudo`, `/api/cron/alertas`.

## Áreas do sistema
Menu com 8 áreas (seções em abas): **Visão geral** (Hoje, Minha Área, Central Operacional) · **Solicitações** (triagem, Fluxos) · **Planejamento** (Agenda, Calendário, Tarefas, Projetos, Eventos) · **Conteúdo** (Conteúdos, Ideias, Planejamento Editorial, Aprovações, Templates, Instagram) · **Tráfego** (Tráfego, Campanhas) · **Relatórios** (Relatórios, Fechamento Mensal) · **Arquivos e equipe** · **Administração** (Acessos, Integrações, Avisos, Auditoria, Backups, Configurações). Portal das coordenações em `/solicitante`.

## Documentação
`docs/OPERACAO.md` (instalação, variáveis, migrações, autenticação, permissões, backup, procedimentos) · `docs/DEPLOY_HOSTINGER.md` · `docs/GUIA_INTEGRACOES.md` · `docs/INDICADORES_E_SLA.md` · `docs/DESIGN_SYSTEM.md` · `docs/SEGURANCA_RELATORIO.md` · `docs/PLANO_FINALIZACAO.md` e `docs/ACOMPANHAMENTO_EXECUCAO.md` (diagnóstico e execução) · `docs/HOMOLOGACAO.md` · `docs/screenshots/final/` (capturas reais com índice).

## Rodar localmente
```bash
cd web
npm install
cp .env.example .env.local   # preencha DB_*, SESSION_SECRET, APP_KEY, SETUP_KEY
npm run dev                  # http://localhost:3000
# primeira vez: http://localhost:3000/api/setup?key=SUA_SETUP_KEY  (mostra as senhas temporárias)
```
Segredos aleatórios: `npm run gerar:segredos`.

## Testes
`tests/run-web.sh` sobe o app (build de produção) contra um MySQL/MariaDB local e roda as suítes HTTP e de tela (as suítes de `tests/`):
```bash
tests/run-web.sh                 # todas
tests/run-web.sh api acesso      # algumas
```

## Publicação
Veja `docs/DEPLOY_HOSTINGER.md`.

## Variáveis de ambiente
Veja `.env.example`. Nunca coloque valores reais no repositório (`.env*` está no `.gitignore`).
