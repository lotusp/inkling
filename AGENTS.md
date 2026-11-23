# Inkling development entry

本项目是个人中文技术写作协作助手。C01 本地工作台、C02 正文与版本、C03 多文章管理和 C04 技术编辑器均已归档。稿纸支持表格、公式、流程图、本地图片和文件导入。闻一与发布原型使用模拟数据。后续顺序见 [V1 路线图](docs/engineering/v1-change-roadmap.md)。[文章库规格](openspec/specs/article-library/spec.md) · [技术编辑器规格](openspec/specs/technical-editor/spec.md)

先读取 [开发 Harness](docs/engineering/harness.md)，再按任务读取：

- [代码架构规范](docs/engineering/code-architecture.md)
- [日常开发规范](docs/engineering/development-rules.md)
- [ATDD 与证据](docs/engineering/atdd-and-evidence.md)
- [V1 范围](docs/product/v1-scope.md) 与当前 OpenSpec change

关键约定：一次一个 active change；验收先于实现；每个可独立验证步骤完成、检查通过并更新进度后立即本地 commit，再进入下一步；G1/G2/G3 校验产物与证据，不要求多人签署。实际已交付行为的权威位置是 `openspec/specs/`，目标设计留在 `docs/`。通过 G2 后，在 change 分支 archive 更新规格，再把代码和规格一起合入主分支。

所有 Git 提交的标题和正文都使用英文。提交格式见[日常开发规范](docs/engineering/development-rules.md#git-与知识更新)。

Skills 位于 `.agents/skills/inkling-*/`；可以使用自然语言调用。它们不扩大当前授权，不自动进行远端 push、公开发布或多 agent 并行开发。

开始与恢复时检查 Git 状态、active change 和现有修改。未运行的检查不能记通过，原型不能冒充产品实现。文档分类存放，`docs` 根目录只保留 README。
