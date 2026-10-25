# Relatório final — reestruturação em cinco áreas (v5.17.54 → v6.0.0)

Branch de trabalho: `claude/evo-mkt-development-3at9xc`. **Nada foi publicado**: `main` continua em `cc9c583` (v5.17.54) e serve de cópia de segurança remota; o repositório EVO CRM não foi alterado. Ponto de partida e decisões: `AUDITORIA_V6.md`.

## O que o sistema é agora
Cinco áreas, nenhuma a mais: **Dashboard**, **Calendário**, **Instagram** (Visão geral · Conteúdos · Planejamento · Desempenho), **Tráfego Pago** (somente consulta) e **Configurações** (Geral, Perfis e segmentos, Acessos internos, Instagram, Meta Ads, Google, IA, E-mail, Backup e restauração, Auditoria, Prontidão). Detalhes de uso em `OPERACAO.md`.

## Removido
Portal das Coordenações e Solicitações; Planejamento (ações e projetos); tarefas, eventos, agenda, equipe, aprovações, relatórios e Minha Área; aprovação por link externo; a área **Arquivos** (biblioteca e entregas); Gerenciador de Anúncios com escrita na Meta (criar, editar, ativar, pausar, impulsionar, públicos, testes A/B, regras, orçamentos); exportação para Planilhas e envio ao Drive; rota antiga de mídia do Instagram (substituída pelos materiais); `app.js`, `admin.js`, `studio.js`, `gerenciador.js`, `tp*.js` e CSS correspondentes; suítes de teste das funções removidas e seis documentos obsoletos. Sem referência a AdsPilot/AdFlow no código nem na documentação (verificado por teste).

## Mantido
Calendário (publicações, campanhas editoriais, calendário escolar, datas comemorativas, Google Agenda), publicações com comentários, checklist e histórico, Instagram (contas, métricas, publicação automática), Meta Ads **somente leitura** (tabelas `ads_*` e o histórico de ações em anúncios, intocado), usuários, auditoria, backup, LGPD e segurança.

## Novo
Filtros globais (período, perfil, segmento, formato, campanha editorial) com persistência, aviso de filtro sem efeito e botão de origem dos dados em cada indicador; Dashboard com cartões que abrem os registros; insights determinísticos (no máximo 3, com amostra mínima, fonte e atalho); fluxo Ideia → Publicado com aprovação interna; materiais com versões e links do Drive; Estúdio (prévias Feed/Stories/Reels, UTM, autosave, aviso de não salvo, comparação de versões, IA só como rascunho); desempenho por oito dimensões e orgânico × impulsionado só com vínculo confirmado; agendas do Google somente leitura; e-mail por usuário; Prontidão completa; fuso America/Fortaleza; diálogos internos no lugar de `alert/confirm/prompt`.

## Migrado (migração 027, testada em `migracoes.test.js`)
Backup completo com anexos **antes** de qualquer mudança (se falhar, a migração para) e cópia consultável do que sai (`_legadov6`); status antigos viram o fluxo novo; segmentos viram o catálogo único; anexos, versões de arquivo, mídia do Instagram e registros da Biblioteca viram materiais das publicações (Drive só como link); e-mails da antiga ficha da Equipe passam para o usuário; relatório da migração em Configurações › Backup (removido, mantido, migrado, arquivos sem vínculo — nada é apagado sem decisão sua). Idempotente no reinício.

## Testado
Bateria completa em `tests/run-web.sh` (build de produção + MariaDB + servidores simulados da Meta e do Google), toda verde na última execução (a única falha da bateria, um corrida de carregamento no teste do calendário escolar, foi corrigida no ajudante e as suítes afetadas passaram de novo):

| Suíte | Verificações | | Suíte | Verificações |
|---|---|---|---|---|
| api | 37 | | trafego | 42 |
| acesso | 33 | | cinco (interface das cinco áreas) | 55 |
| codigo | 12 | | migracoes | 17 |
| recover | 8 | | escolar | 43 |
| integrations | 75 | | datacom | 68 |
| instagram | 9 | | auditoria | 18 |
| contas | 25 | | seguranca-estatica | 9 |
| backup | 27 | | seguranca | 27 |
| integridade | 19 | | contraste | 21 |
| notificacoes | 6 | | responsive (6 larguras, 10 telas + Estúdio) | 12 |
| conteudo | 22 | | desempenho (4.000 publicações e 4.000 posts) | 8 |
| fluxo (Estúdio na interface real) | 25 | | insights | 12 |
| removidos | 10 | | | |

Também: `npx tsc --noEmit` limpo e `next build --webpack` concluído. Na máquina de teste o build alterna entre concluir e abortar com uma mensagem do Next.js sugerindo atualização; ela vem da saída do comando, não foi seguida e nenhuma atualização foi feita — repetir o build conclui.

Capturas reais (sistema rodando com dados de exemplo e Meta simulada) em `docs/screenshots/`: Dashboard, Calendário, as quatro abas do Instagram, o Estúdio, Tráfego Pago e Configurações, em computador (1440×900), iPad (820×1180) e celular (390×844). Nenhuma tela teve rolagem horizontal nem erro de script.

## Limitações e pontos de atenção
- As integrações reais (Meta, Google, Anthropic) dependem das suas credenciais e foram exercitadas só contra servidores simulados.
- Revisão visual e leitor de tela real não foram feitos; a navegação por teclado, o foco e os alvos de 44 px são verificados por teste/CSS.
- Listas de publicações não têm paginação no servidor; com 4.000 publicações a pior resposta foi ~1,5 s.
- O backup de uma instalação v5 pode ser restaurado, mas os registros de módulos que não existem mais não voltam.
- O link público de leitura do Calendário foi mantido (decisão registrada em `AUDITORIA_V6.md`); pode ser removido se preferir.
- Para subir em produção: copiar o banco pelo phpMyAdmin, publicar a branch por conta própria e conferir Configurações › Backup e Prontidão depois da primeira subida.
