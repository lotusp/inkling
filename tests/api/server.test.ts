import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../../apps/server/src/server';
import { HealthResponse } from '../../packages/contracts/src/index';
const apps: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const make = () => {
  const app = createServer();
  apps.push(app);
  return app;
};
describe('local service', () => {
  it('WORKBENCH-START-001 returns the health contract', async () => {
    const response = await make().inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(HealthResponse.parse(response.json())).toEqual({
      status: 'ok',
      application: 'inkling',
      apiVersion: 1,
    });
  });
  it('WORKBENCH-HOST-007 rejects a nonlocal host', async () => {
    const response = await make().inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'attacker.example' },
    });
    expect(response.statusCode).toBe(403);
  });
  it('WORKBENCH-HOST-007 keeps unknown APIs as JSON 404', async () => {
    const response = await make().inject({
      method: 'GET',
      url: '/api/not-a-route',
    });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
  });
});
