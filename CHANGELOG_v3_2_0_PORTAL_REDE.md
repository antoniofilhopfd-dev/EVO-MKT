# EVO MKT v3.2.0 — Portal em Rede + Gestão de Demandas

## Portal em rede local
- Novo executável `EVO_MKT_PORTAL_REDE.exe` para ser executado no computador do Marketing.
- O Portal fica disponível para outros computadores da mesma rede local pelo navegador.
- Todas as coordenadoras utilizam a mesma `EVO_MKT_SOLICITACOES.xlsx` central.
- Endereço da rede é mostrado em uma tela local e gravado em `PORTAL_REDE_URL.txt` / `PORTAL_REDE.url` na primeira execução.
- O runtime aceita apenas conexões de loopback ou IPs privados da rede local.
- A página administrativa do servidor e o upload de entrega final só funcionam no computador do Marketing.
- O Portal continua isolando as demandas por segmento.

## Gestão da Gerente
- Notificação automática de novas demandas recebidas.
- Solicitações aguardando triagem passam a aparecer também na Central Operacional.
- Ranking mensal de volume por segmento.
- Painel de SLA por segmento.
- Calendário de próximos prazos/entregas.
- Exportação CSV do relatório mensal.
- Relatório mensal imprimível/PDF.

## Entrega e aprovação
- Novo fluxo de anexar arquivo(s) final(is) pelo computador do Marketing.
- Arquivos finais ficam em `ANEXOS/SOLICITACOES/<id>/ENTREGA`.
- Ao anexar a entrega, a demanda vai automaticamente para aprovação do solicitante.
- O Portal mostra os arquivos finais como links autenticados.
- O solicitante continua podendo aprovar ou solicitar ajustes.

## Segurança e integridade
- Runtime de rede restrito à rede privada.
- Rotas administrativas restritas ao loopback do computador do Marketing.
- Verificação de alteração concorrente antes de substituir a planilha de Solicitações.
- Backup automático permanece ativo antes das gravações do Portal.
- O Portal local (`EVO_MKT_SOLICITANTE.exe`) continua disponível como alternativa/emergência.
