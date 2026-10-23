import { useEffect, useRef, useState } from 'react';
import { FileCode2, Play, Plus, RotateCcw, Save, Terminal, Trash2, X } from 'lucide-react';
import { defaultActions, parseActions, resolveTxsCommand, type ProjectAction } from '../lib/actions';
import { parseCwl, parseMacros, type CwlCompletion } from '../lib/cwl';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  projectRoot: string | null;
  rootFile: string | null;
  onBeforeRun: () => Promise<boolean>;
  actions: ProjectAction[];
  customCompletions: CwlCompletion[];
  onClose: () => void;
  onActionsChange: (actions: ProjectAction[]) => void;
  onCompletionsChange: (items: CwlCompletion[]) => void;
}

export function CommandStudio({ open, projectRoot, rootFile, onBeforeRun, actions, customCompletions, onClose, onActionsChange, onCompletionsChange }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'completions' | 'actions'>('actions');
  const [selectedId, setSelectedId] = useState(actions[0]?.id || '');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [macrosText, setMacrosText] = useState('');
  const [scanned, setScanned] = useState<Array<{ name: string; path: string }>>([]);
  const [scanning, setScanning] = useState(false);
  const cwlInput = useRef<HTMLInputElement | null>(null);
  const selected = actions.find((action) => action.id === selectedId) || actions[0];

  useEffect(() => {
    if (!open || !projectRoot) return;
    window.texpro.fileExists(`${projectRoot}/.texpro/macros.json`).then((exists) => exists ? window.texpro.readFile(`${projectRoot}/.texpro/macros.json`).then(setMacrosText) : setMacrosText('')).catch(() => setMacrosText(''));
    setScanning(true);
    window.texpro.scanCwlSources(projectRoot).then((files) => setScanned(files.map((file) => ({ name: file.name, path: file.path })))).catch(() => setScanned([])).finally(() => setScanning(false));
  }, [open, projectRoot]);

  if (!open) return null;

  const saveActions = async (next: ProjectAction[]) => {
    if (!projectRoot) return;
    onActionsChange(next);
    await window.texpro.writeFile(`${projectRoot}/.texpro/actions.json`, JSON.stringify(next, null, 2));
    setNotice(t('Build actions saved'));
  };

  const updateAction = (patch: Partial<ProjectAction>) => {
    if (!selected) return;
    const next = actions.map((action) => action.id === selected.id ? { ...action, ...patch } : action);
    onActionsChange(next);
  };

  const addAction = () => {
    const id = `action-${Date.now()}`;
    const next = [...actions, { id, name: t('New action'), command: 'latexmk', args: ['{rootFile}'] }];
    onActionsChange(next);
    setSelectedId(id);
  };

  const removeAction = () => {
    if (!selected) return;
    const next = actions.filter((action) => action.id !== selected.id);
    onActionsChange(next);
    setSelectedId(next[0]?.id || '');
  };

  const run = async () => {
    if (!selected || !projectRoot || !rootFile || busy) return;
    setBusy(true);
    setOutput('');
    setNotice('');
    try {
      if (!(await onBeforeRun())) return;
      const result = await window.texpro.runProjectAction(projectRoot, {
        command: resolveTxsCommand(selected.command),
        args: selected.args,
        cwd: selected.cwd,
        env: selected.env,
      }, rootFile);
      setOutput(`$ ${selected.command} ${selected.args.join(' ')}\n\n${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}`);
      setNotice(result.ok ? t('Action completed') : result.timedOut ? t('Action timed out') : t('Action failed'));
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  };

  const importCwl = async (file: File) => {
    if (!projectRoot) return;
    const text = await file.text();
    const items = parseCwl(text);
    await window.texpro.writeFile(`${projectRoot}/.texpro/completions.cwl`, text);
    onCompletionsChange([...customCompletions.filter((item) => !items.some((next) => next.label === item.label)), ...items]);
    setNotice(`${t('Loaded')} ${items.length} ${t('completions')}`);
  };

  const saveMacros = async () => {
    if (!projectRoot) return;
    await window.texpro.writeFile(`${projectRoot}/.texpro/macros.json`, macrosText);
    onCompletionsChange([...customCompletions.filter((item) => item.detail !== 'project macro'), ...parseMacros(macrosText)]);
    setNotice(t('Macros saved'));
  };

  const scanNow = async () => {
    if (!projectRoot || scanning) return;
    setScanning(true);
    try {
      const files = await window.texpro.scanCwlSources(projectRoot);
      setScanned(files.map((file) => ({ name: file.name, path: file.path })));
      const parsed = files.flatMap((file) => parseCwl(file.content));
      const seen = new Set(customCompletions.map((item) => `${item.label}:${item.template}`));
      const fresh = parsed.filter((item) => {
        const key = `${item.label}:${item.template}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      onCompletionsChange([...customCompletions, ...fresh]);
      setNotice(`${t('Loaded')} ${fresh.length} ${t('completions')}`);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="command-studio" data-testid="command-studio" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Terminal size={18} /></div>
            <div><span className="modal-eyebrow">{t('Customize')}</span><h2>{t('Commands & completions')}</h2></div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok">{actions.length} {t('actions')}</span>
            <button className="icon-btn" onClick={onClose} aria-label={t('Close')}><X size={16} /></button>
          </div>
        </header>
        <div className="command-tabs">
          <button className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}><Terminal size={12} /> {t('Build actions')}</button>
          <button className={tab === 'completions' ? 'active' : ''} onClick={() => setTab('completions')}><FileCode2 size={12} /> {t('Completions')}</button>
        </div>
        {tab === 'actions' ? (
          <div className="command-body">
            <aside className="action-list">
              {actions.map((action) => (
                <button key={action.id} className={selected?.id === action.id ? 'active' : ''} onClick={() => setSelectedId(action.id)}>
                  <strong>{action.name}</strong><code>{action.command}</code>
                </button>
              ))}
              <button className="action-add" onClick={addAction}><Plus size={12} /> {t('Add action')}</button>
            </aside>
            <main className="action-editor">
              {selected ? (
                <>
                  <div className="action-fields">
                    <label className="workshop-field"><span>{t('Name')}</span><input value={selected.name} onChange={(event) => updateAction({ name: event.target.value })} /></label>
                    <label className="workshop-field"><span>{t('Command')}</span><input value={selected.command} onChange={(event) => updateAction({ command: event.target.value })} placeholder="latexmk or txs:///latexmk" /></label>
                    <label className="workshop-field"><span>{t('Arguments')}</span><input value={selected.args.join(' ')} onChange={(event) => updateAction({ args: event.target.value.split(/\s+/).filter(Boolean) })} placeholder="-pdf -synctex=1 {rootFile}" /></label>
                    <label className="workshop-field"><span>{t('Working directory')}</span><input value={selected.cwd || ''} onChange={(event) => updateAction({ cwd: event.target.value })} placeholder="." /></label>
                  </div>
                  <p className="schematic-hint">{t('Use {rootFile}, {rootName}, {buildDir} or {projectRoot}. txs:/// references are resolved to the matching executable.')}</p>
                  <div className="action-buttons">
                    <button className="primary-btn" onClick={() => void run()} disabled={busy || !rootFile}><Play size={12} /> {busy ? t('Running…') : t('Run action')}</button>
                    <button className="secondary-btn" onClick={() => void saveActions(actions)}><Save size={12} /> {t('Save actions')}</button>
                    <button className="danger-btn" onClick={removeAction}><Trash2 size={12} /> {t('Delete')}</button>
                    <button className="secondary-btn" onClick={() => onActionsChange(defaultActions)}><RotateCcw size={12} /> {t('Defaults')}</button>
                  </div>
                  <pre className="action-output">{output || t('Action output will appear here.')}</pre>
                  {notice && <div className="collab-notice">{notice}</div>}
                </>
              ) : <div className="panel-empty">{t('No actions configured.')}</div>}
            </main>
          </div>
        ) : (
          <div className="completion-body">
            <div className="completion-card">
              <div className="pane-label"><FileCode2 size={12} /> {t('TeXstudio .cwl')}<span className="pane-hint">{customCompletions.filter((item) => item.detail === 'cwl command' || item.detail === 'cwl environment').length}</span></div>
              <p className="schematic-hint">{t('Load a .cwl file to extend completion with your own commands and environments.')}</p>
              <input ref={cwlInput} type="file" accept=".cwl,.txt" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCwl(file); event.target.value = ''; }} />
              <button className="secondary-btn" onClick={() => cwlInput.current?.click()} disabled={!projectRoot}><FileCode2 size={12} /> {t('Import .cwl')}</button>
              <button className="secondary-btn" onClick={() => void scanNow()} disabled={!projectRoot || scanning}><RotateCcw size={12} /> {scanning ? t('Scanning…') : t('Scan TeXstudio')}</button>
              <div className="completion-path">.texpro/completions.cwl · {scanned.length} {t('auto-detected .cwl sources')}</div>
              {customCompletions.some((item) => item.detail.startsWith('cwl')) ? (
                <div className="completion-list">
                  {customCompletions.filter((item) => item.detail.startsWith('cwl')).slice(0, 16).map((item) => <code key={item.label}>{item.label}</code>)}
                </div>
              ) : <div className="completion-empty">{t('No custom commands loaded. Import a .cwl file to add your own completion source.')}</div>}
            </div>
            <div className="completion-card macros-card">
              <div className="pane-label"><FileCode2 size={12} /> {t('Macros')}<span className="pane-hint">{customCompletions.filter((item) => item.detail === 'project macro').length}</span></div>
              <p className="schematic-hint">{t('JSON array with label, trigger and a body containing | as the cursor.')}</p>
              <textarea value={macrosText} onChange={(event) => setMacrosText(event.target.value)} placeholder={'[{"label":"\\\\todo","body":"\\\\todo{|}"}]'} spellCheck={false} />
              <div className="completion-actions">
                <button className="secondary-btn" onClick={() => setMacrosText('[{\"label\":\"\\\\todo\",\"detail\":\"project macro\",\"body\":\"\\\\todo{|}\"}]')}>{t('Insert example')}</button>
                <button className="primary-btn" onClick={() => void saveMacros()} disabled={!projectRoot}><Save size={12} /> {t('Save macros')}</button>
              </div>
            </div>
            {notice && <div className="collab-notice completion-notice">{notice}</div>}
          </div>
        )}
        <footer className="studio-footer">
          <span className="studio-hint">{projectRoot ? '.texpro/actions.json · .texpro/completions.cwl · .texpro/macros.json' : t('Open a project first')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={onClose}>{t('Close')}</button>
        </footer>
      </section>
    </div>
  );
}
