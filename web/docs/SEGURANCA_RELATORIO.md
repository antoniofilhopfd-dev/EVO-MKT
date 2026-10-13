# EVO MKT — Relatório final de segurança (Etapa 10)

Data: 13/10/2026. Escopo: código do repositório `web/` (frontend estático, API Next.js, MySQL/MariaDB, integrações), dependências de produção, cabeçalhos e configuração de implantação. **Este relatório não declara o sistema "completamente seguro":** registra o que foi examinado, o que foi corrigido e revalidado, e o que não pôde ser verificado.

## 1. Resumo executivo
Foram encontradas e **corrigidas 7 falhas confirmadas** (1 alta, 4 médias, 2 baixas) e uma dependência com vulnerabilidades altas, todas com teste de regressão. Nenhuma vulnerabilidade crítica foi encontrada. Permanecem riscos residuais (seção 8) e itens que dependem de ambiente real (seção 7).

## 2. Tecnologias e áreas examinadas
Next.js 16 (rotas de API em Node), HTML/JS estático com CSP, MySQL/MariaDB via `mysql2` com consultas parametrizadas, bcrypt, AES-256-GCM, cookies de sessão, integrações Meta/Google/Anthropic, uploads/downloads, backups, PWA. **Não aplicável (não existe no projeto):** PostgreSQL/RLS, GraphQL, Kubernetes, NoSQL, JWT, componentes móveis nativos, WebSockets.

## 3. Achados e correções
| # | Achado | Severidade | Situação | Teste de regressão |
|---|---|---|---|---|
| 1 | **Trocar a senha não encerrava as outras sessões** da mesma pessoa (sessão roubada continuava válida) — internos e Portal | Alta | **Corrigido** (mantém só a sessão atual) | `seguranca`: "trocar a senha encerra as outras sessões" |
| 2 | **IP do cliente forjável**: a API usava o *primeiro* valor de `X-Forwarded-For` (escrito pelo cliente), permitindo escapar do limite de tentativas e poluir a auditoria | Média | **Corrigido** (usa o fim da lista; `TRUSTED_PROXY_HOPS`) | `seguranca`: "IP do cliente vem do fim de X-Forwarded-For" |
| 3 | **CSP dos arquivos enviados era sobrescrita** pela CSP global do `next.config` (a proteção `sandbox` do código nunca chegava ao navegador) | Média | **Corrigido** (CSP própria sem scripts para as 3 rotas de arquivo; SVG, Office e ZIP sempre baixam) | `seguranca`: "download: CSP própria…", "SVG sempre baixa" |
| 4 | Respostas autenticadas da API sem `Cache-Control: no-store` | Média | **Corrigido** | `seguranca`: "API responde com no-store" |
| 5 | Faltavam `Permissions-Policy`, COOP/CORP e `includeSubDomains` no HSTS | Baixa | **Corrigido** | `seguranca` e `seguranca-estatica` |
| 6 | `nodemailer` ≤ 10.0.5 com vulnerabilidades **altas** (injeção SMTP, SSRF/leitura de arquivo em configurações que o app não usa, etc.) | Alta (dependência) | **Corrigido** (10.1.0; `npm audit --omit=dev`: 0 vulnerabilidades) | auditoria de dependências |
| 7 | Upload sem limite de quantidade por requisição; corpo JSON lido por inteiro antes de checar o tamanho | Baixa | **Corrigido** (máx. 10 arquivos; checagem de `Content-Length` antes de ler) | `seguranca`: upload e 413 |
| 8 | Teste de contraste: `--ink-3` (4,40:1) e texto branco sobre azul claro/laranja do Portal (2,6–2,8:1) abaixo de AA | Baixa (acessibilidade) | **Corrigido** | `contraste` (20 verificações) |
| 9 | Itens excluídos continuavam aparecendo na busca global | Baixa | **Corrigido** | `trabalho`: "item excluído não aparece na busca" |
| 10 | Rotas `SETUP_KEY`/`RECOVERY_KEY` ficavam sem aviso se a variável não fosse removida | Baixa | **Mitigado** (aviso na tela de Prontidão) | `integrations` (Prontidão) |

## 4. Classificação por área
| Área | Resultado | Como foi verificado |
|---|---|---|
| Segredos expostos / credenciais no frontend | **Não identificado** | Varredura de padrões em todos os arquivos versionados (`seguranca-estatica`); `.env` não versionado; logs do servidor sem segredos (`seguranca`) |
| SQL injection | **Não identificado** | Toda interpolação em SQL é identificador/constante revisada (teste estático falha se surgir outra); payloads em módulo, id, busca, arquivo e comentários (`seguranca`) |
| XSS | **Não identificado** | Payloads (`<img onerror>`, `<svg onload>`, `<script>`, `javascript:`) em todos os campos de 14 módulos, comentários, checklist, avisos, publicações, demanda do Portal e página de aprovação, renderizados em todas as telas, diálogos, Portal e relatório impresso (`xss`); CSP `script-src 'self'` |
| Autenticação / sessões / cookies | **Corrigido** (achado 1) | `acesso`, `codigo`, `recover`, `seguranca` |
| Autorização / escalada / IDOR | **Não identificado** | Varredura de rotas sem sessão, Equipe × rotas da Gerência (incluindo as novas), Portal × internas, isolamento entre segmentos (arquivos, comentários, histórico, links), mass assignment no Portal (`integridade`, `seguranca`, `trabalho`) |
| CORS | **Não identificado** | Sem cabeçalhos CORS; origem externa não é liberada (`seguranca`) |
| CSRF | **Não identificado** | Cabeçalho `X-EVO` obrigatório em escritas; cookies `SameSite=Strict` (`integridade`) |
| Rate limiting | **Corrigido** (achado 2) | Login, recuperação, link público de aprovação (429), IA (12/15 min) |
| Recuperação de senha | **Não identificado** | Resposta idêntica com conta existente ou não; sem token por e-mail (a Gerência gera senha temporária) |
| Uploads/downloads / path traversal | **Corrigido** (achados 3 e 7) | Assinatura do arquivo, `..` neutralizado, nosniff, CSP, attachment |
| SSRF | **Não identificado** | O servidor só chama bases fixas (Meta, Google, Anthropic; sobrescrevíveis apenas por variável de ambiente); nenhuma URL vinda do usuário é buscada |
| Webhooks | **Não aplicável** | O sistema não recebe webhooks (somente callbacks OAuth com `state` assinado) |
| Permissões do banco | **Não verificável** | Depende do usuário MySQL da Hostinger; recomenda-se um usuário só com o banco do app |
| Integridade das migrações | **Não identificado** | Instalação nova e atualização com dados (`migracoes`) |
| Dependências | **Corrigido** (achado 6) | `npm audit --omit=dev` |
| Logs sensíveis | **Não identificado** | Teste de logs; auditoria guarda ator/ação/IP, não conteúdo |
| Backups | **Não identificado** (conteúdo) / **Residual** (guarda) | Validação de integridade e restauração (`backup`); o arquivo contém dados e fichas — ver risco residual |
| HTTPS e cabeçalhos | **Corrigido** (achado 5) | `seguranca`, `seguranca-estatica`; HTTPS em si é da Hostinger (**não verificável** aqui) |
| LGPD | **Parcial** | Páginas de privacidade e termos; sem exportação/exclusão de dados pessoais por titular nem política de retenção automática (ver 8) |
| Lógica de negócio | **Não identificado** | Transições estritas, uso único de links, dependências e ciclos, decisões só do revisor, recusa com motivo |
| Exposição em relatórios/exportações | **Não identificado** | Painel integrado é só leitura de dados que o perfil já enxerga; indicadores só da Gerência; CSV gerado no navegador |

## 5. Testes executados
Suítes automáticas (`tests/run-web.sh`), incluindo `seguranca-estatica` (9), `seguranca` (28), `xss` (7), `integridade` (22), `acesso` (36), `codigo` (13), `recover` (8), `backup` (28), `migracoes` (7), `contraste` (20) e as de regressão funcional. Resultado completo na seção "Estado final" de `ACOMPANHAMENTO_EXECUCAO.md`. Análise estática própria (SQL, segredos, APIs perigosas) e `npm audit`. **Não executado:** varredura dinâmica com ferramenta externa (OWASP ZAP/Burp), teste de carga, teste de intrusão, revisão de infraestrutura da Hostinger.

## 6. Revalidação
Cada correção foi seguida da suíte completa (incluindo as funcionalidades existentes). Um teste que envelheceu com a data (`ui2`) foi corrigido para datas relativas.

## 7. Não aplicável / não verificável
Ver tabela: PostgreSQL/RLS, GraphQL, Kubernetes, NoSQL, mobile, JWT e webhooks **não existem**. **Não verificáveis aqui:** TLS e cabeçalhos no domínio de produção, permissões do usuário do banco, SMTP real, integrações reais (Meta, Google, Anthropic), comportamento atrás do proxy da Hostinger.

## 8. Riscos residuais
1. `style-src 'unsafe-inline'` na CSP (o frontend usa atributos `style`); scripts continuam restritos a `'self'`.
2. Em modo *código*, o código pessoal é o único fator; um código vazado dá acesso até a Gerência trocá-lo. Recomenda-se o modo *senha* para quem tem acesso amplo.
3. Backups guardam fichas e anexos no próprio banco: quem acessar o banco acessa tudo; os segredos das integrações estão criptografados com a `APP_KEY` (guarde-a fora do banco).
4. Rotas `/api/setup`, `/api/diag` e `/api/recover` existem enquanto `SETUP_KEY`/`RECOVERY_KEY` estiverem definidas; a chave vai na URL (pode ir para logs do proxy). **Remova as variáveis depois do uso.**
5. LGPD: faltam procedimentos de atendimento ao titular (exportar/excluir) e retenção automática de dados antigos.
6. Papéis Administrador e Gerente não são distintos (ambos `manager`).
7. Os segredos que já passaram pelo chat de desenvolvimento devem ser trocados.

## 9. Arquivos alterados nesta auditoria
`lib/ctx.ts`, `lib/files.ts`, `lib/api/handlers.ts`, `lib/api/integrations.ts`, `lib/mail.ts`, `app/api/[...path]/route.ts`, `next.config.mjs`, `public/operacao.js`, `public/portal.css`, `public/design.css`, `package.json`/`package-lock.json`, `.env.example`, `tests/seguranca*.test.js`, `tests/xss.test.js`, `tests/contraste.test.js`, `tests/migracoes.test.js`.
