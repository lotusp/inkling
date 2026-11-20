/* global document, URL, crypto, location, fetch, window, HTMLImageElement */
const extensions = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
]);
const tasks = new Map();
const notice = document.getElementById('status');
export async function waitForImages(markdown) {
  const relevant = [...tasks].filter(([url]) => markdown.includes(url));
  if ((await Promise.all(relevant.map(([, result]) => result))).includes(false))
    throw new Error('有图片未保存，请移除后重新插入。');
}
function attachment(file) {
  const ext =
    extensions.get(file.type.toLowerCase()) ||
    (!file.type &&
      /\.(png|jpe?g|gif|webp)$/i
        .exec(file.name)?.[1]
        ?.toLowerCase()
        .replace('jpeg', 'jpg'));
  if (!ext) throw new Error('请选择 PNG、JPEG、GIF 或 WebP 图片。');
  if (!file.size || file.size > 32 * 1024 * 1024)
    throw new Error('请选择大小不超过 32 MB 的有效图片。');
  return {
    file,
    url: new URL(
      '/trial-images/' + crypto.randomUUID() + '.' + ext,
      location.origin,
    ).href,
  };
}
function store({ file, url }) {
  const result = fetch(url, { method: 'PUT', body: file })
    .then((response) => {
      if (!response.ok) throw new Error();
      tasks.delete(url);
      return true;
    })
    .catch(() => {
      notice.textContent = '图片未保存，请移除后重新插入。';
      return false;
    });
  tasks.set(url, result);
  return result;
}
const editable =
  '.mu-paragraph-content, .mu-atxheading-content, .mu-table-cell-content, .mu-list-item-content, .mu-setextheading-content';
function nearestContent(node) {
  return (node?.nodeType === 1 ? node : node?.parentElement)?.closest(editable);
}
function setRange(content, range) {
  content.focus({ preventScroll: true });
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
function endOf(content) {
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(false);
  return range;
}
export function installImages(editor) {
  const desk = document.querySelector('.mu-editor');
  // Muya 0.2.0's first image load drops string dimensions stored in the inline token.
  desk.addEventListener(
    'load',
    ({ target: image }) => {
      if (!(image instanceof HTMLImageElement)) return;
      const raw = image.closest('.mu-inline-image')?.dataset.raw;
      if (!raw?.startsWith('<img')) return;
      const template = document.createElement('template');
      template.innerHTML = raw;
      for (const name of ['width', 'height']) {
        const size = template.content.firstElementChild?.getAttribute(name);
        if (!image.hasAttribute(name) && size && /^\d+$/.test(size))
          image.setAttribute(name, size);
      }
    },
    true,
  );
  const main = document.querySelector('main');
  const picker = document.getElementById('insert-file');
  let lastRange;
  let afterImage;
  let composing = false;
  desk.addEventListener('compositionstart', () => {
    composing = true;
  });
  desk.addEventListener('compositionend', () => {
    composing = false;
  });
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (
      selection.rangeCount &&
      nearestContent(selection.focusNode) &&
      desk.contains(selection.focusNode)
    )
      lastRange = selection.getRangeAt(0).cloneRange();
  });
  function add(files) {
    if (!files.length || composing) return;
    try {
      const images = files.map(attachment);
      const selection = editor.editor.selection.getSelection();
      const block = selection?.focusBlock;
      if (!block || !nearestContent(window.getSelection().focusNode))
        throw new Error('请先在正文中选择插图位置。');
      const cursor = block.getCursor();
      const nativeSelection = window.getSelection();
      const boundary = afterImage?.node;
      const atPreviousInsert =
        boundary?.isConnected &&
        block === afterImage.block &&
        nativeSelection.isCollapsed &&
        nativeSelection.focusNode === boundary.parentNode &&
        nativeSelection.focusOffset ===
          Array.prototype.indexOf.call(
            boundary.parentNode.childNodes,
            boundary,
          ) +
            1;
      const start = atPreviousInsert
        ? afterImage.offset
        : cursor?.isSelectionInSameBlock
          ? cursor.start.offset
          : selection.focus.offset;
      const end = atPreviousInsert
        ? start
        : cursor?.isSelectionInSameBlock
          ? cursor.end.offset
          : selection.focus.offset;
      const markup = images
        .map(({ file, url }) => {
          const alt =
            file.name
              .replace(/\.[^.]+$/, '')
              .replace(/[^\p{L}\p{M}\p{N} _-]/gu, ' ')
              .trim()
              .slice(0, 100) || '图片';
          return '![' + alt + '](' + url + ')';
        })
        .join(' ');
      notice.textContent = '';
      images.forEach(store);
      block.text = block.text.slice(0, start) + markup + block.text.slice(end);
      block.setCursor(start + markup.length, start + markup.length, true);
      // A caret inside Muya's non-editable image span cannot accept the next keystroke.
      const inserted = [
        ...block.domNode.querySelectorAll('.mu-inline-image'),
      ].find((node) => node.dataset.raw?.includes(images.at(-1).url));
      if (inserted) {
        const after = document.createRange();
        after.setStartAfter(inserted);
        after.collapse(true);
        setRange(block.domNode, after);
        afterImage = { node: inserted, block, offset: start + markup.length };
      }
    } catch (error) {
      notice.textContent = error.message;
    }
  }
  document
    .getElementById('insert')
    .addEventListener('mousedown', (e) => e.preventDefault());
  document.getElementById('insert').addEventListener('click', () => {
    if (!composing) picker.click();
  });
  picker.addEventListener('change', () => {
    const files = [...picker.files];
    picker.value = '';
    const content = nearestContent(lastRange?.endContainer);
    if (content?.isConnected) setRange(content, lastRange);
    else {
      const fallback =
        desk.querySelector(
          '.mu-paragraph:last-of-type .mu-paragraph-content',
        ) || [...desk.querySelectorAll(editable)].at(-1);
      if (fallback) setRange(fallback, endOf(fallback));
    }
    add(files);
  });
  desk.addEventListener(
    'paste',
    (e) => {
      const items = [...(e.clipboardData?.items || [])];
      const files = [...(e.clipboardData?.files || [])].filter((file) =>
        file.type.startsWith('image/'),
      );
      if (!files.length)
        files.push(
          ...items
            .filter(
              (item) => item.kind === 'file' && item.type.startsWith('image/'),
            )
            .map((item) => item.getAsFile())
            .filter(Boolean),
        );
      if (!files.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      add(files);
    },
    true,
  );
  const fileDrag = (e) =>
    e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  main.addEventListener('dragover', (e) => {
    if (fileDrag(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      main.classList.add('dragging');
    }
  });
  main.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !main.contains(e.relatedTarget))
      main.classList.remove('dragging');
  });
  main.addEventListener(
    'drop',
    (e) => {
      main.classList.remove('dragging');
      if (!fileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = document.caretPositionFromPoint?.(e.clientX, e.clientY);
      let range;
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      } else range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      let content = nearestContent(range?.startContainer);
      if (!content || !desk.contains(content)) {
        const options = [...desk.querySelectorAll(editable)].filter(
          (el) => el.getClientRects().length,
        );
        const distance = (el) => {
          const box = el.getBoundingClientRect();
          return Math.max(box.top - e.clientY, e.clientY - box.bottom, 0);
        };
        content = options.sort((a, b) => distance(a) - distance(b))[0];
        if (!content) return;
        range = endOf(content);
      }
      setRange(content, range);
      add([...e.dataTransfer.files]);
    },
    true,
  );
  for (const event of ['dragover', 'drop'])
    window.addEventListener(event, (e) => {
      if (fileDrag(e)) e.preventDefault();
    });
  installImageDialog(editor);
}
function installImageDialog(editor) {
  const dialog = document.getElementById('edit-image');
  const form = dialog.querySelector('form');
  const fields = form.elements;
  let target;
  editor.eventCenter.on(
    'muya-image-selector',
    ({ reference, block, imageInfo }) => {
      if (!reference || dialog.open) return;
      target = { block, imageInfo };
      form.reset();
      fields.alt.value = imageInfo.token.attrs.alt || '';
      fields.title.value = imageInfo.token.attrs.title || '';
      dialog.querySelector('[role=status]').textContent = '';
      dialog.showModal();
      fields.alt.focus();
    },
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!target) return;
    const { block, imageInfo } = target;
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      const file = fields.replacement.files[0];
      const token = imageInfo.token;
      let url = token.attrs.src;
      if (file) {
        const image = attachment(file);
        if (!(await store(image))) throw new Error('图片未保存，请重新选择。');
        url = image.url;
      }
      if (!url) throw new Error('请选择一张图片。');
      if (
        !dialog.open ||
        block.text.slice(token.range.start, token.range.end) !== token.raw
      )
        return;
      const image = document.createElement('img');
      image.setAttribute('src', url);
      image.setAttribute('alt', fields.alt.value);
      if (fields.title.value) image.setAttribute('title', fields.title.value);
      for (const attr of ['width', 'height', 'data-align'])
        if (token.attrs[attr]) image.setAttribute(attr, token.attrs[attr]);
      block.text =
        block.text.slice(0, token.range.start) +
        image.outerHTML +
        block.text.slice(token.range.end);
      block.update();
      dialog.close();
    } catch (error) {
      dialog.querySelector('[role=status]').textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  dialog.addEventListener('close', () => {
    target = null;
  });
  form.querySelector('[data-cancel]').onclick = () => dialog.close();
}
