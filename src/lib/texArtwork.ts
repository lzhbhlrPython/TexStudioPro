/** Keep authored colors intact; only neutral TeX ink follows the writing theme. */
export function monochromeInk(data: Uint8ClampedArray): Uint8ClampedArray | null {
  let colored = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 16 && Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 24 && ++colored >= 4) return null;
  }
  const ink = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    ink[i] = ink[i + 1] = ink[i + 2] = 255;
    ink[i + 3] = Math.round((255 - (data[i] + data[i + 1] + data[i + 2]) / 3) * data[i + 3] / 255);
  }
  return ink;
}

export function themeTexArtwork(frame: HTMLElement, artwork: HTMLCanvasElement | HTMLImageElement) {
  frame.classList.add('tex-artwork');
  frame.dataset.artwork = 'document-color';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = artwork instanceof HTMLImageElement ? artwork.naturalWidth : artwork.width;
    canvas.height = artwork instanceof HTMLImageElement ? artwork.naturalHeight : artwork.height;
    if (!canvas.width || !canvas.height || canvas.width * canvas.height > 16000000) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(artwork, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), ink = monochromeInk(pixels.data);
    if (!ink) return;
    pixels.data.set(ink); ctx.putImageData(pixels, 0, 0);
    frame.style.setProperty('--tex-ink-mask', `url("${canvas.toDataURL()}")`);
    frame.dataset.artwork = 'monochrome';
  } catch { /* A non-readable image keeps its original colors on a light paper surface. */ }
}
