# EVO MKT v2.2.1 — Runtime Estável

- Corrige o ciclo de vida do servidor local: ele permanece ativo enquanto a janela do EVO MKT envia heartbeat.
- O servidor não encerra mais quando o processo inicial do Edge/Chrome retorna.
- Encerramento automático apenas após a janela parar de enviar heartbeat por 45 segundos.
- Mantém runtime Go, sem Node/npm/Next/Webpack/Turbopack/VBS/CMD.
- API local mantida para todos os 19 módulos XLSX.
- `fetch` do frontend recebe uma tentativa adicional para falhas transitórias curtas.
- Dados XLSX preservados na migração.
