# Bootstrap design

## Context and boundaries

沿用模块化单体。本次仅创建 apps/web、apps/server、packages/contracts。没有业务领域或外部适配职责前不创建 core/adapters。web 只引用 contracts；server 装配 Fastify 与静态资源。开发环境 Vite 代理健康请求，正式本机运行由一个 Fastify 进程同源提供页面与 API。

## Decisions and contracts

Node 22.22.2 作为本轮工程基线。安装发现 OpenSpec 的传递依赖 @inquirer/core 要求至少 22.22.2，因此使用隔离下载的补丁版进行验证，不修改系统 Node。Vite 8 支持该版本。pnpm 10 固定补丁版本与 lockfile。TypeScript 6.0.3 与 typescript-eslint 当前支持范围匹配，不使用尚未被该检查器支持的 TypeScript 7。React、Tiptap、Fastify、Zod 分别负责 UI、真实编辑、服务与边界契约；初始 UI 用局部 CSS，实现未来设计系统前不预装无使用者的组件库。

健康契约为 `{ status: 'ok', application: 'inkling', apiVersion: 1 }`，Zod 同时校验服务响应与 UI 输入。健康状态不是正文保存状态。编辑器内存是本 change 唯一临时内容位置，不读写 localStorage、文件或数据库。

server 的创建与 listen 分离，API 测试使用真实 Fastify injection；进程测试启动构建后的服务，验证占端口和信号退出；Playwright 启动同一个构建后的服务，验证 UI 到健康接口的路径。健康失败场景只替换网络响应，正常路径调用真实后端。

生产资源由 Vite 输出，Node 服务由 esbuild 打包。TypeScript strict 校验源码，ESLint 检查 TS 与 React Hooks，Prettier 仅覆盖本 change 代码和配置，不格式化历史原型/文档。dependency-cruiser 校验源码依赖与循环；package.json 的 workspaces 供其识别公开包导入，和 pnpm-workspace.yaml 同步，负例在临时目录中执行，不污染生产源码。

## Failure and recovery

服务固定绑定 127.0.0.1，默认端口 4317；PORT 可指定整数，测试用 0 获取隔离端口。端口占用和非法端口明确失败，不自动换端口。未知 API 保持 JSON 404，Host 限定 localhost/127.0.0.1。当前仅健康读接口，无用户数据写 API；会话与写操作安全在后续持久化 change 实现。

UI 健康探测有超时和取消，失败可重试，结果必须通过契约校验；不因连接结果重新创建编辑器。临时编辑提供可见提示与离开提醒，不能声称自动保存。

## Alternatives and risks

简单 textarea 无法验证后续富文本基础，因此本次接入 Tiptap。中文 E2E 验证文本输入与组合事件的基本行为，真实输入法候选窗仍需目标 Mac 手动验收，不声称已完整覆盖。CSS 与基础工具栏可在后续视觉 change 调整。

工具版本来源：官方 Vite guide、Tiptap React 安装文档、Fastify Server 参考以及 npm 注册表的实际版本。锁文件是依赖的执行依据。真实模型与博客不在本条范围，不需要凭据。

## Delivery

提供开发命令、单命令本机启动、停止和检查说明。CI 不发布产品或调用外部模型。全部文件是新增工程资产，没有业务数据迁移；回退本 change 不涉及数据格式。
