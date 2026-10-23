import { StateEffect, StateField, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { writingRevisions, type WritingRevision } from '../lib/writingRevisions';
import { composingWriting, writingComposition } from './writing';
import { t } from '../i18n';

export const reviewWriting = StateEffect.define<{ source: string; label: string } | null>();
const keepRevision = StateEffect.define<WritingRevision>();
const reviewBaseline = StateField.define<{ source: string; label: string } | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(reviewWriting)) value = effect.value;
      if (effect.is(keepRevision) && value) {
        const h = effect.value;
        value = { ...value, source: value.source.slice(0, h.oldFrom) + h.after + value.source.slice(h.oldTo) };
      }
    }
    return value;
  },
});
export const reviewedRanges = StateField.define<WritingRevision[]>({
  create: () => [],
  update(value, tr) {
    if (tr.state.field(writingComposition)) return value;
    if (!tr.docChanged && !tr.effects.some(effect => effect.is(reviewWriting) || effect.is(keepRevision) || effect.is(composingWriting))) return value;
    const baseline = tr.state.field(reviewBaseline);
    return baseline ? writingRevisions(baseline.source, tr.state.doc.toString()) : [];
  },
});

class RevisionWidget extends WidgetType {
  constructor(readonly hunk: WritingRevision) { super(); }
  eq(other: RevisionWidget) { return JSON.stringify(other.hunk) === JSON.stringify(this.hunk); }
  toDOM(view: EditorView) {
    const dom = document.createElement('div'); dom.className = 'cm-writing-revision';
    if (this.hunk.before) { const before = document.createElement('pre'); before.className = 'cm-revision-before'; before.textContent = this.hunk.before; dom.appendChild(before); }
    const tools = document.createElement('div'); tools.className = 'cm-revision-tools';
    for (const [label, restore] of [['Keep this change', false], ['Restore this passage', true]] as const) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = t(label);
      button.addEventListener('mousedown', e => e.preventDefault());
      button.addEventListener('click', () => {
        if (restore) view.dispatch({ changes: { from: this.hunk.from, to: this.hunk.to, insert: this.hunk.before }, annotations: isolateHistory.of('full'), effects: view.scrollSnapshot() });
        else view.dispatch({ effects: keepRevision.of(this.hunk) });
        view.focus();
      }); tools.appendChild(button);
    }
    dom.appendChild(tools); return dom;
  }
  ignoreEvent() { return true; }
}

export const writingReview = [reviewBaseline, reviewedRanges, StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    if (tr.state.field(writingComposition)) return value.map(tr.changes);
    if (!tr.docChanged && !tr.effects.some(effect => effect.is(reviewWriting) || effect.is(keepRevision) || effect.is(composingWriting))) return value;
    const baseline = tr.state.field(reviewBaseline); if (!baseline) return Decoration.none;
    const decorations: Range<Decoration>[] = [];
    for (const hunk of tr.state.field(reviewedRanges)) {
      const line = tr.state.doc.lineAt(Math.min(hunk.from, tr.state.doc.length));
      decorations.push(Decoration.widget({ widget: new RevisionWidget(hunk), block: true, side: -1 }).range(line.from));
      if (hunk.from < hunk.to) decorations.push(Decoration.mark({ class: 'cm-revision-added' }).range(hunk.from, hunk.to));
    }
    return Decoration.set(decorations, true);
  },
  provide: field => EditorView.decorations.from(field),
})];
