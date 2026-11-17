# Verification report

## Scope and baseline

日期：2026-11-17。Change：persist-article-revisions。结论：**G2 通过，具备归档与合入条件；G3 未执行。** 本报告为同一开发助手的代码/规格自检，无独立评审或多人签署。

产品代码基线为 `1442baef9abc1dbca80b5afc4feca8e8d6fe1e1a`。后续本轮提交只增加验收证据、知识说明及过程状态，未改变被测产品/测试/依赖/CI 配置。Mac 使用 git archive 导出的独立目录；Linux 使用相同 SHA 的真实 GitHub Actions。工作区另有未提交品牌修改，不包含在本报告的通过结论中。

[机器可读证据](evidence.json) 对全部相关产品源码、公开契约、存储驱动、测试/夹具、构建/测试/CI 配置、lockfile、Harness/Skills 和四份 delta 记录 SHA-256。覆盖清单按与主分支的差异再次核对，见 [覆盖检查](evidence/g2-subject-coverage.log)。没有 AI prompts 或模型运行时，故无模型效果评测。POC 证据仅为设计依据，不计入产品测试数。

## Acceptance evidence

23 个场景逐项核对 [验收映射](acceptance.md) 中的真实测试入口和断言，并在 evidence.json.scenarios 记录结果、测试路径、对应检查及 Red/baseline 来源。全部通过；未使用 skip、重试或扩大超时掩盖失败。

- 保存/重试/冲突：真实 SQLite 事务中的 revision/head/mutation 一致；原 mutation 回放优先于 CAS；浏览器查询原请求再核对 head；迟到结果不覆盖最新输入。
- 离线/浏览器副本：IndexedDB 事务完成后确认副本；Web Locks 隔离标签；恢复前校验原请求、查询结果、比较 head；保留/放弃副本有明确选择，未知格式与仍活动副本不删除。
- 版本：分页与命名幂等、纯格式差异、恢复产生新版本，输入或远端版本变化使旧确认失效；命名目标固定于 flush 的版本。
- 故障：只读为真实 readonly 连接，容量耗尽由 SQLite max_page_count 产生 SQLITE_FULL；临时 trigger 注入 I/O/事务检查点，SIGKILL 验证提交前后原子性。没有填满作者磁盘，未宣称真实断电验证。
- 损坏/容量：启动及读取校验正文/hash，隔离受损文章，旧版本逐个校验下载；64 MiB 预警、256 MiB 上限，超限保存/恢复回滚，命名/no-op/回放仍可用，不自动删除。
- 工作空间/访问：独占锁、格式与路径检查，Host/Origin/CSRF/会话和重新接入；UI 不接受任意文件路径。

有效 Red 与 baseline-pass 的具体演进保留在 [实施进度](progress.md) 和各步骤原始日志；不把缺环境、测试操作错误或格式问题当作行为 Red。真实输入法使用 [用户反馈记录](evidence/manual-ime.md)，自动 composition 测试只是补充。

## Required checks

| 检查 | 被测环境与结果 | 证据 |
| --- | --- | --- |
| frozen-lockfile 安装 | Mac Node 22.22.2 / pnpm 10.34.9，退出 0 | [安装日志](evidence/g2-mac-install.log) |
| verify | Mac；61 应用测试 + 10 Harness，格式/lint/类型/架构/构建/文档/规格全部通过 | [本机检查](evidence/g2-mac-verify.log) |
| 完整 E2E | Mac Chromium，59/59，退出 0 | [浏览器检查](evidence/g2-mac-e2e.log) |
| Linux CI | Ubuntu 26.04.1 x64；原生驱动安装、verify、59 E2E 全部通过 | [CI 日志](evidence/g2-linux-ci.log)、[运行元数据](evidence/g2-linux-run.json) |
| 性能 | 60 KiB / 2 MiB API p95 12.08 / 171.68 ms；普通稿事件循环 p95 10.82 ms，通过预设门槛 | [测量](evidence/storage-performance.log)、[方法与限制](../../../../docs/validation/article-storage-performance.md) |
| 中文 IME | 用户确认三项手工验收通过 | [手工记录](evidence/manual-ime.md) |
| UI 视觉 | 桌面工作台、窄屏冲突/恢复、损坏救援、容量提示均已查看；其余状态沿用各切片复核 | [平台与视觉记录](evidence/g2-platform-validation.md) |
| 23 场景/文件覆盖/自检 | 全部映射，代码边界与数据保护检查无阻断项 | [覆盖日志](evidence/g2-subject-coverage.log)、下文 |
| G2 结构与 OpenSpec strict | 在独立验收目录执行；文档路径与规格检查通过 | [最终门禁日志](evidence/g2-gates.log) |

[真实 Linux CI 运行](https://github.com/lotusp/inkling/actions/runs/44028413229) 对应产品代码基线。后续仅文档/证据修改使用该功能验证结果，并单独重跑文档、strict 规格和指纹检查。

## Review and limitations

自检涉及 core/application/domain、contracts、adapters 的迁移/事务/校验、server 的启动/关闭/认证/API，以及前端 useArticle、草稿存储、冲突与版本面板、差异预览和救援下载。对照 change 的 4 份 delta、23 场景及主分支差异核对，没有发现待处理的阻断项。

核对的约束：事务错误不能推进 head 或保留半条 mutation；恢复复用保存协议；副本清理不能先于可恢复内容持久化；未知保存结果不得盲目建立新请求；预览不执行正文链接；架构依赖仍由自动检查与负例守护；测试故障控制只存在于独立夹具，生产没有故障/性能管理接口。原依赖/工作流已足够，无新增框架。

过程发现与处理：默认 SSH 身份没有仓库写权限，使用本机已经配置的仓库所有者密钥触发 CI，未改全局 Git 身份；CI 与功能检查未失败。首份 CI 精简日志存在行尾空格，已在独立修正提交中清理，不改变任何原始结果。主工作区存在用户品牌改动，因此用独立目录验证已提交内容，避免错误地为未提交版本出具证明。

已知限制与后续事项：

- 服务停止时刷新无法重新加载工作台；重开服务后恢复已有浏览器副本。救援 JSON 无导入界面，不等于整空间备份。
- 真实 IME 结论来自用户反馈，未提供浏览器/输入法版本；本轮浏览器自动化仅覆盖 Chromium。
- SQLite 使用同步执行。最大稿事件循环 p95 94.18 ms，普通稿门槛不适用于最大稿；约 69 MB 历史启动校验 883.54 ms，未测满 256 MiB，不做跨设备或并发性能承诺。
- 不保证物理断电/介质损坏救援；发现损坏不会自动回退或替换权威数据。
- 构建有约 764 kB 的前端 bundle 提示，无构建失败；代码拆包留在后续编辑器/功能扩展工作，不作为本 change 的额外范围。
- 未归档 delta、未合并主分支；这两步属于 G3。待合入分支若新增代码或合并冲突修正，需重跑受影响检查并更新指纹。

## Progress and recovery

实现与 G2 任务均完成。最后检查为 `node scripts/harness/check.mjs persist-article-revisions --stage verify --root <verification-root>`，配合 OpenSpec strict、文档路径和差异检查。`verification-root` 是已提交产品代码加本轮验收文档的独立目录。

主工作区的 App.tsx、styles.css、品牌 SVG 等用户改动与被测指纹不同，直接在该脏工作区执行 G2 指纹检查会正确报 stale；不得删除指纹以绕过，也不要覆盖用户改动。复核本次提交时可在干净 checkout 或 git archive 导出的临时目录运行同一检查。

## Closure

G2：通过。2026-11-17 已通过正式 OpenSpec archive 合并 delta，8 条新增需求、1 条改名/修改和原有 6 个未变场景已核对；归档记录见 evidence/g3-archive.log、g3-living-spec.log、g3-archive-checks.log。知识索引、架构、ADR 与运行说明已同步；Git merge 和 G3 最终验证尚待执行。
