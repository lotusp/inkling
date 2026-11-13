# Inkling Agent 框架复评

核验日期：2026-11-12。本文重新评估此前的 LangGraph.js 建议，补充 Pi 与公开 Agent 产品实现。结论是设计判断，不是性能基准或市场排名；未安装候选依赖，也未执行原型或故障测试。

更广泛的项目筛选、当前技术栈、架构变迁与取舍，见[开源 Agent 架构全景调研](open-source-agent-landscape.md)。该文补充 OpenCode、Hermes、Letta、OpenHands、DeerFlow、Cline 等项目，并区分产品、运行时与应用平台。

## 结论与选型状态

LangGraph 不是所有 Agent 的最佳选择。它是 Inkling 当前“本地存储、长研究可恢复、等待作者确认、审阅返工”方案的首选候选；只有通过实际恢复与交互验证后才冻结依赖。此前的[技术设计](../architecture/agent-architecture.md)和[运行架构图](../diagrams/inkling-agent-runtime.html)描述该候选方案，不代表其他实现被排除。

如果第一版收缩为交互式单 Agent，允许进程退出后由作者继续未完成任务，Pi agent-core 或 AI SDK ToolLoopAgent 会成为有竞争力的较轻路线。这个变化包含恢复语义的取舍，不能只替换包名后保留原来所有可靠性承诺。

建议保留三项决策：

1. 产品层拥有文章、证据、风格、授权和版本，不依赖某个框架的数据结构。
2. 交互上借鉴 Pi：一个可被作者纠正的主 Agent，按需使用工具和技能，文章阶段不强制决定下一步动作。
3. 工程上先验证 LangGraph 与 Pi agent-core 两个候选；pi-durable 作为实验路线观察，AI SDK/Mastra 作为集成路线参考。不要同时引入几套循环。

## 先区分四类技术

| 类别 | 解决的问题 | 例子 |
| --- | --- | --- |
| 模型接入层 | 请求、流式事件、提供方差异 | Pi AI、AI SDK 的模型接口 |
| Agent 内核 | 模型—工具循环、上下文、取消、事件 | Pi agent-core、AI SDK ToolLoopAgent、OpenAI Agents SDK |
| 持久编排运行时 | 执行状态、等待、故障恢复、分支 | LangGraph、WorkflowAgent 及其 Workflow 后端、Mastra Workflows |
| 完整运行环境（harness）与产品 | 会话、上下文压缩、技能、权限、交互及环境集成 | Pi Coding Agent、Claude Code/Agent SDK、Codex、Deep Agents |

这些类别会重叠。LangGraph 提供底层编排，LangChain 提供 Agent 构件，Deep Agents 在其上提供更完整的 harness；选择 LangGraph 不等于已经获得整个写作 Agent。[LangGraph 定位](https://docs.langchain.com/oss/javascript/langgraph/overview)、[Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview)

## 候选比较

| 候选 | 值得选它的原因 | Inkling 仍需承担的工作或限制 |
| --- | --- | --- |
| LangGraph.js | 显式状态、条件边、子图、检查点和人工中断；适合研究、审阅与确认交织 | 状态 schema、图版本、恢复协议和业务事务仍需设计；普通局部编辑可直接调用，不必全部图化 |
| Pi AI + agent-core | 多模型接入、上下文转换、工具事件、steering/follow-up，适合作者持续干预 | 核心包不提供完整持久工作流；会话、操作日志、预算和发布控制由宿主实现 |
| Pi Coding Agent SDK | 已有会话树、压缩、Skills、Extensions、MCP，可直接嵌入 TS 后端 | 默认编码工具和资源发现需要替换；持久会话不等于中断工具自动恢复 |
| Pi Durable | 持久会话、任务与文档，工具重放策略；有 SQLite 路线 | v1.5.2 文档仍标 Experimental；它是另一套 harness，不是 agent-core 的透明持久插件 |
| AI SDK | ToolLoopAgent 与 Web 流式界面；WorkflowAgent 提供持久循环和审批 | 两种运行方式必须区分；WorkflowAgent 还需 Workflow 执行后端，不是加一张 SQLite 表就完成 |
| Mastra | Agent、Workflows、Memory、Skills、观测等应用构件比较集中 | 应用需接受其对象和存储组织；Durable Agent 包装当前标 beta，不应把整个框架都称为 beta |
| OpenAI Agents SDK | 代码式 Agent、工具、handoff、session、审批和追踪 | 业务资产、部署、工具实现和最终授权仍由应用负责 |
| Claude Agent SDK / Codex app-server | 复用现成产品的运行环境、会话、工具和交互协议 | 需要适配各自运行方式、配置及工具语义；适合“嵌入已有 Agent”路线 |

AI SDK 的 WorkflowAgent 已具备状态持久化与可恢复审批，不能再用“只支持聊天”概括。它依赖 Workflow 5；Local World 用于开发，生产应选择适合部署环境的 World。自托管路线可以采用相应后端，不等于必须部署 Vercel。[WorkflowAgent](https://ai-sdk.dev/docs/agents/workflow-agent)、[部署方式](https://workflow-sdk.dev/docs/deploying)

Mastra 集成了记忆与显式工作流；其 Durable Agent 页面明确标 beta，普通 Agent、Workflows 与 durable-agent 包装应分别判断。[Memory](https://mastra.ai/docs/memory/overview)、[Workflows](https://mastra.ai/docs/workflows/overview)、[Durable Agents](https://mastra.ai/docs/harness/durable-agents)

OpenAI Agents SDK 在应用进程内管理循环；它与 Codex app-server 的完整 harness 接入属于不同路线。SDK 已有会话和审批机制，不能以缺少这些能力为由排除。[Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk)、[循环与会话](https://developers.openai.com/api/docs/guides/agents/running-agents)

## Pi 的当前实现

官方仓库已由 `badlogic/pi-mono` 迁至 `earendil-works/pi`，包名使用 `@earendil-works/*`。本次以 GitHub 2026-11-10 的 v1.5.2 标签为主要依据，避免混用 main 和旧教程。GitHub 发行记录已核验，npm registry 的分发记录未独立核验。[迁移公告](https://pi.dev/changelog/2026/5/7/pi-has-a-new-home)、[发行记录](https://github.com/earendil-works/pi/releases/tag/v1.5.2)

传统路线是 `pi-ai → pi-agent-core → pi-coding-agent`。其中 agent-core 提供循环，coding-agent 增加会话、资源加载和交互。`pi-durable` 则直接依赖 pi-ai 与 Chord，是独立的持久 harness，不能假设导入它就能给 Coding Agent 的现有会话加上完全相同的恢复语义。[agent-core](https://github.com/earendil-works/pi/blob/v1.5.2/packages/agent/README.md)、[Coding Agent 依赖](https://github.com/earendil-works/pi/blob/v1.5.2/packages/coding-agent/package.json)、[Durable 依赖](https://github.com/earendil-works/pi/blob/v1.5.2/packages/durable/package.json)

Pi 对 Inkling 最有价值的是以下交互机制：

- **Steering**：作者说“先别写，检查一下反例”，在安全的轮次边界改变当前任务方向。
- **Follow-up**：作者说“做完后给我三个标题”，排入后续工作。
- **Abort**：作者明确停止当前执行；不能把插话当成已取消正在执行的工具。
- **上下文转换**：界面消息、任务状态与真正发送给模型的消息分开。
- **事件与会话**：界面显示过程，最终消息及会话记录负责保存结果；底层循环结束事件不一定代表自动重试和队列工作已全部结束。

v1.5.2 的 steering 在本轮模型输出与工具调用完成后进入；最终 settled 语义应按固定版本 SDK 契约处理。[循环源码](https://github.com/earendil-works/pi/blob/v1.5.2/packages/agent/src/agent-loop.ts)、[SDK 与会话](https://github.com/earendil-works/pi/blob/v1.5.2/packages/coding-agent/docs/sdk.md)

Pi Coding Agent 当前已内置 MCP 扩展；Skills 与可执行 Extensions 是不同机制。默认不提供完整 subagent 产品功能，官方有扩展示例。应避免沿用“Pi 没有 MCP”或“所有 Pi 包都有 subagent”的旧式概括。[MCP](https://github.com/earendil-works/pi/blob/v1.5.2/packages/coding-agent/docs/mcp.md)、[Skills](https://github.com/earendil-works/pi/blob/v1.5.2/packages/coding-agent/docs/skills.md)、[子代理示例](https://github.com/earendil-works/pi/blob/v1.5.2/packages/coding-agent/examples/extensions/subagent/index.ts)

Pi Durable 已有恢复与工具重放策略，但 README 明确允许 API 无通知变化。只有被声明可安全重放的工具才能在相应中断场景重试，外部博客 API 仍不具备跨系统事务保证。单份 storage 的运行所有权也应按文档管理，不能直接当作多 Worker 调度服务。[Durable 契约](https://github.com/earendil-works/pi/blob/v1.5.2/packages/durable/README.md)、[副作用规范](https://github.com/earendil-works/pi/blob/v1.5.2/packages/durable/docs/spec.md)、[作者设计说明](https://earendil.com/posts/pi-durable/)

## 公开产品是如何组织 Agent 的

以下仅描述公开文档与源码能证实的实现，不据此声称所有商业产品使用同一种架构。

| 产品 | 可核验的组织方式 | 对 Inkling 的启示（设计推断） |
| --- | --- | --- |
| Pi | 可嵌入内核、会话与扩展层；另有实验性 durable harness | 让作者中途纠正方向；按需加载上下文和技能 |
| Codex | 自有 harness；app-server 暴露 thread、turn、item、事件、steering 与审批 | UI 与运行环境可分离，领域记录仍归应用管理 |
| Claude Code / Agent SDK | SDK 复用 Claude Code 的循环、工具、上下文和会话 | 若接受其运行方式，可以复用完整 harness，减少自行拼装 |
| OpenClaw 当前文档/main | 已有自有 agent-core、session、compaction、工具策略和 harness 选择层 | 产品边界保持独立，运行时可以替换或逐步内部化 |

Codex 官方说明明确区分应用负责的业务界面与记录，以及 harness 负责的循环、上下文、工具和审批交互；app-server 是深度产品集成入口。[官方架构说明](https://developers.openai.com/blog/codex-as-a-platform)、[app-server 协议](https://learn.chatgpt.com/docs/app-server)

Claude Agent SDK 提供与 Claude Code 相同的运行循环，并支持会话、压缩、Skills、MCP、子 Agent 和工具权限；它不是单纯的模型 API SDK。[SDK 概览](https://code.claude.com/docs/en/agent-sdk/overview)、[运行循环](https://code.claude.com/docs/en/agent-sdk/agent-loop)

OpenClaw 的当前官方架构说明明确已不依赖外部 Agent 框架，只保留 Pi TUI 组件。旧的 Pi 嵌入教程不能作为当前发行版架构的证据；本次未核验其全部历史发行版。[当前运行架构](https://docs.openclaw.ai/agent-runtime-architecture)

## Inkling 应如何吸收这些做法

保持一个主写作 Agent，根据当前目标选技能与工具。文章的“研究/起草/审阅”是业务状态，不强迫每次请求从头经过全部步骤。循环的稳定骨架可以是：组装上下文 → 单次模型调用 → 校验动作 → 执行工具或委派 → 校验成果 → 继续、等待或结束。

LangGraph 方案只把需要恢复和分支的执行边界放入图中。记录灵感、普通查询、段落格式转换等确定性短操作直接调用业务服务。研究时下一次搜索什么由 Agent 决定，授权和版本规则由程序决定。

Pi core 方案由内核管理循环；Inkling 负责会话存储、调用前预算、操作日志、候选成果与恢复入口。它减少图的抽象，但不会消除这些产品责任。纯模型调用未知时可以有限重算，外部写入未知时必须核对结果。

Skills 和 MCP 与选哪套编排器无必然绑定。作者记忆、证据卡和正文版本也不应以某个 SDK 的聊天历史作为唯一记录。

可以组合框架，但必须明确每个执行边界谁负责预算、取消、重试和恢复。第一版避免 LangGraph 节点内部再运行无边界 Pi/AI SDK 循环；若将来需要嵌套，子运行必须有自己的 ID、状态、限额和恢复协议。

## 冻结选型前的最小验证

使用相同模型、工具和材料验证两套候选，排除模型差异：

1. 编辑过程中插话：研究中途改方向，追加任务与取消有明确不同的结果。
2. 生成补丁期间作者改稿：成果保留，但旧基线不能覆盖新正文。
3. 模型、工具和确认接收边界中断进程：已接收任务可找回，预算不回退，确认不丢失。
4. 模拟博客已成功但响应丢失：不得重复创建远端文章。
5. 长会话压缩后：事实引用和已确认风格仍能从业务资产重建。

记录接入代码与定制点、失败恢复正确性、交互延迟、模型用量和调试难度。未通过这组验证前，不宣称任何候选已经更快、更稳或更便宜。当前没有证据需要推翻 LangGraph 候选；应修正的是“已经存在一个无条件最优框架”的表述。
