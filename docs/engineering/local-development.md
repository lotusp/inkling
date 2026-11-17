# 本地开发与检查

更新日期：2026-11-17。适用：当前 C02 开发分支；已接入工作空间身份与访问保护、单稿自动保存、格式与重开、浏览器草稿恢复与救援下载；冲突合并、版本 UI 和 AI 调用仍未完成。

## 环境与安装

Node 版本见仓库 `.node-version`（22.22.2），pnpm 版本由 package.json 的 packageManager 固定（10.34.9）。先用本机版本管理器切换到该 Node，再执行：

```bash
node --version
corepack pnpm install --frozen-lockfile
corepack pnpm start
```

安装完成后，`start` 一次完成构建与启动，打开终端输出的“打开工作台”链接（包含一次性凭证，交换后地址会自动清除凭证）。Ctrl+C 停止，关闭浏览器页面不停止服务。无需模型、数据库或其他服务账号。

若没有 Corepack，可按 pnpm 官方安装方法安装 packageManager 指定版本，然后使用等价的 `pnpm` 命令。仓库不修改系统 Node 或全局包管理器配置。

默认端口被占用时会明确失败，不自动切换。可以先停止原服务，或者显式运行 `PORT=4320 corepack pnpm start`。服务只绑定 127.0.0.1；不开放局域网访问。PORT=0 主要供进程测试取得独立端口，实际地址以启动输出为准。

## 工作空间与本机接入

默认数据目录为 `~/Library/Application Support/Inkling/workspaces/default/`，不在源码仓库内。当前 SQLite 保存工作空间身份、正文与内部修订。连接工作空间后，首次点击“开始写作”；看到“已保存”后可重开。SQLite 嵌入应用进程，无需独立数据库服务。

不同端口也不能让两个服务同时写同一目录。程序正常退出或崩溃后 SQLite 释放锁；遇到不兼容、损坏或符号链接时拒绝打开，不会自动清空原数据。

需要独立开发空间时，可设置 `INKLING_WORKSPACE=/absolute/path corepack pnpm start`。同样的路径用于重新获取访问链接：

```bash
corepack pnpm local:access
# 自定义工作空间时
corepack pnpm local:access --workspace /absolute/path
```

一次性链接 5 分钟内有效，会话 12 小时有效；服务重启后重新接入。访问信息仅保存在权限受限的 runtime-access.json，本机管理入口拒绝浏览器跨源请求。不要分享访问链接或此文件。切换端口或浏览器会改变浏览器恢复副本所在的 origin，服务端数据目录不随之改变。

better-sqlite3 是原生依赖，pnpm-workspace.yaml 已允许其构建。若安装需从源码编译，Mac 需要 Xcode Command Line Tools；本机已验证编译成功。构建后的服务保留原生驱动作为外部依赖，因此不能只复制 dist 而遗漏锁定安装的运行依赖。

## 当前保存交互

编辑停顿约 1.2 秒自动保存，持续输入最多约 10 秒触发一次；也可按 Cmd/Ctrl+S。标题和正文的组合输入期间暂停提交。标题限制 200 个 Unicode code points（例如一个组合 emoji 可能包含多个 code points），超限时保留输入并提示修改。

“已保存”表示当前输入已核对服务端提交；响应丢失时先查询原请求和最新版本，再决定重试。保存期间继续输入不会被旧响应覆盖或误标为已保存。另一标签页抢先提交会阻止普通保存覆盖，当前阶段尚未提供比较/合并 UI，请保留页面内输入。

## 草稿恢复与救援

工作台加载后，即使本地服务停止，仍可继续输入。看到“浏览器恢复副本已更新”才表示最新输入已完成 IndexedDB 事务；它不等同于正文“已保存”。副本按工作空间、文章与标签页隔离，复制标签页也不会共享写入身份。

服务恢复后可按“重试保存”。如果服务重启导致会话失效，先用 `local:access` 取得新链接，在原页面打开后再重试；重新认证不会替换当前输入。重新打开页面时列出恢复副本，按时间和预览明确选择，再核对未决请求和服务器最新版本；有版本冲突则保留草稿并暂停普通保存，比较/合并界面仍待下一步骤。

不采用某份副本时，可以选择“保留副本，使用服务器版本”，原副本继续留在浏览器内；它会在下次打开时再次出现。已恢复且确认复制成功的非活动来源副本会被清理，其他标签页的副本保留。

浏览器副本不可用、空间不足或事务失败时会明确提示；在线保存仍可使用，但未保存输入只在本页内存。离开前可点击“下载救援稿”，得到包含最新标题、正文、确认基线和未决请求的 JSON；恢复列表也可单独下载某一副本。救援稿不含访问凭证，不是 Markdown 导出或整个工作空间备份，当前也没有救援 JSON 导入界面。

恢复副本属于当前浏览器及地址（origin）。更换浏览器/端口、清除网站数据或浏览器主动回收数据会使其不可用，重要输入仍应完成服务器保存或下载。应用不是离线安装的 PWA：服务停止期间刷新不能打开工作台，重启服务并重新接入后才可选择已有副本。

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

verify 依次执行格式、lint、类型、依赖边界、构建、API/进程/架构测试、Harness 回归、文档和 OpenSpec 检查。浏览器测试为每个测试启动独立的临时端口服务与工作空间，结束后关闭并清理，不复用已有实例或接触个人默认目录。首次使用需安装对应 Chromium；Linux CI 安装时加 `--with-deps`。

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

当前有 `apps/web`、`apps/server`、`packages/contracts` 和 `packages/adapters`。contracts 导出健康响应 schema，web 校验真实响应，server 提供它；工作空间存储已放入 packages/adapters，正文用例已进入 packages/core。

React 19 与 Tiptap 3 提供编辑，Vite 8 构建 Web，Fastify 5 提供本机服务，esbuild 打包服务入口，Zod 4 负责契约。完整精确版本见各 package.json 和 pnpm-lock.yaml。TypeScript 使用 6.0.3：当前 typescript-eslint 的支持范围小于 6.1，因此没有机械采用 TypeScript 7。

dependency-cruiser 使用 package.json 的 workspaces 识别公开包导入；pnpm 使用 pnpm-workspace.yaml 安装。增减包分组时同步两处，架构正例会读取真实 workspaces 配置。内部包必须通过 exports 的公开入口访问；禁止相对路径跨包钻入 src。

依赖新增或升级按 change 处理，不在日常启动时追踪 latest。OpenSpec 1.16.1 现在也是项目锁定的开发依赖。

## 当前限制

正文支持在线自动保存与浏览器恢复副本，离开提醒本身不是数据备份。尚无冲突合并、版本 UI、导入、模型或发布实现。健康接口的“已连接”只表示本机服务可用，正文保存与副本状态分别显示。

浏览器测试覆盖中文文本及组合事件，不能代替真实中文输入法候选窗验证。构建会提示编辑器主包较大，这一条 bootstrap 尚未做加载性能优化。SQLite 存储选择已完成 POC；模型框架仍待验证。
