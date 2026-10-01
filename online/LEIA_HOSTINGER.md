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

Esqueceu a senha? Na tela de entrada (sistema e Portal) há **Esqueci minha senha**: a Gerente é avisada (e-mail, se configurado) e Administração → Acessos mostra o selo "pediu nova senha"; ela gera uma senha temporária. Se a **própria Gerente** esquecer, use `reset_senha.php` (precisa da `install_key`): `php reset_senha.php SUA_INSTALL_KEY NAT-3301` (ou pelo navegador com `?key=...&codigo=...`) e **apague o arquivo** depois.

## Integrações (Instagram e Google)
Em **Administração → Integrações**: métricas automáticas do Instagram, **publicar/agendar posts**, Google Agenda (2 vias), Google Drive (entregas) e Google Planilhas (relatórios). Passo a passo para criar as chaves na Meta e no Google, cron e cuidados: **`GUIA_INTEGRACOES.md`**. No `config.php` defina `public_url` e `app_key` (ver `config.sample.php`). Cron: `cron_integracoes.php publicar` (10 em 10 min) e `cron_integracoes.php sincronizar` (1x/dia).

## Equipe, e-mails e alertas de prazo
- **Administração → Acessos → Criar fichas da equipe**: cria em *Equipe* a ficha de cada acesso interno (capacidade de 40 h/semana). Preencha o **e-mail** de cada pessoa na ficha: ela passa a receber aviso quando um item é atribuída a ela.
- **Alerta diário de prazos (opcional):** no hPanel → *Cron Jobs*, 1x/dia: `php /home/SEU_USUARIO/public_html/cron_alertas.php`. Cada pessoa recebe seus itens atrasados ou que vencem hoje/amanhã; a Gerente (`notify_to`) recebe o resumo geral.
- **Reatribuição:** a Equipe só reatribui itens que são dela ou sem responsável; a Gerente reatribui qualquer um.

## Visões
Tarefas abrem em **Quadro** (arrastar entre colunas), Eventos em **Linha do tempo** e Campanhas em **Cartões** (período, orçamento, nº de conteúdos). Em cada uma, o botão **Lista** volta à tabela.

## Testes (na pasta `tests/`)
`DB=mysql tests/run_all.sh` (ou sem `DB=` para SQLite) monta um site de teste, instala e roda: API (68 verificações), alerta por cron, **integrações contra servidores simulados da Meta e do Google (48)**, tela de integrações (19), interface (19) e **fluxos de ponta a ponta** (28: Portal ↔ Gerente com anexos, ajuste, entrega, aprovação e avaliação; Minha Área; Central de Aprovações; Lixeira; Equipe; visões) em Chromium; `responsive.test.js` verifica estouro horizontal em 1280/1024/800 px. Última execução: tudo passou em **MariaDB 10.11** e SQLite, com a política de segurança (CSP) ativa.

## Limites conhecidos
- Hospedagem compartilhada costuma limitar upload (`upload_max_filesize`); o sistema aceita até 20 MB por arquivo (`max_upload_mb`) e só tipos seguros (PDF, imagens, Office, vídeo MP4/MOV, ZIP…).
- Dados dos alunos/escola ficam num servidor externo: use senhas fortes e mantenha o backup baixado fora do servidor (`/api/backup/download`).
- Testado com PHP 8.3 + MariaDB 10.11 e SQLite, em Chromium. **Não** foi testado no ambiente real da Hostinger (versão de PHP, `mail()`, limites de upload e `.htaccess` dependem do plano).
- Os arquivos `.exe` e `runtime_src` não são usados na versão online.
- Não há envio de senha por e-mail: a Gerente (ou `reset_senha.php`) gera a senha temporária. Permissão por registro: exclusão (Equipe só exclui o que criou ou é dela) e reatribuição; demais edições são por módulo.
- Notificações **push no celular** não existem (só e-mail e avisos dentro do sistema).
- **Instagram/Google foram testados só contra servidores simulados**, nunca contra as contas reais (não há credenciais aqui). A primeira conexão e a primeira publicação precisam ser conferidas por você. Meta Ads (tráfego pago) continua manual/CSV.
- `app.js` continua um arquivo grande (as novidades ficaram em `admin.js` e `views.js`).
- Os códigos de acesso antigos do Portal que estão em `storage/portal/acessos.json` (versão local) não são usados aqui, mas estão no repositório: gere novos se esse repositório não for privado.

## Usar como app (PWA)
No seu domínio com HTTPS, o sistema é instalável como app: no Chrome/Edge (computador) use o ícone de instalar na barra de endereço ou o botão **Instalar app**; no celular, "Adicionar à tela inicial". O Portal do Solicitante também instala (`/solicitante.html`). O app guarda só a "casca" (telas); os dados sempre vêm do servidor, então exige internet.

## Identidade visual (Guia de uso da marca 2023)
Logos aplicadas conforme o guia: logo bicolor em fundo branco (login, Portal, relatórios impressos) e versão com "evolução" em branco + símbolo laranja sobre o azul do menu; símbolo isolado (laranja) no menu recolhido, no favicon e nos ícones do app (sobre azul #063996). Paleta oficial nas variáveis do sistema (#063996, #FF7800, #00275F); roxo só no Portal do Infantil.
**Fonte:** Objectivity aplicada (Regular, Medium e Bold, como no guia) a partir dos arquivos enviados, convertidos para WOFF2 em `fonts/`. Títulos em Bold, subtítulos em Medium, textos em Regular. Símbolos que a fonte não tem (✓, →, º) usam a fonte do aparelho.
**Licença:** os arquivos vieram de um site de fontes gratuitas (FontGet) e não trazem licença embutida. Objectivity é uma fonte comercial; para uso em site, confirme com quem fez a marca (ou com a fundição) se a licença do Colégio cobre uso web. Se não cobrir, basta apagar a pasta `fonts/` e as linhas `@font-face` no início de `style.css` e `portal.css`: o sistema volta à fonte do aparelho sem perder nada.
