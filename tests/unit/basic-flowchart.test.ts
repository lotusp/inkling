import { expect, it } from 'vitest';
import { basicFlowchart } from '../../apps/web/src/basic-flowchart';

it('EDITOR-PREVIEW-004 accepts compact chains, text labels and comments', () => {
  const chain = 'a-1(["示例"])';
  const labels =
    'a-1["保存 (V2)"] -.->|检查| B((核对)) ==> C{通过} --- D(完成)';
  expect(basicFlowchart('%% 草图\n graph RL; ' + labels)).toBe(
    'graph RL\n' + labels,
  );
  expect(basicFlowchart('graph RL\n' + chain)).toContain(chain);
});

it('EDITOR-PREVIEW-004 rejects diagram settings and reports the original line after comments', () => {
  expect(() =>
    basicFlowchart('%% 草图\n\n%%{init: {}}%%\ngraph TD; A'),
  ).toThrow('第 3 行');
  expect(() =>
    basicFlowchart('flowchart LR\n%% 编辑中\nA --> B; B -->'),
  ).toThrow('第 3 行');
});

it('EDITOR-PREVIEW-004 bounds SVG layout size for disconnected nodes and repeated connections', () => {
  const nodes = Array.from({ length: 100 }, (_, index) => 'n' + index).join(
    ';',
  );
  expect(() => basicFlowchart('graph LR;' + nodes)).not.toThrow();
  expect(() => basicFlowchart('graph LR;' + nodes + ';next')).toThrow('100');
  expect(() => basicFlowchart('graph LR;' + 'a-->b;'.repeat(101))).toThrow(
    '100',
  );
});
