# EVO MKT Online — changelog

## v4.2.0
- Textos: removidas as menções a XLSX/local/runtime na versão online.
- Visual: botões e campos com tamanho uniforme com a fonte Objectivity; gráfico "Volume por módulo" do Dashboard corrigido; fila de triagem em Solicitações compacta.
- Tarefas em Quadro (padrão), Eventos em Linha do tempo, Campanhas em Cartões (Lista continua disponível).
- Equipe: "Criar fichas da equipe" (capacidade 40 h) criadas na instalação; seletor de executor passa a listar a equipe.
- E-mails (opcionais): atribuição de item, nova demanda do Portal, aprovação/ajuste, pedido de nova senha; `cron_alertas.php` para prazos.
- Esqueci minha senha (sistema e Portal), selo "pediu nova senha" e `reset_senha.php` para a própria Gerente.
- Equipe não reatribui item de outra pessoa.
- **Correção:** a avaliação da entrega pelo solicitante falhava (409) depois da aprovação (o mesmo erro existe no Portal da versão local em Go).
- Testes: API 68, interface 19, fluxos de ponta a ponta 28, cron, responsividade — MariaDB 10.11 e SQLite.

## v4.1.x
- Logos e fonte oficiais, PWA, Administração, importação CSV, auditoria, backups.

## v4.3.0
- **Instagram (Meta Graph API):** conexão OAuth, métricas automáticas na tela Instagram, **publicação e agendamento** de posts/reels/stories (JPEG ou vídeo) com fila e cron, renovação de token.
- **Google:** Agenda em 2 vias, Drive (entregas por solicitação, automático ou manual), Planilhas (relatórios por módulo).
- Segredos criptografados (AES-256-GCM), logs, `cron_integracoes.php`, `GUIA_INTEGRACOES.md`.
- Testes com servidores simulados da Meta e do Google.

## v4.2.1
- Governança: anel da meta mostra o valor real (estava fixo em 70%) e o texto não se sobrepõe mais.
- Instagram/Tráfego: cabeçalho não fica mais cortado; celular: títulos, valores e botões ajustados.
