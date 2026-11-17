# G1 设计复核

日期：2026-11-16。结论：proposal、4 个 capability delta、design、acceptance 和 tasks 已具备可实施内容；G1 结构与 OpenSpec strict 校验通过。当前只完成设计与隔离技术验证，产品实现/G2/G3 均未完成。

## 语义核对

- 23 个唯一场景与验收表、实现任务逐项对应；新增 3 个 capability，修改 1 个现有 capability。现有 `临时正文编辑` 显式改名为 `可恢复正文编辑`，保留 WORKBENCH-EDIT-004 标识；未删减健康、Chat 占位和入口原有契约。
- SQLite 决策有文件方案的同契约对照，不把文件方案未实现的锁测试伪称失败。设计证据为 17 项存储检查、4 项 schema 检查，与正式产品验收分开。
- 去重检查先于基线比较；原结果不冒充最新 head；恢复生成新修订；候选版本引用为后续 C07 留出边界。
- UI 有 ack/inFlight/latest draft 三份状态；响应丢失、继续输入、两标签和离线恢复不采用最后写入覆盖。
- 自动保存周期与恢复点显示分开；版本容量有明确门槛，C02 不偷偷删除历史。
- 新增写入 API 同时引入本机访问控制；会话过期/服务重启有可执行的重新接入设计，不要求作者停止正在运行的服务。
- 工作空间锁、数据库版本、正文版本、逻辑 ID 与文件路径的职责明确；现有库损坏不自动重建，已验证旧稿仅可救援，不静默回退 head。
- 未将整个 V1 存储实体提前实现；没有产品代码、项目依赖、Living Spec 或已归档 change 的修改。已有 .idea 目录保持原状。

## 校验边界与下一步

这是执行者自检，没有独立 agent 或多人签署。官方原理依据与 POC 限制见 DEC-0004 和 docs/validation/article-storage-poc.md。设计选择已明确，不需要为了 G1 额外签字。

OpenSpec status 中 proposal/specs/design/acceptance/tasks 为 done；verification 仍是待实现后的产物。CLI 的 isPlanningComplete/isComplete 为 false 不表示缺少本轮设计内容，也不应通过虚构 verification 把它改成 true。

下一步按 tasks 第 1 个切片建立正式 SQLite/工作空间/访问控制的验收与实现，后续依次推进保存、冲突恢复和版本 UI。本轮不运行产品 verify/E2E 冒充新功能通过；所需手工 IME、Linux 驱动与完整恢复测试留在 G2 必需清单。
