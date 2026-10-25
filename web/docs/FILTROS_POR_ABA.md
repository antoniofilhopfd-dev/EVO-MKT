# Filtros independentes por aba

**Causa do problema:** o objeto `Filtros` (`public/filtros.js`) era único e global: um só estado (`est`), gravado numa só chave do navegador (`filtros`). Toda aba lia e gravava o mesmo período. O Tráfego Pago usava `Filtros.get()` para o período, por isso herdava o do Instagram.

**Estratégia:**
- Cada aba tem a própria chave no navegador, `filtros.<aba>` (guardada como `evo.filtros.<aba>`): `dashboard`, `calendario`, `instagram.visao`, `instagram.conteudos`, `instagram.planejamento`, `instagram.calendario`, `instagram.desempenho`, `instagram.ranking`, `trafego.visao`, `trafego.campanhas`, `trafego.anuncios`.
- `Filtros.get()`, `query()`, `set()`, `limpar()` e `ativos()` agem sempre na aba atual (`state.page`).
- O perfil do Instagram é a única exceção: `filtros.instagram.perfil`, compartilhado só entre as abas do Instagram (seletor único no cabeçalho). Não vale no Tráfego Pago. O Dashboard e o Calendário têm o próprio filtro de perfil.
- Filtros próprios de cada tela (busca, estado, responsável, vista, ordenação, tipo de análise, status do Tráfego) ficam em `filtros.<aba>.local` (`Filtros.localGet/localSet`).
- "Limpar filtros" restaura só os padrões da aba atual (inclui os filtros próprios) e não mexe nas outras abas, no perfil compartilhado, nas contas nem nos registros.
- **Migração segura:** o antigo `filtros` não é apagado nem copiado para as abas (para não reintroduzir o compartilhamento). Só o perfil dele é aproveitado, uma vez, como perfil do Instagram.
- **Consulta antiga não sobrescreve a nova:** `state.epoca` sobe a cada troca de aba e a cada mudança de filtro. Uma leitura (GET) iniciada antes e que termina depois fica sem resposta (`api()` em `public/core.js`).
- A barra de filtros mostra só o que funciona na aba (sem textos de "não se aplica"). Visão Geral do Instagram: Mês, Ano e botões Últimos 7 dias, Últimos 30 dias, Esta semana e Este mês. Mês e ano escolhidos aplicam o período completo, limitado a hoje.
- Comparação: um mês (ou ano) que começa no dia 1 é comparado com o mês (ou ano) anterior até o mesmo dia; os demais períodos, com a janela anterior do mesmo tamanho (`anterior()` em `lib/api/desempenho.ts`).
- Datas no formato DD/MM/AAAA, fuso America/Fortaleza.
