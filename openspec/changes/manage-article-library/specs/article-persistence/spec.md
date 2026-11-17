# article-persistence delta

## MODIFIED Requirements

### Requirement: 正文与保存契约

系统 SHALL 保存带 schema 版本的标题与结构化正文，采用稳定文章 ID、base revision 与 mutation ID；只在原子提交成功后确认保存，正文、head 与成功请求记录保持一致。

#### Scenario: ARTICLE-CREATE-001 首次创建与重开

- **GIVEN** 默认工作空间尚无活动文章，或已有多篇文章
- **WHEN** 作者在首次进入时选择开始写作，或重新打开已有工作空间
- **THEN** ensure-current 在没有活动稿件时创建一个初始文章和版本，并发初始化不重复；已有活动稿件时打开最近稿件；显式新建另用文章库接口，不能复用 ensure-current 冒充新建

#### Scenario: ARTICLE-SAVE-002 保存并重启

- **GIVEN** 文章已打开
- **WHEN** 作者编辑中文标题、正文及当前支持的格式，等待保存后重启页面和服务
- **THEN** 内容与格式一致，显示正确已保存版本，未收到提交确认前不显示已保存

#### Scenario: ARTICLE-RETRY-003 响应丢失后的重试

- **GIVEN** 请求已经提交但响应丢失
- **WHEN** 客户端以相同 mutation ID 和原始载荷重试或查询结果
- **THEN** 返回原结果，不重复创建版本；即使当前 head 已推进也能查到原提交

#### Scenario: ARTICLE-KEY-004 幂等键误用

- **GIVEN** mutation ID 已对应成功请求
- **WHEN** 以相同 ID 提交不同文章、基线、内容或操作
- **THEN** 返回明确冲突，不覆盖原记录或稿件
