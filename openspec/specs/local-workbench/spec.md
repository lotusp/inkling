# local-workbench Specification

## Purpose
为个人中文技术作者提供可在单台电脑运行的写作起点，通过真实本地服务呈现编辑工作台与服务状态，并明确当前输入的保存边界和尚未接入的协作能力，作为后续持久化与 Agent 功能的可验证基础。

## Requirements

### Requirement: 本机启动与停止

系统 SHALL 提供一个启动命令，在仅绑定回环地址的服务上提供工作台与健康接口；端口被占用时明确失败，不自动改用其他端口；终止后释放监听。

#### Scenario: WORKBENCH-START-001 启动同源工作台

- **GIVEN** 开发者已安装锁定依赖
- **WHEN** 执行 `pnpm start`
- **THEN** 输出本机地址，根路径返回工作台，`GET /api/health` 返回状态、应用名称与 API 版本

#### Scenario: WORKBENCH-PORT-002 占用端口

- **GIVEN** 所选端口已被占用
- **WHEN** 启动工作台
- **THEN** 以非零状态退出并提示端口占用，不更换端口

#### Scenario: WORKBENCH-STOP-003 停止服务

- **GIVEN** 工作台服务正在运行
- **WHEN** 接收到 SIGTERM 或 SIGINT
- **THEN** 正常退出并释放监听端口

### Requirement: 可恢复正文编辑

工作台 SHALL 允许编辑标题和中文正文，保留基本标题、加粗、列表与代码块操作；显示真实保存状态，刷新后恢复已提交内容，未提交输入按恢复副本规则处理。Chat 尚未接入等其他现有行为保持有效。

#### Scenario: WORKBENCH-EDIT-004 中文写作与刷新

- **GIVEN** 作者已经打开一篇持久稿件
- **WHEN** 输入标题和中文段落、使用基本格式操作，等待保存后刷新
- **THEN** 输入和格式均保留，显示已确认版本；保存未确认时不显示已保存，离线或失败时可看到恢复与救援入口

### Requirement: 明确未接入的协作能力

工作台 SHALL 显示可收起的 Chat 区域并说明 AI 尚未接入，不提供可发送的聊天入口或虚构回复。

#### Scenario: WORKBENCH-CHAT-005 协作占位与专注模式

- **WHEN** 作者查看 Chat 或切换专注模式
- **THEN** 可以隐藏和恢复 Chat，发送入口不可用，正文保持不变

### Requirement: 真实服务连接状态

工作台 SHALL 按真实健康响应显示连接状态，无法连接或响应不符合契约时显示失败，并允许重试；连接状态变化不得清空当前输入。

#### Scenario: WORKBENCH-HEALTH-006 失败与恢复

- **GIVEN** 健康接口失败或返回不合法响应
- **WHEN** 工作台检查连接，随后服务恢复且作者重试
- **THEN** 先显示未连接，重试后显示已连接，正文输入不变

### Requirement: 限定本地服务入口

服务 SHALL 拒绝非本地 Host，不将未知 API 路径当作工作台页面返回。

#### Scenario: WORKBENCH-HOST-007 非法入口

- **WHEN** 请求使用非本地 Host 或访问未知 API
- **THEN** 分别返回 403 或 JSON 404，不返回成功健康状态或 HTML 工作台
