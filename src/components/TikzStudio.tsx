import { useEffect, useRef, useState } from 'react';
import { TexArtwork } from './TexArtwork';
import {
  Code2,
  Loader2,
  PenTool,
  Play,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  projectRoot: string | null;
  filePath: string | null;
  initialSource: string | null;
  onClose: () => void;
  onInsert: (source: string) => void;
}

const templates = [
  {
    id: 'axes',
    name: 'Function plot',
    source: String.raw`\begin{tikzpicture}[scale=1.1]
  \draw[->] (-0.2,0) -- (4.4,0) node[right] {$x$};
  \draw[->] (0,-0.2) -- (0,3.4) node[above] {$y$};
  \draw[thick,blue,domain=0:4,smooth,samples=80]
    plot (\x,{0.55*\x + 0.35*sin(2*\x r)});
  \filldraw[orange] (2,1.36) circle (2pt) node[above right] {$P$};
\end{tikzpicture}`,
  },
  {
    id: 'flow',
    name: 'Flowchart',
    source: String.raw`\begin{tikzpicture}[
  node distance=1.5cm,
  box/.style={draw,rounded corners,fill=blue!8,minimum width=2.8cm,minimum height=0.9cm},
  arrow/.style={-{Latex[length=2mm]},thick}
]
  \node[box] (a) {Draft};
  \node[box,right=of a] (b) {Review};
  \node[box,below=of b] (c) {Publish};
  \draw[arrow] (a) -- (b);
  \draw[arrow] (b) -- (c);
  \draw[arrow] (c.west) -| (a.south);
\end{tikzpicture}`,
  },
  {
    id: 'geometry',
    name: 'Geometry',
    source: String.raw`\begin{tikzpicture}[scale=1.2]
  \coordinate (A) at (0,0);
  \coordinate (B) at (4,0);
  \coordinate (C) at (1.4,2.6);
  \draw[thick] (A) -- (B) -- (C) -- cycle;
  \draw (A) -- (C);
  \filldraw[orange] (A) circle (1.5pt) node[below left] {$A$};
  \filldraw[orange] (B) circle (1.5pt) node[below right] {$B$};
  \filldraw[orange] (C) circle (1.5pt) node[above] {$C$};
  \node at (2.3,-0.3) {$c$};
\end{tikzpicture}`,
  },
];

export function TikzStudio({ open, projectRoot, filePath, initialSource, onClose, onInsert }: Props) {
  const { t } = useI18n();
  const [source, setSource] = useState(templates[0].source);
  const [preview, setPreview] = useState<string | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSource(initialSource || templates[0].source);
    setPreview(null);
    setError(null);
    setLog(null);
    setEngine(null);
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open, initialSource]);

  useEffect(() => {
    if (!open || !projectRoot || !filePath || !source.trim()) return;
    const id = ++requestId.current;
    setBusy(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const result = await window.texpro.renderTikz({ projectRoot, filePath, source });
        if (id !== requestId.current) return;
        if (result.ok && result.svgPath) {
          setPreview(result.svgPath);
          setEngine(result.engine || null);
          setError(null);
          setLog(null);
        } else {
          setPreview(null);
          setError(result.error || 'TikZ rendering failed');
          setLog(result.log || null);
        }
      } catch (failure) {
        if (id === requestId.current) setError(String(failure));
      } finally {
        if (id === requestId.current) setBusy(false);
      }
    }, 550);
    return () => {
      window.clearTimeout(timer);
      setBusy(false);
    };
  }, [open, source, projectRoot, filePath]);

  if (!open) return null;

  const previewUrl = preview
    ? `texpro-asset://asset/?path=${encodeURIComponent(preview)}`
    : null;

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="tikz-studio" data-testid="tikz-studio" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><PenTool size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Diagram studio')}</span>
              <h2>TikZ Studio</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className={`studio-engine ${error ? 'failed' : preview ? 'ok' : ''}`}>
              {busy ? <Loader2 size={11} className="spin" /> : null}
              {error ? t('Error') : engine || 'latex'}
            </span>
            <button className="icon-btn" onClick={onClose} title={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="tikz-body">
          <div className="tikz-editor-pane">
            <div className="pane-label"><Code2 size={12} /> {t('Diagram source')}</div>
            <textarea
              ref={textareaRef}
              className="tikz-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
            />
            <div className="tikz-template-row">
              <span><Sparkles size={11} /> {t('Templates')}</span>
              {templates.map((item) => (
                <button key={item.id} onClick={() => setSource(item.source)}>{t(item.name)}</button>
              ))}
            </div>
          </div>

          <div className="tikz-preview-pane">
            <div className="pane-label">
              <Play size={12} /> {t('Preview')}
              <button className="mini-refresh" onClick={() => setSource((value) => value + ' ')} title={t('Refresh')}>
                <RefreshCw size={11} />
              </button>
            </div>
            <div className="tikz-preview">
              {busy && !previewUrl && (
                <div className="tikz-placeholder"><Loader2 size={18} className="spin" /> {t('Typesetting diagram…')}</div>
              )}
              {!busy && !previewUrl && !error && (
                <div className="tikz-placeholder">{t('Preview will appear here.')}</div>
              )}
              {previewUrl && <TexArtwork src={previewUrl} alt="TikZ preview" />}
              {error && (
                <div className="tikz-error-box">
                  <strong>{t('Could not render this diagram')}</strong>
                  <p>{error}</p>
                </div>
              )}
            </div>
            {log && (
              <details className="tikz-studio-log">
                <summary>{t('Show log')}</summary>
                <pre>{log}</pre>
              </details>
            )}
          </div>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('TikZ previews use the current document preamble and tools.')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={onClose}>{t('Cancel')}</button>
          <button
            className="primary-btn"
            disabled={!preview || busy}
            onClick={() => {
              onInsert(source);
              onClose();
            }}
          >
            <PenTool size={13} /> {t('Insert diagram')}
          </button>
        </footer>
      </section>
    </div>
  );
}
