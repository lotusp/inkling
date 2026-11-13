# 写作 Agent 功能与产品竞争分析

更新日期：2026-11-12。面向 Inkling 的中文技术写作、个人博客与技术社区场景，比较 13 个写作产品及具备写作能力的 Agent 工作台。

现有产品已经覆盖样文风格、知识库、论断核验、长任务生成和多渠道发布。Inkling 值得验证的价值是，把作者经验、技术版本、证据、正文修改和发布后的维护组织成持续可用的写作资产，并降低作者完成一篇技术文章所需的人工工作。

功能依据官方产品页和帮助文档；优缺点包括基于工作方式的适配判断，不是中文质量排名。尚未通过付费账户做同题实测。官方展示的生成时间、排名提升、准确率和用户规模不作为本次比较的实测结论。

## 市场中的五种产品方向

| 方向 | 用户购买的价值 | 代表产品 | 常见交互 |
| --- | --- | --- | --- |
| 作者与编辑共同工作 | 保留表达意图，逐步改好文章 | Lex、Grammarly Docs | 文档编辑器、选区操作、行内建议 |
| 研究与引用写作 | 把资料、论证和参考文献连接起来 | Jenni | 资料库、带引用补全、核验面板、研究工作流 |
| 小说与长篇创作 | 维持人物、世界观、时间线和系列一致性 | Sudowrite、Novelcrafter | 项目设定、情节大纲、场景、章节 |
| 营销与内容运营 | 持续生产符合品牌要求、可分发的内容 | Jasper、Writesonic、Surfer、Koala、讯飞绘文 | 品牌配置、研究流程、编辑、优化、发布和运营 |
| 工作空间与办公成果 | 使用已有资料，生成并修改实际文档 | Notion Agent、WPS 灵犀；笔灵侧重场景化生成 | 聊天与文档结合、任务执行、模板和文件交付 |

这里的 Agent 包括多步骤任务执行产品，也包括以作者操作为主的智能编辑器。产品使用 Agent 名称，不能证明它内部采用多个独立模型代理，或使用某个特定编排框架。

## 作者编辑与研究写作

| 产品 | 已公开的主要功能 | 核心卖点与优势 | 缺点与使用边界 |
| --- | --- | --- | --- |
| [Lex](https://lex.page/about) | 文档聊天、行级 Checks、样文与 Style Guides、可复用知识库、命名版本、历史恢复、协作、Kit 集成 | 写作过程围绕正文展开；背景资料与表达风格可分别管理，作者逐条处理修改建议 | 风格效果取决于样本与模型；免费版的模型和上下文额度较小。首页的通用 Track Changes 仍标 coming soon，不能与现有 Checks 混为一谈 |
| [Jenni](https://help.jenni.ai/docs/getting-started/introduction/) | PDF 与参考文献库、Zotero／Mendeley 导入、章节提示、带引用补全、编辑、协作、文献综述与研究缺口工作流 | 从材料到论证、引用与审阅的路径完整，是 Inkling 事实写作的重要对照产品 | 主要围绕学术来源与论文工作；软件版本、运行环境和博客代码排版需要专项验证。AI 审阅结论仍需作者检查 |
| [Grammarly Docs](https://support.grammarly.com/hc/en-us/articles/38552281546765-Docs-Grammarly-s-new-AI-writing-surface) | 文档内 AI Chat、语法与清晰度建议、改写、Reader Reactions、Citation Finder、评分、创作过程记录 | 从读者视角和具体表达问题切入，审阅入口清楚；可借鉴读者反应模拟 | 当前 Docs FAQ 标为英文写作、桌面端，实时协作尚在开发；导入后再导出可能丢失图片、图表、引用、公式等元素 |

Lex 的 Style Guide 可以同时保存样文和生成的风格说明，并为不同文类建立独立指南。Knowledge Base 保存背景材料，支持文件、网页、Drive 和 Lex 文档；这两类上下文应该分别管理。[Style Guides](https://lex.page/read/3492a59e-ea19-4733-964a-3adc25b5f3e0)、[Knowledge Bases](https://lex.page/read/d70b2ea4-00ff-4abb-a7d3-097a1140a7f0)

Lex 的 Checks 把建议绑定到正文位置，作者可以接受、调整、忽略并查看理由。其 Kit 集成将草稿传入 Kit，最后在 Kit 中发送；首页的 Publishing 则指只读分享链接。这些交付动作不能都写成“直接发布到任意博客”。[Checks](https://lex.page/read/c563b895-d226-40c6-988f-33add2ff1dac)、[Kit](https://lex.page/read/f98a818a-c2af-4730-ad9f-ab76151a51da)、[首页功能状态](https://lex.page/)

Jenni 的 Claim Confidence 已检查缺少依据、支持不足、过度表述、错误归因、矛盾与无法核验的论断；Source Quality 检查引用来源的潜在问题。它还可根据指定来源执行文献综述或研究缺口分析，生成新文档。不能把“提供句子级核验”当作 Inkling 独有功能。[Reviews 与 Workflows](https://docs.jenni.ai/docs/ai-tools/reviews/)

Jenni 的章节提示可限定当前章节使用哪些资料；参考文献有元数据并不代表全文可供 AI 使用。未获取 PDF 的条目可以被引用，但不能直接用于资料库聊天或补全。这是 Inkling 值得采用的资料状态区分。[Autocomplete](https://docs.jenni.ai/docs/ai-tools/ai-autocomplete/)、[Library](https://help.jenni.ai/docs/research/library/)

Grammarly Docs 的 Citation Finder 会查找支持或反驳文章观点的来源；Reader Reactions 模拟受众的理解与疑问。产品边界应按 Docs 这一具体形态判断，不能把它的英文限制扩大到 Grammarly 所有产品。[Docs 功能](https://support.grammarly.com/hc/en-us/articles/38552281546765-Docs-Grammarly-s-new-AI-writing-surface)、[Docs FAQ](https://www.grammarly.com/docs)

## 小说与长篇创作

| 产品 | 已公开的主要功能 | 核心卖点与优势 | 缺点与使用边界 |
| --- | --- | --- | --- |
| [Sudowrite](https://feedback.sudowrite.com/en/help/articles/1671191-what-is-story-bible) | Story Bible、构思、体裁、风格、人物、世界观、梗概、大纲、场景与正文生成；Match My Style | 按小说创作阶段组织上下文，降低从零构思和展开场景的操作负担 | 核心结构面向叙事创作；技术论证要重新组织。官方语言说明承认部分 Draft／Plugin 输出可能回到英文 |
| [Novelcrafter](https://www.novelcrafter.com/features/codex) | Codex 条目、名称／别名识别、出现位置追踪、Progressions、可定制字段、跨系列共享、片段与 AI Chat | 写作知识具有结构、引用位置和随时间变化的状态，适合维护长篇及系列项目 | AI 功能采用 BYOK 路线，模型接入与费用需要另行管理；作者要投入精力维护知识条目和上下文 |

Sudowrite 的 Story Bible 是项目持续上下文，作者可以手工填写或逐步生成内容。它的阶段设计适合借鉴为 Inkling 的“简报、问题、论点、案例、证据”，而不是原样沿用人物和情节字段。多语言使用应测试完整工作流，仅能输入中文不足以证明所有功能的输出一致。[Story Bible](https://feedback.sudowrite.com/en/help/articles/1671191-what-is-story-bible)、[语言说明](https://feedback.sudowrite.com/en/help/articles/2487986-can-i-use-sudowrite-in-other-languages)

Novelcrafter 的条目引用、出现位置和 Progressions，与 Inkling 想建立的技术概念、版本和论断关系有产品层面的相似性。可以借鉴这种领域建模，但公开功能说明并不能证明它底层使用 OWL 或正式本体推理引擎。[Codex](https://www.novelcrafter.com/features/codex)

## 营销内容与博客增长

GEO／AEO 在这些产品中主要指面向 AI 搜索和回答系统的内容可见性与优化；评分与优化动作不能直接视为排名或被引用的保证。

| 产品 | 已公开的主要功能 | 核心卖点与优势 | 缺点与使用边界 |
| --- | --- | --- | --- |
| [Jasper](https://www.jasper.ai/platform) | Brand Voice、Style Guide、Audience／Knowledge、研究与生成 Agents、Canvas、内容 Pipelines、多渠道适配与品牌管理 | 团队共用品牌上下文，将计划、生产、适配和后续优化放在一套流程中 | 团队营销和治理是核心目标；个人作者需要判断配置与运营能力是否值得承担，品牌统一也不等于保留个人观点 |
| [Writesonic](https://writesonic.com/ai-article-writer) | 自有材料与 Web 研究、受众及搜索分析、大纲、分节生成、引用、编辑审阅、作者／品牌风格、配图、CMS 导出 | 把文章生产嵌入搜索可见性工作流；提供较完整的研究到交付流程 | 搜索与商业目标会影响结构；宣传中的多步骤、多专家审阅不能证明事实准确率。个人技术文章要单独评估代码与版本条件 |
| [Surfer](https://docs.surferseo.com/en/articles/5700347-content-editor-overview) | 竞争页面研究、大纲、Brand Knowledge／Voice、手写或 AI 生成、内容及搜索评分、Auto-Optimize、内链建议、发布前检查、WordPress 导出 | 给作者可检查的优化建议，既能辅助已有文章，也能生成初稿 | 分数衡量其优化规则，不能替代技术深度和正确性；部分批量／URL 导入路径与标准编辑向导能力不同 |
| [Koala](https://koala.sh/) | 关键词与站点研究、Brand DNA、文章生成、引用、图片、自动内链、批量内容、SEO Agent、CMS 发布 | 博客内容生产与站点运营连接紧密，多个 CMS 有直接交付路径 | 完整 Agent 有套餐门槛；按关键词和搜索缺口组织内容，对个人经验文章是否合适需实测；生成速度不代表原创洞见 |

Writesonic 当前官网已经主打 AI 搜索可见性；文章页强调自有知识、深度研究、多轮编辑与 CMS 交付。旧帮助文档仍有 Article Writer 6 的分步向导，因此当前产品定位与旧版操作细节应分别引用。[当前平台](https://writesonic.com/)、[当前 Article Writer](https://writesonic.com/ai-article-writer)、[旧版功能文档](https://docs.writesonic.com/docs/ai-article-writer-6-article-types)

Surfer 的 Auto-Optimize 支持审阅和丢弃建议，官方指出建议一旦生成，即使用户取消或拒绝，也会消耗对应额度。对 Inkling 的启发是把“分析完成”“用户采纳”“实际改稿”分成不同状态。[Auto-Optimize](https://docs.surferseo.com/en/articles/9172781-auto-optimize)

Koala 官方列出 WordPress、Shopify、Webflow、Ghost 和 webhook，支持草稿审核或按品牌设置自动发布。它提供的是明确平台的连接能力，不能外推为知乎、掘金等任意社区的写入支持。[Koala 发布能力](https://koala.sh/)

## 中文内容与办公文档

| 产品 | 已公开的主要功能 | 核心卖点与优势 | 缺点与使用边界 |
| --- | --- | --- | --- |
| [讯飞绘文](https://turbodesk.xfyun.cn/home) | 热点与选题、私域知识写作、校对、AI 配图、排版适配、多平台分发、运营数据汇总；官网提供人设与 Agent 用法入口 | 中文内容运营全流程，减少写作、配图、分发之间的搬运 | 核心目标偏新媒体运营；具体支持哪些渠道、账号与套餐需要逐项核验。技术证据与代码示例仍需专项测试 |
| [WPS 灵犀](https://www.lingxi.cn/) | 资料整合、研究、文档生成与修改、可编辑 Word／PPT／Excel；桌面端多步骤、批量与定时任务 | 交付可以继续编辑的文件，适合已有 WPS 文档和办公材料的作者 | 桌面端与 Web 能力不同，高阶任务使用智点；技术博客的 Markdown、代码块和发布路径需另行验证 |
| [笔灵](https://ibiling.cn/) | 场景模板、大纲、正文、续写、改写、扩展、润色、论文与 PPT、新媒体内容、文件导出 | 以具体中文写作任务降低输入门槛，适合快速获得结构和初稿 | 模板丰富不能证明技术准确或文风匹配；“降 AI 率”等营销指标也不能代替质量评估，研究追溯与版本维护应另测 |

讯飞绘文已经公开强调私域知识与多平台分发，因此“中文＋知识库＋发布”并非足够清晰的差异。Inkling 需要验证的是技术作者完成研究、保留个人判断和维护旧文的具体体验。[讯飞绘文](https://turbodesk.xfyun.cn/home)

WPS 灵犀当前官网明确区分客户端与网页版：客户端承担更完整的文件管理和复杂任务，网页版适合轻量对话与文档处理。产品形态和账号范围是比较功能时的一部分。[灵犀 FAQ](https://www.lingxi.cn/)

秘塔写作猫也值得进入中文编辑体验的后续试用。其官方教程搜索索引说明了模板、大纲、续写和选区指令，但本次直接访问只返回浏览器兼容／系统升级页面，无法据此确认当前完整产品状态；暂不计入上述 13 个完整比较样本。[官方教程入口](https://xiezuocat.com/tutorial?tab=pc)

## 工作空间型 Agent

| 产品 | 已公开的主要功能 | 核心卖点与优势 | 缺点与使用边界 |
| --- | --- | --- | --- |
| [Notion Agent](https://www.notion.com/help/notion-agent) | 使用当前页面、工作区和连接应用；搜索、创建和编辑页面／数据库；文件处理；Skills、指令和记忆；MCP 连接 | 资料已经在 Notion 时，能够把收集、任务管理和写作接在一起 | 需要维护工作空间结构和访问范围；个人技术写作仍需明确证据、版本及发布规则。普通 Agent 与后台 Custom Agents 的运行方式不同 |

Notion Agent 按需协助当前工作；Custom Agents 可以按照触发器或计划在后台运行。后台任务涉及的来源和工具范围需要单独配置，不能把这两种模式当作同一个开关。[Notion Agent](https://www.notion.com/help/notion-agent)、[Custom Agents](https://www.notion.com/help/category/custom-agents)

资料阅读与发布也有专门工具可组合使用。此前的[行业与发布渠道调研](industry-and-publishing.md)已经覆盖 Gemini Notebook、Readwise Reader、Obsidian 和 Hashnode；它们分别提供研究、素材和交付环节的参考。Inkling 的用户替代方案也包括“已有资料库＋通用 Agent＋博客”，评测应保留这个基线。

## 已有能力与 Inkling 的差异化假设

| 能力 | 已有代表产品 | 对 Inkling 的要求 |
| --- | --- | --- |
| 从样文建立风格 | Lex、Sudowrite；营销工具也有作者／品牌风格 | 提供明确文体范围、反例和可回退的风格版本；测量作者需要重写多少 |
| 根据私人资料写作 | Lex、Jenni、Jasper、Writesonic、讯飞绘文、Notion | 区分作者经历、外部事实与第三方观点，能定位原始材料 |
| 论断与来源核验 | Jenni、Grammarly Docs；其他产品也有相关检查 | 明确技术版本、适用条件、反例和改稿后的重新核验 |
| 长篇领域知识管理 | Sudowrite、Novelcrafter | 用概念、版本、论断与证据承接技术文章，而非仅维护资料文件夹 |
| 可审阅的局部改写 | Lex、Jenni、Surfer、Grammarly Docs | 保留作者编辑权，补丁绑定正文基线和具体位置 |
| 研究到文章的多步骤任务 | Jenni、Writesonic、Jasper、WPS 灵犀 | 显示阶段、允许中途纠正、保留部分成果和恢复入口 |
| 内容适配与发布 | Koala、Surfer、Writesonic、讯飞绘文 | 优先做好真实博客渠道的代码、公式、图表与版本同步 |

上表显示的是已有功能覆盖，不证明产品之间效果相同。对于 Inkling，最值得验证的组合是“个人中文技术写作＋可追溯论证＋作者经验与风格＋发布后的文章维护”。当前资料不足以声称所有竞品都不提供这套组合。

### 让本体变成作者能用的功能

Ontology 可以作为内部领域模型。作者看到的应该是具体能力：某依赖发布新版本后，找出受影响的旧文；某条证据发生变化后，定位需要复核的论断；同一术语在系列文章中保持一致；作者新观点与旧观点有差异时，保留演进记录。

这需要稳定连接 `Concept / TechnologyVersion → Claim → Assessment / Evidence → SourceSnapshot`，以及论断在 `ArticleRevision` 中的出现位置。风格与作者立场另行保存，避免把资料中的观点混入作者记忆。

本体的产品价值要通过查找、复核与维护任务来验证。添加关系字段本身不能保证事实正确，也不能自动带来更好的文章。

## 优先参考与产品范围

Inkling 第一轮产品试用建议优先选择 Lex、Jenni、Novelcrafter、讯飞绘文，以及作者实际使用的博客发布系统；它们分别覆盖编辑、论证、长期知识和中文分发。Surfer／Koala 适合后续验证搜索增长需求，WPS 灵犀适合验证办公文档交付需求。

| 优先级 | Inkling 功能 | 主要参考 |
| --- | --- | --- |
| P0 | 资料与灵感收集、简报、大纲和正文编辑 | Lex、Novelcrafter |
| P0 | 来源片段、论断关联、核验建议与缺口 | Jenni |
| P0 | 样文与风格规则分开保存，按文章选择 | Lex、Sudowrite |
| P0 | 选区修改、差异审阅、正文版本保护 | Lex、Jenni |
| P0 | Markdown 导出与首个博客的草稿交付 | 博客官方接口、Koala 的交付流程 |
| P1 | 技术版本变化后复核系列文章 | Inkling 领域模型及原型验证 |
| P1 | 读者问题与反例检查 | Grammarly Reader Reactions、研究审阅流程 |
| P1 | 多平台衍生稿、分发与状态追踪 | 讯飞绘文、Koala、Writesonic |
| 按需求扩展 | SEO／GEO 评分、批量内容与运营看板 | Surfer、Jasper、Koala |

## 同题试用方案

用一套真实中文技术材料完成六个任务：

1. 输入官方文档、作者笔记和一篇有意包含过时信息的材料，整理证据与矛盾点。
2. 按指定受众生成大纲，说明每节论点与依据。
3. 输入作者样文，写一个新主题的章节，记录人工修改量。
4. 加入一个与引用不匹配的论断，检查能否指出问题并定位原文。
5. 作者改动正文后再应用 AI 建议，检查是否保留新编辑与正确引用。
6. 导出或发布含代码、表格、图片和公式的文章，再测试修改与更新。

比较指标包括：资料定位成功率、论断支持关系准确性、版本条件遗漏、中文术语一致性、作者修订时间、成果格式保留、任务用时和实际费用。不同产品自带模型时，这属于端到端产品体验比较；只有允许指定相同模型的产品，才能进一步控制模型差异。

试用结果决定 Inkling 的优先级。如果现成工具组合已经能低成本完成某环节，应优先集成；研发投入集中在作者仍需反复搬运、核对和返工的部分。
