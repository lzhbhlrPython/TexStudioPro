import { useEffect, useRef, useState } from 'react';
import { Activity, Eraser, PenLine, Redo2, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { getStroke } from 'perfect-freehand';
import { dirname, relativePath } from '../lib/latex';
import { useI18n } from '../i18n';
import { EventType, InkModeler } from '../lib/inkModeler';

interface Point { x: number; y: number; pressure: number }
interface Stroke { color: string; width: number; points: Point[]; pressured: boolean }

function strokePath(stroke: Stroke): Path2D | null {
  if (!stroke.points.length) return null;
  const points = stroke.points.map((point) => ({ ...point, pressure: 0.12 + Math.max(0, Math.min(1, point.pressure)) * 0.88 }));
  const outline = getStroke(points, {
    size: stroke.width * 2.6,
    thinning: stroke.pressured ? 1 : 0.62,
    smoothing: 0.58,
    streamline: 0.44,
    simulatePressure: !stroke.pressured,
    last: true,
  });
  if (!outline.length) return null;
  const path = new Path2D();
  path.moveTo(outline[0][0], outline[0][1]);
  for (let index = 1; index < outline.length; index++) path.lineTo(outline[index][0], outline[index][1]);
  path.closePath();
  return path;
}

interface Props {
  open: boolean;
  projectRoot: string | null;
  activeFile: string | null;
  assetsDir: string;
  onClose: () => void;
  onInsert: (text: string) => void;
}

export function InkStudio({ open, projectRoot, activeFile, assetsDir, onClose, onInsert }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [color, setColor] = useState('#b4492c');
  const [width, setWidth] = useState(4.5);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [pressure, setPressure] = useState(true);
  const [smooth, setSmooth] = useState(true);
  const drawing = useRef<Stroke | null>(null);
  const prediction = useRef<Point[]>([]);
  const modeler = useRef<InkModeler | null>(null);
  const strokeClock = useRef(0);
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes;
  const size = useRef({ width: 900, height: 540 });

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.current.width * dpr);
    canvas.height = Math.floor(size.current.height * dpr);
    canvas.style.width = `${size.current.width}px`;
    canvas.style.height = `${size.current.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.current.width, size.current.height);
    for (const stroke of strokesRef.current) drawStroke(context, stroke);
    if (drawing.current) drawStroke(context, drawing.current);
    if (prediction.current.length) {
      context.save();
      context.globalAlpha = 0.32;
      drawStroke(context, { color, width, points: prediction.current, pressured: true });
      context.restore();
    }
  };

  const drawStroke = (context: CanvasRenderingContext2D, stroke: Stroke) => {
    const path = strokePath(stroke);
    if (!path) return;
    context.fillStyle = stroke.color;
    context.fill(path);
  };

  useEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.max(320, entry.contentRect.width);
      const height = Math.max(260, entry.contentRect.height);
      if (Math.abs(width - size.current.width) > 2 || Math.abs(height - size.current.height) > 2) {
        size.current = { width, height };
        redraw();
      }
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => { if (open) redraw(); }, [strokes, open]);

  if (!open) return null;

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: Math.max(0.08, Math.min(1, event.pressure || 0.5)) };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointers may not support capture */ }
    if (tool === 'eraser') {
      const point = pointFromEvent(event);
      setStrokes((current) => current.filter((stroke) => !stroke.points.some((item) => Math.hypot(item.x - point.x, item.y - point.y) < 18 + stroke.width)));
      return;
    }
    prediction.current = [];
    const point = pointFromEvent(event);
    const pressured = pressure && event.pointerType === 'pen';
    const points: Point[] = [point];
    if (smooth) {
      const engine = new InkModeler();
      if (engine.reset()) {
        modeler.current = engine;
        strokeClock.current = performance.now() / 1000;
        engine.update(EventType.Down, point.x, point.y, 0, point.pressure);
      }
    }
    drawing.current = { color, width, points, pressured };
    redraw();
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const points = drawing.current.points;
    const last = points[points.length - 1];
    const next = pointFromEvent(event);
    if (Math.hypot(next.x - last.x, next.y - last.y) < 0.8) return;
    points.push(next);
    if (modeler.current && smooth) {
      const time = performance.now() / 1000 - strokeClock.current;
      const modeled = modeler.current.update(EventType.Move, next.x, next.y, time, next.pressure);
      if (modeled.length > 1) {
        const lastModeled = modeled[modeled.length - 1];
        if (Math.hypot(lastModeled.x - next.x, lastModeled.y - next.y) < 24) points.push(...modeled);
      }
      const predicted = modeler.current.predict();
      if (predicted.length) prediction.current = predicted.slice(0, 2);
    }
    if (!prediction.current.length) {
      const previous = points[points.length - 2];
      if (previous) {
        const dx = next.x - previous.x;
        const dy = next.y - previous.y;
        prediction.current = [
          { x: next.x + dx * 0.7, y: next.y + dy * 0.7, pressure: next.pressure },
          { x: next.x + dx * 1.25, y: next.y + dy * 1.25, pressure: next.pressure * 0.8 },
        ];
      }
    }
    redraw();
  };
  const end = () => {
    if (!drawing.current) return;
    const stroke = drawing.current;
    if (modeler.current && smooth) {
      const last = stroke.points[stroke.points.length - 1];
      if (last) {
        const time = performance.now() / 1000 - strokeClock.current;
        modeler.current.update(EventType.Up, last.x, last.y, time, last.pressure);
      }
    }
    modeler.current = null;
    drawing.current = null;
    prediction.current = [];
    setStrokes((current) => [...current, stroke]);
    setRedoStack([]);
  };

  const undo = () => {
    if (!strokes.length) return;
    const last = strokes[strokes.length - 1];
    setStrokes((current) => current.slice(0, -1));
    setRedoStack((current) => [last, ...current]);
  };
  const redo = () => {
    if (!redoStack.length) return;
    setStrokes((current) => [...current, redoStack[0]]);
    setRedoStack((current) => current.slice(1));
  };


  const toTikz = () => {
    const scale = 0.5;
    const paths = strokes.map((stroke) => {
      if (!stroke.points.length) return '';
      const points = stroke.points.map((point) => `(${(point.x * scale).toFixed(2)},${((size.current.height - point.y) * scale).toFixed(2)})`).join(' -- ');
      return `  \\draw[${stroke.color.replace('#', '')}, line width=${(stroke.width * scale).toFixed(2)}pt, line cap=round, line join=round] ${points};`;
    }).join('\n');
    return `\\begin{tikzpicture}[x=1pt,y=1pt]\n${paths}\n\\end{tikzpicture}`;
  };

  const savePng = async () => {
    if (!projectRoot || !activeFile || !strokes.length || saving) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const asset = await window.texpro.saveImageBuffer(projectRoot, assetsDir, {
        name: `ink-${Date.now()}`,
        ext: 'png',
        data: new Uint8Array(await blob.arrayBuffer()),
      });
      const relative = relativePath(dirname(activeFile), asset.path);
      onInsert(`\\includegraphics[width=0.7\\linewidth]{${relative}}`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="ink-studio" data-testid="ink-studio" data-strokes={strokes.length} onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><PenLine size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Diagram')}</span>
              <h2>{t('Ink studio')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok">{strokes.length} {t('strokes')}</span>
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </header>

        <div className="ink-toolbar">
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} title={t('Ink color')} />
          <input type="range" min={1} max={14} step={0.5} value={width} onChange={(event) => setWidth(Number(event.target.value))} title={t('Ink width')} />
          <span className="ink-size-preview" title={t('Brush preview')}><i style={{ width: width * 2.3, height: width * 2.3 }} /></span>
          <button className={`icon-btn ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title={t('Pen')}><PenLine size={14} /></button>
          <button className={`icon-btn ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title={t('Eraser')}><Eraser size={14} /></button>
          <button className={`icon-btn ${pressure ? 'active' : ''}`} onClick={() => setPressure((value) => !value)} title={t('Pen pressure')}><Activity size={14} /></button>
          <button className={`icon-btn ${smooth ? 'active' : ''}`} onClick={() => setSmooth((value) => !value)} title={smooth ? t('Smooth engine') : t('Precise input')}><Sparkles size={14} /></button>
          <button className="icon-btn" onClick={undo} disabled={!strokes.length} title={t('Undo')}><Undo2 size={14} /></button>
          <button className="icon-btn" onClick={redo} disabled={!redoStack.length} title={t('Redo')}><Redo2 size={14} /></button>
          <button className="icon-btn" onClick={() => { setStrokes([]); setRedoStack([]); }} disabled={!strokes.length} title={t('Clear')}><Trash2 size={14} /></button>
          <span className="spacer" />
          <span className="ink-hint">{t('Pen pressure is used when available; mouse strokes use velocity.')}</span>
        </div>

        <div className="ink-canvas-wrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="ink-canvas"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
          {!strokes.length && (
            <div className="ink-empty">
              <PenLine size={22} />
              <strong>{t('Start drawing')}</strong>
              <span>{t('Use a pen for pressure, or a mouse with velocity dynamics.')}</span>
            </div>
          )}
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('PNG works with every engine; TikZ stays editable in LaTeX.')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={() => { onInsert(toTikz()); onClose(); }} disabled={!strokes.length}>{t('Insert TikZ')}</button>
          <button className="primary-btn" onClick={() => void savePng()} disabled={!strokes.length || !projectRoot || saving}>{t('Save PNG & insert')}</button>
        </footer>
      </section>
    </div>
  );
}
