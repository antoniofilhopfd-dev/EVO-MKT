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

Esqueceu uma senha? A Gerente usa `POST /api/admin/reset-password` (gera senha temporária; hoje sem botão na tela).

## Limites conhecidos
- Hospedagem compartilhada costuma limitar upload (`upload_max_filesize`); o sistema aceita até 20 MB por arquivo (`max_upload_mb`) e só tipos seguros (PDF, imagens, Office, vídeo MP4/MOV, ZIP…).
- Dados dos alunos/escola ficam num servidor externo: use senhas fortes e mantenha o backup baixado fora do servidor (`/api/backup/download`).
- Testado com PHP 8.3 + SQLite e navegador Chromium; **MySQL real da Hostinger ainda não foi testado** (SQL escrito para ser compatível).
- Os arquivos `.exe` e `runtime_src` não são usados na versão online.
- Os códigos de acesso antigos do Portal que estão em `storage/portal/acessos.json` (versão local) não são usados aqui, mas estão no repositório: gere novos se esse repositório não for privado.
