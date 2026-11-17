import { z } from 'zod';
import { Id, ArticleTitle } from './article';
export const CreateArticleCommand = z
  .object({ mutationId: Id, title: ArticleTitle.default('') })
  .strict();
export type CreateArticleCommand = z.infer<typeof CreateArticleCommand>;
export const ArticleListQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    beforeCreatedAt: z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    beforeId: Id.optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.beforeCreatedAt === undefined) === (value.beforeId === undefined),
    '分页游标需要同时提供时间与文章标识',
  );
export type ArticleListQuery = z.infer<typeof ArticleListQuery>;
export const ArticleListItem = z.object({
  articleId: Id,
  title: ArticleTitle,
  state: z.enum(['active', 'archived', 'trashed']),
  metadataVersion: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export const ArticleListPage = z.object({
  items: z.array(ArticleListItem),
  nextCursor: z
    .object({ createdAt: z.number().int().nonnegative(), articleId: Id })
    .nullable(),
});
export type ArticleListPage = z.infer<typeof ArticleListPage>;

export const OpenArticleCommand = z.object({ mutationId: Id }).strict();
export type OpenArticleCommand = z.infer<typeof OpenArticleCommand>;
