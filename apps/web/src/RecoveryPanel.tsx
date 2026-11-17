import type { DocumentNode } from '@inkling/contracts';
import { useState } from 'react';
import type { RecoveryChoice } from './draft-store';
import { downloadRescue } from './draft-rescue';
function preview(doc: DocumentNode) {
  const stack = [doc];
  let text = '';
  while (stack.length && text.length < 180) {
    const node = stack.pop();
    if (node?.text) text += node.text + ' ';
    if (node?.content) stack.push(...[...node.content].reverse());
  }
  return text.slice(0, 180) || '空白正文';
}
export function RecoveryPanel({
  choices,
  busy,
  message,
  recover,
  keepServer,
  discard,
  clientId,
}: {
  choices: RecoveryChoice[];
  busy: boolean;
  message: string;
  recover: (choice: RecoveryChoice) => Promise<void>;
  keepServer: () => Promise<void>;
  discard: (choice: RecoveryChoice) => Promise<boolean>;
  clientId: string | undefined;
}) {
  const [discarding, setDiscarding] = useState<RecoveryChoice | null>(null);
  if (!choices.length) return null;
  return (
    <section className="recovery-panel" aria-label="待恢复草稿">
      <h2>发现尚未确认保存的草稿</h2>
      <p>
        下方正文是服务器版本。选择一个副本后，会先核对保存结果和最新版本，再恢复输入。
      </p>
      {choices.map((choice) => (
        <div className="recovery-card" key={choice.record.clientId}>
          <h3>{choice.record.draft.document.title || '未命名草稿'}</h3>
          <p>
            {new Date(choice.record.updatedAt).toLocaleString()} ·{' '}
            {choice.active ? '所属标签页仍在打开' : '所属标签页已关闭'}
          </p>
          <p className="draft-preview">
            {preview(choice.record.draft.document.doc)}
          </p>
          <button
            disabled={busy}
            onClick={() => {
              setDiscarding(null);
              void recover(choice);
            }}
          >
            {busy ? '正在核对…' : '恢复此草稿'}
          </button>
          <button onClick={() => downloadRescue(choice.record)}>
            下载此副本
          </button>
          <button
            disabled={
              busy || (choice.active && choice.record.clientId !== clientId)
            }
            onClick={() => setDiscarding(choice)}
          >
            放弃此副本
          </button>
        </div>
      ))}
      {discarding && (
        <div role="group" aria-label="放弃副本确认">
          <p>
            仅删除这份浏览器恢复副本，不撤回服务器已提交的内容。需要保留时请先下载。
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void discard(discarding).then(() => setDiscarding(null))
            }
          >
            确认放弃此副本
          </button>
          <button disabled={busy} onClick={() => setDiscarding(null)}>
            取消放弃
          </button>
        </div>
      )}
      {message && <p role="alert">{message}</p>}
      <p>也可以使用下方的服务器版本继续写作，未选择的副本会保留供以后恢复。</p>
      <button
        disabled={busy}
        onClick={() => {
          setDiscarding(null);
          void keepServer();
        }}
      >
        保留副本，使用服务器版本
      </button>
    </section>
  );
}
