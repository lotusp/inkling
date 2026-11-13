# 开源 Agent 架构调研与 Inkling 设计取舍

核验日期：2026-11-12。范围：12 个 Agent／运行环境项目，另列 2 个高关注度应用平台，以及可复用框架。本文是官方文档、仓库架构说明和依赖清单调研；未安装、压测或执行这些项目，不把项目宣传当作实测结果。

## 核心判断

高关注度 Agent 没有统一采用某一个框架。Pi、OpenCode、Codex、Hermes 等各自组织运行内核；DeerFlow 明确建立在 LangGraph／LangChain 上；OpenHands 将运行 SDK、执行环境、服务器和界面分开。值得吸收的是边界设计，而不是照搬某个项目的全部依赖。

Inkling 的建议保持 TypeScript 产品栈，明确产品数据与 Agent 运行时的边界：文章、引用证据、作者风格、版本和发布授权归 Inkling；模型循环、上下文处理和工具事件由一个选定运行时负责。LangGraph 与 Pi 路线继续通过同一组场景比较；新增 OpenCode／Cline SDK 为完整 harness 复用的备选，不同时引入多套循环。

## 调研方法与关注度口径

“排名靠前”采用 GitHub 关注度作为筛选线索，再补入与研究、记忆直接相关的项目。下表是样本内按 Star 约数排序，不是全行业排行榜；Star 不等于活跃用户、稳定性、任务完成率或商业采用量。数值来自本次访问的 GitHub 仓库页，可能含页面缓存和四舍五入。

区分四层：模型适配层负责 API；Agent 内核负责模型与工具循环；harness 提供会话、上下文、权限和环境；产品平台再提供界面、账户、知识库和业务工作流。一个项目可以跨越多层，不能用产品 Star 直接给底层 SDK 排名。

| 样本项目 | Star 约数 | 本次采用的架构依据 |
| --- | ---: | --- |
| [OpenClaw](https://github.com/openclaw/openclaw) | 394.4k | 当前架构文档／main；已拥有自有运行内核 |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | 262.7k | 当前开发者文档／main |
| [OpenCode](https://github.com/anomalyco/opencode) | 226.2k | anomalyco 仓库 dev、V2 规范和当前 SDK 文档 |
| [Codex](https://github.com/openai/codex) | 134.9k | 开源 Rust 核心／app-server 文档 |
| [Pi](https://github.com/earendil-works/pi) | 121.5k | 2026-11-10 发布的 v1.5.2 标签 |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | 108.8k | 当前 README／core 依赖；main 包版本含 nightly |
| [OpenHands](https://github.com/OpenHands/OpenHands) | 93.3k | 当前 Agent Canvas 架构＋独立 Software Agent SDK |
| [DeerFlow](https://github.com/bytedance/deer-flow) | 85.3k | 2.x 架构文档／main；后端版本字段为 2.3.0-dev |
| [Cline](https://github.com/cline/cline) | 71.5k | 当前 ClineCore／Agent SDK 文档 |
| [Goose](https://github.com/aaif-goose/goose) | 56.5k | 当前 Rust 仓库；ACP 迁移另参考 2026-04-08 的 2.0 beta 公告 |
| [GPT Researcher](https://github.com/assafelovic/gpt-researcher) | 30.6k | 当前 README 的研究管线与多 Agent 示例 |
| [Letta Code](https://github.com/letta-ai/letta-code) | 3.8k | 当前代码／MemFS 文档；作为记忆设计专项样本 |

Letta 历史仓库约 25.4k Star，不能算到 Letta Code 上。历史仓库当前 README 已将源代码入口指向 Letta Code，旧 V1 服务另行归档。[Letta 历史仓库](https://github.com/letta-ai/letta)

除明确引用标签的 Pi 外，上表大多说明当前文档或开发分支的设计，不能直接推断 npm／PyPI／二进制发行包已经包含相同能力。Goose 的旧 beta 公告只用于解释迁移理念，不能证明今天所有客户端的迁移状态。

## 产品架构、技术栈与取舍

下表的架构与技术是来源事实；优势、代价及 Inkling 适配性是基于这些事实的设计判断，并非横向性能测试。

| 项目 | 设计理念与核心架构 | 主要技术／框架 | 优势与代价 |
| --- | --- | --- | --- |
| OpenClaw | 宿主控制会话、工具策略和运行环境；harness 可选择／扩展 | TypeScript；自有 agent-core、session、compaction、provider 层 | 适合长期、多入口助手；整体平台面大，直接移植会带入大量写作之外的能力 |
| Hermes | 持续工作的个人 Agent，把经验沉淀为记忆和技能 | Python；AIAgent 自有循环；SQLite 会话；文件记忆 | 个性化闭环清楚；需控制错误记忆、上下文成本和后台反思频率 |
| OpenCode | 协议、数据形状、执行内核和客户端各有边界 | TypeScript／Bun、Effect、SQLite／Drizzle；独立 Core／Schema／Protocol | 适合多前端和强类型生命周期；V2 变化与 Effect 学习成本需计入 |
| Codex | 产品界面连接完整编码 harness，协议暴露执行过程 | Rust／Tokio；自有核心；app-server | 现成的工具、上下文和审批交互；接入完整进程与协议，写作领域工具仍需适配 |
| Pi | 小内核可组合；交互、扩展和会话分层 | TypeScript；pi-ai → agent-core → coding-agent；另有 Pi Durable | steering、follow-up 和 SDK 适合交互产品；轻内核不承担完整持久工作流，Durable 尚实验性 |
| Gemini CLI | 模型接入、工具调度、上下文与策略形成专用运行环境 | TypeScript／Node、@google/genai、MCP SDK；自有 core | 适合参考工具调度与客户端协议；当前产品定位已收窄，选型需匹配服务范围 |
| OpenHands | Agent 配置与 Conversation 状态分离；执行环境可以本地或远端 | Python／Pydantic；SDK、Tools、Workspace、Agent Server；FastAPI；React／TS Canvas | 类型化动作与观察、环境解耦；对个人写作来说服务器和沙箱体系较重 |
| DeerFlow | 通用任务 harness：规划、委派、文件、记忆、技能、沙箱 | Python、LangGraph、LangChain、FastAPI；Web 界面 | 研究到成果文件的路径完整；通用任务和沙箱能力增加部署与维护范围 |
| Cline | 轻量 Agent 原语与完整 ClineCore harness 分开 | TypeScript；@cline/agents、@cline/sdk | 可以按需要复用循环或完整会话／审批；编码工具和会话语义仍需领域化 |
| Goose | 工具生态通过 MCP 扩展，客户端与执行核心分离 | Rust／Tokio／Axum；MCP；ACP 客户端方向 | 外部工具扩展自然，多种交互入口；完整运行时集成和客户端迁移需要跟版本 |
| GPT Researcher | 问题拆解、并行搜集、来源跟踪、筛选、汇总 | Python；FastAPI／Web；多 Agent 示例使用 LangGraph、AG2 | 适合资料收集子系统；搜索覆盖与引用数量不能替代事实核验和作者表达 |
| Letta Code | Agent 身份和记忆跨会话持续；上下文本身可版本化 | TypeScript／Node；Letta Agent SDK；Git 支撑 MemFS | 风格／偏好可积累、查看和回退；长期记忆更新必须有来源与冲突处理 |

对应实现依据：[OpenClaw runtime](https://docs.openclaw.ai/agent-runtime-architecture)、[Hermes architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)、[OpenCode Core 依赖](https://github.com/anomalyco/opencode/blob/dev/packages/core/package.json)、[Codex core 依赖](https://github.com/openai/codex/blob/main/codex-rs/core/Cargo.toml)、[Pi agent-core](https://github.com/earendil-works/pi/blob/v1.5.2/packages/agent/README.md)、[Gemini core 依赖](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/package.json)、[OpenHands SDK 架构](https://docs.openhands.dev/sdk/arch/overview)、[DeerFlow 后端依赖](https://github.com/bytedance/deer-flow/blob/main/backend/pyproject.toml)、[ClineCore](https://docs.cline.bot/sdk/clinecore)、[Goose Cargo](https://github.com/aaif-goose/goose/blob/main/Cargo.toml)、[GPT Researcher 设计](https://github.com/assafelovic/gpt-researcher#readme)、[Letta Code 依赖](https://github.com/letta-ai/letta-code/blob/main/package.json)。

## 最值得深入借鉴的实现

### Pi：把用户干预设计进循环

Pi 的重要价值是交互语义：steering 改变接下来的执行方向，follow-up 等待当前工作结束，abort 停止当前执行。v1.5.2 中 steering 在本轮模型及工具工作完成后进入，不能当作瞬间撤销已经发出的工具请求。[循环实现](https://github.com/earendil-works/pi/blob/v1.5.2/packages/agent/src/agent-loop.ts)

Coding Agent SDK 加入会话树、压缩、资源加载和扩展；MCP 已经内置。当前包分层与仓库位置也不同于早期 Pi 教程。[SDK](https://github.com/earendil-works/pi/blob/v1.5.2/packages/coding-agent/docs/sdk.md)、[MCP](https://github.com/earendil-works/pi/blob/v1.5.2/packages/coding-agent/docs/mcp.md)、[迁移说明](https://pi.dev/changelog/2026/5/7/pi-has-a-new-home)

对 Inkling：作者在研究过程中说“先找反例”应影响下一步；说“完成后给三个标题”应排入队列。界面要显示当前任务、待处理插话和待办，不能全部当作普通聊天追加。

Pi Durable 是另一套实验性 harness，不能认为它是 agent-core 的透明持久化插件，也不能据此承诺外部发布只执行一次。[Durable README](https://github.com/earendil-works/pi/blob/v1.5.2/packages/durable/README.md)

### OpenCode／Codex／Cline：用可编程运行时承接产品

OpenCode V2 将公共操作放在 Protocol、公共形状与持久事件放在 Schema、执行和持久化放在 Core。其当前 SDK 支持进程内嵌入，网络客户端另行接入。[V2 结构](https://github.com/anomalyco/opencode/blob/dev/specs/v2/README.md)、[SDK](https://opencode.ai/docs/build/sdk/)

更有价值的是输入接收与执行分离：输入先形成持久 inbox 记录，再唤醒执行；排队输入和 steering 有不同的交付边界，重复输入 ID 有确定的处理语义。这直接对应“浏览器已经显示发送成功，但后端进程随即退出”的产品问题。[Session 契约](https://github.com/anomalyco/opencode/blob/dev/specs/v2/session.md)

Codex app-server 用 thread、turn、item 和事件让其他界面接入 harness；业务界面和领域记录由应用管理。这里研究的是开源 CLI／核心与 app-server，并不意味着 Codex 的模型、云服务和全部客户端都开源。[平台架构](https://developers.openai.com/blog/codex-as-a-platform)、[app-server](https://learn.chatgpt.com/docs/app-server)

Cline 当前也区分 Agent 原语与 ClineCore：后者提供会话文件、内置工具、审批、调度和本地／远端后端；前者允许应用自行管理工具与生命周期。[ClineCore 与 Agent](https://docs.cline.bot/sdk/clinecore)

对 Inkling：定义 `start / steer / enqueue / cancel / resume / subscribe` 等产品运行接口，在领域层保存文章和证据。不要让编辑器直接依赖某个框架的内部消息类型。替换 runtime 只保证新任务可接入；旧任务的 checkpoint 必须绑定原运行时和 schema 版本，不能承诺任意热切换。

### Hermes／Letta：记忆成为可管理的产品资产

Hermes 自有循环将提示构建、调用、工具执行、压缩和预算处理分成模块；短期对话历史与跨会话记忆分别处理。[Agent loop](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop)

其基础记忆采用有容量边界的 MEMORY.md／USER.md；会话开始加载快照，历史信息可以按需召回。这说明个人 Agent 并不天然要求“把所有消息向量化再全部检索”。[Persistent Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)

Letta Code 将跨会话身份、技能及记忆作为持续状态；MemFS 用 Git 保存上下文版本，重要记忆常驻，较深资料按目录索引查找，向量索引不是默认必需项。Git 的价值是历史、冲突和保存边界，而不是自动保证记忆正确。[Letta Code](https://github.com/letta-ai/letta-code#readme)、[MemFS](https://docs.letta.com/concepts/memfs)

对 Inkling：作者修改是风格学习的证据。可以生成“风格更新建议”，记录来源文章、修改前后差异、适用文体和确认状态，再决定是否提升为长期规则。单篇文章的临时要求不自动升级为全局偏好。可先用 SQLite 版本表实现，不必为了模仿 MemFS 立即引入 Git 同步服务。

这里的“学习”主要是改写上下文、记忆和 Skills，不能解释为模型权重自动训练，更不能推断质量会随使用次数必然提升。

### DeerFlow／GPT Researcher：研究过程与成果可分离

DeerFlow 2.x 是对 v1 的重写。其当前定位是含文件系统、记忆、Skills、沙箱和 subagent 的 harness，底层明确使用 LangGraph／LangChain；不能继续只按旧版固定研究流程理解它。[当前定位](https://github.com/bytedance/deer-flow#readme)

当前上下文设计还把长期目标、任务历史与自动续跑分开，续跑需要完成状态、证据、进展检测和上限。资料工具返回的来源信息也要经过子任务结果与界面持久保存。[目标与上下文](https://github.com/bytedance/deer-flow/blob/main/docs/guide/context.md)、[工具与来源处理](https://github.com/bytedance/deer-flow/blob/main/docs/guide/skills-and-tools.md)

GPT Researcher 的核心参考价值是问题拆解、来源收集和最终合成。其多 Agent 示例使用 LangGraph／AG2，不代表所有研究执行都只由 LangGraph 实现。[官方研究流程](https://github.com/assafelovic/gpt-researcher#readme)

对 Inkling：研究子任务应交付证据卡，而非只有一段摘要。卡片包含 URL、标题、检索时间、可定位摘录、支持的论点、时效边界及矛盾点。正文引用从证据卡生成；事实核验要检查证据是否支持具体句子，不能只检查链接存在。

### OpenHands：拆开状态、动作与运行环境

Software Agent SDK 将 Agent 配置、Conversation 状态、工具动作／观察／执行器与 Workspace 分离。Agent Server 通过 REST／WebSocket 提供远端执行；当前主仓库则包含 React／TypeScript 的 Agent Canvas。[SDK 架构](https://docs.openhands.dev/sdk/arch/overview)、[Canvas 架构](https://github.com/OpenHands/OpenHands/blob/main/docs/architecture.md)

对 Inkling：一个 `propose_draft_patch` 动作应有类型化输入、结果和基线版本；本地草稿更新、执行代码示例、远端博客发布是不同执行边界。将来需要沙箱验证技术示例时，可扩展环境服务，无需改写整个写作循环。

### OpenClaw／Goose：扩展接口与运行时演进

OpenClaw 当前架构已经拥有自有内核、会话、上下文压缩和工具策略，保留的 Pi 依赖主要是 TUI 组件。不能把历史嵌入 Pi 的实现继续当作当前架构。[当前 runtime](https://docs.openclaw.ai/agent-runtime-architecture)

Goose 的 Rust 核心通过 MCP 扩展工具；其 2026-04-08 的 2.0 beta 公告解释了为何将不同客户端统一到 ACP：避免 CLI 与桌面端分别维护执行接入路径。这是协议边界的参考，公告中的未来迁移计划不能当成已全部完成。[Goose](https://github.com/aaif-goose/goose#readme)、[ACP 迁移公告](https://goose-docs.ai/blog/2026/04/08/goose-acp-and-new-tui/)

对 Inkling：先保证 Web 与运行时之间有明确接口；若未来增加 CLI／IDE 接入，再评估 ACP。MCP 负责连接工具／资源，不能替代编辑器与 Agent 的全部交互协议。

## 两个高关注度平台：另一个比较维度

| 平台 | 关注度与实现方向 | 适合的用途与 Inkling 取舍 |
| --- | --- | --- |
| [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)，约 188.0k | 当前平台有可复用工作流、集成与可视化构建；部署包含数据库、队列及多个服务 | 适合自动化平台；可研究工作流复用，对个人编辑器而言完整平台的集成范围偏大 |
| [Dify](https://github.com/langgenius/dify)，约 161.0k | 工作流、Agent、RAG、模型管理、观测；当前 API 为 Python／Flask／Celery，Web 使用 React／Next 相关栈 | 适合快速搭建知识与自动化服务；文章编辑、版本补丁和作者干预仍需自己的产品层 |

AutoGPT 的 `classic/` 是 MIT，而当前 `autogpt_platform/` 使用 Polyform Shield；Dify 使用带额外条件的自定义许可证。不能把两个平台与整个项目均采用 MIT／Apache 的库不加区分地称为相同开放程度。本调研只是记录官方许可证分类，未作商用许可判断。[AutoGPT 说明](https://github.com/Significant-Gravitas/AutoGPT#license)、[平台部署](https://github.com/Significant-Gravitas/AutoGPT/blob/master/autogpt_platform/README.md)、[Dify 说明](https://github.com/langgenius/dify#license)、[API 依赖](https://github.com/langgenius/dify/blob/main/api/pyproject.toml)、[Web 依赖](https://github.com/langgenius/dify/blob/main/web/package.json)

## 框架层：除 LangGraph 外还有哪些值得考虑

| 选择 | 核心设计 | 对 Inkling 的价值与成本 |
| --- | --- | --- |
| [LangGraph＋Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview) | 持久状态图之上提供更完整 Agent harness | 恢复／人工中断复杂时有优势；采用基础图或完整 harness 要明确，不能重复实现两套循环 |
| [Pi](https://github.com/earendil-works/pi) | 模型适配、轻循环、完整 coding harness 分层 | 交互可控且 TS 接入自然；只用 core 时，持久接收、恢复和业务操作日志由宿主承担 |
| [AI SDK](https://ai-sdk.dev/docs/agents/workflow-agent) | ToolLoopAgent；另有基于 Workflow 的 WorkflowAgent | Web 流式集成方便；持久路线需要执行后端，不能把它当作普通进程内循环 |
| [Mastra](https://mastra.ai/docs/harness/durable-agents) | Agent、Workflows、Memory 等构件集中 | TS 应用集成较完整；Durable Agent 包装标 beta，需与普通工作流分别判断 |
| [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk) | 代码式 Agent、工具、handoff、会话与追踪 | 适合程序化组合；产品存储、发布事务和运行部署仍需应用设计 |
| [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) | .NET／Python，Agent＋图式工作流、检查点、中间件、OTel | 适合已有微软或 Python 后端团队；引入 Inkling 会增加语言／部署边界 |
| [Google ADK](https://github.com/google/adk-python) | 当前 Python README 为 2.0：Agent、Workflow、Task 委派；模型无关但优化 Gemini | 适合 Google 生态和结构化任务；应按具体语言／发行版本核验能力，不能假设各 SDK 同步 |
| [CrewAI](https://github.com/crewAIInc/crewAI) | 角色式 Crews＋事件驱动 Flows | 多角色研究／生产流程直观；简单编辑任务套多角色可能增加成本与调试链路 |
| [Agno](https://github.com/agno-agi/agno) | Agent／Team／Workflow＋AgentOS 运行服务 | 适合团队部署与运营；个人写作第一版未必需要完整服务平台 |
| [OpenCode SDK](https://opencode.ai/docs/build/sdk/)／[Cline SDK](https://docs.cline.bot/sdk/clinecore) | 把成熟产品运行能力暴露给其他应用 | 可以减少自行组装会话和工具层；须验证编码默认行为、存储与审批是否适合写作 |

AutoGen 当前官方 README 明确标记已归档、停止维护，并引导新项目使用 Microsoft Agent Framework。因此它适合作为历史多 Agent 设计参考，不作为 Inkling 新项目默认依赖。[AutoGen 当前状态](https://github.com/microsoft/autogen#readme)

Gemini CLI 当前 README 也已改变定位：面向企业 Code Assist，个人免费／订阅入口迁往 Antigravity CLI，且声明没有针对 Gemini 4+ 优化。这里记录的是所调研开源仓库的当前范围，不能把旧教程的适用范围直接搬到新选型中。[Gemini CLI 当前定位](https://github.com/google-gemini/gemini-cli#readme)

## 转成 Inkling 的具体设计

以下是本项目建议，不是声称所有被调研项目都采用同样设计。

### 1. 一个主写作 Agent，工作流约束执行边界

主 Agent 根据作者目标选择研究、列纲、改写和核验。子 Agent 用于能够独立验收的任务，例如查找某个争议的支持／反对证据；交付结构化成果，不直接写主文档。

循环骨架是：读取任务与作者输入 → 组装上下文 → 预留预算 → 单次模型调用 → 校验动作 → 执行工具／子任务 → 保存结果 → 检查进展 → 继续、等待或结束。框架只能有一个循环控制者；必要的重试、取消和子任务都使用同一预算与运行标识。

不把“研究 → 大纲 → 写作 → 审阅”固定为每条消息必经流程。它们是文章的业务阶段；作者选中一段要求改写时，可以直接进入对应工具。确定性的格式转换、保存和导出无需再经过模型规划。

### 2. 会话、运行和正文分别管理

| 对象 | 保存什么 | 产品意义 |
| --- | --- | --- |
| Conversation | 作者交流、插话、待处理请求 | 聊天可以继续，且知道用户输入是否已被接收 |
| Run | 本次执行、预算、状态、运行时版本和恢复入口 | 能解释为什么停止，以及如何继续 |
| Draft／Patch | 正文版本、基线、建议改动及采纳结果 | 作者编辑时，旧运行结果不能覆盖新正文 |
| Evidence | 资料来源、摘录、时间和论点关系 | 压缩聊天后仍能验证引用 |
| Author Memory | 已确认偏好、适用范围、证据、版本 | 区分长期风格和当前文章要求 |

输入持久化成功后才确认“已收到”。浏览器断开时按事件序号补拉；流式 token 用于展示，已保存的结构化结果才是业务依据。

### 3. Skills 与工具采用按需加载

启动只载入技能目录、摘要与选择所需的元数据，匹配任务后读取正文与参考材料。模型拿到的工具集合按任务与权限收缩。资料正文保存在成果存储，当前上下文只放摘要、定位标识及必要摘录。

Skills 保存写作方法，例如技术教程、架构文章、事实核验；作者记忆保存表达偏好；MCP 连接外部工具与资料。三者有不同的职责和版本。安装 Skill 不自动扩大工具权限。

### 4. 建立可回退的风格学习闭环

采集作者采纳／拒绝与改稿差异 → 生成带来源的风格建议 → 在既有文章片段上评估 → 作者确认 → 更新风格版本。风格变更与模型／Skill 升级分别记录，便于判断质量变化来自哪里。

第一版采用“建议更新”，后续再决定哪些低影响偏好可自动归纳。后台反思是可配置能力，不与每次聊天强绑定。评估关注保留作者观点、技术事实准确和修改量，而不只看通用语言流畅度。

### 5. 恢复与发布属于产品契约

运行中断后，应区分可重新计算的模型输出与可能已生效的外部写入。发布记录绑定正文版本、平台账户、最终载荷和稳定操作 ID；响应丢失时先核对平台结果。框架的 checkpoint、会话保存和工具重放都不能单独提供跨博客平台的 exactly-once 保证。

### 6. 用可替换边界应对技术变化

| 层 | 第一版建议 | 可演进处 |
| --- | --- | --- |
| 产品界面与领域服务 | 保留 React／Tiptap、TypeScript 后端及 SQLite 方案 | UI、存储和运行时解耦 |
| 主运行时 | LangGraph 与 Pi 两路线原型后冻结一个 | OpenCode／Cline SDK 作为完整 harness 复用备选 |
| 模型接入 | 记录模型能力和用量，不把供应商消息格式当领域 schema | 用同一组中文技术写作样例替换／比较模型 |
| 工具 | 类型化原生工具＋MCP Client | 外部平台各有适配器，单独更新 |
| 记忆与 Skills | 可版本化、可定位、按需加载 | 先检索质量评估，再决定向量检索／后台反思 |
| 子任务 | P0 串行核验；有必要时 P1 最多两个研究子任务、深度一层 | 以覆盖率与成本数据决定是否扩展 |
| 新技术观察 | Pi Durable、Mastra Durable Agent、WorkflowAgent 后端、ACP | 满足部署与恢复场景后再纳入，记录固定版本 |

## 冻结框架前的验证与升级标准

用相同模型、工具、任务材料比较候选：研究中插话、作者同时改稿、进程崩溃后续跑、审批响应接收、发布响应丢失、长会话压缩后找回引用。细节沿用[框架复评中的验证计划](framework-evaluation.md)。

除交互延迟和模型成本，还应记录引用支持率、遗漏关键反例的比例、无进展循环次数、人工修订量，以及接入／升级需修改的代码范围。未完成这些验证，不宣称某框架更快、更可靠或更便宜。

框架升级在独立分支进行：核对 changelog／迁移说明，固定版本，重跑上述场景，再决定是否合入。历史 Run 固定运行时及 schema 版本，Skills 和记忆可独立版本化。这样可以持续吸收新技术，同时保留文章、证据和已有任务的可用性。
