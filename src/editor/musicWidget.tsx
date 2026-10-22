import { createRoot, type Root } from 'react-dom/client';
import { WidgetType, EditorView } from '@codemirror/view';
import { StateEffect, StateField, Transaction } from '@codemirror/state';
import { undo } from '@codemirror/commands';
import { MusicBlock, ScorePreview } from './MusicBlock';
import { findMusicBlocks, type ParsedMusicBlock } from '../lib/music';
import { continueWriting, focusWriting } from './writing';
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
    constructor(readonly block: ParsedMusicBlock, readonly projectRoot: string, readonly previewOnly = false) { super(); }
    eq(other: MusicWidget) { return this.previewOnly === other.previewOnly && this.block.source === other.block.source && this.block.from === other.block.from && this.projectRoot === other.projectRoot; }
    private render(dom: HTMLElement, view: EditorView) {
        const resolve = () => findMusicBlocks(view.state.doc.toString()).find(b => b.id === this.block.id && b.from === this.block.from);
        const onSource = () => { const b = resolve(); if (b) {
            const notes = b.source.search(/\\Notes\b/), content = notes >= 0 ? notes : b.source.search(/\\node\b|\\begingroup/);
            view.dispatch({ effects: revealMusicSource.of(b.id) });
            focusWriting(view, b.from + Math.max(0, content));
        } };
        if (this.previewOnly) {
            roots.get(dom)!.render(<ScorePreview root={this.projectRoot} source={this.block.body} refresh={0} onSource={onSource} onMeasure={() => view.requestMeasure()}/>);
            return;
        }
        roots.get(dom)!.render(<MusicBlock block={this.block} root={this.projectRoot} onMeasure={() => view.requestMeasure()} onUndo={() => undo(view)} onContinue={() => { const b = resolve(); if (b) continueWriting(view, b); }} onSource={onSource} onChange={source => {
            const block = resolve();
            if (!block || source === block.source) return;
            // Preserve both decoration boundaries so CodeMirror can reuse the live React DOM.
            let prefix = 0, suffix = 0;
            while (prefix < source.length && prefix < block.source.length && source[prefix] === block.source[prefix]) prefix++;
            while (suffix < source.length - prefix && suffix < block.source.length - prefix && source[source.length - suffix - 1] === block.source[block.source.length - suffix - 1]) suffix++;
            view.dispatch({ changes: { from: block.from + prefix, to: block.to - suffix, insert: source.slice(prefix, source.length - suffix) }, effects: view.scrollSnapshot(), annotations: Transaction.userEvent.of('input.music') });
        }}/>);
    }
    toDOM(view: EditorView) { const dom = document.createElement('div'); dom.className = this.previewOnly ? 'cm-music-host cm-writing-preview' : 'cm-music-host'; dom.dataset.previewOnly = String(this.previewOnly); roots.set(dom, createRoot(dom)); this.render(dom, view); return dom; }
    updateDOM(dom: HTMLElement, view: EditorView) { if (dom.dataset.previewOnly !== String(this.previewOnly)) return false; this.render(dom, view); return true; }
    destroy(dom: HTMLElement) { const root = roots.get(dom); roots.delete(dom); queueMicrotask(() => root?.unmount()); }
    ignoreEvent() { return true; }
}
