import { useEffect, useRef, useState } from 'react';
import type { ArticleDocument } from '@inkling/contracts';
import { DeskDialog } from './DeskDialog';
import { readArticleFile, type ArticleImportPreview } from './article-import';

export function ArticleImport({
  disabled,
  confirm,
}: {
  disabled: boolean;
  confirm: (document: ArticleDocument) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ArticleImportPreview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) return;
    let active = true;
    void readArticleFile(file)
      .then((result) => {
        if (active) setPreview(result);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : '文件读取失败，请重新选择。',
          );
      });
    return () => {
      active = false;
    };
  }, [file]);
  const choose = () => picker.current?.click();
  return (
    <>
      <button className="import-file" disabled={disabled} onClick={choose}>
        从文件导入
      </button>
      <input
        hidden
        ref={picker}
        type="file"
        accept=".txt"
        onChange={(event) => {
          const next = event.target.files?.[0];
          event.target.value = '';
          if (!next) return;
          setPreview(null);
          setError('');
          setFile(next);
        }}
      />
      {file && (
        <DeskDialog title="导入文章" close={() => setFile(null)}>
          {preview ? (
            <>
              <h3>{preview.document.title}</h3>
              <pre className="import-preview" aria-label="正文预览">
                {preview.text}
              </pre>
            </>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : (
            <p role="status">正在读取文件…</p>
          )}
          <footer>
            <button type="button" onClick={() => setFile(null)}>
              取消
            </button>
            {error && (
              <button type="button" onClick={choose}>
                重新选择文件
              </button>
            )}
            {preview && (
              <button
                type="button"
                className="primary"
                disabled={disabled}
                onClick={() => {
                  setFile(null);
                  confirm(preview.document);
                }}
              >
                确认导入
              </button>
            )}
          </footer>
        </DeskDialog>
      )}
    </>
  );
}
