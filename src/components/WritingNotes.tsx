import { Check, Circle, Plus } from 'lucide-react';
import type { WritingNote } from '../lib/writingNotes';
import { useI18n } from '../i18n';

export function WritingNotes({ notes, onOpen, onToggle, onInsert }: { notes: WritingNote[]; onOpen: (note: WritingNote) => void; onToggle: (note: WritingNote) => void; onInsert: () => void }) {
  const { t } = useI18n();
  return <>
    <div className="panel-heading"><span>{t('Writing notes')}</span><button className="mini-btn" onClick={onInsert} title={t('Leave a writing note')} aria-label={t('Leave a writing note')}><Plus size={13} /></button></div>
    {!notes.length && <div className="panel-empty">{t('Leave a TODO comment where your next idea belongs.')}</div>}
    <div className="writing-notes">{[...notes].sort((a, b) => Number(a.done) - Number(b.done)).map(note => <div className={`writing-note ${note.done ? 'done' : ''}`} key={`${note.file}:${note.line}`}>
      <button onClick={() => onToggle(note)} title={t(note.done ? 'Reopen note' : 'Complete note')} aria-label={t(note.done ? 'Reopen note' : 'Complete note')}>{note.done ? <Check size={15} /> : <Circle size={15} />}</button>
      <button onClick={() => onOpen(note)}><span>{note.text || t('Unfinished thought')}</span><small>{note.file.split(/[\\/]/).pop()}:{note.line}</small></button>
    </div>)}</div>
  </>;
}
