---
name: inkling-atdd-apply
description: 按 Inkling 当前 OpenSpec change 的验收场景逐个实现测试与代码，维护 Red/Green 证据和可恢复进度。用于已具备计划的实现，不并行开启其他 change。
---

读取 [Harness](../../../docs/engineering/harness.md)、[ATDD](../../../docs/engineering/atdd-and-evidence.md)和[开发规范](../../../docs/engineering/development-rules.md)，读取当前 change 的全部计划产物与涉及模块。

先检查 G1；缺产物就补齐，实质范围冲突先修正规格。使用 `openspec instructions apply --change <id>` 获取上下文，但不把 tasks 存在等同于 G1 通过。

一次处理一个验收切片：先写验收并运行，确认因行为缺失产生有效 Red；实现最小变化使同一场景 Green，补必要回归并整理。已有行为记录 baseline-pass，不制造失败。外部环境错误不能算有效 Red。

更新任务、对应文档和进度。偏离契约时回写 delta/design/acceptance 后继续，不偷偷改变测试预期。单元测试只补有价值的逻辑；UI/存储契约通过真实相关入口验证，模型等外部依赖可使用明确的替身。

中断时记录当前场景、最后命令和结果、下一个动作。重复失败没有新信息时缩小复现；不通过删测试、放宽断言或标 skip 变绿。实现完成进入验证流程，不自动 archive、merge 或 push。
