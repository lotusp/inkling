import { it, expect } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const repo = process.cwd();
function graph(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'inkling-boundaries-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      const path = join(dir, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
    mkdirSync(join(dir, 'packages/contracts/src'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/web/package.json'),
      JSON.stringify({
        name: '@inkling/web',
        private: true,
        type: 'module',
        dependencies: { '@inkling/contracts': 'workspace:*' },
      }),
    );
    writeFileSync(
      join(dir, 'packages/contracts/package.json'),
      JSON.stringify({
        name: '@inkling/contracts',
        type: 'module',
        exports: { '.': './src/index.ts' },
      }),
    );
    mkdirSync(join(dir, 'node_modules/@inkling'), { recursive: true });
    symlinkSync(
      join(dir, 'packages/contracts'),
      join(dir, 'node_modules/@inkling/contracts'),
      'dir',
    );
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        workspaces: JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
          .workspaces,
      }),
    );
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
      }),
    );
    cpSync(
      join(repo, '.dependency-cruiser.cjs'),
      join(dir, '.dependency-cruiser.cjs'),
    );
    const result = spawnSync(
      process.execPath,
      [
        resolve(
          repo,
          'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs',
        ),
        'apps',
        'packages',
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err-long',
      ],
      { cwd: dir, encoding: 'utf8', timeout: 10000 },
    );
    if (result.error) throw result.error;
    return { code: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
it.each([
  [
    'web-no-backend',
    {
      'apps/web/src/a.ts':
        "import { value } from '../../server/src/value'; export { value };",
      'apps/server/src/value.ts': 'export const value=1;',
    },
  ],
  [
    'contracts-no-business',
    {
      'apps/web/src/a.ts': 'export const x=1;',
      'packages/contracts/src/index.ts':
        "export { x } from '../../../apps/web/src/a';",
    },
  ],
  [
    'no-cross-package-internals',
    {
      'apps/web/src/a.ts':
        "export { value } from '../../../packages/contracts/src/index';",
      'packages/contracts/src/index.ts': 'export const value=1;',
    },
  ],
  [
    'no-cycles',
    {
      'apps/web/src/a.ts': "export { b } from './b'; export const a=1;",
      'apps/web/src/b.ts': "export { a } from './a'; export const b=1;",
    },
  ],
] as [string, Record<string, string>][])(
  'DEVELOPMENT-BOUNDARY-002 rejects %s',
  (rule, files) => {
    const result = graph(files);
    expect(result.output).toContain(rule);
    expect(result.code).not.toBe(0);
  },
);
it('DEVELOPMENT-BOUNDARY-002 allows a public workspace contract import', () => {
  const result = graph({
    'apps/web/src/a.ts': "export { value } from '@inkling/contracts';",
    'packages/contracts/src/index.ts': 'export const value=1;',
  });
  expect(result.output).not.toContain('error');
  expect(result.code).toBe(0);
});
