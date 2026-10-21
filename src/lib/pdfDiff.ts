export interface PdfDiffResult {
  data: Uint8ClampedArray;
  changed: number;
  removed: number;
  added: number;
}

/**
 * Compare two RGBA buffers at the same dimensions.
 * Red = ink present in the previous PDF but absent now.
 * Green = ink added in the current PDF.
 */
export function buildPdfDiff(
  previous: Uint8ClampedArray,
  current: Uint8ClampedArray,
  threshold = 38,
): PdfDiffResult {
  const length = Math.min(previous.length, current.length);
  const data = new Uint8ClampedArray(length);
  let changed = 0;
  let removed = 0;
  let added = 0;
  for (let index = 0; index + 3 < length; index += 4) {
    const oldLum = 0.299 * previous[index] + 0.587 * previous[index + 1] + 0.114 * previous[index + 2];
    const newLum = 0.299 * current[index] + 0.587 * current[index + 1] + 0.114 * current[index + 2];
    const oldInk = 255 - oldLum;
    const newInk = 255 - newLum;
    const delta = newInk - oldInk;
    if (Math.abs(delta) < threshold) continue;
    changed++;
    if (delta > 0) {
      // New ink appeared.
      data[index] = 22;
      data[index + 1] = 163;
      data[index + 2] = 74;
      data[index + 3] = 215;
      added++;
    } else {
      // Ink disappeared.
      data[index] = 220;
      data[index + 1] = 38;
      data[index + 2] = 38;
      data[index + 3] = 215;
      removed++;
    }
  }
  return { data, changed, removed, added };
}
