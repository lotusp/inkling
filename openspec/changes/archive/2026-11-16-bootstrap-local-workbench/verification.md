# Bootstrap verification

日期：2026-11-16。状态：G2 本地验收通过；归档与 Git 合入结果在最终交付说明记录。

## 范围与环境

实现单机同源工作台、临时中文编辑、禁用的 Chat 占位、真实健康探测与重试，以及工程与 CI 检查入口。未实现持久化、AI 调用、发布、会话或版本管理。

本机 macOS arm64；Node 22.22.2、pnpm 10.34.9、OpenSpec 1.16.1、TypeScript 6.0.3、Vitest 5.1.0、Playwright 1.65.1 / Chromium 159。系统 Node 22.22.1 未修改；执行时把隔离安装的 Node 22.22.2 放到 PATH 前。所有 pnpm 命令通过 Corepack 调用。

## 验收与实际结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `corepack pnpm install --frozen-lockfile --offline` | 退出 0，锁定依赖安装通过 | evidence/install.log |
| `corepack pnpm verify` | 退出 0；格式、lint、类型、依赖边界、构建、13 项 API/进程/架构测试、10 项 Harness 测试、文档/OpenSpec 校验通过 | evidence/verify.log |
| `corepack pnpm test:e2e` | 8 项 Chromium 验收通过，无跳过 | evidence/e2e.log |
| 桌面与窄屏截图检查 | 编辑与讨论区域清晰，窄屏纵向排列，无可见重叠或横向溢出 | evidence/visual-review.log 与两张 PNG |

9 个规格场景全部映射到实际检查，详见 acceptance.md 与 evidence.json。正常 API、构建进程、静态页面与健康连接使用真实服务；只有健康失败/非法响应场景拦截网络。关闭测试验证 SIGINT/SIGTERM 后原端口可重用；架构测试同时检查违规负例和合法公开包导入。

## Red → Green 与验证基线

- API：真实 Fastify 实例缺少健康路由与 Host 限制时，验收产生 404 不等于 200 / 403 的有效 Red（2 failed、1 passed），见 evidence/api-red.log；实现后同一 API 文件的 3 项断言通过。
- UI：真实服务可启动且页面可打开，但空页面没有工作台标题，产生功能缺失 Red，见 evidence/ui-red.log；实现后同一工作台入口和扩展交互共 8 项验收通过。
- 工程安装、类型与架构配置按配置验证处理。进程边界随切片执行并记录 baseline-pass，不人为删除已有实现制造 Red；架构负例使用隔离临时目录，不破坏产品代码。
- 先前缺失浏览器、Node 补丁不兼容、工具路径或 workspace 识别配置问题均是环境/工程问题，不计入行为 Red。

## 代码自检与处理

本轮为执行者自检，没有独立审核或多角色签署。对照 delta 检查了源码、测试、锁文件、CI 与文档。

- 服务仅监听 127.0.0.1，拒绝非本地 Host；未知 API 不返回 HTML。没有外部模型或发布副作用。
- 编辑器只在内存中，明确未保存；健康变化与收起 Chat 不重建正文。离开提醒只是提示，不声称备份。
- contracts 通过公开包入口共享；dependency-cruiser 需要 combinedDependencies 与根 workspaces 才能识别 pnpm workspace，已修正，并增加使用真实 workspace 配置的正例。
- 严格类型与 lint 指出的失败原因保留问题已修正；构建产物从依赖图排除，源码边界仍由正反例验证。
- CI 使用锁定依赖执行与本地相同的 verify/E2E；远端 CI 尚未运行，本报告只证明本地结果。

## 已知限制

中文文本输入与 composition 事件已自动验证，真实 macOS 中文输入法候选窗尚未人工操作。编辑器主包有超过 500 kB 的构建提示；尚未做加载性能优化或跨浏览器保证。截图复核涵盖空白工作台，不代表完整 V1 功能已完成。

## 恢复进度

实现任务全部完成；最后执行的产品检查为 verify 和 8 项 E2E，均通过。没有本 change 内未解决的阻断项。G2 证据结构检查通过；OpenSpec archive 已创建 2 份 Living Spec、应用全部 7 条新增 Requirement。归档规格逐项与 delta 比较完全一致。代码与规格共同合入的提交在交付说明记录。
