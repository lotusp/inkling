# Change design

## Context and boundaries

C02 已交付，沿用 [DEC-0004](../../../docs/decisions/0004-article-storage-and-revisions.md)、SQLite 独占连接和 JSON 正文权威。core 用例与 ArticleRepository 增加文章库操作；adapters 实现 SQL，server 负责受保护 HTTP，web 只依赖 contracts。复用同一连接/事务，不增加 ORM、第二数据库或后台 Agent。

## Decisions and contracts

### 存储与迁移

schema 2→3 为增量迁移，新增 `article_library`：article_id 主键/FK、title（当前正文标题的列表投影）、state（active/archived/trashed）、previous_state（回收站来源，其他状态为 null）、metadata_version（初始 1）、created_at、updated_at。初始状态约束及投影在 SQL 事务中保持。另建 `article_tags(article_id,tag)` 复合主键/FK，标签按文章隔离。列表索引为 state/created_at/article_id。

迁移在已有独占锁内以一个事务创建表、从当前 head 回填标题和时间并提升 user_version；不改写 articles/revisions/markers/mutations 的既有记录。回填逐行完成读取后写入，不在活跃 SQLite iterator 中写同一连接；quick_check/foreign_key_check 在迁移事务内通过后才推进 schema，完整性失败同样回滚。不做破坏性变换，不需要为了本次加表先引入完整备份系统；迁移失败回滚、旧 schema 与数据保留。旧程序拒绝 schema 3，回退程序不能直接打开已升级目录，也不自动降级。新建空空间依次建立 C02 schema 后迁移。历史损坏沿用 C02 检查，非法 head JSON 导致迁移拒绝，不能替换空标题掩盖问题。

标题只有 document.title 一个权威。article_library.title 是可重建投影，在新建、save、restore 的同一事务更新；name revision 不更新文章标题。列表仅查元数据，不为每页解析正文或加载历史。

### API 与排序

沿用当前认证、Origin/CSRF、逻辑 UUID 和错误 envelope。所有写操作必须带 mutationId；不同操作/载荷复用 ID 返回 IDEMPOTENCY_MISMATCH，重放返回原结果，不再次修改全局最近文章指针。

| API | 契约 |
| --- | --- |
| POST /api/articles | `{mutationId,title?}`，标题默认空，≤200 Unicode 字符；每个新请求产生新文章、初始修订、标记、元数据和 mutation，更新最近指针，同事务提交；返回 ArticleSnapshot |
| GET /api/articles | `{limit:1..100=20,beforeCreatedAt?,beforeId?}`，两个游标字段必须成对；按 created_at DESC / article_id DESC，limit+1 判定后续；返回 items 与 nextCursor，不含 document。后续切片增加 state/q/tag 过滤 |
| POST /api/articles/:id/open | `{mutationId}`，目标存在且不在回收站；返回最新 snapshot/元数据，记录最近文章；归档项只读 |
| PUT /api/articles/:id/content | 沿用 C02；库中重命名先读该 ID 当前版本，修改标题后用原基线保存，不拼接另一份旧正文 |
| PUT /api/articles/:id/metadata | `{mutationId,baseMetadataVersion,tags}`，替换标签；CAS 与 mutation 同事务 |
| POST /api/articles/:id/lifecycle | `{mutationId,baseMetadataVersion,action}`：archive/unarchive/trash/restore；CAS 与 mutation 同事务 |

稳定排序选择创建时间而非修改时间，避免正文自动保存让文章在翻页时移动；相同时间用 UUID 破同序。翻页期间新增文章需刷新首屏看到，不承诺跨请求数据库快照。未命名在 UI 显示“未命名文章”，不存占位字符串。同名合法，用 ID 区分。

标题查找用字面片段，q ≤100 字符；%/_ 不作通配符。中文直接匹配，ASCII 大小写不敏感，不承诺拼音/分词。标签去首尾空白、Unicode NFC、去重，最多 10 个，每个 1–30 Unicode 字符；标签区分大小写；筛选用精确标签。C03 不扫描正文全文。

切片 2.1 先开放 active 文章，其他状态明确拒绝，返回 ArticleSnapshot；归档只读打开与元数据响应在生命周期切片 4 一起接入。重放仅返回原请求结果，客户端重新读取目标最新 head，不能把旧 snapshot 当作当前正文。

### 元数据与生命周期

metadata_version 只随标签/状态变化推进，与正文 head 分开；正文保存不会制造无关标签冲突。active 可编辑，archived 只读，trashed 仅回收站元数据可见；历史/正文在归档中可读，回收站 UI 不提供正文编辑。原已提交请求重放仍可查询，但不绕过新的写状态检查创建版本。save/restore/name 在非 active 上拒绝，浏览器保留输入。

trash 保存 previous_state；restore 回到该状态。不支持永久删除、自动清空或回收文件。归档/删除当前文章将 workspace.current_article_id 清空，首次载入从最近可用 active 文章取回，若无则空态；ensure-current 只在明确“开始写作”时按 C02 幂等规则建立初稿。活动标签不订阅全局最近指针，其他标签打开或新建不会强制切换当前正文。

### 前端会话与交互

工作台增加可收起文章库，窄屏作为独立面板；每项显示标题、状态、标签及打开动作。新建按钮进入标题可空的创建流程，成功后进入新稿；列表加载/查找/写入失败保留现有稿件，明确“重试”，不能当空列表。

文章会话用 articleId 作为 React key/请求代次；切换创建新的 useArticle 生命周期，旧异步闭包只能更新旧文章记录。先统一加入导航协调器，再接打开/新建 UI，不能只把 head ref 改成新 ID。

- clean：保存编辑位置后直接切换。
- dirty：提供“保存后切换”或“保留草稿并切换”，后者必须等 IndexedDB strict 事务完成；失败阻止离开并保留救援下载。
- saving：实际保存/核对仍在执行时阻止切换，等待其结束后重新操作。请求结束但结果未知时，可显式保留 pending+draft 后切换，不生成另一个 mutation 重发旧内容。
- conflict/待恢复副本：先处理或明确保留副本；不清理未选择记录。
- IME：候选期间阻止导航，新确认必须在结束选词后执行。

导航保护期间冻结标题/正文并阻止恢复、合并和版本写入入口；读取目标最新 head 成功后才卸载旧编辑器。失败解锁原稿，保留同一导航 mutationId 重试；新输入需重新保护。成功交接前等待旧 IndexedDB 写队列结束，换用新的草稿 owner，未选择恢复记录原样保留。目标 snapshot 作为新会话初始数据，不依赖全局最近指针重新选稿。最小打开入口随 2.1b 验证，完整面板在 2.2 接入。

编辑位置在浏览器按 workspace/article 保存 revisionId、selection anchor/head、scrollTop，不进入文章修订或服务端正文。恢复前校验相同修订与合法坐标；版本变化回文首。不支持浏览器存储时只失去位置便利，不阻止保存并明确区分正文副本错误。新 key 的编辑器恢复位置不会修改正文。

## Failure and recovery

新增 create 与已有 ensure 的操作 hash 必须不同；重放创建 A 后再打开 B 不能把最近指针退回 A。失败事务不留下无头文章/未记账副本。标签和状态写失败不推进版本。列表/打开错误不清空原编辑器。所有现有 C02 故障、中文输入、冲突与历史恢复回归必须保留。

迁移测试使用由固定 C02 DDL 生成的真实 schema 2 夹具，不用删掉新表伪造旧格式；注入迁移异常验证原表数据/user_version 保留。永久删除、跨设备副本与整库导入不在本 change 范围。

## Alternatives and risks

不采用另存 articleName（会出现两个标题）；不把标签当正文修订（避免整理标签制造文章版本）；不使用 offset 翻页（插入导致跳项）。列表投影更新遗漏、切换期间迟到响应、生命周期与编辑竞争是主要风险，各自建立事务/API/E2E 验收。

启动全历史 hash 扫描沿用 C02，文章数量增长会增加启动耗时；本轮不以文章库为由降低校验。先覆盖实际列表分页与返回体不含正文，搜索性能在真实量级夹具下观察；不擅自添加全文索引。

## Delivery

按 tasks 切片实施：先完成 schema 兼容、新建/列表真实 API，再接安全导航；随后标题/标签、查找、生命周期与位置。每一步 Red/Green（已有行为记 baseline-pass）、必要回归、文档及本地 commit。G1 后直接按已授权范围推进，不另设设计签署。G2/G3 与最终 push 按届时用户授权执行。

### 文章库面板切片

2.2 采用工作台上方可收起的独立文章库面板，保持正文与讨论布局；桌面三列卡片，窄屏单列，列表区域独立滚动。默认折叠，不持续占用正文空间。列表每页 20 项，刷新重新从首屏开始，下一页失败保留已显示内容并重试原游标；请求代次失效后忽略迟到结果。当前文章标题采用当前已确认 snapshot，其他项目来自元数据。

新建标题可空，在发出导航意图前校验 Unicode 长度和标题选词状态。导航保护复用 2.1，不设第二条绕过保存的创建入口。新建/打开请求结果未知时保留原 mutationId 重试；首次请求被服务明确以 400/401/403/404/409 拒绝时允许取消。已有未知结果不能因后续重试被拒绝就清除原意图。用户于 2026-11-17 明确要求将新增真实 IME 检查暂记待检查；自动组合事件仍单独执行。

### 重命名与标签切片

3.1a 增加 `GET /api/articles/:id/metadata`，返回 ArticleListItem（含 tags）；列表同样返回 tags。`PUT .../metadata` 返回 `{mutationId,metadata}`，tags 去首尾空白、NFC、去重并稳定排序，规范化后最多 10 个、每个 1–30 Unicode 字符；标签为单行，拒绝内部 CR/LF/Unicode 行分隔符，确保一行一个的表单可往返编辑；空数组清空。请求 hash 使用规范化命令，等价标签表达视为同一请求；不同语义/文章/操作复用 ID 拒绝。先重放，再校验 active 与 metadata CAS；同标签不推进版本，但仍记录请求。真实变化、去重记录在同一事务，不修改正文 head、修订数或最近指针。GET 和列表仅查元数据。

3.1b 文章卡片增加“整理”。非当前文章先经导航协调器安全打开，再进入整理面板；不另开可覆盖旧正文的后台重命名路径。当前文章改名以本页最新正文和已确认 head 作为 CAS，调用现有保存/恢复副本协议，允许保留未保存正文；实际保存、未知请求、冲突或选词未结束时要求先处理。迟到响应不能替换新输入，失败后新标题留在正文草稿中，普通保存入口负责核对和重试。

标签独立提交。编辑面板读取基线，标签请求使用固定 mutationId；未知结果先查 mutation，未提交且基线仍匹配才重发原命令。保存期间新标签输入保留，确认不会替换它；服务器标签已推进时提示冲突并展示最新值，由作者显式重新载入，不能静默重基线覆盖。整理面板打开时暂停文章导航，新标题/标签表单有未提交输入时关闭需明确放弃；未知标签结果需先核对。表单不增加新的浏览器持久化格式，刷新前离开提示保护尚未提交的标签/标题输入，不承诺浏览器崩溃后恢复整理表单。

整理表单关闭也校验组合输入状态，不仅校验提交按钮。标签首次 PUT 被明确拒绝可保留输入后显式关闭；如果更早操作结果未知，即使后续重试拒绝也保留原请求，必须继续核对。核对确认无 mutation 且 metadata 版本已经推进时，旧 CAS 已不可能写入，进入显式冲突处理。元数据读取期间允许继续输入，重新载入只有序号和组合输入代次均未变化时才替换表单。
