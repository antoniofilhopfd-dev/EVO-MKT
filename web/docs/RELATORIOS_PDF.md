# Relatórios em PDF (Tráfego Pago e Instagram)

Base: `main` @ 3548209. Duas alterações, sem tocar nos demais módulos.

## Tráfego Pago › Relatórios
- Só o **Relatório Geral** (sem seletor de tipos; resumo por campanha e anúncios com fotos continuam dentro dele).
- **Período do relatório** no formulário: Esta semana, Este mês, Mês anterior, Este ano, Personalizado + Data inicial/final (dd/mm/aaaa, validadas).
- **Recorte semanal (dom–sáb)**: habilitado com 7 dias ou mais; semanas cortadas pelo intervalo escolhido; totais não mudam.
- Comparação com o período anterior de **mesma duração, sem sobreposição** (`periodoAnterior`, em `lib/integrations/trafego.ts`). Vale também para a Visão Geral e o Dashboard.
- **Baixar PDF**: download direto de arquivo gerado no servidor (`/api/trafego/relatorio.pdf`), sem `window.print()`. "Abrir em tela cheia" é só visualização.
- Gráficos: investimento por dia e impressões × cliques por dia (a Meta já devolvia os dados; agora são guardados por dia).

## Instagram › Relatório mensal
- Layout aprovado em `public/relatorio-instagram.*` (logo com altura/largura máximas, `object-fit: contain`; rodapé idem).
- PDF A4 paginado de verdade (`/api/instagram/relatorio.pdf`, `lib/igPdf.ts`): indicadores, evolução de seguidores, alcance e visualizações por semana, tipo de conteúdo, interações por tipo, melhores conteúdos com miniaturas, resumo geral e comparação com o mês anterior.
- Só entra o que a API trouxe; sem dado, o relatório avisa e não estima.

## Como o PDF é gerado
- Biblioteca `pdfkit` (dependência nova, em `package.json`/`package-lock.json`; `serverExternalPackages` em `next.config.mjs`). Imagens vêm da Meta/Instagram só de endereços permitidos (HTTPS, tempo e tamanho limitados), convertidas com `sharp` quando não são JPEG/PNG.
- Filtros e totais usam as mesmas funções da tela (`public/trafego-comum.js`, carregado no servidor por `lib/trafegoComum.ts`).

## Pendências e rollback
- Não testado com a conta real da Meta (testes usam a Meta simulada).
- Na hospedagem, o deploy precisa instalar as dependências (`npm install`) para o `pdfkit` existir.
- Rollback: reverter o commit; não há migração de banco.
