// Validate the supported Mermaid subset before the renderer sees any source.
// Only plain node and edge labels reach SVG layout.
const characters = String.raw`\p{L}\p{M}\p{N}\p{Zs}.,:!?，。；：！？（）、/+_…`;
const label = `[${characters}-]+`;
const nodeLabel = `(?:"[${characters}(){}\\[\\]-]+"|${label})`;
const node = new RegExp(
  String.raw`([\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*)(?:\[${nodeLabel}\]|\(\[${nodeLabel}\]\)|\(\(${nodeLabel}\)\)|\(${nodeLabel}\)|\{${nodeLabel}\})?\s*`,
  'uy',
);
const edge = new RegExp(
  String.raw`(?:-->|---|-\.->|==>)\s*(?:\|${label}\|\s*)?`,
  'uy',
);

export function basicFlowchart(source: string): string {
  const statements: string[] = [];
  const nodes = new Set<string>();
  let edges = 0;
  for (const [index, line] of source.split(/\r\n?|\n/).entries()) {
    if (
      line.trimStart().startsWith('%%') &&
      !line.trimStart().startsWith('%%{')
    )
      continue;
    const location = `第 ${index + 1} 行`;
    for (const part of line.split(';')) {
      const statement = part.trim();
      if (!statement) continue;
      if (!statements.length) {
        if (!/^(?:graph|flowchart)\s+(?:TD|TB|BT|LR|RL)$/.test(statement))
          throw new Error(
            `${location}，请以 flowchart TD 或其他流程方向开头。`,
          );
      } else {
        let cursor = 0;
        while (true) {
          node.lastIndex = cursor;
          const match = node.exec(statement);
          if (!match) throw new Error(`${location}，请补全节点，如 A[开始]。`);
          nodes.add(match[1]!);
          cursor = node.lastIndex;
          if (cursor === statement.length) break;
          edge.lastIndex = cursor;
          if (!edge.test(statement))
            throw new Error(`${location}，请使用基础节点和连线，如 A --> B。`);
          cursor = edge.lastIndex;
          edges++;
        }
        if (nodes.size > 100 || edges > 100)
          throw new Error(
            '流程图最多预览 100 个节点和 100 条连线，请拆分后预览。',
          );
      }
      statements.push(statement);
    }
  }
  if (!nodes.size) throw new Error('请添加流程节点，如 A[开始] --> B[结束]。');
  return statements.join('\n');
}
