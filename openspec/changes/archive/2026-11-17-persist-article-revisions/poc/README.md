# Storage design experiments

本目录仅为 C02 设计实验。脚本在临时目录写入合成数据并自行清理，不作为产品存储适配器使用。

在仓库根目录，使用 `.node-version` 指定的 Node，先安装现有项目依赖以供正文 schema 验证，再运行：

```bash
npm ci --prefix openspec/changes/archive/2026-11-17-persist-article-revisions/poc
INKLING_POC_DRIVER="$PWD/openspec/changes/archive/2026-11-17-persist-article-revisions/poc/node_modules/better-sqlite3" \
  node openspec/changes/archive/2026-11-17-persist-article-revisions/poc/storage-comparison.mjs
node openspec/changes/archive/2026-11-17-persist-article-revisions/poc/document-roundtrip.mjs
```

也可在临时目录按本目录 package-lock 安装，并将 INKLING_POC_DRIVER 指向该目录的 better-sqlite3。记录日志在相邻 evidence/，完整观察与边界见仓库 docs/validation/article-storage-poc.md。归档后按实际目录替换上述路径；正文脚本仍从仓库根目录执行。

不把脚本中的简单数值修订 ID、仅一篇文档、文件 manifest 重写、缺省错误信息等实验简化直接照搬到产品；正式契约以 design/specs 为准。
