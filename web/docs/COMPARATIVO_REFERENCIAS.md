# Referências inspecionadas (AdFlow e Orkestrya): o que foi aproveitado e o que não foi

Os ZIPs foram abertos e lidos (esquema de dados, bibliotecas de insights, alertas, README). Nada foi copiado: só conceitos. Nenhuma dependência, banco ou arquitetura foi importada (o EVO MKT continua em Next.js + MySQL/MariaDB).

## AdFlow (gestão de Meta Ads: Next.js + Prisma/SQLite + NextAuth + servidor MCP)
**O que é real e o que é demonstração.** Real: cliente da Graph API (campanhas, conjuntos, anúncios, criativos, públicos, pixels, insights), gravação local de insights, alertas, detecção de mudança de status. Demonstração/simulado: seed com campanhas fictícias e o "modo simulado" (sem token, tudo roda com dados locais). Também há criação e ativação de campanhas, assistente de criação, públicos, criativos, relatórios por WhatsApp e um servidor MCP: **tudo isso gera ou controla gasto e fica fora do EVO MKT por regra** (somente leitura).

| Conceito do AdFlow | Decisão | Onde está no EVO MKT |
|---|---|---|
| Campanha, conjunto e anúncio nascem **PAUSED**; só um caminho com confirmação ativa | **Reforçado**: o EVO MKT não cria nem ativa nada na Meta | Tráfego só lê (`lib/integrations/metaads.ts`; teste confirma zero chamadas de escrita) |
| Insights com `date_preset=maximum` (o padrão `last_30d` termina ontem e esconde o gasto de hoje) | **Incorporado** | A leitura de cada mês vai até hoje (`time_range`), não usa janela móvel |
| Totais acumulados nunca devem ser somados entre dias (usar diferenças) | **Respeitado** | O EVO MKT guarda **um total por campanha e mês** (upsert), nunca soma snapshots acumulados |
| Alertas objetivos com limite documentado (CTR baixo, frequência alta, gasto sem conversão, CPC relativo) | **Incorporado** com limites visíveis e ajustáveis, só com dados suficientes | Tráfego → Alertas; Administração → Integrações → Limites |
| Detecção de mudança de status (aprovado, com problema) | **Incorporado** no nível de campanha | Notificação "Status de campanha mudou" / "Campanha com problema na Meta" |
| Distinguir moeda/valores em centavos | **Incorporado** | Conversão por moeda (centavos ÷ 100; sem centavos para JPY etc.) |
| Alerta por marco de gasto (a cada R$ 200) | Não incorporado | Evitei inventar um limite do Colégio; os alertas usam só regras com número e limite explícitos |
| Ranking de anúncios por compra/ROAS | Não incorporado | O Colégio não vende online; sem ROAS. Resultado = leads + conversas, como a Meta informa |
| Pastas de campanhas, assistente de criação, públicos, criativos, pixels | Não incorporado | Fora do escopo (criação e gasto) |
| Relatório automático por WhatsApp | Não incorporado | Sem integração de WhatsApp (decisão registrada) |
| Servidor MCP (ações pelo chat) | Não incorporado | Sem justificativa técnica e com risco de ação com gasto |
| `ActivityLog` por ação | Já coberto | Trilha de auditoria + histórico de status |

## Orkestrya (gestão de agência)
Aproveitado: aprovação por link de uso único, saúde por segmento, ranking de conteúdos, melhores dias e horários, datas comemorativas, NPS, resumo diário, fila de aprovação, comentários e checklists por registro, histórico de atividades, página pública de privacidade. **Descartado por ser comercial:** CRM, clientes, propostas, contratos, serviços, financeiro, cofre de credenciais de clientes, chat e WhatsApp.
