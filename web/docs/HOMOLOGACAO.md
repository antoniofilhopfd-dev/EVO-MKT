# Roteiro de homologação (v6)

Passo a passo para conferir, em minutos, que a reestruturação em cinco áreas está correta. O resultado automático de cada suíte está em `RELATORIO_V6.md`.

1. **Menu:** exatamente Dashboard, Calendário, Instagram, Tráfego Pago e Configurações.
2. **Filtros:** escolha um perfil no Dashboard, vá para Instagram › Conteúdos (o filtro continua) e para Tráfego Pago (o filtro de perfil fica desativado, com o motivo). “Limpar filtros” zera tudo.
3. **Publicação:** Instagram › Conteúdos › Nova publicação: preencha, anexe a arte final e um link do Drive, envie para revisão, aprove, agende e confirme a publicação. Confira o histórico na própria publicação.
4. **Calendário:** clique em um dia (cria publicação), arraste uma publicação para outro dia, abra um evento escolar e uma data comemorativa e use “Criar publicação”.
5. **Tráfego Pago:** com a Meta conectada, confira Visão geral, Campanhas e Anúncios, baixe o CSV e abra o PDF A4. Não deve existir botão de criar, editar, ativar ou pausar.
6. **Configurações:** Prontidão mostra conexão, última e próxima sincronização, última falha, validade do token, versão da API, último backup, integridade, versão e ambiente. Backup mostra o relatório da migração e os arquivos sem vínculo.
7. **Equipe (não administrador):** vê só Geral, Perfis e segmentos e Prontidão em Configurações.

Antes de subir em produção: backup do banco pelo phpMyAdmin, `npm run typecheck`, `npm run build` e as suítes de `tests/run-web.sh`.
