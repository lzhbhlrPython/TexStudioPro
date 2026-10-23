import { formatShortcut } from '../i18n';
import { ArrowRight, BookOpen, Command, FileText, FolderOpen, LayoutTemplate, Search, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RecentProject } from '../types';
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

export function Welcome({ recent, onOpenFolder, onDemo, onOpenRecent, onTemplates, onOpenSettings, onPalette }: Props) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => recent.filter(project => `${project.name} ${project.root}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [query, recent]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' }), [language]);
  return (
    <main className="welcome-page" data-testid="welcome">
      <div className="welcome-inner">
        <header className="welcome-heading">
          <span className="welcome-eyebrow">TeXPro <span>/</span> {t('Your writing desk')}</span>
          <h1>{t('Start writing')}</h1>
          <p>{t('A place for your next page, and every page after it.')}</p>
        </header>
        <div className="welcome-grid">
          <section className="welcome-projects" aria-labelledby="welcome-recent-title">
            <div className="welcome-section-heading">
              <h2 id="welcome-recent-title">{t('Recent projects')} <span>{recent.length.toString().padStart(2, '0')}</span></h2>
              {recent.length > 3 && <label className="welcome-search"><Search size={14} /><input aria-label={t('Find a project')} placeholder={t('Find a project')} value={query} onChange={event => setQuery(event.target.value)} /></label>}
            </div>
            <div className="welcome-recent">
              {filtered.map((project, index) => <button key={project.root} className="welcome-project-row" onClick={() => onOpenRecent(project)} title={project.root}>
                <span className="welcome-project-index" aria-hidden="true">{(index + 1).toString().padStart(2, '0')}</span>
                <span className="welcome-project-copy"><strong>{project.name}</strong><small>{project.root}</small></span>
                <time dateTime={new Date(project.openedAt).toISOString()}>{dateFormat.format(project.openedAt)}</time>
                <ArrowRight size={16} aria-hidden="true" />
              </button>)}
              {!filtered.length && <div className="welcome-empty">
                <BookOpen size={28} strokeWidth={1.3} />
                <h3>{t(recent.length ? 'No matching projects' : 'Your first page starts here')}</h3>
                <p>{t(recent.length ? 'Try a project name or folder path.' : 'Open an existing LaTeX folder, or start with a template.')}</p>
                {recent.length > 0 && <button className="welcome-text-button" onClick={() => setQuery('')}>{t('Clear search')} <ArrowRight size={13} /></button>}
              </div>}
            </div>
            <p className="welcome-recent-note">{t('Your files stay in their project folders.')}</p>
          </section>
          <aside className="welcome-start" aria-labelledby="welcome-start-title">
            <h2 id="welcome-start-title">{t('Begin a project')}</h2>
            <button className="welcome-open" onClick={onOpenFolder}><FolderOpen size={18} /><span>{t('Open folder')}<small>{t('Continue an existing LaTeX project')}</small></span><kbd>{formatShortcut('⌘O')}</kbd></button>
            <button className="welcome-template" onClick={onTemplates}><LayoutTemplate size={18} /><span>{t('New from template')}<small>{t('Articles, reports and presentations')}</small></span><ArrowRight size={15} /></button>
            <button className="welcome-text-button welcome-demo" onClick={onDemo}><FileText size={14} />{t('Explore the demo project')}<ArrowRight size={13} /></button>
            <div className="welcome-guide">
              <h3>{t('From source to page')}</h3>
              <ol>
                <li><span>1</span><p>{t('Choose the project main file.')}<small>{t('One entry for every chapter.')}</small></p></li>
                <li><span>2</span><p>{t('Compile with ⌘↩.')}<small>{t('All edited files are saved first.')}</small></p></li>
                <li><span>3</span><p>{t('⌘-click the PDF to jump back.')}<small>{t('Or select a region to find its source.')}</small></p></li>
              </ol>
            </div>
          </aside>
        </div>
        <footer className="welcome-footer">
          <span>{t('Visual LaTeX Workbench')}</span>
          <div><button onClick={onPalette}><Command size={13} />{t('Command palette')}<kbd>{formatShortcut('⌘K')}</kbd></button><button onClick={onOpenSettings}><Settings2 size={13} />{t('Settings')}<kbd>{formatShortcut('⌘,')}</kbd></button></div>
        </footer>
      </div>
    </main>
  );
}
