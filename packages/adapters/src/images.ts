import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  imageNamePattern,
  mapWritingImages,
  type DocumentNode,
} from '@inkling/contracts';
import { ArticleError } from '@inkling/core';

export class WorkspaceImages {
  private readonly dir: string;
  constructor(workspace: string) {
    this.dir = join(workspace, 'images');
  }
  private directory() {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (!lstatSync(this.dir).isDirectory())
      throw new ArticleError('IMAGE_PATH', 503, '图片目录不可用。');
  }
  private path(name: string) {
    if (!imageNamePattern.test(name))
      throw new ArticleError('IMAGE_NOT_FOUND', 404, '找不到图片。');
    return join(this.dir, name);
  }
  write(bytes: Buffer, extension: string) {
    const name =
      createHash('sha256').update(bytes).digest('hex') + '.' + extension;
    const dest = this.path(name);
    this.directory();
    const tmp = join(this.dir, randomUUID() + '.tmp');
    const fd = openSync(tmp, 'wx', 0o600);
    try {
      try {
        writeFileSync(fd, bytes);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      try {
        linkSync(tmp, dest);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (!this.read(name).equals(bytes))
          throw new ArticleError('IMAGE_DAMAGED', 500, '已有图片内容损坏。');
      }
    } finally {
      unlinkSync(tmp);
    }
    return name;
  }
  read(name: string): Buffer {
    const path = this.path(name);
    try {
      this.directory();
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        return readFileSync(fd);
      } finally {
        closeSync(fd);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new ArticleError('IMAGE_NOT_FOUND', 404, '图片文件缺失。');
      throw error;
    }
  }
  checkReferences(doc: DocumentNode) {
    const visit = (node: DocumentNode) => {
      if (
        [
          'md:paragraph',
          'md:atx-heading',
          'md:setext-heading',
          'md:table.cell',
        ].includes(node.type)
      ) {
        for (const leaf of node.content ?? [])
          mapWritingImages(leaf.text ?? '', (src) => {
            if (src.startsWith('inkling-image:')) {
              const name = src.slice('inkling-image:'.length);
              if (
                !imageNamePattern.test(name) ||
                !lstatSync(this.path(name), { throwIfNoEntry: false })?.isFile()
              )
                throw new ArticleError(
                  'IMAGE_MISSING',
                  422,
                  '图片尚未保存到当前工作空间。',
                );
            }
            return src;
          });
      } else node.content?.forEach(visit);
    };
    visit(doc);
  }
}
