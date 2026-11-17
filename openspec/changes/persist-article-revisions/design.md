# Change design

## Context and boundaries

状态：C02 实施中，已按用户后续授权接入产品；实际完成情况见 progress.md，POC 不代替产品验收。决策见 [DEC-0004](../../../docs/decisions/0004-article-storage-and-revisions.md)，实验见 [POC 记录](../../../docs/validation/article-storage-poc.md)。

| 模块 | 本次职责 |
| --- | --- |
| apps/web | bootstrap/加载、编辑与保存协调器、IndexedDB 恢复副本、版本侧栏与差异、冲突及救援入口 |
| apps/server | 生命周期、凭证与会话、Origin/CSRF、请求限制、HTTP 到用例转换 |
| packages/contracts | 文章 DTO、严格正文 schema、请求/响应/错误；不依赖 ProseMirror 或存储驱动 |
| packages/core/domain | 版本基线、命名和恢复规则、容量、正文值对象；不依赖 Node/React/SDK |
| packages/core/application | ensureCurrentArticle、saveArticle、getMutation、listRevisions、nameRevision、restoreRevision；通过窄 port 使用事务存储 |
| packages/adapters | SQLite repository/迁移/生命周期；平台路径/时间/ID；依赖 core 的 ports |

编辑器节点支持集由当前 StarterKit 配置出发，应用层用严格 JSON schema 校验其子集和结构，不把编辑器实例传入 core。数据库与文件路径不能出现在公开 DTO 中。没有通用 Event Bus、event sourcing 框架、ORM 或额外服务。

## Decisions and contracts

### 1. 数据权威、目录和启动

选择 SQLite + JSON 主稿，使用 better-sqlite3 13.2.0、参数化 SQL 与按版本编号的事务迁移。依赖在正式实现时加入并锁定；当前 root package/lockfile 不变。

```text
~/Library/Application Support/Inkling/workspaces/default/
  inkling.sqlite          正文、修订、成功请求、恢复点/命名元数据
  inkling.sqlite-wal      运行中的日志，由 SQLite 管理
  inkling.sqlite-shm      SQLite 按模式需要时创建，不作为固定存在契约
  runtime-access.json     0600，仅保存本机重新接入所需的端口/随机 secret
  recovery/               明确操作后导出的救援包；不自动覆写原库
```

C02 固定一个默认工作空间，但内部保存稳定 workspace UUID。测试/开发允许启动参数 `--workspace <absolute-path>`，浏览器不能指定目录。目录 0700、数据文件 0600；路径 canonicalize 后检查文件类型与链接，默认拒绝应用创建文件位置的符号链接。操作系统同用户进程不是本次安全隔离对象。

启动先占用指定回环端口（尚未就绪时 API 返回 503），再打开独占数据库，检查/初始化 schema，最后对外报告 ready；失败关闭连接和监听。不同端口也不能让两服务同时写同一空间。使用单连接 `locking_mode=EXCLUSIVE`，WAL，`synchronous=FULL`，macOS `fullfsync=ON`，`foreign_keys=ON`，`busy_timeout=1000`，显式获取锁后才迁移，逐项读回校验。SQLite 管理进程退出后的锁释放，不使用 PID/TTL 文件强行抢锁。

初始化只对不存在的新库执行；已有非数据库/未知 schema/校验失败必须保留并拒绝写，不能删库再建。schemaVersion 存在 `PRAGMA user_version`；数据库版本与正文 schema 是两个不同版本。启动运行 `quick_check` 和外键检查，读修订时再核验内容 hash。C02 只首次建表，没有旧生产库迁移；后续破坏性迁移先提供备份。

### 2. 正文格式与容量

```ts
type ArticleDocumentV1 = {
  schemaVersion: 1;
  title: string;
  doc: ProseMirrorJson; // 公开契约使用本项目 JSON 联合类型，而非 SDK 类型
};
```

title 最多 200 个 Unicode code points（与 UI 保持一致，不对用户标题隐式 trim）；doc 必须以 doc 节点为根，采用当前允许的 paragraph/heading(level 2/3)/text/bulletList/orderedList/listItem/codeBlock/blockquote/hardBreak/horizontalRule 及现有 marks 白名单。严格校验父子结构、attrs、marks、链接协议；行内 code 与其他 marks 互斥，遵循当前编辑器 schema；不存在的节点与属性一律拒绝，不默默丢掉。plain text 保留原始换行与 Unicode，不做改变作者文本的归一化。canonical JSON 对对象键稳定排序、数组顺序不变；hash=SHA-256(canonical UTF-8 document)。完整请求 hash 另外包含操作、文章、base revision 和载荷。

C02 不引入段落稳定 ID。整稿 CAS 已能保证保存安全；C07 若需要段落锚点，采用显式正文 schema 迁移，旧修订仍保留其原格式，不能悄悄重写历史。

初始限制：正文 canonical JSON ≤2 MiB，节点 ≤50,000，深度 ≤32；HTTP JSON 上限 3 MiB，用于包含 envelope。允许的结构测试须覆盖全部当前编辑器实际输出，不能因 schema 过窄拒绝现有操作。只从同一逻辑 schema 渲染，不用不可信 HTML 注入。

保存正文不变时不生成内容修订，仍保存 mutation 的原结果。每篇累计修订正文 UTF-8 长度达到 64 MiB 提示占用，达到 256 MiB 拒绝增加新的正文历史（元数据和不改变内容的去重操作仍可进行）；容量在事务内检查。C02 不自动删除修订或命名版本；空间上限不是整体数据库磁盘上限，磁盘错误另行处理。将来显式压缩/保留政策需要新的行为契约。

### 3. 关系与字段

| 表 | 关键字段与约束 |
| --- | --- |
| workspace | singleton PK、workspace_id UNIQUE、current_article_id 可空、created_at；与最近文章更新同事务 |
| articles | id UUID PK、head_revision_id 非空、head_seq、revision_bytes、created_at、updated_at；头引用使用同 article 的组合外键，允许事务内延迟检查 |
| article_revisions | id UUID PK、article_id、seq、parent_revision_id、kind(initial/save/restore)、restored_from_revision_id、document_json、content_hash、byte_size、created_at；UNIQUE(article_id,seq)、UNIQUE(article_id,id)，parent/source 仅可引用同文章 |
| revision_markers | article_id、revision_id UNIQUE、automatic_at 可空、name 可空、updated_at；内容和元数据分离，命名不改修订内容 |
| mutations | id UUID PK（工作空间内全局唯一）、article_id、operation(create/save/name/restore)、request_hash、result_json、result_revision_id、created_at；同一 ID 不得跨文章/操作复用 |

所有成功命令的去重记录与业务变动同一事务；失败未提交不写成功记录。C02 不清理去重记录，因此历史重试有明确结果。初始创建用 `POST /api/articles/ensure-current`：事务内再次检查 current_article_id，两个不同创建 mutation 到达时也只得到同一个初始文章；初始化文章是空标题和一个空段落，seq=1。

### 4. API 契约

所有路径使用逻辑 UUID，不接受文件路径；请求体 strict schema，拒绝未知字段。除 health/静态页面/凭证交换外均要求会话。

| API | 请求要点 / 返回 |
| --- | --- |
| POST /api/auth/exchange | 一次性 bootstrap token → 会话 cookie、CSRF token |
| GET /api/workspace | workspace ID、schema 版本、current article ID/空，不自动创建文章 |
| POST /api/articles/ensure-current | mutationId → 当前或新建文章快照，首次 UI “开始写作”触发 |
| GET /api/articles/:id | document、headRevisionId、headSeq、contentHash、容量信息 |
| PUT /api/articles/:id/content | mutationId、baseRevisionId、document → SaveResult |
| GET /api/mutations/:id | 已提交的原结果或明确 not_found；只在已认证且库健康时可用于重试决策 |
| GET /api/articles/:id/revisions?beforeSeq=&limit=&all= | 倒序 keyset 分页元数据，每页默认 50、上限 100；all=true 显示全部，否则仅恢复点/命名记录；标识当前/自动/命名/恢复来源 |
| GET /api/articles/:id/revisions/:revisionId | 指定版本 document/hash；不存在或不属于文章返回 404 |
| PUT /api/articles/:id/revisions/:revisionId/name | mutationId、name（1–80 Unicode code points）→ 命名结果；允许显式重命名 |
| POST /api/articles/:id/restore | mutationId、baseRevisionId、sourceRevisionId → 新修订的 SaveResult |

SaveResult 包含 mutationId、articleId、appliedRevisionId、appliedSeq、contentHash、committedAt、changed。它只描述该请求结果，不假装是服务器最新 head；重放后客户端另读当前 head。重复响应保持一致。

错误采用 `{code,message,retryable,details}`：400 VALIDATION_FAILED，401 SESSION_REQUIRED，403 ORIGIN_REJECTED/CSRF_REJECTED，404 NOT_FOUND，409 REVISION_CONFLICT/IDEMPOTENCY_MISMATCH，413 DOCUMENT_TOO_LARGE，422 UNSUPPORTED_DOCUMENT，507 STORAGE_FULL/HISTORY_LIMIT，503 STORAGE_UNAVAILABLE，500 STORAGE_CORRUPT。冲突 details 给 current revision/hash，不返回任意文件路径。数据库不兼容在启动时拒绝进入可写状态。

### 5. 服务端保存事务

```text
验证会话/Origin/CSRF → 请求及正文校验、计算 request/content hash
BEGIN IMMEDIATE
  先查 mutationId：同 request hash → 返回原结果；不同 → 409
  校验 article 与 baseRevisionId：不匹配 → 409，绝不强制覆盖
  内容相同：记录 no-op 成功结果，不增加修订
  内容不同：检查容量 → 插入不可变 revision → 条件更新 head/seq/bytes
  按策略添加恢复点 → 写入完整 mutation 结果
COMMIT 成功 → 返回确认
```

禁止把网络、文件导出或模型调用放进事务；不对同连接并发执行异步事务。数据库写失败时回滚；提交结果不明时不构造成功响应，让客户端用 mutation 查询核对。同稿保存只串行进入短事务，查询/错误分类通过 adapter 返回，不暴露 SQL 错误栈。

restore 使用相同原子边界：先核对 mutation，再验证当前 base 和来源版本，复制旧正文为新的 seq/head，记录 parent=current、restored_from=source，创建自动恢复标记。即使恢复内容与当前相同，也记录一次显式 restore 修订（需经过容量限制）；这与普通 save 的 no-op 规则不同。

### 6. 浏览器保存状态机与 IndexedDB

编辑更新使用递增 editSeq。状态分为 loading / clean / dirty / saving / offline / conflict / storage_error。恢复副本状态（pending / durable / unavailable）单独呈现，不与“服务端已保存”混淆。

每次编辑按序排队把最新 doc/editSeq 写入 IndexedDB；使用 readwrite strict durability hint，只有事务 complete 后才能称为可恢复副本。按 `(workspaceId,articleId,clientId)` 隔离各标签页记录。clientId 来自 sessionStorage；使用浏览器 Web Locks 的标签页所有权避免复制标签页沿用同 clientId，无法取得时生成新 ID。旧草稿恢复是显式复制到当前 client，而不是抢占另一个活动标签页的 outbox。

outbox 同时保留：`ackRevisionId/ackDocument`、最多一个不可变 inFlight `{mutationId,baseRevisionId,document,editSeq,requestHash}`、最新 draft `{document,editSeq}`。首次发送前在一个 IDB 事务中持久化 inFlight；未决请求不改 payload、不换 ID，不允许第二个保存请求越过它。编辑期间的新输入只替换最新 draft，不修改 inFlight。

组合输入期间允许记录副本但不提交正文；compositionend 后正常调度。最后一次输入 1200 ms 后触发服务端保存，连续输入最长 10 s 触发一次（IME 正在组合时推迟），Ctrl/Cmd+S 立即调度。一个标签页最多一个在途保存；正常响应后如果 draft 更新，以新确认基线创建下一个请求。

旧响应只能推进 ack：只有响应对应当前 inFlight 且最新 editSeq/content 也匹配时才显示 clean；否则保留 draft 并继续保存。不要 setContent 旧响应，不删除新草稿。mutation 查询返回成功但 head 已被其他标签页推进时，若有本地差异进入冲突；无本地差异可以加载最新 head。

断线/未知结果恢复顺序：认证 → 查 inFlight mutation → 取当前 head → 判断冲突 → 原样重试未提交请求或准备新请求。mutation 不存在仅在成功查询后成立；超时/401/503 不能当作 not_found。显式重试仍受此流程约束。

刷新或重开页面列出同 workspace/article 下的恢复副本（时间、预览、标签页是否活动），默认不盲选“最新”覆盖。用户选择恢复时核对 mutation/head；基线相同可继续，基线不同显示两份并等待合并。明确“采用服务器版本”前保留本地副本供下载；确认放弃才清理。冲突合并提交使用新 mutation 和刚查看的 head，服务端仍 CAS；再次变化继续提示冲突。

IDB 失败时保留内存输入并提示离开风险；正常在线保存仍可走服务器（不承诺浏览器崩溃恢复），在途请求只保留内存；关闭提醒和救援下载可用。救援包是作者主动下载的 JSON，包含版本、正文、已知基线和恢复元数据，不含会话/凭证；不冒充 Markdown 导出或整空间备份。

实现采用浏览器原生 IndexedDB 与 Web Locks，不新增存储依赖。读取旧副本失败时禁止覆盖该 client 的原记录，继续输入可使用内存救援与服务器保存。选择保留副本继续服务器稿件时分配新 client，防止后续输入覆盖未选择的副本；复制到当前 client 的事务完成后才尝试清理非活动且未变化的来源。打开/事务等待有 2.5 秒上限，失败显式降级。未通过服务端正文校验的当前输入也保留在副本/救援稿中，恢复后仍需修正才能提交。

### 7. 版本体验与保留策略

冲突操作分为“查看冲突”与“准备保存合并稿/确认保存合并稿”。比较面板使用独立只读渲染，不改正文；服务器侧固定在已读取的 revision，本页侧随编辑更新，标题、文字以及纯格式/结构差异分别提示。作者在主编辑器整理合并结果；确认票据固定该次本地 editSeq 和已查看的服务器 revision，继续输入或组合输入使票据失效。确认后以新 mutation 和已查看基线进入原有保存协议；查询未决请求失败时不开放合并，再次 CAS 冲突需要重新查看。恢复列表的放弃操作需二次确认，只删除所查看且未变化的副本；其他活动标签页的记录不可删除。本页当前冲突稿可先下载或保留后使用服务器稿，不能以浏览比较隐式放弃。

每次成功的有变化保存生成内部不可变修订，UI 不为每次按键添加历史；自动保存已按上文合并。默认历史展示初始版本、命名版本、恢复版本及自动恢复点，可切换“所有保存记录”。

自动恢复点：初始版本；首次变更后的保存；之后至少相隔 5 分钟且内容变化时的下一次保存；恢复产生的新版本。名称附着在某个已保存 revision，不自动标记未保存编辑；作者点击“保存版本”先 flush，成功后命名该结果，用户期间继续输入不包含在旧命名版本中，UI 明示版本时间。

比较由选定的两个版本派生：标题逐字符 diff，正文按顶层 block 序列/文本比较，marks、节点类型、attrs 单独展示格式变更（纯文本不变也要显示）。不使用 diff 输出自动合并，两个版本原文可并排查看。空段落、列表嵌套与代码换行作为验收夹具；比较不可通过更新当前 editor 来实现。

恢复前先解决未保存稿：可等待 flush、返回编辑，或明确下载/保留后放弃；不能直接带着脏稿覆盖。确认面板固定 sourceRevisionId、baseRevisionId 和 localEditSeq；本标签页继续输入会使确认失效，其他标签页变化由服务器 CAS 检测。成功后仅在本地 seq 未变化时载入新修订，否则保留新输入进入核对。

### 8. 本机身份与防跨源

正式 origin 固定为 `http://127.0.0.1:<port>`，localhost 访问可展示跳转提示但不建立另一份编辑 origin；恢复副本以固定 origin 为前提。改端口/浏览器会改变 IDB 存储范围，界面与文档明确提示，服务器保存的数据不受此影响。

启动生成 32 字节随机一次性 token（5 分钟），通过本机启动 URL fragment 传递；不写持久日志/分析记录。前端读取后立即 replaceState 清除 fragment，再以 JSON POST 交换。交换要求精确 Origin、Host、JSON 类型；token 单次消费并恒定时间比较。成功设置 HttpOnly、SameSite=Strict、Path=/ 的随机会话 cookie，12 小时过期；本机 HTTP 不假称有 HTTPS Secure cookie。会话和 CSRF secret 仅在进程内存，重启后重新从本机启动入口连接。

所有内容读接口要求会话；写接口还要求匹配的 X-CSRF-Token、明确允许的 Origin、JSON Content-Type；拒绝 missing/null Origin。GET 不产生数据写副作用。只暴露 health 的应用/版本/可用状态，静态页本身不含正文。开发模式单独允许固定 Vite origin，代理规则需同样验证。

会话过期不清空内存/IDB，只暂停发送并显示“重新连接本机服务”。用户可在终端执行只读 `pnpm local:access`：该工具读取工作空间中仅本用户可读的进程访问信息，向 loopback 管理入口请求一次性新 token；管理入口验证启动随机 secret，不允许浏览器 Origin/CORS，不返回稿件。访问信息文件仅是获取新凭证的凭据，不用它判断写锁；进程退出时清理，异常遗留由新持锁进程原子替换。实现需覆盖 token 过期/重复交换/服务重启，不要求作者为了登录停掉已有服务。

## Failure and recovery

| 故障 | 明确行为 |
| --- | --- |
| 保存成功但响应丢失 | mutation 查询或原样重试；先于 base 校验返回原成功结果 |
| 双标签冲突 | 保留本地副本/远端 head，人工比较后重新 CAS；无自动 last-write-wins |
| SQLite FULL/IOERR/READONLY | 不能显示已保存；保留旧稿和待提交输入；核对后重试/救援下载 |
| SIGKILL/服务重启 | SQLite 恢复事务，客户端重新认证并核对；不凭 UI 的上次“正在保存”判断成功 |
| hash 损坏 | 阻断受影响文章写入；能验证的旧版本只读导出，不能偷偷回退 head |
| 结构性库损坏 | 启动失败，保留原文件；输出诊断位置，无法从未知损坏结构保证读取，不伪造空工作空间 |
| IndexedDB 清空/配额/不可用 | 只承诺已提交稿；明确离线恢复受限，提供内存救援下载 |
| 服务停止后刷新 | 没有服务就不能加载 Web 应用；C02 不提供 service worker/PWA，服务恢复后才能读取已有 IDB 副本 |
| 浏览器关闭的最后瞬间 | 已完成 IDB 事务/服务器提交可恢复，尚在内存的最后输入存在风险；不把 beforeunload 当作持久化保证 |
| 原生输入法未结束/迟到响应 | 不抢焦点、不提交未完成组合、不回写旧正文 |

外网断开时 loopback 服务仍可用，正常保存不依赖互联网。以上“offline”主要表示浏览器与本机服务不可达。恢复副本在浏览器 origin 内，切换端口不能自动读取旧 origin 的副本。

## Alternatives and risks

文件 immutable snapshot + 原子 manifest 实验已通过，与 SQLite 的对照使用相同 request/base/hash 语义。未选择的理由是 manifest 去重索引、独占锁、跨实体提交和后续迁移回收需要自行维护；不是声称 fsync/rename 无法保存文档。JSONL 追加日志还需校验尾部、重放与压缩，当前不引入。Git 保留代码与交付历史，不承担每次保存事务。

better-sqlite3 是原生同步依赖：POC 只覆盖当前 Mac/Node，不代替 Linux CI 安装与目标最大文档验证。正式 G2 在当前 Mac 测量：60 KiB 文档连续 30 次保存 API p95 ≤250 ms，2 MiB 文档 p95 ≤1000 ms，正常文档测试时事件循环延迟 p95 ≤50 ms；这些是本机回归门槛而非跨设备 SLO。若同步大事务超出交互预算，应在本 change 内调整存储 adapter 到受控 worker，重新验证锁/关闭语义，而非悄悄降低 durability。小样本的两组耗时不能推广成性能排名。

暂不设置删除/压缩版本规则，换取明确的恢复和幂等保证；达到容量后需提示导出/后续管理，不能默默无限占盘。C02 保证事务与进程中断一致性，真实电源故障、磁盘物理损坏和备份恢复不以本轮 POC 冒充已测。

## Delivery

C02 实现会替换 WORKBENCH-EDIT-004 的刷新清空断言，保留格式与中文编辑验收。新增 contracts/core/adapters 进入现有架构边界检查。首次引入存储，没有旧生产数据迁移；任何预发布调试数据仍通过 schema 检查，不能随启动抹掉。

工作台显示加载、保存、恢复与冲突入口；版本侧栏按需打开，不把编辑器换成数据库管理页面。只开发单稿使用链路，多文章导航留给 C03。

实现任务、验收映射见 tasks/acceptance。进入实现时采用 ATDD，先记录真实缺失行为 Red，再交付切片。POC 通过仅支撑设计选择；不会填写 product evidence.json 为 passed，也不会归档或修改 Living Spec。
