# Acesso só por código (v4.4.0)

Modo opcional. Padrão continua **código + senha**.

## Como ligar
1. Entre como Gerente (código NAT-3301 + senha).
2. Administração → Acessos → **Ativar acesso só por código** → confirme sua senha.
3. O sistema mostra **uma única vez** um código novo (2 letras + 4 números, ex.: `KM4829`) para cada pessoa da equipe e do Portal. Anote e entregue individualmente.
4. Os códigos antigos (ex.: ANT-3302) deixam de valer. Sessões abertas são encerradas (exceto a sua).

## Proteções
- Códigos aleatórios guardados só como HMAC (não dá para ler no banco). Sem I/O (evita confusão com 1/0).
- Limite de tentativas por IP, atraso progressivo e **modo de proteção global** (se houver ataque, o sistema trava e avisa).
- Aparelho conhecido (cookie) e aviso por e-mail em novo aparelho.
- Ações sensíveis da Gerente (redefinir acesso, ativar/desativar, credenciais de Instagram/Google) pedem a **senha de administração** de novo.
- A Gerente mantém a senha de administração; no modo código ela entra só com o código.

## Voltar atrás
Administração → Acessos → **Voltar ao acesso por senha**.
