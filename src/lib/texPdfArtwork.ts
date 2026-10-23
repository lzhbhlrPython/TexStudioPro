import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Render original TeX geometry at display density; never upscale an existing bitmap. */
export async function rasterizeTexPdf(file: string, bounds: { width: number; height: number }, signal: AbortSignal) {
  let task: ReturnType<typeof pdfjs.getDocument> | undefined;
  const abort = () => { void task?.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const canvas = document.createElement('canvas');
  try {
    const bytes = await window.texpro.readPdf(file);
    signal.throwIfAborted();
    task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
    const doc = await task.promise, page = await doc.getPage(1);
    signal.throwIfAborted();
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(96 / 72, Math.max(1, bounds.width) / base.width, Math.max(1, bounds.height) / base.height);
    const width = base.width * scale, height = base.height * scale;
    const density = Math.min(Math.max(2, window.devicePixelRatio || 1), 4, Math.sqrt(16000000 / (width * height)));
    const viewport = page.getViewport({ scale: scale * density });
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvas, viewport }).promise;
    signal.throwIfAborted();
    return { src: canvas.toDataURL(), width, height };
  } finally {
    signal.removeEventListener('abort', abort);
    await task?.destroy().catch(() => {});
    canvas.width = canvas.height = 0;
  }
}
