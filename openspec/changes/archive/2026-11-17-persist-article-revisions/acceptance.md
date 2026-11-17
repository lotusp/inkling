# Acceptance design

状态：实施中；下表为验收计划，实际完成情况与日志见 progress.md。POC 只提供设计证据。

## Scenario mapping

| ID | 需求/用户行为 | 层与入口 | 测试或手工流程 | 夹具 | 可观察断言 |
| --- | --- | --- | --- | --- | --- |
| ARTICLE-CREATE-001 | 首次创建/重开 | API + UI | tests/api/article-persistence.test.ts；tests/e2e/article-save.spec.ts | 空临时 workspace，两个 ensure 请求 | 只创建一个初稿，重开 article ID 一致 |
| ARTICLE-SAVE-002 | 保存与服务重启 | 集成 + UI | tests/integration/article-store.test.ts；tests/e2e/article-save.spec.ts | 真实 SQLite 与中文/格式稿 | 确认后刷新/重启内容完整；保存状态准确 |
| ARTICLE-RETRY-003 | 未知响应重试 | API + UI | tests/api/article-persistence.test.ts；tests/integration/article-store.test.ts；tests/e2e/article-save-races.spec.ts | 真实提交后丢弃响应，再推进 head | 原 mutation 结果可查询，重试不增版本 |
| ARTICLE-KEY-004 | 相同键不同载荷 | API | tests/api/article-persistence.test.ts | 修改文章/base/操作/正文的重复 ID | 409，不改变数据 |
| ARTICLE-RACE-005 | 旧响应晚到 | UI | tests/e2e/article-save-races.spec.ts | 延迟真实保存响应，继续输入新字符 | 保留新内容和副本，不误显 clean |
| ARTICLE-CONFLICT-006 | 两个标签页冲突 | API + UI | tests/e2e/article-conflict.spec.ts；tests/e2e/article-discard.spec.ts | 同 browser context 的两个页面、确认后副本变化/来源重新活动 | 第二份写冲突，两边可查看；合并仍 CAS，输入变化使确认失效；放弃需确认且不能删除活动或已变化副本 |
| ARTICLE-LOCAL-007 | 断线/重开恢复 | UI | tests/e2e/article-recovery.spec.ts | 已持久 IDB、在途/最新 draft、服务中断 | 先查 mutation/head，选择恢复；多副本隔离；旧基线不自动上传 |
| ARTICLE-IDB-008 | 浏览器副本失效 | UI | tests/e2e/article-recovery-failures.spec.ts | 浏览器原生 IDB 调用边界注入配额/不可用/事务 abort，保留真实 UI 与服务器 | 提示失败、可下载内存救援稿，不声称已保存副本；未知记录不覆盖 |
| ARTICLE-WRITE-009 | 数据库写失败 | 集成 + UI | tests/integration/article-faults.test.ts；tests/e2e/article-storage-faults.spec.ts | 真实只读 SQLite 连接、max_page_count 引发 SQLITE_FULL、临时 trigger 注入写入异常 | 事务前后状态一致；显示失败并保留输入 |
| ARTICLE-CRASH-010 | 事务中断 | 进程 | tests/process/article-crash.test.ts | 隔离 workspace，提交各边界进程 SIGKILL | 重开 head/revision/mutation 一致，提交后可查询去重 |
| ARTICLE-SCHEMA-011 | 结构与容量校验 | 契约 + API | tests/unit/article-document.test.ts；tests/api/article-persistence.test.ts；tests/e2e/article-formats.spec.ts | 未知版本/attrs/节点、恶意协议、最大深度/字节 | 已支持格式通过，非法输入拒绝且不改原稿 |
| ARTICLE-CORRUPT-012 | 损坏处理 | 集成 + 进程 | tests/integration/article-corruption.test.ts；tests/e2e/article-corruption.spec.ts | 内容 hash 错、数据库头损坏的独立副本 | 写入阻断，不自动重建或回退；有效旧版可救援 |
| ARTICLE-QUOTA-013 | 历史容量 | 集成 + UI | tests/integration/article-quota.test.ts；tests/e2e/article-quota.spec.ts | 可注入的小容量测试策略，默认值另核对 | 到阈值提示，到上限拒绝增正文，无自动删除 |
| REVISION-HISTORY-001 | 命名与自动恢复点 | 单元 + API + UI | tests/integration/article-revisions.test.ts；tests/api/article-revisions.test.ts；tests/e2e/article-versions.spec.ts | 可控 clock，初始/首次保存/5分钟/命名 | 恢复点策略正确，分页与命名去重，不改变正文 |
| REVISION-COMPARE-002 | 版本差异 | 单元 + UI | tests/unit/document-diff.test.ts；tests/e2e/article-versions.spec.ts | 纯格式变化、列表、代码换行、标题变化 | 指定版本差异可见，编辑器不变，越界版本拒绝 |
| REVISION-RESTORE-003 | 恢复产生新版本 | 集成 + UI | tests/api/article-revisions.test.ts；tests/e2e/article-restore.spec.ts | 已保存新旧稿 | 新 head、parent/source 正确，历史保留，重试仅一份 |
| REVISION-CONFLICT-004 | 恢复与新输入竞争 | UI + API | tests/e2e/article-restore.spec.ts；tests/api/article-revisions.test.ts | 恢复面板期间本页输入/其他标签先保存 | 旧确认失效或 409，不覆盖新稿 |
| WORKSPACE-OPEN-001 | 目录/初始化/schema | 进程 | tests/process/workspace-access.test.ts | 缺省新目录、已存在较新格式、非 SQLite 文件 | 幂等初始化/拒绝兼容错误，不覆写已有文件 |
| WORKSPACE-LOCK-002 | 多服务与退出 | 进程 | tests/process/workspace-access.test.ts | 同目录不同端口两进程，正常退出/SIGKILL | 第二进程失败；原进程结束后可正常重开 |
| WORKSPACE-AUTH-003 | 本机接入与重新认证 | API + UI + 进程 | tests/api/workspace-access.test.ts；tests/process/workspace-access.test.ts；tests/e2e/article-recovery.spec.ts | 有效/过期/重复 token、真实服务重启、local:access | 一次交换、cookie、fragment 清除；重新接入不丢 IDB |
| WORKSPACE-CSRF-004 | 跨源防护 | API + UI | tests/api/workspace-access.test.ts；tests/e2e/workspace-access.spec.ts | 攻击源页面、missing/null Origin、错误 CSRF | 敏感读写被拒绝，合法本机和开发代理通过 |
| WORKSPACE-PATH-005 | 路径与资源边界 | API | tests/api/workspace-access.test.ts | 路径穿越、跨文章 revision、恶意链接 | 拒绝越界，无外部文件变化或脚本执行 |
| WORKBENCH-EDIT-004 | 原编辑器持久化回归 | UI + 手工 IME | tests/e2e/workbench.spec.ts；tests/e2e/article-formats.spec.ts；macOS 中文输入法检查 | 当前所有按钮、中文候选、刷新 | 格式功能保留，刷新由清空变为恢复，不抢输入焦点 |

## Red and baseline

先建立可导入的业务 port/SQLite test fixture 和启动入口，避免用缺包、无法 import 或浏览器未装冒充 Red。每个切片先对真实 API/存储/页面编写缺失行为测试并记录失败，再实现对应最小行为。保存后的重开、重复请求、冲突、恢复分别留可定位日志，不把整个失败测试集机械重复截图。

原格式、健康、Chat 禁用与启动回归先记录 baseline-pass；WORKBENCH-EDIT-004 按 delta 将“刷新清空”改成“已保存后恢复”，先得到实际行为 Red，再实现。POC 的 21 个检查不能当成产品 ATDD Red/Green；产品 tests 需要调用正式 adapter/入口而非 poc 代码。

## Required checks

G1：`node scripts/harness/check.mjs persist-article-revisions --stage plan`、`corepack pnpm exec openspec validate persist-article-revisions --strict --no-interactive`、`corepack pnpm check:docs`；人工核对 23 个场景与设计/任务覆盖。G1 与设计实验已完成，实施记录见 progress.md。

G2：`corepack pnpm install --frozen-lockfile`、`corepack pnpm verify`、`corepack pnpm test:e2e`、`node scripts/harness/check.mjs persist-article-revisions --stage verify`。现有 verify/test 配置应确保发现新增 unit/integration 目录；构建后进程测试使用正式入口。`corepack pnpm test:storage-performance` 已建立，测量设计中的本机耗时门槛；目标 Mac 实测见 evidence/storage-performance.log，具体限制见 docs/validation/article-storage-performance.md。Linux CI 至少验证原生驱动安装及同样功能测试；性能门槛只在记录的目标 Mac 执行。

中文输入法候选窗、组合过程中保存/切换/恢复需要本机手工记录。页面视觉复核涵盖加载、已保存、未保存、冲突、版本比较、恢复确认和窄屏。缺环境时明确标未执行，不用合成 composition 事件冒充人工候选窗检查。

## Scope and fixtures

- 所有正文和 SQLite 位于自动生成临时目录，无真实作者稿件，无模型/博客调用；测试服务端口与正常工作空间隔离。
- 保存/事务/去重/锁/崩溃/命名/恢复必须使用正式 SQLite adapter。故障注入只放在提交或外部边界，用于精确定位失败，不用 mock repository 代替一致性断言。
- 限额和时间可注入，用少量数据证明策略；正式默认参数另外断言。Readonly 使用真实只读 SQLite；ENOSPC 可注入 SQLite 错误而不填满用户磁盘，日志明确区别。
- SIGKILL 测试验证进程崩溃。真实断电/物理磁盘故障不在可自动声明范围。HTTP 响应延迟/丢失是在真实提交后截断，不让假响应代替数据库。
- schema 最大样本、全部现有 node/mark 组合、纯格式差异、复制标签页 clientId 冲突、两份离线副本和旧 mutation 返回都必须列入测试数据。
- 相对日志进入 change/evidence，G2 evidence.json 指纹覆盖正式代码/配置/驱动锁文件与 delta；设计 POC 保留 design-evidence.json；产品 G2 结果单独写入 change 根目录的 evidence.json 与 verification.md。
