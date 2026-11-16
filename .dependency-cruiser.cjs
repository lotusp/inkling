module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'web-no-backend',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^(apps/server|packages/(core|adapters))/' },
    },
    {
      name: 'contracts-no-business',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: { path: '^(apps/|packages/(core|adapters)/)' },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      from: { path: '^packages/core/src/domain/' },
      to: {
        path: '^(apps/|packages/adapters/|packages/core/src/application/)',
      },
    },
    {
      name: 'domain-no-runtime',
      severity: 'error',
      from: { path: '^packages/core/src/domain/' },
      to: { dependencyTypes: ['core', 'npm', 'npm-dev', 'npm-optional'] },
    },
    {
      name: 'core-no-adapters',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: { path: '^(apps/|packages/adapters/)' },
    },
    {
      name: 'no-cross-package-internals',
      severity: 'error',
      from: { path: '^(apps/[^/]+|packages/[^/]+)/' },
      to: {
        path: '^(apps|packages)/',
        pathNot: '^$1/',
        dependencyTypesNot: ['aliased-workspace'],
      },
    },
    {
      name: 'no-unresolved',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    combinedDependencies: true,
    exclude: { path: '(^|/)dist/' },
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
    },
  },
};
