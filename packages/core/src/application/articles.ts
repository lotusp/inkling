import {
  ArticleDocument,
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
  mutation(id: string): unknown;
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
  mutation(id: unknown) {
    return this.repository.mutation(Id.parse(id));
  }
}
