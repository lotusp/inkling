import { currentCsrf, connectWorkspace } from './access';
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<unknown> {
  let csrf = currentCsrf();
  if (method !== 'GET' && !csrf) csrf = await connectWorkspace();
  const response = await fetch(path, {
    method,
    headers:
      method === 'GET'
        ? {}
        : { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const fields = value && typeof value === 'object' ? value : {};
    throw new ApiError(
      response.status,
      'code' in fields && typeof fields.code === 'string'
        ? fields.code
        : 'REQUEST_FAILED',
      'message' in fields && typeof fields.message === 'string'
        ? fields.message
        : '请求失败，请保留输入后重试。',
    );
  }
  return value;
}
