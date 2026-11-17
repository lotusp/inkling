import type { DocumentNode } from '@inkling/contracts';
import type { RecoveryChoice } from './draft-store';
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
}: {
  choices: RecoveryChoice[];
  busy: boolean;
  message: string;
  recover: (choice: RecoveryChoice) => Promise<void>;
}) {
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
          <button disabled={busy} onClick={() => void recover(choice)}>
            {busy ? '正在核对…' : '恢复此草稿'}
          </button>
        </div>
      ))}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}
