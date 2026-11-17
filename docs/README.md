# Inkling 产品知识库

更新日期：2026-11-17。当前阶段：C02 正文持久化实施中，已有在线自动保存、重开、草稿恢复、冲突比较/显式合并与救援下载；版本历史、命名、比较和恢复已接通，AI 协作尚未完成。MVP 目标为单台 Mac 本地运行。此目录保存产品为什么存在、依据什么做决定、计划如何实现，以及实际验证了什么。

## 从这里开始

1. [初步行业调研](research/industry-overview.md)：相近产品、替代方案、机会与证据边界。
2. [设计哲学](product/design-philosophy.md)：作者主导、问题探索、论证、表达与长期积累的原则。
3. [核心价值](product/core-value.md)：服务谁、解决什么问题、如何证明价值。
4. [V1 功能范围与交付设计](product/v1-scope.md)：完整首版的十二项能力、交互、实施批次和验收。
5. [用户旅程与协作设计](product/thinking-partner-product-design.md)：Design Thinking、As-is、To-be 与交互示例。
6. [知识组织与维护规则](handbook/knowledge-management.md)：知识如何分类、更新、追溯与沉淀。
7. [单台 Mac 本地架构](architecture/local-macos-mvp.md)：进程、编辑、Agent 与恢复提案；文章存储设计已选定，分步骤实施。
8. [开发 Harness](engineering/harness.md)：串行 change、ATDD、开发规范、证据与 Living Spec 收口。

## 当前知识地图

| 知识 | 主要入口 | 状态与阅读边界 |
| --- | --- | --- |
| 行业与机会 | [行业调研](research/industry-overview.md) | 初步调研，中文效果与产品优势待验证 |
| 原则 | [设计哲学](product/design-philosophy.md) | 基于作者目标的当前设计约束 |
| 价值 | [核心价值](product/core-value.md) | 目标已明确，优势与指标仍是待验证假设 |
| V1 范围与实施顺序 | [V1 范围设计](product/v1-scope.md) | 完整首版提案，逐项设计和验收 |
| 交互原型 | [正文与 Chat 工作台 V2](prototypes/README.md) | 可交互演示；AI、研究与发布为模拟 |
| 旅程与协作 | [协作设计](product/thinking-partner-product-design.md) | 用户过程与交互方法，按 V1 范围推进 |
| 产品定位决策 | [DEC-0001](decisions/0001-thinking-partner-positioning.md) | 记录作者明确提出的方向与范围 |
| 本地部署决策 | [DEC-0002](decisions/0002-local-macos-mvp.md) | 单台 Mac 目标已明确，实现选择仍为提案 |
| 实现架构 | [单台 Mac 本地架构](architecture/local-macos-mvp.md) | 当前 MVP 提案，Pi 优先 POC，尚未冻结、未实现 |
| 文章保存设计 | [DEC-0004](decisions/0004-article-storage-and-revisions.md)、[存储 POC](validation/article-storage-poc.md) | JSON 正文 + SQLite 已接入开发分支；完整 change 尚未通过 G2 |
| 框架选择 | [框架复评](research/framework-evaluation.md) | 需同任务 POC 验证；不是依赖清单 |
| 本地工程 | [运行与检查](engineering/local-development.md) | 本机服务、持久编辑、草稿恢复、真实工程检查；AI 待接入 |
| 开发方法 | [Harness](engineering/harness.md)、[DEC-0003](decisions/0003-openspec-atdd-harness.md) | OpenSpec、ATDD 与首批应用检查已建立 |
| V1 Change 路线图 | [Change 拆分与依赖](engineering/v1-change-roadmap.md) | 建议 17 条，bootstrap 已完成，文章持久化正在分步骤实现 |
| 代码规范 | [架构边界](engineering/code-architecture.md)、[日常规范](engineering/development-rules.md) | 新代码应遵循；模块随实现建立 |
| 验收与证据 | [ATDD 约定](engineering/atdd-and-evidence.md)、[Harness 验证](validation/harness-bootstrap.md) | 已验证流程工具，不代表应用通过验收 |
| 未决事项 | [开放问题](product/open-questions.md) | 进入对应阶段时验证，不要求一次回答所有问题 |

## 专题研究与早期方案

- [写作产品竞争分析](research/writing-agent-competitive-analysis.md)：广泛产品功能、卖点和限制；其中优先级以当前产品范围为准。
- [行业与发布渠道评估](research/industry-and-publishing.md)：早期行业分析和平台接入资料，实际接入前重新核验。
- [开源 Agent 架构调研](research/open-source-agent-landscape.md)：公开项目设计与工程取舍，属于调研证据。
- [早期产品与技术方案](product/product-design.md)：保留详细能力参考，范围冲突以当前 MVP 为准。
- [早期 Agent 架构](architecture/agent-architecture.md)：LangGraph、独立 Worker 和完整发布恢复方案，按当前本地 MVP 收敛实施。
- [架构图与验证记录](diagrams/README.md)、[Agent 运行图说明](diagrams/inkling-agent-runtime-notes.md)：表达候选设计；图形校验通过不等于系统已实现或架构已验证。

`docs` 根目录只保留本 README，所有其他文档均按主题分类。文档迁移时同步更新仓库内引用，不在根目录保留迁移占位文件。知识维护规则位于 `handbook`，未决产品问题位于 `product`，候选框架研究位于 `research`，架构方案位于 `architecture`。

## 按工作阶段使用

| 当前工作 | 阅读依据 | 应补充的知识 |
| --- | --- | --- |
| 发现需求 | 行业调研、核心价值、真实写作材料 | 观察事实、待验证假设和研究结果 |
| 设计能力 | 原则、旅程、开放问题 | 功能范围、交互状态、失败路径和验收标准 |
| 做重大取舍 | 研究与验证证据 | 决策背景、备选、代价与复审条件 |
| 实施 | 当前 OpenSpec change、Harness、架构、已接受决策 | 代码、测试、实际验证证据与偏差 |
| 验证 | 功能验收与价值假设 | 方法、版本、结果、失败案例和限制 |
| 发布维护 | 已验证功能与部署方案 | 发布版本、部署恢复、已知限制和复盘 |

## 模板

- [研究记录](templates/research.md)
- [功能规范](templates/feature.md)
- [决策记录](templates/decision.md)
- [验证与实验](templates/validation.md)

当前有原型、Harness 与本地工作台的检查记录，尚无正式上线或真实用户访谈结论。已交付行为由仓库 `openspec/specs/` 维护；实施中的契约与证据在对应 `openspec/changes/` 目录。

当前 C02 的存储故障与容量边界已有自动验收，目标 Mac 的测量结果见[存储性能验证](validation/article-storage-performance.md)。真实中文输入法已由用户手工确认通过；Linux CI 与 G2 验收已通过，见[验收报告](../openspec/changes/archive/2026-11-17-persist-article-revisions/verification.md)。该 change 尚未归档或合入主分支。
