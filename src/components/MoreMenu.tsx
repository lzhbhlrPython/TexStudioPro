import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, type LucideIcon } from 'lucide-react';
import { useI18n } from '../i18n';
import { useDialogFocus } from '../hooks/useDialogFocus';

export interface MoreAction {
  id: string;
  label: string;
  group?: string;
  shortcut?: string;
  icon: LucideIcon;
  run: () => void;
}
interface Props { open: boolean; actions: MoreAction[]; onClose: () => void }
const groupOrder = ['File', 'Edit', 'Insert', 'Format', 'Project', 'Review', 'Tools', 'View', 'Build'];

export function MoreMenu({ open, actions, onClose }: Props) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (open) { setQuery(''); setGroup(''); } }, [open]);
  useDialogFocus(open, ref, onClose);
  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return [...actions].filter((action) => {
      const text = `${action.label} ${t(action.label)} ${action.group} ${t(action.group || '')}`.toLowerCase();
      return (!group || action.group === group) && words.every((word) => text.includes(word));
    }).sort((a, b) => groupOrder.indexOf(a.group || '') - groupOrder.indexOf(b.group || ''));
  }, [actions, query, group, language]);
  if (!open) return null;
  const run = (action: MoreAction) => { onClose(); window.setTimeout(action.run, 0); };
  return createPortal(
    <div className="more-scrim" onMouseDown={onClose}>
      <div ref={ref} className="more-menu workbench-menu" role="dialog" aria-modal="true" aria-label={t('Tools and actions')} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          const rows = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[data-action]') || []);
          const index = rows.indexOf(document.activeElement as HTMLButtonElement);
          rows[(index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
        }}>
        <div className="workbench-menu-search"><Search size={16} /><input data-autofocus aria-label={t('Find a tool')} placeholder={t('Find a tool')} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && filtered[0]) run(filtered[0]); }} /><button className="icon-btn" onClick={onClose} aria-label={t('Close')}><X size={15} /></button></div>
        <nav className="workbench-menu-groups" aria-label={t('Tool categories')}>
          {['', ...groupOrder.filter((name) => actions.some((action) => action.group === name))].map((name) => <button key={name} aria-pressed={group === name} className={group === name ? 'active' : ''} onClick={() => setGroup(name)}>{t(name || 'All tools')}</button>)}
        </nav>
        <div className="workbench-menu-list">
          {!filtered.length && <div className="workbench-menu-empty"><strong>{t('No matching tool')}</strong><span>{t('Try another name or choose All tools.')}</span><button className="secondary-btn" onClick={() => { setQuery(''); setGroup(''); }}>{t('Clear filters')}</button></div>}
          {filtered.map((action, index) => {
            const Icon = action.icon;
            return <div key={action.id}>
              {action.group && filtered[index - 1]?.group !== action.group && <div className="more-group">{t(action.group)}</div>}
              <button data-action={action.id} className="more-row" onClick={() => run(action)}><Icon size={15} /><span>{t(action.label)}</span>{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>
            </div>;
          })}
        </div>
        <div className="workbench-menu-footer"><span>{filtered.length} {t('actions')}</span><span>↑ ↓ {t('navigate')} · esc {t('close')}</span></div>
      </div>
    </div>, document.body,
  );
}
