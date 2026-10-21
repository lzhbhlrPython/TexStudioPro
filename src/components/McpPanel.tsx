import { useEffect, useMemo, useState } from 'react';
import { Check, Clipboard, Plug, Terminal, Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  projectRoot: string | null;
  onClose: () => void;
}

const MCP_MARKET = [
  { id: 'texpro', name: 'TeXPro', description: 'The local TeXPro project server', command: 'node', args: [] },
  { id: 'git', name: 'Git', description: 'Inspect history, diffs and commit state', command: 'npx', args: ['-y', '@modelcontextprotocol/server-git'] },
  { id: 'zotero', name: 'Zotero', description: 'Import BibTeX from a Zotero library', command: 'npx', args: ['-y', 'zotero-mcp'] },
];

const MCP_RESOURCES = ['Project sources', 'Bibliography', 'Prompts: fix error, summarize, write section'];

const MCP_TOOLS = [
  'texpro_open_project', 'texpro_project_info', 'texpro_list_files', 'texpro_read_file',
  'texpro_write_file', 'texpro_search', 'texpro_project_symbols', 'texpro_diagnose',
  'texpro_compile', 'texpro_cancel_compile', 'texpro_synctex_forward', 'texpro_synctex_inverse',
  'texpro_render_tikz', 'texpro_list_assets', 'texpro_bib_lookup', 'texpro_template_preview',
];

export function McpPanel({ open, projectRoot, onClose }: Props) {
  const { t } = useI18n();
  const [mcpPath, setMcpPath] = useState('');
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState<{ id: string; tools: Array<{ name: string; description?: string }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [callTool, setCallTool] = useState('');
  const [callArgs, setCallArgs] = useState('{}');
  const [callResult, setCallResult] = useState('');
  const [clientError, setClientError] = useState('');
  const [configs, setConfigs] = useState<Array<{ id: string; name: string; command: string; args: string[] }>>([]);
  const [customName, setCustomName] = useState('My server');
  const [customCommand, setCustomCommand] = useState('npx');
  const [customArgs, setCustomArgs] = useState('-y some-mcp-server');
  const [tab, setTab] = useState<'tools' | 'clients' | 'call'>('tools');

  useEffect(() => {
    if (!open) return;
    void window.texpro.getInfo().then((info) => setMcpPath(info.mcpPath)).catch(() => undefined);
    void window.texpro.mcpConfigs().then(setConfigs).catch(() => undefined);
  }, [open]);

  const config = useMemo(() => JSON.stringify({
    mcpServers: {
      texpro: {
        command: 'node',
        args: [mcpPath || '/path/to/TeXPro/mcp/server.mjs', '--project', projectRoot || '/path/to/project'],
      },
    },
  }, null, 2), [mcpPath, projectRoot]);

  const connect = async (preset: { id: string; name: string; command: string; args: string[] }) => {
    if (!projectRoot || busy) return;
    setBusy(true);
    setClientError('');
    try {
      const args = preset.id === 'texpro' ? [mcpPath, '--project', projectRoot] : preset.args;
      const result = await window.texpro.mcpConnect(preset.id, { command: preset.command, args, cwd: projectRoot });
      setActive({ id: preset.id, tools: result.tools });
      setCallTool(result.tools[0]?.name || '');
      setTab('call');
      setCallResult('');
    } catch (error) {
      setClientError(String(error));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!active) return;
    await window.texpro.mcpDisconnect(active.id);
    setActive(null);
    setCallResult('');
  };

  const call = async () => {
    if (!active || !callTool || busy) return;
    setBusy(true);
    setClientError('');
    try {
      let parsed = {};
      try { parsed = JSON.parse(callArgs || '{}'); } catch { throw new Error(t('Arguments must be valid JSON')); }
      const result = await window.texpro.mcpCall(active.id, callTool, parsed);
      setCallResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setClientError(String(error));
    } finally {
      setBusy(false);
    }
  };

  const installPreset = async (preset: { id: string; name: string; command: string; args: string[] }) => {
    const next = await window.texpro.mcpSaveConfig({ id: preset.id, name: preset.name, command: preset.command, args: preset.args });
    setConfigs(next);
  };

  const removeConfig = async (id: string) => {
    setConfigs(await window.texpro.mcpRemoveConfig(id));
    if (active?.id === id) await disconnect();
  };

  const saveCustom = async () => {
    if (!customName.trim() || !customCommand.trim()) return;
    const config = { id: customName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-'), name: customName.trim(), command: customCommand.trim(), args: customArgs.split(/\s+/).filter(Boolean) };
    setConfigs(await window.texpro.mcpSaveConfig(config));
    setCustomName('My server');
    setCustomArgs('');
  };

  if (!open) return null;

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="mcp-studio" data-testid="mcp-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Plug size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Integration')}</span>
              <h2>{t('TeXPro MCP server')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok"><Terminal size={11} /> stdio</span>
            <button className="icon-btn" onClick={onClose} title={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="mcp-body">
          <div className="mcp-config">
            <div className="pane-label"><Plug size={12} /> {t('Client configuration')}</div>
            <p className="mcp-hint">{t('Add this to Claude Desktop or another MCP client. Restart the client after changing the project.')}</p>
            <pre className="mcp-code">{config}</pre>
            <button className="primary-btn" onClick={async () => { await navigator.clipboard?.writeText(config); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}>
              {copied ? <Check size={12} /> : <Clipboard size={12} />} {copied ? t('Copied') : t('Copy config')}
            </button>
          </div>
          <div className="mcp-tools">
            <div className="mcp-tabs">
              <button className={tab === 'tools' ? 'active' : ''} onClick={() => setTab('tools')}>{t('Tools')}<span>{MCP_TOOLS.length}</span></button>
              <button className={tab === 'clients' ? 'active' : ''} onClick={() => setTab('clients')}>{t('MCP clients')}<span>{active ? 1 : 0}</span></button>
              <button className={tab === 'call' ? 'active' : ''} onClick={() => setTab('call')} disabled={!active}>{t('Call a tool')}</button>
            </div>
            {tab === 'tools' && (
              <>
                <div className="pane-label"><Terminal size={12} /> {t('Exposed tools')}<span className="pane-hint">{MCP_TOOLS.length}</span></div>
                <div className="mcp-tool-list">{MCP_TOOLS.map((name) => <span key={name}>{name}</span>)}</div>
                <div className="pane-label mcp-resource-label"><Terminal size={12} /> {t('Resources & prompts')}<span className="pane-hint">{MCP_RESOURCES.length}</span></div>
                <div className="mcp-tool-list">{MCP_RESOURCES.map((name) => <span key={name}>{t(name)}</span>)}</div>
                <div className="mcp-warning">
                  <strong>{t('Write access is explicit')}</strong>
                  <p>{t('The server only operates inside the project passed with --project. write_file is the only mutating document tool; call it only when the user asks.')}</p>
                </div>
              </>
            )}
            {tab === 'clients' && (
              <>
                <div className="pane-label"><Terminal size={12} /> {t('MCP clients')}<span className="pane-hint">{active ? 1 : 0}</span></div>
                <div className="mcp-market">
                  {[...MCP_MARKET.map((preset) => ({ ...preset, installed: configs.some((item) => item.id === preset.id), custom: false })), ...configs.map((config) => ({ ...config, description: 'Saved custom server', installed: true, custom: true }))].map((preset) => (
                    <div key={preset.id} className={`mcp-market-card ${active?.id === preset.id ? 'connected' : ''}`}>
                      <div>
                        <strong>{preset.name}</strong>
                        <span>{t(preset.description)}</span>
                        <code>{preset.command} {preset.id === 'texpro' ? 'mcp/server.mjs' : preset.args.join(' ')}</code>
                      </div>
                      <div className="mcp-card-actions">
                        <button className="mini-btn" onClick={() => active?.id === preset.id ? void disconnect() : void connect(preset)} disabled={busy || !projectRoot}>
                          {active?.id === preset.id ? t('Disconnect') : t('Connect')}
                        </button>
                        {preset.custom ? (
                          <button className="mini-btn danger" onClick={() => void removeConfig(preset.id)} title={t('Remove server')}><Trash2 size={11} /></button>
                        ) : preset.installed ? (
                          <button className="mini-btn" onClick={() => void removeConfig(preset.id)} title={t('Uninstall')}>{t('Installed')}</button>
                        ) : (
                          <button className="mini-btn" onClick={() => void installPreset(preset)} title={t('Install preset')}>{t('Install')}</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mcp-custom">
                  <input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder={t('Server name')} />
                  <input value={customCommand} onChange={(event) => setCustomCommand(event.target.value)} placeholder="command" />
                  <input value={customArgs} onChange={(event) => setCustomArgs(event.target.value)} placeholder={t('Arguments')} />
                  <button className="mini-btn" onClick={() => void saveCustom()}>{t('Save server')}</button>
                </div>
                <p className="mcp-hint mcp-security">{t('Only connect MCP servers you trust; they run as separate processes with your user permissions.')}</p>
                {clientError && <div className="ai-error">{clientError}</div>}
              </>
            )}
            {tab === 'call' && (
              <>
                <div className="pane-label"><Terminal size={12} /> {t('Call a tool')}<span className="pane-hint">{active?.tools.length || 0}</span></div>
                {active ? (
                  <div className="mcp-call">
                    <select value={callTool} onChange={(event) => setCallTool(event.target.value)}>
                      {active.tools.map((tool) => <option key={tool.name} value={tool.name}>{tool.name}</option>)}
                    </select>
                    <textarea value={callArgs} onChange={(event) => setCallArgs(event.target.value)} spellCheck={false} />
                    <button className="secondary-btn" onClick={() => void call()} disabled={busy || !callTool}>{busy ? t('Running…') : t('Call tool')}</button>
                    {callResult && <pre className="mcp-call-result">{callResult}</pre>}
                  </div>
                ) : <div className="panel-empty">{t('Connect an MCP client first.')}</div>}
              </>
            )}
          </div>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('The MCP server is a separate stdio process and does not depend on the Electron window.')}</span>
          <div className="spacer" />
          <button className="primary-btn" onClick={onClose}>{t('Done')}</button>
        </footer>
      </section>
    </div>
  );
}
