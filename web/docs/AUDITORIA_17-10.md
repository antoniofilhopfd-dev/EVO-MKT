# Auditoria de 17/10/2026 — matriz de situação

Legenda: **Impl.** implementado e testado com o mock · **Parcial** · **Ext.** depende de credenciais/autorização reais da Meta (não validado em produção) · **Obs.** saiu da navegação (dados preservados).

| Item | Situação | Observação |
|---|---|---|
| Menu de 6 módulos (Dashboard, Calendário, Instagram, Tráfego Pago, Arquivos, Configurações) | Impl. | `public/app.js` (AREAS) |
| Agenda, Solicitações, Portal, Tarefas, Projetos, Eventos, Campanhas, Conteúdos, Ideias, Planejamento, Aprovações, Templates, Equipe, Relatórios, Minha Área, Central | Obs. | Sem UI; registros e backup mantidos; sem migração automática |
| Perfis Administrador / Equipe de Marketing | Impl. | migração 021 converte Gerente sem admin em Equipe; permissões no servidor |
| Portal das Coordenações | Obs. | suspenso, dados preservados |
| Dashboard resumido com período e atalhos | Impl. | só dados locais |
| Calendário único (escolar, datas, reuniões, coberturas, institucionais) | Impl. | calendário editorial dentro do Instagram |
| Instagram: estúdio, editorial, aprovações, modelos, análises | Impl. | publicação real depende da API Meta (Ext.) |
| Arquivos: biblioteca, pastas, prévia, renomear, mover, excluir com proteção de uso | Impl. | `lib/api/arquivos.ts` |
| Configurações (8 seções) | Impl. | administração só para o Administrador |
| Tráfego: Visão Geral, Gerenciador, Criativos, Públicos, Análises, Orçamentos, Alertas, Relatórios, Histórico | Impl. | testado com o mock da Meta |
| Filtros, colunas e visões salvas por usuário (`/prefs`) | Impl. | |
| Edição em lote / escrita na Meta | Ext. | só com ads_management e autorização |
| Séries diárias, quebras por posicionamento, públicos personalizados, saúde da integração | Ext. | mock cobre parte; real não validado |
| Prévia oficial do anúncio, sobreposição de públicos | Ausente | declarado indisponível na tela |
| CRM (Matrículas, leads cadastrados, funil, custo por matrícula) | Removido | conversas e leads da Meta permanecem como métrica |
| Exportação Excel/CSV/PDF | Impl. | Excel via `/reports/xlsx` |
