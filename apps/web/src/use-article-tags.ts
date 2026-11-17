import { useEffect, useRef, useState } from 'react';
import {
  ArticleListItem,
  ArticleTags,
  UpdateArticleMetadataResult,
  type UpdateArticleMetadataCommand,
} from '@inkling/contracts';
import { api, ApiError } from './api';
import { connectWorkspace } from './access';
interface PendingTags {
  command: UpdateArticleMetadataCommand;
  seq: number;
  epoch: number;
}
export function useArticleTags(
  articleId: string,
  onConfirmed: (metadata: ArticleListItem) => void,
) {
  const [base, setBase] = useState<ArticleListItem | null>(null),
    [remote, setRemote] = useState<ArticleListItem | null>(null);
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<PendingTags | null>(null),
    [attempt, setAttempt] = useState(0);
  const working = useRef(false),
    sequence = useRef(0),
    epoch = useRef(0),
    composing = useRef(false);
  const endpoint = '/api/articles/' + articleId + '/metadata';
  useEffect(() => {
    let active = true;
    void api(endpoint)
      .then((value) => {
        const metadata = ArticleListItem.parse(value);
        if (!active) return;
        setBase(metadata);
        setText(metadata.tags.join('\n'));
        setMessage('');
      })
      .catch((error) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : '无法读取标签，请重试。',
          );
      });
    return () => {
      active = false;
    };
  }, [endpoint, attempt]);
  function change(value: string) {
    sequence.current++;
    setText(value);
    setMessage('');
  }
  function compositionStart() {
    composing.current = true;
    epoch.current++;
  }
  function compositionEnd() {
    composing.current = false;
  }
  async function reload() {
    if (working.current || pending) return;
    if (composing.current) {
      setMessage('请先完成标签选词。');
      return;
    }
    working.current = true;
    setBusy(true);
    const seq = sequence.current,
      composition = epoch.current;
    try {
      const next = ArticleListItem.parse(await api(endpoint));
      setRemote(next);
      if (seq !== sequence.current || composition !== epoch.current) {
        setMessage('读取期间输入已变化，原标签输入已保留，请重新确认载入。');
        return;
      }
      setBase(next);
      setText(next.tags.join('\n'));
      sequence.current++;
      setConflict(false);
      setMessage('已载入最新标签。');
      onConfirmed(next);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '无法读取标签，请重试。',
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (working.current || !base || conflict) return;
    if (composing.current) {
      setMessage('请先完成标签选词。');
      return;
    }
    let operation = pending;
    if (!operation) {
      const parsed = ArticleTags.safeParse(
        text.trim() === '' ? [] : text.split('\n'),
      );
      if (!parsed.success) {
        setMessage('最多 10 个标签，每个 1–30 个字符；请去掉空行。');
        return;
      }
      operation = {
        command: {
          mutationId: crypto.randomUUID(),
          baseMetadataVersion: base.metadataVersion,
          tags: parsed.data,
        },
        seq: sequence.current,
        epoch: epoch.current,
      };
      setPending(operation);
    }
    working.current = true;
    setBusy(true);
    setMessage('');
    const checkResult = (value: unknown) => {
      const result = UpdateArticleMetadataResult.parse(value);
      if (
        result.mutationId !== operation.command.mutationId ||
        result.metadata.articleId !== articleId ||
        JSON.stringify(result.metadata.tags) !==
          JSON.stringify(operation.command.tags)
      )
        throw new Error('标签确认与本次请求不匹配，原输入已保留。');
      return result;
    };
    let writeRejected = false;
    try {
      let result: UpdateArticleMetadataResult | undefined;
      if (pending) {
        await connectWorkspace();
        try {
          result = checkResult(
            await api('/api/mutations/' + operation.command.mutationId),
          );
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
          const current = ArticleListItem.parse(await api(endpoint));
          if (current.metadataVersion !== operation.command.baseMetadataVersion)
            throw new ApiError(
              409,
              'METADATA_CONFLICT',
              '标签已被更新，请查看最新标签后重新编辑。',
            );
        }
      }
      if (!result) {
        let value: unknown;
        try {
          value = await api(endpoint, 'PUT', operation.command);
        } catch (error) {
          // A definite rejection of this PUT is not an unknown network outcome.
          writeRejected =
            error instanceof ApiError &&
            [400, 401, 403, 404, 409, 422].includes(error.status);
          throw error;
        }
        result = checkResult(value);
      }
      const current = ArticleListItem.parse(await api(endpoint));
      setPending(null);
      setBase(result.metadata);
      onConfirmed(current);
      if (current.metadataVersion !== result.metadata.metadataVersion) {
        setRemote(current);
        setConflict(true);
        setMessage('服务器已有更新的标签，当前输入已保留。');
        return;
      }
      setBase(current);
      setRemote(null);
      if (
        sequence.current === operation.seq &&
        epoch.current === operation.epoch &&
        !composing.current
      ) {
        setText(current.tags.join('\n'));
        setMessage('标签已保存。');
      } else setMessage('已确认提交，较新的标签输入仍未保存。');
    } catch (error) {
      // A rejected retry cannot settle an earlier request whose outcome is unknown.
      if (writeRejected && !pending) setPending(null);
      if (error instanceof ApiError && error.code === 'METADATA_CONFLICT') {
        setPending(null);
        setConflict(true);
        try {
          setRemote(ArticleListItem.parse(await api(endpoint)));
        } catch {
          /* Conflict remains blocked until explicit successful reload. */
        }
      }
      setMessage(
        error instanceof Error
          ? error.message
          : '无法确认标签保存，请核对后重试。',
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return {
    base,
    remote,
    text,
    busy,
    message,
    conflict,
    pending: !!pending,
    dirty: !!pending || (!!base && text !== base.tags.join('\n')),
    change,
    compositionStart,
    compositionEnd,
    save,
    reload,
    canClose: () => {
      if (composing.current) {
        setMessage('请先完成标签选词。');
        return false;
      }
      return !working.current && !pending;
    },
    retryLoad: () => setAttempt((value) => value + 1),
  };
}
