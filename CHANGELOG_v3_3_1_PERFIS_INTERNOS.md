# EVO MKT v3.3.1 — Perfis internos

- Login interno local por código para a equipe de Marketing.
- Abertura automática em Minha Área para integrantes da equipe.
- Gerente com visão administrativa completa.
- Navegação filtrada por perfil.
- Backup, Central Operacional administrativa, Equipe, Solicitações, Configurações, Central de Dados e Saúde restritos à Gerente na interface.
- Nome do integrante logado aplicado automaticamente à Minha Área.
- Novos registros criados por integrante herdam seu nome como responsável quando o campo estiver vazio.
- Busca global respeita os módulos disponíveis ao perfil.
- Comparação de responsáveis tolera diferenças de acentuação.
- Runtime Go, Portais e 19 XLSX preservados.

## Observação de segurança
O login interno desta revisão é uma camada local de fluxo e permissões da interface. O runtime interno original permanece preservado para não arriscar o CRUD/XLSX. O Portal do Solicitante continua usando runtime restrito próprio com bloqueio de backend.
