import { AlertCircle, Check, Circle, Loader2 } from 'lucide-react';
import type { CompileResult, CursorInfo, Diagnostic } from '../types';
import { formatDuration } from '../lib/latex';
import { useI18n } from '../i18n';

interface Props {
  compileResult: CompileResult | null;
  compiling: boolean;
  cursor: CursorInfo;
  words: number;
  diagnostics: Diagnostic[];
  page: number;
  visual: boolean;
  focus: boolean;
  onProblems: () => void;
}

export function StatusBar({
  compileResult,
  compiling,
  cursor,
  words,
  diagnostics,
  page,
  visual,
  focus,
  onProblems,
}: Props) {
  const { t } = useI18n();
  const errors = diagnostics.filter((item) => item.severity === 'error').length;
  const warnings = diagnostics.filter((item) => item.severity === 'warning').length;
  return (
    <footer className="statusbar">
      <div className="status-left">
        {compiling ? (
          <span className="status-item accent">
            <Loader2 size={10} className="spin" /> {t('Typesetting')}
          </span>
        ) : compileResult ? (
          <span className={`status-item ${compileResult.ok ? 'ok' : 'failed'}`}>
            {compileResult.ok ? <Check size={10} /> : <AlertCircle size={10} />}
            {compileResult.ok ? `${t('PDF ready')} · ${formatDuration(compileResult.duration)}` : t('Compile failed')}
          </span>
        ) : (
          <span className="status-item muted"><Circle size={8} /> {t('Ready')}</span>
        )}
        <span className="status-item muted">{compileResult?.engine || 'pdfLaTeX'}</span>
        {compileResult?.ok && <span className="status-item muted">{t('SyncTeX on')}</span>}
      </div>
      <div className="status-center">
        <span>{t('Ln {line}, Col {col}', { line: cursor.line, col: cursor.column })}</span>
        {cursor.selected > 0 && <span>{t('n selected', { n: cursor.selected })}</span>}
        <span>{t('n words', { n: words.toLocaleString() })}</span>
      </div>
      <div className="status-right">
        <button className="status-button" onClick={onProblems}>
          {errors > 0 ? <AlertCircle size={10} className="error-text" /> : <Check size={10} className="success-text" />}
          {errors + warnings > 0 ? t('n problems', { n: errors + warnings }) : t('No problems')}
        </button>
        <span className="status-item muted">{visual ? t('Visual') : t('Source')}</span>
        {focus && <span className="status-item accent">{t('Focus')}</span>}
        <span className="status-item muted">p.{page}</span>
        <span className="status-item muted">UTF-8</span>
      </div>
    </footer>
  );
}
