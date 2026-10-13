import { env, fail, Row } from './util';

export interface Ctx {
  req: Request;
  method: string;
  path: string;
  url: URL;
  ip: string;
  ua: string;
  cookies: Record<string, string>;
  setCookies: string[];
  secure: boolean;
  qs(k: string): string;
  header(k: string): string;
  body(): Promise<Row>;
}

function parseCookies(h: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    try {
      o[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      o[k] = part.slice(i + 1).trim();
    }
  }
  return o;
}

export function makeCtx(req: Request, path: string): Ctx {
  const url = new URL(req.url);
  // IP do cliente: a hospedagem acrescenta o IP real ao FIM de X-Forwarded-For; o começo da lista é escrito pelo próprio cliente
  // e pode ser forjado para escapar do limite de tentativas. TRUSTED_PROXY_HOPS = quantos proxies confiáveis há na frente (padrão 1).
  const hops = Math.max(1, Math.min(5, Number(env('TRUSTED_PROXY_HOPS', '1')) || 1));
  const cadeia = (req.headers.get('x-forwarded-for') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const xff = cadeia.length ? cadeia[Math.max(0, cadeia.length - hops)] : '';
  const ip = (xff || req.headers.get('x-real-ip') || '-').slice(0, 64);
  const secure = req.headers.get('x-forwarded-proto') === 'https' || env('PUBLIC_URL').startsWith('https://') || url.protocol === 'https:';
  let cached: Row | null = null;
  return {
    req,
    method: req.method,
    path,
    url,
    ip,
    ua: req.headers.get('user-agent') || '',
    cookies: parseCookies(req.headers.get('cookie') || ''),
    setCookies: [],
    secure,
    qs: (k) => (url.searchParams.get(k) || '').trim(),
    header: (k) => req.headers.get(k) || '',
    async body() {
      if (cached) return cached;
      if (Number(req.headers.get('content-length') || 0) > 2_000_000) fail(413, 'Requisição muito grande.');
      const raw = await req.text();
      if (!raw) return (cached = {});
      if (raw.length > 2_000_000) fail(413, 'Requisição muito grande.');
      let j: unknown;
      try {
        j = JSON.parse(raw);
      } catch {
        fail(400, 'JSON inválido.');
      }
      if (!j || typeof j !== 'object' || Array.isArray(j)) fail(400, 'JSON inválido.');
      return (cached = j as Row);
    },
  };
}

export function setCookie(c: Ctx, name: string, value: string, opts: { maxAge?: number; expire?: boolean } = {}): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (opts.expire) parts.push('Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  else if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (c.secure) parts.push('Secure');
  c.setCookies.push(parts.join('; '));
}
