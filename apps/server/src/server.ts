import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { HealthResponse } from '@inkling/contracts';

export function createServer(options: { webRoot?: string } = {}) {
  const app = Fastify({ logger: false, forceCloseConnections: true });
  app.addHook('onRequest', async (request, reply) => {
    if (!['localhost', '127.0.0.1'].includes(request.hostname)) {
      return reply
        .code(403)
        .send({ code: 'LOCAL_HOST_REQUIRED', message: '请使用本机地址访问。' });
    }
  });
  app.get('/api/health', async () =>
    HealthResponse.parse({
      status: 'ok',
      application: 'inkling',
      apiVersion: 1,
    }),
  );
  if (options.webRoot)
    app.register(staticFiles, { root: options.webRoot, index: 'index.html' });
  return app;
}
