# Bootstrap local workbench

## Why

仓库已有交互与开发方法设计，但尚不能启动产品。先交付一条可以重复运行与验收的本地编辑路径，为后续正文持久化和 Agent 接入提供真实工程基础。

## What Changes

建立 TypeScript workspace、React/Tiptap 工作台、Fastify 本机服务与共享健康契约。安装后 `pnpm start` 构建并启动工作台；本 change 的标题和正文仅在页面内存中。加入工程检查、API/进程/UI 验收和 GitHub Actions。

## Non-goals

不接入正文持久化、模型、搜索、博客、会话、版本或记忆；不把原型示例回复带入真实应用。不预建尚无职责的 core/adapters 空包。不配置发布或云端部署。

## Capabilities

### New Capabilities

- `local-workbench`：本地启动、服务状态、临时编辑与明确能力边界。
- `development-checks`：可重复的本地/CI 检查与模块边界验证。

### Modified Capabilities

无，当前没有产品 Living Spec。

## Impact

增加 apps/web、apps/server、packages/contracts、锁文件、根工程配置、tests、CI 与运行说明。保留现有文档原型。工具链先采用兼容本机工具链的 Node 22.22.2 与 pnpm 10，具体版本在锁文件固定，不冻结后续产品运行时或存储选择。
