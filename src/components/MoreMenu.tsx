import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../i18n';

export interface MoreAction {
  id: string;
  label: string;
  group?: string;
  shortcut?: string;
  icon: LucideIcon;
  run: () => void;
}

interface Props {
  open: boolean;
  actions: MoreAction[];
  onClose: () => void;
}

const groupOrder = ['File', 'Insert', 'Format', 'Project', 'Review', 'Tools', 'View', 'Build'];

export function MoreMenu({ open, actions, onClose }: Props) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  const ordered = [...actions].sort((a, b) => groupOrder.indexOf(a.group || '') - groupOrder.indexOf(b.group || ''));

  return createPortal(
    <div className="more-scrim" onMouseDown={onClose}>
      <div className="more-menu" onMouseDown={(event) => event.stopPropagation()}>
        {ordered.map((action, index) => {
          const Icon = action.icon;
          const showGroup = action.group && ordered[index - 1]?.group !== action.group;
          return (
            <div key={action.id}>
              {showGroup && <div className="more-group">{t(action.group || '')}</div>}
              <button
                data-action={action.id}
                className="more-row"
                onClick={() => {
                  onClose();
                  window.setTimeout(action.run, 0);
                }}
              >
                <Icon size={14} />
                <span>{t(action.label)}</span>
                {action.shortcut && <kbd>{action.shortcut}</kbd>}
              </button>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
