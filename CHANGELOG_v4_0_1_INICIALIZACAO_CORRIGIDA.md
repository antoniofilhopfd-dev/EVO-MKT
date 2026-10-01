# EVO MKT v4.0.1 — Inicialização corrigida

Correção focada no erro de abertura do servidor local no Windows.

- `EVO_MKT_LOCAL.exe` agora é um iniciador inteligente.
- O runtime homologado v4.0.0 foi preservado byte a byte como `EVO_MKT_CORE.exe`.
- Reutiliza uma instância saudável já ativa em `127.0.0.1:3210`.
- Detecta porta 3210 ocupada por instância antiga/travada do EVO MKT e encerra apenas processos EVO MKT anteriores.
- Se a porta continuar ocupada por outro aplicativo, mostra diagnóstico específico.
- Valida `/api/health` após iniciar o core.
- Gera `storage/logs/launcher.log` para diagnóstico de abertura.
- Nenhum XLSX foi alterado.
