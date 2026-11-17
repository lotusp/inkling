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
export const ArticleTag = z
  .string()
  .transform((value) => value.trim().normalize('NFC'))
  .refine(
    (value) => [...value].length >= 1 && [...value].length <= 30,
    '标签需要 1–30 个字符',
  );
export const ArticleTags = z
  .array(ArticleTag)
  .transform((tags) => [...new Set(tags)].sort())
  .refine((tags) => tags.length <= 10, '最多 10 个标签');
export const ArticleListItem = z.object({
  articleId: Id,
  title: ArticleTitle,
  state: z.enum(['active', 'archived', 'trashed']),
  metadataVersion: z.number().int().positive(),
  tags: ArticleTags,
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

export type ArticleListItem = z.infer<typeof ArticleListItem>;
export const UpdateArticleMetadataCommand = z
  .object({
    mutationId: Id,
    baseMetadataVersion: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
    tags: ArticleTags,
  })
  .strict();
export type UpdateArticleMetadataCommand = z.infer<
  typeof UpdateArticleMetadataCommand
>;
export const UpdateArticleMetadataResult = z.object({
  mutationId: Id,
  metadata: ArticleListItem,
});
export type UpdateArticleMetadataResult = z.infer<
  typeof UpdateArticleMetadataResult
>;
