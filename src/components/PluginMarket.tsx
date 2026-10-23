import { useEffect, useRef, useState } from 'react';
import { Check, FileCode2, Package, Plug, RefreshCw, ShoppingBag, X } from 'lucide-react';
import { parseCwl, type CwlCompletion } from '../lib/cwl';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  projectRoot: string | null;
  completions: CwlCompletion[];
  onClose: () => void;
  onCompletionsChange: (items: CwlCompletion[]) => void;
  onOpenMcp: () => void;
}

const mcpPlugins = [
  { name: 'TeXPro', detail: 'Project tools, compile, SyncTeX and diagnostics', installed: true },
  { name: 'Git', detail: 'Repository history, diffs and commit state', installed: false },
  { name: 'Zotero', detail: 'BibTeX library and citation search', installed: false },
];

export function PluginMarket({ open, projectRoot, completions, onClose, onCompletionsChange, onOpenMcp }: Props) {
  const { t } = useI18n();
  const [sources, setSources] = useState<Array<{ name: string; path: string; content: string }>>([]);
  const [loaded, setLoaded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    void window.texpro.scanCwlSources(projectRoot).then((files) => setSources(files)).finally(() => setBusy(false));
  }, [open, projectRoot]);

  if (!open) return null;

  const merge = (items: CwlCompletion[]) => {
    const seen = new Set(completions.map((item) => `${item.label}:${item.template}`));
    const fresh = items.filter((item) => {
      const key = `${item.label}:${item.template}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    onCompletionsChange([...completions, ...fresh]);
    setNotice(`${t('Loaded')} ${fresh.length} ${t('completions')}`);
  };

  const loadSource = async (source: { name: string; path: string; content: string }) => {
    if (!projectRoot) return;
    await window.texpro.writeFile(`${projectRoot}/.texpro/completions.cwl`, source.content);
    merge(parseCwl(source.content));
    setLoaded((current) => [...new Set([...current, source.path])]);
  };

  const importFile = async (file: File) => {
    if (!projectRoot) return;
    const content = await file.text();
    await window.texpro.writeFile(`${projectRoot}/.texpro/completions.cwl`, content);
    merge(parseCwl(content));
    setNotice(`${t('Installed')} ${file.name}`);
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="plugin-studio" data-testid="plugin-market" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><ShoppingBag size={18} /></div>
            <div><span className="modal-eyebrow">{t('Extend')}</span><h2>{t('Plugin market')}</h2></div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok">{sources.length + mcpPlugins.length} {t('available')}</span>
            <button className="icon-btn" onClick={onClose} aria-label={t('Close')}><X size={16} /></button>
          </div>
        </header>
        <div className="plugin-body">
          <section className="plugin-section">
            <div className="plugin-section-head">
              <div><span className="pane-label"><FileCode2 size={12} /> {t('Completion packs')}</span><p>{t('Auto-detected from TeXstudio and your project. Load a pack to merge its commands into completion.')}</p></div>
              <div className="plugin-actions">
                <input ref={fileInput} type="file" accept=".cwl,.txt" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ''; }} />
                <button className="secondary-btn" onClick={() => fileInput.current?.click()} disabled={!projectRoot}><FileCode2 size={12} /> {t('Import .cwl')}</button>
                <button className="icon-btn" onClick={() => { setBusy(true); void window.texpro.scanCwlSources(projectRoot).then(setSources).finally(() => setBusy(false)); }} title={t('Rescan')}>{busy ? <RefreshCw size={13} className="spin" /> : <RefreshCw size={13} />}</button>
              </div>
            </div>
            <div className="plugin-list">
              {sources.map((source) => (
                <div key={source.path} className="plugin-row">
                  <span className="plugin-row-icon"><FileCode2 size={15} /></span>
                  <div><strong>{source.name}</strong><small>{source.path}</small></div>
                  <button className="secondary-btn" onClick={() => void loadSource(source)} disabled={!projectRoot}>{loaded.includes(source.path) ? <><Check size={11} /> {t('Loaded')}</> : t('Load pack')}</button>
                </div>
              ))}
              {!sources.length && <div className="plugin-empty"><Package size={20} /><span>{t('No TeXstudio completion packs found. Import a .cwl file to add one.')}</span></div>}
            </div>
          </section>
          <section className="plugin-section">
            <div className="plugin-section-head"><div><span className="pane-label"><Plug size={12} /> {t('MCP integrations')}</span><p>{t('Connect external tools through the MCP client. Commands run on your machine.')}</p></div><button className="secondary-btn" onClick={onOpenMcp}><Plug size={12} /> {t('Open MCP panel')}</button></div>
            <div className="plugin-list">
              {mcpPlugins.map((plugin) => (
                <div key={plugin.name} className="plugin-row">
                  <span className="plugin-row-icon"><Plug size={15} /></span>
                  <div><strong>{plugin.name}</strong><small>{t(plugin.detail)}</small></div>
                  <span className={`plugin-status ${plugin.installed ? 'installed' : ''}`}>{plugin.installed ? t('Installed') : t('Available')}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <footer className="studio-footer">
          <span className="studio-hint">{notice || t('Plugin sources are local; TeXPro never uploads your project.')}</span>
          <div className="spacer" />
          <button className="primary-btn" onClick={onClose}>{t('Done')}</button>
        </footer>
      </section>
    </div>
  );
}
