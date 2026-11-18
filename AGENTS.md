# Inkling development entry

本项目是个人中文技术写作协作助手。C02 正文持久化已实现、通过 G2 并完成规格归档，已有工作空间、访问保护、正文自动保存、浏览器草稿恢复、冲突比较/显式合并与救援下载；版本历史、命名、比较和恢复已接通，AI 与发布尚未接入。docs/prototypes 中的演示仍使用模拟状态。C03 `manage-article-library` 功能切片已实现，当前进行收口验收；作者已反馈中文输入正常，V3 写作台已接通，分项候选窗记录与新版 Linux CI 仍待收口，尚未通过 G2/G3，不提前开启 C04。

先读取 [开发 Harness](docs/engineering/harness.md)，再按任务读取：

- [代码架构规范](docs/engineering/code-architecture.md)
- [日常开发规范](docs/engineering/development-rules.md)
- [ATDD 与证据](docs/engineering/atdd-and-evidence.md)
- [V1 范围](docs/product/v1-scope.md) 与当前 OpenSpec change

关键约定：一次一个 active change；验收先于实现；每个可独立验证步骤完成、检查通过并更新进度后立即本地 commit，再进入下一步；G1/G2/G3 校验产物与证据，不要求多人签署。实际已交付行为的权威位置是 `openspec/specs/`，目标设计留在 `docs/`。通过 G2 后，在 change 分支 archive 更新规格，再把代码和规格一起合入主分支。

Skills 位于 `.agents/skills/inkling-*/`；可以使用自然语言调用。它们不扩大当前授权，不自动进行远端 push、公开发布或多 agent 并行开发。

开始与恢复时检查 Git 状态、active change 和现有修改。未运行的检查不能记通过，原型不能冒充产品实现。文档分类存放，`docs` 根目录只保留 README。
