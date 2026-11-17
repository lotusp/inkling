export class ArticleError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
      .join(',') +
    '}'
  );
}

export interface HistoryPolicy {
  warningBytes: number;
  limitBytes: number;
}
export const DEFAULT_HISTORY_POLICY: Readonly<HistoryPolicy> = Object.freeze({
  warningBytes: 64 * 1024 * 1024,
  limitBytes: 256 * 1024 * 1024,
});
export function validateHistoryPolicy(
  policy: HistoryPolicy,
): Readonly<HistoryPolicy> {
  if (
    !Number.isSafeInteger(policy.warningBytes) ||
    !Number.isSafeInteger(policy.limitBytes) ||
    policy.warningBytes <= 0 ||
    policy.limitBytes < policy.warningBytes
  )
    throw new Error('Invalid article history policy');
  return Object.freeze({ ...policy });
}
export function checkHistoryCapacity(
  used: number,
  additional: number,
  policy: HistoryPolicy,
) {
  if (used + additional > policy.limitBytes)
    throw new ArticleError(
      'HISTORY_LIMIT',
      507,
      '历史容量已达上限，请先下载恢复稿。',
      { usedBytes: used, limitBytes: policy.limitBytes },
    );
}
