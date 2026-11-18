import { useState, useEffect, useRef, useCallback } from 'react';
import { RevisionPage, type RevisionInfo } from '@inkling/contracts';
import { api } from './api';
export function versionDate(time: number) {
  const date = new Date(time);
  const today = new Date(),
    yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const day =
    date.toDateString() === today.toDateString()
      ? '今天'
      : date.toDateString() === yesterday.toDateString()
        ? '昨天'
        : date.toLocaleDateString('zh-CN');
  return (
    day +
    ' ' +
    date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  );
}
export function versionName(r: RevisionInfo) {
  return (
    r.name ||
    (r.kind === 'initial'
      ? '初稿'
      : r.kind === 'restore'
        ? '恢复的稿件'
        : '自动备份')
  );
}
export function versionId(r: RevisionInfo) {
  const d = new Date(r.createdAt);
  const stamp = [
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  ]
    .map((n) => String(n).padStart(2, '0'))
    .join('');
  return 'V' + stamp + '-' + r.seq;
}
export function matchingVersions(items: RevisionInfo[], query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return items;
  return items.filter((r) => {
    const d = new Date(r.createdAt);
    return [
      versionName(r),
      versionId(r),
      '#' + r.seq,
      versionDate(r.createdAt),
      d.toLocaleDateString('zh-CN'),
      d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日',
      [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-'),
    ]
      .join(' ')
      .toLowerCase()
      .includes(term);
  });
}
export function useRevisionIndex(
  path: string,
  visible: boolean,
  headRevisionId: string,
) {
  const [items, setItems] = useState<RevisionInfo[]>([]);
  const [listError, setListError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    const rows: RevisionInfo[] = [];
    let before: number | null = null;
    try {
      do {
        const page = RevisionPage.parse(
          await api(
            path +
              '/revisions?all=true&limit=100' +
              (before ? '&beforeSeq=' + before : ''),
          ),
        );
        if (ticket !== generation.current) return;
        rows.push(...page.items);
        before = page.nextBeforeSeq;
      } while (before);
      setItems(rows);
      setListError('');
    } catch (e) {
      if (ticket === generation.current)
        setListError(e instanceof Error ? e.message : '历史加载失败，请重试。');
    }
  }, [path]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    if (visible) void load();
    return invalidate;
  }, [visible, load, headRevisionId, invalidate]);
  return { items, listError, load };
}
