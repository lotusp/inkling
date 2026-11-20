import { build } from 'esbuild';
await build({
  entryPoints: ['apps/server/src/main.ts'],
  outfile: 'apps/server/dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: ['fastify', '@fastify/static', 'better-sqlite3', 'sharp'],
});
