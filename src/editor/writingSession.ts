import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export interface WritingPosition { file: string; anchor: number; head: number; top: number; left: number }
export interface WritingSession { state: EditorState; top: number; left: number }
export type WritingSessions = Map<string, WritingSession>;

export function writingPosition(view: EditorView, file: string): WritingPosition {
  const selection = view.state.selection.main;
  return { file, anchor: selection.anchor, head: selection.head, top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft };
}

export function restoreWritingPosition(view: EditorView, point: WritingPosition) {
  const clamp = (pos: number) => Math.max(0, Math.min(view.state.doc.length, pos));
  view.dispatch({ selection: { anchor: clamp(point.anchor), head: clamp(point.head) } });
  view.focus();
  view.requestMeasure({ read: () => null, write: () => { view.scrollDOM.scrollTop = point.top; view.scrollDOM.scrollLeft = point.left; } });
}
