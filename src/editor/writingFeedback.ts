import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { Diagnostic } from '../types';
import { composingWriting, writingComposition } from './writing';
import { t } from '../i18n';

export const writingDiagnostics = StateEffect.define<{ items: Diagnostic[]; stale: boolean }>();
const feedbackData = StateField.define<{ items: Array<Diagnostic & { pos: number }>; stale: boolean }>({
  create: () => ({ items: [], stale: false }),
  update(value, tr) {
    if (tr.docChanged) value = { stale: true, items: value.items.map(item => ({ ...item, pos: tr.changes.mapPos(item.pos) })) };
    for (const effect of tr.effects) if (effect.is(writingDiagnostics)) value = { stale: effect.value.stale, items: effect.value.items.filter(item => item.line && item.source !== 'spellcheck').map(item => ({ ...item, pos: tr.state.doc.line(Math.max(1, Math.min(tr.state.doc.lines, item.line!))).from })) };
    return value;
  },
});

function explanation(message: string) {
  if (/Missing \$ inserted/i.test(message)) return t('Put mathematical commands inside $...$ or a math environment.');
  if (/Undefined control sequence/i.test(message)) return t('Check the command spelling and the packages in the main file.');
  if (/Runaway argument|File ended while scanning/i.test(message)) return t('Check for an unclosed brace or environment before this line.');
  if (/not found|cannot find/i.test(message)) return t('Check the referenced path and whether the file exists.');
  if (/alignment tab|Extra alignment/i.test(message)) return t('Check the table column count; use \\& for a literal ampersand.');
  return '';
}

class FeedbackWidget extends WidgetType {
  constructor(readonly items: Diagnostic[], readonly stale: boolean) { super(); }
  eq(other: FeedbackWidget) { return other.stale === this.stale && JSON.stringify(other.items) === JSON.stringify(this.items); }
  toDOM() {
    const dom = document.createElement('div'); dom.className = 'cm-writing-feedback'; dom.setAttribute('role', 'note');
    for (const item of this.items.slice(0, 3)) {
      const message = document.createElement('span'); message.textContent = item.message; dom.appendChild(message);
      const help = explanation(item.message); if (help) { const hint = document.createElement('small'); hint.textContent = help; dom.appendChild(hint); }
    }
    if (this.stale) { const stale = document.createElement('small'); stale.textContent = t('Source changed. Compile again to refresh this message.'); dom.appendChild(stale); }
    return dom;
  }
  ignoreEvent() { return true; }
}

export const writingFeedback = [feedbackData, StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    if (tr.state.field(writingComposition)) return value.map(tr.changes);
    if (!tr.docChanged && !tr.selection && !tr.effects.some(effect => effect.is(writingDiagnostics) || effect.is(composingWriting))) return value;
    const data = tr.state.field(feedbackData), line = tr.state.doc.lineAt(tr.state.selection.main.head);
    const items = data.items.filter(item => tr.state.doc.lineAt(item.pos).number === line.number);
    return items.length ? Decoration.set([Decoration.widget({ widget: new FeedbackWidget(items, data.stale), block: true, side: 1 }).range(line.to)]) : Decoration.none;
  },
  provide: field => EditorView.decorations.from(field),
})];
