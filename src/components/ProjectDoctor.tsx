import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Stethoscope,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useI18n } from '../i18n';

interface Issue {
  severity: 'error' | 'warning';
  kind: string;
  message: string;
  file: string;
  line: number;
}

interface Report {
  tools: Array<{ name: string; ok: boolean; path: string; required: boolean }>;
  issues: Issue[];
  stats: { files: number; labels: number; refs: number; bibKeys: number; cites: number; packages: number; unusedLabels: number };
}

interface Props {
  open: boolean;
  projectRoot: string | null;
  buildDir: string;
  onClose: () => void;
  onOpenIssue: (file: string, line: number) => void;
  onCleanBuild: () => Promise<void>;
}

export function ProjectDoctor({ open, projectRoot, buildDir, onClose, onOpenIssue, onCleanBuild }: Props) {
  const { t } = useI18n();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!projectRoot) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await window.texpro.diagnoseProject(projectRoot));
    } catch (failure) {
      setError(String(failure));
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    if (open) void scan();
  }, [open, scan]);

  if (!open) return null;

  const errors = report?.issues.filter((issue) => issue.severity === 'error') || [];
  const warnings = report?.issues.filter((issue) => issue.severity === 'warning') || [];

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="doctor-studio" data-testid="project-doctor" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Stethoscope size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Project health')}</span>
              <h2>{t('TeX environment & project doctor')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <button className="secondary-btn" onClick={() => void scan()} disabled={loading}>
              {loading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} {t('Re-scan')}
            </button>
            <button className="icon-btn" onClick={onClose} title={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="doctor-body">
          <div className="doctor-column">
            <div className="pane-label"><Stethoscope size={12} /> {t('TeX tools')}</div>
            <div className="doctor-tools">
              {report?.tools.map((tool) => (
                <div className={`doctor-tool ${tool.ok ? 'ok' : tool.required ? 'bad' : 'warn'}`} key={tool.name}>
                  {tool.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  <strong>{tool.name}</strong>
                  <span>{tool.ok ? t('ready') : t('not found')}</span>
                </div>
              ))}
              {!report && loading && <div className="panel-empty"><Loader2 size={15} className="spin" /> {t('Checking TeX Live…')}</div>}
            </div>
            {report && !report.tools.find((tool) => tool.name === 'latexmk')?.ok && (
              <div className="doctor-setup">
                <strong>{t('MacTeX / TeX Live is required')}</strong>
                <p>{t('Install MacTeX or BasicTeX, then restart TeXPro so latexmk and SyncTeX are available.')}</p>
              </div>
            )}
            <div className="doctor-stats">
              <div><strong>{report?.stats.files ?? '—'}</strong><span>{t('source files')}</span></div>
              <div><strong>{report?.stats.labels ?? '—'}</strong><span>{t('labels')}</span></div>
              <div><strong>{report?.stats.bibKeys ?? '—'}</strong><span>{t('bib keys')}</span></div>
              <div><strong>{report?.stats.unusedLabels ?? '—'}</strong><span>{t('unused labels')}</span></div>
            </div>
          </div>

          <div className="doctor-column doctor-issues-column">
            <div className="pane-label">
              <AlertTriangle size={12} /> {t('Issues')}
              <span className="pane-hint">{errors.length} {t('errors')} · {warnings.length} {t('warnings')}</span>
            </div>
            {error && <div className="doctor-error">{error}</div>}
            <div className="doctor-issues">
              {report?.issues.map((issue, index) => (
                <button
                  key={`${issue.kind}-${issue.file}-${issue.line}-${index}`}
                  className={`doctor-issue ${issue.severity}`}
                  onClick={() => issue.file && onOpenIssue(issue.file, issue.line)}
                  disabled={!issue.file}
                >
                  {issue.severity === 'error' ? <XCircle size={12} /> : <AlertTriangle size={12} />}
                  <span>
                    <strong>{issue.message}</strong>
                    {issue.file && <small>{issue.file.split('/').pop()}:{issue.line}</small>}
                  </span>
                </button>
              ))}
              {report && !report.issues.length && (
                <div className="doctor-clean">
                  <CheckCircle2 size={26} />
                  <strong>{t('No project issues found')}</strong>
                  <p>{t('References, includes, images and labels look consistent.')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('Build artifacts are stored in {dir}', { dir: buildDir })}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={async () => { await onCleanBuild(); await scan(); }}><Trash2 size={12} /> {t('Clean build')}</button>
          <button className="primary-btn" onClick={onClose}>{t('Done')}</button>
        </footer>
      </section>
    </div>
  );
}
