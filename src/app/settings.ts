import type { Settings, RecentProject } from '../types';
import { getLanguage } from '../i18n';

export const SETTINGS_KEY = 'texpro.settings.v1';
export const RECENT_KEY = 'texpro.recent.v1';

export const defaultSettings: Settings = {
  theme: 'paper',
  language: getLanguage(),
  fontSize: 17,
  editorWidth: 760,
  engine: 'pdflatex',
  autoCompile: true,
  compileMode: 'idle',
  aiEnabled: false,
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  aiBaseUrl: 'https://api.openai.com/v1',
  autoSave: true,
  followCursor: true,
  typewriter: false,
  focus: false,
  visual: true,
  collapsePreamble: true,
  showLineNumbers: true,
  spellcheck: true,
  smartPaste: true,
  smartInput: true,
  pdfZoom: 0.9,
};

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    delete stored.aiApiKey;
    if (stored.theme === 'glass') stored.theme = 'paper';
    return { ...defaultSettings, ...stored, aiApiKey: '' };
  } catch {
    return { ...defaultSettings, aiApiKey: '' };
  }
}

export function loadRecent(): RecentProject[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    const seen = new Set<string>();
    return stored.filter(item => {
      if (!item || typeof item.root !== 'string' || !item.root.trim() || seen.has(item.root)) return false;
      seen.add(item.root); return true;
    }).slice(0, 8).map(item => ({
      root: item.root,
      name: typeof item.name === 'string' && item.name ? item.name : item.root.split(/[\\/]/).filter(Boolean).pop() || 'Project',
      openedAt: Number.isFinite(item.openedAt) && Math.abs(item.openedAt) < 8.64e15 ? item.openedAt : 0,
    }));
  } catch {
    return [];
  }
}
