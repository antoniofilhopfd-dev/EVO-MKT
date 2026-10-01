# EVO MKT v3.0.0 — Final Estável

Versão final consolidada do EVO MKT Local XLSX.

## Arquitetura
- EVO_MKT_LOCAL.exe como ponto único de abertura.
- Runtime local em Go.
- Frontend pronto na pasta web.
- Dados em 19 planilhas XLSX na pasta DADOS.
- Sem Node.js, npm, Next.js, VBS, CMD, Hostinger, PostgreSQL ou banco remoto obrigatório.

## Experiência final
- Hoje e Dashboard distintos.
- Central Operacional com pendências, carga e timeline.
- Calendário Dia/Semana/Mês com drag-and-drop.
- Kanban por status.
- UX própria por módulo.
- Busca Ctrl+K com operadores e comandos.
- Filtros salvos, favoritos, recentes, paginação e ações em massa.
- Relatórios e impressão/PDF.
- Central de Dados, Backup e Saúde do Sistema.
- Preferências locais e modo compacto.

## Dados
- Escrita e leitura mantidas pelo runtime local XLSX.
- IDs geridos pelo runtime.
- Restauração da Lixeira cria novo ID e mantém registro histórico na Lixeira.
- 19 XLSX preservados byte a byte na migração para a v3.0.0.
