import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../i18n';

export interface PaletteAction {
  id: string;
  label: string;
  detail?: string;
  shortcut?: string;
  group?: string;
  keywords?: string;
  icon: LucideIcon;
  run: () => void;
}

interface Props {
  open: boolean;
  actions: PaletteAction[];
  onClose: () => void;
}

export function CommandPalette({ open, actions, onClose }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) => {
      const text = [action.label, action.detail, action.group, action.keywords].filter(Boolean).join(' ').toLowerCase();
      return needle.split(/\s+/).every((part) => text.includes(part));
    });
  }, [actions, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (action: PaletteAction) => {
    onClose();
    window.setTimeout(() => action.run(), 0);
  };

  const handleKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => (filtered.length === 0 ? 0 : (value + 1) % filtered.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => (filtered.length === 0 ? 0 : (value - 1 + filtered.length) % filtered.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const action = filtered[active];
      if (action) run(action);
    }
  };

  const palette = (
    <div className="palette-scrim" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKey}
            placeholder={t('Search actions, files, commands…')}
            aria-label="Command palette"
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 && <div className="palette-empty">{t('No matching action.')}</div>}
          {filtered.map((action, index) => {
            const Icon = action.icon;
            const groupChanged = index === 0 || filtered[index - 1]?.group !== action.group;
            return (
              <div key={action.id}>
                {groupChanged && action.group && <div className="palette-group">{t(action.group)}</div>}
                <button
                  data-index={index}
                  className={`palette-row ${index === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(action)}
                >
                  <span className="palette-icon"><Icon size={15} /></span>
                  <span className="palette-text">
                    <strong>{action.label}</strong>
                    {action.detail && <small>{action.detail}</small>}
                  </span>
                  {action.shortcut && <kbd>{action.shortcut}</kbd>}
                  {index === active && <CornerDownLeft size={12} className="palette-enter" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('navigate')}</span>
          <span><kbd>↵</kbd> {t('run')}</span>
          <span><kbd>esc</kbd> {t('close')}</span>
        </div>
      </div>
    </div>
  );

  return createPortal(palette, document.body);
}
