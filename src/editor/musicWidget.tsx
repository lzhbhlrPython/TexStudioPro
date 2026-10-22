import { createRoot, type Root } from 'react-dom/client';
import { WidgetType, EditorView } from '@codemirror/view';
import { StateEffect, StateField, Transaction } from '@codemirror/state';
import { undo } from '@codemirror/commands';
import { MusicBlock } from './MusicBlock';
import { findMusicBlocks, type ParsedMusicBlock } from '../lib/music';
export const revealMusicSource = StateEffect.define<string>();
export const musicSourceField = StateField.define<string | null>({ create: () => null, update(value, tr) {
        for (const e of tr.effects)
            if (e.is(revealMusicSource))
                return e.value;
        if (value && (tr.selection || tr.docChanged)) {
            const block = findMusicBlocks(tr.state.doc.toString()).find(b => b.id === value);
            const pos = tr.state.selection.main.head;
            if (!block || pos < block.from || pos > block.to)
                return null;
        }
        return value;
    } });
const roots = new WeakMap<HTMLElement, Root>();
export class MusicWidget extends WidgetType {
    constructor(readonly block: ParsedMusicBlock, readonly projectRoot: string) { super(); }
    eq(other: MusicWidget) { return this.block.source === other.block.source && this.block.from === other.block.from && this.projectRoot === other.projectRoot; }
    private render(dom: HTMLElement, view: EditorView) {
        const resolve = () => findMusicBlocks(view.state.doc.toString()).find(b => b.id === this.block.id && b.from === this.block.from);
        roots.get(dom)!.render(<MusicBlock block={this.block} root={this.projectRoot} onMeasure={() => view.requestMeasure()} onUndo={() => undo(view)} onSource={() => { const b = resolve(); if (b) {
            view.dispatch({ selection: { anchor: b.from + Math.max(0, b.source.indexOf('\\begingroup')) }, effects: revealMusicSource.of(b.id), scrollIntoView: true });
            view.focus();
        } }} onChange={source => {
            const block = resolve();
            if (!block || source === block.source) return;
            // Preserve both decoration boundaries so CodeMirror can reuse the live React DOM.
            let prefix = 0, suffix = 0;
            while (prefix < source.length && prefix < block.source.length && source[prefix] === block.source[prefix]) prefix++;
            while (suffix < source.length - prefix && suffix < block.source.length - prefix && source[source.length - suffix - 1] === block.source[block.source.length - suffix - 1]) suffix++;
            view.dispatch({ changes: { from: block.from + prefix, to: block.to - suffix, insert: source.slice(prefix, source.length - suffix) }, effects: view.scrollSnapshot(), annotations: Transaction.userEvent.of('input.music') });
        }}/>);
    }
    toDOM(view: EditorView) { const dom = document.createElement('div'); dom.className = 'cm-music-host'; roots.set(dom, createRoot(dom)); this.render(dom, view); return dom; }
    updateDOM(dom: HTMLElement, view: EditorView) { this.render(dom, view); return true; }
    destroy(dom: HTMLElement) { const root = roots.get(dom); roots.delete(dom); queueMicrotask(() => root?.unmount()); }
    ignoreEvent() { return true; }
}
