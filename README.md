<h1 align="center">
  <img src="apps/web/public/inkling-logo.svg" width="294" height="70" alt="Inkling">
</h1>

<p align="center"><strong>个人中文技术写作工作台</strong></p>

<p align="center">
  <a href="#快速开始">快速开始</a> · <a href="#inkling-的特点">特点</a> · <a href="docs/README.md">项目文档</a>
</p>

Inkling 帮你把一次项目复盘、一项技术选型或一段实践笔记写成有自己判断的文章。当前版本在 Mac 上运行，打开浏览器就能开始写一篇稿件。

## Inkling 的特点

- **为技术文章准备的编辑器**。用小标题、列表和代码块组织正文，点「专注写作」收起讨论侧栏。
- **正文自动保存到本机**。停笔后自动保存，也可以按 `⌘S`。「已保存」表示标题和正文已写入工作空间，重开后可以接着写。
- **服务中断时留住草稿**。已打开的编辑器可以继续写。看到「浏览器恢复副本已更新」后，可以在同一浏览器和地址重新打开时选择恢复副本。需要时还可以下载 JSON 救援稿。
- **两份内容有冲突时由你合并**。另一个标签页先保存时，可以对照本页草稿与服务端版本，整理后明确确认合并。
- **回看写作过程**。在「版本历史」给重要版本命名，也可以选择两份已保存的版本，查看标题、正文和格式差异。

## 快速开始

在 macOS 上准备 [`.node-version`](.node-version) 指定的 Node.js（22.22.2）和 Corepack。如果安装时需要编译 SQLite 驱动，可用 `xcode-select --install` 安装 Xcode 命令行工具。运行工作台无需注册账号、配置模型密钥或启动独立数据库。

在当前开发分支的源码目录中运行：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm start
```

1. **打开工作台**。在浏览器打开终端输出的「打开工作台」一次性链接。
2. **写第一篇稿件**。点击「开始写作」，输入标题和正文。
3. **确认保存**。看到「已保存」后刷新页面，就能继续编辑同一篇稿件。

正文默认保存在 `~/Library/Application Support/Inkling/workspaces/default/`。按 `Ctrl+C` 停止服务。访问链接过期或需要重新接入时，保持服务运行，在另一个终端执行 `corepack pnpm local:access` 获取新链接。

安装原生依赖、端口占用与自定义工作空间见[本地运行说明](docs/engineering/local-development.md)。

## 项目状态与文档

当前开发分支提供单篇稿件的本地预览。AI 协作与发布属于后续计划。

- [产品知识库](docs/README.md)汇总产品设计、架构、调研和验证记录。
- [V1 功能范围](docs/product/v1-scope.md)介绍首版计划与实施顺序。
- [开发 Harness](docs/engineering/harness.md)说明 OpenSpec、开发检查与验收流程。

项目采用 [MIT 许可证](LICENSE)。
