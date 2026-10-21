import { useEffect, useRef, useState } from 'react';
import { Copy, Network, Radio, Square, Users, X } from 'lucide-react';
import * as Y from 'yjs';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  activeFile: string | null;
  content: string;
  onClose: () => void;
  onApply: (text: string) => void;
}

export function CollabPanel({ open, activeFile, content, onClose, onApply }: Props) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [roomUrl, setRoomUrl] = useState('');
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState(1);
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState(() => localStorage.getItem('texpro.collab.name') || 'Writer');
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const docRef = useRef<Y.Doc | null>(null);
  const textRef = useRef<Y.Text | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const applyingRemote = useRef(false);

  const teardown = () => {
    wsRef.current?.close();
    wsRef.current = null;
    docRef.current?.destroy();
    docRef.current = null;
    textRef.current = null;
    setConnected(false);
    setPeers(1);
  };

  useEffect(() => () => teardown(), []);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'presence', name }));
    }
  }, [name]);

  const close = () => { teardown(); void window.texpro.stopCollab(); onClose(); };

  const connect = async (target: string, seed: string) => {
    if (!target) return;
    teardown();
    setBusy(true);
    setNotice('');
    try {
      const doc = new Y.Doc();
      const ytext = doc.getText('content');
      docRef.current = doc;
      textRef.current = ytext;
      if (seed) ytext.insert(0, seed);
      const socket = new WebSocket(target);
      socket.binaryType = 'arraybuffer';
      wsRef.current = socket;
      socket.onopen = () => {
        setConnected(true);
        socket.send(Y.encodeStateAsUpdate(doc));
        socket.send(JSON.stringify({ type: 'presence', name }));
        setNotice(seed ? t('Session started. Share the link below.') : t('Connected to the shared session.'));
      };
      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'presence') {
              setPeers(message.count || 1);
              if (Array.isArray(message.names)) setNames(message.names);
            }
          } catch { /* ignore */ }
          return;
        }
        Y.applyUpdate(doc, new Uint8Array(event.data));
        applyingRemote.current = true;
        setText(ytext.toString());
        applyingRemote.current = false;
      };
      socket.onerror = () => setNotice(t('Connection failed. Check the LAN address.'));
      socket.onclose = () => { setConnected(false); };
      doc.on('update', (update, origin) => {
        if (origin === 'remote') return;
        if (socket.readyState === WebSocket.OPEN) socket.send(update);
      });
      ytext.observe(() => setText(ytext.toString()));
      setText(ytext.toString());
      setRoomUrl(target);
    } finally {
      setBusy(false);
    }
  };

  const host = async () => {
    setBusy(true);
    try {
      const status = await window.texpro.startCollab({ port: 4177 });
      if (status.url) {
        setUrl(status.url);
        await connect(status.url, content);
      }
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  };

  const changeText = (value: string) => {
    setText(value);
    if (applyingRemote.current) return;
    const ytext = textRef.current;
    if (!ytext) return;
    ytext.doc?.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, value);
    });
  };

  if (!open) return null;
  return (
    <div className="modal-scrim" onMouseDown={close}>
      <section className="collab-studio" data-testid="collab-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Network size={18} /></div>
            <div><span className="modal-eyebrow">{t('Collaboration')}</span><h2>{t('Writing room')}</h2></div>
          </div>
          <div className="studio-header-actions">
            <span className={`studio-engine ${connected ? 'ok' : ''}`}>{connected ? `${peers} ${t('online')}` : t('Offline')}</span>
            <button className="icon-btn" onClick={close}><X size={16} /></button>
          </div>
        </header>
        <div className="collab-body">
          <aside className="collab-side">
            <div className="pane-label"><Radio size={12} /> {t('Host a session')}</div>
            <label className="workshop-field"><span>{t('Your name')}</span><input value={name} onChange={(event) => { setName(event.target.value); localStorage.setItem('texpro.collab.name', event.target.value); }} /></label>
            <p className="schematic-hint">{t('Only devices on the same local network can join. The session ends when you close this window.')}</p>
            <button className="primary-btn" onClick={() => void host()} disabled={busy || connected}>{t('Start hosting')}</button>
            {url && (
              <div className="collab-link">
                <input value={url} readOnly />
                <button className="icon-btn" onClick={() => void navigator.clipboard?.writeText(url)} title={t('Copy link')}><Copy size={12} /></button>
              </div>
            )}
            <div className="pane-label collaborate-join"><Users size={12} /> {t('Join a session')}</div>
            <input className="collab-input" value={joinUrl} onChange={(event) => setJoinUrl(event.target.value)} placeholder="ws://192.168.1.8:4177?room=…" />
            <button className="secondary-btn" onClick={() => void connect(joinUrl, '')} disabled={!joinUrl || busy}>{t('Join')}</button>
            <button className="danger-btn" onClick={() => { teardown(); void window.texpro.stopCollab(); setUrl(''); setRoomUrl(''); }}><Square size={11} /> {t('Disconnect')}</button>
          </aside>
          <main className="collab-main">
            <div className="collab-main-head">
              <span>{activeFile ? activeFile.split('/').pop() : t('Shared draft')}</span>
              <div className="collab-people">{names.length ? names.map((person, index) => <span key={`${person}-${index}`} className={`collab-person tone-${index % 4}`}>{person}</span>) : <small>{t('Yjs CRDT · live text')}</small>}</div>
            </div>
            <textarea value={text} onChange={(event) => changeText(event.target.value)} placeholder={t('The shared document will appear here.')} spellCheck={false} />
            {notice && <div className="collab-notice">{notice}</div>}
          </main>
        </div>
        <footer className="studio-footer">
          <span className="studio-hint">{t('Conflicts are merged automatically by Yjs. Apply when you are happy with the shared text.')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={close}>{t('Cancel')}</button>
          <button className="primary-btn" onClick={() => { onApply(text); onClose(); }} disabled={!text}>{t('Apply to document')}</button>
        </footer>
      </section>
    </div>
  );
}
