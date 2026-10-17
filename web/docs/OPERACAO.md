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
- **Link de aprovação do post (direção, sem login):** com o post em REVISÃO, o compositor tem "Gerar link para a direção aprovar". A pessoa vê a mídia, a legenda e as hashtags, e aprova ou pede ajustes (comentário obrigatório). Link de uso único, 7 dias; a resposta muda a etapa para APROVADO ou PRODUÇÃO, grava no histórico e avisa a Gerência e o responsável.
- **Publicar agora:** só publica conteúdo APROVADO ou PROGRAMADO (o servidor recusa o resto). A Gerência pode aprovar e publicar numa só ação, com confirmação. Carrossel segue manual.
- **Desempenho (área Instagram):** alcance, salvamentos e compartilhamentos são lidos das 30 publicações mais recentes a cada sincronização; as demais mostram "—".
- **Calendário compartilhável (somente leitura):** Estúdio → "Compartilhar calendário" (Gerência). Gera um link por 30 dias para a direção ver os próximos posts (em aprovação, aprovados, agendados e publicados), sem login. Rascunhos e ideias nunca aparecem. Só o hash do link fica guardado: o endereço aparece uma vez, na criação. "Gerar novo link" invalida o anterior; "Desativar" encerra na hora.
- **Fechamento Mensal:** além da produção, traz Instagram (seguidores, alcance, interações, engajamento, melhores publicações), atendimento (SLA, tempo, avaliação, NPS) e tráfego (investimento, conversas, leads). "Imprimir / PDF" leva tudo com a logo.

## Tráfego (Meta Ads, somente leitura)
- **Visão do mês** (Tráfego): saúde da conta (ativa, pagamento pendente, teto de gasto), indicadores do mês contra o mês anterior, **orçamento do mês** (número de acompanhamento definido pela Gerência) com projeção, **gasto por dia** (30 dias) e **anúncios** (melhor custo por resultado, gasto sem resultado, reprovados com o motivo da Meta).
- **Alertas novos:** conta com problema, teto de gasto a 90%, orçamento estourado ou ritmo acima do orçamento, entrega parada (3 dias fechados sem gasto com campanha ativa) e anúncio reprovado.
- **Dashboard de Tráfego (relatório semanal em PDF):** botão "Relatório semanal (PDF)" no Tráfego, só Gerência. Lê a Meta na hora para o período escolhido (padrão: última semana de domingo a sábado, até 31 dias) e monta o mesmo modelo usado hoje: indicadores do mês (parcial) e da semana, investimento diário por campanha, resumo por campanha e detalhamento por anúncio com a foto do criativo. Subtítulo e observações são editáveis antes de imprimir. No diálogo de impressão: Salvar como PDF, A4, marcar "Gráficos de segundo plano". Conversas = conversas iniciadas pelos anúncios; CTR = cliques ÷ impressões; CPC = gasto ÷ cliques.

## Gestor de Anúncios (Fase 1)
Tráfego → **Gestor de anúncios** (só Gerência). Cria e gere anúncios de verdade, que vão **ativos** ao ar após a análise da Meta. Impulsionar: Instagram → Desempenho → botão **Impulsionar** na publicação. A tela de resumo mostra objetivo, público, total comprometido (R$/dia × dias) e o teto do mês; só libera depois de marcar a confirmação. Travas: teto por campanha, teto mensal (gasto do mês + campanhas em andamento + a nova), duração máxima, cidade obrigatória, pedido com chave única (não duplica) e compensação em caso de falha no meio (pausa e remove a campanha incompleta). **Pausar**, **Retomar** e **Pausar tudo** estão na mesma tela. Todo lançamento fica registrado (`ads_lancamentos`), gera aviso à Gerência e entra no backup. Detalhes e primeiro teste real em `GESTOR_DE_ANUNCIOS_DESENHO.md`.

## Gerenciador de Anúncios (Etapa A)
Tráfego → **Gerenciador** (só Gerência). Lê a conta de anúncios inteira (não só o que o sistema lançou): campanhas > conjuntos > anúncios, com ligado/pausado, estado na Meta, orçamento, resultados conforme o objetivo, custo por resultado, gasto, impressões, alcance, CTR e CPC, para hoje, 7/30 dias, mês ou período livre (até 93 dias). Dá para: ligar/pausar pelo interruptor, **editar** nome, orçamento diário ou total, início, término e público do conjunto (idade e raio), **duplicar** (a cópia nasce pausada, como na Meta), **arquivar** e **excluir** (exige confirmação). Regras: só mexe em objeto da conta escolhida; respeita os tetos do Gestor; a gestão precisa estar ligada; tudo vai para o **Histórico de alterações** (quem, quando, antes e depois) e as mudanças graves avisam a Gerência.

## Nova campanha completa (Etapa B)
Tráfego → Gerenciador → **+ Nova campanha**: todos os objetivos da Meta (reconhecimento, tráfego, engajamento, cadastros, vendas, app), com público detalhado, orçamento diário ou total, datas, lance e criativo (publicação do Instagram ou imagem do Estúdio). A revisão mostra o total comprometido e o teto do mês; só lança depois da confirmação, ativa. Tabela de objetivos e exigências em `GESTOR_DE_ANUNCIOS_DESENHO.md`.

## Programar e postar no Instagram pelo sistema
- **Fluxo:** Instagram → Estúdio → Novo post → legenda, hashtags, mídia → *Enviar para aprovação* → após **Aprovado**, *Agendar* (Gerência agenda direto). Com "Publicar no Instagram automaticamente" marcado (padrão em posts novos), o cron publica na data e hora marcadas.
- **Trava de aprovação:** a Equipe só agenda depois de Aprovado; a Gerência pode agendar direto.
- **Hashtags:** o campo de hashtags entra no fim da legenda publicada. Marcando "hashtags no primeiro comentário", a legenda sai limpa e o sistema comenta as hashtags logo após publicar (se o comentário falhar, o post continua publicado e o erro vai ao registro).
- **Carrossel:** selecione de 2 a 20 arquivos (JPEG/MP4/MOV) de uma vez no campo Mídia. Enviar novos arquivos substitui todos.
- **Falhas:** o post fica com a falha visível no editor ("A publicação automática falhou: …") com o botão **Tentar de novo**; a Gerência recebe notificação (e e-mail, se configurado).
- **Cron de publicação (Hostinger → Cron Jobs, a cada 10 minutos):** o comando aparece em Admin → Prontidão ("Cron de PUBLICAÇÃO no Instagram"): `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/integracoes?tarefa=publicar`. A Prontidão avisa se há posts agendados e o cron não rodou nos últimos 30 minutos.

## Conversas no WhatsApp (anúncios)
Cadastre o **WhatsApp do Colégio** (DDI+DDD, ex.: +5583999999999) em Tráfego → Gestor de anúncios. Ele é usado ao **Impulsionar** com o objetivo "Conversas no WhatsApp" e vem preenchido na Nova campanha (Engajamento/Cadastros → Conversas → WhatsApp). O número precisa estar ligado à Página no Business Manager da Meta.

## Recursos opcionais de Instagram e Tráfego (ligue o que quiser)
**Instagram**
- **Ranking** (Instagram → Ranking): métricas completas por mês e por ano (seguidores e variação, alcance, visualizações, visitas, interações, curtidas, comentários, compartilhamentos, salvamentos, posts, reels) com ▲▼ contra o período anterior; posts do mês/ano com todas as métricas e ordenação; **Carregar histórico** (12 meses); **Informar seguidores de um mês** (só meses sem registro automático).
- **Relatório mensal em PDF:** `/relatorio-instagram.html` (Gerência), com comparação com o mês anterior e top 5 publicações.
- **Modelos de legenda:** no editor do post, "Modelos de legenda" guarda/usa legenda + CTA + hashtags.
- **Melhor horário por formato:** aparece na dica do Estúdio (formatos com 4+ posts lidos).
- A semana do Estúdio já tem arrastar e soltar para reagendar.

**Tráfego** (Tráfego → "Regras, relatório automático e custo por matrícula"; Gerenciador → Comparar anúncios / Salvar rascunho)
- **Regras automáticas** (desligadas): a cada sincronização do cron, anúncios ativos que gastaram ≥ R$ X em N dias sem resultado, ou com custo por resultado acima de um limite, geram aviso (notificação + e-mail) ou são pausados (exige a gestão ligada). Há "ver o que a regra pegaria agora" (simulação, sem mexer em nada).
- **Relatório semanal por e-mail** (desligado): toda segunda-feira, resumo da semana anterior com link do PDF. Precisa de e-mail de avisos e do cron `?tarefa=sincronizar`.
- **Custo por matrícula:** informe as matrículas de cada mês; o sistema divide pelo investimento.
- **Comparar anúncios:** ranking por custo por resultado no período, com Pausar.
- **Rascunho de campanha:** "Salvar rascunho" em qualquer passo da Nova campanha; continuar depois pelo passo 1.
- **Alerta novo:** custo por resultado subindo (7 dias contra os 7 anteriores).

## Duas (ou mais) contas de Instagram
- **Conectar:** Administração → Integrações → Instagram → Conectar (ou Reconectar) e marque **todas as Páginas** com os Instagram do Colégio. Depois, em "Contas acompanhadas pelo sistema", marque as contas e salve; clique em Sincronizar.
- **Separado por conta:** um seletor de conta aparece em Instagram → Estúdio, Desempenho e Ranking. Métricas mensais/anuais, seguidores, melhores posts, melhor horário e relatório mensal em PDF são sempre de uma conta só. Cada post do Estúdio tem o campo **Conta do Instagram** (publica pela conta escolhida).
- **Colab:** no post, campo "Colab com (@usuário; até 3)". O post é publicado como colaboração: aparece nos dois perfis depois que o convidado aceita o convite no Instagram. Vale para Feed e Reels.
- **Anúncios:** ao impulsionar, o sistema usa a conta e a Página dona da publicação. A conta de anúncios é uma só (a escolhida em Integrações).

## Tráfego: somente leitura por padrão
- **Padrão:** o Tráfego só LÊ e mostra métricas (painel do mês, relatório semanal em PDF, alertas, Gerenciador em leitura com "Comparar anúncios", custo por matrícula e relatório semanal por e-mail). Não aparecem os botões de criar, editar, pausar, duplicar nem Impulsionar, e o servidor recusa (403) qualquer escrita.
- **Modo completo (opcional):** Administração → Integrações → Anúncios → "Modo completo". Libera Gestor de anúncios, Impulsionar, Nova campanha, edição/pausa e regras automáticas. Depois, siga o guia do Gestor (ligar a gestão e reconectar a Meta com ads_management).
- **Alertas:** anúncios com problema aparecem agrupados por motivo.

## Tráfego em 3 níveis (Campanha → Conjunto → Anúncio)
Tráfego → **Gerenciador** (Gerência), somente leitura por padrão:
- **Abas:** Hierarquia | Campanhas | Conjuntos | Anúncios. Clicar no nome de uma campanha abre os conjuntos dela; no de um conjunto, os anúncios. Um aviso "Filtrado em…" com **Ver tudo** mantém o contexto; período, busca e status continuam ao navegar.
- **Códigos:** cada objeto recebe um código interno estável do EVO MKT (CAM-0001, CJ-0001, AN-0001). O ID da Meta é mostrado ao lado e nunca é trocado.
- **Métricas em cada nível:** investimento, impressões, alcance, frequência, cliques, CTR, CPC, CPM, conversas, custo por conversa, leads, CPL, resultado e custo por resultado.
- **Detalhes:** status na Meta (como a API devolve), orçamento, datas, e no conjunto: localização, idade, gênero, plataformas e posicionamentos, otimização, evento de conversão, destino e lance; no anúncio: formato, título, texto, descrição, botão, link, publicação do Instagram, Página e perfil usados.
- **Orçamento:** três números separados: planejado no EVO MKT (mês), configurado na Meta (campanhas ativas, por dia) e gasto no mês.
- **Comparar:** marque 2 ou mais anúncios e use "Comparar selecionados": métricas lado a lado, com melhor/pior destacados só pela comparação numérica (CTR, conversas e leads: maior é melhor; CPC, CPM e custos: menor é melhor).
- **Vínculo com Conteúdo:** em Detalhes do anúncio, ligue-o a um Conteúdo do EVO MKT (liga produção orgânica à mídia paga). É um registro local; nada muda na Meta.
- **Criar/publicar/pausar:** só no modo completo (Administração → Integrações → Anúncios), com confirmação, tetos, auditoria (quem, quando, antes/depois, resposta da Meta) e a campanha incompleta removida se a Meta recusar. Credenciais da Meta ficam só no servidor.
- **Ainda não existe:** biblioteca de criativos separada e rascunho local de conjunto/anúncio dentro de uma campanha existente (hoje o assistente "Nova campanha" cria campanha, conjunto e anúncio de uma vez).

## Tráfego: painel novo (visual)
Com a conta de anúncios escolhida, Tráfego abre num painel único: investimento do mês em destaque (com variação contra o mês anterior) e barra do orçamento com projeção; seis indicadores (alcance, impressões, cliques, CTR, resultados e custo por resultado) com variação e minigráfico; gráfico "Por dia" (investimento, resultados, cliques ou impressões; 7, 14 ou 30 dias; dica ao passar o mouse ou com as setas do teclado; tabela alternativa); investimento por campanha; anúncios do mês (tabela ordenável, status com texto e ícone); alertas agrupados; atalho "Campanhas e anúncios" para o Gerenciador de 3 níveis. Sem conta de anúncios escolhida, a tela antiga continua aparecendo.

## Solicitações (tela única) e Portal das Coordenações suspenso

**Solicitações.** Uma área só, com cadastro rápido (título, descrição, solicitante, segmento, responsável, prazo, prioridade, anexos opcionais), Kanban e lista, e **4 etapas**: Pendente, Em andamento, Em aprovação e Concluído. Por baixo continuam os 9 status originais (nada foi migrado); a tela só traduz. A Gerência distribui e move qualquer solicitação; a equipe avança, uma etapa por vez, só as que estão com ela (Iniciar → Enviar para aprovação ou Concluir). A aprovação só existe quando a solicitação está marcada como "Precisa de aprovação" (as vindas do Portal pedem por padrão). Cada solicitação tem comentários, anexos e histórico; filtros por responsável, segmento, status e prazo; atrasadas ficam marcadas. A tarefa automática não é mais criada por essa tela (a solicitação já é o item de trabalho).

**Portal das Coordenações.** Suspenso por padrão (`portal_ativo` ausente ou `0`). Enquanto suspenso: `/solicitante`, `/solicitante.html`, `/portal.js` e o manifesto respondem 503/404; login, pedidos, anexos, comentários, avisos e links de aprovação de **demandas** respondem 503; sessões antigas deixam de valer. Nada é apagado: código, tabelas, códigos de acesso, solicitações, histórico, comentários e anexos permanecem. Pedidos por WhatsApp ou presenciais são cadastrados em Solicitações. Para religar: Administração → faixa "Portal das Coordenações" → "Reativar o Portal" (só a Gerência, com confirmação; fica na auditoria). Os links de aprovação de posts (direção) não dependem do Portal.

## Calendários (Marketing e Escolar)

**Calendário de Marketing** (`Planejamento → Calendário de Marketing`): compromissos e reuniões da equipe, coberturas foto/vídeo, atividades internas, publicações planejadas (Conteúdos) e **prazos das solicitações** (lidos do próprio registro, sem cópia; arrastar um prazo ou editá-lo na solicitação altera a mesma data). Visões Mês, Semana e Dia; criar clicando no dia, no espaço livre ou em "+ Novo evento"; editar, excluir (vai para a Lixeira) e reagendar arrastando; filtros por tipo e responsável. Tarefas, campanhas e eventos continuam nos seus módulos.

**Calendário Escolar** (`Planejamento → Calendário Escolar`): eventos e atividades oficiais do Colégio, em módulo próprio (`calescolar`), sem mistura com o de Marketing. Cadastro com título, data (um ou vários dias), horários opcionais, segmentos (Educação Infantil, Fund. Anos Iniciais, Fund. Anos Finais, Ensino Médio, Administrativo, Direção ou Toda a escola), tipo, local e descrição. Visões Mês, Semana e Próximos eventos; filtros por segmento e tipo; pesquisa pelo título. O servidor valida datas, horários, segmentos, tipo e **duplicidade** (mesmo título, data e segmentos). Só a Gerência cadastra/edita/exclui/reagenda; a equipe consulta e pode, opcionalmente, **pedir apoio ao Marketing** a partir do evento (cobertura fotográfica, vídeo ou arte): vira uma solicitação interna que guarda a referência ao evento. Nada é criado automaticamente e **nenhuma data escolar vem pré-cadastrada**: o calendário oficial deve ser lançado a partir das informações do Colégio. Datas comemorativas terão calendário próprio (ainda não implementado).

Código: o motor comum (`CalMotor`, em `public/calmkt.js`) serve aos calendários; cada um tem sua configuração (`calmkt.js`, `calescolar.js`).

## Datas Comemorativas (terceiro calendário)

`Planejamento → Datas Comemorativas`. Independente do Calendário de Marketing e do Escolar: nada se mistura sozinho.

**Como as datas funcionam.** O catálogo e as regras ficam no código (`lib/datasComemorativas.ts`); cada ano é **calculado** pela regra, então não há registro por ano no banco e as datas aparecem nos anos seguintes sozinhas. Regras: dia fixo (dia/mês; 29/02 só em ano bissexto), móvel por dia da semana do mês (ex.: 2º domingo de maio, último, etc.), relativa à Páscoa (algoritmo de Meeus/Jones/Butcher, testado de 2024 a 2030) e mês inteiro (campanhas). A equipe pode cadastrar datas próprias (uma linha em `records`, módulo `datacom`, com a regra), criar categorias novas e marcar a **relevância** de qualquer data (ajuste guardado em `datacom_ajustes`; sem ajuste vale a sugestão inicial do catálogo). Migração `019_datas_comemorativas.sql` (duas tabelas pequenas, incluídas no backup).

**Verificação.** Cada item do catálogo traz a **fonte e a base legal** conferidas (ver a tela de detalhe). O que não foi confirmado fica **pendente de validação** e não aparece como oficial nem permite criar ações (hoje: 8/12 Imaculada Conceição e 24/6 São João em João Pessoa). Carnaval e Corpus Christi aparecem como **ponto facultativo**, não como feriado.

**Uso.** Visões Mês, Ano e Lista; filtros por categoria, mês, ano, Feriados, Datas educacionais, pendentes e "Somente datas relevantes"; pesquisa pelo nome. Ao abrir uma data: marcar relevância/observações, **Criar ação no Planejamento** (cria um Projeto em PLANEJAMENTO com a referência `dataComemorativaId/Nome/Data`) e **Criar solicitação** (usa o fluxo de Solicitações; guarda a mesma referência). Nenhuma publicação ou ação é criada automaticamente.

## Planejamento, Dashboard e menu (v5.15.0)
- **Planejamento** (menu Organização) mostra "o que o marketing pretende realizar": ações com título, objetivo, segmento, categoria (Campanhas, Conteúdos, Eventos, Projetos, Ações institucionais), datas, responsável e observações. Visões mensal, semanal e lista; filtros por segmento, responsável, categoria, período e busca; situações Planejado / Em execução / Finalizado; duplicar (recorrentes), arquivar e excluir (Lixeira).
- O acompanhamento é calculado só pelas solicitações vinculadas (contagens reais, sem percentuais inventados). A produção continua em **Solicitações**; Planejamento não duplica dados, apenas aponta para elas.
- Vínculos opcionais, guardados na própria ação ou no registro filho, sem cópias: solicitações (uma ou várias), evento do Calendário Escolar, data comemorativa e conteúdo. Editar a ação não altera o evento/data original. Nada é criado automaticamente.
- Armazenamento: reaproveita `projetos` (projetos antigos aparecem como ações; nada foi apagado ou migrado destrutivamente). Tarefas internas e Eventos ficam como abas dentro de Planejamento; Agenda abre no Calendário de Marketing.
- **Dashboard** (Visão geral): solicitações pendentes/em andamento/atrasadas, compromissos dos próximos 7 dias, próximos eventos escolares, ações da semana e entregas recentes — tudo de dados reais.
- **Menu**: Visão geral · Organização (Solicitações, Planejamento, Calendários) · Marketing · Gestão · Administração (Configurações, Usuários e permissões, Integrações, Backup e segurança). Telas antigas continuam acessíveis (redirecionamentos), nenhum registro ficou inacessível.

## Segurança (revisão da v5.15.0)
Verificada pela suíte `auditoria`: todas as rotas novas exigem login (401); escritas sem `X-EVO` são recusadas (403); equipe não executa ações de Gerência/Administração (403); JSON inválido, corpo/campo gigante e texto com SQL/HTML tratados sem 500 e sem execução; criar/reagendar/arquivar/excluir ficam no registro de operações; Portal das Coordenações segue suspenso (503). Consultas usam parâmetros; credenciais nunca são devolvidas pela API.

## Implantação na Hostinger
1. `main` aciona o build automático (pasta raiz `web`, Node 22). A migração 019 roda sozinha no primeiro start; nenhuma migração já aplicada foi alterada.
2. Faça backup antes (Administração → Backup e segurança).
3. Pendências de configuração (não são código): cron `publicar` a cada 10 min; trocar segredos que passaram pelo chat; conferir o deploy; fornecer o calendário oficial do Colégio.
4. O Portal só volta com o interruptor em Administração, com confirmação explícita.
