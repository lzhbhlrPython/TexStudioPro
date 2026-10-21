import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clipboard,
  FileCode2,
  FileInput,
  FilePlus2,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import {
  defaultImportOptions,
  detectImportFormat,
  markdownToLatex,
  typstToLatex,
  type ImportFormat,
  type ImportOptions,
} from '../lib/importers';
import { slugify } from '../lib/templates';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  hasProject: boolean;
  onClose: () => void;
  onInsert: (body: string, format: ImportFormat) => void;
  onCreate: (document: string, name: string, engine: 'pdflatex' | 'xelatex') => Promise<boolean>;
}

export function ImportStudio({ open, hasProject, onClose, onInsert, onCreate }: Props) {
  const { t } = useI18n();
  const [format, setFormat] = useState<ImportFormat>('markdown');
  const [source, setSource] = useState('');
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [options, setOptions] = useState<ImportOptions>(defaultImportOptions);
  const [name, setName] = useState('imported-document');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => {
    if (!source.trim()) return null;
    return format === 'typst' ? typstToLatex(source, options) : markdownToLatex(source, options);
  }, [source, format, options]);

  if (!open) return null;

  const chooseFile = async () => {
    const chosen = await window.texpro.chooseImportFile();
    if (!chosen) return;
    const nextFormat = detectImportFormat(chosen.name);
    setFormat(nextFormat);
    setSource(chosen.content);
    setFilePath(chosen.path);
    setFileName(chosen.name);
    setName(slugify(chosen.name.replace(/\.[^.]+$/, '')) || 'imported-document');
  };

  const create = async () => {
    if (!result || busy) return;
    setBusy(true);
    try {
      const ok = await onCreate(result.document, name || result.suggestedName, result.engine);
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard?.writeText(result.document);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="import-studio" data-testid="import-studio" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><FileInput size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Import')}</span>
              <h2>{t('Markdown / Typst → LaTeX')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok"><FileCode2 size={11} /> portable .tex</span>
            <button className="icon-btn" onClick={onClose} title={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="import-body">
          <div className="import-left">
            <div className="formula-editor-switch import-switch">
              <button className={format === 'markdown' ? 'active' : ''} onClick={() => setFormat('markdown')}>Markdown</button>
              <button className={format === 'typst' ? 'active' : ''} onClick={() => setFormat('typst')}>Typst</button>
            </div>

            <div className="import-file-row">
              <button className="secondary-btn" onClick={() => void chooseFile()}><Upload size={12} /> {t('Choose file')}</button>
              <span className="import-file-name" title={filePath || fileName}>{fileName || t('Paste text below')}</span>
            </div>

            <textarea
              className="import-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={format === 'markdown' ? '# Title\n\nWrite or paste Markdown…' : '= Title\n\nWrite or paste Typst…'}
              spellCheck={false}
            />

            <div className="import-options">
              <label><span>{t('Title')}</span><input value={options.title} onChange={(event) => setOptions({ ...options, title: event.target.value })} /></label>
              <label><span>{t('Author')}</span><input value={options.author} onChange={(event) => setOptions({ ...options, author: event.target.value })} /></label>
              <label><span>{t('Document class')}</span>
                <select value={options.documentClass} onChange={(event) => setOptions({ ...options, documentClass: event.target.value as ImportOptions['documentClass'] })}>
                  <option value="article">article</option>
                  <option value="ctexart">ctexart</option>
                </select>
              </label>
              <label><span>{t('File name')}</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
            </div>

            {result && result.warnings.length > 0 && (
              <div className="import-warnings">
                {result.warnings.slice(0, 4).map((warning, index) => <div key={index}>{warning}</div>)}
              </div>
            )}
          </div>

          <div className="import-right">
            <div className="import-preview-head">
              <span>{t('Generated LaTeX')}</span>
              <div className="spacer" />
              {result && <span className="studio-engine">{result.engine}</span>}
              <button className="mini-btn" onClick={() => void copy()} disabled={!result} title={t('Copy')}>
                {copied ? <Check size={12} /> : <Clipboard size={12} />}
              </button>
            </div>
            {result ? (
              <pre className="import-preview">{result.document}</pre>
            ) : (
              <div className="import-empty">
                <FileCode2 size={28} />
                <strong>{t('Import a Markdown or Typst file')}</strong>
                <p>{t('Headings, lists, tables, code, links, images and math are converted to ordinary LaTeX.')}</p>
              </div>
            )}
          </div>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">
            {hasProject ? t('Create a .tex file in the current project, or insert the body into the open document.') : t('Open a project to create a file; inserting still works in the current document.')}
          </span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="secondary-btn" disabled={!result} onClick={() => result && onInsert(result.body, format)}>
            <ArrowRight size={12} /> {t('Insert body')}
          </button>
          <button className="primary-btn" disabled={!result || !hasProject} onClick={() => void create()}>
            {busy ? <Loader2 size={13} className="spin" /> : <FilePlus2 size={13} />} {t('Create .tex file')}
          </button>
        </footer>
      </section>
    </div>
  );
}
