# Carômetro: implementação parcial em revisão

Base: cbfc2cc9fc23e7b5d9dfd191821343d97566d5c5.

Esta alteração NÃO conclui as 25 melhorias aprovadas. Não publicar nem tratar como homologada.

## Alterações desta primeira parte

- Fila com vários lotes salvos no servidor, seleção e resumo antes de aplicar.
- Verificação no servidor de alunos repetidos entre os lotes selecionados.
- Seleção de pasta com subpastas por turma; confirmação das turmas antes do envio.
- Conferência com fotos e nomes maiores, comparação com a foto atual e correção manual do aluno.
- Associações por ordem exigem confirmação individual; excluídas do botão de confirmação em massa.
- Enquadramento e rotação na simulação, preservando o original. As versões enquadradas são mantidas ao aplicar.
- Maternais e Infantil 1–3 separados nos filtros do carômetro.
- Envio individual com progresso, conservação do ID do rascunho e nova tentativa dos arquivos que falharam.
- Reenvio de uma foto idêntica com o mesmo nome no mesmo lote não cria outro item (não inclui ZIP).
- Aviso de resolução baixa e origem no histórico da ficha.
- Backup completo deixa de omitir anexos acima de 60 MB; falhas de coleta continuam impedindo a criação.
- Relatório no conteúdo do backup com contagem de alunos, fotos e arquivos; validação das referências de fotos antes de criar/restaurar um backup completo.

## Funções encontradas na base, preservadas

Associação por matrícula, manifestação CSV, histórico/restauração de foto por aluno, desfazer lote, pendências, indicadores de autorização, PDF configurável com prévia, miniaturas e auditoria já existiam. A presença no código não comprova homologação no ambiente real.

## Pendências materiais

- Testes HTTP, de banco, restauração real e interface com MySQL/MariaDB; instalação local dos serviços foi recusada pelo ambiente.
- Permissões configuráveis por perfil/segmento e ação. A política atual continua: equipe interna consulta; Gerência altera; Administrador exclui.
- Atualização e revisão por ano letivo preservando os vínculos; não foi adicionada migração anual.
- Detecção de desfoque; só dimensões/avisos existentes e novo aviso de resolução foram tratados.
- Conflitos entre todos os lotes abertos, além dos lotes selecionados; reforço transacional contra aplicações simultâneas.
- Aplicação da fila é sequencial, não atômica: se houver falha, lotes já aplicados permanecem e devem ser conferidos antes da retomada.
- Retomada robusta de ZIP após falha parcial, relatório dos arquivos rejeitados pelo filtro de descompactação e limites de memória para ZIP.
- Garantia de atomicidade da troca de fotos e da edição de enquadramento, inclusive durante aplicação simultânea.
- Backup ainda usa JSON/base64 em memória: a remoção do corte de 60 MB precisa de teste de carga e estratégia de streaming/partes para volumes grandes. Não garante sucesso para volume arbitrário.
- Verificação após restaurar no banco; esta parte valida a integridade/referências do conteúdo antes de restaurar.
- Exibição dedicada do relatório do carômetro na tela de backups.
- Enquadramento individual na ficha (o editor desta parte está na simulação do lote).
- Atualização de segurança do Next.js: primeira execução do build apresentou SecurityFatalError; segunda execução concluiu. Nenhuma atualização de dependência foi incluída.

## Validação executada

- `node --test tests/carometro-melhorias-unit.test.js`: 9 testes passaram (sem banco; cobre regras de segmentos, matrícula/homônimos, recorte/rotação, resolução e referências de backup).
- `npm run typecheck`: passou.
- `node --check public/carometro.js`: passou.
- `npm run build`: segunda execução concluiu; alerta inicial descrito acima.

Não houve teste de aceitação com dados reais, deploy ou merge.
