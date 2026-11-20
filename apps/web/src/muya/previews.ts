import type { Muya, TState } from '@muyajs/core';
import { drawDiagram } from './drawDiagram';
import { drawFormula } from './drawFormula';

interface Preview {
  domNode: HTMLElement;
  code?: string;
  math?: string;
  type?: string;
}
type PreviewClass = new (muya: Muya, state: TState) => Preview;
type Registry = {
  loadBlock: (kind: string) => PreviewClass;
  register: (block: PreviewClass) => void;
};
export function installPreviews(muya: Muya) {
  const scroll = muya.editor.scrollPage;
  if (!scroll) return;
  const registry = scroll.constructor as unknown as Registry;
  for (const [kind, label, draw] of [
    ['diagram-preview', '流程图', drawDiagram],
    ['math-preview', '公式', drawFormula],
  ] as const) {
    const Parent = registry.loadBlock(kind);
    class LocalPreview extends Parent {
      static blockName = kind;
      static create(muya: Muya, state: TState) {
        return new LocalPreview(muya, state);
      }
      async update(value?: string) {
        const source = value ?? this.code ?? this.math ?? '';
        if (kind === 'diagram-preview') this.code = source;
        else this.math = source;
        const output = document.createElement('div');
        output.setAttribute('role', 'status');
        this.domNode.replaceChildren(output);
        const current = () => output.parentNode === this.domNode;
        try {
          if (!source.trim()) {
            output.textContent = '点击输入' + label + '源码';
            return;
          }
          if (source.length > 8192)
            throw new Error('源码超过 8192 个字符，已保留源码。');
          if (kind === 'diagram-preview' && this.type !== 'mermaid')
            throw new Error('当前支持基础 Mermaid 流程图，源码已保留。');
          await draw(source, output, current);
        } catch (e) {
          if (current()) {
            output.setAttribute('role', 'status');
            output.textContent =
              e instanceof Error ? e.message : '预览失败，请检查源码。';
          }
        }
      }
    }
    registry.register(LocalPreview);
  }
}
