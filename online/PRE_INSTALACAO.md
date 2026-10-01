# EVO MKT Online — Checklist de instalação (Hostinger)

Tempo estimado: 30 a 45 minutos. Marque cada item. Em caso de dúvida, rode o **diagnóstico** (passo 6): ele diz exatamente o que falta.

## 0. Decida antes
- [ ] **Endereço**: recomendo um **subdomínio** próprio, ex. `marketing.seudominio.com.br` (o sistema precisa ficar na **raiz** do endereço, não numa subpasta).
- [ ] Quem será a Gerente (recebe as senhas temporárias na tela de instalação) e o e-mail que receberá os avisos (`notify_to`).

## 1. Painel da Hostinger (hPanel)
- [ ] **Domínios → Subdomínios**: crie o subdomínio. Anote a pasta dele (geralmente `public_html/marketing` ou `domains/.../public_html`).
- [ ] **SSL**: ative o certificado do subdomínio e o **"Forçar HTTPS"**. (Instagram/Google só funcionam com https.)
- [ ] **Avançado → Configuração do PHP**: escolha **PHP 8.2 ou superior**. Em *Extensões* confirme: `pdo_mysql`, `curl`, `openssl`, `mbstring`, `zip`, `fileinfo`, `simplexml`. Em *Opções*: `upload_max_filesize = 32M`, `post_max_size = 32M`, `memory_limit = 256M`, `max_execution_time = 120`.
- [ ] **Bancos de dados → MySQL**: crie um banco novo (nome, usuário e senha). **Anote os três** (costumam ter prefixo, ex. `u123456789_evomkt`). Servidor/host normalmente é `localhost`.
- [ ] (Opcional) **E-mails**: crie uma caixa como `nao-responda@seudominio.com.br` para usar como remetente (`mail_from`).

## 2. Enviar os arquivos
- [ ] Baixe o ZIP `EVO_MKT_ONLINE_v4_x_x.zip` e, no **Gerenciador de Arquivos** do hPanel, entre na pasta do subdomínio.
- [ ] **Envie o ZIP e extraia no servidor** (é mais seguro que FTP: preserva os arquivos que começam com ponto, como `.htaccess`). Depois mova o conteúdo da pasta `EVO_MKT_ONLINE_...` para a raiz do subdomínio, de modo que `index.html`, `api/`, `storage/` fiquem direto nela.
- [ ] Ative "mostrar arquivos ocultos" e confirme que existem **`.htaccess`** (raiz) e **`storage/.htaccess`**.

## 3. Configuração (`config.php`)
- [ ] Use o arquivo **`config.pronto.php`** (já vem com `install_key` e `app_key` gerados, só faltam seus dados). Envie para a raiz e **renomeie para `config.php`**.
- [ ] Preencha: `db → host/name/user/pass` (passo 1), `public_url` (`https://marketing.seudominio.com.br`, sem barra no fim), `notify_to`, `mail_from`.
- [ ] **Guarde uma cópia da `app_key` e da `install_key` fora do servidor** (gerenciador de senhas). Perder a `app_key` obriga a reconectar Instagram/Google.

## 4. (Opcional) Levar os dados da versão antiga
- [ ] Crie a pasta `storage/import/DADOS/` e envie os arquivos `EVO_MKT_*.xlsx` da versão local. O instalador importa tudo, **preserva os IDs** e continua a numeração a partir deles.
- [ ] A pasta `ANEXOS/` antiga (arquivos das solicitações) deve ser enviada para `storage/ANEXOS/` mantendo as subpastas (`SOLICITACOES/<ID>/...`).

## 5. Diagnóstico (antes de instalar)
- [ ] Abra `https://marketing.seudominio.com.br/diagnostico.php?key=SUA_INSTALL_KEY`
- [ ] Resolva todos os **[ ERRO ]**. Os **[ATENÇÃO]** afetam só recursos opcionais. Dois erros são críticos de segurança: *config.php acessível* ou *pasta storage acessível* → o `.htaccess` não foi enviado/aplicado.
- [ ] Para testar e-mail: acrescente `&teste_email=seu@email.com` ao endereço.

## 6. Instalar
- [ ] Abra `https://marketing.seudominio.com.br/install.php?key=SUA_INSTALL_KEY`
- [ ] **Copie e guarde as senhas temporárias** (aparecem uma única vez): 5 da equipe e 5 do Portal (códigos `INF-2601`, `INI-2602`, `FIN-2603`, `MED-2604`, `AUZ-2605`).
- [ ] **Apague do servidor**: `install.php`, `diagnostico.php`, `reset_senha.php` (guarde uma cópia local deste último para emergência) e a pasta `storage/import/`.
- [ ] Confirme que `https://.../config.php` mostra **erro** (403/404) e não o conteúdo.

## 7. Primeiro acesso
- [ ] Entre como `NAT-3301` (Gerente) e troque a senha (o sistema exige).
- [ ] **Administração → Acessos**: confira os 10 acessos; clique **Criar fichas da equipe** e depois, em **Equipe**, preencha o **e-mail** e a **capacidade** de cada pessoa (recebem avisos de atribuição e prazos).
- [ ] Distribua as senhas temporárias: equipe (código `ANT-3302` etc.) e coordenadoras (códigos do Portal). Cada um troca a senha no primeiro acesso.
- [ ] Teste o **Portal** em outro navegador: login → nova demanda → ver na triagem da Gerente.
- [ ] Publique um **aviso** de boas-vindas em Administração → Avisos do Portal.

## 8. Rotinas automáticas (hPanel → Avançado → Cron Jobs)
Troque `CAMINHO` pela pasta do subdomínio (a tela de Integrações mostra o caminho exato).
- [ ] 1x/dia, 8h: `php CAMINHO/cron_alertas.php` — avisa prazos por e-mail.
- [ ] A cada 10 min: `php CAMINHO/cron_integracoes.php publicar` — (só depois de conectar o Instagram)
- [ ] 1x/dia, 6h: `php CAMINHO/cron_integracoes.php sincronizar` — (só depois de conectar Instagram/Google)
- [ ] **Backup**: o sistema cria 1 por dia sozinho; baixe uma cópia em Administração → Backups **toda semana** e guarde fora do servidor.

## 9. Celular (app)
- [ ] No celular, abra o endereço no Chrome → menu → **Adicionar à tela inicial** (e o Portal: `/solicitante.html`). No computador, ícone de instalar na barra de endereço.

## 10. Integrações (quando quiser)
- [ ] Siga `GUIA_INTEGRACOES.md` (Instagram e Google). Não é necessário para o sistema funcionar.

## Problemas comuns
| Sintoma | Causa provável | Solução |
|---|---|---|
| Página em branco ou erro 500 | PHP antigo / extensão faltando | Passo 1 (PHP 8.2+, extensões); veja `storage/erro.log` |
| `/api/heartbeat` dá 404 | `.htaccess` não enviado | Passo 2: arquivos ocultos; reenvie |
| "Sistema não configurado" | `config.php` ausente | Passo 3 |
| Acentos viram `?` | Banco não é utf8mb4 | Recrie o banco como utf8mb4 e reinstale |
| Upload falha com arquivos grandes | Limites do PHP | Passo 1 (`upload_max_filesize`, `post_max_size`) |
| "Muitas tentativas" no login | 5 erros seguidos | Aguarde 15 min |
| Esqueci a senha da Gerente | — | `php reset_senha.php INSTALL_KEY NAT-3301` (terminal) ou `reset_senha.php?key=...&codigo=NAT-3301` |

## Se precisar de ajuda, me envie
Versão do PHP (hPanel), o resultado do diagnóstico (copie o texto), o endereço escolhido e a mensagem exata de erro. **Nunca envie** a senha do banco, a `install_key` nem a `app_key`.
