import { useI18n } from '../i18n';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  message: string;
  detail?: string;
  kind: 'success' | 'error' | 'info';
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function Toasts({ toasts, onDismiss }: Props) {
  const { t } = useI18n();
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          {toast.kind === 'success' ? (
            <CheckCircle2 size={15} />
          ) : toast.kind === 'error' ? (
            <AlertCircle size={15} />
          ) : (
            <Info size={15} />
          )}
          <div className="toast-copy">
            <strong>{toast.message}</strong>
            {toast.detail && <small>{toast.detail}</small>}
          </div>
          <button onClick={() => onDismiss(toast.id)} aria-label={t('Dismiss')}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
