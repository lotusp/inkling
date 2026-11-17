# Change proposal

## Why

C02 已能可靠保存一篇文章，但工作台只有全局最近稿入口，作者无法建立多篇文章、找回旧稿或整理写作状态。C03 将已有保存协议扩展为可导航的个人文章库，同时保证切换、重命名和移入回收站不会丢失未确认输入。

## What Changes

- 在现有 SQLite 中增量迁移文章库元数据，保留所有 C02 ID、修订、命名、mutation 和浏览器副本。
- 文章列表、新建、打开和最近文章/编辑位置；切换前处理保存、输入法和恢复副本。
- 文章标题重命名复用正文版本协议；标签、归档、回收站及恢复使用独立元数据基线。
- 标题与标签查找、分页、空态和错误提示；归档/回收站明确可读写边界。

## Non-goals

永久删除、批量操作、文件夹/多工作空间、正文全文检索、导入/导出、AI、发布与云同步。本次回收站不回收磁盘空间；完整备份仍属 C17。暂不接入 ORM、搜索引擎或新 Agent 框架。

## Capabilities

### New Capabilities

- `article-library`：文章生命周期、列表、导航、标签与恢复位置。

### Modified Capabilities

- `article-persistence`：首次创建/重开从唯一文章扩展为多文章，显式新建与 ensure-current 区分；保留原场景与事务契约。

## Impact

涉及 contracts、core 的文章用例/port、SQLite schema 2→3、server 受保护路由及 web 的文章导航/会话边界。正文 JSON 仍是唯一权威；浏览器恢复副本仍按 workspace/article/client 隔离，不改变已有副本格式。新增元数据表及索引，不改写原修订内容，不新增依赖。现有 C02 全量测试作为回归；每一步验证后提交。
