import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageViewport } from 'pdfjs-dist/types/src/display/page_viewport';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Crosshair,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  GitCompare,
  Loader2,
  Maximize2,
  Minus,
  MoreHorizontal,
  PanelLeft,
  Presentation,
  Search,
  ScanLine,
  X,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type { BoxHotspot, SyncTarget } from '../types';
import { useI18n } from '../i18n';
import { buildPdfDiff } from '../lib/pdfDiff';
import { dragRect, intersects, mergeTextRects, sampleRegion, toSyncPoint, toViewportRect, type PdfPoint, type PdfRect } from '../lib/pdfSync';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  bytes: Uint8Array | null;
  previousBytes: Uint8Array | null;
  pdfPath: string | null;
  compiling: boolean;
  error: string | null;
  syncTarget: SyncTarget | null;
  onCompile: () => void;
  onInverse: (page: number, x: number, y: number, points?: PdfPoint[]) => void;
  onOpenPdf: () => void;
  onReveal: () => void;
  onPageChange: (page: number) => void;
  hotspots?: BoxHotspot[];
}

interface PageViewProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  syncTarget: SyncTarget | null;
  onInverse: Props['onInverse'];
  selectRegion: boolean;
  previousDoc?: PDFDocumentProxy | null;
  diffMode?: boolean;
  diffOpacity?: number;
  hotspots?: BoxHotspot[];
}

function PdfThumbnail({ doc, pageNumber, active, onClick }: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [visible, setVisible] = useState(false);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: element.closest('.pdf-thumb-scroll'),
      rootMargin: '300px 0px',
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 0.22 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const renderTask = page.render({ canvasContext: context, viewport } as Parameters<typeof page.render>[0]);
      task = renderTask;
      try {
        await renderTask.promise;
        if (!cancelled) setUrl(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        // ignore cancelled renders
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, visible]);

  return (
    <button ref={ref} className={`pdf-thumb ${active ? 'active' : ''}`} onClick={onClick}>
      {url ? <img src={url} alt="" /> : <span className="pdf-thumb-placeholder" />}
      <span>{pageNumber}</span>
    </button>
  );
}

function PdfPageView({ doc, pageNumber, scale, syncTarget, onInverse, selectRegion, previousDoc, diffMode, diffOpacity = 0.5, hotspots = [] }: PageViewProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<PageViewport | null>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [size, setSize] = useState({ width: 595, height: 842 });
  const [rendered, setRendered] = useState(false);
  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [textReady, setTextReady] = useState(false);
  const [markerRects, setMarkerRects] = useState<PdfRect[]>([]);
  const [region, setRegion] = useState<PdfRect | null>(null);
  const gesture = useRef<{ pointerId: number; start: PdfPoint } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const next = page.getViewport({ scale });
      viewportRef.current = next;
      setViewport(next);
      setSize({ width: next.width, height: next.height });
    }).catch(() => undefined);
    setRegion(null);
    return () => { cancelled = true; };
  }, [doc, pageNumber, scale]);

  useEffect(() => {
    if (!selectRegion) setRegion(null);
    const cancel = () => { gesture.current = null; setRegion(null); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('keydown', onKey); cancel(); };
  }, [selectRegion]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, { root: element.closest('.pdf-scroll'), rootMargin: '700px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setTextReady(false);
    if (!visible) {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      setRendered(false);
      if (textLayerRef.current) textLayerRef.current.replaceChildren();
      return;
    }
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    let textTask: pdfjsLib.TextLayer | null = null;
    async function render() {
      setRendered(false);
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      viewportRef.current = viewport;
      setSize({ width: viewport.width, height: viewport.height });
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;
      context.save();
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
      const task = page.render({
        canvasContext: context,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      } as Parameters<typeof page.render>[0]);
      renderTask = task;
      try {
        await task.promise;
        if (cancelled) return;
        setRendered(true);
        const content = await page.getTextContent();
        if (cancelled || !textLayerRef.current) return;
        const layer = textLayerRef.current;
        layer.replaceChildren();
        layer.style.setProperty('--total-scale-factor', String(viewport.scale * viewport.userUnit));
        textTask = new pdfjsLib.TextLayer({ textContentSource: content, container: layer, viewport });
        await textTask.render();
        if (!cancelled) setTextReady(true);
      } catch {
        // rendering can be cancelled when zooming quickly
      }
    }
    void render().catch(() => { if (!cancelled) setRendered(false); });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textTask?.cancel();
    };
  }, [doc, pageNumber, scale, visible]);

  useEffect(() => {
    const output = diffCanvasRef.current;
    const currentCanvas = canvasRef.current;
    if (!diffMode || !previousDoc || !visible || !rendered || !output || !currentCanvas) {
      if (output) { output.width = 0; output.height = 0; }
      return;
    }
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      try {
        const page = await previousDoc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const source = document.createElement('canvas');
        source.width = Math.floor(viewport.width * dpr);
        source.height = Math.floor(viewport.height * dpr);
        const context = source.getContext('2d', { alpha: false });
        if (!context) return;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, source.width, source.height);
        const renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        } as Parameters<typeof page.render>[0]);
        task = renderTask;
        await renderTask.promise;
        if (cancelled) return;
        const oldData = context.getImageData(0, 0, source.width, source.height);
        const newData = currentCanvas.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, currentCanvas.width, currentCanvas.height);
        if (!newData) return;
        const diff = buildPdfDiff(oldData.data, newData.data);
        output.width = currentCanvas.width;
        output.height = currentCanvas.height;
        output.style.width = `${currentCanvas.style.width || viewport.width + 'px'}`;
        output.style.height = `${currentCanvas.style.height || viewport.height + 'px'}`;
        output.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(diff.data), output.width, output.height), 0, 0);
      } catch {
        // missing page or cancelled render
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [previousDoc, diffMode, visible, rendered, pageNumber, scale]);

  const textRects = () => {
    const page = wrapRef.current?.getBoundingClientRect();
    if (!page || !textLayerRef.current) return [];
    return [...textLayerRef.current.querySelectorAll<HTMLElement>('span:not(.markedContent)')].filter((span) => span.textContent?.trim()).map((span) => {
      const rect = span.getBoundingClientRect();
      return { x: rect.left - page.left, y: rect.top - page.top, width: rect.width, height: rect.height };
    });
  };
  const marker = syncTarget && syncTarget.page === pageNumber ? syncTarget : null;
  const markerBox = marker && viewport ? toViewportRect(marker.bounds || { x: marker.x, y: marker.y - 10, width: marker.width || 24, height: marker.height || 12 }, viewport) : null;

  useEffect(() => {
    if (!marker || !viewport) { setMarkerRects([]); return; }
    const box = toViewportRect(marker.bounds || { x: marker.x, y: marker.y - 10, width: marker.width || 24, height: marker.height || 12 }, viewport);
    const matches = textReady ? mergeTextRects(textRects().filter((rect) => intersects(box, rect))) : [];
    setMarkerRects(matches.length ? matches : [box]);
    setRegion(null);
  }, [syncTarget, viewport, textReady, pageNumber]);

  useEffect(() => {
    if (!markerBox || !wrapRef.current) return;
    const page = wrapRef.current;
    const scroller = page.closest('.pdf-scroll') as HTMLElement | null;
    if (!scroller) return;
    const pageRect = page.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const top = pageRect.top - scrollerRect.top + markerBox.y;
    const left = pageRect.left - scrollerRect.left + markerBox.x;
    const scrollY = top < 60 || top + markerBox.height > scroller.clientHeight - 40;
    const scrollX = left < 12 || left + markerBox.width > scroller.clientWidth - 12;
    if (scrollY || scrollX) scroller.scrollTo({
      top: scrollY ? scroller.scrollTop + top - scroller.clientHeight * 0.4 : scroller.scrollTop,
      left: scrollX ? scroller.scrollLeft + left - Math.max(12, (scroller.clientWidth - markerBox.width) / 2) : scroller.scrollLeft,
      behavior: marker?.manual && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto',
    });
  }, [syncTarget, viewport, size.height, pageNumber]);

  const localPoint = (event: React.PointerEvent<HTMLDivElement>): PdfPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) };
  };
  const startRegion = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || gesture.current || !(selectRegion || event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    gesture.current = { pointerId: event.pointerId, start: localPoint(event) };
    event.currentTarget.setPointerCapture(event.pointerId);
    setRegion(null);
  };
  const moveRegion = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return;
    setRegion(dragRect(gesture.current.start, localPoint(event)));
  };
  const endRegion = (event: React.PointerEvent<HTMLDivElement>, cancel = false) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancel) { setRegion(null); return; }
    const viewport = viewportRef.current;
    if (!viewport) return;
    const end = localPoint(event);
    const rect = dragRect(active.start, end);
    if (rect.width < 4 && rect.height < 4) {
      const point = toSyncPoint(end, viewport);
      const line = textRects().find((text) => intersects({ x: end.x - 2, y: end.y - 2, width: 4, height: 4 }, text));
      setRegion(line || { x: end.x - 8, y: end.y - 6, width: 16, height: 12 });
      onInverse(pageNumber, point.x, point.y);
    } else {
      const selected = textRects().filter((text) => intersects(rect, text)).map((text) => {
        const x = Math.max(text.x, rect.x), y = Math.max(text.y, rect.y);
        return { x, y, width: Math.min(text.x + text.width, rect.x + rect.width) - x, height: Math.min(text.y + text.height, rect.y + rect.height) - y };
      });
      const points = sampleRegion(selected, rect).map((point) => toSyncPoint(point, viewport));
      setRegion(rect);
      onInverse(pageNumber, points[0].x, points[0].y, points);
    }
  };

  const pageHotspots = hotspots.filter((hotspot) => hotspot.page === pageNumber);

  return (
    <div className="pdf-page-shell" data-page={pageNumber}>
      <div className="pdf-page-label">{t('Page {page}', { page: pageNumber })}</div>
      <div
        className={`pdf-page ${selectRegion ? 'pdf-region-mode' : ''}`}
        ref={wrapRef}
        style={{ width: size.width, height: size.height }}
        onPointerDown={startRegion}
        onPointerMove={moveRegion}
        onPointerUp={(event) => endRegion(event)}
        onPointerCancel={(event) => endRegion(event, true)}
        onLostPointerCapture={(event) => endRegion(event, true)}
        data-text-ready={textReady}
        title={t(selectRegion ? 'Drag to select a PDF region and locate its source. Esc cancels.' : 'Hold ⌘ / Ctrl and click or drag to locate source')}
      >
        {!rendered && (
          <div className="pdf-page-loading">
            <Loader2 size={16} className="spin" />
          </div>
        )}
        <canvas ref={canvasRef} />
        <div className="pdf-text-layer" ref={textLayerRef} />
        <canvas className={`pdf-diff-canvas ${diffMode ? 'visible' : ''}`} ref={diffCanvasRef} style={{ opacity: diffOpacity }} />
        {pageHotspots.map((hotspot, index) => (
          <div
            key={`${hotspot.page}-${index}-${hotspot.x}`}
            className={`pdf-box-hotspot ${hotspot.severity}`}
            style={{ left: hotspot.x * scale, top: hotspot.y * scale, width: Math.max(18, hotspot.width * scale), height: Math.max(9, hotspot.height * scale) }}
            title={hotspot.message}
          />
        ))}
        {region && <div className="pdf-region-selection" style={{ left: region.x, top: region.y, width: region.width, height: region.height }} />}
        {!region && marker && markerRects.map((rect, index) => (
          <div
            key={`${marker.key}-${index}`}
            className="pdf-sync-marker"
            style={{
              left: rect.x,
              top: Math.max(0, rect.y),
              width: Math.max(4, rect.width),
              height: Math.max(4, rect.height),
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function PdfPane({
  bytes,
  previousBytes,
  pdfPath,
  compiling,
  error,
  syncTarget,
  onCompile,
  onInverse,
  onOpenPdf,
  onReveal,
  onPageChange,
  hotspots = [],
}: Props) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(595);
  const [zoom, setZoom] = useState(0.9);
  const [fitMode, setFitMode] = useState(true);
  const [containerWidth, setContainerWidth] = useState(720);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showThumbs, setShowThumbs] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [copiedPage, setCopiedPage] = useState(false);
  const [spread, setSpread] = useState(false);
  const [previousDoc, setPreviousDoc] = useState<PDFDocumentProxy | null>(null);
  const [diffMode, setDiffMode] = useState(false);
  const [diffOpacity, setDiffOpacity] = useState(0.5);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [selectRegion, setSelectRegion] = useState(false);
  const pdfPaneRef = useRef<HTMLElement | null>(null);
  const loadedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!selectRegion) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectRegion(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selectRegion]);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest('.pdf-view-menu')) setViewMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [viewMenuOpen]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!bytes || bytes.length === 0) {
      setDoc(null);
      setPageCount(0);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const sameDocument = loadedPath.current === pdfPath;
    const position = sameDocument ? { top: scrollRef.current?.scrollTop || 0, left: scrollRef.current?.scrollLeft || 0 } : { top: 0, left: 0 };
    const task = pdfjsLib.getDocument({
      data: bytes.slice(),
      useSystemFonts: true,
      disableFontFace: false,
    });
    task.promise
      .then(async (document) => {
        if (cancelled) {
          void task.destroy();
          return;
        }
        const firstPage = await document.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        setPageWidth(viewport.width);
        setDoc(document);
        setPageCount(document.numPages);
        setLoading(false);
        loadedPath.current = pdfPath;
        setCurrentPage((page) => sameDocument ? Math.min(page, document.numPages) : 1);
        requestAnimationFrame(() => { if (!cancelled) scrollRef.current?.scrollTo({ ...position, behavior: 'auto' }); });
      })
      .catch((loadFailure) => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(String(loadFailure?.message || loadFailure));
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [bytes, pdfPath]);

  useEffect(() => {
    if (!previousBytes || previousBytes.length === 0) {
      setPreviousDoc(null);
      return;
    }
    let cancelled = false;
    const task = pdfjsLib.getDocument({ data: previousBytes.slice(), useSystemFonts: true, disableFontFace: false });
    task.promise.then((document) => {
      if (!cancelled) setPreviousDoc(document);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [previousBytes]);

  useEffect(() => {
    if (!fitMode) return;
    const across = spread ? 2 : 1;
    const gap = spread ? 18 : 0;
    const available = Math.max(280, containerWidth - 72 - gap);
    const next = Math.max(0.22, Math.min(1.7, available / across / pageWidth));
    setZoom(next);
  }, [fitMode, containerWidth, pageWidth, spread]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !doc) return;
    let frame = 0;
    const handleScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const pages = [...element.querySelectorAll<HTMLElement>('[data-page]')];
        const reference = element.getBoundingClientRect().top + 120;
        let best = 1;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const page of pages) {
          const rect = page.getBoundingClientRect();
          const distance = Math.abs(rect.top - reference);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = Number(page.dataset.page) || 1;
          }
        }
        setCurrentPage(best);
        onPageChange(best);
      });
    };
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(frame);
    };
  }, [doc, onPageChange]);

  useEffect(() => {
    if (!searchOpen || !doc || query.trim().length < 2) {
      setSearchHits([]);
      setSearchIndex(0);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const needle = query.trim().toLowerCase();
      const hits: number[] = [];
      try {
        for (let index = 1; index <= doc.numPages; index++) {
          if (cancelled) return;
          const page = await doc.getPage(index);
          const content = await page.getTextContent();
          const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ').toLowerCase();
          if (text.includes(needle)) hits.push(index);
        }
        if (!cancelled) {
          setSearchHits(hits);
          setSearchIndex(0);
        }
      } catch {
        if (!cancelled) setSearchHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchOpen, query, doc]);

  const goToPage = useCallback(
    (page: number) => {
      const target = Math.max(1, Math.min(pageCount, page));
      const element = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${target}"]`);
      element?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setCurrentPage(target);
      onPageChange(target);
    },
    [pageCount, onPageChange],
  );

  const zoomIn = () => {
    setFitMode(false);
    setZoom((value) => Math.min(1.8, value + 0.1));
  };
  const zoomOut = () => {
    setFitMode(false);
    setZoom((value) => Math.max(0.35, value - 0.1));
  };

  const jumpSearch = (direction: number) => {
    if (!searchHits.length) return;
    const next = (searchIndex + direction + searchHits.length) % searchHits.length;
    setSearchIndex(next);
    goToPage(searchHits[next]);
  };

  const copyPageText = async () => {
    if (!doc) return;
    const page = await doc.getPage(currentPage);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    await navigator.clipboard?.writeText(text);
    setCopiedPage(true);
    window.setTimeout(() => setCopiedPage(false), 1200);
  };

  if (!bytes || loadError) {
    return (
      <section className="pdf-pane" ref={pdfPaneRef}>
        <div className="pdf-toolbar">
          <div className="pdf-toolbar-title">
            <FileText size={14} />
            <span>{t('PDF Preview')}</span>
          </div>
          <div className="pdf-toolbar-actions">
            <button className="icon-btn" onClick={onCompile} title={t('Compile (⌘↩)')} disabled={compiling}>
              <RefreshCw size={14} className={compiling ? 'spin' : ''} />
            </button>
          </div>
        </div>
        <div className="pdf-empty">
          <div className="pdf-empty-page">
            <div className="pdf-empty-lines">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          {compiling ? (
            <>
              <Loader2 size={22} className="spin" />
              <h3>{t('Typesetting…')}</h3>
              <p>{t('latexmk is compiling your project.')}</p>
            </>
          ) : loadError ? (
            <>
              <h3>{t('Could not display the PDF')}</h3>
              <p className="danger-text">{loadError}</p>
              <button className="primary-btn" onClick={onCompile}>
                {t('Recompile')}
              </button>
            </>
          ) : (
            <>
              <h3>{t('No PDF yet')}</h3>
              <p>{error || t('Compile the project to see the typeset page here.')}</p>
              <button className="primary-btn" onClick={onCompile}>
                {t('Compile document')}
              </button>
              <span className="pdf-empty-hint">{t('⌘↩ compile · ⌘-click PDF to jump back')}</span>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="pdf-pane" ref={pdfPaneRef}>
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-title">
          <FileText size={14} />
          <span>{t('PDF Preview')}</span>
          <span className="pdf-counter">
            {currentPage} / {pageCount}
          </span>
        </div>
        <div className="pdf-toolbar-actions">
          <button className="icon-btn" onClick={() => goToPage(currentPage - 1)} title={t('Previous page')} aria-label={t('Previous page')} disabled={currentPage <= 1}>
            <ChevronLeft size={14} />
          </button>
          <button className="icon-btn" onClick={() => goToPage(currentPage + 1)} title={t('Next page')} aria-label={t('Next page')} disabled={currentPage >= pageCount}>
            <ChevronRight size={14} />
          </button>
          <span className="toolbar-sep" />
          <button className="icon-btn" onClick={zoomOut} title={t('Zoom out')} aria-label={t('Zoom out')}>
            <Minus size={14} />
          </button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="icon-btn" onClick={zoomIn} title={t('Zoom in')} aria-label={t('Zoom in')}>
            <Plus size={14} />
          </button>
          <button
            className={`icon-btn ${fitMode ? 'active' : ''}`}
            onClick={() => setFitMode(true)}
            title={t('Fit page width')} aria-label={t('Fit page width')}
          >
            <Maximize2 size={14} />
          </button>
          <span className="toolbar-sep" />
          <button
            className={`icon-btn ${showThumbs ? 'active' : ''}`}
            data-testid="pdf-thumb-toggle"
            onClick={() => setShowThumbs((value) => !value)}
            title={t('Page thumbnails')}
            aria-label={t('Page thumbnails')}
            aria-pressed={showThumbs}
          >
            <PanelLeft size={14} />
          </button>
          <button
            className={`icon-btn ${searchOpen ? 'active' : ''}`}
            data-testid="pdf-search-toggle"
            onClick={() => setSearchOpen((value) => !value)}
            title={t('Search in PDF')}
            aria-label={t('Search in PDF')}
            aria-pressed={searchOpen}
          >
            <Search size={14} />
          </button>
          <span className="toolbar-sep" />
          <button
            className={`icon-btn ${selectRegion ? 'active' : ''}`}
            data-testid="pdf-region-toggle"
            onClick={() => setSelectRegion((value) => !value)}
            title={t('Select PDF region')}
            aria-label={t('Select PDF region')}
            aria-pressed={selectRegion}
          ><ScanLine size={14} /></button>
          <div className="pdf-view-menu">
            <button
              className={`icon-btn ${viewMenuOpen ? 'active' : ''}`}
              onClick={() => setViewMenuOpen((value) => !value)}
              title={t('More PDF tools')}
              aria-label={t('More PDF tools')}
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
            >
              <MoreHorizontal size={14} />
            </button>
            {viewMenuOpen && (
              <div className="pdf-view-popover" role="menu">
                <button role="menuitemcheckbox" aria-checked={diffMode} onClick={() => setDiffMode((value) => !value)} disabled={!previousDoc}>
                  <GitCompare size={13} /> {t('Compare with previous compile')}
                </button>
                {diffMode && <input className="pdf-diff-opacity" type="range" min={0.15} max={0.9} step={0.05} value={diffOpacity} onChange={(event) => setDiffOpacity(Number(event.target.value))} title={t('Diff opacity')} />}
                <button role="menuitemcheckbox" aria-checked={spread} onClick={() => setSpread((value) => !value)}>
                  <Columns2 size={13} /> {t('Two-page spread')}
                </button>
                <button role="menuitem" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void pdfPaneRef.current?.requestFullscreen(); setViewMenuOpen(false); }}>
                  <Presentation size={13} /> {t('Presentation mode')}
                </button>
                <span className="pdf-view-sep" />
                <button role="menuitem" onClick={() => void copyPageText()}><Copy size={13} /> {t('Copy page text')}</button>
                <button role="menuitem" onClick={onOpenPdf} disabled={!pdfPath}><ExternalLink size={13} /> {t('Open PDF in default viewer')}</button>
                <button role="menuitem" onClick={onReveal} disabled={!pdfPath}><FolderOpen size={13} /> {t('Reveal PDF in Finder')}</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {searchOpen && (
        <div className="pdf-search-bar">
          <Search size={12} />
          <input
            autoFocus
            data-testid="pdf-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') jumpSearch(event.shiftKey ? -1 : 1);
              if (event.key === 'Escape') setSearchOpen(false);
            }}
            placeholder={t('Search text in PDF…')}
          />
          <span className="pdf-search-count">
            {searching ? <Loader2 size={10} className="spin" /> : searchHits.length ? `${searchIndex + 1}/${searchHits.length}` : t('No matches')}
          </span>
          <button className="icon-btn" onClick={() => jumpSearch(-1)} disabled={!searchHits.length}><ChevronLeft size={12} /></button>
          <button className="icon-btn" onClick={() => jumpSearch(1)} disabled={!searchHits.length}><ChevronRight size={12} /></button>
          <button className="icon-btn" onClick={() => setSearchOpen(false)}><X size={12} /></button>
        </div>
      )}
      <div className="pdf-main">
        {showThumbs && doc && (
          <aside className="pdf-thumb-rail">
            <div className="pdf-thumb-scroll">
              {Array.from({ length: pageCount }, (_, index) => (
                <PdfThumbnail
                  key={index + 1}
                  doc={doc}
                  pageNumber={index + 1}
                  active={currentPage === index + 1}
                  onClick={() => goToPage(index + 1)}
                />
              ))}
            </div>
          </aside>
        )}
      <div className="pdf-scroll" ref={scrollRef}>
        {syncTarget && (
          <div className="pdf-sync-banner">
            <Crosshair size={12} />
            {t('Synced to page {page}', { page: syncTarget.page })}{syncTarget.sourceLine ? ` · ${t('line')} ${syncTarget.sourceLine}` : ''}
          </div>
        )}
        {diffMode && (
          <div className="pdf-diff-legend">
            <span><i className="removed" /> {t('Removed')}</span>
            <span><i className="added" /> {t('Added')}</span>
          </div>
        )}
        <div className={`pdf-pages ${spread ? 'spread' : ''}`} style={{ opacity: loading ? 0.4 : 1 }}>
          {doc &&
            Array.from({ length: pageCount }, (_, index) => (
              <PdfPageView
                key={index + 1}
                doc={doc}
                pageNumber={index + 1}
                scale={zoom}
                syncTarget={syncTarget}
                onInverse={onInverse}
                selectRegion={selectRegion}
                previousDoc={previousDoc}
                diffMode={diffMode}
                diffOpacity={diffOpacity}
                hotspots={hotspots}
              />
            ))}
        </div>
        {loading && (
          <div className="pdf-loading-overlay">
            <Loader2 size={18} className="spin" />
            {t('Rendering pages')}
          </div>
        )}
        <div className="pdf-footnote">
          <Crosshair size={11} /> {t(selectRegion ? 'Drag to select a PDF region and locate its source. Esc cancels.' : 'Hold ⌘ / Ctrl and click or drag to locate source')}
        </div>
      </div>
      </div>
    </section>
  );
}
