# Harness 初始化验证

日期：2026-11-16。状态：已执行，结论仅限流程工具与结构检查。环境：macOS，本机 Node 22.22.1、OpenSpec 1.16.1。

## 检查与结果

| 检查 | 结果 | 可重复入口 |
| --- | --- | --- |
| gate 结构检查行为 | 10 个测试通过 | `node --test scripts/harness/check.test.mjs` |
| 自定义 schema | CLI 验证通过 | `OPENSPEC_TELEMETRY=0 openspec schema validate inkling-atdd` |
| OpenSpec 实际闭环 | 临时夹具通过 schema、plan、apply readiness、strict validate、archive 与 Living Spec 内容检查 | `OPENSPEC_TELEMETRY=0 node scripts/harness/openspec-smoke.mjs` |
| 当前串行约束 | 当前无产品 active change，结构检查通过 | `node scripts/harness/check.mjs` |
| 知识链接与目录 | 本地文件链接与 docs 根目录规则通过；不验证网页及标题锚点 | `node scripts/harness/docs-check.mjs` |
| 四个本地 Skills | skill-creator 的 quick_validate 逐个通过 | 对 `.agents/skills/inkling-*/` 逐个执行技能验证器 |

结构检查测试覆盖：第二条 active change、缺必要产物、正常验收映射、实现变化使 hash 过期、非零退出码、缺场景证据、未完成任务、越界日志路径、未知 change/stage，以及漏掉 delta 指纹。

在实现结构检查逻辑前，使用返回无错误的初始接口运行这些验收，9 个检查因没有阻断错误输入而失败、1 个有效输入用例通过；实现后 10 个均通过。这是 Harness 自身的 Red/Green，不是 Inkling 产品的验收证据。

OpenSpec 冒烟在临时目录使用合成规格、代码与证据夹具，确认真实 CLI 会将完整 Requirement、Scenario 与 Purpose 写入 Living Spec 并归档；执行后清理临时目录。夹具中的 passed 数据用于测试流程，未写入本项目产品 change。

## 限制

未安装或升级全局 OpenSpec，未运行真实模型或博客调用，未创建 Inkling 应用代码、完整 CI 或产品 Living Spec。G1/G2/G3 的语义判断、证据覆盖完整性与 Git 合入仍需按照开发规范执行；结构脚本不能证明日志真实或测试断言充分。
