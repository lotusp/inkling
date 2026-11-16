# DEC-0003 使用 OpenSpec 与 ATDD 的个人开发 Harness

日期：2026-11-16。状态：用户明确的流程约束已采纳；目录、schema 与具体执行顺序为本次落地方案，后续根据使用反馈调整。

## 决定

以 OpenSpec 维护当前规格、change delta 和归档历史。一次只推进一个 change，验收先行。G1/G2/G3 保留必要产物检查，取消多角色签署。

使用 `inkling-atdd` schema 加入 acceptance 和 verification，四个薄 Skills 串联计划、实现、验证与收口。默认在 change 分支完成 archive 与规格合并，再通过 Git 一起合入主分支，避免主分支代码与规格短暂不一致。

## 取舍

直接复用教学基线的完整技能包会带入组织角色、vendor 脚本和多次确认，个人项目维护成本较高。本项目只借鉴验收追溯、真实证据与知识回写方法。使用标准 OpenSpec 目录，不另建 Living Spec 根目录。

结构检查不证明语义正确；同一 agent 实现与自检不能宣称独立审阅。真实模型质量与确定性测试分开报告。暂不强制并行 subagent、PR 自我审批或全量模型回归。

## 演进条件

重复出现漏场景、证据过期或架构越层时，优先增加针对性的可执行检查。多人协作、并行 change 或跨仓库出现后再评估角色、分支与更细的权限，不提前建设。

规则、命令与参考来源见[开发 Harness](../engineering/harness.md)，测试约定见[ATDD 与证据](../engineering/atdd-and-evidence.md)。
