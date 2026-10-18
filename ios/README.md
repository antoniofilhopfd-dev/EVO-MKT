# EVO MKT para iPhone (xtool)

App nativo mínimo que abre o EVO MKT (`https://evomkt.antoniopfd.com`) em tela cheia, mantendo o login. Não tem lógica própria: tudo (login, perfis, permissões) continua no servidor.

Não faz parte do build da Hostinger (pasta `web/` é a raiz do deploy). **Não foi compilado nem testado** — exige Swift e o SDK do iOS, que dependem de um Mac/Linux com xtool configurado e de um Apple ID.

## Como instalar
1. Instale o [xtool](https://github.com/xtool-org/xtool) e rode `xtool setup` (pede o Xcode.xip e entra com o Apple ID).
2. Nesta pasta: `xtool dev` (compila, assina e instala no iPhone ligado por cabo).
3. Apple ID gratuito: o app expira em 7 dias e precisa ser reinstalado.

A alternativa sem xtool é abrir o site no Safari → Compartilhar → "Adicionar à Tela de Início" (PWA).
