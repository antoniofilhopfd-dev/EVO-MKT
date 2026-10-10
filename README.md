# EVO MKT

Sistema web de gestão de marketing do Colégio Evolução, com portal de solicitações para as coordenações.

- **Código:** `web/` (Next.js 16 + MySQL). Veja `web/README.md`.
- **Publicação (Hostinger):** `web/docs/DEPLOY_HOSTINGER.md`.
- **Auditoria e plano de finalização:** `web/docs/AUDITORIA_01.md`.
- **Operação e recuperação:** `web/docs/` (backup, restauração, integrações).

## Histórico
As versões anteriores (sistema local em `.exe`, versão PHP `online/`, pacotes `dist/` e documentos de cada versão) foram removidas da árvore na limpeza do legado, mas continuam no histórico do Git. O último commit com tudo isso é `8ff3dc6`:

```bash
git checkout 8ff3dc6        # ver o legado como estava
git log --stat -- online/   # histórico da versão PHP
```
