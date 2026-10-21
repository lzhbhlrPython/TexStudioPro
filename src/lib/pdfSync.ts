export interface PdfPoint { x: number; y: number }
export interface PdfRect extends PdfPoint { width: number; height: number }

interface Viewport {
  viewBox: number[];
  convertToViewportPoint: (x: number, y: number) => number[];
  convertToPdfPoint: (x: number, y: number) => number[];
}

export function dragRect(a: PdfPoint, b: PdfPoint): PdfRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

// SyncTeX measures from the top left of the unrotated page. PDF.js also
// accounts for page crop, rotation and user units in its viewport transform.
export function toSyncPoint(point: PdfPoint, viewport: Viewport): PdfPoint {
  const [x, y] = viewport.convertToPdfPoint(point.x, point.y);
  return { x: x - viewport.viewBox[0], y: viewport.viewBox[3] - y };
}

export function toViewportRect(rect: PdfRect, viewport: Viewport): PdfRect {
  const x = rect.x + viewport.viewBox[0];
  const y = viewport.viewBox[3] - rect.y;
  const a = viewport.convertToViewportPoint(x, y);
  const b = viewport.convertToViewportPoint(x + rect.width, y - rect.height);
  return dragRect({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
}

export function intersects(a: PdfRect, b: PdfRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function mergeTextRects(rects: PdfRect[]): PdfRect[] {
  const lines: PdfRect[] = [];
  for (const rect of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const previous = lines.find((line) => Math.abs(line.y - rect.y) <= Math.min(line.height, rect.height) * 0.35 && rect.x <= line.x + line.width + 8 && rect.x + rect.width >= line.x - 8);
    if (previous) {
      const right = Math.max(previous.x + previous.width, rect.x + rect.width);
      const bottom = Math.max(previous.y + previous.height, rect.y + rect.height);
      previous.x = Math.min(previous.x, rect.x);
      previous.y = Math.min(previous.y, rect.y);
      previous.width = right - previous.x;
      previous.height = bottom - previous.y;
    } else lines.push({ ...rect });
  }
  return lines;
}

export function sampleRegion(rects: PdfRect[], fallback: PdfRect): PdfPoint[] {
  const lines = mergeTextRects(rects);
  if (!lines.length) return [{ x: fallback.x + fallback.width / 2, y: fallback.y + fallback.height / 2 }];
  // Sample actual ink rather than empty corners, including both ends and the
  // middle of long selections. Bound native SyncTeX subprocess work.
  const count = Math.min(7, lines.length);
  return Array.from({ length: count }, (_, i) => {
    const line = lines[Math.round(i * (lines.length - 1) / Math.max(1, count - 1))];
    return { x: line.x + line.width / 2, y: line.y + line.height / 2 };
  });
}
