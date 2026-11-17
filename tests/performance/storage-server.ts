// Isolated benchmark entry point; production has no metrics/control endpoint.
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { randomBytes } from 'node:crypto';
import { SqliteWorkspace } from '@inkling/adapters';
import { ArticleService } from '@inkling/core';
import { createServer } from '../../apps/server/src/server';
const path = process.argv[2];
if (!path) throw new Error('Temporary workspace required');
const started = performance.now(),
  workspace = SqliteWorkspace.open(path),
  service = new ArticleService(workspace.articles());
const startupMs = performance.now() - started;
const access = {
  origin: 'http://127.0.0.1:0',
  workspaceId: workspace.id,
  workspaceInfo: () => service.workspace(),
  bootstrapToken: randomBytes(32).toString('hex'),
  localSecret: randomBytes(32).toString('hex'),
};
const app = createServer({ access, articles: () => service });
app.addHook('onClose', async () => {
  workspace.close();
});
const histogram = monitorEventLoopDelay({ resolution: 1 });
process.on('message', (value: unknown) => {
  if (!value || typeof value !== 'object' || !('command' in value)) return;
  if (value.command === 'begin') {
    histogram.reset();
    histogram.enable();
    process.send?.({ type: 'began' });
  }
  if (value.command === 'measure')
    setImmediate(() => {
      histogram.disable();
      process.send?.({
        type: 'measured',
        p95Ms: histogram.percentile(95) / 1e6,
        maxMs: histogram.max / 1e6,
        samples: histogram.count,
      });
    });
  if (value.command === 'stop') {
    histogram.disable();
    void app.close().then(() => {
      process.disconnect();
    });
  }
});
process.once('SIGTERM', () => {
  histogram.disable();
  void app.close().then(() => process.disconnect());
});
const origin = await app.listen({ host: '127.0.0.1', port: 0 });
access.origin = origin;
process.send?.({
  type: 'ready',
  origin,
  token: access.bootstrapToken,
  startupMs,
});
