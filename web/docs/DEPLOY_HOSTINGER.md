# Publicar o EVO MKT na Hostinger (Next.js + MySQL) em evomkt.antoniopfd.com

> Os nomes de botões do hPanel mudam de vez em quando; se algum estiver diferente, procure o equivalente. **Nunca** cole senhas ou chaves no GitHub: elas vão só no painel da Hostinger (variáveis de ambiente).

## 0. Antes de começar
- Plano da Hostinger com **Node.js Web App** (Business Web Hosting ou superior, Cloud ou VPS). O plano "Single/Premium" costuma **não** ter essa opção; confira em hPanel → Websites → Add website → *Node.js Apps*.
- Repositório no GitHub: `antoniofilhopfd-dev/evo-mkt`. A Hostinger faz deploy da branch **`main`**: o código novo está em `web/`, então ele precisa estar na `main` (peça o pull request ou mescle a branch de desenvolvimento).
- Gere os segredos no seu computador (não precisa de internet):
  ```bash
  cd web && npm install && npm run gerar:segredos
  ```
  Guarde a saída (SESSION_SECRET, APP_KEY, SETUP_KEY, CRON_SECRET) em um gerenciador de senhas.

## 1. Subdomínio
1. hPanel → **Domínios → Subdomínios** → criar `evomkt` em `antoniopfd.com`.
2. Se o domínio usa os nameservers da Hostinger, o DNS é criado sozinho. Se o DNS é de outro provedor, crie lá um registro **A**: nome `evomkt`, valor = IP do servidor (hPanel → Websites → seu site → detalhes do servidor).

## 2. Banco MySQL
1. hPanel → **Bancos de dados → Gerenciamento** → criar banco + usuário (a Hostinger prefixa os nomes, ex.: `u123456789_evomkt`).
2. Anote: nome do banco, usuário, senha e o host (normalmente `localhost`).
3. **Dois caminhos:**
   - **A) Banco novo e vazio** (recomendado para recomeçar): o app cria as tabelas sozinho.
   - **B) Reaproveitar o banco do sistema PHP atual**: o esquema é o mesmo, então usuários, códigos, dados e backups continuam. Use a **mesma `APP_KEY`** do `config.php` antigo (chave `app_key`), senão os códigos de acesso e as chaves do Instagram/Google guardados não abrem.

## 3. Criar o Node.js Web App
1. hPanel → **Websites → Add website → Node.js Apps** → *Import Git repository* → autorize o GitHub → escolha `antoniofilhopfd-dev/evo-mkt`, branch **main**.
2. Configurações de build:
   | Campo | Valor |
   |---|---|
   | Framework | Next.js |
   | Node.js | 22 (ou 20) |
   | Pasta raiz (Root directory) | `web` |
   | Comando de build | `npm run build` |
   | Comando de início | `npm start` |
   | Gerenciador de pacotes | npm |
3. Em **Domínio**, escolha `evomkt.antoniopfd.com`.
4. Em **Variáveis de ambiente**, cadastre (valores só aqui, nunca no código):

   | Variável | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DB_HOST` | `localhost` (como no hPanel) |
   | `DB_PORT` | `3306` |
   | `DB_NAME` / `DB_USER` / `DB_PASSWORD` | do passo 2 |
   | `SESSION_SECRET` | gerado no passo 0 |
   | `APP_KEY` | gerado no passo 0 (caminho B: a do sistema antigo) |
   | `SETUP_KEY` | gerado no passo 0 (só no caminho A; remover depois) |
   | `PUBLIC_URL` | `https://evomkt.antoniopfd.com` |
   | `NOTIFY_TO` | seu e-mail (avisos da Gerente) |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | opcional: e-mail da hospedagem para enviar avisos |
   | `CRON_SECRET` | gerado no passo 0 |
5. **Deploy**. A cada `git push` na `main` a Hostinger refaz o build e reinicia. Na inicialização o app aplica as migrações pendentes (`db/migrations/NNN_*.sql`) e registra em `schema_migrations`.

## 4. HTTPS (SSL)
hPanel → **Segurança → SSL** → ativar o certificado (Let's Encrypt, gratuito) para `evomkt.antoniopfd.com` e ligar **Forçar HTTPS**. O sistema já envia o cabeçalho HSTS.

## 5. Primeiro acesso
- **Caminho A (banco novo):** abra `https://evomkt.antoniopfd.com/api/setup?key=SUA_SETUP_KEY`. A página mostra as **senhas temporárias uma única vez**: anote. Depois **remova a variável `SETUP_KEY`** no painel e reinicie o app (a rota também trava sozinha depois de usada).
- **Caminho B (banco da v5.17 ou anterior):** ao subir esta versão a migração faz **backup completo antes de mexer**, converte o que fica e remove o que saiu (Portal, Solicitações, Planejamento, Arquivos…). Confira o relatório em Configurações › Backup e restauração. Se o backup falhar, a migração para sem alterar nada. Tenha também uma cópia do banco pelo phpMyAdmin antes de subir.
- Entre com `NAT-3301`, troque a senha (de 6 a 8 caracteres, com letras e números) e, se quiser, ative o acesso só por código em Configurações › Acessos internos.

## 6. Tarefas agendadas (cron)
hPanel → **Avançado → Cron Jobs** (ou um serviço externo de cron que chame a URL). Use o `CRON_SECRET`:

| Frequência | Comando |
|---|---|
| a cada 10 min | `curl -fsS -H "Authorization: Bearer SEU_CRON_SECRET" "https://evomkt.antoniopfd.com/api/cron/integracoes?tarefa=publicar"` |
| 1x por dia (3h) | `curl -fsS -H "Authorization: Bearer SEU_CRON_SECRET" "https://evomkt.antoniopfd.com/api/cron/integracoes?tarefa=sincronizar"` |
| 1x por dia (8h) | `curl -fsS -H "Authorization: Bearer SEU_CRON_SECRET" "https://evomkt.antoniopfd.com/api/cron/alertas"` |

Cada um responde **200** com um JSON; sem o cabeçalho (ou com segredo errado) responde **401**. Os dois primeiros só fazem algo depois de conectar Instagram/Google (veja `docs/GUIA_INTEGRACOES.md`; o endereço de retorno agora é `https://evomkt.antoniopfd.com/api/integrations/<meta|google>/callback`).
> **Avisos no celular (Web Push)** ainda não existem neste sistema (os avisos são por e-mail). Se forem criados, o cron a cada 5 min seguirá o mesmo padrão: `.../api/push/enviar` com `Authorization: Bearer CRON_SECRET`.

## 7. Checklist de verificação
- [ ] `https://evomkt.antoniopfd.com` abre com cadeado (HTTPS) e mostra a tela de entrada.
- [ ] `http://...` redireciona para `https://...`.
- [ ] Login da Gerente funciona; trocar senha funciona; sair e entrar de novo funciona.
- [ ] Os logs do app mostram `[migrate] aplicada 001_base.sql ...` (primeiro deploy) e `banco pronto`.
- [ ] Criar uma tarefa e recarregar a página: ela continua lá (gravou no MySQL).
- [ ] Portal do solicitante (`/solicitante`): login de uma coordenação e envio de uma demanda de teste.
- [ ] `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer SEU_CRON_SECRET" https://evomkt.antoniopfd.com/api/cron/alertas` → **200**; sem o cabeçalho → **401**.
- [ ] No celular: abrir o endereço, tocar em **Instalar app** (Android/Chrome) ou *Compartilhar → Adicionar à Tela de Início* (iPhone) e abrir pelo ícone.
- [ ] Administração → Backups → **Criar backup agora** gera o arquivo; baixe uma cópia.

## 8. Cuidados finais
1. **Troque segredos que já apareceram em conversas/prints** (senha do banco, `install_key`/`app_key` antigas, senhas temporárias) e use valores novos no painel. Trocar a `APP_KEY` invalida os códigos de acesso e as chaves de integração guardadas: depois dela, gere os códigos de novo (Acessos → Gerar novo código) e reconecte Instagram/Google.
2. **Backup do banco com restauração testada:** hPanel → Bancos de dados → phpMyAdmin → *Exportar* (formato SQL). Teste *Importar* num banco de teste vazio e confira que as telas abrem com os dados. Faça isso antes de depender do sistema e depois periodicamente. (O backup da própria tela de Administração fica **dentro** do mesmo banco: serve para voltar atrás e pode ser **restaurado e validado** em Administração → Backups, mas não substitui o dump.)
3. **Desligue o sistema antigo:** quando tudo estiver validado, tire do ar o PHP em `antoniopfd.com` (apague os arquivos de `public_html`, principalmente `config.php`, `reset_senha.php` e a pasta `storage`) e exporte antes uma cópia final.
4. Mantenha `SETUP_KEY` **removida** depois da instalação.
5. Atualize pelo Git: faça `push` na `main`; nunca edite arquivos direto no servidor.
