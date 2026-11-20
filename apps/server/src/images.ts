import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import type { WorkspaceImages } from '@inkling/adapters';
import { ArticleError } from '@inkling/core';
import { imageByteLimit, imageMime } from '@inkling/contracts';

export function registerImages(
  app: FastifyInstance,
  images: () => WorkspaceImages | undefined,
) {
  const store = () => {
    const storage = images();
    if (!storage)
      throw new ArticleError('WORKSPACE_NOT_READY', 503, '工作空间尚未就绪。');
    return storage;
  };
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: imageByteLimit },
    (_req, body, done) => done(null, body),
  );
  app.post('/api/images', { bodyLimit: imageByteLimit }, async (req, reply) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length)
      throw new ArticleError('IMAGE_INVALID', 415, '请选择有效的本地图片。');
    const bytes = req.body;
    let ext: string;
    try {
      const decoder = sharp(bytes, {
        limitInputPixels: 32_000_000,
        failOn: 'error',
      });
      const { format, width, height, pages = 1 } = await decoder.metadata();
      ext = format === 'jpeg' ? 'jpg' : format;
      if (!Object.hasOwn(imageMime, ext) || width * height * pages > 32_000_000)
        throw new Error();
      await decoder
        .resize({ width: 1, height: 1, fit: 'inside' })
        .raw()
        .toBuffer();
    } catch {
      throw new ArticleError(
        'IMAGE_INVALID',
        415,
        '请选择有效的 PNG、JPEG、GIF 或 WebP 图片（最多 3200 万像素）。',
      );
    }
    try {
      return reply.code(201).send({ name: store().write(bytes, ext) });
    } catch (error) {
      if (error instanceof ArticleError) throw error;
      const full = (error as NodeJS.ErrnoException).code === 'ENOSPC';
      throw new ArticleError(
        full ? 'STORAGE_FULL' : 'IMAGE_STORAGE_UNAVAILABLE',
        full ? 507 : 503,
        '图片保存失败，请检查工作空间后重试。',
      );
    }
  });
  app.get<{ Params: { name: string } }>('/api/images/:name', (req, reply) => {
    const name = req.params.name;
    const bytes = store().read(name);
    const extension = name.split('.').pop() as keyof typeof imageMime;
    return reply
      .type(imageMime[extension])
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .header('cross-origin-resource-policy', 'same-origin')
      .send(bytes);
  });
}
