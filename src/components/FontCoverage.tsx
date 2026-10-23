import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, RefreshCw, Type, X, XCircle } from 'lucide-react';
import { basename } from '../lib/latex';
import { useI18n } from '../i18n';

interface Report {
  scripts: Record<string, number>;
  declared: string[];
  fontChecks: Array<{ name: string; resolved: string; ok: boolean }>;
  pdfFonts: Array<{ name: string; type: string; embedded: boolean; unicode: boolean }>;
  issues: Array<{ severity: string; message: string; file: string; line: number }>;
  pdfPath: string | null;
}

const SCRIPT_LABELS: Record<string, string> = {
  latin: 'Latin', cjk: 'CJK', greek: 'Greek', cyrillic: 'Cyrillic', arabic: 'Arabic', hebrew: 'Hebrew',
};

export function FontCoverage({ open, projectRoot, onClose, onOpen }: {
  open: boolean;
  projectRoot: string | null;
  onClose: () => void;
  onOpen: (path: string) => void;
}) {
  const { t } = useI18n();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const scan = async () => {
    if (!projectRoot) return;
    setLoading(true);
    setError('');
    try {
      setReport(await window.texpro.fontCoverage(projectRoot));
    } catch (failure) {
      setError(String(failure));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) void scan(); }, [open, projectRoot]);

  if (!open) return null;

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="font-studio" data-testid="font-coverage" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Type size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Project health')}</span>
              <h2>{t('Font coverage')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <button className="secondary-btn" onClick={() => void scan()} disabled={loading}><RefreshCw size={12} className={loading ? 'spin' : ''} /> {t('Re-scan')}</button>
            <button className="icon-btn" onClick={onClose} aria-label={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="font-body">
          <div className="font-column">
            <div className="pane-label"><Type size={12} /> {t('Detected scripts')}</div>
            <div className="font-scripts">
              {Object.entries(report?.scripts || {}).map(([name, count]) => (
                <div className={`font-script ${count > 0 ? 'present' : ''}`} key={name}>
                  <strong>{count}</strong>
                  <span>{t(SCRIPT_LABELS[name] || name)}</span>
                  {count > 0 ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                </div>
              ))}
            </div>
            <div className="pane-label">{t('Declared fonts')}</div>
            <div className="font-list">
              {report?.fontChecks.map((font) => (
                <div className="font-row" key={font.name}>
                  {font.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  <strong>{font.name}</strong>
                  <span>{font.resolved}</span>
                </div>
              ))}
              {report && !report.fontChecks.length && <div className="panel-empty">{t('No explicit font commands found.')}</div>}
            </div>
          </div>

          <div className="font-column">
            <div className="pane-label"><FileText size={12} /> {t('PDF fonts')}<span className="pane-hint">{report?.pdfFonts.length || 0}</span></div>
            <div className="font-list">
              {report?.pdfFonts.map((font) => (
                <div className="font-row" key={font.name + font.type}>
                  {font.embedded ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  <strong>{font.name}</strong>
                  <span>{font.type} · {font.embedded ? t('embedded') : t('not embedded')}{font.unicode ? ' · Unicode' : ''}</span>
                </div>
              ))}
              {report && !report.pdfFonts.length && <div className="panel-empty">{t('Compile once to inspect embedded PDF fonts.')}</div>}
            </div>
            <div className="pane-label">{t('Issues')}</div>
            <div className="font-issues">
              {report?.issues.map((issue, index) => (
                <div className={`font-issue ${issue.severity}`} key={index}>
                  <strong>{issue.message}</strong>
                  {issue.file && <small>{basename(issue.file)}:{issue.line}</small>}
                </div>
              ))}
              {report && !report.issues.length && <div className="doctor-clean"><CheckCircle2 size={22} /><strong>{t('No font issues found')}</strong></div>}
            </div>
          </div>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('Font checks combine source scripts, declared font commands and embedded PDF fonts.')}</span>
          <div className="spacer" />
          {report?.pdfPath && <button className="secondary-btn" onClick={() => onOpen(report.pdfPath!)}>{t('Open PDF')}</button>}
          <button className="primary-btn" onClick={onClose}>{t('Done')}</button>
        </footer>
      </section>
    </div>
  );
}
