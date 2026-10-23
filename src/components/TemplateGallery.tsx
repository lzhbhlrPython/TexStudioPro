import { requestText } from './TextRequest';
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  FileText,
  GraduationCap,
  LayoutTemplate,
  Plus,
  Presentation,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { OpenDoc, TemplateItem } from '../types';
import { builtinTemplates, fillTemplate, type TemplateMeta } from '../lib/templates';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  userTemplates: TemplateItem[];
  activeDoc: OpenDoc | null;
  activeEngine: TemplateItem['engine'];
  onClose: () => void;
  onCreate: (template: TemplateItem, meta: TemplateMeta) => Promise<boolean>;
  onSaveCurrent: (name: string, description: string, content: string, engine: TemplateItem['engine']) => Promise<void>;
  onDuplicate: (name: string, description: string, content: string, engine: TemplateItem['engine']) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

function categoryIcon(category: string) {
  if (category === 'Teaching') return <GraduationCap size={14} />;
  if (category === 'Academic') return <BookOpen size={14} />;
  if (category === 'Basics') return <FileText size={14} />;
  return <LayoutTemplate size={14} />;
}

export function TemplateGallery({
  open,
  userTemplates,
  activeDoc,
  activeEngine,
  onClose,
  onCreate,
  onSaveCurrent,
  onDuplicate,
  onDeleteTemplate,
}: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('article');
  const [projectName, setProjectName] = useState('my-paper');
  const [title, setTitle] = useState('A Visual LaTeX Document');
  const [author, setAuthor] = useState('Your Name');
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [thumbnailBusy, setThumbnailBusy] = useState(false);
  const [thumbnailError, setThumbnailError] = useState('');

  const templates = useMemo(() => [...builtinTemplates, ...userTemplates], [userTemplates]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((item) =>
      [item.name, item.description, item.category, t(item.name), t(item.description)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [search, templates, t]);

  const selected = templates.find((item) => item.id === selectedId) || filtered[0] || templates[0];

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSaveOpen(false);
    setSaveName('');
    setSaveDescription('');
    if (!templates.some((item) => item.id === selectedId)) setSelectedId(templates[0]?.id || 'article');
    if (!projectName || projectName === 'my-paper') {
      setProjectName(t('my-project') === 'my-project' ? 'my-project' : '我的项目');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !selected) return;
    if (!projectName || projectName === 'my-paper' || projectName === '我的项目' || projectName === 'my-project') {
      setProjectName(selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-project');
    }
  }, [selectedId, open]);

  useEffect(() => {
    if (!open || !selected) return;
    let cancelled = false;
    setThumbnail('');
    setThumbnailError('');
    setThumbnailBusy(true);
    void window.texpro.renderTemplatePreview({
      source: fillTemplate(selected.content, { projectName: 'preview', title: 'Template preview', author: 'TeXPro' }),
      engine: selected.engine,
    }).then((result) => {
      if (cancelled) return;
      if (result.ok && result.dataUrl) setThumbnail(result.dataUrl);
      else setThumbnailError(result.error || 'Preview unavailable');
    }).catch((failure) => {
      if (!cancelled) setThumbnailError(String(failure));
    }).finally(() => {
      if (!cancelled) setThumbnailBusy(false);
    });
    return () => { cancelled = true; };
  }, [open, selected?.id, selected?.content, selected?.engine]);

  if (!open) return null;

  const create = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const ok = await onCreate(selected, { projectName, title, author });
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  const saveCurrent = async () => {
    if (!activeDoc || !saveName.trim() || busy) return;
    setBusy(true);
    try {
      await onSaveCurrent(saveName.trim(), saveDescription.trim(), activeDoc.content, activeEngine);
      setSaveOpen(false);
      setSaveName('');
      setSaveDescription('');
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    if (!selected) return;
    const name = await requestText(t('Variant name'), `${selected.name} variant`);
    if (!name?.trim()) return;
    await onDuplicate(name.trim(), `${t('Based on')} ${selected.name}`, selected.content, selected.engine);
  };

  const remove = async (item: TemplateItem) => {
    if (item.builtin) return;
    if (!window.confirm(t('Delete this template?'))) return;
    await onDeleteTemplate(item.id);
    if (selectedId === item.id) setSelectedId(templates[0]?.id || 'article');
  };

  const preview = selected ? fillTemplate(selected.content, { projectName, title, author }) : '';

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="template-modal" data-testid="template-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="template-header">
          <div className="template-heading">
            <div className="template-icon"><LayoutTemplate size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Template library')}</span>
              <h2>{t('Create a new project')}</h2>
            </div>
          </div>
          <div className="template-header-actions">
            <button
              className="secondary-btn"
              disabled={!activeDoc}
              onClick={() => setSaveOpen((value) => !value)}
              title={!activeDoc ? t('Open a document first') : t('Save current document as template')}
            >
              <Save size={13} />
              {t('Save as template')}
            </button>
            <button className="icon-btn" onClick={onClose} title={t('Close')}>
              <X size={16} />
            </button>
          </div>
        </header>

        {saveOpen && (
          <div className="template-savebar">
            <input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder={t('Template name')}
              autoFocus
            />
            <input
              value={saveDescription}
              onChange={(event) => setSaveDescription(event.target.value)}
              placeholder={t('Template description')}
            />
            <button className="primary-btn" onClick={() => void saveCurrent()} disabled={!saveName.trim() || busy}>
              <Save size={13} />
              {t('Save')}
            </button>
          </div>
        )}

        <div className="template-body">
          <aside className="template-sidebar">
            <div className="template-search">
              <Search size={13} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('Search templates…')}
              />
            </div>
            <div className="template-list">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  className={`template-card ${selected?.id === item.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="template-card-icon">{categoryIcon(item.category)}</span>
                  <span className="template-card-copy">
                    <strong>{t(item.name)}</strong>
                    <small>{t(item.description)}</small>
                    <em>{t(item.category)} · {item.engine}</em>
                  </span>
                  {item.builtin ? (
                    <span className="template-badge">{t('Built-in')}</span>
                  ) : (
                    <span className="template-badge user">{t('User')}</span>
                  )}
                </button>
              ))}
              {filtered.length === 0 && <div className="template-empty">{t('No templates match.')}</div>}
            </div>
          </aside>

          <div className="template-detail">
            <div className="template-preview">
              <div className="template-preview-bar">
                <span>{selected?.name || 'Template'}</span>
                <span>{selected?.engine}</span>
              </div>
              <div className="template-thumb">
                {thumbnail ? (
                  <>
                    <img src={thumbnail} alt={selected?.name || ''} />
                    <div className="template-thumb-copy">
                      <strong>{t('Compiled first page')}</strong>
                      <span>{selected?.name} · {selected?.engine}</span>
                    </div>
                  </>
                ) : (
                  <div className="template-thumb-placeholder">
                    {thumbnailBusy ? t('Compiling preview…') : thumbnailError ? t('Preview unavailable') : ''}
                  </div>
                )}
              </div>
              <pre>
                {preview
                  .split('\n')
                  .slice(0, 24)
                  .map((line, index) => `${String(index + 1).padStart(2, ' ')}  ${line}`)
                  .join('\n')}
              </pre>
            </div>

            <div className="template-form">
              <div className="template-form-row">
                <label>
                  <span>{t('Project name')}</span>
                  <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
                </label>
                <label>
                  <span>{t('Document title')}</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
              </div>
              <div className="template-form-row">
                <label>
                  <span>{t('Author')}</span>
                  <input value={author} onChange={(event) => setAuthor(event.target.value)} />
                </label>
                <label className="template-engine">
                  <span>{t('LaTeX engine')}</span>
                  <div className="static-value">{selected?.engine}</div>
                </label>
              </div>
              <p className="template-hint">{t('New project will be created in the folder you choose.')}</p>
              <div className="template-actions">
                {selected && !selected.builtin && (
                  <button className="danger-btn" onClick={() => void remove(selected)}>
                    <Trash2 size={13} />
                    {t('Delete')}
                  </button>
                )}
                <div className="spacer" />
                <button className="secondary-btn" onClick={() => void duplicate()}>{t('Duplicate as variant')}</button>
                <button className="secondary-btn" onClick={onClose}>{t('Cancel')}</button>
                <button className="primary-btn" onClick={() => void create()} disabled={busy || !projectName.trim()}>
                  {busy ? <span className="inline-spinner" /> : <Plus size={14} />}
                  {t('Create project')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
