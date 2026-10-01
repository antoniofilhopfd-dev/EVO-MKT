# EVO MKT v2.2.0 — Runtime Go / padrão AF+

Mudança estrutural de execução:
- removida a dependência de Next.js/npm/TypeScript na máquina do usuário;
- `EVO_MKT_LOCAL.exe` agora é um executável Windows GUI x64 autossuficiente;
- frontend local pronto em `web/`;
- dados mantidos em `DADOS/*.xlsx`;
- servidor local embutido no EXE;
- abertura em janela de aplicativo via Edge/Chrome `--app`;
- sem VBS e sem CMD visível;
- sem `npm ci`, `next build`, Webpack ou Turbopack na abertura;
- criação automática de XLSX ausente;
- CRUD local, busca global, Dashboard/Hoje, Calendário, Central Operacional, Saúde, Backup e Lixeira;
- escrita XLSX atômica com backup prévio;
- 19 XLSX preservados byte a byte na migração.

Esta versão muda somente a camada de execução/distribuição para eliminar a sequência de falhas de compilação no Windows.
