# EVO MKT — Design system

Fonte única: `public/design.css` (carregado depois de `style.css`; o que estiver lá vence). Teste automático de contraste: `tests/contraste.test.js`.

## Cores (papéis fixos)
| Token | Valor | Uso |
|---|---|---|
| `--brand` | `#063996` | Ação principal, links, foco de marca |
| `--brand-dark` | `#00275F` | Menu lateral, hover de ação principal |
| `--accent` | `#FF7800` | **Realce** (indicador de item ativo, borda de seção). Nunca como cor de texto sobre fundo claro |
| `--info` | `#00A1F3` | Foco de teclado, informação |
| `--warn` | `#FAB900` | Reservada para destaques de atenção (fundo `--alert-bg` para texto) |
| `--infantil` | `#793A8C` | **Somente** Educação Infantil (segmento e Portal da Infantil) |
| `--ink` / `--ink-2` / `--ink-3` | `#1D2433` / `#4A5163` / `#5E6678` | Texto principal, secundário, apoio (todos ≥ 4,5:1 sobre branco e sobre `--page`) |
| `--line`, `--line-2`, `--page`, `--card` | neutros | Bordas, fundo da página, cartões |
| `--ok`, `--bad`, `--alert` (+ `-bg`) | verde, vermelho, âmbar | Estados: sucesso, erro, atenção |

Segmentos no Portal: Infantil roxo, Anos Iniciais azul claro, Anos Finais laranja, Ensino Médio azul principal (`portal.css`).

## Princípios
Tema claro. Hierarquia por tamanho e peso, não por cor. Cartões só quando agrupam algo útil. **Sem** gradientes decorativos, glassmorphism, neon, sombras pesadas nem gráficos sem função (a camada `design.css` neutraliza gradientes herdados). Sombras: `--sh-1` (cartão) e `--sh-2` (diálogo).

## Componentes
- **Botões:** `.btn` (principal), `.btn.secondary`/`.softbtn` (secundário), `.btn.danger`. Altura mínima 40 px (44 px em telas de toque).
- **Formulários:** `input/select/textarea`, `label` em negrito, foco com contorno `--info`.
- **Badges de status:** `.badge` + `ok|warn|bad|blue|info`; estado de publicação: `.estado-pub`.
- **Tabelas:** `.datatable` dentro de `.tablewrap` (rolagem interna em telas pequenas, nunca da página).
- **Diálogos:** `#modal` e `.admin-overlay`; `a11y.js` aplica `role="dialog"`, `aria-modal`, nome acessível, foco preso, Esc fecha e o foco volta ao botão de origem.
- **Navegação:** 8 áreas no menu lateral (`AREAS` em `app.js`); seções da área em `#subtabs`.
- **Estados:** vazio (`.empty`), carregando (`.loading`), erro (`.estado-erro`), aviso (`.int-warn`).
- **Fonte e data:** `.fonte-tag` em todo número vindo de integração.

## Acessibilidade
Foco visível padronizado (`:focus-visible`), navegação por teclado nos diálogos, rótulos nos campos novos, `aria-current` na área/seção ativa, redução de movimento respeitada (`prefers-reduced-motion`), áreas de toque ≥ 44 px em telas sem mouse, nenhuma rolagem horizontal da página (suíte `responsive`: 6 larguras × todas as telas).

## O que NÃO foi feito
Uma auditoria completa com leitor de tela real (NVDA/VoiceOver) não foi executada: só verificações automáticas e de teclado.
