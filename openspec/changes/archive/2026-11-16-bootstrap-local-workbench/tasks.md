# Bootstrap tasks

## 1. Toolchain and checks

- [x] 1.1 建立锁定 Node/pnpm/依赖的 workspace、类型/lint/格式/构建入口，验证安装与空工程构建。
- [x] 1.2 建立模块依赖检查与违规负例，验证 DEVELOPMENT-BOUNDARY-002。

## 2. Local service

- [x] 2.1 写真实 API 验收并记录健康路由缺失 Red，实现健康契约与 Host/API 边界，验证 WORKBENCH-START-001、WORKBENCH-HOST-007。
- [x] 2.2 实现单命令启动、端口校验与关闭，运行构建产物的进程验收，验证 WORKBENCH-PORT-002、WORKBENCH-STOP-003。

## 3. Writing shell

- [x] 3.1 先运行空白页面的 UI 验收记录有效 Red，再实现标题、正文、基本工具栏与临时保存提示，验证 WORKBENCH-EDIT-004。
- [x] 3.2 实现未接入 Chat、专注切换、健康探测与重试，验证 WORKBENCH-CHAT-005、WORKBENCH-HEALTH-006。

## 4. Delivery evidence

- [x] 4.1 配置真实 CI 与运行文档，执行 verify、浏览器测试及视觉检查，验证 DEVELOPMENT-CHECK-001。
- [x] 4.2 核对全部场景、差异与代码边界，保存日志和内容指纹，完成 G2 验证。

## Workflow follow-up

- 通过验证后按授权归档并核对 Living Spec。
- 代码、测试、规格与归档一起合入主分支后完成 G3。
