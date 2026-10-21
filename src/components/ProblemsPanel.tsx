import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Terminal,
  X,
} from 'lucide-react';
import type { CompileResult, Diagnostic } from '../types';
import { basename, formatDuration } from '../lib/latex';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  compiling: boolean;
  diagnostics: Diagnostic[];
  compileResult: CompileResult | null;
  log: string;
  onToggle: () => void;
  onDiagnosticClick: (diagnostic: Diagnostic) => void;
}

function severityIcon(severity: Diagnostic['severity']) {
  if (severity === 'error') return <AlertCircle size={13} className="error-icon" />;
  if (severity === 'warning') return <AlertTriangle size={13} className="warning-icon" />;
  return <Info size={13} className="info-icon" />;
}

export function ProblemsPanel({
  open,
  compiling,
  diagnostics,
  compileResult,
  log,
  onToggle,
  onDiagnosticClick,
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'problems' | 'log'>('problems');
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, tab]);

  useEffect(() => {
    if (compileResult && !compileResult.ok) setTab('problems');
  }, [compileResult]);

  const errors = diagnostics.filter((item) => item.severity === 'error').length;
  const warnings = diagnostics.filter((item) => item.severity === 'warning').length;
  const visible = diagnostics.filter((item) => (filter === 'all' ? true : item.severity === filter));

  if (!open) {
    return (
      <div className="problems-collapsed">
        <button className="problems-toggle" onClick={onToggle}>
          <Terminal size={12} />
          <span>{t('Problems')}</span>
          {errors > 0 && <span className="count-pill error">{errors}</span>}
          {warnings > 0 && <span className="count-pill warning">{warnings}</span>}
          {!compiling && compileResult?.ok && <CheckCircle2 size={12} className="success-text" />}
          <ChevronUp size={12} />
        </button>
      </div>
    );
  }

  return (
    <section className="problems-panel">
      <header className="problems-header">
        <div className="problems-tabs">
          <button className={tab === 'problems' ? 'active' : ''} onClick={() => setTab('problems')}>
            {t('Problems')}
            {errors > 0 && <span className="count-pill error">{errors}</span>}
            {warnings > 0 && <span className="count-pill warning">{warnings}</span>}
          </button>
          <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
            {t('Compile log')}
            {compiling && <Loader2 size={11} className="spin" />}
          </button>
        </div>
        <div className="problems-actions">
          {tab === 'problems' && (
            <div className="filter-chips">
              {(['all', 'error', 'warning'] as const).map((value) => (
                <button
                  key={value}
                  className={filter === value ? 'active' : ''}
                  onClick={() => setFilter(value)}
                >
                  {value === 'all' ? t('All') : value === 'error' ? t('Errors') : t('Warnings')}
                </button>
              ))}
            </div>
          )}
          {compileResult && !compiling && (
            <span className={`compile-summary ${compileResult.ok ? 'ok' : 'failed'}`}>
              {compileResult.ok
                ? t('Compiled in {duration}', { duration: formatDuration(compileResult.duration) })
                : compileResult.error || t('n errors', { n: errors })}
            </span>
          )}
          <button className="icon-btn" onClick={onToggle} title={t('Collapse panel')}>
            <ChevronDown size={14} />
          </button>
          <button className="icon-btn" onClick={onToggle} title={t('Close')}>
            <X size={13} />
          </button>
        </div>
      </header>

      {tab === 'problems' ? (
        <div className="problems-list">
          {compiling && (
            <div className="problem-empty">
              <Loader2 size={15} className="spin" />
              <span>{t('Compiling… diagnostics will appear here.')}</span>
            </div>
          )}
          {!compiling && visible.length === 0 && (
            <div className="problem-empty success">
              <CheckCircle2 size={16} />
              <span>{diagnostics.length === 0 ? t('No problems found.') : t('No problems match this filter.')}</span>
            </div>
          )}
          {!compiling &&
            visible.map((diagnostic, index) => (
              <button
                key={`${diagnostic.message}-${index}`}
                className="problem-row"
                onClick={() => onDiagnosticClick(diagnostic)}
                title={diagnostic.file}
              >
                {severityIcon(diagnostic.severity)}
                <span className="problem-message">{diagnostic.message}</span>
                <span className="problem-location">
                  {diagnostic.file ? basename(diagnostic.file) : ''}
                  {diagnostic.line ? `:${diagnostic.line}` : ''}
                </span>
              </button>
            ))}
        </div>
      ) : (
        <pre className="compile-log" ref={logRef}>
          {log || t('Compile output will appear here.')}
        </pre>
      )}
    </section>
  );
}
