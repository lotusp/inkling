export const imageNamePattern = /^[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/;
export const imageMime = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
} as const;
export const imageByteLimit = 10 * 1024 * 1024;

// Match escaped delimiters and complete inline code spans before image tokens.
// A Markdown example in a technical article must never become an attachment.
export function mapWritingImages(
  text: string,
  map: (src: string) => string,
): string {
  return text.replace(
    /\\[\\!<`]|(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)|(!\[(?:\\.|[^\]\\])*\]\()([^\s)]+)|(<img\b[^<>]*?\bsrc=["'])([^"']+)/gi,
    (whole, _ticks, markdown, url, html, src) => {
      if (markdown) return markdown + map(url);
      if (html) return html + map(src);
      return whole;
    },
  );
}
