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

### 查找与筛选切片

3.2a 列表增加可选 `q`、`tag`。q 为原样字面片段（至多 100 Unicode 字符，不剥离有意义空格）；空字符串等同不筛选。标签复用单行 NFC/trim 校验，空参数等同不筛选，非空上限 30 字符；大小写敏感。两个条件同时存在时取交集。SQL 参数绑定，通过 `instr(lower(title),lower(q))` 实现中文与 ASCII 不区分大小写的字面标题查找，百分号、下划线、反斜杠和引号不解释为模式；通过 EXISTS 查询精确标签，不读取正文、不改变版本和最近指针。当前只查 active，生命周期状态入口留在 4.x。

3.2b 表单显式“查找文章”，标题和标签均可留空；“清除筛选”立即回到全部活动文章。输入尚未提交时保持已应用条件的结果和提示；查询条件改变会清空旧结果并重置分页。下一页、刷新和重试始终携带已应用条件；旧请求不能覆盖或追加到新查询。初次空库、无匹配、请求错误分别显示；查找失败不影响正文/整理表单。组合输入期间不能提交或清除筛选，结束选词后需重新操作。服务端游标仍为创建时间/ID，不是带查询签名的快照；客户端负责条件变更时重置，不把翻页中的外部修改伪装成一致性快照。

### 生命周期服务端切片（4.1）

状态转换仅允许 active→archived（archive）、archived→active（unarchive）、active/archived→trashed（trash）、trashed→previous_state（restore）。每次真实转换推进 metadata_version；不同请求对不适用状态重复操作返回 `INVALID_LIFECYCLE_TRANSITION`，同 mutationId 原载荷则返回原结果。先重放，再检查元数据 CAS（`METADATA_CONFLICT`），最后检查转换；标签先提交也使旧确认失效。正文 head 的推进不使元数据 CAS 失效，服务端按事务顺序保存已经提交的内容，未提交输入由 4.2 的导航保护处理。

`POST .../lifecycle` 返回 `{mutationId,metadata}`。状态、previous_state、版本、时间、最近指针和 mutation 同一 immediate 事务提交；不新增正文修订、不改变标签/历史/名称。归档和移入回收站只在目标恰好为最近指针时清空指针。状态更新、指针更新或 mutation 记账任一失败，全部回滚。schema 3 已有所需字段，不再次迁移。

`GET /api/articles` 增加 state（active/archived/trashed，默认 active），沿用标题/标签交集和稳定游标。正文与历史读取拒绝 trashed（`ARTICLE_TRASHED`），归档仍允许读取及 open。open 继续返回 ArticleSnapshot，状态由已有 metadata 接口读取；旧幂等结果不扩展字段，也不得用旧快照推断当前状态。save、正文 restore、name 的新请求必须 active（`ARTICLE_NOT_ACTIVE`）；标签写入沿用相同限制。所有操作先查询已提交请求，保障归档/删除后原请求核对仍返回原结果，且不重新执行。

workspace 读取保留有效的显式最近指针（包括后来主动打开的归档项）；指针为空、缺失或指向回收站时，按 updated_at DESC / created_at DESC / article_id DESC 返回最近 active，若无则 null。此读取不写指针或创建文章。主动打开归档后刷新仍可只读重开；归档当前活动文章时则清空指针并回退活动稿。ensure-current 只复用 active：归档指针先找活动稿，没有才显式新建；采用活动稿时同事务记下指针。重复 ensure 原请求依旧仅返回历史结果。这里的“最近”是最近更新/整理，不宣称保存逐篇访问历史。

本步骤交付受保护 API 和状态约束，4.2 再接状态入口、只读编辑器与浏览器副本保护；不把 API 测试当作生命周期 UI 验收。

### 生命周期界面切片（4.2a / 4.2b）

4.2a 打开正文时读取当前 metadata，不从历史 mutation 推断可编辑性。归档稿禁用标题/正文/格式/命名/版本恢复和恢复副本写入，保留历史比较、下载与安全导航。其他标签改变状态时，以服务端拒绝和显式“核对文章状态”为同步点，不宣称实时订阅；拒绝保存后原输入、pending 和浏览器副本保留，不能用服务器正文替换。本页状态未能确认时停写，重新核对成功才恢复权限；核对仅改变权限，不改正文或确认未保存内容。保护期间不能打断中文候选窗来发起状态核对。

4.2b 文章库增加三种状态视图，切换状态重置分页并失效旧请求。活动/归档项可打开，回收站项仅元数据和恢复。当前文章提供归档/取消归档/移入回收站；其他稿件先安全打开后操作。删除前显示明确确认及保留历史/副本说明。确认使用打开确认框时读取的 metadataVersion，不自动重基线；失败可取消并重新查看最新状态。确认期间正文可继续输入，实际执行时重新保护最新输入，选词或保存执行中阻断。

状态操作复用 prepareNavigation：有未保存/冲突/待恢复记录时明确保存或 strict 保留副本，失败不发送生命周期请求。已知只读稿只能保留未保存副本。命令身份固定，结果未知先查 mutation；查无结果且元数据基线未变才重发，基线已变则旧 CAS 不可能提交，要求重新确认。核对失败不盲重发；首次明确拒绝可取消，后续拒绝不能抹去更早未知操作。确认提交后读取最新元数据再交接，不能因后续打开失败重复操作。当前稿归档/取消归档重新进入同 ID 的新会话，移入回收站则安全进入最近活动稿或空态。交接前等待草稿写队列，再切换 owner。回收站恢复其他稿只更新列表，保留当前编辑器。操作后列表重新加载，状态视图保留、筛选重置并明确显示。尚未核对的操作离页时给出提示。
