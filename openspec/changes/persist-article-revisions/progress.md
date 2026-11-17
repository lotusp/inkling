# 实施进度

更新：2026-11-17。当前 change：persist-article-revisions。G1 已通过，G2 尚未完成。

## 已完成步骤

- 规范：每个可验证步骤通过后立即 commit；提交 abce09d。
- 设计：存储 POC、ADR、详细设计、23 个验收场景；提交 a34fc8c。
- 1.1：正式 SQLite 驱动和工作空间初始化/身份、格式检查、独占连接、关闭与崩溃释放；拒绝已有非数据库、新版数据库和符号链接。4 个有效 Red 后实现，新增边界加基线回归共 11 项进程检查通过，日志 evidence/workspace-red.log、workspace-green.log。类型、lint、架构和构建通过。

## 当前边界

仅创建工作空间元数据，编辑器仍是临时输入；尚未接入文章保存。Linux 原生驱动安装和手工 IME 未验证。本机依赖安装成功；pnpm 原生驱动需要允许构建且可能使用 Xcode Command Line Tools。

## 下一步

1.2：本机会话、Origin/CSRF、访问凭证重新获取与 API/浏览器验收。当前不会开放未保护的正文写接口。
