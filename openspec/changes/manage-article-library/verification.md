# C03 验证报告

日期：2026-11-18。C03 尚在验收。4.4 已将已有功能接到 V3 写作台。作者此前确认中文输入正常。新版界面的自动验收见文末 4.4 记录，Linux CI 与逐项真实候选窗记录分别标注。

## 4.3 时的实现与验证基线

当时的产品代码基线 `add70c7`，性能脚本基线 `62a4cf44d504d0c667eb456090884d919ebdd09e`；其后收口仅更新文档和证据，不改被测产品代码。subject 指纹覆盖当前 delta、实现、测试、配置、依赖、夹具和开发规则，证据文件不自我引用。

- 本机 Node 22.22.2 / pnpm 10.34.9 / Apple M1 Pro / Darwin 25.6.0 arm64。
- `fnm exec --using 22.22.2 corepack pnpm verify`：exit 0，90 个应用测试、10 个 Harness 测试；格式、lint、类型、依赖边界、构建、文档与 OpenSpec 校验通过。日志 `evidence/position-checks.log`。
- `fnm exec --using 22.22.2 corepack pnpm test:e2e --workers=4`：exit 0，118 个真实 Chromium 用例通过；顺序执行，未与 verify 并行重建 dist。日志 `evidence/position-regression.log`。
- 位置专项 7 项通过；初始 4 项有效 Red，后补失败/竞争边界。修复恢复帧早于布局提交造成的短文偏移，保留失败日志；不是扩大允许误差。日志 `position-red.log`、`position-layout-failure.log`、`position-green.log`。
- `fnm exec --using 22.22.2 corepack pnpm test:storage-performance`：exit 0。普通稿/最大稿保存 p95 12.28/102.13 ms，普通稿事件循环 10.06 ms；千篇库 300 个匹配项完整分页，45 样本 p95 1.79 ms，列表不含正文。门槛于测量前确定，详见 [性能验证](../../../docs/validation/article-storage-performance.md)及 `evidence/library-performance.log`。类型、lint、格式复核通过。
- Linux CI：[Checks run 44209951096](https://github.com/lotusp/inkling/actions/runs/44209951096)，提交 `62a4cf44d504d0c667eb456090884d919ebdd09e`，真实 ubuntu-latest runner，Node 来自 .node-version；锁定依赖安装、Chromium 安装、verify 与 E2E 全成功。90 个应用、10 个 Harness、118 个浏览器测试通过，job 3m29s；`evidence/linux-ci.log` 保留完整 verify/E2E 输出。
- 桌面及 375px 布局已在各切片复核；列表、整理、查找、生命周期及回收站截图保留于 evidence。所有写入使用隔离临时测试空间，没有改个人稿件或开放远端发布。

## 场景覆盖与证据边界

acceptance.md 保留 17 个唯一场景，已修正早期计划中尚未拆分测试文件的入口。最终完整回归覆盖全部自动用例；下列 IME 相关场景的完整验收仍 blocked，自动化 composition 事件不能替代真实候选窗。

| ID | 实际入口与主要断言 | 结论 |
| --- | --- | --- |
| LIBRARY-MIGRATE-001 | integration/article-library：固定 schema 2、迁移/重开、DDL 和完整性故障回滚 | 自动通过 |
| LIBRARY-CREATE-002 | api/article-library、e2e/article-library：独立新建、重放、输入/失败/空态 | 自动通过；新建 IME 待检查 |
| LIBRARY-LIST-003 | api/article-library、e2e/article-library：同时间稳定分页、无正文、加载失败与空态；千篇性能 | 通过 |
| LIBRARY-OPEN-004 | api/article-library、e2e/article-navigation：打开事务、最近指针、标签页独立、失败保留 | 通过 |
| LIBRARY-SWITCH-005 | e2e/article-navigation：未决保存、冲突、副本写失败、离线/迟到、选词 | 自动通过；真实 IME 待检查 |
| LIBRARY-RENAME-006 | api/article-library、e2e/article-organization：唯一标题 CAS、最新正文、新输入保护 | 自动通过；整理 IME 待检查 |
| LIBRARY-TAGS-007 | api/article-library、e2e/article-organization：规范化、独立 CAS、未知提交核对、拒绝/新输入 | 自动通过；整理 IME 待检查 |
| LIBRARY-FIND-008 | api/article-library、e2e/article-search：字面过滤、精确标签、分页/旧响应隔离、非法输入 | 自动通过；查找 IME 待检查 |
| LIBRARY-ARCHIVE-009 | api/article-library、e2e/article-lifecycle：只读与禁止新写、原稿保护、核对与恢复编辑 | 自动通过；归档 IME 待检查 |
| LIBRARY-TRASH-010 | api/article-library、e2e/article-lifecycle：确认/取消、状态 CAS、副本失败、原请求与交接重试 | 自动通过；回收站操作 IME 待检查 |
| LIBRARY-RESTORE-011 | api/article-library、e2e/article-lifecycle：保留身份/历史/标签、回到原状态、重复不复制 | 通过 |
| LIBRARY-POSITION-012 | e2e/article-position：修订绑定、反向选择/滚动、非法/旧位置、存储失败、延迟帧取消 | 通过 |
| LIBRARY-FAILURE-013 | api/article-library、e2e/article-library/lifecycle：认证/同源/参数、SQL 故障回滚、可重试 | 通过 |
| ARTICLE-CREATE-001 | api/article-library、e2e/article-save：ensure 与显式新建分离、不重复、不回退指针 | 通过 |
| ARTICLE-SAVE-002 | api/article-persistence、e2e/article-save：保存/服务重启/格式与标题投影 | 通过 |
| ARTICLE-RETRY-003 | integration/article-store、e2e/article-save-races：提交重放、较新 head、新输入保留 | 通过 |
| ARTICLE-KEY-004 | api/article-persistence、api/article-library：跨文章/载荷/操作复用 ID 拒绝 | 通过 |

## 自检记录

本轮为同一执行者自检，无独立评审。审阅 `master...62a4cf4` 差异、delta 与验收入口，重点复查：

1. 增量迁移及新建/标题投影/标签/生命周期在 SQLite immediate 事务中执行；迁移失败不留下 schema 3 半状态。原 C02 正文/修订权威不变，库只存投影；查询绑定参数、按时间和 ID 游标分页。
2. 标签/状态 metadata CAS 独立于正文 CAS；服务端限制归档/回收站的新写入。已提交请求重放允许核对历史结果，不重复副作用；UI 重新读取最新状态，不把重放快照当作当前状态。
3. 切换前保护未保存稿、等待副本队列，核对输入与 composition epoch；成功交接后以 React session key 隔离编辑器。库查询 generation 和状态读取 attempt 阻止迟到结果；不能安全保留时停留原稿。
4. 生命周期确认基线固定；结果未知先查 mutation，查无记录且 CAS 仍相同才重发原载荷。确认成功后交接失败独立重试，不重复状态操作；回收站无永久删除入口。
5. 位置存储绑定 workspace/article/revision，仅保存文本选择和滚动坐标；不含正文，不制造修订。非法/旧位置降级、存储异常提示，用户先输入会取消恢复帧。
6. 依赖仍为原 workspace 边界，无新增库；web 通过 contracts/API，领域状态转换无 UI/数据库依赖。实际 check:architecture 与边界负例通过。

发现并修正的文档问题：验收表仍引用拆分前的 organization/search/position 测试路径；知识索引仍称导航/整理未接入。已更新。此前的格式、布局时序与测试等待错误及修正保留在 progress 与失败日志，不删证据。当前未发现新的产品代码阻断问题；真实 IME 是剩余验收阻断，不是已证实的产品缺陷。

## 4.3 时的手工验收与收口记录

在最新版分别保持标题/正文拼音候选窗，尝试切换、新建、归档和移入回收站；应保持原稿，结束选词后重新操作，最新输入仍能保存或恢复。整理标题/标签和查找表单在选词期间不得提交。用户本日回复“仍待检查，先完成其余工作”，记录 `evidence/manual-ime-pending.log`，status=not-run、exitCode=null。

最终文档链接、plan 结构、OpenSpec strict 和 diff 空白检查均 exit 0，日志 `evidence/closeout-checks.log`。`node scripts/harness/check.mjs manage-article-library --stage verify` 实际 exit 1，日志 `evidence/g2-blocked.log`：仅未完成任务、blocked 结论和手工关联场景未通过；无缺失日志、缺失 delta 或过期指纹。141 项 subject 指纹已核对。此失败是如实执行 G2，不宣称验证全绿。

待真实反馈通过后，补操作环境与结果、刷新指纹，勾选 5.1b；必要检查仍有效后执行 Harness verify/G2。G2 通过才 archive、核对 Living Spec、merge 和 G3；随后开启 C04。不要把当前 blocked 的证据当成可合入许可。

## 4.4 正式写作台的本机验收

旧界面下，桌面与 375px 的写作台用例均因找不到闻一图标而失败。旁稿整理用例在等待标签可编辑时失败，旧入口要求先切换文章。保留了正文、版本和恢复测试的原有数据断言。最终本机验收使用临时工作空间及真实 SQLite，顺序执行构建校验、浏览器回归和性能测试。

| 检查 | 结果 |
| --- | --- |
| 工程检查 | 格式、lint、类型、依赖边界、构建、90 项应用测试、10 项 Harness 测试、文档及 OpenSpec 检查通过 |
| Chromium | 122 项全部通过。包含桌面和窄屏切换、大纲跳转、长文返回原段落、旁稿整理、改名回复丢失与并发冲突，以及普通和专注模式下载最新草稿 |
| 原型 | 4 项独立交互回归通过 |
| Mac 性能 | 常规稿与上限稿保存、千篇文章的分页与筛选通过原有阈值 |

[本机运行日志](evidence/desk-v3-checks.log) · [桌面稿纸](evidence/desk-v3-desktop.png) · [窄屏稿纸](evidence/desk-v3-mobile.png) · [窄屏文章库](evidence/desk-v3-library-mobile.png)

作者已反馈“中文输入没问题”。该反馈早于新版界面，尚无新入口逐项使用系统候选窗的记录。Linux 通过记录对应旧提交 `62a4cf4`。本轮只在本机验证，C03 的 G2/G3 仍待收口。

4.4 的实现提交为 `e938057`。当前 evidence.json 已更新至该提交；本机检查通过，关联 Linux 或手工结果的整体验收行仍待完成。[G2 实际执行记录](evidence/desk-v3-g2.log)

## 4.5 两处面板的原型一致性

比对当前 V3 HTML、用户截图与正式应用。桌面 1280px 和窄屏 375px 均验证单框搜索、菜单项及禁用状态、一键保留、搜索版本和行内比较。额外验证了组合输入后的标签片段匹配、跨页的真实篇数、全部文章排除回收站、手动保存保留已有命名，以及迟到回复和恢复确认。素材、已发表、导出文件、发布到博客和写作偏好按尚未接入呈现。

本机工程校验通过，91 项应用测试、10 项 Harness 测试、125 项 Chromium 测试、4 项原型浏览器测试通过，存储及千篇文章查询性能检查通过。预览使用原 v3-preview 工作空间。新版 Linux 和分项真实候选窗记录待 C03 收口。

[本机校验日志](evidence/rail-checks.log) · [桌面文章库](evidence/rail-library-1280.png) · [桌面历史](evidence/rail-history-1280.png) · [窄屏文章库](evidence/rail-library-375.png) · [窄屏历史](evidence/rail-history-375.png)

## 4.6 工作台按钮逐组核对

基准为仓内 V3 HTML。双端用例在全新的浏览器上下文运行，正式应用使用独立的临时 SQLite 工作空间。历史预览用两份不同的正文验证增删方向，选中“当前稿”后再改一次正文，随后切到历史稿并结束比较。只读和失败路径通过正式 API、并发标签页与故障注入分别验证。

| 入口 | 浏览器核对的操作与结果 |
| --- | --- |
| 文章库与新建 | 顶栏打开、收起、Esc、一键新建、列表打开。空稿聚焦正文，已有未保存输入触发保存或保留草稿。回包丢失时重试同一请求。 |
| 搜索与范围 | 标题或标签片段搜索、无结果清除、写作中、全部、已归档、回收站、篇数；另测精确标签、高级组合查找、刷新、翻页与失败重试。列表条件随切稿保留。 |
| 文章行末菜单 | 写作中分别显示重命名、编辑标签、归档和移入回收站。前两个入口各有一个字段，支持保存及取消，旁稿整理后保留当前文章与查询。另测其他标签页改名、标签冲突、核对重试与组合输入。 |
| 归档与回收站 | 归档后只读，移回草稿可继续编辑；移入回收站前可取消，恢复回到删除前状态。正式应用按真实数据契约确认目标和版本，遇到未确认输入可先保留草稿。原型归档后可点“撤销”，正式应用通过“移回草稿”撤回。 |
| 正文、大纲、专注 | 选区旁的段落格式可整段加粗、小标题或列表，正式编辑器另支持代码块。大纲添加章节后可直接输入并跳回章节。打开侧栏与退出专注时保留文章和阅读位置。双端测试宽度为 1280、900、375px。 |
| 版本历史 | 保存版本、按日期/名称/版本号查找、展开和收起自动备份、行末命名、历史版本恢复预览、返回与确认。只读归档可比较，当前头版本没有恢复自身的按钮。 |
| 版本比较 | 单击行内“比较”固定来源，默认对照当前稿。一个下拉框可切到其他历史稿；增删分行，格式变化另标，内容相同有空态。结束返回列表。 |
| 闻一、讨论与素材 | 原型点测对话发送/停止、新讨论、历史切换、推敲、查依据、审阅、定位、忽略、收藏溯源、加入章节、选区改写及撤销，以及附加资料、保存链接和从随记起稿。正式应用验证助手的打开、关闭与发送禁用；素材、AI 生成仍待后续 change。 |
| 偏好、导出与发布 | 原型实测偏好保存/重开、记忆保存/撤回、下载 Markdown、勾选确认后模拟发布与“已发表”筛选。正式应用验证导出、发布、偏好和已发表入口禁用，顶栏菜单没有保存状态。 |
| 正式应用的数据保护 | 保存异常、重新连接、下载最新草稿、草稿恢复、冲突对比和显式合并均沿用真实数据路径。原型使用浏览器内示例状态。 |

保留的可见差异还包括正式文章库的稳定创建顺序、分页和高级搜索，版本选择器可直接选择已读取的自动备份。原型归档稿有独立的只读页面和历史弹窗，正式应用通过稿纸的只读状态、文章行菜单和版本侧栏操作。正式稿中的冲突处理、恢复确认与未确认写入的重试以真实状态为准。

相同的七条交互路径分别跑在 V3 和正式应用，另有八条独立原型用例。全量 139 项 Chromium 回归、91 项应用测试和 10 项 Harness 测试通过。长稿选区工具曾导致正文偏移约 52px，保留工具栏的布局高度后，原有阅读位置断言全部通过。与当前稿的比较曾停留在点击时的快照，修正后继续输入也能看到新改动。预览 4317 返回的脚本和样式已与构建逐字节核对。当前提交仅在本机验收；C03 的 Linux CI 与逐项系统输入法记录仍待收口。

[原型比较卡](evidence/buttons-comparison-prototype.png) · [正式比较卡](evidence/buttons-comparison.png) · [文章行菜单](evidence/buttons-article-menu.png) · [重命名窗口](evidence/buttons-rename.png) · [本机验证日志](evidence/buttons-checks.log)
