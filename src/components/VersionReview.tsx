import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Eraser, GitCompare, History, RotateCcw, Trash2, X } from 'lucide-react';
import { diffLines } from '../lib/lineDiff';
import { basename, relativePath } from '../lib/latex';
import { useI18n } from '../i18n';

interface Version {
  id: string;
  time: number;
  reason: string;
  files: string[];
  size: number;
}

interface Props {
  open: boolean;
  projectRoot: string | null;
  activeFile: string | null;
  activeContent: string;
  onClose: () => void;
  onRestored: (file: string) => void;
}

export function VersionReview({ open, projectRoot, activeFile, activeContent, onClose, onRestored }: Props) {
  const { t } = useI18n();
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [file, setFile] = useState('');
  const [snapshot, setSnapshot] = useState('');
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const selected = versions.find((version) => version.id === selectedId) || versions[0];
  const relativeActive = activeFile && projectRoot ? relativePath(projectRoot, activeFile) : '';

  const loadVersions = async () => {
    if (!projectRoot) return;
    const next = await window.texpro.historyList(projectRoot);
    setVersions(next);
    if (!selectedId && next[0]) setSelectedId(next[0].id);
  };

  useEffect(() => {
    if (!open) return;
    setSelectedId('');
    setNotice('');
    void loadVersions();
  }, [open, projectRoot]);

  useEffect(() => {
    if (!open || !selected) return;
    const target = selected.files.includes(relativeActive) ? relativeActive : selected.files[0] || '';
    setFile(target);
  }, [open, selectedId]);

  useEffect(() => {
    if (!open || !projectRoot || !selected || !file) {
      setSnapshot('');
      setCurrent('');
      return;
    }
    let cancelled = false;
    void window.texpro.historyRead(projectRoot, selected.id, file).then((content) => {
      if (!cancelled) setSnapshot(content);
    }).catch(() => { if (!cancelled) setSnapshot(''); });
    if (relativeActive === file) setCurrent(activeContent);
    else void window.texpro.readFile(`${projectRoot}/${file}`).then((content) => {
      if (!cancelled) setCurrent(content);
    }).catch(() => { if (!cancelled) setCurrent(''); });
    return () => { cancelled = true; };
  }, [open, projectRoot, selectedId, file, activeContent, relativeActive]);

  const rows = useMemo(() => diffLines(snapshot, current), [snapshot, current]);
  const added = rows.filter((row) => row.type === 'add').length;
  const removed = rows.filter((row) => row.type === 'remove').length;

  if (!open) return null;

  const snapshotNow = async () => {
    if (!projectRoot || busy) return;
    setBusy(true);
    try {
      const result = await window.texpro.historyCommit(projectRoot, 'manual');
      setNotice(result.skipped ? t('No changes since the last snapshot') : t('Snapshot created'));
      await loadVersions();
      if (result.version?.id) setSelectedId(result.version.id);
    } finally {
      setBusy(false);
    }
  };

  const removeVersion = async (version: Version) => {
    if (!projectRoot) return;
    if (!window.confirm(`${t('Delete this snapshot?')}\n${new Date(version.time).toLocaleString()}`)) return;
    await window.texpro.historyDelete(projectRoot, version.id);
    if (selectedId === version.id) setSelectedId('');
    await loadVersions();
    setNotice(t('Snapshot deleted'));
  };

  const clearAll = async () => {
    if (!projectRoot) return;
    if (!window.confirm(t('Delete all version history for this project?'))) return;
    await window.texpro.historyClear(projectRoot);
    setVersions([]);
    setSelectedId('');
    setSnapshot('');
    setCurrent('');
    setNotice(t('Version history cleared'));
  };

  const restore = async () => {
    if (!projectRoot || !selected || !file) return;
    if (!window.confirm(`${t('Restore this file from the selected snapshot?')}\n${file}`)) return;
    await window.texpro.historyRestore(projectRoot, selected.id, file);
    onRestored(`${projectRoot}/${file}`);
    setNotice(t('Snapshot restored'));
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="version-studio" data-testid="version-review" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><History size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Review')}</span>
              <h2>{t('Version review')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok">{versions.length} {t('snapshots')}</span>
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </header>

        <div className="version-body">
          <aside className="version-list">
            <button className="primary-btn version-snapshot" onClick={() => void snapshotNow()} disabled={busy}>
              <Check size={12} /> {t('Create snapshot')}
            </button>
            {versions.map((version) => (
              <div key={version.id} className={`version-row ${selected?.id === version.id ? 'active' : ''}`}>
                <button className="version-row-main" onClick={() => setSelectedId(version.id)}>
                  <Clock3 size={11} />
                  <span>
                    <strong>{new Date(version.time).toLocaleString()}</strong>
                    <small>{version.reason} · {version.files.length} {t('files')} · {(version.size / 1024).toFixed(1)} KB</small>
                  </span>
                </button>
                <button className="version-delete" onClick={() => void removeVersion(version)} title={t('Delete snapshot')}><Trash2 size={11} /></button>
              </div>
            ))}
            {!versions.length && <div className="panel-empty">{t('Create the first snapshot to start reviewing changes.')}</div>}
          </aside>

          <div className="version-main">
            {!selected ? (
              <div className="version-empty">
                <History size={26} />
                <strong>{t('No snapshots yet')}</strong>
                <span>{t('Create a snapshot to compare and restore files without storing duplicate copies.')}</span>
                <button className="primary-btn" onClick={() => void snapshotNow()} disabled={busy}><Check size={12} /> {t('Create snapshot')}</button>
              </div>
            ) : (
            <>
            <div className="version-toolbar">
              <GitCompare size={12} />
              <select value={file} onChange={(event) => setFile(event.target.value)}>
                {(selected?.files || []).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <span className="version-stat add">+{added}</span>
              <span className="version-stat remove">−{removed}</span>
              <div className="spacer" />
              <button className="secondary-btn" onClick={() => void restore()} disabled={!file}><RotateCcw size={12} /> {t('Restore file')}</button>
            </div>
            {notice && <div className="version-notice">{notice}</div>}
            <div className="version-diff">
              {rows.map((row, index) => (
                <div key={index} className={`diff-row ${row.type}`}>
                  <span className="diff-line">{row.oldLine || ''}</span>
                  <span className="diff-line">{row.newLine || ''}</span>
                  <span className="diff-mark">{row.type === 'add' ? '+' : row.type === 'remove' ? '−' : ' '}</span>
                  <code>{row.text || ' '}</code>
                </div>
              ))}
            </div>
            </>
            )}
          </div>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('Snapshots use content-addressed chunks; unchanged text is stored once.')}</span>
          <div className="spacer" />
          <button className="danger-btn" onClick={() => void clearAll()} disabled={!versions.length}><Eraser size={12} /> {t('Clear history')}</button>
          <button className="primary-btn" onClick={onClose}>{t('Done')}</button>
        </footer>
      </section>
    </div>
  );
}
