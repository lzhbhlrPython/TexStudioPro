import { useMemo } from 'react';
import { AlertCircle, AlertTriangle, Check, ChevronRight, Clapperboard, Clock3, FileCode2, Loader2, Play, Terminal, X } from 'lucide-react';
import type { CompileResult, Diagnostic } from '../types';
import { basename, formatDuration } from '../lib/latex';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  compileResult: CompileResult | null;
  compiling: boolean;
  diagnostics: Diagnostic[];
  log: string;
  onClose: () => void;
  onCompile: () => void;
  onJump: (diagnostic: Diagnostic) => void;
}

export function CompileTheater({ open, compileResult, compiling, diagnostics, log, onClose, onCompile, onJump }: Props) {
  const { t } = useI18n();
  const errors = diagnostics.filter((item) => item.severity === 'error');
  const warnings = diagnostics.filter((item) => item.severity === 'warning');
  const ok = Boolean(compileResult?.ok);
  const timeline = useMemo(() => {
    const engine = compileResult?.engine || (compiling ? t('Detecting engine') : '—');
    return [
      { id: 'engine', label: t('Engine and root file'), detail: engine, state: compiling ? 'active' : compileResult ? 'done' : 'idle' },
      { id: 'compile', label: t('LaTeX compilation'), detail: compiling ? t('Running…') : compileResult ? formatDuration(compileResult.duration) : '—', state: compiling ? 'active' : compileResult ? (ok ? 'done' : 'failed') : 'idle' },
      { id: 'diagnostics', label: t('Diagnostics'), detail: `${errors.length} ${t('errors')} · ${warnings.length} ${t('warnings')}`, state: compileResult ? (errors.length ? 'failed' : 'done') : 'idle' },
      { id: 'pdf', label: t('PDF handoff'), detail: compileResult?.pdfPath ? basename(compileResult.pdfPath) : '—', state: compileResult?.pdfPath ? 'done' : (compileResult ? 'failed' : 'idle') },
    ] as const;
  }, [compileResult, compiling, errors.length, warnings.length, ok, t]);

  if (!open) return null;
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="compile-theater" data-testid="compile-theater" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Clapperboard size={18} /></div>
            <div><span className="modal-eyebrow">{t('Build')}</span><h2>{t('Compile theater')}</h2></div>
          </div>
          <div className="studio-header-actions">
            <span className={`studio-engine ${ok ? 'ok' : compileResult ? 'failed' : ''}`}>{compiling ? <Loader2 size={11} className="spin" /> : ok ? <Check size={11} /> : <Terminal size={11} />}{compiling ? t('Running') : ok ? t('Passed') : compileResult ? t('Needs attention') : t('No build yet')}</span>
            <button className="icon-btn" onClick={onClose} aria-label={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="theater-body">
          <aside className="theater-timeline">
            <div className="pane-label"><Clock3 size={12} /> {t('Build timeline')}</div>
            {timeline.map((stage, index) => (
              <div key={stage.id} className={`theater-stage ${stage.state}`}>
                <span className="theater-stage-index">{stage.state === 'done' ? <Check size={10} /> : stage.state === 'failed' ? <AlertCircle size={10} /> : index + 1}</span>
                <div><strong>{stage.label}</strong><small>{stage.detail}</small></div>
              </div>
            ))}
            <div className="theater-actions">
              <button className="primary-btn" onClick={onCompile} disabled={compiling}><Play size={12} /> {compiling ? t('Compiling…') : t('Compile again')}</button>
            </div>
          </aside>

          <main className="theater-main">
            <div className="theater-headline">
              <div>
                <span className="theater-kicker">{compileResult ? (ok ? t('Last build passed') : t('Last build failed')) : t('Nothing compiled yet')}</span>
                <h3>{compileResult ? `${formatDuration(compileResult.duration)} · ${compileResult.engine || 'latex'}` : t('A clean build starts here')}</h3>
              </div>
              <div className="theater-counts">
                <span className="theater-count error"><AlertCircle size={12} /> {errors.length}</span>
                <span className="theater-count warning"><AlertTriangle size={12} /> {warnings.length}</span>
              </div>
            </div>

            <div className="theater-diagnostics">
              {errors.map((diagnostic, index) => (
                <button key={`${diagnostic.file}-${diagnostic.line}-${index}`} className="theater-error" onClick={() => onJump(diagnostic)}>
                  <span className="theater-error-icon"><AlertCircle size={14} /></span>
                  <span className="theater-error-copy">
                    <strong>{diagnostic.message}</strong>
                    <small>{diagnostic.file ? basename(diagnostic.file) : t('Project')}{diagnostic.line ? `:${diagnostic.line}` : ''}</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
              {!errors.length && compileResult && (
                <div className="theater-clear"><Check size={22} /><strong>{t('No errors in this build')}</strong><span>{warnings.length ? `${warnings.length} ${t('warnings to review')}` : t('The document is ready.')}</span></div>
              )}
              {!compileResult && !compiling && (
                <div className="theater-clear"><FileCode2 size={22} /><strong>{t('Compile to inspect the whole pipeline')}</strong><span>{t('Engine, diagnostics and PDF are collected into one place.')}</span></div>
              )}
            </div>

            {compileResult && (
              <details className="theater-log">
                <summary><Terminal size={12} /> {t('Build log')}</summary>
                <pre>{log || compileResult.log || t('No log captured.')}</pre>
              </details>
            )}
          </main>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('A build is a story: engine, run, diagnosis, PDF.')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={onCompile} disabled={compiling}>{t('Run')}</button>
          <button className="primary-btn" onClick={onClose}>{t('Done')}</button>
        </footer>
      </section>
    </div>
  );
}
