# EVO MKT — Guia das integrações (Instagram e Google)

Tudo é configurado em **Administração → Integrações** (só a Gerente). Você precisa criar as credenciais **uma vez** nas contas do Colégio e colar na tela. As telas da Meta e do Google mudam de nome com frequência: se algum botão estiver diferente, procure pelo equivalente.

Antes de tudo, no `config.php` do servidor preencha:
- `public_url` → endereço do sistema, ex.: `https://marketing.colegioevolucao.com.br` (com **https**).
- `app_key` → um texto aleatório de 40+ caracteres. Ele criptografa os tokens salvos. **Não troque depois de conectar** (senão será preciso reconectar).

Na tela de Integrações, os dois endereços de redirecionamento aparecem prontos com botão **Copiar**.

---
## 1) Instagram (Meta)
**O que você precisa ter**
- Instagram em conta **Profissional** (Comercial ou Criador).
- Esse Instagram **ligado a uma Página do Facebook** (Instagram → Editar perfil → Página).
- Seu usuário do Facebook com controle total dessa Página.

**Criar o app na Meta**
1. Entre em **developers.facebook.com** → *Meus apps* → **Criar app**.
2. Caso de uso/tipo: **Outro** → tipo **Negócios** (ou o equivalente "Business").
3. Dê o nome "EVO MKT" e crie.
4. No painel do app, **Adicionar produto**: **Login do Facebook** (Facebook Login) e **Instagram** (API do Instagram com Login do Facebook / "Instagram Graph API").
5. Em *Login do Facebook → Configurações*, campo **URIs de redirecionamento OAuth válidos**: cole o endereço **da Meta** mostrado na tela de Integrações. Salve.
6. Em *Configurações do app → Básico*: copie **ID do aplicativo** e **Chave secreta do aplicativo**.
7. Deixe o app em **modo Desenvolvimento**. Quem é administrador/desenvolvedor/testador do app consegue autorizar todas as permissões **sem passar pela análise da Meta**; isso basta para uso interno. (Se um dia quiser o app "Ativo/Live", a Meta exige URL de política de privacidade e análise das permissões.)
8. Em *Funções do app*, confirme que a pessoa que vai conectar é **Administrador**.

**Conectar**
1. Na tela de Integrações, cole **App ID** e **App Secret** → *Salvar credenciais*.
2. Clique **Conectar com Facebook/Instagram**, entre e **aceite todas as permissões** (instagram_basic, instagram_manage_insights, instagram_content_publish, pages_show_list, pages_read_engagement, business_management) e **selecione a Página e o Instagram do Colégio**.
3. Volta para o sistema com "Instagram conectado!". Clique **Sincronizar métricas agora**.

**O que acontece depois**
- **Métricas:** seguidores, alcance, visualizações, visitas ao perfil, interações, curtidas, comentários, compartilhamentos, salvamentos, nº de posts/reels e melhores conteúdos entram na tela **Instagram** (um registro por mês, marcado `INSTAGRAM_API`). Registros digitados à mão não são alterados — use um ou outro para o mesmo mês, para não somar duas vezes. Stories não são contados (a API só mostra stories de 24 h).
- **Token:** vale ~60 dias e é renovado sozinho pelo cron diário. Se o cron ficar parado por mais de 60 dias, reconecte.
- **Publicar/agendar:** no conteúdo, marque **Publicar no Instagram automaticamente = SIM**, deixe o status **APROVADO** ou **PROGRAMADO**, preencha **Publicação** (data/hora) e, em **Integrações → Fila de publicação**, **anexe a mídia**. O cron (a cada 10 min) publica no horário. Também há **Publicar agora**.
  - Imagem **JPEG** (.jpg) · Vídeo **MP4/MOV** (publicado como Reels; no formato "Stories" vai como story). **Carrossel**: publicação manual.
  - A Meta baixa a mídia por um link temporário assinado (vale 2 h) gerado pelo sistema — por isso o endereço precisa ser público (https).
  - Limite da Meta: cerca de 100 publicações por dia por conta.
  - Se algo falhar, o estado fica **Erro** com o motivo, a Gerente recebe e-mail (se configurado) e o sistema **não tenta de novo sozinho** — corrija e use **Publicar agora**.
- Algumas métricas dependem da conta (ex.: contas com poucos seguidores têm menos dados) e a Meta altera nomes de métricas com o tempo; o log em *Integrações → Últimas operações* mostra qualquer erro.

---
## 2) Google (Agenda, Drive e Planilhas)
**Criar o projeto**
1. Entre em **console.cloud.google.com** com a conta do Marketing e **crie um projeto** ("EVO MKT").
2. *APIs e serviços → Biblioteca*: **ative** *Google Calendar API*, *Google Drive API* e *Google Sheets API*.
3. *APIs e serviços → Tela de permissão OAuth*:
   - Se o Colégio usa **Google Workspace**: escolha **Interno**. É o melhor caso — não exige verificação e o acesso não expira.
   - Se for conta Gmail comum: **Externo**; preencha nome, e-mail de suporte e e-mail do desenvolvedor. **Atenção:** em modo "Testando" o acesso **expira em 7 dias**. Depois de configurar, clique **Publicar app** (modo "Em produção"). O Google mostrará "app não verificado" no login — clique em *Avançado → Acessar EVO MKT*; funciona para até 100 usuários.
   - Escopos: `.../auth/calendar`, `.../auth/drive.file`, `.../auth/spreadsheets`.
4. *Credenciais → Criar credenciais → ID do cliente OAuth* → tipo **Aplicativo da Web**. Em **URIs de redirecionamento autorizados** cole o endereço **do Google** mostrado na tela de Integrações. Copie o **ID do cliente** e a **chave secreta**.

**Conectar**
1. Cole **Client ID** e **Client Secret** → *Salvar credenciais* → **Conectar com Google** → aceite as permissões.
2. Se voltar a mensagem "o Google não devolveu o refresh token": acesse *myaccount.google.com/permissions*, remova o acesso do EVO MKT e conecte de novo.

**O que cada parte faz**
- **Agenda** (calendário novo chamado "EVO MKT"): envia Agenda, Calendário, Eventos, Conteúdos (data de publicação), Tarefas (prazo, enquanto abertas) e Campanhas. É **nos dois sentidos**: mudou título ou horário no Google → volta para o EVO (vale a edição mais recente); criou um evento direto no Google → vira item do **Calendário** (origem GOOGLE_AGENDA); apagou no EVO → some do Google; apagou no Google → **o item permanece no EVO** (por segurança).
- **Drive:** cria a pasta **"EVO MKT — Entregas"** e uma subpasta por solicitação ("SOL-0001 — título") com os arquivos finais de entrega. Pode ser **automático** a cada entrega enviada ou manual (**Enviar entregas ao Drive**). O link fica gravado na solicitação. (O app só enxerga arquivos que ele mesmo criou.)
- **Planilhas:** cria a planilha **"EVO MKT — Relatórios (automático)"** com uma aba por módulo (tarefas, conteúdos, solicitações, campanhas, eventos, instagram, tráfego) e **reescreve** o conteúdo a cada exportação. Não edite essas abas à mão: ficam sobrescritas.
- ⚠ **LGPD:** a Planilha e o Drive passam dados do sistema para a conta Google. Evite lançar dados pessoais de alunos nos campos exportados e compartilhe a planilha só com quem precisa.

---
## 3) Cron Jobs (hPanel → Avançado → Cron Jobs)
| Frequência | Comando |
|---|---|
| a cada 10 minutos | `php /home/SEU_USUARIO/public_html/cron_integracoes.php publicar` |
| 1 vez por dia (ex.: 6h) | `php /home/SEU_USUARIO/public_html/cron_integracoes.php sincronizar` |
O comando exato com o caminho do seu servidor aparece na tela de Integrações.

## 4) Se algo der errado
- **Administração → Integrações → Últimas operações** mostra cada tentativa e o erro devolvido pela Meta/Google.
- "Redirect URI mismatch": o endereço cadastrado na Meta/Google precisa ser **idêntico** ao mostrado na tela (https, sem barra extra).
- Conexão some após alguns dias no Google: o app ficou em modo "Testando" — publique-o ou use tipo Interno.
- Em testes, tudo isso foi validado contra **servidores simulados** da Meta e do Google (não contra as contas reais): confira a primeira conexão e a primeira publicação com atenção.
