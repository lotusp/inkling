import { useState } from 'react';
import {
  RevisionDetail,
  RevisionPage,
  type RevisionInfo,
} from '@inkling/contracts';
import { api } from './api';
export function DamagedArticlePanel({ articleId }: { articleId: string }) {
  const [items, setItems] = useState<RevisionInfo[]>([]),
    [cursor, setCursor] = useState<number | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const path = '/api/articles/' + articleId + '/revisions';
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : '无法读取版本，请保留原文件。',
      );
    } finally {
      setBusy(false);
    }
  };
  const load = async (before?: number) => {
    const result = RevisionPage.parse(
      await api(
        path + '?all=true&limit=20' + (before ? '&beforeSeq=' + before : ''),
      ),
    );
    setItems((old) => (before ? [...old, ...result.items] : result.items));
    setCursor(result.nextBeforeSeq);
  };
  const download = async (revisionId: string) => {
    const revision = RevisionDetail.parse(await api(path + '/' + revisionId));
    const payload = {
      format: 'inkling-verified-revision',
      version: 1,
      articleId: revision.articleId,
      revisionId: revision.revisionId,
      seq: revision.seq,
      document: revision.document,
      contentHash: revision.contentHash,
    };
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json;charset=utf-8',
        }),
      ),
      link = document.createElement('a');
    link.href = url;
    link.download = `inkling-verified-revision-${revision.seq}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="recovery-panel" aria-label="损坏稿件救援">
      <h2>稿件需要检查</h2>
      <p>
        已停止写入，不会自动回退或替换正文。可以下载仍通过校验的旧版本；损坏版本不会导出。
      </p>
      <button disabled={busy} onClick={() => void run(() => load())}>
        查看可救援版本
      </button>
      {message && <p role="alert">{message}</p>}
      <ul>
        {items.map((r) => (
          <li key={r.revisionId}>
            #{r.seq} {r.name} · {new Date(r.createdAt).toLocaleString()}{' '}
            <button
              disabled={busy}
              onClick={() => void run(() => download(r.revisionId))}
            >
              下载版本 #{r.seq}
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <button disabled={busy} onClick={() => void run(() => load(cursor))}>
          加载更早版本
        </button>
      )}
    </section>
  );
}
