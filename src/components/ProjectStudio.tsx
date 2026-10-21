import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FolderCog,
  FolderTree,
  ListTree,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { FileNode, Project, ProjectConfig, ProjectModule } from '../types';
import { defaultProjectConfig, normalizeProjectConfig } from '../lib/projectConfig';
import { basename, stem } from '../lib/latex';
import { slugify } from '../lib/templates';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  project: Project | null;
  config: ProjectConfig;
  onClose: () => void;
  onSaveConfig: (config: ProjectConfig) => Promise<void>;
  onCreateModule: (title: string, file: string) => Promise<string | null>;
  onApply: (config: ProjectConfig) => Promise<void>;
}

function flattenTex(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file' && /\.(tex|ltx)$/i.test(node.name)) result.push(node);
    else if (node.type === 'dir' && node.children) result.push(...flattenTex(node.children));
  }
  return result;
}

export function ProjectStudio({
  open,
  project,
  config,
  onClose,
  onSaveConfig,
  onCreateModule,
  onApply,
}: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<ProjectConfig>(config);
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleFile, setModuleFile] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const discovered = useMemo<ProjectModule[]>(() => {
    if (!project) return [];
    return flattenTex(project.tree)
      .filter((node) => node.path !== project.rootFile && !project.rootCandidates?.includes(node.path))
      .map((node) => ({
        file: node.relative,
        title: stem(node.name),
        included: true,
      }));
  }, [project]);

  useEffect(() => {
    if (!open) return;
    setError('');
    const normalized = normalizeProjectConfig(config);
    const merged = [...normalized.modules];
    for (const item of discovered) {
      if (!merged.some((module) => module.file === item.file)) merged.push(item);
    }
    setDraft({ ...normalized, modules: merged });
    setModuleTitle('');
    setModuleFile('');
  }, [open, config, discovered]);

  if (!open) return null;

  const updateModule = (file: string, patch: Partial<ProjectModule>) => {
    setDraft((current) => ({
      ...current,
      modules: current.modules.map((module) => (module.file === file ? { ...module, ...patch } : module)),
    }));
  };

  const move = (file: string, delta: number) => {
    setDraft((current) => {
      const modules = [...current.modules];
      const index = modules.findIndex((module) => module.file === file);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= modules.length) return current;
      [modules[index], modules[next]] = [modules[next], modules[index]];
      return { ...current, modules };
    });
  };

  const addModule = async () => {
    if (!project || busy) return;
    const title = moduleTitle.trim() || t('New section');
    const derived = slugify(title).replace(/[^a-zA-Z0-9_-]/g, '') || `section-${Date.now()}`;
    const defaultFile = `${draft.directories.modules}/${derived}.tex`;
    const file = (moduleFile.trim() || defaultFile).replace(/^\/+/, '');
    setBusy(true);
    try {
      const created = await onCreateModule(title, file);
      if (created) {
        setDraft((current) => ({
          ...current,
          modules: [...current.modules, { file: created, title, included: true }],
        }));
        setModuleTitle('');
        setModuleFile('');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = (file: string) => {
    setDraft((current) => ({ ...current, modules: current.modules.filter((module) => module.file !== file) }));
  };

  const apply = async () => {
    setBusy(true); setError('');
    try {
      await onSaveConfig(draft);
      await onApply(draft);
      onClose();
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="project-studio" data-testid="project-studio" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><FolderTree size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Project structure')}</span>
              <h2>{t('Modules & directories')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok"><FolderCog size={11} /> .texpro/project.json</span>
            <button className="icon-btn" onClick={onClose} title={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="project-studio-body">
          <aside className="project-settings-pane">
            <div className="layout-section">
              <div className="layout-section-title">{t('Directories')}</div>
              <label className="layout-field">
                <span>{t('Modules directory')}</span>
                <input value={draft.directories.modules} onChange={(event) => setDraft({ ...draft, directories: { ...draft.directories, modules: event.target.value } })} />
              </label>
              <label className="layout-field">
                <span>{t('Assets directory')}</span>
                <input value={draft.directories.assets} onChange={(event) => setDraft({ ...draft, directories: { ...draft.directories, assets: event.target.value } })} />
              </label>
              <label className="layout-field">
                <span>{t('Build directory')}</span>
                <input value={draft.directories.build} onChange={(event) => setDraft({ ...draft, directories: { ...draft.directories, build: event.target.value } })} />
              </label>
              <p className="layout-hint">{t('Paths are relative to the project root.')}</p>
            </div>

            <div className="layout-section">
              <div className="layout-section-title">{t('Table of contents')}</div>
              <label className="chart-check"><input type="checkbox" checked={draft.toc.enabled} onChange={(event) => setDraft({ ...draft, toc: { ...draft.toc, enabled: event.target.checked } })} /> {t('Insert table of contents')}</label>
              <label className="layout-row">
                <span>{t('Depth')}</span>
                <select value={draft.toc.depth} onChange={(event) => setDraft({ ...draft, toc: { ...draft.toc, depth: Number(event.target.value) } })}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </label>
              <label className="chart-check"><input type="checkbox" checked={draft.toc.numbered} onChange={(event) => setDraft({ ...draft, toc: { ...draft.toc, numbered: event.target.checked } })} /> {t('Numbered sections')}</label>
            </div>
          </aside>

          <div className="project-modules-pane">
            <div className="pane-label"><ListTree size={12} /> {t('Modules')}<span className="pane-hint">{draft.modules.length}</span></div>
            <div className="project-module-list">
              {draft.modules.map((module) => (
                <div className="project-module-row" key={module.file}>
                  <input
                    type="checkbox"
                    checked={module.included}
                    onChange={(event) => updateModule(module.file, { included: event.target.checked })}
                  />
                  <div className="project-module-copy">
                    <input value={module.title} onChange={(event) => updateModule(module.file, { title: event.target.value })} />
                    <small>{module.file}</small>
                  </div>
                  <button onClick={() => move(module.file, -1)} title={t('Move up')}><ArrowUp size={11} /></button>
                  <button onClick={() => move(module.file, 1)} title={t('Move down')}><ArrowDown size={11} /></button>
                  <button onClick={() => remove(module.file)} title={t('Remove from build')}><Trash2 size={11} /></button>
                </div>
              ))}
              {draft.modules.length === 0 && <div className="project-empty"><ListTree size={22} /><strong>{t('No modules yet')}</strong><span>{t('Add a module to build a multi-file document.')}</span></div>}
            </div>
            <div className="project-module-add">
              <input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} placeholder={t('Section title')} />
              <input value={moduleFile} onChange={(event) => setModuleFile(event.target.value)} placeholder={`${draft.directories.modules}/section.tex`} />
              <button className="primary-btn" onClick={() => void addModule()} disabled={busy}>
                <Plus size={12} /> {t('New module')}
              </button>
            </div>
            <div className="project-module-note">
              <FolderCog size={12} />
              {t('Applying modules replaces the TeXPro modules block in the root document.')}
            </div>
          </div>
        </div>

        {error && <p role="alert" className="project-config-error">{t('Save failed')}: {error}</p>}
        <footer className="studio-footer">
          <span className="studio-hint">{t('Project configuration is stored in .texpro/project.json.')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="primary-btn" onClick={() => void apply()} disabled={busy || !project?.rootFile}>
            <FolderTree size={13} /> {t('Save & apply')}
          </button>
        </footer>
      </section>
    </div>
  );
}
