# EVO MKT v2.3.0 — UX Diferenciada

Evolução incremental da v2.2.1 Runtime Estável, sem alterar a arquitetura local Go/XLSX.

## Melhorias visuais e funcionais
- Identidade própria para cada módulo, com cabeçalho, descrição, fluxo e cor contextual.
- KPIs específicos por módulo, mesmo com base vazia.
- Estados vazios específicos por Agenda, Tarefas, Projetos, Eventos, Conteúdos, Ideias, Campanhas, Aprovações, Instagram, Tráfego, Templates, Relatórios, Arquivos, Equipe, Integrações, Configurações, Solicitações e Lixeira.
- Conteúdos ganhou pipeline editorial visual.
- Tarefas ganhou visão resumida de fluxo por status.
- Aprovações ganhou filas visuais de aguardando/ajustes/aprovado.
- Tráfego ganhou funil de Impressões → Cliques → Conversas → Leads.
- Instagram ganhou resumo visual de Posts/Reels/Stories/Salvamentos/Compartilhamentos.
- Projetos ganhou progresso visual.
- Eventos ganhou estrutura Antes / Durante / Depois.
- Equipe ganhou resumo visual de pessoas e funções.
- Integrações ganhou cards de conectores e status.
- Arquivos ganhou biblioteca visual por categoria.
- Tabelas agora usam colunas específicas de cada módulo em vez do mesmo conjunto genérico.
- Botão principal muda conforme o módulo: Novo conteúdo, Nova tarefa, Novo evento etc.
- Filtros são limpos ao trocar de módulo.
- Suporte a abertura direta de módulo via `?page=modulo`, útil para diagnóstico/atalhos.
- Layout responsivo refinado para janelas menores do Windows.

## Dados
- As 19 planilhas XLSX foram preservadas sem alteração nesta atualização de interface.
