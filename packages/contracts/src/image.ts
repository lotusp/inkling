export const imageNamePattern = /^[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/;
export const imageMime = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
} as const;
export const imageByteLimit = 10 * 1024 * 1024;

// Only image destinations are rewritten. A URL quoted in prose or a code block stays literal.
export function mapWritingImages(
  text: string,
  map: (src: string) => string,
): string {
  return text.replace(
    /(!\[(?:\\.|[^\]\\])*\]\()([^\s)]+)|(<img\b[^<>]*?\bsrc=["'])([^"']+)/gi,
    (_whole, markdown, url, html, src) =>
      markdown ? markdown + map(url) : html + map(src),
  );
}
