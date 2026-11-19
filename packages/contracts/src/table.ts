// ProseMirror uses one slot per logical cell when mapping a table. Bound the
// expanded grid too, including slots covered by pasted row/column spans.
export function tableGridSize(rows: unknown[], maxSlots: number): number {
  if (!rows.length || rows.length > maxSlots) return 0;
  const occupiedUntil: number[] = [];
  const maxWidth = Math.floor(maxSlots / rows.length);
  for (const [index, row] of rows.entries()) {
    if (
      !row ||
      typeof row !== 'object' ||
      !('type' in row) ||
      row.type !== 'tableRow'
    )
      return 0;
    const cells: unknown = 'content' in row ? row.content : [];
    if (!Array.isArray(cells)) return 0;
    let column = 0;
    for (const cell of cells as unknown[]) {
      if (!cell || typeof cell !== 'object') return 0;
      const attrs = 'attrs' in cell ? cell.attrs : {};
      if (!attrs || typeof attrs !== 'object') return 0;
      const width = 'colspan' in attrs ? attrs.colspan : 1;
      const height = 'rowspan' in attrs ? attrs.rowspan : 1;
      if (
        typeof width !== 'number' ||
        !Number.isSafeInteger(width) ||
        width < 1 ||
        typeof height !== 'number' ||
        !Number.isSafeInteger(height) ||
        height < 1 ||
        index + height > rows.length
      )
        return 0;
      while ((occupiedUntil[column] ?? 0) > index) column++;
      const end = column + width;
      if (end > (index ? occupiedUntil.length : maxWidth)) return 0;
      while (column < end) {
        if ((occupiedUntil[column] ?? 0) > index) return 0;
        occupiedUntil[column++] = index + height;
      }
    }
    while ((occupiedUntil[column] ?? 0) > index) column++;
    if (!column || column !== occupiedUntil.length) return 0;
  }
  return occupiedUntil.length * rows.length;
}
