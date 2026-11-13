# Inkling Agent 运行架构图说明

该图描述拟议的内部逻辑架构：以 TypeScript 模块化单体实现，常驻 Node worker 领取持久任务，LangGraph.js 统一负责工作流、Agent 循环、暂停和恢复。图中模块不表示需要拆分为独立微服务。

- [交互 HTML](inkling-agent-runtime.html)
- [可编辑 JSON 规范](inkling-agent-runtime.json)

## 主要调用关系

主路径为 `Web / API / Session → 持久 Job 队列 → LangGraph.js Runtime → Policy Tool Broker → 原生工具与 MCP 适配器`。箭头表示主要调用或任务流向，省略响应回传和部分数据读取关系。运行进度可由 API 返回工作台，图中不重复绘制回程。

持久 Job 队列只负责调度、租约和重试，不能再形成另一套 Agent 循环。LangGraph.js 是唯一工作流与循环编排器；ModelGateway 每次只执行一次模型调用，模型提出的工具请求仍需交给 Runtime 与 Policy Tool Broker 处理。

Context Builder 按权限和当前任务范围加载会话、文章快照、作者 Memory 与适用 Skills。Skills 描述方法和约束，不授予工具权限。MCP 适配器连接外部工具，不承担 Agent 循环，也不因为连接成功就获得公开写入权限。

Checkpoint、文章业务版本和操作日志在图中合并显示为一个持久化节点，但三者分别管理：图状态支持恢复，文章版本保存业务事实，操作日志记录工具执行与结果对账。恢复 Checkpoint 不等于已完成的外部副作用可以安全重放。

可选 Subagent 是 Runtime 调用的受限子图。P0 默认串行；P1 可对彼此独立的调研任务并行。子图仅返回结构化成果，由主流程合并和审阅，不直接改稿或发布。公开写入必须由 Policy Tool Broker 校验文章版本、目标平台和有效授权，并由发布器负责幂等、状态查询与结果记录。平台凭据不得进入模型上下文。

## 交付与校验记录

- 日期：2026-11-12。
- 图类型：`architecture`。
- 主节点：8；关系：7；说明卡片：3。
- 规范与静态产物校验：`9/9 showcase`，`0 errors`，`0 warnings`。
- 静态构图诊断：无交叉关系、模糊共用路径、标签遮挡或桌面可读性错误。
- HTML 由 Archify 的 `deliver` 原子生成，退出码为 0。
- 源文件 SHA-256：`b683ef001754d27a346091a4c7e0618ddce96095ecd12327e5a247d24fc1d840`；4479 bytes。
- HTML SHA-256：`d42ba4c115de6451c8dd3bd108cffbb0ee17fe371b5108f863d9b319c22d6fac`；712354 bytes。
- `visual_review: skipped (受当前浏览器策略约束)`。
- `visual_correction_rounds: 0`。

当前浏览器策略拒绝本地文件预览，因此没有执行浏览器渲染、视口溢出检查、截图或交互视觉审阅，也没有调用 `visual-check`、HTTP 包装或其他浏览器绕过限制。上述静态校验不代表视觉验收已经通过。源码与 HTML 已交付，可在允许本地预览的环境中另行完成视觉验收。
