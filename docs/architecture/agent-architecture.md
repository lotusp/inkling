# Inkling Agent 技术架构与实现设计

范围说明：本文为待验证的架构候选，具体实施顺序以[当前 MVP](../product/thinking-partner-product-design.md)为准；完整发布集成、subagent 等能力不因出现在架构中就进入首版。知识状态见[产品知识库](../README.md)。

Inkling 采用 TypeScript 模块化单体，以 LangGraph.js 统一编排工作流和有边界的模型循环，配合独立的会话、文章版本、长期记忆和工具权限模块。Skills 表达写作方法，MCP 接入外部能力，subagent 在需要时承接可隔离的子任务。公开发布由程序依据具体版本授权执行。

设计日期：2026-11-12。范围为单用户、中文技术写作、个人博客及技术社区；这是待实施的技术方案，仓库当前仍处于设计阶段。本文细化并更新[产品方案](../product/product-design.md)中的技术部分，行业事实见[调研](../research/industry-and-publishing.md)。

选型状态：本文与配套运行图描述 LangGraph 候选方案，尚未通过实现验证冻结。对 Pi、AI SDK、Mastra 和现有 Agent 产品的最新比较见[框架复评](../research/framework-evaluation.md)。LangGraph 的推荐依据是本方案的恢复与审批需求，不代表所有写作 Agent 都应采用图编排。

## 主要决策

| 问题 | 决策 | 第一版范围 |
| --- | --- | --- |
| 是否包含 Skills | 包含；采用 Agent Skills 文件结构，方法与运行权限分开 | 内置调研、大纲、起草、审阅、发布准备五类技能 |
| 是否包含 MCP | 包含 Client 适配层；原生工具与 MCP 工具经过同一权限入口 | 按实际服务启用一个资料连接；博客可直接用官方 API，无须强制经过 MCP |
| 是否提供 MCP Server | 保留统一服务接口，后续对通用 Agent 开放 | P1；不影响 Web 工作台先完成 |
| 是否包含 subagent | 核心支持受限子任务；按任务需要启用 | P0 用独立上下文串行审阅；P1 才并行研究，最多两个子任务、深度一层 |
| 工作流如何执行 | LangGraph.js 是唯一编排器，模型网关不再运行第二套 Agent loop | 显式流程加研究子循环，普通编辑走短路径 |
| 是否需要 Session | 需要；会话、文章项目、单次任务分开 | 本地持久化消息、选区、摘要和任务关联 |
| 是否需要 Memory | 需要；工作记忆、项目知识、作者记忆分层 | SQLite 结构化记录与文件，全文检索；向量检索延后 |
| 是否需要后台队列 | 需要；用于接受任务、调度、租约和恢复 | SQLite Job 表与常驻 Worker；不引入 Redis、Temporal |
| 是否需要微服务 | 当前不需要 | 一个代码库，API 与 Worker 可以分进程运行 |

## 技术选型

| 层 | 建议选择 | 具体职责 |
| --- | --- | --- |
| 语言与项目组织 | TypeScript、pnpm workspace | 前后端共享契约，分包约束模块边界 |
| 前端 | React、Vite、shadcn/ui、Tailwind CSS | 文章工作台、资料侧栏、任务状态和发布预览 |
| 编辑器 | Tiptap，JSON 文档作为主内容 | 稳定节点 ID、代码块、引用节点、局部修改；审阅和冲突规则由 Inkling 实现 |
| 客户端状态 | TanStack Query 管服务端缓存；Zustand 管短期界面状态 | 不把缓存或浏览器状态当作文章的最终记录 |
| HTTP 服务 | Node.js 24 LTS、Fastify | 身份与范围校验、业务命令、任务创建、文件访问、事件推送 |
| 运行编排 | LangGraph.js 的 StateGraph、子图、interrupt、checkpointer | 节点、条件分支、循环、暂停和恢复 |
| 模型接入 | 自有 ModelGateway 接口，内部采用 LangChain 的提供方适配器 | 单次模型请求、工具定义、结构化结果、流式内容、用量和错误归一化 |
| 契约校验 | Zod 与 JSON Schema | 校验模型输出和工具参数；HTTP 层使用 Fastify 的 schema 验证 |
| 业务存储 | SQLite、better-sqlite3、Drizzle ORM、文件目录 | 文章、会话、任务、证据、记忆、审批和操作日志 |
| 执行检查点 | @langchain/langgraph-checkpoint-sqlite | 保存图的执行状态；采用文件数据库，不用内存 saver 作为运行存储 |
| 外部协议 | 官方 MCP TypeScript SDK 的 Client；Server 后续启用 | 连接、能力发现、工具调用、资源读取、超时和认证 |
| 前后端通信 | HTTP 命令加 SSE 事件流 | 任务启动、进度、候选稿、审批请求、完成与错误 |
| 可观测与验证 | Pino 日志、OpenTelemetry、Vitest；产品实现后用 Playwright 做交互回归 | 运行追踪、成本、恢复与版本保护验收 |

上述是推荐的组合，非已安装依赖清单。实施时锁定通过兼容性检查的稳定版本和 lockfile；不直接照抄官网使用预发布包的安装示例。Node.js 24 在本次核验时仍属于 LTS；SQLite 驱动含原生依赖，需要验证目标系统的安装和打包。[Node 发布信息](https://nodejs.org/en/about/previous-releases)、[Drizzle SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)、[SQLite checkpointer](https://github.com/langchain-ai/langgraphjs/tree/main/libs/checkpoint-sqlite)

### 为什么选 LangGraph.js

LangGraph 能在同一状态图里组合固定步骤与模型驱动步骤，适合 Inkling 的“研究可迭代、编辑有版本、发布需等待确认”。它提供图执行、检查点和中断机制，文章事实、审批合法性和外部操作可靠性仍由业务层保证。[LangGraph TypeScript 概览](https://docs.langchain.com/oss/javascript/langgraph/overview)

| 替代方案 | 适合的情况 | 本方案的取舍 |
| --- | --- | --- |
| 自建状态机和模型循环 | 流程很短、恢复和并行需求少 | 少依赖，但需要自行维护中断、重放和子图语义；Inkling 已有这些需求 |
| Vercel AI SDK | 模型调用、流式 UI、工具循环；其 WorkflowAgent 也提供持久工作流路线 | 可作为整套替代方案评估；本版不与 LangGraph 同时管理循环。[官方说明](https://ai-sdk.dev/docs/agents/workflow-agent) |
| OpenAI Agents SDK | Agent、工具、handoff、session、审批和 tracing 的代码式开发 | 同样可行；本版优先显式状态图。不是因为 SDK 缺少会话或审批。[官方 OpenAI 文档](https://developers.openai.com/api/docs/guides/agents/sdk)、[结果与状态](https://developers.openai.com/api/docs/guides/agents/results) |

ModelGateway 不封装另一层自动 Agent。一个图节点发出一次模型请求，下一步是工具、子任务、人工输入还是结束，由 LangGraph 路由和 Inkling 校验器共同决定。底层 SDK 的自动重试也必须纳入统一预算，避免重复计算和不可见调用。

## 部署和模块边界

第一版在作者电脑或一台私有机器上运行：浏览器访问 Fastify，Worker 运行长任务，两者共享本机 SQLite 和附件目录。Worker 属于同一模块化单体，只是与 HTTP 请求分离。页面关闭或 SSE 断开不会取消任务；应用进程退出则在下次启动后恢复。

本地默认绑定回环地址。若部署到远程，必须增加登录、HTTPS、工作空间授权及运维备份；浏览器不持有模型或发布平台的服务端密钥。多个实例跨机器运行时再迁移 PostgreSQL、对象存储和生产级 checkpointer，不能把本地 SQLite 文件挂在网络盘上充当分布式数据库。

内部调用路径：

```text
Web 工作台 / 未来 CLI 与 MCP Server
    → Application Service：身份、会话、文章版本、业务命令
    → Job Scheduler：任务接收、租约、取消、恢复调度
    → Agent Runtime：LangGraph 工作流与有限循环
        ├─ Context Builder：组装当前任务所需上下文
        ├─ Skill Registry：发现、激活和版本固定
        ├─ ModelGateway：一次模型调用
        ├─ Subtask Runner：受限、隔离的子图
        └─ Tool Broker：参数、权限、预算和副作用检查
             ├─ 原生业务工具与官方 API 适配器
             └─ MCP Client → 外部 Server

所有模块通过业务服务读写文章、证据、记忆与操作日志。
```

可交互[内部运行架构图](../diagrams/inkling-agent-runtime.html)展示这些逻辑关系；节点不代表独立微服务。

## 五个关键内部组件

| 组件 | 输入 | 输出 | 不应承担的责任 |
| --- | --- | --- | --- |
| Intent Router | 用户命令、界面动作、当前选区 | 一种受支持任务及其范围 | 随意扩张目标或权限 |
| Context Builder | Run、Session、文章版本、Skill、记忆范围 | 有来源和预算的 ContextEnvelope | 把全部历史和所有工具一次塞给模型 |
| Agent Runtime | 任务契约、状态图、上下文 | 候选成果、待确认事项或明确终态 | 直接修改数据库或绕过 Tool Broker |
| Tool Broker | 工具请求、运行身份、参数、授权 | 经过校验和记录的执行结果 | 相信外部工具描述中的自我授权 |
| Artifact Validator | 候选大纲、文章补丁、引用、平台版本 | 可审阅成果及问题列表 | 仅凭另一次模型打分宣告事实正确 |

从明确按钮启动的动作直接路由，例如“重写选中段落”不再花一次模型调用猜意图。自由文本先映射到有限任务集合；确有歧义且影响结果时才返回 `needs_input`。

## Skills 的设计

Skill 保存可复用的方法：适用场景、输入约束、步骤、输出要求和质量检查。一个 Skill 可被主 Agent 或子 Agent 使用；它不是独立进程，也不自动创建一个新 Agent。

采用标准目录与渐进加载：启动读取名称和描述，任务选中后读取正文，相关 references/assets 按需加载。`allowed-tools` 在标准中属于实验性声明，不能替代宿主的权限系统。[Agent Skills 规范](https://agentskills.io/specification)、[宿主集成说明](https://agentskills.io/client-implementation/adding-skills-support)

| 内置 Skill | 产物 | 允许的行为 |
| --- | --- | --- |
| research-topic | 问题表、证据卡、反例、资料缺口 | 搜索、读取、抽取，保存候选证据 |
| build-outline | 有论点和依据的大纲版本 | 读取简报及证据，提出结构 |
| draft-in-author-style | 正文候选或段落补丁 | 读取已确认风格与样本，生成候选文字 |
| review-article | 可定位的问题与建议 | 核对引用、论证、表达，不直接改主稿 |
| prepare-publication | 平台衍生稿、预览、转换报告 | 转换格式、准备发布任务，不自行公开发布 |

拟议目录如下，本文只描述组织方式，不创建实际可执行技能：

```text
skills/research-topic/
  SKILL.md                 # 标准元数据与操作方法
  references/source-policy.md
  assets/evidence-template.json

packages/runtime/skill-policies/
  research-topic.json      # Inkling 自有配置：工具范围、预算、输出 schema
```

Skill 文件可声明需求，但最终工具范围是“任务权限、用户授权、Skill 策略、当前角色、连接器范围”的交集。发布权限不会因修改 `SKILL.md` 而增加。作者偏好保存在 StyleProfile，不直接写入通用 Skill，避免每个用户都维护一套技能代码。

每次 Run 固定 `skill_id / version / content_hash`；运行中编辑 Skill 从下一次任务生效。P0 仅内置、随应用分发的可信技能，不自动下载技能市场内容，不执行任意附带脚本。需要解析文件等代码能力时，调用注册的原生工具。远程 Skills over MCP 可在 P1 评估，仍需宿主选择激活与校验来源。[官方扩展](https://modelcontextprotocol.io/extensions/skills/overview)

## MCP 的设计

Inkling 作为 MCP Host，通过 Client 连接外部 Server。Tools 暴露可调用能力，Resources 暴露资料，Prompts 提供模板；这些都不代替 Inkling 的工作流、会话、长期记忆和文章版本系统。[MCP 架构](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture)

原生工具优先用于内部文章、记忆和授权操作。已有稳定官方 API 的发布渠道可以直接写适配器；已有可靠 MCP Server 的资料库或博客可通过 MCP 接入。两者进入同一个 Tool Registry，因此更换连接方式不会改变上层任务协议。

本地 MCP 使用 stdio；远端使用 Streamable HTTP。HTTP 授权按规范和目标服务实施，连接令牌按服务器与账号隔离。允许连接资料库不等于允许公开文章，OAuth 登录也不等于本次发布审批。[传输](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)、[授权](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

2026-11-12 核验的官方 TypeScript SDK 稳定线为 v2，Client 与 Server 使用独立包，并实现 2026-07-28 协议。实现应交由 SDK 处理协商，并为每个实际服务建立协议兼容测试，不照搬旧版只依赖初始化阶段的固定假设。[SDK 文档](https://ts.sdk.modelcontextprotocol.io/v2/)

P0 的 MCP Client 适配层需要：工具发现与 schema 校验、资源读取、超时、结果大小限制、调用日志、凭据隔离与取消处理。只将当前任务需要的工具描述提供给模型；外部服务的只读或破坏性提示仅作参考，真实风险分类由宿主配置。禁止远端内容触发无限反向模型调用或自动激活新技能。

P1 提供 Inkling MCP Server，先暴露 `search_notes`、`get_article`、`capture_idea`、`propose_edit`、`get_run_status`。耗时操作返回 Run ID；使用同一应用服务和范围校验，不直通数据库。公开发布仍通过工作台的版本确认完成，不能因为从通用 Agent 调用就省略检查。

## Subagent 的设计

采用主 Agent 委派子任务、收回结果的方式。主 Agent 持有用户目标和最终答复权，子 Agent 获得有限任务、独立上下文、工具子集和预算，不接管整个用户会话。

| 角色 | 何时使用 | 返回内容 | 写权限 |
| --- | --- | --- | --- |
| Researcher | 问题可独立调查，例如官方行为与实际案例 | 证据 ID、摘要、分歧、未解决问题 | 仅创建本任务的候选资料，不能改主稿 |
| Fact Reviewer | 草稿中的技术论断需要检查 | Claim ID、支持状态、来源定位、建议 | 只返回审阅结果 |
| Style Reviewer | 需要对照作者风格审阅 | 段落 ID、修改建议、规则依据 | 只返回补丁候选 |

P0 首先把事实与风格审阅实现为两次独立上下文的调用，串行执行；不一定需要额外的多步子 Agent。只有需要自主查找资料、在多个工具间迭代时，才启用带有限循环的子图。P1 在研究阶段允许最多两个独立子任务并行，深度固定一层，子 Agent 不能再分裂子 Agent。

并行子图采用每次调用隔离的持久化命名空间。不能把同一个跨调用记忆子图并行执行；官方文档明确说明这种配置会导致 checkpoint 冲突。[LangGraph 子图](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs)

子任务使用父任务的预算份额，在派发时原子预留。它们必须携带相同文章基线、来源范围和可用工具范围，只回传结构化成果及来源引用。主 Agent 合并时处理重复证据和冲突，不能把“两个 Agent 都同意”当作事实成立。子任务失败允许返回部分结果和缺口；不因此丢弃已完成资料。

## 外层工作流

文章的业务阶段为 `idea → brief → research → outline → drafting → review → ready`，作者可以跳转或回退。业务阶段描述文章，不等于 Run 的生命周期，也不意味着每次操作都从头跑完整流程。

| 任务入口 | 执行路径 | 完成条件 |
| --- | --- | --- |
| 记录灵感 | 校验输入 → 保存 Idea | 原文入库；不调用模型也能完成 |
| 研究主题 | 固定简报 → 激活研究 Skill → 有限研究循环 → 汇总证据 | 问题有证据或明确缺口，来源可定位 |
| 形成大纲 | 读取简报与证据 → 单次生成 → schema 与引用校验 | 保存大纲候选版本 |
| 起草章节 | 固定文章基线 → 检索风格样本 → 生成章节 → 校验补丁 | 保存候选，等待作者接受 |
| 局部修改 | 读取选区及邻近上下文 → 生成补丁 → 校验锚点 | 只涉及允许的段落和字段 |
| 审阅文章 | 固定草稿 → 事实检查 → 风格检查 → 合并建议 | 每项问题可定位、分类并处理 |
| 发布文章 | 准备衍生稿 → 预览 → 等待具体版本确认 → 校验授权 → 发布与核验 | 平台记录或明确未知/失败状态 |

“研究结束”只完成研究任务，不自动意味着可以写全文或公开发布。连续完成多个阶段需要用户的任务范围包含这些阶段，重要结果仍以可编辑成果交付。

## 内层 Agent loop

模型只在需要自主探索的节点里循环。LangGraph 的条件边承载循环，不在一个节点内部额外运行无界 `while` 或第二套 ToolLoopAgent。

```text
读取任务与检查点
  → 检查取消、租约、预算、版本
  → 组装本轮上下文与工具子集
  → 一次模型调用
  → 校验动作
       ├─ 工具请求 → 权限校验 → 执行/复用操作结果 → 保存结果 → 下一轮
       ├─ 子任务请求 → 预留预算 → 执行受限子图 → 合并结果 → 下一轮
       ├─ 缺少用户输入 → 保存待办 → waiting_user
       └─ 候选成果 → 结构与业务校验 → 保存成果 → 结束
```

模型输出由 ModelGateway 归一化为工具请求、候选成果或缺少输入三类；委派子任务作为受限的内部工具请求处理。自然语言声称“完成”不绕过业务校验；工具成功也不代表任务完成。原生 function calling 与 JSON schema 输出由适配器处理，不能依靠正则从任意文本猜测要执行的命令。

以下是建议的起步配置，用于调试成本与延迟，不是模型或框架限制，也不是已经测量的性能承诺：

| 单次 Run 类型 | 模型请求上限 | 工具尝试上限 | 活跃执行时限 |
| --- | --- | --- | --- |
| 局部修改 | 3 | 4 | 60 秒 |
| 一次主题研究 | 12 | 24 | 5 分钟 |
| 一次文章审阅 | 6 | 8 | 3 分钟 |

上限包括子任务、格式修复和重试。另设总 token 与费用上限；费用不明时先按 token 限额控制，不伪造价格。等待人工输入期间不计入活跃时长，恢复后仍使用剩余预算。

业务库的 BudgetLedger 是预算的唯一权威。每次模型请求、工具尝试与 SDK 重试都必须先原子预留额度，模型按输入估算及最大输出预留，完成后以实际用量结算；结果未知时暂不返还。子任务的预留是父预算的一部分，结算时不重复计费。检查点只保留预算引用，恢复旧快照不能恢复已消耗的额度。无法逐次观察和计量的 SDK 自动重试应关闭，由运行时执行有记录的重试。

停止规则必须由程序执行：

- 达到成果契约则结束，不要求把预算花完。
- 到达任一硬上限后停止新调用，返回已保存成果与缺口；预算完全耗尽时用程序生成说明，不再调用模型总结。
- 相同工具与规范化参数连续重复、且没有新证据时，最多允许一次调整策略；仍无进展则结束当前研究，报告未解决项。
- 可恢复的读取错误最多重试两次，并遵守服务端退避提示；所有尝试计入总预算。
- 结构化输出只允许有限修复，格式修复不等于语义和事实复核。
- 权限拒绝、版本冲突、用户取消不自动重试；需要用户输入则释放 Worker 执行槽位。

LangGraph 的 `recursionLimit` 作为图步骤的最后保护，不代替模型调用次数限制，因为图节点数与模型调用次数不是同一个计量。

## Run 与任务调度

Run 生命周期：`queued → running → succeeded | failed | cancelled | limit_reached`。执行中可以进入 `waiting_user` 或 `paused`，恢复后回到 `queued/running`；外部操作状态未知时进入 `needs_reconciliation`，先核对远端结果。

Job Scheduler 只负责接单、抢占任务、续租、唤醒和崩溃恢复。调度重试意味着再次领取同一 Run，并先检查操作记录及恢复点，不是从头重新执行整个任务。它不能自己决定“下一步去写作还是发布”；该决定属于图。第一版同一文章同时只运行一个有写作意图的主任务，独立只读研究可继续；作者在界面中的编辑不被锁住，候选成果通过版本校验合并。

任务接收时在一个业务事务中保存用户消息、Run、Job 及接收事件，再返回 `202 + run_id`。使用客户端幂等键防止重复点击产生两个相同任务。Worker 采用有到期时间的租约及递增 fencing token；旧 Worker 失去租约后不得提交新的成果或领取新的外部操作。已经进入发送阶段的远端操作单独核对，租约失效不能将它撤回。

只有等待用户的任务释放计算资源后，才显示“等待确认”。恢复按钮携带待确认事项 ID 与答复，服务端验证所属用户、版本和是否已处理，再唤醒同一个 Run。超时、取消和重启不能自动补出用户的确认。

答复接收采用业务事务：保存不可变 PendingReply、更新 PendingAction、写入恢复 Job/outbox 与接收事件。重复请求返回同一答复记录，不能改写已接受的答复。Worker 使用这份记录恢复对应中断，并记录已推进的检查点；未完成前可再次调度同一恢复动作，业务副作用仍按操作 ID 去重。发布 Approval 的创建和唤醒也采用该协议，避免“确认已保存、任务却未唤醒”的丢失窗口。

## Session 与执行检查点

身份关系为：`Workspace → ArticleProject → Session → Run`。一个文章可以有多个讨论会话，一个会话可以发起多次任务，一个任务可以有多个子任务。全局灵感会话可以暂不绑定文章。

| 标识 | 用途 |
| --- | --- |
| article_id | 长期文章对象，与聊天是否结束无关 |
| session_id | 用户看到的一段持续讨论，保存消息、选区与上下文范围 |
| run_id | 一次明确任务，拥有状态、预算和成果 |
| graph_thread_id | 图恢复命名空间；主任务按 workspace 与 run 构造，而不是直接复用 session_id |
| checkpoint_id | 图在某一时刻的执行快照 |
| subtask_id | 一次隔离子任务，关联父 Run 和独立预算份额 |

本设计将 LangGraph thread 绑定一次 Run。下一条普通用户请求创建新 Run，由 Context Builder 读取会话历史和项目资产；回答等待中的问题或批准某次动作时，才恢复原 Run。这样可以避免同一聊天中两个并行任务争用一个检查点线程。

保存的会话摘要包括目标、已确认决定、待解决问题、成果 ID 和来源 ID，不保存模型的隐藏推理。近期必要的原始消息保留，较早历史按主题压缩；原始消息仍可查询。摘要是派生索引，不能覆盖用户原话、文章或引用事实。

启动新任务传初始输入；从故障检查点恢复按框架的恢复方式执行；回答 interrupt 使用带 resume 数据的 Command。仅传相同 thread ID 并不能替代正确的恢复操作。[LangGraph 检查点与恢复](https://docs.langchain.com/oss/javascript/langgraph/checkpointers)

## Memory 与 Context 管理

| 层 | 内容 | 存储与写入规则 |
| --- | --- | --- |
| 工作记忆 | 当前计划、工具观察、预算引用、待确认项 | Run 与检查点；预算以业务账本为准，不自动升级为长期知识 |
| 会话记忆 | 最近消息、摘要、讨论决定 | Session；按任务选取，保留原始消息关联 |
| 项目知识 | 简报、来源、证据、论点、大纲、文章版本 | 业务表与文件；是本篇文章的主要依据 |
| 作者长期记忆 | 已确认表达偏好、个人经历、术语约定、原作样本 | 独立记录与版本；仅明确授权的内容成为长期偏好 |
| 方法记忆 | 调研、写作和审阅方法 | 随应用版本管理的 Skills |

Memory 不是一个无限增长的提示词，也不等同于向量数据库。P0 使用结构化查询、标签与全文检索，中文分词和短词匹配单独验收。P1 在实际召回不足时加入 embedding 检索，仍先按工作空间、访问范围、来源类型和有效状态过滤。

长期记录至少包含 `kind / scope / content / provenance / confirmed_by / version / valid_from / supersedes / status`。外部文章的观点、AI 生成稿和用户拒绝的建议不能静默变成作者立场。冲突偏好保留版本和范围，优先采用本次明确要求，其次是本篇要求，再其次是已确认的长期偏好。

每次模型调用只组装所需内容：可信运行规则 → 当前任务及选区 → 当前 Skill → 文章简报和相关段落 → 已确认风格与少量样文 → 相关证据片段 → 必要的会话消息。外部资料明确标记为数据，它不能修改工具权限或发布规则。

ContextEnvelope 记录注入的每个来源 ID、快照、文章版本、记忆版本和估算 token。为输出和工具结果预留容量；超出预算时，先去重复与无关片段，再压缩历史，再缩小章节范围，不截掉权限规则、用户约束和关键证据。

删除资料或撤回记忆后，要清理索引、摘要、缓存及含内容的检查点副本。恢复时重新校验引用的可用性并重建上下文；不能把 checkpoint 中的旧工具消息原样重新发送给模型。日志默认不保存完整正文和敏感资料，必要调试内容单独设置访问与保留策略。

## 数据模型与单一事实来源

沿用产品方案中的文章、来源、证据、论断和风格对象，新增以下运行对象：

| 对象 | 关键内容 |
| --- | --- |
| Session / SessionMessage / SessionSummary | 消息、序号、文章关联、摘要来源范围 |
| Run / Job | 任务、基线、状态、调度租约、预算、模型与图版本 |
| BudgetLedger | 调用前预留、实际结算、未知调用与子任务份额；恢复不能回滚已消耗预算 |
| RunEvent | run_id、递增序号、类型、成果引用；用于事件重放 |
| ModelInvocation | 请求摘要、模型版本、输入引用、用量、状态和可复用结果 |
| ToolOperation | 稳定操作 ID、参数哈希、执行前记录、结果、远端标识、未知状态 |
| Subtask | 父 Run、上下文快照、工具范围、预算预留和结果 |
| SkillRevision | 技能来源、版本、哈希、宿主策略版本 |
| ContextSnapshot | 本轮使用的文章、证据、记忆、技能版本清单 |
| PendingAction / PendingReply / Approval | 待确认对象、不可变答复、用户、目标账号、内容哈希、有效性与恢复进度 |
| PublishIntent | 一次具体发布意图的稳定 ID、审批引用、平台衍生稿与目标账号；重复确认和恢复复用原意图 |
| MemoryCandidate / MemoryRevision | 待确认偏好及已接受版本 |

三种记录的权威范围不同：文章与业务表决定“内容是什么”；检查点决定“图运行到哪”；事件流决定“界面已收到哪些变化”。界面不能通过一条流式文本就认定文章已保存或发布成功。

## 持久化和失败恢复

建议业务数据和图检查点使用独立 SQLite 文件及明确备份清单。两个存储之间不假设存在原子事务。图可重放，但业务命令通过稳定操作 ID 去重，已经提交的成果应复用。

尤其要注意当前 TypeScript 文档中的 `durability: "sync"` 语义：它在本次执行结束时等待未完成写入，中间节点仍可能先于落盘继续。因此不能承诺进程崩溃时零丢步。任务接收必须先在业务库落盘；恢复时可能重算尚未保存的模型步骤。[官方 JS durability 说明](https://docs.langchain.com/oss/javascript/langgraph/checkpointers#durability-modes)

| 故障位置 | 恢复规则 |
| --- | --- |
| 接单后、首次图检查点前崩溃 | 依据已提交 Run/Job 重建初始输入，而不是认为任务从未收到 |
| 模型调用后、检查点前崩溃 | 优先复用 ModelInvocation 中已保存的结果；未知调用保留成本预留，有限重算 |
| 内部成果提交后、图状态未保存 | 用稳定操作 ID 找回已经创建的候选版本，不重复创建 |
| 外部写入超时 | 进入 unknown / needs_reconciliation，先查远端；无法查明时等待人工处理 |
| 作者在运行期间改稿 | 候选标记基线过期；重新生成或由作者审阅合并，不覆盖新稿 |
| 用户确认期间服务重启 | 从已保存待确认事项恢复，重复确认请求幂等 |
| 用户取消时外部请求已发出 | 停止新动作并记录未决操作，核对实际结果；不能声称已经撤回远端写入 |

interrupt 恢复会重新执行所在节点的部分逻辑，所以审批节点与执行副作用的节点必须分开，前后可重跑的业务操作都需要去重。[LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)

业务去重键基于稳定的领域操作，例如“某候选版本提交”或“某平台版本发布”，不能只用会变化的循环次数。仅本地去重不能保证外部平台恰好一次；应保存 remote ID、内容哈希和平台状态，并提供核对入口。

执行前先保存 `logical_step_id / operation_id / payload_hash`，重放时按相同逻辑步骤找回原操作，而不是重新生成 ID。外部发送前，在同一业务事务中校验租约 fencing token，并将操作状态比较后更新为 `dispatching`。接手的 Worker 发现 `dispatching / unknown` 时先核对，不能再次发送；只有确认未执行或平台支持相同幂等键的安全重试，才继续。fencing 保护本地操作领取和提交，普通博客 API 无法替 Inkling 校验它，因此已进入发送阶段的旧请求仍需按未知结果处理。

Run 固定图版本和状态 schema 版本。升级后保留可恢复的旧图，或对旧检查点执行明确迁移；不兼容时将任务暂停为需处理状态，保留成果并支持发起替代 Run。不能用新图静默解释旧的节点、中断顺序或发布批准。技能版本、参数和依赖兼容信息也随 Run 保存，供恢复检查使用。

## 版本保护与发布控制

编辑补丁包含 `article_id / base_revision / node_id / expected_text_hash / replacement / evidence_ids`。接受时在业务事务中校验当前版本和文本哈希；失败返回冲突，保留双方内容。子 Agent 只能提出补丁，不能直接提交主稿。

普通研究和写作工具集合中不暴露最终公开发布操作。模型可以准备平台版本或提出发布任务；公开执行走独立的发布子流程，后半段是确定性程序，不需要再让模型自行决定下一步。

授权绑定 `publication_variant_id / content_hash / asset_manifest_hash / account_id / visibility / schedule / action`。服务端校验用户、版本和权限后写入 Approval；执行前再检查授权有效性和远端版本。模型输出的 `approved: true` 不能当作批准记录。

发布链路为“准备 → 预览 → 用户确认 → 校验授权 → 记录操作意图 → 执行 → 核对远端”。导出、远端草稿、公开发布、覆盖旧文和订阅推送是不同动作。文章或图片变化会使旧确认失效。Git 提交成功、PR 合并、部署成功和页面可访问也分别记录。

## API 与事件流

以下为 Inkling 自有接口草案，非第三方 SDK API：

| 接口 | 作用 |
| --- | --- |
| POST /sessions | 创建文章讨论或全局灵感会话 |
| POST /sessions/:id/turns | 保存用户输入与任务，返回 run_id |
| GET /runs/:id | 获取任务当前状态、成果和待办 |
| GET /runs/:id/events | SSE 读取进度，按事件序号续传 |
| POST /runs/:id/cancel | 记录取消意图，停止后续步骤 |
| POST /runs/:id/resume | 对指定 PendingAction 答复并恢复同一任务 |
| POST /articles/:id/proposals/:proposalId/accept | 校验基线并接受补丁 |
| POST /publications/:id/approve | 对已生成的具体平台版本确认 |
| POST /memory-candidates/:id/accept | 明确接受长期偏好 |

事件类型包括 `run.accepted`、`step.started`、`tool.completed`、`text.delta`、`artifact.created`、`approval.required`、`run.completed`、`run.failed`。每条可恢复事件有递增序号；流式 token 可合并，最终成果必须有持久化引用。客户端重连先取快照，再续读事件，避免把重复事件应用两次。

浏览器连接断开不等于用户取消，HTTP 请求重试不等于重新创建任务，SSE 不是任务执行器。作者主动取消通过单独命令表达。

## 权限与资源边界

工具按只读、内部候选写入、外部草稿、公开发布、删除或覆盖分级。对资料读取、灵感保存、候选稿生成使用已配置的权限，不在每一步询问；需要确认时先展示具体结果。

MCP Server、网页和文件中的文字视为不可信输入，不能扩大工具范围。凭据只在连接器与发布适配器中使用。网页抓取限制目的地址、重定向、响应大小和超时，防止被资料中的 URL 引导去读取本机或内部服务；文件工具限制允许目录与类型。P0 不向模型提供通用 shell 或任意代码执行能力。

每轮模型请求可见的资料范围与服务端访问范围都要校验。即使单用户起步，也保留 workspace_id，避免将来多人扩展时再补数据隔离。使用远程模型时发送的是 ContextEnvelope 选择的内容，本地存储不意味着所有处理都在本机。

## 可观测性与验收

每次 Run 记录图版本、Skill 哈希、模型配置、文章基线、来源清单、工具调用、token、费用、延迟、修复次数和停止原因。记录可解释的计划摘要与执行事实，不依赖保存隐藏推理。采用本地结构化日志起步，可通过 OpenTelemetry 导出；默认不上传全文。[OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)

必须以故障注入和真实文章验收以下行为：

1. 同一任务重复提交只生成一个有效 Run；过期 Worker 不能提交新成果。
2. 每个图边界中断进程后，已保存成果可找回，未提交模型步骤有限重算。
3. 接受 AI 补丁前后手工编辑，旧补丁和旧撤销动作都不能覆盖新内容。
4. 工具重复返回同一结果时停止循环，子任务费用和重试不突破父预算。
5. 审批前后崩溃、重复确认、确认后改图或改文，都不能发布未经检查的版本。
6. 外部写入返回丢失时进入未知状态，不无条件重复创建文章。
7. 删除资料和撤回风格后，后续模型上下文及恢复过程不再使用已撤回内容。
8. 并行子任务引用同一文章快照，但结果合并不会覆盖作者正文。
9. 资料里出现伪造指令，工具权限和目标账号保持宿主规定的范围。
10. 中文输入法、代码块、引用锚点、图片及平台转换在真实编辑器中保持可用。
11. 确认已保存后立即中断进程，恢复消息不会丢失；升级图结构后不会错误套用旧批准。

对模型质量采用作者样文和保留题目评估：风格贴合、证据支持、局部修改准确性、作者编辑时间与单篇成本。模型自动评分仅辅助定位问题，不作为发布许可或事实正确性的唯一判据。

## 代码目录建议

```text
apps/
  web/                     # React 工作台
  api/                     # Fastify 与 SSE
  worker/                  # Job 调度入口与图执行
packages/
  contracts/               # Schema、命令与事件
  domain/                  # 文章、证据、补丁、审批、记忆服务
  storage/                 # Drizzle、迁移、文件与操作日志
  runtime/
    graphs/                # 研究、写作、审阅、发布
    context/               # 选择、摘要与预算
    sessions/              # 会话与 Run 衔接
    skills/                # Registry 与版本固定
    subagents/             # 子任务契约与调度
    policies/              # 权限、停止与重试规则
  models/                  # 单次模型调用适配
  tools/
    native/                # 业务工具
    mcp-client/            # 外部 MCP 连接
  publishing/              # 平台格式与执行适配
  observability/           # 日志与追踪
skills/                    # 内置 SKILL.md 与参考资源
evals/                     # 样文评测与故障恢复用例
```

`domain` 不依赖某个模型供应商或 LangGraph 状态类型。将来更换编排器、增加 CLI/MCP Server 或打包桌面 App 时，文章、证据、授权和版本规则继续复用。

## 实施顺序与边界

先做依赖兼容性小验证：Node、SQLite 原生驱动、checkpointer、选定模型的单次调用与工具协议、一个 MCP 服务协商，以及崩溃恢复。通过后固定依赖版本；这一步不要求先开发完整界面。

第一阶段实现文章、会话、版本、候选补丁和导出，使用模拟模型验证完整数据流。第二阶段接入一个真实模型、五类内置 Skills、研究循环、预算与中断。第三阶段补全记忆候选确认、只读 MCP 连接和作者风格评估。第四阶段接入一个真实博客并完成发布核验。

P0 支持长任务恢复、单次请求上下文隔离、有限循环和串行独立审阅；P1 再增加并行 Researcher、对外 MCP Server、语义检索、远端技能、第二个发布渠道和多文类风格。原型里的模拟 AI 与发布需要逐项替换为上述真实服务，不能仅接一个聊天 API 就视为完成。
