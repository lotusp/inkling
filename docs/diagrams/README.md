# Inkling 架构图

打开 [inkling-architecture.html](inkling-architecture.html) 可查看拟议架构，并使用主题切换、缩放、搜索、关系追踪与导出功能。源文件为 [inkling-architecture.json](inkling-architecture.json)。

图中箭头表示主要调用关系，省略响应回传；写作能力模块和发布授权关卡是逻辑模块，不要求部署为独立服务。文章项目保存来源、版本和作者确认过的风格偏好。只有绑定文章版本和目标平台的有效发布授权才能调用发布适配器，平台凭据不进入模型上下文。Git、WordPress、Ghost 是待选的发布适配器，不表示已全部实现。

## 验证记录

- 图类型：architecture。
- 自动校验：9/9 showcase，0 errors，0 warnings。
- 桌面检查：1440×900、1600×1000、1920×1080、2048×1320 全部无横向或纵向溢出。
- 视觉复核：已检查最小和最大视口的浅色、深色共四张截图；线条、标签、卡片无遮挡，整体高度布局通过。
- 几何修正次数：1；将一处竖向关系标签移至连接线中部。
- 源文件 SHA-256：`61d79c1f135a9152ba36597a4175294cb221c12b3bfcc8b6dccae13d6d91d86a`，4082 bytes。
- HTML SHA-256：`5da78c30c125fabd058971f34d0ac0a9994a5072d48e9a74a3432bd091ccb6dd`，711554 bytes。

[截图索引](inkling-architecture.visual-check.html) 与 [自动检查记录](inkling-architecture.visual-check.json) 保留在同目录。自动记录中的 `visualReview: pending` 是工具固定输出；上述视觉复核是生成截图后另行完成的人工式图像审阅。
