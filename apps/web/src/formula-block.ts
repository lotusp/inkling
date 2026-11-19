import { createSourceBlock } from './source-block';

export const FormulaBlock = createSourceBlock({
  name: 'formulaBlock',
  label: '公式',
  attribute: 'data-inkling-formula',
  async draw(source, output, isCurrent) {
    let katex: typeof import('katex');
    try {
      katex = await import('katex');
    } catch {
      throw new Error('预览未加载，请在本机服务恢复后重新打开稿件。');
    }
    if (!isCurrent()) return;
    try {
      katex.render(source, output, {
        displayMode: true,
        output: 'mathml',
        maxExpand: 500,
        maxSize: 20,
        trust: () => {
          throw new Error('公式预览不支持外部资源或 HTML 命令。');
        },
      });
    } catch (error) {
      if (error instanceof katex.ParseError) {
        const location = Number.isInteger(error.position)
          ? `（第 ${[...source.slice(0, error.position)].length + 1} 个字符）`
          : '';
        throw new Error(`公式有误${location}，请检查 LaTeX 源码。`, {
          cause: error,
        });
      }
      throw error;
    }
  },
});
