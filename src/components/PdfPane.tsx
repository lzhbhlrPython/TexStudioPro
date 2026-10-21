import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
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
  PanelLeft,
  Presentation,
  Search,
  X,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type { BoxHotspot, SyncTarget } from '../types';
import { useI18n } from '../i18n';
import { buildPdfDiff } from '../lib/pdfDiff';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  bytes: Uint8Array | null;
  previousBytes: Uint8Array | null;
  pdfPath: string | null;
  compiling: boolean;
  error: string | null;
  syncTarget: SyncTarget | null;
  onCompile: () => void;
  onInverse: (page: number, x: number, y: number) => void;
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
  onInverse: (page: number, x: number, y: number) => void;
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

function PdfPageView({ doc, pageNumber, scale, syncTarget, onInverse, previousDoc, diffMode, diffOpacity = 0.5, hotspots = [] }: PageViewProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<{ width: number; height: number; scale: number } | null>(null);
  const [size, setSize] = useState({ width: 595, height: 842 });
  const [rendered, setRendered] = useState(false);
  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const textLayerRef = useRef<HTMLDivElement | null>(null);

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
      viewportRef.current = { width: viewport.width, height: viewport.height, scale: viewport.scale };
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
        for (const item of content.items) {
          if (!('str' in item) || !item.str || !item.transform) continue;
          const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          const fontSize = Math.hypot(item.transform[2], item.transform[3]) * scale;
          if (fontSize <= 0) continue;
          const span = document.createElement('span');
          span.textContent = item.str;
          span.style.left = `${x}px`;
          span.style.top = `${y - fontSize}px`;
          span.style.fontSize = `${fontSize}px`;
          span.style.width = `${Math.max(1, item.width * scale)}px`;
          layer.appendChild(span);
        }
      } catch {
        // rendering can be cancelled when zooming quickly
      }
    }
    render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
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

  useEffect(() => {
    if (!syncTarget || syncTarget.page !== pageNumber || !wrapRef.current) return;
    const page = wrapRef.current;
    const scroller = page.closest('.pdf-scroll') as HTMLElement | null;
    if (!scroller) {
      page.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const pageRect = page.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const markerY = pageRect.top - scrollerRect.top + syncTarget.y * scale;
    if (markerY < 90 || markerY > scroller.clientHeight - 110) {
      page.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [syncTarget, pageNumber, scale]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const viewport = viewportRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!viewport) return;
    const x = (event.clientX - rect.left) / viewport.scale;
    const y = (event.clientY - rect.top) / viewport.scale;
    onInverse(pageNumber, x, y);
  };

  const marker = syncTarget && syncTarget.page === pageNumber ? syncTarget : null;
  const pageHotspots = hotspots.filter((hotspot) => hotspot.page === pageNumber);

  return (
    <div className="pdf-page-shell" data-page={pageNumber}>
      <div className="pdf-page-label">{t('Page {page}', { page: pageNumber })}</div>
      <div
        className="pdf-page"
        ref={wrapRef}
        style={{ width: size.width, height: size.height }}
        onClick={handleClick}
        title={t('Hold ⌘ and click anywhere in the page to jump to source')}
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
        {marker && (
          <div
            key={marker.key}
            className="pdf-sync-marker"
            style={{
              left: marker.x * scale,
              top: Math.max(0, marker.y * scale - 8),
              width: Math.max(24, (marker.width || 120) * scale),
              height: Math.max(12, (marker.height || 12) * scale),
            }}
          >
            <span />
          </div>
        )}
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
  const pdfPaneRef = useRef<HTMLElement | null>(null);

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
        setCurrentPage(1);
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
  }, [bytes]);

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
                Recompile
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
          <button className="icon-btn" onClick={() => goToPage(currentPage - 1)} title={t('Previous page')} disabled={currentPage <= 1}>
            <ChevronLeft size={14} />
          </button>
          <button className="icon-btn" onClick={() => goToPage(currentPage + 1)} title={t('Next page')} disabled={currentPage >= pageCount}>
            <ChevronRight size={14} />
          </button>
          <span className="toolbar-sep" />
          <button className="icon-btn" onClick={zoomOut} title={t('Zoom out')}>
            <Minus size={14} />
          </button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="icon-btn" onClick={zoomIn} title={t('Zoom in')}>
            <Plus size={14} />
          </button>
          <button
            className={`icon-btn ${fitMode ? 'active' : ''}`}
            onClick={() => setFitMode(true)}
            title={t('Fit page width')}
          >
            <Maximize2 size={14} />
          </button>
          <span className="toolbar-sep" />
          <button
            className={`icon-btn ${diffMode ? 'active' : ''}`}
            data-testid="pdf-diff-toggle"
            onClick={() => setDiffMode((value) => !value)}
            disabled={!previousDoc}
            title={t('Compare with previous compile')}
          >
            <GitCompare size={14} />
          </button>
          {diffMode && (
            <input className="pdf-diff-opacity" type="range" min={0.15} max={0.9} step={0.05} value={diffOpacity} onChange={(event) => setDiffOpacity(Number(event.target.value))} title={t('Diff opacity')} />
          )}
          <button
            className={`icon-btn ${spread ? 'active' : ''}`}
            data-testid="pdf-spread-toggle"
            onClick={() => setSpread((value) => !value)}
            title={t('Two-page spread')}
          >
            <Columns2 size={14} />
          </button>
          <button
            className="icon-btn"
            data-testid="pdf-presentation"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void pdfPaneRef.current?.requestFullscreen();
            }}
            title={t('Presentation mode')}
          >
            <Presentation size={14} />
          </button>
          <button className={`icon-btn ${showThumbs ? 'active' : ''}`} data-testid="pdf-thumb-toggle"
            onClick={() => setShowThumbs((value) => !value)}
            title={t('Page thumbnails')}>
            <PanelLeft size={14} />
          </button>
          <button className={`icon-btn ${searchOpen ? 'active' : ''}`} data-testid="pdf-search-toggle"
            onClick={() => setSearchOpen((value) => !value)}
            title={t('Search in PDF')}>
            <Search size={14} />
          </button>
          <button className="icon-btn" data-testid="pdf-copy"
            onClick={() => void copyPageText()}
            title={t('Copy page text')}>
            {copiedPage ? <span className="copy-done">✓</span> : <Copy size={14} />}
          </button>
          <button className="icon-btn" onClick={onOpenPdf} title={t('Open PDF in default viewer')} disabled={!pdfPath}>
            <ExternalLink size={14} />
          </button>
          <button className="icon-btn" onClick={onReveal} title={t('Reveal PDF in Finder')} disabled={!pdfPath}>
            <FolderOpen size={14} />
          </button>
          <button className="icon-btn" onClick={onCompile} title={t('Compile (⌘↩)')} disabled={compiling}>
            <RefreshCw size={14} className={compiling ? 'spin' : ''} />
          </button>
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
          <Crosshair size={11} /> {t('Hold ⌘ and click anywhere in the page to jump to source')}
        </div>
      </div>
      </div>
    </section>
  );
}
