import { useCallback, useEffect, useState } from 'react';
import { HealthResponse } from '@inkling/contracts';

export function useHealth() {
  const [status, setStatus] = useState<
    'checking' | 'connected' | 'unavailable'
  >('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 2500);
    setStatus('checking');
    const check = async () => {
      try {
        const response = await fetch('/api/health', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Health request failed');
        HealthResponse.parse(await response.json());
        if (active) setStatus('connected');
      } catch {
        if (active) setStatus('unavailable');
      } finally {
        clearTimeout(timer);
      }
    };
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { status, retry };
}
