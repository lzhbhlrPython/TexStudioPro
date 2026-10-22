import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { diagramBlocks, texEnvironments, type TexRange } from '../lib/texDocument';
import { findMusicBlocks } from '../lib/music';

export const composingWriting = StateEffect.define<boolean>();
export const writingComposition = StateField.define<boolean>({
  create: () => false,
  update(value, tr) { for (const effect of tr.effects) if (effect.is(composingWriting)) value = effect.value; return value; },
});
export const stableWritingInput = [writingComposition, EditorView.domEventHandlers({
  compositionstart(_event, view) { view.dispatch({ effects: composingWriting.of(true) }); return false; },
  compositionend(_event, view) { queueMicrotask(() => { if (view.dom.isConnected) view.dispatch({ effects: composingWriting.of(false) }); }); return false; },
})];

export interface TableWriting extends TexRange { row: number; col: number }
export const writeTableCell = StateEffect.define<TableWriting | null>();
export const tableWritingField = StateField.define<TableWriting | null>({
  create: () => null,
  update(value, tr) {
    if (value && tr.docChanged) value = { ...value, from: tr.changes.mapPos(value.from, -1), to: tr.changes.mapPos(value.to, 1) };
    for (const e of tr.effects) if (e.is(writeTableCell)) value = e.value;
    if (value && tr.selection && tr.state.selection.ranges.some(r => !r.empty || r.head < value!.from || r.head > value!.to)) return null;
    return value;
  },
});

export function selectionTouches(state: EditorState, range: TexRange): boolean {
  return state.selection.ranges.some(s => s.empty ? s.head > range.from && s.head < range.to : s.from < range.to && s.to > range.from);
}

export function focusWriting(view: EditorView, pos: number) {
  const anchor = Math.max(0, Math.min(view.state.doc.length, pos));
  view.dispatch({ selection: { anchor }, effects: [view.scrollSnapshot(), EditorView.scrollIntoView(anchor, { y: 'nearest' })] });
  view.focus();
}

/** Leave a content block at a real document position, creating prose space only when needed. */
export function continueWriting(view: EditorView, block: TexRange, direction: -1 | 1 = 1): boolean {
  const doc = view.state.doc;
  if (direction < 0) {
    const line = doc.lineAt(block.from);
    if (line.number > 1) { focusWriting(view, doc.line(line.number - 1).to); return true; }
    view.dispatch({ changes: { from: 0, insert: '\n' }, selection: { anchor: 0 }, effects: writeTableCell.of(null), scrollIntoView: true });
  } else {
    const line = doc.lineAt(block.to);
    let anchor = block.to, insert = '';
    if (block.to < line.to) anchor = block.to;
    else if (line.number < doc.lines) {
      anchor = doc.line(line.number + 1).from;
      if (/^\s*\\end\{document\}/.test(doc.line(line.number + 1).text)) insert = '\n';
    } else insert = '\n\n';
    view.dispatch({ changes: insert ? { from: anchor, insert } : undefined, selection: { anchor: anchor + (insert === '\n\n' ? 2 : 0) }, effects: writeTableCell.of(null), scrollIntoView: true });
  }
  view.focus();
  return true;
}

export function leaveWritingBlock(view: EditorView): boolean {
  if (view.composing) return false;
  const pos = view.state.selection.main.head, text = view.state.doc.toString();
  const ranges: TexRange[] = [
    ...findMusicBlocks(text), ...diagramBlocks(text),
    ...texEnvironments(text, ['table', 'table*', 'tabular', 'tabularx', 'longtable', 'equation', 'equation*', 'align', 'align*', 'gather', 'gather*']),
  ];
  // Outermost content owns exit, so a table exits after its caption, not inside its float.
  const range = ranges.filter(r => pos >= r.from && pos <= r.to).sort((a, b) => a.from - b.from || b.to - a.to)[0];
  return range ? continueWriting(view, range) : false;
}
