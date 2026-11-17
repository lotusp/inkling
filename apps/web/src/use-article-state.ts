import { useCallback, useEffect, useRef, useState } from 'react';
import { ArticleListItem, type ArticleState } from '@inkling/contracts';
import { api } from './api';
export function useArticleState() {
  const current = useRef<ArticleState | 'unknown'>('unknown');
  const [state, setState] = useState(current.current);
  const attempt = useRef(0);
  const block = useCallback(() => {
    attempt.current++;
    current.current = 'unknown';
    setState('unknown');
  }, []);
  const check = useCallback(async (id: string) => {
    const ticket = ++attempt.current;
    try {
      const metadata = ArticleListItem.parse(
        await api(`/api/articles/${id}/metadata`),
      );
      if (metadata.articleId !== id)
        throw new Error('文章状态与当前稿件不匹配。');
      if (ticket !== attempt.current)
        throw new Error('状态核对已失效，请重新核对。');
      current.current = metadata.state;
      setState(metadata.state);
      return metadata;
    } catch (error) {
      if (ticket === attempt.current) {
        current.current = 'unknown';
        setState('unknown');
      }
      throw error;
    }
  }, []);
  useEffect(
    () => () => {
      attempt.current++;
    },
    [],
  );
  return { current, state, check, block };
}
