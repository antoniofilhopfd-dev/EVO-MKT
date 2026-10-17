import { NextResponse, type NextRequest } from 'next/server';

// Fica de fora: /api/*, /_next/* e os assets estáticos (ver matcher).
// A autenticação do sistema é feita pela própria API (cookie assinado + sessão no banco);
// as páginas estáticas só carregam a tela de entrada. Aqui: URLs amigáveis e bloqueio de arquivos ocultos.
export function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (p.split('/').some((s) => s.startsWith('.') && s !== '')) return new NextResponse('Not found', { status: 404 });
  if (p === '/') return NextResponse.rewrite(new URL('/index.html', req.url));
  if (p === '/solicitante' || p === '/portal') return NextResponse.rewrite(new URL('/api/portal/pagina/solicitante.html', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/|_next/|.*\\.(?:js|css|png|jpg|jpeg|svg|ico|webp|woff2?|ttf|otf|webmanifest|json|html|txt)$).*)'],
};
