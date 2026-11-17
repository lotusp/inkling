import {
  ArticleSnapshot,
  Id,
  SaveArticleCommand,
  validDocumentNode,
  type ArticleDocument,
} from '@inkling/contracts';

export interface PendingSave {
  command: SaveArticleCommand;
  restoreSourceRevisionId?: string;
  seq: number;
  requestHash: string;
  reconcile?: boolean;
}
export interface DraftRecord {
  version: 1 | 2;
  workspaceId: string;
  articleId: string;
  clientId: string;
  ack: ArticleSnapshot;
  draft: { document: ArticleDocument; seq: number };
  pending: PendingSave | null;
  updatedAt: number;
}
export interface RecoveryChoice {
  record: DraftRecord;
  active: boolean;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + stableJson(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export async function requestHash(
  articleId: string,
  command: SaveArticleCommand,
  restoreSourceRevisionId?: string,
) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      stableJson(
        restoreSourceRevisionId
          ? {
              operation: 'restore',
              articleId,
              ...command,
              restoreSourceRevisionId,
            }
          : { operation: 'save', articleId, ...command },
      ),
    ),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('恢复副本格式无法识别，原数据已保留。');
  return Object.fromEntries(Object.entries(value));
}
function sequence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('恢复副本序号无效。');
  return value;
}
function parseRecord(value: unknown): DraftRecord {
  const r = object(value),
    draft = object(r.draft),
    doc = object(draft.document);
  if (
    (r.version !== 1 && r.version !== 2) ||
    doc.schemaVersion !== 1 ||
    typeof doc.title !== 'string' ||
    !validDocumentNode(doc.doc)
  )
    throw new Error('恢复副本格式不受支持，原数据已保留。');
  const ack = ArticleSnapshot.parse(r.ack);
  const articleId = Id.parse(r.articleId);
  let pending: PendingSave | null = null;
  if (r.pending !== null) {
    const p = object(r.pending);
    if (
      typeof p.requestHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(p.requestHash)
    )
      throw new Error('未决保存校验信息无效。');
    pending = {
      command: SaveArticleCommand.parse(p.command),
      seq: sequence(p.seq),
      requestHash: p.requestHash,
      reconcile: true,
      ...(p.restoreSourceRevisionId !== undefined
        ? { restoreSourceRevisionId: Id.parse(p.restoreSourceRevisionId) }
        : {}),
    };
  }
  const seq = sequence(draft.seq);
  if (ack.articleId !== articleId || (pending && pending.seq > seq))
    throw new Error('恢复副本基线不一致。');
  return {
    version: r.version,
    workspaceId: Id.parse(r.workspaceId),
    articleId,
    clientId: Id.parse(r.clientId),
    ack,
    draft: {
      document: { schemaVersion: 1, title: doc.title, doc: doc.doc },
      seq,
    },
    pending,
    updatedAt: sequence(r.updatedAt),
  };
}

const lockName = (id: string) => 'inkling:draft-client:' + id;
let owner: Promise<string> | undefined;
let releaseOwner: (() => void) | undefined;
// One lock per document lifetime. StrictMode mounts reuse it; duplicate tabs cannot.
export function ownDraftClient(fresh = false): Promise<string> {
  if (fresh) {
    releaseOwner?.();
    releaseOwner = undefined;
    owner = undefined;
  }
  owner ??= (async () => {
    if (!navigator.locks) throw new Error('浏览器不支持草稿隔离锁。');
    let candidate: string | null = null;
    try {
      if (!fresh) candidate = sessionStorage.getItem('inkling-draft-client');
    } catch {
      /* An ephemeral ID still safely isolates this tab. */
    }
    let id = Id.safeParse(candidate).success ? candidate! : crypto.randomUUID();
    while (true) {
      const acquired = await new Promise<boolean>((resolve, reject) => {
        void navigator.locks
          .request(lockName(id), { ifAvailable: true }, async (lock) => {
            resolve(Boolean(lock));
            if (lock)
              await new Promise<void>((resolveRelease) => {
                releaseOwner = resolveRelease;
              });
          })
          .catch(reject);
      });
      if (acquired) break;
      id = crypto.randomUUID();
    }
    try {
      sessionStorage.setItem('inkling-draft-client', id);
    } catch {
      /* Recovery lists remain available via IndexedDB. */
    }
    return id;
  })();
  return owner;
}

async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('inkling-drafts', 1);
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error('浏览器恢复副本打开超时。'));
    }, 2500);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('outbox', {
        keyPath: ['workspaceId', 'articleId', 'clientId'],
      });
      store.createIndex('article', ['workspaceId', 'articleId']);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error('浏览器恢复副本不可用。'));
    };
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(
        'outbox',
        mode,
        mode === 'readwrite' ? { durability: 'strict' } : undefined,
      );
      let result: T;
      const timer = setTimeout(() => {
        tx.abort();
        reject(new Error('浏览器恢复副本写入超时。'));
      }, 2500);
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(result);
      };
      tx.onabort = tx.onerror = () => {
        clearTimeout(timer);
        reject(tx.error ?? new Error('浏览器恢复副本事务失败。'));
      };
      try {
        run(tx.objectStore('outbox'), (value) => {
          result = value;
        });
      } catch (error) {
        clearTimeout(timer);
        tx.abort();
        reject(error);
      }
    });
  } finally {
    db.close();
  }
}
export async function listDrafts(
  workspaceId: string,
  articleId: string,
): Promise<RecoveryChoice[]> {
  const values = await transaction<unknown[]>('readonly', (store, done) => {
    const request = store.index('article').getAll([workspaceId, articleId]);
    request.onsuccess = () => done(request.result as unknown[]);
  });
  const locks = await navigator.locks.query();
  return values
    .map(parseRecord)
    .map((record) => ({
      record,
      active:
        locks.held?.some((lock) => lock.name === lockName(record.clientId)) ??
        false,
    }))
    .sort((a, b) => b.record.updatedAt - a.record.updatedAt);
}
export async function putDraft(record: DraftRecord, clean: boolean) {
  await transaction<void>('readwrite', (store, done) => {
    if (clean)
      store.delete([record.workspaceId, record.articleId, record.clientId]);
    else store.put(record);
    done();
  });
}
export async function removeRecoveredSource(
  record: DraftRecord,
  currentClient: string,
) {
  if (record.clientId === currentClient) return;
  const locks = await navigator.locks.query();
  if (locks.held?.some((lock) => lock.name === lockName(record.clientId)))
    return;
  await transaction<void>('readwrite', (store, done) => {
    const key = [record.workspaceId, record.articleId, record.clientId];
    const request = store.get(key);
    request.onsuccess = () => {
      // A newly opened source tab may have saved since the list was shown.
      if (
        request.result &&
        stableJson(parseRecord(request.result)) === stableJson(record)
      )
        store.delete(key);
      done();
    };
  });
}

export async function discardDraft(record: DraftRecord, currentClient: string) {
  const removeExact = async () => {
    const removed = await transaction<boolean>('readwrite', (store, done) => {
      const key = [record.workspaceId, record.articleId, record.clientId];
      const request = store.get(key);
      request.onsuccess = () => {
        let same = false;
        try {
          same =
            Boolean(request.result) &&
            stableJson(parseRecord(request.result)) === stableJson(record);
        } catch {
          /* Unknown records remain intact. */
        }
        if (same) store.delete(key);
        done(same);
      };
    });
    if (!removed) throw new Error('副本已变化或已被处理，请重新查看后决定。');
  };
  if (record.clientId === currentClient) return removeExact();
  await navigator.locks.request(
    lockName(record.clientId),
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw new Error('所属标签页仍在使用这份副本，请先关闭该标签页。');
      await removeExact();
    },
  );
}
