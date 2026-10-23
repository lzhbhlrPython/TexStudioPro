import { StateEffect, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { focusWriting } from './writing';

export interface WritingTarget { id: string; file: string; source: string }
interface Bookmark { from: number; to: number; source: string; valid: boolean }
const remember = StateEffect.define<{ id: string; bookmark: Bookmark }>();
const forget = StateEffect.define<string>();
export const writingTargets = StateField.define<ReadonlyMap<string, Bookmark>>({
  create: () => new Map(),
  update(value, tr) {
    const next = new Map(value);
    if (tr.docChanged) for (const [id, b] of next) {
      const from = tr.changes.mapPos(b.from, 1), to = tr.changes.mapPos(b.to, b.from === b.to ? 1 : -1);
      next.set(id, { ...b, from, to, valid: b.valid && from <= to && tr.state.doc.sliceString(from, Math.max(from, to)) === b.source });
    }
    for (const effect of tr.effects) {
      if (effect.is(remember)) next.set(effect.value.id, effect.value.bookmark);
      if (effect.is(forget)) next.delete(effect.value);
    }
    return next;
  },
});

export function rememberWriting(view: EditorView, file: string, range: { from: number; to: number } = view.state.selection.main): WritingTarget {
  const source = view.state.doc.sliceString(range.from, range.to), id = crypto.randomUUID();
  view.dispatch({ effects: remember.of({ id, bookmark: { from: range.from, to: range.to, source, valid: true } }) });
  return { id, file, source };
}

export function applyWriting(view: EditorView, target: WritingTarget, text: string, cursor = text.length): boolean {
  const b = view.state.field(writingTargets).get(target.id);
  if (!b?.valid || view.state.doc.sliceString(b.from, b.to) !== target.source) return false;
  view.dispatch({
    changes: { from: b.from, to: b.to, insert: text }, selection: { anchor: b.from + Math.min(text.length, Math.max(0, cursor)) },
    effects: forget.of(target.id), annotations: isolateHistory.of('full'), scrollIntoView: true,
  });
  view.focus();
  return true;
}

export function restoreWriting(view: EditorView, target: WritingTarget) {
  const b = view.state.field(writingTargets).get(target.id);
  view.dispatch({ effects: forget.of(target.id) });
  if (b) focusWriting(view, Math.min(view.state.doc.length, b.from));
}
