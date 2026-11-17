import {
  ArticleDocument,
  RevisionQuery,
  RestoreRevisionCommand,
  NameRevisionCommand,
  type RevisionPage,
  type RevisionDetail,
  type NameRevisionResult,
  EnsureArticleCommand,
  Id,
  SaveArticleCommand,
  type ArticleSnapshot,
  type SaveResult,
  type WorkspaceInfo,
} from '@inkling/contracts';
export interface ArticleRepository {
  workspace(): WorkspaceInfo;
  ensure(mutationId: string): ArticleSnapshot;
  read(articleId: string): ArticleSnapshot;
  save(articleId: string, command: SaveArticleCommand): SaveResult;
  restore(articleId: string, command: RestoreRevisionCommand): SaveResult;
  mutation(id: string): unknown;
  revisions(articleId: string, query: RevisionQuery): RevisionPage;
  revision(articleId: string, revisionId: string): RevisionDetail;
  name(
    articleId: string,
    revisionId: string,
    command: NameRevisionCommand,
  ): NameRevisionResult;
}
export class ArticleService {
  constructor(private readonly repository: ArticleRepository) {}
  workspace() {
    return this.repository.workspace();
  }
  ensure(input: unknown) {
    return this.repository.ensure(EnsureArticleCommand.parse(input).mutationId);
  }
  read(id: unknown) {
    return this.repository.read(Id.parse(id));
  }
  save(id: unknown, input: unknown) {
    const command = SaveArticleCommand.parse(input);
    ArticleDocument.parse(command.document);
    return this.repository.save(Id.parse(id), command);
  }
  revisions(id: unknown, query: unknown) {
    return this.repository.revisions(Id.parse(id), RevisionQuery.parse(query));
  }
  revision(id: unknown, revisionId: unknown) {
    return this.repository.revision(Id.parse(id), Id.parse(revisionId));
  }
  name(id: unknown, revisionId: unknown, input: unknown) {
    return this.repository.name(
      Id.parse(id),
      Id.parse(revisionId),
      NameRevisionCommand.parse(input),
    );
  }
  restore(id: unknown, input: unknown) {
    return this.repository.restore(
      Id.parse(id),
      RestoreRevisionCommand.parse(input),
    );
  }
  mutation(id: unknown) {
    return this.repository.mutation(Id.parse(id));
  }
}
