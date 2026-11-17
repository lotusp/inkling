# 实施进度

更新：2026-11-17。当前 change：persist-article-revisions。G1 已通过，G2 尚未完成。

## 已完成步骤

- 规范：每个可验证步骤通过后立即 commit；提交 abce09d。
- 设计：存储 POC、ADR、详细设计、23 个验收场景；提交 a34fc8c。
- 1.1：正式 SQLite 驱动和工作空间初始化/身份、格式检查、独占连接、关闭与崩溃释放；拒绝已有非数据库、新版数据库和符号链接。4 个有效 Red 后实现，新增边界加基线回归共 11 项进程检查通过，日志 evidence/workspace-red.log、workspace-green.log。类型、lint、架构和构建通过。

- 1.2：一次性启动链接、会话/CSRF、Origin 和受保护工作空间读取、本机重新获取链接、前端凭证交换/清除。4 个 API Red 和 1 个 UI Red 后，20 项 API/进程回归与 1 项浏览器验收通过；类型、lint、架构检查通过。持久草稿尚未实现，重启后副本联验留在 3.1。

- 1.3：运行/数据目录/重新接入说明已更新；verify 全部通过（25 项 API/进程/架构 + 10 项 Harness），9 项浏览器回归通过。回归发现重连按钮名称相近，已区分“重新连接”与“连接工作空间”，未放宽旧测试断言。

- 2.1：正文契约、core 用例、SQLite 修订/head/请求原子写入、受保护文章 API、首次创建与自动保存/重开 UI 已接通。有效 UI Red 后，3 项存储集成和 3 项 HTTP 验收通过；verify 31 项应用/架构测试及 10 项 Harness 通过，完整 E2E 10 项通过。修正初次加载的多余 dirty 状态后，重跑受影响的 9 项 E2E 通过。浏览器验收改为每个测试使用独立服务和目录。

- 2.2：重试前查询原 mutation 并核对当前 head，查询失败不视为未提交；保留保存期间的新输入，冲突后阻止普通保存覆盖。2 个有效 UI Red 后修复；10 项 API/存储检查、5 项保存 E2E 通过（reconcile-*.log），类型和 lint 通过。后端既有事务去重记录为 baseline-pass。

- 2.3a：补齐当前节点/marks、Unicode 标题、结构/字节/节点数/深度校验及组合输入自动检查。有效 Red 暴露行内 code 不兼容组合和标题组合输入仍提交，均修复。verify 通过（38 项应用/架构、10 项 Harness），17 项完整 E2E 通过；保存提示视觉调整后重跑 8 项工作台回归并查看桌面/窄屏截图，通过。日志 format-*.log；真实 IME 单列 2.3b，未勾选。

- 3.1.1：IndexedDB strict 事务完成后确认浏览器副本；保存前持久化不可变请求，编辑只更新最新 draft；Web Locks 隔离复制标签的 client。刷新后显式选择并核对恢复，副本复制成功后才清理非活动来源。有效 UI Red 后，恢复/双标签及保存竞态/格式的 10 项浏览器验收通过，类型、lint、架构通过。日志 recovery-red.log、recovery-first-green.log。

- 3.1.2：实际服务停机后继续输入，重启同端口并重新接入；补原页面 hash 链接认证及保留未选择副本继续编辑服务器稿件。响应丢失后的最新输入恢复、查询失败、旧基线冲突及复制标签均有真实浏览器验收。核对路径 baseline-pass；新链接处理与保留副本分支有效 Red 后实现，12 项浏览器验收通过，类型/lint 通过。日志 recovery-auth-red.log、recovery-choice-red.log、recovery-reconcile-baseline.log、recovery-reconcile-green.log。

- 3.1.3：副本不可用/配额异常/事务 abort 均明确降级，在线保存仍可用；救援 JSON 包含最新内存输入（含非法长标题）与基线/未决请求，无凭证。未知副本元数据禁止覆盖；未保存离开提示已验收。4 个救援入口 Red 后实现，新增未知格式保留 baseline-pass；verify 通过（38 项应用/架构 + 10 项 Harness），完整 E2E 29 项通过。日志 recovery-rescue-red.log、recovery-rescue-green.log、recovery-checks.log、recovery-all-green.log。配额/访问拒绝是浏览器原生 API 边界注入，不声称填满真实磁盘。桌面/窄屏恢复与失败状态已看图；窄屏 resize 后曾出现截图重复绘制，DOM 单实例检查及滚动重绘后的上下视口正常，单场景复核通过（recovery-visual.log）。

- 3.2.1：真实双标签冲突比较已实现，独立只读渲染两份结构化正文，标明文字/纯格式差异；主编辑器保持输入，核对原 mutation 失败时不给出可合并基线。有效入口 Red 后，3 项比较验收与保存/恢复回归共 14 项 E2E 通过，类型/lint/架构通过；日志 conflict-compare-red.log、conflict-compare-green.log。

- 3.2.2：合并固定已查看版本、本地序号与内容，准备后继续输入/组合输入会使确认失效；确认进入原保存协议。有效入口 Red 后，合并成功、再次服务端冲突、确认失效、响应丢失继续输入和保存回归共 11 项 E2E 通过，类型/lint 通过；日志 conflict-merge-red.log、conflict-merge-green.log。

- 3.2.3：放弃指定副本需二次确认；确认后记录变化或来源标签重新活动时拒绝删除。冲突中切换服务器稿前必须成功保留本页副本，失败则保留编辑器内容。有效放弃入口 Red 后，12 项针对性 E2E 通过；完整 verify 通过（38 项应用/架构 + 10 项 Harness），完整 E2E 41 项通过。日志 conflict-discard-red.log、conflict-discard-green.log、conflict-checks.log、conflict-all-green.log。已查看桌面/375px 窄屏冲突比较及桌面放弃确认截图，布局正常，窄屏无横向溢出。自检确认删除在同一 IDB 事务比较完整快照，并在持有来源锁时执行；取消不删除，服务器历史不受影响。

- 3.3：标题/正文组合输入期间到达旧保存响应，保持焦点和新输入，候选期间不提交也不显示 clean，结束后保存并刷新保留；实际停机提示及重启后恢复已联验。已有行为 baseline-pass，7 项 E2E 通过，类型/lint 通过。桌面/375px 离线提示已看图，保存/冲突视觉沿用 3.2 全回归结果。日志 ime-races-baseline.log。测试曾误把 hash 重新接入当成刷新、并在窄屏查找被布局隐藏的连接提示，修正测试操作后通过，未记作产品 Red。真实候选窗由用户稍后检查，2.3b 保留未完成。

- 4.1a：分页/筛选历史、指定版本读取及命名/重命名 API 已接通；读取历史校验正文 hash，命名与 mutation 同事务。两个真实 HTTP 404 Red 后，12 项 API/存储验收及回归通过，类型/lint/依赖边界通过。覆盖分页边界、未授权、跨文章/不存在版本、名称 Unicode 上限、旧命名重试不撤销后续重命名。日志 revisions-api-red.log、revisions-api-green.log。

- 4.1b：历史/命名 UI、只读两版本比较已接通。有效缺失入口 Red 后，版本、冲突和 IME 共 14 项 E2E 通过；3 项差异单元检查通过，类型/lint 通过，请求清理整理后 2 项版本验收再次通过。桌面/375px 截图已查看，无横向溢出。名称固定 flush 结果，丢失响应重试不换目标/id；大稿差异使用有界算法。日志 revisions-ui-red.log、revisions-ui-green.log、revisions-ui-final.log、revisions-diff-green.log。

## 当前边界

3.1 与 3.2 已完成：在线自动保存、浏览器草稿恢复/重连核对、救援下载、冲突比较/显式合并及确认放弃副本已实现；版本 UI 尚未实现。服务停止期间刷新不能打开页面，重启后可恢复；救援 JSON 当前无导入界面。Linux 原生驱动安装和手工 IME 未验证。本机依赖安装成功；pnpm 原生驱动需要允许构建且可能使用 Xcode Command Line Tools。

## 下一步

进入 4.1a/4.1b 版本列表、命名和比较，再完成 4.2 恢复与 4.3 恢复点策略检查。2.3b 真实中文输入法候选窗检查仍待执行，自动组合事件测试不能替代。当前自动检查通过不表示完整 change 的 G2 完成；未 archive、merge 或 push。
