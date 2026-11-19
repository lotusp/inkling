import rendererUrl from '@mermaid-js/tiny/dist/mermaid.tiny.js?url';
import { basicFlowchart } from './basic-flowchart';
import { createSourceBlock } from './source-block';

const rendererOptions = {
  startOnLoad: false,
  securityLevel: 'strict',
  htmlLabels: false,
  suppressErrorRendering: true,
  theme: 'base',
  look: 'classic',
  themeVariables: {
    primaryColor: '#eff3ed',
    primaryTextColor: '#29392f',
    primaryBorderColor: '#91a38e',
    lineColor: '#627765',
    edgeLabelBackground: '#fffefa',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
  },
  flowchart: {
    htmlLabels: false,
    useMaxWidth: false,
    minNodeWidth: 0,
    padding: 5,
    rankSpacing: 24,
    nodeSpacing: 22,
  },
} as const;

interface Mermaid {
  initialize(options: typeof rendererOptions): void;
  render(
    id: string,
    source: string,
    container: HTMLElement,
  ): Promise<{ svg: string }>;
}

// The tiny distribution is a classic browser script exposing window.mermaid.
let loading: Promise<Mermaid> | undefined;
function localRenderer(): Promise<Mermaid> {
  loading ??= new Promise<Mermaid>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = rendererUrl;
    script.onload = () => {
      script.remove();
      try {
        const renderer = (window as Window & { mermaid?: Mermaid }).mermaid;
        if (!renderer) throw new Error('Mermaid 未加载');
        renderer.initialize(rendererOptions);
        resolve(renderer);
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('预览未加载'));
    };
    document.head.append(script);
  }).catch(() => {
    loading = undefined;
    throw new Error('预览未加载，请在本机服务恢复后重新打开稿件。');
  });
  return loading;
}

export const MermaidBlock = createSourceBlock({
  name: 'mermaidBlock',
  label: '流程图',
  attribute: 'data-inkling-mermaid',
  example: '例如 flowchart TD; A[开始] --> B[结束]',
  async draw(source, output, isCurrent) {
    const diagram = basicFlowchart(source);
    // Coalesce typing before queueing an SVG layout with the renderer.
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!isCurrent()) return;
    const renderer = await localRenderer();
    if (!isCurrent()) return;
    const scratch = document.createElement('div');
    scratch.className = 'mermaid-measure';
    scratch.inert = true;
    document.body.append(scratch);
    try {
      const { svg } = await renderer.render(
        'inkling-' + crypto.randomUUID(),
        diagram,
        scratch,
      );
      const image = document.createElement('img');
      image.alt = '流程图预览';
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      output.append(image);
    } catch {
      throw new Error('流程图有误，请检查节点名称和连线。');
    } finally {
      scratch.remove();
    }
  },
});
