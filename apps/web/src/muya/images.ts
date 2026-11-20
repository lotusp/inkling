import { imageByteLimit, imageNamePattern } from '@inkling/contracts';
import { connectWorkspace, currentCsrf } from '../access';
import type { WritingContext } from './context';
import type { ContentBlock, NativeSelection as Selection } from './context';
export interface ImageTarget {
  block: ContentBlock;
  start: number;
  end: number;
  raw: string;
  attrs: Record<string, string>;
  generation: number;
}
const editable =
  '.mu-paragraph-content,.mu-atxheading-content,.mu-setextheading-content,.mu-table-cell-content';
export async function upload(file: File): Promise<string> {
  if (!file.size || file.size > imageByteLimit)
    throw new Error('图片须小于等于 10 MiB。');
  const csrf = currentCsrf() ?? (await connectWorkspace());
  const response = await fetch('/api/images', {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-csrf-token': csrf,
    },
    body: file,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 415
        ? '请选择有效的 PNG、JPEG、GIF 或 WebP 图片。'
        : '图片保存失败，请重试。',
    );
  const { name } = await response.json();
  if (typeof name !== 'string' || !imageNamePattern.test(name))
    throw new Error('图片保存结果无效。');
  return new URL('/api/images/' + name, location.origin).href;
}
export function imageMarkup(
  src: string,
  alt: string,
  title: string,
  attrs: Record<string, string> = {},
) {
  const img = document.createElement('img');
  img.setAttribute('src', src);
  img.setAttribute('alt', alt);
  if (title) img.setAttribute('title', title);
  for (const attr of ['width', 'height', 'data-align'])
    if (attrs[attr]) img.setAttribute(attr, attrs[attr]);
  return img.outerHTML;
}
export function installWorkspaceImages(
  surface: WritingContext,
  picker: HTMLInputElement,
  notice: (message: string) => void,
  edit: (t: ImageTarget) => void,
) {
  const { muya, dom } = surface;
  const listen = new AbortController();
  const capture = { signal: listen.signal, capture: true };
  let previous: Selection | null = null;
  let uploading = false;
  function mark() {
    if (dom.contains(window.getSelection()?.focusNode ?? null))
      previous = muya.editor.selection.getSelection();
  }
  document.addEventListener('selectionchange', mark, { signal: listen.signal });
  function visiblePosition(selection: Selection) {
    const native = window.getSelection();
    const block = selection.focusBlock;
    const element = block.domNode;
    if (native?.rangeCount && element?.querySelector('.mu-inline-image')) {
      const range = native.getRangeAt(0);
      if (
        element.contains(range.startContainer) &&
        element.contains(range.endContainer)
      ) {
        // A browser offset just after an image is one child, while Muya's
        // model stores the full Markdown/HTML token at that position.
        function offset(node: Node, index: number) {
          const prefix = document.createRange();
          prefix.selectNodeContents(element!);
          const atom = (
            node instanceof Element ? node : node.parentElement
          )?.closest('.mu-inline-image');
          if (atom) prefix.setEndAfter(atom);
          else prefix.setEnd(node, index);
          const fragment = prefix.cloneContents();
          for (const image of fragment.querySelectorAll<HTMLElement>(
            '.mu-inline-image',
          ))
            image.replaceWith(image.dataset.raw ?? '');
          return Math.min(
            block.text.length,
            (fragment.textContent ?? '').length,
          );
        }
        return {
          start: offset(range.startContainer, range.startOffset),
          end: offset(range.endContainer, range.endOffset),
        };
      }
    }
    const cursor = selection.focusBlock.getCursor();
    return cursor?.isSelectionInSameBlock
      ? { start: cursor.start.offset, end: cursor.end.offset }
      : { start: selection.focus.offset, end: selection.focus.offset };
  }
  async function add(files: File[]) {
    if (!surface.isEditable || surface.composing || !files.length) return;
    if (uploading) {
      notice('上一组图片正在保存。');
      return;
    }
    let selection = muya.editor.selection.getSelection() ?? previous;
    if (!selection?.focusBlock.domNode?.isConnected) {
      surface.focus(true);
      selection = muya.editor.selection.getSelection();
    }
    const block = selection?.focusBlock;
    if (!selection || !block?.domNode?.matches(editable)) {
      notice('请在正文段落或表格单元格中选择插图位置。');
      return;
    }
    const { start, end } = visiblePosition(selection);
    const original = block.text,
      generation = surface.generation;
    uploading = true;
    notice('正在保存图片…');
    try {
      const urls = await Promise.all(files.map(upload));
      if (
        !block.domNode?.isConnected ||
        generation !== surface.generation ||
        !surface.isEditable ||
        listen.signal.aborted
      )
        return;
      if (block.text.slice(0, end) !== original.slice(0, end)) {
        notice('插图位置已改变，请重新插入。');
        return;
      }
      const caret = muya.editor.selection.getSelection();
      const markup = urls
        .map((url, i) =>
          imageMarkup(
            url,
            files[i]!.name.replace(/\.[^.]+$/, '') || '图片',
            '',
          ),
        )
        .join(' ');
      block.text = block.text.slice(0, start) + markup + block.text.slice(end);
      if (
        caret?.focusBlock === block &&
        caret.isCollapsed &&
        caret.focus.offset <= end
      ) {
        block.setCursor(start + markup.length, start + markup.length, true);
        const node = Array.from(
          block.domNode.querySelectorAll<HTMLElement>('.mu-inline-image'),
        ).find((el) => el.dataset.raw?.includes(urls.at(-1)!));
        if (node) {
          const range = document.createRange();
          range.setStartAfter(node);
          range.collapse(true);
          const native = window.getSelection();
          native?.removeAllRanges();
          native?.addRange(range);
        }
      } else if (caret?.focusBlock === block && caret.isCollapsed) {
        const offset = caret.focus.offset + markup.length - (end - start);
        block.setCursor(offset, offset, true);
      } else block.update();
      notice('');
    } catch (error) {
      if (!listen.signal.aborted)
        notice(error instanceof Error ? error.message : '图片未保存，请重试。');
    } finally {
      uploading = false;
      if (generation !== surface.generation && !listen.signal.aborted)
        notice('');
    }
  }
  picker.addEventListener(
    'change',
    () => {
      const files = [...(picker.files ?? [])];
      picker.value = '';
      void add(files);
    },
    { signal: listen.signal },
  );
  dom.addEventListener(
    'paste',
    (e) => {
      const transfer = e.clipboardData;
      if (!transfer) return;
      let files = [...transfer.files];
      if (!files.length)
        files = [...transfer.items]
          .filter((i) => i.kind === 'file')
          .flatMap((i) => i.getAsFile() ?? []);
      if (!files.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void add(files);
    },
    capture,
  );
  dom.addEventListener(
    'dragover',
    (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    },
    capture,
  );
  dom.addEventListener(
    'drop',
    (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const target =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>(editable)
          : null;
      const caret = document.caretPositionFromPoint?.(e.clientX, e.clientY);
      const range = document.createRange();
      if (caret && dom.contains(caret.offsetNode)) {
        range.setStart(caret.offsetNode, caret.offset);
        range.collapse(true);
      } else if (target) {
        range.selectNodeContents(target);
        range.collapse(false);
      } else {
        notice('请将图片拖到目标段落。');
        return;
      }
      target?.focus();
      const native = window.getSelection();
      native?.removeAllRanges();
      native?.addRange(range);
      void add([...e.dataTransfer.files]);
    },
    capture,
  );
  // Muya 0.2.0 reads dimensions in raw inline tokens as strings on first load.
  dom.addEventListener(
    'load',
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const raw = img.closest<HTMLElement>('.mu-inline-image')?.dataset.raw;
      if (!raw?.startsWith('<img')) return;
      const template = document.createElement('template');
      template.innerHTML = raw;
      for (const key of ['width', 'height']) {
        const size = template.content.firstElementChild?.getAttribute(key);
        if (size && /^\d+$/.test(size) && !img.hasAttribute(key))
          img.setAttribute(key, size);
      }
    },
    capture,
  );
  const onEdit = ({
    reference,
    block,
    imageInfo,
  }: {
    reference: unknown;
    block: ContentBlock;
    imageInfo: {
      token: {
        raw: string;
        attrs: Record<string, string>;
        range: { start: number; end: number };
      };
    };
  }) => {
    if (!reference || !surface.isEditable) return;
    const token = imageInfo.token;
    edit({
      block,
      ...token.range,
      raw: token.raw,
      attrs: token.attrs,
      generation: surface.generation,
    });
  };
  muya.on('muya-image-selector', onEdit);
  return () => {
    listen.abort();
    muya.off('muya-image-selector', onEdit);
  };
}
