# Inkling 产品知识库

更新日期：2026-11-13。当前阶段：产品探索与设计，应用尚未实现。此目录保存产品为什么存在、依据什么做决定、计划如何实现，以及实际验证了什么。

## 从这里开始

1. [初步行业调研](research/industry-overview.md)：相近产品、替代方案、机会与证据边界。
2. [设计哲学](product/design-philosophy.md)：作者主导、问题探索、论证、表达与长期积累的原则。
3. [核心价值](product/core-value.md)：服务谁、解决什么问题、如何证明价值。
4. [用户旅程与 MVP](product/thinking-partner-product-design.md)：Design Thinking、As-is、To-be、交互示例与 Roadmap。
5. [知识组织与维护规则](handbook/knowledge-management.md)：知识如何分类、更新、追溯与沉淀。

## 当前知识地图

| 知识 | 主要入口 | 状态与阅读边界 |
| --- | --- | --- |
| 行业与机会 | [行业调研](research/industry-overview.md) | 初步调研，中文效果与产品优势待验证 |
| 原则 | [设计哲学](product/design-philosophy.md) | 基于作者目标的当前设计约束 |
| 价值 | [核心价值](product/core-value.md) | 目标已明确，优势与指标仍是待验证假设 |
| 旅程、交互、MVP 与路线 | [协作设计](product/thinking-partner-product-design.md) | 当前提案，不表示所有交互细节已确认 |
| 产品定位决策 | [DEC-0001](decisions/0001-thinking-partner-positioning.md) | 记录作者明确提出的方向与范围 |
| 实现架构 | [Agent 架构](architecture/agent-architecture.md) | LangGraph 候选方案，尚未冻结、未实现 |
| 框架选择 | [框架复评](research/framework-evaluation.md) | 需同任务 POC 验证；不是依赖清单 |
| 未决事项 | [开放问题](product/open-questions.md) | 进入对应阶段时验证，不要求一次回答所有问题 |

## 专题研究与早期方案

- [写作产品竞争分析](research/writing-agent-competitive-analysis.md)：广泛产品功能、卖点和限制；其中优先级以当前产品范围为准。
- [行业与发布渠道评估](research/industry-and-publishing.md)：早期行业分析和平台接入资料，实际接入前重新核验。
- [开源 Agent 架构调研](research/open-source-agent-landscape.md)：公开项目设计与工程取舍，属于调研证据。
- [早期产品与技术方案](product/product-design.md)：保留详细能力参考，范围冲突以当前 MVP 为准。
- [架构图与验证记录](diagrams/README.md)、[Agent 运行图说明](diagrams/inkling-agent-runtime-notes.md)：表达候选设计；图形校验通过不等于系统已实现或架构已验证。

`docs` 根目录只保留本 README，所有其他文档均按主题分类。文档迁移时同步更新仓库内引用，不在根目录保留迁移占位文件。知识维护规则位于 `handbook`，未决产品问题位于 `product`，候选框架研究位于 `research`，架构方案位于 `architecture`。

## 按工作阶段使用

| 当前工作 | 阅读依据 | 应补充的知识 |
| --- | --- | --- |
| 发现需求 | 行业调研、核心价值、真实写作材料 | 观察事实、待验证假设和研究结果 |
| 设计能力 | 原则、旅程、开放问题 | 功能范围、交互状态、失败路径和验收标准 |
| 做重大取舍 | 研究与验证证据 | 决策背景、备选、代价与复审条件 |
| 实施 | 功能规范、架构、已接受决策 | 代码与接口入口、数据变更、实际偏差 |
| 验证 | 功能验收与价值假设 | 方法、版本、结果、失败案例和限制 |
| 发布维护 | 已验证功能与部署方案 | 发布版本、部署恢复、已知限制和复盘 |

## 模板

- [研究记录](templates/research.md)
- [功能规范](templates/feature.md)
- [决策记录](templates/decision.md)
- [验证与实验](templates/validation.md)

当前没有测试结果、上线记录或真实用户访谈结论；未来在对应工作发生时创建，不用空白文档制造完成状态。
