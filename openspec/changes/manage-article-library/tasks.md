# Implementation tasks

每个编号切片先验收再实现，必要检查通过、记录进度后立即单独提交。计划不是已实现承诺。

## 1. 可兼容旧稿的文章库基础

- [x] 1.1 LIBRARY-MIGRATE-001：真实 schema 2 夹具、迁移回滚与重开验收；实现增量 schema 3，保留 C02 全部正文/历史/去重，验证并记录兼容边界。
- [ ] 1.2 LIBRARY-CREATE-002/LIST-003/FAILURE-013、ARTICLE-CREATE-001/KEY-004：真实认证 API Red → Green；实现显式新建、稳定分页、同事务标题投影与重放，检查故障/权限/参数边界及已有保存回归。

## 2. 可安全切换的多文章界面

- [ ] 2.1 LIBRARY-OPEN-004/SWITCH-005：先建立 API 与浏览器验收，实现按文章隔离的编辑会话、打开/最近指针与安全导航协调器；覆盖未保存、未决/迟到响应、恢复副本/冲突和离线失败。
- [ ] 2.2 LIBRARY-LIST-003/CREATE-002/FAILURE-013：接通列表/新建/打开 UI、加载/空态/错误/重试、桌面与窄屏布局，验证导航全闭环与 C02 回归。

## 3. 整理与查找

- [ ] 3.1 LIBRARY-RENAME-006/TAGS-007：标题 CAS、标签/metadata_version 与去重，真实接口及 UI 验收，列表投影与正文唯一权威一致。
- [ ] 3.2 LIBRARY-FIND-008：标题字面查找和精确标签筛选、查询变更重置游标及迟到响应失效，分页/API/UI 验证。

## 4. 可逆生命周期与位置

- [ ] 4.1 LIBRARY-ARCHIVE-009/TRASH-010/RESTORE-011：生命周期事务和状态 CAS、非 active 新写入阻断、最近指针回退，验证历史/副本不丢失与错误回滚。
- [ ] 4.2 上述生命周期 UI：归档只读、删除确认、回收站恢复与取消；覆盖另一标签继续输入、确认前状态变化、桌面与窄屏。
- [ ] 4.3 LIBRARY-POSITION-012：按文章与修订恢复选择/滚动位置、非法/旧位置安全降级；验证不制造正文版本。

## 5. G2 证据

- [ ] 5.1 完整 verify、E2E、目标 Mac 存储性能、真实 Linux CI 与新增导航真实 IME 手工检查；未执行不记通过。
- [ ] 5.2 自检 17 个场景、状态/请求隔离和依赖边界，更新运行与知识文档，生成 verification/evidence.json，执行 G2。

## Workflow follow-up

- G2 通过后按授权 archive 并核对 Living Spec，再 Git merge 与 G3；本条完成前不创建 C04。
- commit 不等于 push 或发布；后续远端操作按用户届时授权执行。
