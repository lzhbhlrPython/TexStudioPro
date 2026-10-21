import { useEffect, useRef, useState } from 'react';
import { Copy, Network, Radio, Square, Users, X } from 'lucide-react';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { yCollab } from 'y-codemirror.next';
import type { Extension } from '@codemirror/state';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  activeFile: string | null;
  content: string;
  onClose: () => void;
  onSessionChange: (extension: Extension | null, file: string | null) => void;
}

const colors = ['#b4532a', '#3f7d62', '#477a9a', '#8a6a9d'];

export function CollabPanel({ open, activeFile, content, onClose, onSessionChange }: Props) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState(1);
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState(() => localStorage.getItem('texpro.collab.name') || 'Writer');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const docRef = useRef<Y.Doc | null>(null);
  const textRef = useRef<Y.Text | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const sessionFileRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const teardown = () => {
    onSessionChange(null, null);
    wsRef.current?.close();
    wsRef.current = null;
    awarenessRef.current?.destroy();
    awarenessRef.current = null;
    docRef.current?.destroy();
    docRef.current = null;
    textRef.current = null;
    sessionFileRef.current = null;
    setConnected(false);
    setPeers(1);
  };

  useEffect(() => () => teardown(), []);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'presence', name }));
    }
  }, [name]);

  useEffect(() => {
    if (!connected || !sessionFileRef.current || !activeFile) return;
    if (activeFile !== sessionFileRef.current) {
      teardown();
      void window.texpro.stopCollab();
      setNotice(t('Session ended because the active file changed.'));
    }
  }, [activeFile, connected]);

  const hide = () => onClose();
  const leave = () => { teardown(); void window.texpro.stopCollab(); onClose(); };

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
      sessionFileRef.current = activeFile;
      if (seed) ytext.insert(0, seed);
      const awareness = new Awareness(doc);
      awarenessRef.current = awareness;
      awareness.setLocalStateField('user', { name, color: colors[Math.floor(Math.random() * colors.length)] });
      const extension = yCollab(ytext, awareness);
      const socket = new WebSocket(target);
      socket.binaryType = 'arraybuffer';
      wsRef.current = socket;
      socket.onopen = () => {
        setConnected(true);
        socket.send(Y.encodeStateAsUpdate(doc));
        socket.send(JSON.stringify({ type: 'presence', name }));
        setupAwarenessRelay(socket, awareness);
        window.setTimeout(() => { if (docRef.current === doc) onSessionChange(extension, activeFile); }, 80);
        setNotice(seed ? t('Session started. The main editor is now shared.') : t('Connected. The main editor is now shared.'));
      };
      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'presence') {
              setPeers(message.count || 1);
              if (Array.isArray(message.names)) setNames(message.names);
            } else if (message.type === 'awareness' && message.payload) {
              applyAwarenessUpdate(awareness, new Uint8Array(message.payload), 'remote');
            }
          } catch { /* ignore */ }
          return;
        }
        Y.applyUpdate(doc, new Uint8Array(event.data), 'remote');
      };
      socket.onerror = () => setNotice(t('Connection failed. Check the LAN address.'));
      socket.onclose = () => { setConnected(false); };
      doc.on('update', (update, origin) => {
        if (origin === 'remote') return;
        if (socket.readyState === WebSocket.OPEN) socket.send(update);
      });
      const initialUrl = target;
      setUrl(initialUrl);
    } finally {
      setBusy(false);
    }
  };

  const setupAwarenessRelay = (socket: WebSocket, awareness: Awareness) => {
    const listener = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === 'remote' || socket.readyState !== WebSocket.OPEN) return;
      const changed = [...added, ...updated, ...removed];
      const payload = Array.from(encodeAwarenessUpdate(awareness, changed));
      socket.send(JSON.stringify({ type: 'awareness', payload }));
    };
    awareness.on('update', listener);
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

  if (!open) return null;
  return (
    <div className="collab-scrim" onMouseDown={hide}>
      <section className="collab-studio" data-testid="collab-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Network size={18} /></div>
            <div><span className="modal-eyebrow">{t('Collaboration')}</span><h2>{t('Writing room')}</h2></div>
          </div>
          <div className="studio-header-actions">
            <span className={`studio-engine ${connected ? 'ok' : ''}`}>{connected ? `${peers} ${t('online')}` : t('Offline')}</span>
            <button className="icon-btn" onClick={hide}><X size={16} /></button>
          </div>
        </header>
        <div className="collab-body">
          <aside className="collab-side">
            <div className="pane-label"><Radio size={12} /> {t('Host a session')}</div>
            <label className="workshop-field"><span>{t('Your name')}</span><input value={name} onChange={(event) => { setName(event.target.value); localStorage.setItem('texpro.collab.name', event.target.value); }} /></label>
            <p className="schematic-hint">{t('Only devices on the same local network can join. The main editor becomes the shared document.')}</p>
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
            <button className="danger-btn" onClick={leave}><Square size={11} /> {t('Leave room')}</button>
          </aside>
          <main className="collab-main">
            <div className="collab-main-head">
              <span>{activeFile ? activeFile.split('/').pop() : t('Shared draft')}</span>
              <div className="collab-people">{names.length ? names.map((person, index) => <span key={`${person}-${index}`} className={`collab-person tone-${index % 4}`}><i>{person.slice(0, 1).toUpperCase()}</i>{person}</span>) : <small>{t('Yjs CRDT · live cursors')}</small>}</div>
            </div>
            <div className="collab-editor-state">
              <Network size={24} />
              <strong>{connected ? t('The main editor is shared') : t('Connect to start a writing room')}</strong>
              <span>{connected ? t('Type in the editor behind this panel. Cursors, selections and text sync through Yjs.') : t('Host a room or join a LAN link; the document stays in the main CodeMirror editor.')}</span>
              {connected && <div className="collab-live-badge"><span /><span /><span /> {t('Live sync active')}</div>}
            </div>
            {notice && <div className="collab-notice">{notice}</div>}
          </main>
        </div>
        <footer className="studio-footer">
          <span className="studio-hint">{t('Yjs merges concurrent edits. The file remains the document of record.')}</span>
          <div className="spacer" />
          <button className="primary-btn" onClick={hide}>{t('Back to document')}</button>
        </footer>
      </section>
    </div>
  );
}
