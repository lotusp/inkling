# 6.1 平台验证

日期：2026-11-17。被测代码：`1442baef9abc1dbca80b5afc4feca8e8d6fe1e1a`。

- macOS arm64 / Node 22.22.2 / pnpm 10.34.9：在 git archive 导出的独立临时目录进行 frozen-lockfile 安装、verify 和完整 E2E，退出码均为 0。61 项应用测试（15 文件）、10 项 Harness、59 项 Chromium E2E 通过；没有 retries 或 skip。
- [GitHub Actions](https://github.com/lotusp/inkling/actions/runs/44028413229)：Ubuntu 26.04.1 x64、Node 22.22.2、pnpm 10.34.9；better-sqlite3 13.2.0 安装执行 node-gyp rebuild 成功；真实存储/进程检查通过，未用替身代替驱动。verify 与 E2E 同样为 61 + 10 + 59 项通过。精简日志 g2-linux-ci.log，原始运行元数据 g2-linux-run.json。
- Vitest include 明确发现 api/process/architecture/unit/integration；pnpm onlyBuiltDependencies 包含 better-sqlite3；现有 CI 已覆盖本轮全部功能测试，无需更改工作流。没有为通过 CI 放宽断言、超时、重试或存储 durability。
- 性能沿用本轮 5.3 的 storage-performance.log：相关后端/契约/性能夹具未变化；60 KiB / 2 MiB 保存 p95 为 12.08 / 171.68 ms，普通稿事件循环 p95 10.82 ms。目标 Mac 门槛不在 Linux 上运行。
- 真实 IME：用户反馈见 manual-ime.md，非自动化替代；不补写未提供的浏览器/输入法版本。
- 已查看本次独立目录生成的桌面工作台、375px 冲突比较与恢复确认、损坏稿件救援、容量提示截图，文字和操作正常可见。截图保留在 g2-visual/；容量图使用测试注入的 1000 B 上限，生产仍为 256 MiB。此前各步骤的加载/离线/历史视觉检查见 progress.md。

当前工作区中的未提交品牌与 README 修改，以及 .idea，不属于本次被测对象；没有暂存、覆盖或删除这些内容。G2 最终指纹和结构检查应以已提交版本的独立目录为根，而非把未提交改动混入结论。

仅完成 6.1；6.2 的场景/指纹自检和 G2 结构校验尚待完成。未 archive 或 merge。
