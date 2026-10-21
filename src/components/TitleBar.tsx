import { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Play,
  Square,
  Search,
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
  onCloseProject: () => void;
  onOpenMain: () => void;
  onShowProblems: () => void;
  onOpenPalette: () => void;
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
  onCloseProject,
  onOpenMain,
  onShowProblems,
  onOpenPalette,
}: Props) {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const fileName = doc?.path.split('/').pop() || t('No document');

  return (
    <header className="titlebar minimal-titlebar">
      <div className="titlebar-left">
        <button className="brand" onClick={project ? onCloseProject : onOpenFolder} title={t(project ? 'Close project and return to Welcome' : 'Open project (⌘O)')} aria-label={t(project ? 'Close project and return to Welcome' : 'Open project (⌘O)')}>
          <Logo size={22} />
        </button>
        {project && <button
          className={`icon-btn ${sidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title={t('Toggle sidebar')}
          aria-label={t('Toggle sidebar')}
        >
          <PanelLeft size={15} />
        </button>}
        <div className="titlebar-document">
          <div className="titlebar-file-row">
            <FileText size={12} className="titlebar-file-icon" />
            <span className="titlebar-file-name">{project ? fileName : t('Your writing desk')}</span>
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
        {project && <button className={`titlebar-main-file ${project.rootFile ? '' : 'needs-selection'}`} onClick={onOpenMain} title={project.rootFile || t('Choose main file')}>
          <span>{t('Main file')}</span><strong>{project.rootFile?.slice(project.root.length + 1) || t('Choose main file')}</strong>
        </button>}
        <button className="workbench-tools-btn" onClick={onOpenPalette} title={t('Search tools (⌘K)')} aria-keyshortcuts="Meta+k Control+k">
          <Search size={14} /><span>{t('Tools')}</span><kbd>⌘K</kbd>
        </button>
        {project && (compiling ? (
          <div className="compile-status">
            <Loader2 size={11} className="spin" />
            <span>{t('Typesetting')}</span>
          </div>
        ) : compileResult && !compileResult.ok ? (
          <button className="compile-status compile-status-error" onClick={onShowProblems} title={compileResult.error || undefined}>
            <AlertCircle size={11} />
            <span>{t('Compile failed')}{compileResult.errorCount ? ` · ${compileResult.errorCount}` : ''}</span>
          </button>
        ) : (
          <button className="compile-status" onClick={onShowProblems} title={t('Show build diagnostics')} aria-label={t('Show build diagnostics')}>
            {compileResult ? (
              <>
                <Check size={11} className="success-text" />
                <span>{formatDuration(compileResult.duration)}{compileResult.warningCount ? ` · ${compileResult.warningCount} ${t('warnings')}` : ''}</span>
              </>
            ) : hasPdf ? (
              <span className="muted">{t('PDF preview')}</span>
            ) : null}
          </button>
        ))}

        {project && <button
          data-testid="toggle-pdf"
          className={`icon-btn ${pdfOpen ? 'active' : ''}`}
          onClick={onTogglePdf}
          title={t('Toggle PDF preview')}
          aria-label={t('Toggle PDF preview')}
        >
          <PanelRight size={15} />
        </button>}

        {project && <button
          className={`compile-btn subtle-compile ${compiling ? 'cancel-build' : ''}`}
          onClick={compiling ? onCancel : onCompile}
          disabled={!project}
          title={compiling ? t('Cancel compilation') : `${t('Compile main file · saves all changes')} · ${project?.rootFile?.split('/').pop() || t('Choose main file')} (⌘↩)`}
        >
          {compiling ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          <span>{compiling ? t('Cancel') : t('Compile')}</span>
        </button>}

        <button
          className={`icon-btn ${moreOpen ? 'active' : ''}`}
          data-testid="more-menu"
          onClick={(event) => { event.currentTarget.focus(); setMoreOpen((value) => !value); }}
          title={t('More')}
          aria-label={t('More')}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      <MoreMenu open={moreOpen} actions={moreActions} onClose={() => setMoreOpen(false)} />
    </header>
  );
}
