import type { WorkspaceImages } from '@inkling/adapters';
import { registerImages } from './images';
import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { HealthResponse } from '@inkling/contracts';

import { registerAccess, type AccessOptions } from './access';
export type { AccessOptions } from './access';
import { ArticleError, type ArticleService } from '@inkling/core';
export function createServer(
  options: {
    webRoot?: string;
    access?: AccessOptions;
    images?: () => WorkspaceImages | undefined;
    articles?: () => ArticleService | undefined;
  } = {},
) {
  if ((options.articles || options.images) && !options.access)
    throw new Error('Article routes require local access protection');
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
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ArticleError)
      return reply.code(error.status).send({
        code: error.code,
        message: error.message,
        details: error.details,
        retryable: error.status === 503,
      });
    if (error instanceof Error && error.name === 'ZodError')
      return reply.code(422).send({
        code: 'UNSUPPORTED_DOCUMENT',
        message: '请求或正文格式不受支持。',
        retryable: false,
      });
    if (
      error instanceof Error &&
      'code' in error &&
      ['SQLITE_CORRUPT', 'SQLITE_NOTADB'].includes(String(error.code))
    )
      return reply.code(500).send({
        code: 'STORAGE_CORRUPT',
        message: '数据库损坏，已停止操作。请保留原文件并检查可救援版本。',
        retryable: false,
      });
    if (
      error instanceof Error &&
      'code' in error &&
      String(error.code).startsWith('SQLITE_')
    )
      return reply.code(error.code === 'SQLITE_FULL' ? 507 : 503).send({
        code:
          error.code === 'SQLITE_FULL' ? 'STORAGE_FULL' : 'STORAGE_UNAVAILABLE',
        message: '保存未确认，请保留输入并重试。',
        retryable: true,
      });
    return reply
      .code(
        error instanceof Error &&
          'statusCode' in error &&
          typeof error.statusCode === 'number'
          ? error.statusCode
          : 500,
      )
      .send({ code: 'REQUEST_FAILED', message: '请求未完成。' });
  });
  if (options.images) registerImages(app, options.images);
  if (options.articles) {
    const service = () => {
      const articles = options.articles?.();
      if (!articles)
        throw new ArticleError(
          'WORKSPACE_NOT_READY',
          503,
          '工作空间尚未就绪。',
        );
      return articles;
    };
    app.get('/api/articles', async (request) => service().list(request.query));
    app.post('/api/articles', async (request) =>
      service().create(request.body),
    );
    app.post('/api/articles/ensure-current', async (request) =>
      service().ensure(request.body),
    );
    app.post<{ Params: { id: string } }>(
      '/api/articles/:id/open',
      async (request) => service().open(request.params.id, request.body),
    );
    app.get<{ Params: { id: string } }>(
      '/api/articles/:id/metadata',
      async (request) => service().metadata(request.params.id),
    );
    app.put<{ Params: { id: string } }>(
      '/api/articles/:id/metadata',
      async (request) =>
        service().updateMetadata(request.params.id, request.body),
    );
    app.post<{ Params: { id: string } }>(
      '/api/articles/:id/lifecycle',
      async (request) => service().lifecycle(request.params.id, request.body),
    );
    app.get<{ Params: { id: string } }>('/api/articles/:id', async (request) =>
      service().read(request.params.id),
    );
    app.put<{ Params: { id: string } }>(
      '/api/articles/:id/content',
      async (request) => service().save(request.params.id, request.body),
    );
    app.get<{ Params: { id: string } }>(
      '/api/articles/:id/revisions',
      async (request) => service().revisions(request.params.id, request.query),
    );
    app.get<{ Params: { id: string; revisionId: string } }>(
      '/api/articles/:id/revisions/:revisionId',
      async (request) =>
        service().revision(request.params.id, request.params.revisionId),
    );
    app.put<{ Params: { id: string; revisionId: string } }>(
      '/api/articles/:id/revisions/:revisionId/name',
      async (request) =>
        service().name(
          request.params.id,
          request.params.revisionId,
          request.body,
        ),
    );
    app.post<{ Params: { id: string } }>(
      '/api/articles/:id/restore',
      async (request) => service().restore(request.params.id, request.body),
    );
    app.get<{ Params: { id: string } }>('/api/mutations/:id', async (request) =>
      service().mutation(request.params.id),
    );
  }
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
