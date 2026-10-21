import { useState } from 'react';
import { CheckCircle2, FolderOpen, Package, RefreshCw, X } from 'lucide-react';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  projectRoot: string | null;
  onClose: () => void;
  onOpen: (path: string) => void;
  onReveal: (path: string) => void;
}

export function ArxivPanel({ open, projectRoot, onClose, onOpen, onReveal }: Props) {
  const { t } = useI18n();
  const [result, setResult] = useState<{ zipPath: string; files: number; engine: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const create = async () => {
    if (!projectRoot || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await window.texpro.createArxivPackage(projectRoot);
      setResult(next);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="arxiv-studio" data-testid="arxiv-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Package size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Submission')}</span>
              <h2>{t('arXiv package')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok"><Package size={11} /> .zip</span>
            <button className="icon-btn" onClick={onClose} title={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="arxiv-body">
          <div className="arxiv-icon"><Package size={42} /></div>
          <h3>{t('Create an arXiv-ready source archive')}</h3>
          <p>{t('The package keeps the source tree and assets, removes build files and auxiliary files, and copies the detected root to main.tex when needed.')}</p>
          <ul className="arxiv-list">
            <li>{t('Excludes .texpro, build products, logs, aux and SyncTeX files')}</li>
            <li>{t('Keeps assets, .bib files and included .tex files')}</li>
            <li>{t('Adds a README with root file and detected engine')}</li>
          </ul>
          {error && <div className="ai-error">{error}</div>}
          {result && (
            <div className="arxiv-result">
              <CheckCircle2 size={18} />
              <div>
                <strong>{t('Package created')}</strong>
                <span>{result.files} {t('files')} · {result.engine} · {(result.size / 1024).toFixed(1)} KB</span>
                <code>{result.zipPath}</code>
              </div>
            </div>
          )}
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('Review the generated zip before uploading it to arXiv.')}</span>
          <div className="spacer" />
          {result && <button className="secondary-btn" onClick={() => onReveal(result.zipPath)}><FolderOpen size={12} /> {t('Reveal')}</button>}
          {result && <button className="secondary-btn" onClick={() => onOpen(result.zipPath)}>{t('Open zip')}</button>}
          <button className="secondary-btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="primary-btn" onClick={() => void create()} disabled={!projectRoot || busy}>
            <RefreshCw size={12} className={busy ? 'spin' : ''} /> {result ? t('Rebuild package') : t('Create package')}
          </button>
        </footer>
      </section>
    </div>
  );
}
