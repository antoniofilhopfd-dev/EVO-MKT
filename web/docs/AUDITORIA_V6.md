# Reestruturação para cinco áreas — auditoria inicial (v5.17.54)

Ponto de partida: `main` e a branch de trabalho estavam em `cc9c583` (v5.17.54). A `main` **não foi alterada** (sem deploy). Backup do estado inicial: o próprio commit `cc9c583` (na `main`), um `git bundle` do repositório inteiro e a tag local `backup/v5.17.54-antes-da-reestruturacao` (o servidor recusou publicar a tag, por isso a `main` intocada é a cópia de segurança remota). Os dados de uma instalação são protegidos por um backup completo automático (com anexos) feito pela própria migração antes da limpeza.

## Estado encontrado

O menu já mostrava seis áreas (Dashboard, Calendário, Instagram, Tráfego Pago, Arquivos, Configurações), mas **o código dos módulos antigos continuava no servidor e na interface** (Solicitações, Portal, Planejamento, tarefas, projetos, eventos, agenda, equipe, relatórios etc. só eram redirecionados por um mapa `MOVED`). O Tráfego tinha um Gerenciador de Anúncios completo, com escrita na Meta.

### Páginas e módulos (interface)
| Página/módulo | Situação | Destino |
|---|---|---|
| `hoje` (Dashboard) | ativo | mantido e refeito |
| `calendario`, `calescolar`, `datacom` | ativos (camadas do Calendário) | mantidos; viram camadas do Calendário |
| `igvisao`, `studio`, `conteudos`, `instagram`, `igposts`, `igranking` | ativos | reorganizados em 4 abas |
| `editorial`, `ideias`, `templates`, `aprovacoes` | ativos, ocultos no menu "Mais" | incorporados em Instagram › Planejamento / Conteúdos |
| `trafego`, `gerenciador`, `tfcriativos`, `tfanalises`, `tfpublicos`, `tftestes`, `tfeventos`, `tforcamentos`, `tfalertas`, `tfrelatorios`, `tfhistorico` | ativos | **só leitura**: ficam Visão geral, Campanhas/Anúncios, Análises e Relatórios; o resto é removido |
| `arquivos` | ativo | **removido como área**; materiais vão para as publicações/Drive |
| `configuracoes` | ativo | mantido e reorganizado em seções |
| `minhaarea`, `central`, `agenda`, `planejamento`, `tarefas`, `projetos`, `eventos`, `campanhas`, `equipe`, `relatorios`, `fechamento`, `fluxos`, `solicitacoes` | só redirecionados (código vivo) | **removidos** |
| Portal (`/solicitante`, `/portal`, `solicitante.html`, `portal.js/css`, manifest) | ativo e suspenso por configuração | **removido** |

### Rotas da API
Mantidas: `/auth/*`, `/admin/users*`, `/admin/audit`, `/admin/integridade`, `/admin/lgpd/*`, `/admin/mode`, `/admin/codes`, `/backup*`, `/data` (somente módulos mantidos), `/file`, `/content/*`, `/escolar/*`, `/datacom/*`, `/dashboard/*`, `/instagram/*`, `/studio/*`, `/integrations/*`, `/prefs`, `/cron/*`, `/health`, `/heartbeat`, `/setup`, `/recover`, `/ads/*` (só GET), `/manager/calendario-link` e `/public/calendario`.
Removidas: `/solicitacoes/*`, `/portal/*`, `/manager/notices*`, `/admin/portal`, `/planejamento/*`, `/reports/*`, `/arquivos/*` (biblioteca), `/manager/approval-link` e `/public/approval*` (aprovação externa), `/admin/automacoes`, `/ia/legenda` (já removida), e todas as rotas de escrita de `/ads/*`.

### Tabelas
| Tabela | Situação |
|---|---|
| `records` (genérica, JSON por módulo) | mantém `conteudos`, `ideias`, `templates`, `calendario`, `calescolar`, `datacom`, `campanhas` (campanhas editoriais), `configuracoes`; **apaga** os registros de `solicitacoes`, `tarefas`, `projetos`, `eventos`, `agenda`, `equipe`, `aprovacoes`, `relatorios`, `arquivos`, `integracoes`, `instagram`, `trafego`, `lixeira` |
| `portal_users`, `notices`, `approval_links` | **removidas** |
| `record_comments`, `record_checklist`, `status_history`, `notifications` | mantidas; linhas dos módulos removidos são apagadas |
| `arquivos` | mantida só como armazenamento de anexos das publicações; **nada é apagado**: o que não tem vínculo vai para o relatório de arquivos sem vínculo |
| `ads_snapshots`, `ads_diario`, `ads_anuncios`, `ads_ids`, `ads_vinculos` | mantidas (dados lidos da Meta e vínculos confirmados) |
| `ads_acoes`, `ads_criacoes`, `ads_lancamentos` | **preservadas intactas** como histórico (auditoria técnica); sem escrita nova |
| `ig_*`, `google_event_map`, `integration_*`, `users`, `trusted_devices`, `sessions`, `audit_log`, `backups`, `backup_log`, `user_prefs`, `datacom_*`, `id_counters`, `used_ids`, `module_headers` | mantidas |

### Dependências compartilhadas que precisam sobreviver
- `lib/trabalho.ts`: comentários e checklist de registros (usados em Conteúdos) **ficam**; tarefas, recorrência, dependências e automações **saem**.
- `lib/fluxo.ts`: o fluxo de Conteúdos e a decisão de aprovação ficam; as transições de Solicitação saem.
- `lib/sla.ts`, `lib/insights.ts`: reescritos sobre Conteúdos, Instagram e Tráfego (insights determinísticos).
- `lib/files.ts`: gravação/leitura de anexos continua para Conteúdos; sai a parte de Solicitações/Portal.
- `lib/portal.ts`, `lib/auth.ts` (sessão do Portal): a parte do Portal sai.
- `lib/api/dashboard.ts` usa `datacom`, `meta`, `metaads`: mantido.
- Responsáveis/revisores deixam de vir do módulo `equipe` e passam a vir dos usuários internos.

## Testes — situação inicial
Regressão completa antes de mexer: **41 suítes, todas aprovadas** (uma instabilidade de data foi corrigida no teste do calendário escolar). Suítes de funcionalidades descontinuadas serão apagadas junto com o código (portal, trabalho, operação, planejamento, gestão/gerenciador/criar/campanha da Meta com escrita etc.).

## Decisões registradas
1. **Aprovação externa por link** (`aprovar.html`) contraria "a aprovação é interna ao Marketing": removida.
2. **Link público do Calendário** (`calendario.html`) não está na lista de remoção nem na de requisitos: **mantido** (é o que as Coordenações usam para ver as datas sem Portal). Pode ser removido se preferir.
3. **Campanhas editoriais** continuam existindo (módulo `campanhas` reaproveitado), só dentro de Instagram › Planejamento.
4. O fuso padrão passa a ser **America/Fortaleza**.
5. A IA de legendas tinha sido removida a pedido; o novo roteiro pede "variações de legenda com IA como rascunho" e a seção IA em Configurações. Volta **somente como rascunho**, sem a biblioteca da Anthropic (chamada HTTPS direta), desligada até haver uma chave.
6. Nada é publicado: todo o trabalho fica na branch `claude/evo-mkt-development-3at9xc`.
