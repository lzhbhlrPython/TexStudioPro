import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Command,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutTemplate,
  PenTool,
  Play,
  Settings2,
  Sparkles,
} from 'lucide-react';
import type { RecentProject } from '../types';
import { Logo } from './Logo';
import { useI18n } from '../i18n';

interface Props {
  recent: RecentProject[];
  onOpenFolder: () => void;
  onDemo: () => void;
  onOpenRecent: (project: RecentProject) => void;
  onTemplates: () => void;
  onOpenSettings: () => void;
  onPalette: () => void;
}

const quickTemplates = [
  { key: 'Article', icon: FileText },
  { key: 'Report', icon: BookOpen },
  { key: 'Beamer slides', icon: Play },
  { key: 'Chinese article (ctex)', icon: GraduationCap },
];

export function Welcome({
  recent,
  onOpenFolder,
  onDemo,
  onOpenRecent,
  onTemplates,
  onOpenSettings,
  onPalette,
}: Props) {
  const { t } = useI18n();
  return (
    <main className="start-page">
      <div className="start-inner">
        <header className="start-header">
          <div className="start-brand">
            <Logo size={34} />
            <div>
              <h1>{t('Start writing')}</h1>
              <p>{t('Visual LaTeX Workbench')} · TeXPro</p>
            </div>
          </div>
          <div className="start-actions">
            <button className="primary-btn" onClick={onTemplates}>
              <LayoutTemplate size={14} />
              {t('New from template')}
            </button>
            <button className="secondary-btn" onClick={onOpenFolder}>
              <FolderOpen size={14} />
              {t('Open folder')}
            </button>
            <button className="secondary-btn" onClick={onDemo}>
              <Sparkles size={14} />
              {t('Demo project')}
            </button>
          </div>
        </header>

        <div className="start-grid">
          <section className="start-main">
            <div className="start-section-head">
              <span>{t('Recent projects')}</span>
              <span className="start-count">{recent.length}</span>
            </div>
            <div className="start-recent">
              {recent.map((project) => (
                <button key={project.root} className="start-recent-row" onClick={() => onOpenRecent(project)}>
                  <span className="start-recent-icon"><BookOpen size={15} /></span>
                  <span className="start-recent-copy">
                    <strong>{project.name}</strong>
                    <small>{project.root}</small>
                  </span>
                  <time>{new Date(project.openedAt).toLocaleDateString()}</time>
                  <ArrowRight size={13} />
                </button>
              ))}
              {recent.length === 0 && (
                <div className="start-empty">
                  <FolderOpen size={22} />
                  <strong>{t('No recent projects yet.')}</strong>
                  <span>{t('Open a folder with .tex files.')}</span>
                  <button className="secondary-btn" onClick={onOpenFolder}>
                    <FolderOpen size={13} /> {t('Open folder')}
                  </button>
                </div>
              )}
            </div>

            <div className="start-section-head">
              <span>{t('Templates')}</span>
              <button className="start-link" onClick={onTemplates}>{t('Browse all')} <ArrowRight size={11} /></button>
            </div>
            <div className="start-template-grid">
              {quickTemplates.map(({ key, icon: Icon }) => (
                <button key={key} className="start-template-card" onClick={onTemplates}>
                  <span className="start-template-icon"><Icon size={16} /></span>
                  <span>
                    <strong>{t(key)}</strong>
                    <small>{t('Start from a ready-to-compile layout')}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <aside className="start-side">
            <div className="start-card">
              <div className="start-card-title"><Command size={13} /> {t('Quick actions')}</div>
              <button onClick={onPalette}><Command size={13} /><span>{t('Command palette')}</span><kbd>⌘K</kbd></button>
              <button onClick={onOpenSettings}><Settings2 size={13} /><span>{t('Settings')}</span><kbd>⌘,</kbd></button>
              <button onClick={onTemplates}><LayoutTemplate size={13} /><span>{t('Templates')}</span></button>
              <button onClick={onOpenFolder}><FolderOpen size={13} /><span>{t('Open folder')}</span><kbd>⌘O</kbd></button>
            </div>

            <div className="start-card">
              <div className="start-card-title"><PenTool size={13} /> {t('Getting started')}</div>
              <ol className="start-checklist">
                <li><span>1</span>{t('Open a folder with .tex files.')}</li>
                <li><span>2</span>{t('Compile with ⌘↩.')}</li>
                <li><span>3</span>{t('⌘-click the PDF to jump back.')}</li>
              </ol>
            </div>

            <div className="start-card start-workflow">
              <div className="start-card-title"><BookMarked size={13} /> {t('Workflow')}</div>
              <p>{t('Inline math, tables, TikZ and references render in place. PDF is on demand.')}</p>
              <div className="start-chips">
                <span>KaTeX</span><span>SyncTeX</span><span>pgfplots</span><span>BibTeX</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
