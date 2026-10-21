import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Loader2, Settings2, Sparkles, X } from 'lucide-react';
import { aiChatStream, parseAgentActions, type AgentAction, type AiSettings } from '../lib/ai';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  settings: AiSettings;
  compileError: string;
  defaultContext: string;
  selection: string;
  onClose: () => void;
  onInsert: (text: string) => void;
  onOpenSettings: () => void;
  onApplyAction: (action: AgentAction) => void;
}

type Task = 'explain' | 'rewrite' | 'translate-zh' | 'translate-en' | 'formula' | 'agent';

const tasks: Array<{ id: Task; label: string; system: string }> = [
  {
    id: 'explain',
    label: 'Explain compile error',
    system: 'You are a LaTeX debugging assistant. Explain the error concisely in the user language, identify the likely cause, and give a minimal corrected snippet. Do not invent file contents.',
  },
  {
    id: 'rewrite',
    label: 'Rewrite clearly',
    system: 'Rewrite the supplied LaTeX prose to be clearer and more concise while preserving all LaTeX commands, citations, labels, and math. Return only the rewritten LaTeX.',
  },
  {
    id: 'translate-zh',
    label: 'Translate to Chinese',
    system: 'Translate the supplied LaTeX prose to natural academic Chinese. Preserve all LaTeX commands, citations, labels and math exactly. Return only the translated LaTeX.',
  },
  {
    id: 'translate-en',
    label: 'Translate to English',
    system: 'Translate the supplied LaTeX prose to natural academic English. Preserve all LaTeX commands, citations, labels and math exactly. Return only the translated LaTeX.',
  },
  {
    id: 'formula',
    label: 'LaTeX from description',
    system: 'Convert the user description into a single LaTeX math expression. Return only the LaTeX math, without dollar signs or explanation.',
  },
  {
    id: 'agent',
    label: 'Agent actions',
    system: 'You are a controlled LaTeX editing agent. Return ONLY valid JSON: {"actions":[{"type":"insert|replace-selection|replace-document","text":"...","reason":"..."}]}. Never output prose outside JSON. Only propose changes directly supported by the user request. Keep existing LaTeX commands unless asked to rewrite them.',
  },
];

export function AIAssistant({ open, settings, compileError, defaultContext, selection, onClose, onInsert, onOpenSettings, onApplyAction }: Props) {
  const { t } = useI18n();
  const [task, setTask] = useState<Task>('rewrite');
  const [context, setContext] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [applied, setApplied] = useState<number[]>([]);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setOutput('');
    setError('');
    setActions([]);
    setApplied([]);
    setContext(task === 'explain' ? compileError : task === 'agent' ? selection : defaultContext);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (task === 'explain') setContext(compileError);
    if (task === 'agent') setContext(selection || defaultContext);
  }, [task, open, compileError, selection, defaultContext]);

  useEffect(() => () => controller.current?.abort(), []);

  if (!open) return null;

  const run = async () => {
    const definition = tasks.find((item) => item.id === task) || tasks[0];
    setBusy(true);
    setError('');
    setOutput('');
    setActions([]);
    setApplied([]);
    const nextController = new AbortController();
    controller.current = nextController;
    try {
      const full = await aiChatStream(
        settings,
        definition.system,
        context.trim() || t('No context provided.'),
        (_delta, complete) => setOutput(complete),
        nextController.signal,
      );
      if (task === 'agent') {
        const parsed = parseAgentActions(full);
        setActions(parsed);
        if (!parsed.length) setError(t('The model did not return valid agent actions.'));
      }
    } catch (failure) {
      if ((failure as Error)?.name !== 'AbortError') setError(String(failure));
    } finally {
      setBusy(false);
      controller.current = null;
    }
  };

  const configured = settings.enabled && Boolean(settings.apiKey.trim());

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="ai-studio" data-testid="ai-assistant" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Bot size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Optional')}</span>
              <h2>{t('AI assistant')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className={`studio-engine ${configured ? 'ok' : ''}`}><Sparkles size={11} /> {configured ? settings.model : t('Not configured')}</span>
            <button className="icon-btn" onClick={onClose} title={t('Close')}><X size={16} /></button>
          </div>
        </header>

        {!configured ? (
          <div className="ai-setup">
            <Sparkles size={30} />
            <h3>{t('Use your own model provider')}</h3>
            <p>{t('AI is off by default. Add an OpenAI-compatible endpoint and key in Settings; requests are sent only when you press Run.')}</p>
            <button className="primary-btn" onClick={() => { onClose(); onOpenSettings(); }}><Settings2 size={13} /> {t('Open Settings')}</button>
          </div>
        ) : (
          <div className="ai-body">
            <div className="ai-tasks">
              {tasks.map((item) => (
                <button key={item.id} className={`ai-task ${task === item.id ? 'active' : ''}`} onClick={() => setTask(item.id)}>
                  {t(item.label)}
                </button>
              ))}
              <p className="ai-privacy">{t('Only the text in the box below is sent. API keys stay in local app settings.')}</p>
            </div>
            <div className="ai-work">
              <label className="ai-context-label">
                <span>{t('Context')}</span>
                <textarea value={context} onChange={(event) => setContext(event.target.value)} spellCheck={false} />
              </label>
              <div className="ai-actions">
                <button className="primary-btn" onClick={() => void run()} disabled={busy}>
                  {busy ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} {t('Run')}
                </button>
                {busy && <button className="secondary-btn" onClick={() => controller.current?.abort()}>{t('Stop')}</button>}
                {output && !busy && task !== 'agent' && (
                  <button className="secondary-btn" onClick={() => { onInsert(output); onClose(); }}>
                    <Check size={12} /> {t('Insert result')}
                  </button>
                )}
              </div>
              {error && <div className="ai-error">{error}</div>}
              {actions.length > 0 && (
                <div className="ai-actions-list">
                  {actions.map((action, index) => (
                    <div className="ai-action-card" key={index}>
                      <div className="ai-action-head">
                        <strong>{t(action.type)}</strong>
                        {action.reason && <span>{action.reason}</span>}
                      </div>
                      <pre>{action.text}</pre>
                      <button
                        className="secondary-btn"
                        disabled={applied.includes(index)}
                        onClick={() => { onApplyAction(action); setApplied((current) => [...current, index]); }}
                      >
                        {applied.includes(index) ? <Check size={12} /> : null} {applied.includes(index) ? t('Applied') : t('Apply action')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="ai-output">
                {output || <span className="ai-placeholder">{t('The result will appear here.')}</span>}
              </div>
            </div>
          </div>
        )}

        <footer className="studio-footer">
          <span className="studio-hint">{t('AI is optional and never runs automatically.')}</span>
          <div className="spacer" />
          <button className="primary-btn" onClick={onClose}>{t('Done')}</button>
        </footer>
      </section>
    </div>
  );
}
