# Gestor de Anúncios no EVO MKT — desenho (para aprovação)

Status: **Fases 1, 2 e 3 implementadas** (impulsionar publicação; Gerenciador da conta inteira com edição; nova campanha completa com todos os objetivos). Fase 4 (relatórios que marcam o que o sistema lançou) pendente. Os valores abaixo foram escolhidos por padrão e a Gerência os altera em Tráfego → Gestor de anúncios. Hoje o Tráfego é somente leitura (decisão original). Este documento muda essa regra de forma controlada: o EVO MKT passa a **criar e gerir campanhas que vão ao ar ATIVAS**, como o Gerenciador de Anúncios do Colégio.

## 1. Princípios
1. **Vai ao ar ativo.** Campanha, conjunto e anúncio são criados `ACTIVE`. Eles entram na análise da Meta (`PENDING_REVIEW`) e passam a rodar sozinhos depois de aprovados.
2. **Quem decide é a Gerência.** Só o perfil Gerência cria, edita orçamento, pausa ou encerra. A Equipe só vê.
3. **Nenhum gasto sem fim e sem teto.** Toda campanha tem data de término e orçamento total conhecido. Travas abaixo.
4. **Tudo auditado.** Quem lançou, quando, com quais parâmetros, quais IDs foram criados na Meta.
5. **A parte de leitura continua separada.** O código que escreve na Meta fica em arquivo próprio (`metaadsGestao.ts`); o de leitura (`metaads.ts`) continua sem nenhuma chamada de escrita, e o teste que prova isso permanece.

## 2. Travas (não pausam; só evitam erro e gasto sem controle)
| Trava | Como funciona |
|---|---|
| Teto por campanha | Configurável pela Gerência (ex.: R$ 150/dia). O sistema recusa acima disso. |
| Teto mensal total | Soma do gasto do mês + compromisso das campanhas novas não pode passar do teto mensal. |
| Data de término obrigatória | Sem campanha "para sempre". Máximo configurável (ex.: 30 dias). |
| Tela de confirmação com o total | "Você está comprometendo até R$ X (R$ Y/dia × N dias)". Só lança depois do clique. |
| Validação antes de criar | O sistema pede à Meta uma checagem **sem criar nada** (`validate_only`) e mostra os erros antes. |
| Sem duplicar | Chave de pedido por lançamento: reenviar o mesmo formulário não cria uma segunda campanha. |
| Botão "Pausar tudo" | Interruptor de emergência da Gerência (pausa as campanhas criadas pelo sistema). |
| Aviso imediato | Notificação (e e-mail, se configurado) a cada lançamento, edição de orçamento e encerramento. |
| Alertas já existentes | Entrega parada, orçamento estourado, anúncio reprovado, conta com problema continuam valendo. |

## 3. Fluxos

### 3.1 Impulsionar uma publicação (o mais usado)
1. Em Instagram → Estúdio (ou Desempenho), numa publicação já publicada: **Impulsionar**.
2. Escolhe: objetivo (ver §5), público (predefinido do Colégio), orçamento diário, data de término.
3. Tela de confirmação com o total e a prévia do anúncio.
4. A Gerência confirma. O sistema cria campanha, conjunto e anúncio `ACTIVE`, usando o post existente como criativo.
5. Acompanha em Tráfego (status da Meta: em análise, ativo, reprovado com o motivo).

### 3.2 Campanha completa (criativo novo)
Passos: objetivo → público → orçamento e datas → criativo (imagem/vídeo da biblioteca do Estúdio) → texto e botão → revisão → confirmar.

### 3.3 Gestão do que está no ar
Editar orçamento diário (dentro dos tetos), estender ou antecipar o término, pausar, retomar, encerrar e duplicar campanha. Cada ação gera aviso e registro.

## 4. O que a Meta exige
- Permissão **`ads_management`** no app (além da `ads_read` atual), mais `pages_read_engagement`, `instagram_basic` e `business_management` (já existentes). A Gerência precisa reconectar a Meta para aceitar a permissão nova. Ligaremos por um interruptor "Habilitar gestão de anúncios", como hoje existe para `ads_read`.
- Com o app em **modo de desenvolvimento**, quem tem função no app e acesso à conta de anúncios pode usar a API na própria conta. **A confirmar na documentação da Meta no momento da implementação** se algum nível de acesso extra (Standard/Advanced) é exigido para a conta do Colégio.
- A conta de anúncios precisa ter forma de pagamento ativa; a Página e o Instagram precisam estar ligados à conta de anúncios no Business Manager (portfólio **Colégio Evolução - MKT**).
- Toda campanha passa pela análise de políticas da Meta (pode ser reprovada). Educação não é categoria especial de anúncios, mas o texto e as imagens seguem as políticas normais.

## 5. Decisões que dependem do Colégio
1. **Objetivo principal:** conversas (Direct ou WhatsApp), formulário de lead, visita ao site de matrícula ou alcance? O relatório semanal de hoje mede **conversas iniciadas**.
2. **Destino das conversas:** Instagram Direct, Messenger ou WhatsApp (precisa de número ligado à Página).
3. **Teto por campanha e teto mensal** (valores em R$).
4. **Duração máxima** de uma campanha.
5. **Público padrão:** cidades/raio, faixa de idade dos responsáveis, idiomas. Sugestão: João Pessoa + raio definido, 25 a 55 anos.
6. **Impulsionar posts existentes** (rápido) ou também **criativos novos** (mais etapas)?
7. **Dupla aprovação** para gastos acima de um valor (por exemplo, acima de R$ X/dia exigir um segundo clique de outra pessoa)?

## 6. Dados e código previstos
- Tabela `ads_lancamentos`: chave do pedido, quem lançou, quando, parâmetros, tetos vigentes, IDs da campanha/conjunto/anúncio na Meta, estado e erro. Entra no backup.
- Configurações novas (Gerência): tetos, duração máxima, público padrão, interruptor de gestão, e-mails de aviso.
- Rotas novas (Gerência): `/ads/validar`, `/ads/lancar`, `/ads/orcamento`, `/ads/pausar`, `/ads/retomar`, `/ads/encerrar`, `/ads/pausar-tudo`.
- Telas novas em Tráfego: "Impulsionar", "Nova campanha", "Campanhas do sistema" (com ações).
- Testes: servidor simulado da Meta com os endpoints de escrita; verificar tetos, duplicidade, confirmação, perfis, auditoria e que a leitura continua sem escrita.

## 7. Fases sugeridas
1. **Fase 1 — Impulsionar publicação** (um objetivo, público padrão, tetos, confirmação, auditoria).
2. **Fase 2 — Gestão** (editar orçamento, pausar, retomar, encerrar, "Pausar tudo").
3. **Fase 3 — Campanha completa** com criativo novo.
4. **Fase 4 — Relatórios integrados** (o relatório semanal passa a marcar o que foi lançado pelo sistema).

## 8. Riscos e como reduzimos
- **Gasto indevido:** tetos, término obrigatório, confirmação com total, validação prévia, aviso imediato, "Pausar tudo".
- **Erro de público:** predefinição do Colégio e prévia do resumo antes de confirmar.
- **Reprovação pela Meta:** o status e o motivo aparecem no Tráfego e geram alerta.
- **Primeiro teste real:** com um valor pequeno (ex.: R$ 10/dia por 1 dia), campanha de teste supervisionada, antes de usar no dia a dia.


## 9. Valores padrão adotados (editáveis na tela)
- Objetivo padrão: **conversas no Instagram Direct** (alcance como segunda opção).
- Teto por campanha: **R$ 50/dia** · teto mensal: **R$ 3.000** · duração máxima: **14 dias** (padrão de 7 e R$ 20/dia ao impulsionar).
- Público: **João Pessoa, raio de 20 km, 25 a 55 anos, só Instagram**.
- A gestão vem **desligada**. Para usar: Tráfego → Gestor de anúncios → ligar → salvar → **reconectar a Meta** (aceitar `ads_management`).

## 10. Primeiro lançamento real (teste supervisionado)
Os pedidos à Meta (`montarPayloads` em `lib/integrations/metaadsGestao.ts`) seguem a documentação e foram validados **só contra o simulador**. Faça o primeiro com valor pequeno:
1. Instagram → Desempenho → **Impulsionar** numa publicação, **R$ 6/dia por 1 dia**.
2. Confira a campanha no Gerenciador de Anúncios da Meta (nome começa com `[EVO MKT]`).
3. Se a Meta recusar algum campo, o erro aparece na tela, a campanha incompleta é pausada e removida, e o lançamento fica registrado como ERRO com o motivo. Ajuste só `montarPayloads`.
4. Pause pelo sistema (**Pausar**) ou, em emergência, **Pausar tudo**.


## 11. Nova campanha completa (todos os objetivos)
Tráfego → Gerenciador → **+ Nova campanha**. Assistente de 5 passos: objetivo/resultado → público (cidade, raio, idade, gênero, interesses pesquisados na Meta, públicos personalizados, posicionamento automático ou manual) → orçamento diário ou total, datas e lance (menor custo ou limite de custo) → anúncio → revisão com total comprometido e confirmação.

| Objetivo (Meta) | Resultados oferecidos | O que a Meta exige |
|---|---|---|
| Reconhecimento | Alcance, Impressões | nada extra; publicação do Instagram ou imagem nova |
| Tráfego | Cliques no link, Visualizações da página, Visitas ao perfil | site https (imagem nova); perfil aceita publicação |
| Engajamento | Engajamento com a publicação, Conversas (Direct, Messenger, WhatsApp), ThruPlay | publicação do Instagram; WhatsApp pede o número |
| Cadastros (leads) | Formulário instantâneo, Conversas | ID do formulário (lista os ativos da Página) |
| Vendas | Conversões no site | site https, pixel e evento |
| Promoção do app | Instalações | ID do app e link da loja |

Criativos: **publicação existente do Instagram** (qualquer uma lida no Desempenho) ou **imagem JPEG de um post do Estúdio** (enviada à Meta no lançamento). Vídeo novo não é enviado pelo sistema: use um Reel já publicado. Regras iguais às do Gestor: vai ativa, teto por dia e por mês, término obrigatório, duração máxima, chave única (não duplica) e compensação em falha (pausa e remove a campanha incompleta).

**Para o primeiro teste real de cada objetivo**, use R$ 6/dia por 1 dia. Os pedidos à Meta (`lib/integrations/metaadsCampanha.ts`, função `montar`) foram validados só contra o simulador; se a Meta recusar algum campo, o erro aparece na tela e o ajuste fica só nessa função. Um ponto a observar: versões novas da API podem exigir `targeting_automation.advantage_audience` no conjunto de anúncios.
