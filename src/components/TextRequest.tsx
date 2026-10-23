import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useI18n } from '../i18n';

interface Request { title: string; value: string; allowEmpty: boolean; resolve: (value: string | null) => void }
let current: Request | null = null;
const listeners = new Set<() => void>();
function settle(value: string | null) { const request = current; current = null; listeners.forEach(listener => listener()); request?.resolve(value); }
export function requestText(title: string, value = '', allowEmpty = false): Promise<string | null> {
  settle(null);
  return new Promise(resolve => { current = { title, value, allowEmpty, resolve }; listeners.forEach(listener => listener()); });
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function TextRequestHost({ projectKey }: { projectKey: string }) {
  const request = useSyncExternalStore(subscribe, () => current);
  useEffect(() => () => settle(null), [projectKey]);
  return request ? <TextRequestDialog key={request.title + request.value} request={request} /> : null;
}
function TextRequestDialog({ request }: { request: Request }) {
  const { t } = useI18n(), ref = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(request.value);
  useDialogFocus(true, ref, () => settle(null));
  return createPortal(<div className="modal-scrim text-request-scrim" onMouseDown={() => settle(null)}>
    <section ref={ref} className="text-request" role="dialog" aria-modal="true" aria-labelledby="text-request-title" onMouseDown={event => event.stopPropagation()}>
      <form onSubmit={event => { event.preventDefault(); if (request.allowEmpty || value.trim()) settle(value.trim()); }}>
        <h2 id="text-request-title">{request.title}</h2>
        <input data-autofocus aria-label={request.title} value={value} onChange={event => setValue(event.target.value)} onFocus={event => event.currentTarget.select()} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <footer><button type="button" className="secondary-btn" onClick={() => settle(null)}>{t('Cancel')}</button><button className="primary-btn" type="submit" disabled={!request.allowEmpty && !value.trim()}>{t('Continue')}</button></footer>
      </form>
    </section>
  </div>, document.body);
}
