import { BarChart3, LayoutTemplate, PenTool, X } from 'lucide-react';
import type { Settings, ThemeName } from '../types';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onOpenTemplates: () => void;
  onOpenChart: () => void;
  onOpenTikz: () => void;
}

const themes: Array<{ id: ThemeName; label: string; color: string }> = [
  { id: 'studio', label: 'Studio', color: '#1b1b1e' },
  { id: 'night', label: 'Night', color: '#111214' },
  { id: 'paper', label: 'Paper', color: '#f4efe5' },
];

export function SettingsPanel({
  open,
  settings,
  onChange,
  onClose,
  onOpenTemplates,
  onOpenChart,
  onOpenTikz,
}: Props) {
  const { t } = useI18n();
  if (!open) return null;

  const Toggle = ({
    checked,
    onChange: setChecked,
    label,
    detail,
  }: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    detail: string;
  }) => (
    <div className="setting-row">
      <span className="setting-copy">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? 'on' : ''}`}
        onClick={() => setChecked(!checked)}
      >
        <span />
      </button>
    </div>
  );

  return (
    <div className="settings-scrim" onMouseDown={onClose}>
      <aside className="settings-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-header">
          <div>
            <span className="settings-eyebrow">{t('Preferences')}</span>
            <h2>{t('Make it yours')}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} title={t('Close')}>
            <X size={16} />
          </button>
        </header>

        <div className="settings-body">
          <div className="settings-section">
            <div className="settings-section-title">{t('Language')}</div>
            <label className="select-row">
              <span>{t('Interface language')}</span>
              <select
                value={settings.language}
                onChange={(event) => onChange({ language: event.target.value as Settings['language'] })}
              >
                <option value="zh">{t('Chinese')}</option>
                <option value="en">{t('English')}</option>
              </select>
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">{t('Appearance')}</div>
            <div className="theme-grid">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-card ${settings.theme === theme.id ? 'active' : ''}`}
                  onClick={() => onChange({ theme: theme.id })}
                >
                  <span className="theme-swatch" style={{ background: theme.color }} />
                  <span>{t(theme.label)}</span>
                </button>
              ))}
            </div>
            <div className="setting-row compact-row">
              <span className="setting-copy">
                <strong>{t('Toggle light / dark')}</strong>
                <small>{t('Toggle light / dark theme')} · ⌘⇧L</small>
              </span>
              <button
                className="secondary-btn"
                onClick={() => onChange({ theme: settings.theme === 'paper' ? 'night' : 'paper' })}
              >
                {settings.theme === 'paper' ? t('Night') : t('Day')}
              </button>
            </div>
            <label className="range-row">
              <span>{t('Editor font size')} <em>{settings.fontSize}px</em></span>
              <input
                type="range"
                min={13}
                max={22}
                step={1}
                value={settings.fontSize}
                onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
              />
            </label>
            <label className="range-row">
              <span>{t('Reading width')} <em>{settings.editorWidth}px</em></span>
              <input
                type="range"
                min={620}
                max={980}
                step={20}
                value={settings.editorWidth}
                onChange={(event) => onChange({ editorWidth: Number(event.target.value) })}
              />
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">{t('Writing')}</div>
            <Toggle
              label={t('Visual editing')}
              detail={t('Render math, headings, tables and images inline')}
              checked={settings.visual}
              onChange={(value) => onChange({ visual: value })}
            />
            <Toggle
              label={t('Collapse preamble')}
              detail={t('Fold documentclass and package setup into one card')}
              checked={settings.collapsePreamble}
              onChange={(value) => onChange({ collapsePreamble: value })}
            />
            <Toggle
              label={t('Focus mode')}
              detail={t('Dim every paragraph except the one you are writing')}
              checked={settings.focus}
              onChange={(value) => onChange({ focus: value })}
            />
            <Toggle
              label={t('Typewriter scrolling')}
              detail={t('Keep the caret at a fixed vertical position')}
              checked={settings.typewriter}
              onChange={(value) => onChange({ typewriter: value })}
            />
            <Toggle
              label={t('Smart paste')}
              detail={t('Convert rich HTML, Unicode math and smart punctuation into clean LaTeX')}
              checked={settings.smartPaste}
              onChange={(value) => onChange({ smartPaste: value })}
            />
            <Toggle
              label={t('Spell check')}
              detail={t('Underline likely misspellings in prose, ignoring commands and math')}
              checked={settings.spellcheck}
              onChange={(value) => onChange({ spellcheck: value })}
            />
            <Toggle
              label={t('Show line numbers')}
              detail={t('Display a gutter with source line numbers')}
              checked={settings.showLineNumbers}
              onChange={(value) => onChange({ showLineNumbers: value })}
            />
          </div>

          <div className="settings-section">
            <div className="settings-section-title">{t('Build')}</div>
            <label className="select-row">
              <span>{t('Default engine')}</span>
              <select
                value={settings.engine}
                onChange={(event) => onChange({ engine: event.target.value as Settings['engine'] })}
              >
                <option value="pdflatex">pdfLaTeX</option>
                <option value="xelatex">XeLaTeX</option>
                <option value="lualatex">LuaLaTeX</option>
              </select>
            </label>
            <label className="select-row">
              <span>{t('Compile strategy')}</span>
              <select
                value={settings.compileMode}
                onChange={(event) => onChange({ compileMode: event.target.value as Settings['compileMode'] })}
              >
                <option value="idle">{t('After idle')}</option>
                <option value="pdfOpen">{t('Only when PDF is open')}</option>
                <option value="manual">{t('Manual only')}</option>
              </select>
            </label>
            <Toggle
              label={t('Auto save')}
              detail={t('Write changes to disk shortly after editing')}
              checked={settings.autoSave}
              onChange={(value) => onChange({ autoSave: value })}
            />
            <Toggle
              label={t('PDF follows cursor')}
              detail={t('Forward-search after the cursor settles')}
              checked={settings.followCursor}
              onChange={(value) => onChange({ followCursor: value })}
            />
            <div className="settings-subhead">{t('Optional AI')}</div>
            <Toggle
              label={t('Enable AI assistant')}
              detail={t('Off by default; requests are sent only when you press Run')}
              checked={settings.aiEnabled}
              onChange={(value) => onChange({ aiEnabled: value })}
            />
            <label className="settings-text-row">
              <span>{t('API key')}</span>
              <input type="password" value={settings.aiApiKey} onChange={(event) => onChange({ aiApiKey: event.target.value })} placeholder="sk-…" />
            </label>
            <p className="settings-hint">{t('The API key is encrypted with the OS keychain, never written to localStorage.')}</p>
            <label className="settings-text-row">
              <span>{t('Model')}</span>
              <input value={settings.aiModel} onChange={(event) => onChange({ aiModel: event.target.value })} placeholder="gpt-4o-mini" />
            </label>
            <label className="settings-text-row">
              <span>{t('Base URL')}</span>
              <input value={settings.aiBaseUrl} onChange={(event) => onChange({ aiBaseUrl: event.target.value })} placeholder="https://api.openai.com/v1" />
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">{t('Tools')}</div>
            <div className="settings-tool-grid">
              <button onClick={onOpenTemplates}>
                <LayoutTemplate size={15} />
                <span>{t('Templates')}</span>
              </button>
              <button onClick={onOpenChart}>
                <BarChart3 size={15} />
                <span>{t('Chart studio')}</span>
              </button>
              <button onClick={onOpenTikz}>
                <PenTool size={15} />
                <span>TikZ Studio</span>
              </button>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">{t('Shortcuts')}</div>
            <div className="shortcut-grid">
              <span>{t('Compile')}</span><kbd>⌘ ↩</kbd>
              <span>{t('Save')}</span><kbd>⌘ S</kbd>
              <span>{t('Command palette')}</span><kbd>⌘ K</kbd>
              <span>{t('Toggle light / dark')}</span><kbd>⌘ ⇧ L</kbd>
              <span>{t('Visual mode')}</span><kbd>⌘ ⇧ M</kbd>
              <span>{t('Focus mode')}</span><kbd>⌘ ⇧ F</kbd>
              <span>{t('Typewriter scrolling')}</span><kbd>⌘ ⇧ T</kbd>
              <span>{t('Toggle PDF preview')}</span><kbd>⌘ ⌥ P</kbd>
              <span>{t('Toggle sidebar')}</span><kbd>⌘ \</kbd>
              <span>{t('Forward search PDF')}</span><kbd>⌘ ⇧ J</kbd>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
