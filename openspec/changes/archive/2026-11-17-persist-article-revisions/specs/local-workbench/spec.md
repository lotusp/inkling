# Local workbench delta

## RENAMED Requirements

- FROM: `### Requirement: 临时正文编辑`
- TO: `### Requirement: 可恢复正文编辑`

## MODIFIED Requirements

### Requirement: 可恢复正文编辑

工作台 SHALL 允许编辑标题和中文正文，保留基本标题、加粗、列表与代码块操作；显示真实保存状态，刷新后恢复已提交内容，未提交输入按恢复副本规则处理。Chat 尚未接入等其他现有行为保持有效。

#### Scenario: WORKBENCH-EDIT-004 中文写作与刷新

- **GIVEN** 作者已经打开一篇持久稿件
- **WHEN** 输入标题和中文段落、使用基本格式操作，等待保存后刷新
- **THEN** 输入和格式均保留，显示已确认版本；保存未确认时不显示已保存，离线或失败时可看到恢复与救援入口
