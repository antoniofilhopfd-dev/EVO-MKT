# EVO MKT

Sistema web de gestão de marketing do Colégio Evolução, em cinco áreas: **Dashboard, Calendário, Instagram, Tráfego Pago (somente consulta) e Configurações**.

- **Código:** `web/` (Next.js 16 + MySQL). Veja `web/README.md`.
- **Publicação (Hostinger):** `web/docs/DEPLOY_HOSTINGER.md`.
- **Reestruturação v6:** `web/docs/AUDITORIA_V6.md` (ponto de partida) e `web/docs/RELATORIO_V6.md` (resultado, testes e capturas).
- **Operação e recuperação:** `web/docs/` (backup, restauração, integrações).

## Histórico
As versões anteriores (sistema local em `.exe`, versão PHP `online/`, pacotes `dist/` e documentos de cada versão) foram removidas da árvore na limpeza do legado, mas continuam no histórico do Git. O último commit com tudo isso é `8ff3dc6`:

```bash
git checkout 8ff3dc6        # ver o legado como estava
git log --stat -- online/   # histórico da versão PHP
```
