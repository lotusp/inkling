import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { HealthResponse } from '@inkling/contracts';

import { registerAccess, type AccessOptions } from './access';
export type { AccessOptions } from './access';
export function createServer(
  options: { webRoot?: string; access?: AccessOptions } = {},
) {
  const app = Fastify({
    logger: false,
    forceCloseConnections: true,
    bodyLimit: 3 * 1024 * 1024,
  });
  app.addHook('onRequest', async (request, reply) => {
    if (!['localhost', '127.0.0.1'].includes(request.hostname)) {
      return reply
        .code(403)
        .send({ code: 'LOCAL_HOST_REQUIRED', message: '请使用本机地址访问。' });
    }
  });
  if (options.access) registerAccess(app, options.access);
  app.get('/api/health', async (_request, reply) => {
    if (options.access && !options.access.workspaceId)
      return reply.code(503).send({ code: 'WORKSPACE_NOT_READY' });
    return HealthResponse.parse({
      status: 'ok',
      application: 'inkling',
      apiVersion: 1,
    });
  });
  if (options.webRoot)
    app.register(staticFiles, { root: options.webRoot, index: 'index.html' });
  return app;
}
