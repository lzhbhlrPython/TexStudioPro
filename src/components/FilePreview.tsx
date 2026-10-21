import { useEffect, useState } from 'react';
import {
  ExternalLink,
  File,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  ImagePlus,
  Loader2,
  Maximize2,
  Minus,
  Music,
  Plus,
  Video,
  X,
} from 'lucide-react';
import { assetUrl, basename, extname } from '../lib/latex';
import { useI18n } from '../i18n';

interface Props {
  path: string;
  onClose: () => void;
  onOpenText: (path: string) => void;
  onInsertImage: (path: string) => void;
  onReveal: (path: string) => void;
  onOpenExternal: (path: string) => void;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv']);

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePreview({ path, onClose, onOpenText, onInsertImage, onReveal, onOpenExternal }: Props) {
  const { t } = useI18n();
  const [stat, setStat] = useState<{ size: number; modified: number; name: string; ext: string; directory: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const ext = stat?.ext || extname(path);
  const name = stat?.name || basename(path);
  const url = assetUrl(path);

  useEffect(() => {
    let cancelled = false;
    setStat(null);
    setError(null);
    setDimensions(null);
    setZoom(1);
    window.texpro
      .statFile(path)
      .then((next) => {
        if (!cancelled) setStat(next);
      })
      .catch((failure) => {
        if (!cancelled) setError(String(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isPdf = ext === '.pdf';
  const isAudio = AUDIO_EXTENSIONS.has(ext);
  const isVideo = VIDEO_EXTENSIONS.has(ext);
  const isArchive = ['.zip', '.tar', '.gz', '.7z', '.rar'].includes(ext);
  const isText = ['.tex', '.ltx', '.bib', '.sty', '.cls', '.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.lua', '.cfg'].includes(ext);

  useEffect(() => {
    if (!isImage) return;
    const image = new Image();
    image.onload = () => setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
    return () => {
      image.onload = null;
    };
  }, [isImage, url]);

  return (
    <section className="file-preview">
      <header className="file-preview-header">
        <div className="file-preview-title">
          {isImage ? <FileImage size={14} /> : isPdf ? <FileText size={14} /> : isAudio ? <Music size={14} /> : isVideo ? <Video size={14} /> : isArchive ? <FileArchive size={14} /> : <File size={14} />}
          <span>{name}</span>
          <span className="file-preview-ext">{ext.replace('.', '').toUpperCase() || t('FILE')}</span>
          {stat && <span className="file-preview-size">{formatBytes(stat.size)}</span>}
          {dimensions && <span className="file-preview-size">{dimensions.width} × {dimensions.height}</span>}
        </div>
        <div className="file-preview-actions">
          {isImage && (
            <>
              <button className="icon-btn" onClick={() => setZoom((value) => Math.max(0.25, value - 0.15))} title={t('Zoom out')}><Minus size={13} /></button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="icon-btn" onClick={() => setZoom((value) => Math.min(4, value + 0.15))} title={t('Zoom in')}><Plus size={13} /></button>
              <button className="icon-btn" onClick={() => setZoom(1)} title={t('Actual size')}><Maximize2 size={13} /></button>
              <button className="icon-btn" onClick={() => onInsertImage(path)} title={t('Insert into document')}><ImagePlus size={14} /></button>
            </>
          )}
          {isText && <button className="secondary-btn small" onClick={() => onOpenText(path)}><FileText size={12} /> {t('Edit text')}</button>}
          <button className="icon-btn" onClick={() => onReveal(path)} title={t('Reveal in Finder')}><FolderOpen size={14} /></button>
          <button className="icon-btn" onClick={() => onOpenExternal(path)} title={t('Open with default app')}><ExternalLink size={14} /></button>
          <button className="icon-btn" data-testid="close-preview"
          onClick={onClose}
          title={t('Close preview')}><X size={15} /></button>
        </div>
      </header>

      <div className="file-preview-body">
        {!stat && !error && <div className="file-preview-loading"><Loader2 size={18} className="spin" /> {t('Reading file…')}</div>}
        {error && <div className="file-preview-unknown"><strong>{t('Could not preview this file')}</strong><p>{error}</p></div>}
        {stat && isImage && (
          <div className="image-preview-stage">
            <img src={url} alt={name} style={{ transform: `scale(${zoom})` }} />
          </div>
        )}
        {stat && isPdf && (
          <iframe className="pdf-file-preview" src={url} title={name} />
        )}
        {stat && isAudio && (
          <div className="media-preview">
            <Music size={32} />
            <audio controls src={url} />
          </div>
        )}
        {stat && isVideo && (
          <div className="media-preview">
            <video controls src={url} />
          </div>
        )}
        {stat && !isImage && !isPdf && !isAudio && !isVideo && (
          <div className="file-preview-unknown">
            {isArchive ? <FileArchive size={38} /> : <File size={38} />}
            <strong>{isArchive ? t('Archive file') : t('No inline preview for this format')}</strong>
            <p>{name}</p>
            <div className="file-preview-meta">
              <span>{formatBytes(stat.size)}</span>
              <span>{new Date(stat.modified).toLocaleString()}</span>
              <span>{path}</span>
            </div>
            <div className="file-preview-buttons">
              {isText && <button className="primary-btn" onClick={() => onOpenText(path)}>{t('Edit text')}</button>}
              <button className="secondary-btn" onClick={() => onOpenExternal(path)}>{t('Open with default app')}</button>
              <button className="secondary-btn" onClick={() => onReveal(path)}>{t('Reveal in Finder')}</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
