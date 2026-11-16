# Development checks delta

## Purpose

为单人维护和编码助手提供同一套可重复执行的工程质量入口，使类型错误、无效依赖边界与回归失败能在本地或持续集成中被发现，避免只有文档约定而缺少实际可执行检查的开发状态。

## ADDED Requirements

### Requirement: 可重复工程检查

工程 SHALL 锁定依赖与包管理器版本，提供类型、代码风格、架构、自动化测试及构建命令；任一必需检查失败时综合检查以非零退出。CI SHALL 使用锁定依赖执行相同检查和浏览器验收。

#### Scenario: DEVELOPMENT-CHECK-001 完整本地检查

- **WHEN** 安装锁定依赖并执行文档中的综合检查与浏览器验收
- **THEN** 实际运行检查、发现测试并构建工作台，不以空测试或固定成功代替验证

### Requirement: 模块依赖边界

工程 SHALL 拒绝前端导入后端或基础设施、跨包内部导入、contracts 反向依赖和循环依赖；只允许各包使用声明的公开入口。

#### Scenario: DEVELOPMENT-BOUNDARY-002 拒绝违规依赖

- **WHEN** 验证包含前端到服务端、跨包内部、contracts 反向或循环导入的独立负例
- **THEN** 架构检查失败，合法工作台依赖通过
