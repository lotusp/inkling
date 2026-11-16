---
name: inkling-change-close
description: 在 Inkling change 验证通过后合并 delta、归档并按用户授权合入 Git 主分支，核对 Living Spec 和知识索引。用于收口已实现 change，不跳过验证或扩大远端操作授权。
---

读取 [Harness 的串行与收口约定](../../../docs/engineering/harness.md)和当前 verification/evidence。用户已经授权的操作直接继续，不另设 G1/G2/G3 签署；没有 Git merge/push 授权时先完成可审阅的本地结果，再明确待执行动作。

1. 确认仍只有当前 change，G2 必需证据齐全且指纹匹配当前内容；必要检查有失败或未运行就先处理，不归档。
2. 在 change 分支运行 `openspec archive <id> --yes` 完成规格合并与归档。不使用 `--no-validate`，行为 change 不使用 `--skip-specs`，不手动复制 delta 冒充成功。失败后检查已写结果，修复不一致再继续，不盲目重试归档。
3. 核对每条 delta 在 Living Spec 的真实效果和相关知识文档；运行 `node scripts/harness/check.mjs <date>-<id> --stage archived`、`openspec validate --specs --strict --no-interactive`、`openspec validate --archived --strict --no-interactive`，检查本地文档链接。
4. 按授权将代码、测试、规格和归档一起提交并合入主分支。个人开发可用本地合并或 PR，不要求自我审批。合并导致被测输入变化时重跑受影响验证；冲突解决后不得复用过期证据。
5. 报告合入提交、归档位置、Living Spec 变化、验证结果与限制。G3 只有实际合入、归档与知识检查完成后成立；未完成前不启动下一条 change。

不要为写入自身提交 SHA 反复追加提交，交付说明或 PR 可以保存合入结果。源码中的单 change 检查无法检查其他工作区，执行者需遵守全项目串行约定。
