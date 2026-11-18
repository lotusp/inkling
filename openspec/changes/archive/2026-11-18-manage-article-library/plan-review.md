# G1 自检

2026-11-17，执行者自检，无独立评审。G1 通过。

- 13 个文章库新场景 + 4 个被完整保留/更新的持久化场景，共 17 个唯一 ID，映射至 design、acceptance 与 tasks。
- 标题只有正文权威；元数据 CAS 与正文 CAS 分开，生命周期阻止新写入但允许原提交回放，不绕过保留输入。
- 新建、最近指针、初始修订与 mutation 同事务；分页按创建时间+ID 稳定排序，不受自动保存移动影响。
- schema 3 为增量表/索引与回填，失败回滚；没有破坏性改写，不假称已提供完整备份或可降级。
- 导航先有会话隔离与输入保护，再接 UI；position 只是浏览器便利，不冒充正文保存。
- 计划保留 C02 完整回归、真实 Linux CI、性能与新增导航 IME 检查；新功能未实现，G2 未通过。
- Harness plan、OpenSpec strict 与文档链接检查实际通过，日志 evidence/plan-checks.log。

下一步执行 1.1 旧 schema 夹具与迁移 Red/Green，不新增其他 active change。
