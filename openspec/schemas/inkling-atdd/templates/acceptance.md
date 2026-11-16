# Acceptance design

## Scenario mapping

第一列是稳定场景 ID，必须与 Delta Spec 场景、测试名称、evidence.json 一致。删除示例行，填入真实场景。

| ID | 需求/用户行为 | 层与入口 | 测试或手工流程 | 夹具 | 可观察断言 |
| --- | --- | --- | --- | --- | --- |
| CAPABILITY-ACTION-001 | 行为 | API/E2E/集成 | 路径与测试名称 | 输入 | 输出或副作用 |

## Red and baseline

说明哪些新增行为先得到有效 Red；已有行为如何记录 baseline-pass。

## Required checks

列出 G2 必须执行的实际命令、通过条件、必要手工验证和外部环境。工具未建立时，将建立工具列为实现任务；没有执行前不记通过。

## Scope and fixtures

说明正常、失败、取消、冲突等适用场景；明确替身边界、真实服务验证与不适用项。
