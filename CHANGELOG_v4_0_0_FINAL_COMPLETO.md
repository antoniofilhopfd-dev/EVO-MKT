# EVO MKT v4.0.0 — Final Completo

Base: v3.6.0 Planejamento Editorial e Fechamento.

## Fechamento final
- Nova área Sistema > Manutenção, exclusiva da Gerente.
- Autoteste somente leitura: runtime, heartbeat, planilhas e módulos críticos.
- Modo Seguro da interface para manutenção/atualização.
- Pacote de diagnóstico sem códigos de acesso e sem conteúdo dos XLSX.
- Exportação de snapshot JSON para consulta/auditoria.
- Exportação/importação das preferências locais da interface.
- Limpeza segura de cache, rascunhos e log técnico, sem apagar XLSX.
- Log local limitado de erros da interface para suporte.
- Alto contraste, escala de texto e foco de teclado reforçado.
- Bloqueio opcional da sessão interna por inatividade.
- Atalhos Alt+H, Alt+M, Alt+C, Alt+G, Alt+S e ajuda com `?`.
- Novos comandos administrativos na busca global: manutenção, saúde, dados e modo seguro.
- Melhorias de impressão/PDF e alvos de clique.
- Guia de atualização segura, recuperação, atalhos e limites de segurança.
- Pacote final Windows-only: removidos binários Linux usados apenas na homologação.

## Dados
- Nenhuma nova planilha criada.
- 19 XLSX preservados byte a byte em relação à v3.6.0.
- XLSX continuam sendo a fonte oficial dos dados.

## Arquitetura preservada
- EVO_MKT_LOCAL.exe
- EVO_MKT_SOLICITANTE.exe
- EVO_MKT_PORTAL_REDE.exe
- web/
- DADOS/
- ANEXOS/
- storage/

O runtime interno principal não foi recompilado nesta revisão; a interface funcional é v4.0.0 e o runtime mantém seu identificador homologado anterior.
