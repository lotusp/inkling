import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
export interface AccessOptions {
  origin: string;
  workspaceId: string;
  bootstrapToken: string;
  localSecret: string;
  now?: () => number;
  browserOrigin?: string;
}
const random = () => randomBytes(32).toString('hex');
function equal(a: unknown, b: string) {
  return (
    typeof a === 'string' &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function cookieId(request: FastifyRequest) {
  const ids = (request.headers.cookie ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter((x) => x.startsWith('inkling_session='));
  return ids.length === 1
    ? ids[0]?.slice('inkling_session='.length)
    : undefined;
}
export function registerAccess(app: FastifyInstance, options: AccessOptions) {
  const now = options.now ?? Date.now;
  const tokens = new Map([[options.bootstrapToken, now() + 5 * 60_000]]);
  const sessions = new Map<string, { csrf: string; expires: number }>();
  const session = (request: FastifyRequest) => {
    const id = cookieId(request);
    if (!id) return undefined;
    const value = sessions.get(id);
    if (value && value.expires > now()) return value;
    sessions.delete(id);
    return undefined;
  };
  const originAllowed = (request: FastifyRequest) =>
    request.headers.origin === (options.browserOrigin ?? options.origin);
  const prune = () => {
    for (const [key, expires] of tokens)
      if (expires <= now()) tokens.delete(key);
    for (const [key, value] of sessions)
      if (value.expires <= now()) sessions.delete(key);
  };
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api/')) return;
    reply
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff');
    if (path === '/api/health') return;
    if (!options.workspaceId)
      return reply.code(503).send({ code: 'WORKSPACE_NOT_READY' });
    if (path === '/api/local/access') {
      if (
        request.headers.origin !== undefined ||
        request.headers['sec-fetch-site'] !== undefined ||
        !equal(request.headers['x-inkling-local-secret'], options.localSecret)
      )
        return reply.code(403).send({ code: 'LOCAL_ACCESS_REQUIRED' });
      return;
    }
    if (path === '/api/auth/exchange') {
      if (!originAllowed(request))
        return reply.code(403).send({ code: 'ORIGIN_REJECTED' });
      return;
    }
    if (
      (request.headers.origin !== undefined && !originAllowed(request)) ||
      request.headers['sec-fetch-site'] === 'cross-site' ||
      request.headers['sec-fetch-site'] === 'same-site'
    )
      return reply.code(403).send({ code: 'ORIGIN_REJECTED' });
    const identity = session(request);
    if (!identity)
      return reply.code(401).send({
        code: 'SESSION_REQUIRED',
        message: '请从本机启动入口重新连接。',
      });
    if (!['GET', 'HEAD'].includes(request.method)) {
      if (!originAllowed(request))
        return reply.code(403).send({ code: 'ORIGIN_REJECTED' });
      if (!equal(request.headers['x-csrf-token'], identity.csrf))
        return reply.code(403).send({ code: 'CSRF_REJECTED' });
      if (!request.headers['content-type']?.startsWith('application/json'))
        return reply.code(415).send({ code: 'JSON_REQUIRED' });
    }
  });
  app.post('/api/auth/exchange', async (request, reply) => {
    prune();
    const body = request.body;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !('token' in body) ||
      typeof body.token !== 'string' ||
      body.token.length !== 64
    )
      return reply.code(400).send({ code: 'INVALID_TOKEN' });
    let valid: string | undefined;
    for (const candidate of tokens.keys())
      if (equal(body.token, candidate)) valid = candidate;
    if (!valid)
      return reply
        .code(401)
        .send({ code: 'TOKEN_EXPIRED', message: '请重新获取本机访问链接。' });
    tokens.delete(valid);
    const id = random();
    const identity = { csrf: random(), expires: now() + 12 * 60 * 60_000 };
    if (sessions.size >= 100)
      return reply.code(429).send({ code: 'SESSION_LIMIT' });
    sessions.set(id, identity);
    reply.header(
      'set-cookie',
      `inkling_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
    );
    return { csrfToken: identity.csrf, expiresAt: identity.expires };
  });
  app.get('/api/auth/session', async (request) => {
    const identity = session(request);
    return { csrfToken: identity?.csrf, expiresAt: identity?.expires };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const id = cookieId(request);
    if (id) sessions.delete(id);
    reply.header(
      'set-cookie',
      'inkling_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
    );
    return reply.code(204).send();
  });
  app.post('/api/local/access', async (_request, reply) => {
    prune();
    if (tokens.size >= 20) return reply.code(429).send({ code: 'TOKEN_LIMIT' });
    const token = random();
    tokens.set(token, now() + 5 * 60_000);
    return {
      url: `${options.browserOrigin ?? options.origin}/#access=${token}`,
    };
  });
  app.get('/api/workspace', async () => ({ workspaceId: options.workspaceId }));
  app.addHook('onClose', async () => {
    tokens.clear();
    sessions.clear();
  });
}
