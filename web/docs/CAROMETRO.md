# Carômetro Escolar

Módulo do EVO MKT para localizar alunos por foto, organizar por segmento/série/turma, selecionar, acompanhar sessões de fotos, imprimir em PDF A4 e controlar pendências. Usa o cadastro de alunos do **Uso de Imagem** (`ui_alunos`); não há segundo cadastro.

## Telas (menu Carômetro)
| Tela | O que faz |
|---|---|
| Visão geral | Busca por nome/matrícula, filtros (segmento, série, turma, autorização), grade/lista, indicadores, seleção multi-turma, ficha do aluno |
| Segmentos e turmas | Árvore dos 6 segmentos com contagem; clicar numa turma abre a visão geral filtrada |
| Seleções salvas | Listas reutilizáveis (privadas ou compartilhadas): abrir, editar, duplicar, excluir |
| Sessões de fotos | Acompanhamento por turma (pendente, fotografado, ausente, refazer) |
| Impressão e PDF | PDF A4 por turma ou seleção, retrato/paisagem, 4–6 por linha, matrícula opcional, prévia pelo mesmo gerador |
| Pendências | Sem foto, imagem de baixa qualidade, nome repetido, mesmo nome em outra turma, turma não reconhecida, arquivos sem aluno; "deixar como está" em lote com motivo |
| Google Drive | Só referência das pastas (sem sincronização, sem credenciais) |
| Importação | Importa a lista de alunos (prévia) e fotos em lote (simulação, conciliação, aplicar, desfazer) |

Segmentos: Maternais (= Infantil 1, 2 e 3); Jardins (Infantil 4, 5 e 1º ano); Anos Iniciais (2º–5º); Anos Finais (6º–9º); Ensino Médio (1ª–3ª série). O segmento é deduzido do nome da turma (`lib/carometro.ts`); turma fora do padrão aparece em "Turma não reconhecida" (nunca é adivinhada).

## Fotos
- JPG, PNG ou WebP até 5 MB; o conteúdo é conferido de verdade (não a extensão). Mínimo 100×100. Fotos pequenas (como as 150×150 da escola) são aceitas e **não são ampliadas**.
- Guardadas na tabela `arquivos` (nunca em URL pública): **original** (como enviado), **padrão** 600×800 e **miniatura** 240×320 (3:4, recorte centralizado, sem distorção, sem metadados/EXIF).
- Cada envio cria uma versão; a anterior fica no histórico e pode ser restaurada. "Retirar" só desativa. Exclusão definitiva: só o Administrador.
- Servidas por `/api/carometro/foto` com login, `Cache-Control: private, no-store`. Original só para a Gerência.
- `/file` não serve caminhos do Carômetro; a tela "arquivos sem vínculo" não lista nem apaga `CAROMETRO/` e `USO-IMAGEM/`.

## Importação de fotos em lote
**Turma por turma:** em Importação › “Fotos de uma turma”, escolha a turma e envie as fotos dela. O lote só enxerga os alunos da turma: matrícula exata (de outra turma não vale) ou parte do nome do arquivo (ex.: `maria-souza.jpg`) que aponte para um único aluno vira *sugestão* a confirmar; o que sobrar você liga ao aluno por uma lista da turma. A tela mostra quem ainda está sem foto no lote e, ao aplicar, já deixa a próxima turma selecionada.

**Várias turmas (por matrícula):**
1. Simulação: cada arquivo é conciliado — matrícula exata no nome (alta), manifesto `matricula;nome_arquivo;origem` (alta), nome igual ao de um aluno (baixa, só sugestão), nome ambíguo ou sem aluno (decisão humana).
2. Conflitos (duas fotos para o mesmo aluno), sugestões, ambíguas e órfãs bloqueiam o "Aplicar".
3. Aplicar cria versões novas (as antigas ficam no histórico). Desfazer reverte só o que não foi alterado depois.
4. Máximo de 400 fotos por lote; envio em partes de 3 arquivos.

## Permissões
| Ação | Administrador | Gerente | Equipe |
|---|:-:|:-:|:-:|
| Consultar (visão geral, turmas, ficha, PDF, pendências, sessões) | ✔ | ✔ | ✔ |
| Enviar/substituir/restaurar/retirar foto, baixar original, importar lote | ✔ | ✔ | — |
| Criar/alterar sessões, decidir pendências | ✔ | ✔ | — |
| Seleções próprias; compartilhadas só leitura/duplicar | ✔ (edita todas) | ✔ | ✔ |
| Excluir versão de foto definitivamente | ✔ | — | — |
| Registrar/conferir/remover pasta do Drive | ✔ | — | — |

Toda ação relevante grava em `cm_auditoria` (quem, quando, o quê; nunca o conteúdo da foto).

## Autorização de imagem
O selo (Autorizado / Não autorizado / Sem informação) vem **só leitura** da última solicitação do Uso de Imagem: AUTORIZADO → autorizado; NÃO AUTORIZADO, VENCIDO ou REVOGADO → não autorizado; qualquer outro caso → sem informação. Ter foto cadastrada **não** significa autorização para publicar. O PDF tem a opção "só alunos com autorização vigente".

## Tabelas
`cm_fotos`, `cm_auditoria` (040) · `cm_lotes`, `cm_lote_itens` (041) · `cm_selecoes`, `cm_selecao_itens`, `cm_sessoes`, `cm_sessao_itens` (042) · `cm_pendencias_ign` (043) · `cm_drive_refs` (044). Todas entram no backup; as fotos (tabela `arquivos`) só no backup **completo**.

## Pontos de atenção
- **Limite do backup completo: 60 MB de anexos.** Acima disso o backup completo **não inclui nenhum anexo** (o sistema avisa na validação e no registro). Cada aluno com foto ocupa ~0,1 MB (padrão + miniatura) mais o original; com mais de ~500 alunos com foto o limite é ultrapassado. Para guardar as fotos, usar o dump do banco da Hostinger ou aumentar o limite (`MAX_FILES_BYTES` em `lib/backup.ts`) com cuidado com a memória.
- Texto de finalidade, retenção e base legal (LGPD) para fotos de menores precisa de validação do colégio.
- O Drive não é operacional: a conferência é manual.
- O ano letivo exibido é o ano corrente; o cadastro de alunos ainda não guarda ano letivo por aluno.

## Testes
`tests/carometro*.test.js` (consulta, lote, seleções/sessões, PDF, pendências, Drive, final com desempenho, acessibilidade, zoom, backup e proteção de arquivos). Rodar: `tests/run-web.sh carometro carometro-lote carometro-sel carometro-pdf carometro-pend carometro-drive carometro-final`.


## Excluir alunos pelo carômetro

O Administrador pode selecionar alunos na Visão geral e usar **Excluir aluno** (ou **Excluir alunos**, para seleção múltipla). A confirmação lista nome e matrícula e informa que o cadastro é compartilhado com Uso de Imagem. Cancelar mantém os dados.

A API exige confirmação e verifica se nome/matrícula ainda correspondem ao cadastro selecionado. A exclusão transacional limpa fotos/arquivos, itens de lotes, seleções, sessões e revisões anuais, preservando auditoria da operação. Alunos com solicitações de autorização são mantidos; nesse caso, use a opção Inativar já existente em Uso de Imagem.

O endpoint de exclusão de Uso de Imagem utiliza a mesma limpeza. Nenhum aluno real é excluído pela instalação desta mudança.
