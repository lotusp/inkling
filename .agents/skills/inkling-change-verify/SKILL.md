---
name: inkling-change-verify
description: 对 Inkling 当前 change 执行必要测试、检查规格与代码差异，并汇总真实验证证据。用于判断是否可合入，不代替 archive 或 Git merge。
---

读取 [ATDD 与证据](../../../docs/engineering/atdd-and-evidence.md)和 change/acceptance.md。命令从实际仓库配置、验收设计中取得；缺少必需入口时补实现或记录阻断，不能编造通过。

1. 核对所有场景与测试、实现任务，运行必需命令和相关回归；收集有效 Red/Green 或 baseline-pass。模型效果与确定性工程测试分开报告。
2. 审阅 Git diff、代码边界、失败恢复及原意/数据保护。区分自检与独立审阅，记录发现及处理；修复后重跑受影响测试。
3. 写 verification.md 与 evidence.json，格式见规范。精简日志放 evidence/；subject 指纹覆盖全部 delta 和相关实现、测试、配置、依赖、提示词、夹具。对照 Git diff 核对覆盖，脚本不会自动发现被漏掉的输入。
4. 运行 `node scripts/harness/check.mjs <id> --stage verify` 与 `openspec validate <id> --strict --no-interactive`。

G2 要求必要行为检查真实通过且无阻断发现。结构通过只是其中一项。缺环境或账号记未执行，不以 mock 代替真实适配器验收；存在必需未执行项时不能报告可合入。用户已授权的本地修复可以继续，无需收集角色签名。
