# EVO MKT Online v4.1.0 — Implantação na Hostinger (hospedagem compartilhada)

Versão **online** do EVO MKT: PHP 8.1+ e MySQL, sem Node e sem `.exe`. A versão local (Windows, XLSX) continua intacta nas pastas `web/` e `DADOS/`.

## O que mudou em relação à versão local
- Dados em **banco MySQL** (antes: 19 XLSX). IDs continuam únicos e **nunca reutilizados** (tabela `used_ids`).
- **Login com senha** validada no servidor (hash `password_hash`), sessão por cookie HttpOnly, troca de senha obrigatória no primeiro acesso, bloqueio após 5 tentativas (15 min), proteção CSRF e HTTPS forçado.
- Equipe só grava nos módulos permitidos; backup, exclusão permanente, configurações e reset de senha são da Gerente (validado no servidor, não só na tela).
- Portal do Solicitante no mesmo domínio (`/solicitante.html`), com isolamento por segmento e anexos em pasta protegida.
- Backup diário automático e manual (`storage/backups`, mantém os 30 últimos) e backup antes de exclusão permanente.

## Passo a passo
1. No hPanel: crie um **banco MySQL** (anote nome, usuário e senha) e ative **SSL/HTTPS** no domínio.
2. Envie **todo o conteúdo da pasta `online/`** para `public_html/` (ou subdomínio).
3. Copie `config.sample.php` para `config.php` e preencha banco e `install_key` (texto longo e aleatório).
4. (Opcional) Para migrar os dados atuais, envie a pasta `DADOS/` com os 19 XLSX para `storage/import/DADOS/`.
5. Abra `https://SEU-DOMINIO/install.php?key=SUA_INSTALL_KEY`. A página cria tabelas e usuários, importa os XLSX e mostra **uma única vez** as senhas temporárias. Anote.
6. **Apague `install.php`**, `storage/import/` e confira que `config.php` não abre no navegador.
7. Entre em `https://SEU-DOMINIO/`, troque a senha. Entregue ao Portal os códigos `INF-2601`, `INI-2602`, `FIN-2603`, `MED-2604`, `AUZ-2605` com cada senha temporária.

## Administração (menu Sistema → Administração, só Gerente)
- **Acessos:** redefinir senha (senha temporária exibida uma vez), ativar/desativar equipe e Portal.
- **Avisos do Portal:** publicar/remover avisos por segmento.
- **Auditoria:** últimos 200 eventos (login, criar, editar, excluir, backup, reset).
- **Backups:** criar, listar e **baixar** backups (`.json.gz`). Baixe cópias e guarde fora do servidor.
- **Entrega:** botão de envio de arquivos finais na tela de Solicitações; o solicitante baixa pelo Portal.
- **Tráfego/Instagram → Importar CSV:** aceita exportação do Gerenciador de Anúncios / Insights (`;` ou `,`, valores pt-BR), ignora duplicados e mostra prévia antes de gravar.
- **E-mail (opcional):** preencha `notify_to` e `mail_from` em `config.php` para avisar a Gerente de nova demanda e de aprovações/ajustes. Usa `mail()` da hospedagem (melhor esforço).

Esqueceu a senha? A Gerente redefine em Administração → Acessos. Se for a própria Gerente, redefina direto no banco (tabela `users`) ou reinstale com `install.php` em banco novo.

## Testes (na pasta `tests/`)
`DB=mysql tests/run_all.sh` (ou sem `DB=` para SQLite) monta um site de teste, instala e roda API (55 verificações) e interface (19) em Chromium; `responsive.test.js` verifica estouro horizontal em 1280/1024/800 px. Última execução: tudo passou em **MariaDB 10.11** e SQLite, com a política de segurança (CSP) ativa.

## Limites conhecidos
- Hospedagem compartilhada costuma limitar upload (`upload_max_filesize`); o sistema aceita até 20 MB por arquivo (`max_upload_mb`) e só tipos seguros (PDF, imagens, Office, vídeo MP4/MOV, ZIP…).
- Dados dos alunos/escola ficam num servidor externo: use senhas fortes e mantenha o backup baixado fora do servidor (`/api/backup/download`).
- Testado com PHP 8.3 + MariaDB 10.11 e SQLite, em Chromium. **Não** foi testado no ambiente real da Hostinger (versão de PHP, `mail()`, limites de upload e `.htaccess` dependem do plano).
- Os arquivos `.exe` e `runtime_src` não são usados na versão online.
- Recuperação de senha por e-mail não existe (a Gerente redefine). Permissão por registro existe só para exclusão (Equipe exclui o que criou ou é responsável); edição é por módulo.
- `app.js` continua um arquivo grande; a diferenciação visual de Tarefas/Eventos/Campanhas não foi alterada nesta versão.
- Os códigos de acesso antigos do Portal que estão em `storage/portal/acessos.json` (versão local) não são usados aqui, mas estão no repositório: gere novos se esse repositório não for privado.
