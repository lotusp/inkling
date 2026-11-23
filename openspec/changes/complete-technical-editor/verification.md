# C04 技术编辑器验收

2026-11-22 至 23 日。正式稿纸和系统输入在 5.1 提交 `761ab2e` 上验证。最终复验提交为 `e5175e7`，包含试写页选图修复及正式稿纸的 Muya 撤销修复。验收使用独立的 SQLite 工作空间与合成稿件。11 个场景的检查映射和被测文件 SHA-256 列在[证据索引](evidence.json)。

## 场景与审阅

| 作者操作 | 核验内容与切片记录 |
| --- | --- |
| 格式化已有段落、查看大纲 | 引用开关和撤销、链接编辑、代码缩进，以及同名章节跳转后的选区与修订号。[引用](evidence/quote.log) · [链接与代码](evidence/link-code.log) · [大纲](evidence/outline.log) |
| 编辑与重开技术块 | 表头与列对齐、整表变更、多行公式和 Mermaid 源码、离线预览与源码修正。[表格](evidence/table.log) · [公式](evidence/formula.log) · [流程图](evidence/mermaid.log) |
| 插图、调整尺寸与使用旧稿 | 正式工作台中的选图、剪贴板文件、拖入和历史恢复，上传中切稿、只读、撤销及故障后的行为。试写页单独验证色板与图片工具。[稿纸](evidence/muya-workbench.log) · [色板与工具](evidence/muya-surface.log) |
| 导入 .txt / .md | 取消、预览后创建、回包丢失重试、行号提示、保留原稿及外部媒体处理。[文本](evidence/text-import.log) · [Markdown](evidence/markdown-import.log) |
| 比较、恢复、救援与归档 | 同篇稿件在两页分别修改公式与流程图，确认前核对服务器修订，确认后比对两边内容。恢复前后重算 SQLite 三份修订的指纹，并复验归档只读和图片字节。[混排稿](evidence/technical-roundtrip.log) |

本轮由实现者自检。对照 C03 基线与当前 delta，审阅了 Muya 正文转换、格式与章节表单的组合输入处理、图片上传后的选区与会话校验、附件确认、公式和流程图的本地渲染，以及文件导入与恢复写入。5.1 已修复冲突预览的表头与图片尺寸，以及未知浏览器副本的救援入口。5.2 复跑还发现了同一动画帧内撤销引用会连带撤掉已输入的文字。补丁沿用 Muya 的撤销栈，三个引用场景各跑三次通过。[撤销复验](evidence/quote.log)构建仍提示部分 JavaScript 分块较大。

## Mac 实测

在 macOS 26.6.1 的原生 Chrome 中用搜狗拼音测试。章节名和链接地址均在候选回车后保持编辑，明确确认后只插入一个二级标题，链接只作用于原选区。将测试窗口截图作为 PNG 写入系统剪贴板，在正文按 ⌘V。工作台保存后刷新，同一段的左右文字与唯一一张图片都在原位。系统框选快捷键本身未验证。[实测记录](evidence/mac-input-clipboard.log)

## 工程与 G2

本地使用 Node 22.22.2、pnpm 10.34.9、Playwright 1.65.1 和 OpenSpec 1.16.1。存储性能沿用真实回环 HTTP 与临时 SQLite，分别测量常规保存、2 MiB 保存和千篇库查询。快速选图回归曾将图片放入标题；修复后，同一试写页用例在 Mac 上连续通过 12 次。Linux 工作流已纳入该项回归。[工程记录](evidence/final-checks.log) · [试写页复验](evidence/muya-surface.log)

最终实现的工程检查、172 项浏览器回归、存储性能、Linux CI 均通过；验收索引覆盖 11 个场景。[Linux 检查](https://github.com/lotusp/inkling/actions/runs/45086037247)

G2 通过。Harness verify 已复算 198 个文件指纹，并核对任务、场景和证据路径；OpenSpec strict 已通过。C04 保持活动变更，下一步为归档并核对正式规格。

2026-11-23 将最近十条 C04 提交说明改为英文，逐条核对了新旧提交的 Git 文件树。Mac 实测提交 `761ab2e` 对应 `f71ca31`，试写页修复 `aee00d2` 对应 `3b8ac22`，最终被测实现 `e5175e7` 对应 `2da2542`。前文及 CI 链接沿用实测时的 SHA。随后更新了提交语言约定，并重新校验了开发规范的指纹。
