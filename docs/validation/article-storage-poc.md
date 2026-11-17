# 文章存储方案 POC

日期：2026-11-16。目的：为 C02 选择保存介质与正文格式。状态：隔离技术实验通过；不是产品持久化验收，也没有改变正式工作台的行为。

## 环境与可复现入口

macOS 26.6.1（25G76）、arm64、Node 22.22.2。临时目录安装 `better-sqlite3@13.2.0`，实际 SQLite 3.54.1；系统 Node 和项目根依赖未修改。编辑器验证复用当前锁定的 Tiptap 3.34.0。

实验保存在 [当前 change 的 poc 目录](../../openspec/changes/archive/2026-11-17-persist-article-revisions/poc/README.md)，原始结果见 [存储日志](../../openspec/changes/archive/2026-11-17-persist-article-revisions/evidence/storage-poc.log)和 [正文日志](../../openspec/changes/archive/2026-11-17-persist-article-revisions/evidence/document-poc.log)。两份日志的摘要与实验输入指纹见同目录 `design-evidence.json`，它是设计证据，不使用 Harness 的 G2 evidence.json 冒充产品验证。

## 对照方法

两组都保存相同中文 JSON 文档，并提供 `save(mutationId,base,content)` 与读取当前修订的接口。

- 文件：先写完整快照并 fsync/rename，再原子替换包含 head、修订 hash 和 mutation 映射的 manifest，同步目录。manifest 是提交点，未被引用的快照不算已提交。实验假设单写者，未实现生产级文件锁或回收。
- SQLite：修订、head、mutation 在一个 immediate transaction 中提交；WAL、FULL、fullfsync 和外键均读回确认。另验证独占连接阻止第二进程。同步配置依据 [SQLite PRAGMA](https://www.sqlite.org/pragma.html)。

两组使用相同逻辑断言，并在各自真实提交点前/后主动 SIGKILL 子进程，重开后查询与重试。写入失败是提交前注入 ENOSPC 异常，不是填满真实磁盘。内容损坏是修改正文而保留旧 hash，不是完整数据库损坏实验。

## 结果

| 检查 | 文件快照 + manifest | SQLite |
| --- | --- | --- |
| 保存后重开，正文与 head 一致 | 通过 | 通过 |
| 同 mutation 同载荷重试返回原结果 | 通过 | 通过 |
| 同键不同载荷拒绝 | 通过 | 通过 |
| 过期基线提交拒绝 | 通过 | 通过 |
| 注入提交前写入错误，原 head 不变 | 通过 | 通过 |
| 提交前 SIGKILL，重开与重试一致 | 通过 | 通过 |
| 提交后、响应前 SIGKILL，重试不重复 | 通过 | 通过 |
| 内容 hash 不匹配时拒绝读取 | 通过 | 通过 |
| 第二进程独占冲突、关闭后可重开 | 未测试文件锁 | 通过 |

共 **17 项存储实验检查**。另有 **4 项正文检查**：中文/混合文本、标题/加粗、列表/代码三组 canonical JSON 往返，以及未知节点拒绝。schema 会补默认属性，所以比较的是第一次校验生成的 canonical 文档；仍需严格的业务属性白名单，不宣称 nodeFromJSON 能拒绝所有未知属性。

辅助耗时：每组顺序保存 30 次约 60 KB 文档，文件组中位 21.05 ms / p95 26.94 ms，SQLite 组中位 6.06 ms / p95 8.66 ms。样本小、无并发、同步机制不同、未模拟未来实体规模；仅用于排除当前机器上的明显阻塞，不能当作框架性能排名或生产 SLO。

## 设计结论与未验证项

采用 SQLite 的依据是减少自建提交清单、关系一致性、锁和迁移的维护工作，不是文件方案失败。保留 JSON 作为正文表示、附件作为文件，初期不加 ORM。完整权衡见 [DEC-0004](../decisions/0004-article-storage-and-revisions.md)。

以下仍是正式实现的验收任务：真实 UI/HTTP 保存、浏览器 IndexedDB 与多标签页、原生中文输入法、真实只读目录/磁盘错误、正文大小上限、格式级差异、token/CSRF、Linux CI 原生驱动安装以及旧响应处理。SIGKILL 不等同断电，本轮不声称验证硬件断电 durability。没有运行模型、没有读写用户真实稿件。
