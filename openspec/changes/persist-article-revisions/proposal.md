# Change proposal

## Why

当前工作台的标题与正文只在内存中，刷新会清空。作者需要可持续编辑的一篇稿件，明确保存状态，并能在误改、重复提交、多个标签页和服务中断后找回内容。

## What Changes

- 确定唯一正文表示与本机存储方案，通过隔离 POC 比较文件提交与 SQLite 事务；重大决定形成 ADR。
- 默认工作空间中首次创建、随后重开最近稿件，自动保存标题与正文，提供明确的保存/离线/冲突状态。
- 建立版本基线、mutation ID 去重、客户端待提交稿恢复，旧响应与旧标签页不能覆盖新输入。
- 保存不可变修订，提供自动恢复点、命名版本、比较和恢复；恢复生成新修订。
- 在新增写入入口时落实本机身份、同源保护、路径约束、单工作空间写入所有权与兼容性检查。

## Non-goals

多文章列表/搜索/回收站（C03）、新技术格式（C04）、AI 或候选采纳（C05–C07）、资料/发布/多端协作、整空间备份（C17）。本 change 初期先完成设计与技术验证，随后按用户授权实施上述能力；不扩展到这些非目标。

## Capabilities

### New Capabilities

- `article-persistence`：权威正文、可靠保存、幂等、故障与客户端恢复。
- `article-revisions`：历史版本、命名、比较与恢复。
- `local-workspace-access`：工作空间初始化、独占写入和本机 API 访问边界。

### Modified Capabilities

- `local-workbench`：将“临时正文编辑”改为保存后可重开的正文编辑；保留基本格式，替换刷新即清空的契约。修改入口安全行为由新增 capability 补充，不删减已有 Host/健康/Chat 边界。

## Impact

预计涉及 apps/web 的加载/保存状态机和版本面板、apps/server 的本机访问与文章 API、contracts 的 schema，以及按实际职责新增的 core/adapters。根 lockfile 仅在进入实现时纳入已验证驱动，不在设计阶段安装生产依赖。正式数据独立于仓库；当前没有已保存产品数据需要迁移。现有临时编辑 E2E 需要按 delta 改写，其他 bootstrap 验收保留。

存储比较和边界结论见本 change 的 design、poc 与 evidence；G1 表示可实施，不能冒充 G2 产品验收。
