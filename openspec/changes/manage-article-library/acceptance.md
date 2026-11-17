# Acceptance design

状态：实施前计划；下列新测试入口按切片建立，不能当作已通过。

## Scenario mapping

| ID | 需求/用户行为 | 层与入口 | 测试或手工流程 | 夹具 | 可观察断言 |
| --- | --- | --- | --- | --- | --- |
| LIBRARY-MIGRATE-001 | 旧空间兼容与迁移回滚 | 集成/真实 SQLite | tests/integration/article-library.test.ts | 固定 schema 2 DDL、两修订与命名/去重、迁移故障 | 升级/重开保留全部原记录；失败回滚 |
| LIBRARY-CREATE-002 | 独立新建与去重 | 真实 API/SQLite | tests/api/article-library.test.ts | 两次新请求、重放、相同 ID 不同标题/操作 | 不同文章、初始修订，重放无副作用 |
| LIBRARY-LIST-003 | 稳定分页与空态 | API/UI | tests/api/article-library.test.ts；tests/e2e/article-library.spec.ts | 空库、同时间同标题多稿、超界游标 | 不漏/重复，无全文，空态与错误区分 |
| LIBRARY-OPEN-004 | 打开与最近稿 | API/UI | tests/e2e/article-navigation.spec.ts | 两稿两标签、刷新/重启 | 各页独立，重开最近稿 |
| LIBRARY-SWITCH-005 | 切换保护 | UI | tests/e2e/article-navigation.spec.ts | 迟到保存、离线副本/失败、冲突、真实 IME 手工 | 旧结果不改新稿；不能安全保留则阻止 |
| LIBRARY-RENAME-006 | 唯一标题与冲突 | API/UI | tests/e2e/article-library.spec.ts；tests/api/article-library.test.ts | 有历史的正文，远端先保存 | ID/正文保留、新修订、旧基线拒绝 |
| LIBRARY-TAGS-007 | 标签与元数据基线 | 集成/API/UI | tests/integration/article-library.test.ts；tests/e2e/article-library.spec.ts | 规范化标签、相同基线两请求、重复 ID | 去重限额，CAS，正文 head 不变 |
| LIBRARY-FIND-008 | 标题与标签查找 | API/UI | tests/api/article-library.test.ts；tests/e2e/article-library.spec.ts | 中文、百分号、同名和状态 | 字面过滤，游标只作用于当前查询 |
| LIBRARY-ARCHIVE-009 | 归档只读 | 集成/UI | tests/integration/article-library.test.ts；tests/e2e/article-lifecycle.spec.ts | 另一个仍编辑的标签 | 保留历史、拒绝新正文写、可取消归档 |
| LIBRARY-TRASH-010 | 确认软删除 | UI/API | tests/e2e/article-lifecycle.spec.ts；tests/api/article-library.test.ts | 取消/确认、未保存稿、过期状态 | 保留正文/副本，取消不变，指针安全 |
| LIBRARY-RESTORE-011 | 恢复原状态 | 集成/UI | tests/integration/article-library.test.ts；tests/e2e/article-lifecycle.spec.ts | 活动/归档来源和重复请求 | 身份/标签/历史不变，返回原状态 |
| LIBRARY-POSITION-012 | 文章位置 | UI | tests/e2e/article-navigation.spec.ts | 同修订、已变修订、非法坐标/存储失败 | 恢复或安全回文首，不改正文 |
| LIBRARY-FAILURE-013 | 边界失败与访问控制 | API/集成/UI | tests/api/article-library.test.ts；tests/e2e/article-library.spec.ts | 无会话/跨源/非法数据、SQL trigger 异常 | 不泄漏、不留半状态、旧稿仍在 |
| ARTICLE-CREATE-001 | ensure 与显式新建区分 | API/UI | tests/api/article-library.test.ts；tests/e2e/article-save.spec.ts | 空库并发 ensure、多稿已有最近 | ensure 不重复创建，打开正确最近稿 |
| ARTICLE-SAVE-002 | 原保存/重启兼容 | API/UI | tests/api/article-persistence.test.ts；tests/e2e/article-save.spec.ts | 中文/格式稿 | 内容和标题投影保持一致 |
| ARTICLE-RETRY-003 | 已提交重放 | 集成/UI | tests/integration/article-store.test.ts；tests/e2e/article-save-races.spec.ts | 丢失响应、较新 head | 不重复版本，旧返回不改新稿 |
| ARTICLE-KEY-004 | 不同载荷复用键 | API | tests/api/article-persistence.test.ts；tests/api/article-library.test.ts | 跨 ensure/create/save 请求 | 409 且原数据不变 |

## Red and baseline

新增真实 API 首先验证缺失路由/行为的 Red，迁移检查已有有效 schema 2 夹具在新版本首次打开后的结果；不以 import 缺失冒充 Red。C02 的保存、去重、冲突、浏览器副本和恢复回归记录 baseline-pass。UI 必须经真实页面/服务，不以 repository mock 代替。

## Required checks

G1：`node scripts/harness/check.mjs manage-article-library --stage plan`、`corepack pnpm exec openspec validate manage-article-library --strict --no-interactive`、`corepack pnpm check:docs` 与 17 场景语义自检。

各步骤按影响执行 Vitest、类型/lint/依赖边界或真实 E2E，并更新进度后提交。G2：锁定依赖安装、`corepack pnpm verify`、`corepack pnpm test:e2e`、目标 Mac `corepack pnpm test:storage-performance`、真实 Linux CI；生成新 change 的 verification/evidence.json，执行 Harness verify 与 strict 校验。沿用已有入口，无新增测试框架。

导航加入后需本机真实中文输入法检查：候选窗期间点击切换/新建不切稿，结束选词后保留最新输入再导航。C02 手工反馈不自动覆盖新增导航；等待真实反馈时继续独立自动验收。桌面与 375px 窄屏复核列表、保存选择、归档/删除确认及回收站。

## Scope and fixtures

只用临时工作空间与测试稿，不操作个人数据。旧 schema 使用固定旧版 DDL；迁移错误用 SQLite 约束/夹具注入，日志注明模拟边界。列表/生命周期调用真实 SQLite 和认证 API。旧版本程序拒绝 schema 3 属预期兼容边界；不执行自动降级、永久删除、模型或博客调用。

## 导航切片具体边界

article-navigation.spec.ts 覆盖两标签独立/重开、保存最新输入、实际未决响应等待、未知结果副本往返及重放、未选择恢复副本保留、IDB 容量拒绝、标题/正文组合输入阻断、冲突稿恢复、目标读取失败保持原稿与只在导航期间锁定输入、离线失败、固定 mutationId 重试。新增真实 IME 候选窗仍须手工，不用组合事件测试替代。

## 文章库 UI 切片具体边界

article-library.spec.ts 覆盖 23 篇真实分页、当前项、可选标题新建、未知新建结果按原请求重试、加载/失败/重试及刷新后迟到响应失效、空库显式创建、标题长度与组合输入阻断、明确 409 拒绝后取消。拒绝响应在 UI 测试使用协议层注入，真实状态拒绝已由 article-library API 验收覆盖。桌面和 375px 窄屏截图人工复核，真实输入法按用户反馈保持待检查。
