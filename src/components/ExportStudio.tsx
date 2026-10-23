import { useMemo, useState } from 'react';
import { Check, Clipboard, Download, FileCode2, FileText, X } from 'lucide-react';
import { exportLatex, type ExportFormat } from '../lib/exporters';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  source: string;
  name: string;
  onClose: () => void;
}

const formats: Array<{ id: ExportFormat; label: string; ext: string; icon: typeof FileText }> = [
  { id: 'markdown', label: 'Markdown', ext: 'md', icon: FileText },
  { id: 'typst', label: 'Typst', ext: 'typ', icon: FileCode2 },
  { id: 'html', label: 'HTML', ext: 'html', icon: FileCode2 },
];

export function ExportStudio({ open, source, name, onClose }: Props) {
  const { t } = useI18n();
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [copied, setCopied] = useState(false);
  const output = useMemo(() => exportLatex(source, format), [source, format]);
  const current = formats.find((item) => item.id === format) || formats[0];

  if (!open) return null;

  const copy = async () => {
    await navigator.clipboard?.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const download = () => {
    const blob = new Blob([output], { type: format === 'html' ? 'text/html' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(name || 'document').replace(/\.(tex|ltx)$/i, '')}.${current.ext}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="export-studio" data-testid="export-studio" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Download size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Export')}</span>
              <h2>{t('Export document')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok"><FileCode2 size={11} /> {t('Portable text')}</span>
            <button className="icon-btn" onClick={onClose} title={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="export-body">
          <aside className="export-side">
            <div className="pane-label">{t('Format')}</div>
            {formats.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={`export-format ${format === item.id ? 'active' : ''}`} onClick={() => setFormat(item.id)}>
                  <Icon size={14} />
                  <span>{item.label}</span>
                  <small>.{item.ext}</small>
                </button>
              );
            })}
            <p className="export-hint">{t('The LaTeX source is converted directly; unsupported macros are kept as text where possible.')}</p>
          </aside>
          <div className="export-preview-pane">
            <div className="workshop-preview-head"><span>{t('Preview')}</span></div>
            <pre className="export-preview">{output}</pre>
          </div>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('Markdown, Typst and standalone HTML are generated from the current document.')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={() => void copy()}>{copied ? <Check size={12} /> : <Clipboard size={12} />} {t('Copy')}</button>
          <button className="primary-btn" onClick={download}><Download size={13} /> {t('Download')}</button>
        </footer>
      </section>
    </div>
  );
}
