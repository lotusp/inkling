import { useCallback, useEffect, useState } from 'react';
import { AuthSession } from '@inkling/contracts';
let pending: Promise<string> | undefined;
let csrfToken: string | undefined;
export function currentCsrf() {
  return csrfToken;
}
export function connectWorkspace(): Promise<string> {
  if (pending) {
    if (new URLSearchParams(window.location.hash.slice(1)).has('access'))
      return pending.catch(() => undefined).then(() => connectWorkspace());
    return pending;
  }
  const token = new URLSearchParams(window.location.hash.slice(1)).get(
    'access',
  );
  if (token)
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    );
  pending = (async () => {
    const response = await fetch(
      token ? '/api/auth/exchange' : '/api/auth/session',
      token
        ? {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
            signal: AbortSignal.timeout(5000),
          }
        : { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new Error('请从终端的本机访问链接重新连接。');
    const session = AuthSession.parse(await response.json());
    csrfToken = session.csrfToken;
    return session.csrfToken;
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
export function useAccess() {
  const [status, setStatus] = useState<
    'checking' | 'connected' | 'disconnected'
  >('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const changed = () => {
      if (new URLSearchParams(window.location.hash.slice(1)).has('access')) {
        setStatus('checking');
        setAttempt((value) => value + 1);
      }
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    let active = true;
    void connectWorkspace()
      .then(() => {
        if (active) setStatus('connected');
      })
      .catch(() => {
        if (active) setStatus('disconnected');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const reconnect = useCallback(() => setAttempt((x) => x + 1), []);
  return { status, reconnect };
}
