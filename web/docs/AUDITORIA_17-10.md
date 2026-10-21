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

## Testes (regressão completa de 18/10/2026)

- `tsc --noEmit` limpo; checagem de sintaxe de todos os `public/*.js` e `tests/*.js` limpa; build de produção OK.
- 42 suítes executadas pelo `tests/run-web.sh`, 0 falhas (1.185 verificações OK nesta rodada, sem contar a suíte de capturas).
- Suítes novas: `seismodulos` (API: Arquivos, preferências por usuário, limites de gasto, Excel, perfis, rotas sem sessão/CSRF, rota de matrículas removida) e `seismodulosui` (menu por perfil, Dashboard, Calendário, Arquivos, todas as seções do Tráfego, Configurações, celular, erros de JS).
- Permissões: a Equipe de Marketing opera (testes antigos de "403 para a Equipe" foram atualizados para 200). Seguem exclusivas do Administrador: usuários, auditoria, backup, modo de acesso, importação, credenciais de integração, **ligar a escrita na Meta (`/ads/modo`), tetos (`/ads/gestao/config`) e automações (`/ads/regras`, `/ads/relatorio-semanal`)**.
- Suítes aposentadas (telas fora da navegação) estão em `tests/obsoletos/` e não rodam.
- Cobertura de interface que **não** existe para o novo Gerenciador: edição, duplicação e lote contra a Meta (só rota, com o simulador). Nada disso foi exercitado na Meta real.
- Capturas reais (ambiente de teste com simulador da Meta): `docs/screenshots/v5.17/`.

## Legenda por IA removida (21/10/2026)
A geração de legendas por IA (rota `/ia/legenda`, botões nos Conteúdos e no Estúdio, cartão em Integrações, chave da Anthropic e dependência `@anthropic-ai/sdk`) foi retirada a pedido. Os modelos de legenda manuais continuam.
