# Gestor de Anúncios no EVO MKT — desenho (para aprovação)

Status: **proposta, nada implementado.** Hoje o Tráfego é somente leitura (decisão original). Este documento muda essa regra de forma controlada: o EVO MKT passa a **criar e gerir campanhas que vão ao ar ATIVAS**, como o Gerenciador de Anúncios do Colégio.

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
