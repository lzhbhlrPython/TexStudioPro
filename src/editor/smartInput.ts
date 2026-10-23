import { EditorView, ViewPlugin } from '@codemirror/view';
import { Transaction } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { inputConversion } from '../lib/writingFormats';

export function smartInput(enabled: () => boolean) {
  return ViewPlugin.fromClass(class {
    constructor(readonly view: EditorView) {}
    update(update: import('@codemirror/view').ViewUpdate) {
      if (!enabled() || !update.docChanged || update.view.composing || !update.state.selection.main.empty || !update.transactions.some(tr => tr.isUserEvent('input.type') && !tr.isUserEvent('input.type.compose'))) return;
      const state = update.state, change = inputConversion(state.doc.toString(), state.selection.main.head);
      if (!change) return;
      queueMicrotask(() => {
        if (this.view.state !== state || !this.view.dom.isConnected || this.view.composing) return;
        this.view.dispatch({ changes: change, selection: { anchor: change.anchor }, annotations: [isolateHistory.of('full'), Transaction.userEvent.of('input.format')] });
      });
    }
  });
}
