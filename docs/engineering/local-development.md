# 本地开发与检查

更新日期：2026-11-16。适用：bootstrap-local-workbench 工程基础。现阶段可编辑临时标题与正文、查看服务状态；尚无内容保存或 AI 调用，刷新会清空内容。

## 环境与安装

Node 版本见仓库 `.node-version`（22.22.2），pnpm 版本由 package.json 的 packageManager 固定（10.34.9）。先用本机版本管理器切换到该 Node，再执行：

```bash
node --version
corepack pnpm install --frozen-lockfile
corepack pnpm start
```

安装完成后，`start` 一次完成构建与启动，打开 `http://127.0.0.1:4317`。Ctrl+C 停止，关闭浏览器页面不停止服务。无需模型、数据库或其他服务账号。

若没有 Corepack，可按 pnpm 官方安装方法安装 packageManager 指定版本，然后使用等价的 `pnpm` 命令。仓库不修改系统 Node 或全局包管理器配置。

默认端口被占用时会明确失败，不自动切换。可以先停止原服务，或者显式运行 `PORT=4320 corepack pnpm start`。服务只绑定 127.0.0.1；不开放局域网访问。PORT=0 主要供进程测试取得独立端口，实际地址以启动输出为准。

## 开发模式

```bash
corepack pnpm dev
```

同时启动 Vite（4317）与 Node 开发服务（4318），Vite 代理 `/api` 请求。Ctrl+C 停止两个开发进程。`start` 使用一个服务提供构建页面与 API，与开发模式不同；验收使用构建产物，避免只验证开发服务器。

## 检查入口

```bash
corepack pnpm verify
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

verify 依次执行格式、lint、类型、依赖边界、构建、API/进程/架构测试、Harness 回归、文档和 OpenSpec 检查。浏览器测试启动独立的 4329 端口服务，结束后停止它，不复用已有工作台实例。首次使用需安装对应 Chromium；Linux CI 安装时加 `--with-deps`。

有针对性地定位问题时可以运行：

| 命令 | 检查内容 |
| --- | --- |
| `corepack pnpm typecheck` | TypeScript strict |
| `corepack pnpm lint` | TypeScript 与 React Hooks 规则 |
| `corepack pnpm format:check` | 新工程源码和配置格式，不改历史原型 |
| `corepack pnpm check:architecture` | 越层、跨包内部和循环依赖 |
| `corepack pnpm test` | API、构建进程、架构正负例；进程测试前先 build |
| `corepack pnpm check:docs` | 本地文档路径与 docs 根目录规则 |
| `corepack pnpm check:specs` | 当前规格/变更与历史任务校验、单 active change |

GitHub Actions 复用 verify 和 E2E，不调用模型、不发布应用。CI 运行结果与本地验证分别记录。

## 模块与工具选择

当前仅有 `apps/web`、`apps/server`、`packages/contracts`。contracts 导出健康响应 schema，web 校验真实响应，server 提供它；后续业务模块出现时再建立 core/adapters。

React 19 与 Tiptap 3 提供编辑，Vite 8 构建 Web，Fastify 5 提供本机服务，esbuild 打包服务入口，Zod 4 负责契约。完整精确版本见各 package.json 和 pnpm-lock.yaml。TypeScript 使用 6.0.3：当前 typescript-eslint 的支持范围小于 6.1，因此没有机械采用 TypeScript 7。

dependency-cruiser 使用 package.json 的 workspaces 识别公开包导入；pnpm 使用 pnpm-workspace.yaml 安装。增减包分组时同步两处，架构正例会读取真实 workspaces 配置。内部包必须通过 exports 的公开入口访问；禁止相对路径跨包钻入 src。

依赖新增或升级按 change 处理，不在日常启动时追踪 latest。OpenSpec 1.16.1 现在也是项目锁定的开发依赖。

## 当前限制

正文仅在编辑器内存中；有内容时浏览器会尝试显示离开提醒，这不是数据备份。没有导入、保存、自动恢复、模型、版本或发布实现。健康接口的“已连接”只表示本机服务可用。

浏览器测试覆盖中文文本及组合事件，不能代替真实中文输入法候选窗验证。构建会提示编辑器主包较大，这一条 bootstrap 尚未做加载性能优化。模型与存储框架仍保持待验证状态。
