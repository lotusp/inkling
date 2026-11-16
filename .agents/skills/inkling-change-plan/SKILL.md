---
name: inkling-change-plan
description: 为 Inkling 创建或完善一个 OpenSpec change 的 proposal、delta、design、ATDD 验收和任务。用于开始功能或调整变更范围，不直接实现产品代码。
---

读取 [Harness](../../../docs/engineering/harness.md)、[架构边界](../../../docs/engineering/code-architecture.md)与相关现有规格。用户目标已明确时不重复提问。

1. 检查 Git 状态和 `openspec list --json`，已有 active change 时先恢复它；待办想法不创建第二条 change。
2. 没有 active change 时使用 `openspec new change <id> --schema inkling-atdd`；按当前授权创建 `codex/<id>` 开发分支。已有用户改动先识别并保留。
3. 用 `openspec instructions <artifact> --change <id>` 取得 proposal、specs、design、acceptance、tasks 的模板与依赖，逐个填入真实内容。
4. 场景带稳定 ID；验收覆盖实际入口、断言、夹具和重要失败路径；任务按可运行切片组织。重大架构选择记 ADR，普通决定留在 design。
5. 运行 `node scripts/harness/check.mjs <id> --stage plan` 和 `openspec validate <id> --strict --no-interactive`，再人工式核对 Spec → Design → Acceptance → Tasks。

全部必要产物可用才报告 G1 可实施。脚本只验证结构，不能替代语义判断。可安全推定的选择记录理由；只有行为或授权的关键缺口才向用户确认。遵循当前任务范围，用户只要求设计时在可审阅方案处结束，不自动实现或发布。
