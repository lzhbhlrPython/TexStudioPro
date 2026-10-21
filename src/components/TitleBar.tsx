import { useState } from 'react';
import {
  Check,
  ChevronDown,
  FileText,
  Loader2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Play,
  Square,
} from 'lucide-react';
import type { CompileResult, OpenDoc, Project, Settings } from '../types';
import { Logo } from './Logo';
import { formatDuration } from '../lib/latex';
import { useI18n } from '../i18n';
import { MoreMenu, type MoreAction } from './MoreMenu';

interface Props {
  project: Project | null;
  doc: OpenDoc | null;
  settings: Settings;
  compiling: boolean;
  compileResult: CompileResult | null;
  hasPdf: boolean;
  sidebarOpen: boolean;
  pdfOpen: boolean;
  moreActions: MoreAction[];
  onCompile: () => void;
  onCancel: () => void;
  onToggleSidebar: () => void;
  onTogglePdf: () => void;
  onOpenFolder: () => void;
}

export function TitleBar({
  project,
  doc,
  settings,
  compiling,
  compileResult,
  hasPdf,
  sidebarOpen,
  pdfOpen,
  moreActions,
  onCompile,
  onCancel,
  onToggleSidebar,
  onTogglePdf,
  onOpenFolder,
}: Props) {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const fileName = doc?.path.split('/').pop() || t('No document');

  return (
    <header className="titlebar minimal-titlebar">
      <div className="titlebar-left">
        <button className="brand" onClick={onOpenFolder} title={t('Open project (⌘O)')}>
          <Logo size={22} />
        </button>
        <button
          className={`icon-btn ${sidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title={t('Toggle sidebar')}
        >
          <PanelLeft size={15} />
        </button>
        <div className="titlebar-document">
          <div className="titlebar-file-row">
            <FileText size={12} className="titlebar-file-icon" />
            <span className="titlebar-file-name">{fileName}</span>
            {doc?.dirty && <span className="dirty-dot" title={t('Unsaved changes')} />}
          </div>
          {project && (
            <button className="titlebar-project" onClick={onOpenFolder} title={t('Switch project')}>
              {project.name}
              <ChevronDown size={10} />
            </button>
          )}
        </div>
      </div>

      <div className="titlebar-right">
        <div className="compile-status" title={compileResult?.error || undefined}>
          {compiling ? (
            <>
              <Loader2 size={11} className="spin" />
              <span>{t('Typesetting')}</span>
            </>
          ) : compileResult ? (
            <>
              <Check size={11} className={compileResult.ok ? 'success-text' : 'danger-text'} />
              <span>{compileResult.ok ? formatDuration(compileResult.duration) : t('Compile failed')}</span>
            </>
          ) : hasPdf ? (
            <span className="muted">{t('PDF preview')}</span>
          ) : null}
        </div>

        <button
          data-testid="toggle-pdf"
          className={`icon-btn ${pdfOpen ? 'active' : ''}`}
          onClick={onTogglePdf}
          title={t('Toggle PDF preview')}
        >
          <PanelRight size={15} />
        </button>

        <button
          className={`compile-btn subtle-compile ${compiling ? 'cancel-build' : ''}`}
          onClick={compiling ? onCancel : onCompile}
          disabled={!project}
          title={compiling ? t('Cancel compilation') : t('Compile (⌘↩)')}
        >
          {compiling ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          <span>{compiling ? t('Cancel') : t('Compile')}</span>
        </button>

        <button
          className={`icon-btn ${moreOpen ? 'active' : ''}`}
          data-testid="more-menu"
          onClick={() => setMoreOpen((value) => !value)}
          title={t('More')}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      <MoreMenu open={moreOpen} actions={moreActions} onClose={() => setMoreOpen(false)} />
    </header>
  );
}
