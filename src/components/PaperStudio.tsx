import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, Clipboard, FileJson, Gavel, Loader2, Play, Server, Square, X } from 'lucide-react';
import { basename } from '../lib/latex';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  projectRoot: string | null;
  onClose: () => void;
  onJump: (file: string, line: number) => void;
}

interface ReviewIssue { severity: 'error' | 'warning' | 'info'; title: string; detail: string; file: string; line: number }

export function PaperStudio({ open, projectRoot, onClose, onJump }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'api' | 'referee'>('referee');
  const [api, setApi] = useState<{ baseUrl: string; token: string; port: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<ReviewIssue[]>([]);
  const [report, setReport] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    void window.texpro.paperApiStatus().then((result) => { if (result.running && result.baseUrl && result.token && result.port) setApi({ baseUrl: result.baseUrl, token: result.token, port: result.port }); }).catch(() => undefined);
  }, [open]);

  if (!open) return null;

  const startApi = async () => {
    if (!projectRoot || busy) return;
    setBusy(true);
    try {
      const result = await window.texpro.startPaperApi(projectRoot);
      setApi(result);
      setNotice(t('Paper API is live'));
    } catch (error) {
      setNotice(String(error));
    } finally { setBusy(false); }
  };

  const stopApi = async () => {
    await window.texpro.stopPaperApi();
    setApi(null);
    setNotice(t('Paper API stopped'));
  };

  const runReview = async () => {
    if (!projectRoot || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const [diagnosis, graph, symbols, todos] = await Promise.all([
        window.texpro.diagnoseProject(projectRoot),
        window.texpro.projectGraph(projectRoot),
        window.texpro.projectSymbols(projectRoot),
        window.texpro.searchProject(projectRoot, 'TODO', false),
      ]);
      const next: ReviewIssue[] = diagnosis.issues.map((issue) => ({ severity: issue.severity, title: issue.kind || t('Project issue'), detail: issue.message, file: issue.file, line: issue.line }));
      for (const node of graph.nodes.filter((item) => item.orphan)) next.push({ severity: 'warning', title: node.type === 'label' ? t('Orphan label') : t('Orphan citation'), detail: node.label, file: node.file, line: node.line });
      for (const result of todos) next.push({ severity: 'info', title: 'TODO', detail: result.text.trim(), file: result.file, line: result.line });
      if (!symbols.labels.length) next.push({ severity: 'warning', title: t('No labels'), detail: t('No labels were found; cross-references may be fragile.'), file: '', line: 0 });
      setIssues(next);
      const lines = ['# Referee report', '', `${t('Project')}: ${projectRoot}`, `${t('Issues')}: ${next.length}`, ''];
      for (const issue of next) lines.push(`- **[${issue.severity}] ${issue.title}** — ${issue.detail}${issue.file ? ` (${basename(issue.file)}:${issue.line})` : ''}`);
      setReport(lines.join('\n'));
    } catch (error) {
      setNotice(String(error));
    } finally { setBusy(false); }
  };

  const copyReport = async () => {
    await navigator.clipboard?.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const endpoints = ['/v1/project', '/v1/symbols', '/v1/diagnostics', '/v1/assets', '/v1/graph'];
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="paper-studio" data-testid="paper-studio" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon">{tab === 'api' ? <FileJson size={18} /> : <Gavel size={18} />}</div>
            <div><span className="modal-eyebrow">{t('Research')}</span><h2>{tab === 'api' ? t('Paper as API') : t('Referee mode')}</h2></div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok">{issues.length} {t('findings')}</span>
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </header>
        <div className="paper-tabs">
          <button className={tab === 'referee' ? 'active' : ''} onClick={() => setTab('referee')}><Gavel size={12} /> {t('Referee mode')}</button>
          <button className={tab === 'api' ? 'active' : ''} onClick={() => setTab('api')}><FileJson size={12} /> {t('Paper as API')}</button>
        </div>

        {tab === 'api' ? (
          <div className="paper-api-body">
            <div className="paper-api-card">
              <div className="pane-label"><Server size={12} /> {t('Local read-only API')}</div>
              <p className="schematic-hint">{t('Expose the paper structure to local agents and scripts. The server binds to 127.0.0.1 and requires a bearer token.')}</p>
              {api ? (
                <>
                  <div className="paper-api-live"><Check size={13} /><span>{api.baseUrl}</span><button className="mini-btn" onClick={() => void navigator.clipboard?.writeText(`${api.baseUrl}\n${api.token}`)}><Clipboard size={11} /></button></div>
                  <div className="paper-token">{t('Bearer token')}<code>{api.token}</code></div>
                  <button className="danger-btn" onClick={() => void stopApi()}><Square size={11} /> {t('Stop API')}</button>
                </>
              ) : (
                <button className="primary-btn" onClick={() => void startApi()} disabled={!projectRoot || busy}>{busy ? <Loader2 size={12} className="spin" /> : <Play size={12} />} {t('Start local API')}</button>
              )}
              {notice && <div className="collab-notice">{notice}</div>}
            </div>
            <div className="paper-api-card">
              <div className="pane-label"><FileJson size={12} /> {t('Endpoints')}</div>
              {endpoints.map((endpoint) => <div key={endpoint} className="paper-endpoint"><code>{endpoint}</code><span>{t(endpoint === '/v1/project' ? 'Project metadata and files' : endpoint === '/v1/symbols' ? 'Labels, citations, environments, packages' : endpoint === '/v1/diagnostics' ? 'Build tool and reference diagnostics' : endpoint === '/v1/assets' ? 'Images and PDF assets' : 'Citation and label relationship graph')}</span></div>)}
            </div>
          </div>
        ) : (
          <div className="referee-body">
            <aside className="referee-summary">
              <div className="pane-label"><Gavel size={12} /> {t('Referee mode')}</div>
              <p className="schematic-hint">{t('A deterministic first pass over labels, citations, TODOs and project diagnostics. It reports; it does not edit.')}</p>
              <div className="referee-counts">
                <span className="error"><AlertCircle size={12} /> {issues.filter((item) => item.severity === 'error').length} {t('errors')}</span>
                <span className="warning"><AlertTriangle size={12} /> {issues.filter((item) => item.severity === 'warning').length} {t('warnings')}</span>
                <span>{issues.filter((item) => item.severity === 'info').length} {t('notes')}</span>
              </div>
              <button className="primary-btn" onClick={() => void runReview()} disabled={!projectRoot || busy}>{busy ? <Loader2 size={12} className="spin" /> : <Play size={12} />} {busy ? t('Reviewing…') : t('Run review')}</button>
              {report && <button className="secondary-btn" onClick={() => void copyReport()}>{copied ? <Check size={12} /> : <Clipboard size={12} />} {copied ? t('Copied') : t('Copy report')}</button>}
              {notice && <div className="collab-notice">{notice}</div>}
            </aside>
            <main className="referee-main">
              <div className="referee-intro"><span className="theater-kicker">{t('Referee mode')}</span><h3>{t('What would a careful reviewer question?')}</h3></div>
              <div className="referee-list">
                {issues.map((issue, index) => (
                  <button key={index} className={`referee-issue ${issue.severity}`} onClick={() => issue.file && onJump(issue.file, issue.line || 1)}>
                    {issue.severity === 'error' ? <AlertCircle size={13} /> : issue.severity === 'warning' ? <AlertTriangle size={13} /> : <Gavel size={12} />}
                    <div><strong>{issue.title}</strong><span>{issue.detail}</span><small>{issue.file ? `${basename(issue.file)}${issue.line ? `:${issue.line}` : ''}` : ''}</small></div>
                  </button>
                ))}
                {!issues.length && <div className="referee-empty"><Gavel size={24} /><span>{t('Run review to surface the questions a referee would ask.')}</span></div>}
              </div>
            </main>
          </div>
        )}
        <footer className="studio-footer">
          <span className="studio-hint">{t('The API is read-only. Referee Mode reports issues for the author to decide.')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={onClose}>{t('Done')}</button>
        </footer>
      </section>
    </div>
  );
}
