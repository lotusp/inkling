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

## 整理切片具体边界

`tests/api/article-library.test.ts` 覆盖标签规范化/Unicode 限制、独立 CAS、同值和清空、等价请求重放、跨文章/不同载荷冲突、权限/状态拒绝、写故障回滚。标题 CAS 保留正文和拒绝过期基线为已有行为 baseline-pass。

`tests/e2e/article-organization.spec.ts` 覆盖未保存正文中重命名、重命名冲突与迟到确认、跨文章整理先安全导航、标签不生成正文版本、未知结果核对而非盲重发、未提交请求按原载荷重试、核对失败不发送、冲突显式载入、迟到载入不替换新输入、较新远端标签不静默采用基线、首次明确拒绝可退出而拒绝重试不清除旧未知操作，以及表单组合输入期间保存/关闭阻断。桌面和 375px 截图复核；真实中文候选窗仍按用户要求待检查。故障注入只控制 HTTP 传输/拒绝，正常持久化使用真实临时 SQLite 工作空间。

## 查找切片具体边界

`tests/api/article-library.test.ts` 增加中文/ASCII 字面匹配、百分号/下划线/反斜杠/引号、NFC 精确标签及大小写、交集、空参数、参数长度、正文词不命中、只读不改变版本/指针、同时间排序与过滤分页/非活动排除。

`tests/e2e/article-search.spec.ts` 覆盖显式提交组合条件、无匹配与空库区分、清除条件、22 篇过滤分页后换条件重置游标、未提交新输入不改变刷新所用条件、旧下一页迟到不追加新结果、读取失败重试保持条件、非法输入保持原结果、两个输入框组合输入期间提交/清除阻断。真实 SQLite/认证 HTTP，网络延迟和失败使用传输层注入；桌面及 375px 截图复核。新增表单真实 IME 继续记待检查。

## 生命周期 API 切片具体边界

`tests/api/article-library.test.ts` 使用真实认证 HTTP 与临时 SQLite，覆盖四类状态转换、活动/归档两种恢复来源、状态与 q/tag 的分页交集、未知 ID/非法参数/权限、过期标签或状态 CAS、同请求重放及跨操作键冲突。验证归档可读正文/历史但拒绝新 save/restore/name/tags，回收站仅元数据可读；已提交写请求仍可核对，不能回退状态或最近指针。检查 head/正文/历史/名称/标签完整保留、无新增修订，最后活动稿归档后的空态与显式 ensure、归档只读重开、活动稿确定性回退。对状态/指针/mutation 写入注入 SQLite trigger 错误验证事务回滚，并用原命令成功重试。浏览器副本与另一标签未保存输入属于 4.2 的 E2E，4.1 不记为通过。

## 生命周期界面验收切片

`tests/e2e/article-lifecycle.spec.ts` 使用真实临时服务、认证和 SQLite。4.2a 覆盖归档重开只读、历史可读/比较但禁写、另一标签归档后的本页新输入保留、核对失败停写与显式重试、恢复副本下载/保留与取消归档后继续写作。4.2b 覆盖状态列表/迟到隔离、当前稿归档/取消归档、删除取消/确认/空态/回退、两种来源恢复、未保存输入保存或保留副本、过期 metadata 确认、响应丢失后原请求核对、查询失败不盲重发、已提交后交接失败不重复操作、组合输入阻断和窄屏。网络故障通过 HTTP 传输层注入，不替换正常存储。真实 IME 保持待检查，不能用 composition 事件测试代替。

## 编辑位置具体验收

`tests/e2e/article-position.spec.ts` 覆盖真实长文的选择与相对正文滚动在刷新及文章往返后恢复、方向保持、文章隔离、同稿新修订与非法/跨文章记录回文首、localStorage 拒绝后正文照常保存和导航、待恢复副本不误套坐标及恢复前用户操作不被回跳覆盖。通过正文 DOM 选择与真实窗口位置观察，不暴露测试专用编辑器 API；校验 head 与修订数不因位置变化推进。真实 IME 继续单独待检查。

## C03 性能与收口验证

在独立临时工作空间串行执行目标 Mac 基准，沿用 C02 的 60KiB/2MiB 保存、事件循环及重开 hash 扫描门槛。增加 1,000 篇真实 API 新建文章；每三篇加精确标签，每十篇归档或移入回收站，验证 active 标题+标签过滤与完整分页。首屏 30 次加完整游标分页，HTTP 往返（含解析）p95 ≤250ms；这是本机文章库交互预算，不推广为其他设备承诺。验证匹配 ID 完整无重复，列表原始响应无正文。样例和清理不访问个人目录。

先完成所有可执行自动验收并记录真实 Linux CI commit/run；真实 IME 独立待用户反馈。可先提交 blocked 的 verification/evidence，不能为门禁通过伪造手工结果或改成可选。G2/G3 通过之后才创建 C04。
