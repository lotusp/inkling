import { z } from 'zod';
import { ArticleDocument, Id } from './article';
export const RevisionQuery = z
  .object({
    beforeSeq: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    all: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .strict();
export type RevisionQuery = z.output<typeof RevisionQuery>;
export const RevisionInfo = z.object({
  articleId: Id,
  revisionId: Id,
  seq: z.number().int().positive(),
  parentRevisionId: Id.nullable(),
  kind: z.enum(['initial', 'save', 'restore']),
  restoredFromRevisionId: Id.nullable(),
  createdAt: z.number(),
  automaticAt: z.number().nullable(),
  name: z.string().nullable(),
  current: z.boolean(),
});
export type RevisionInfo = z.infer<typeof RevisionInfo>;
export const RevisionDetail = RevisionInfo.extend({
  document: ArticleDocument,
  contentHash: z.string(),
});
export type RevisionDetail = z.infer<typeof RevisionDetail>;
export const RevisionPage = z.object({
  items: z.array(RevisionInfo),
  nextBeforeSeq: z.number().int().positive().nullable(),
});
export type RevisionPage = z.infer<typeof RevisionPage>;
export const NameRevisionCommand = z
  .object({
    mutationId: Id,
    name: z
      .string()
      .refine(
        (x) => x.trim().length > 0 && [...x].length <= 80,
        '版本名需为 1–80 个字符',
      ),
  })
  .strict();
export type NameRevisionCommand = z.infer<typeof NameRevisionCommand>;
export const NameRevisionResult = z.object({
  mutationId: Id,
  articleId: Id,
  revisionId: Id,
  name: z.string(),
  updatedAt: z.number(),
});
export type NameRevisionResult = z.infer<typeof NameRevisionResult>;
export const RestoreRevisionCommand = z
  .object({ mutationId: Id, baseRevisionId: Id, sourceRevisionId: Id })
  .strict();
export type RestoreRevisionCommand = z.infer<typeof RestoreRevisionCommand>;
