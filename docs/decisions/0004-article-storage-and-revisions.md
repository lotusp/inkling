# DEC-0004 文章存储与修订

状态：设计选定，待产品实现验收。日期：2026-11-16。适用范围：C02 文章持久化，以及后续复用的本机存储边界。依据：本机隔离 POC 与当前 V1 的保存/恢复要求；不是用户额外指定必须使用数据库。

## 背景与约束

个人单机应用需要轻量、透明、可迁移的数据管理。可靠保存同时影响正文、当前版本、不可变修订与请求去重结果；后续还有来源、会话和记忆。轻量应包含实现和维护成本，不只计算依赖数量。

## 备选与比较

| 方案 | 好处 | 为满足当前契约需要承担的工作 |
| --- | --- | --- |
| Markdown 文件 + Git | 易用外部工具阅读；有历史 | 富文本往返、自动保存与提交分离、请求去重和 head 一致性仍需另外实现；Git 不是本应用的保存事务 |
| JSON 快照 + 原子 manifest | 无数据库驱动；可以做到单稿原子提交 | 自行管理同步顺序、未提交孤儿快照、manifest 增长、单写者锁、校验、迁移与回收；跨实体一致性逐渐复杂 |
| **SQLite + JSON 正文 + 附件文件** | 本机嵌入式存储；事务统一更新修订/head/请求结果；便于后续关系与查找 | 引入本机驱动；需要 SQL 迁移、WAL-aware 备份、大小控制和同步调用耗时约束 |
| 浏览器 IndexedDB 为权威 | 无后端存储驱动 | 与浏览器配置及清理生命周期绑定，不适合作为本机服务、后台任务和后续连接器共同的数据权威 |

文件方案实验和 SQLite 实验都通过指定的进程崩溃/幂等场景；不能据此说文件不可靠。选择 SQLite 是为了减少本项目自行实现和维护存储协议的范围，而不是一次微型性能测试的排名。详见 [POC 记录](../validation/article-storage-poc.md)。

## 选择及理由

1. 正文权威为带 `schemaVersion` 的标题 + Tiptap/ProseMirror JSON，存入 SQLite 的不可变修订。Markdown/HTML 是导入导出表示；不保持第二份可独立编辑的主稿。[Tiptap 持久化](https://tiptap.dev/docs/editor/core-concepts/persistence)
2. 采用 `better-sqlite3@13.2.0`，本机 Node 22.22.2/arm64 已验证，实验内 SQLite 为 3.54.1。实现时锁定依赖并验证 CI 平台。初期使用参数化 SQL 与编号迁移，不引入 Drizzle/Prisma。
3. 暂不选 `node:sqlite`：项目锁定的 Node 22.22.2 文档把它标为 Stability 1.1 / Active development；保留未来稳定后替换 adapter 的选项。[固定 Node 版本源码文档](https://raw.githubusercontent.com/nodejs/node/v22.22.2/doc/api/sqlite.md)
4. 单工作空间单服务连接；采用 WAL、`synchronous=FULL`、macOS `fullfsync=ON`、外键和连接生命周期的独占锁。这样不依赖心跳文件超时来判断第二个写入者。独占模式限制外部工具在线读取；以后需要多连接时重新设计，不提前引入连接池。[SQLite PRAGMA](https://www.sqlite.org/pragma.html)
5. 内容、版本、成功 mutation 和版本命名是事务数据；附件仍作为独立受控文件，C04 再实现。IndexedDB 仅存待提交恢复副本，受浏览器清理、权限和配额限制，不是第二个主稿。
6. 只声明已验证的进程中断恢复保证。SIGKILL 测试不等于真实断电测试；任何介质仍需完整备份，C17 交付一致性备份与恢复入口。[SQLite WAL](https://www.sqlite.org/wal.html)

## 影响

不需要启动数据库服务或安装数据库管理软件；用户仍只启动 Inkling。默认数据位于 `~/Library/Application Support/Inkling/workspaces/default/`，与 Git 仓库分开。`inkling.sqlite` 及活动中的 WAL 文件由应用管理，不能把运行中复制一个 sqlite 文件称作完整备份。

本 change 新增存储 adapter、业务用例与共享契约；已有应用代码尚未接入。当前规格仍然是临时编辑器，必须等 C02 验证/归档后才能更新 Living Spec。会话、资料、风格、记忆等未来实体不会提前建空表。

## 复审条件与关联

若原生驱动在目标设备无法可靠安装、同步事务明显阻塞交互、用户要求直接在外部 Markdown 工具中编辑权威稿、或出现多服务/多设备写入需求，应重新审视驱动、权威格式或存储协议。性能测试不通过时先优化实际瓶颈，再考虑 worker 或其他存储。

本记录细化 [DEC-0002](0002-local-macos-mvp.md) 的存储待验证项；不改变单 Mac、本地 Web、远程模型待配置的边界。详细保存与恢复协议在 `persist-article-revisions` change/design 中，待实现后同步已交付规格。
