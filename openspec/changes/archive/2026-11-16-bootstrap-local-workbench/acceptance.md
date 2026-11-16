# Bootstrap acceptance

## Scenario mapping

| ID | 行为 | 层与入口 | 测试文件 | 夹具 | 断言 |
| --- | --- | --- | --- | --- | --- |
| WORKBENCH-START-001 | 启动与健康 | API + 构建进程 + UI | tests/api/server.test.ts、tests/process/lifecycle.test.ts、tests/e2e/workbench.spec.ts | 真实服务与构建资源 | 健康 JSON、页面可用、本机地址 |
| WORKBENCH-PORT-002 | 占端口 | 进程 | tests/process/lifecycle.test.ts | 临时占用端口 | 非零退出、明确错误 |
| WORKBENCH-STOP-003 | 停止 | 进程 | tests/process/lifecycle.test.ts | 子进程与动态端口 | 信号后退出，端口可重用 |
| WORKBENCH-EDIT-004 | 中文编辑 | UI | tests/e2e/workbench.spec.ts | 空白真实编辑器 | 输入与格式、未保存提示、刷新清空 |
| WORKBENCH-CHAT-005 | Chat 边界 | UI | tests/e2e/workbench.spec.ts | 真实页面 | 不能发送，专注切换保留输入 |
| WORKBENCH-HEALTH-006 | 失败恢复 | API + UI | tests/e2e/workbench.spec.ts | 失败/非法响应后解除拦截 | 未连接、重试连接、输入保留 |
| WORKBENCH-HOST-007 | 入口限定 | API | tests/api/server.test.ts | Fastify injection | Host 403、未知 API JSON 404 |
| DEVELOPMENT-CHECK-001 | 工程入口 | 工程集成 | 本地 verify 与 CI 配置 | 锁定依赖 | 类型/lint/格式/构建/测试/文档通过 |
| DEVELOPMENT-BOUNDARY-002 | 依赖违规 | 工具负例 | tests/architecture/boundaries.test.ts | 临时 TS 模块图 | 各违规失败，合法导入通过 |

## Red and baseline

先建立最小可运行测试环境。健康 API 先对没有注册路由的真实 Fastify 实例执行断言，得到功能缺失 Red 后实现路由；UI 先运行空白可访问页面，使正文与状态断言失败后实现交互。工程安装/配置不是行为 Red，不把缺包、构建错误或无法启动浏览器算验收失败证据。

进程/架构检查边写边验证；已具备行为记录 baseline-pass，不人为损坏后制造 Red。对工程边界使用故意违规的临时 fixture 证明检查实际阻断。

## Required checks

G2 必须执行：`pnpm verify`（格式、lint、类型、架构、构建、API/进程/边界/Harness 回归、文档/OpenSpec 检查），`pnpm test:e2e`（Chromium），`node scripts/harness/check.mjs bootstrap-local-workbench --stage verify`。安装使用 `pnpm install --frozen-lockfile`。检查入口由本 change 建立，缺命令不得记通过。

CI 配置复用 verify 和 E2E。本轮可先通过本地等价检查；远端 CI 未运行时单独注明，不能伪称远端已绿。浏览器验收与视觉观察使用桌面和窄屏，手动原生输入法候选窗尚未执行。

## Scope and fixtures

所有进程与网络仅在回环地址运行，测试使用独立端口。mock 只覆盖 UI 的健康失败路径；正常健康与页面服务真实。无模型、存储、发布或真实稿件夹具。
