import { afterEach, expect, it } from 'vitest';
import { createServer } from '../../apps/server/src/server';
const origin = 'http://127.0.0.1:4317';
const headers = { host: '127.0.0.1:4317', origin };
const apps: ReturnType<typeof createServer>[] = [];
function setup(now?: () => number) {
  const app = createServer({
    access: {
      origin,
      workspaceId: 'workspace-fixture',
      bootstrapToken: 'b'.repeat(64),
      localSecret: 's'.repeat(64),
      now,
    },
  });
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
it('WORKSPACE-AUTH-003 exchanges a one-use token and protects workspace reads', async () => {
  const app = setup();
  expect(
    (await app.inject({ url: '/api/workspace', headers })).statusCode,
  ).toBe(401);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/exchange',
    headers,
    payload: { token: 'b'.repeat(64) },
  });
  expect(login.statusCode).toBe(200);
  expect(login.headers['set-cookie']).toContain('HttpOnly');
  expect(login.headers['set-cookie']).toContain('SameSite=Strict');
  const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
  expect(
    (
      await app.inject({
        url: '/api/workspace',
        headers: { ...headers, cookie },
      })
    ).json(),
  ).toEqual({ workspaceId: 'workspace-fixture' });
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/exchange',
        headers,
        payload: { token: 'b'.repeat(64) },
      })
    ).statusCode,
  ).toBe(401);
});
it('WORKSPACE-AUTH-003 expires tokens and sessions and reissues only through local secret', async () => {
  let now = 100;
  const app = setup(() => now);
  now += 300001;
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/exchange',
        headers,
        payload: { token: 'b'.repeat(64) },
      })
    ).statusCode,
  ).toBe(401);
  const renewed = await app.inject({
    method: 'POST',
    url: '/api/local/access',
    headers: { host: headers.host, 'x-inkling-local-secret': 's'.repeat(64) },
    payload: {},
  });
  expect(renewed.statusCode).toBe(200);
  const url = new URL(renewed.json<{ url: string }>().url);
  const token = new URLSearchParams(url.hash.slice(1)).get('access');
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/exchange',
    headers,
    payload: { token },
  });
  expect(login.statusCode).toBe(200);
  now += 12 * 60 * 60 * 1000 + 1;
  expect(
    (
      await app.inject({
        url: '/api/auth/session',
        headers: {
          ...headers,
          cookie: String(login.headers['set-cookie']).split(';')[0] ?? '',
        },
      })
    ).statusCode,
  ).toBe(401);
});
it('WORKSPACE-CSRF-004 rejects foreign, null and missing exchange origins and browser admin requests', async () => {
  const app = setup();
  for (const originValue of ['https://evil.invalid', 'null', undefined]) {
    const result = await app.inject({
      method: 'POST',
      url: '/api/auth/exchange',
      headers: {
        host: headers.host,
        ...(originValue ? { origin: originValue } : {}),
      },
      payload: { token: 'b'.repeat(64) },
    });
    expect(result.statusCode).toBe(403);
  }
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/local/access',
        headers: { ...headers, 'x-inkling-local-secret': 's'.repeat(64) },
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/local/access',
        headers: { host: headers.host },
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
});
it('WORKSPACE-CSRF-004 requires CSRF on authenticated commands and forbids cross-origin reads', async () => {
  const app = setup();
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/exchange',
    headers,
    payload: { token: 'b'.repeat(64) },
  });
  expect(login.statusCode).toBe(200);
  const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
  const csrf = login.json<{ csrfToken: string }>().csrfToken;
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { ...headers, cookie },
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        url: '/api/workspace',
        headers: { ...headers, origin: 'http://127.0.0.1:9999', cookie },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { ...headers, cookie, 'x-csrf-token': csrf },
        payload: {},
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (
      await app.inject({
        url: '/api/workspace',
        headers: { ...headers, cookie },
      })
    ).statusCode,
  ).toBe(401);
});
it('WORKSPACE-AUTH-003 rejects a token with multibyte characters without crashing', async () => {
  const response = await setup().inject({
    method: 'POST',
    url: '/api/auth/exchange',
    headers,
    payload: { token: '中'.repeat(64) },
  });
  expect(response.statusCode).toBe(401);
});
