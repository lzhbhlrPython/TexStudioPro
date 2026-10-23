import { StateEffect, StateField } from '@codemirror/state';
import { footnoteAt, sourceExcerpt } from '../lib/referencePeek';
import { renderInlineTex } from '../lib/texInline';
import { hoverTooltip, showTooltip, keymap, type Tooltip, type EditorView } from '@codemirror/view';
import type { ProjectSymbols } from '../types';
import { assetUrl, dirname, joinPath } from '../lib/latex';
import { t } from '../i18n';

export function referenceInfo(key: string, symbols: ProjectSymbols, citation = false, readSource?: (file: string) => Promise<string>): HTMLElement {
  const dom = document.createElement('div'); dom.className = 'cm-reference-info';
  const target = citation ? symbols.bibliography?.find(item => item.key === key) : symbols.references?.find(item => item.key === key);
  const title = document.createElement('strong'); title.textContent = target && 'title' in target ? target.title || key : target?.text || key;
  dom.appendChild(title);
  if (target && 'author' in target) { const detail = document.createElement('span'); detail.textContent = `${target.author} ${target.year}`.trim(); dom.appendChild(detail); }
  if (target) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `${t('Go to source')} · ${target.file.split(/[\\/]/).pop()}:${target.line}`;
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('texpro:writing-jump', { detail: { file: target.file, line: target.line } })));
    if (!citation && readSource) {
      const excerpt = document.createElement('div'); excerpt.className = 'cm-reference-excerpt'; excerpt.textContent = t('Loading…'); dom.appendChild(excerpt);
      void readSource(target.file).then(source => { excerpt.innerHTML = renderInlineTex(sourceExcerpt(source, target.line)); }).catch(() => { excerpt.textContent = t('Could not read reference source'); });
      const rename = document.createElement('button'); rename.type = 'button'; rename.textContent = t('Rename label and references');
      rename.addEventListener('mousedown', event => event.preventDefault());
      rename.addEventListener('click', () => window.dispatchEvent(new CustomEvent('texpro:rename-label', { detail: key }))); dom.appendChild(rename);
    }
    dom.appendChild(button);
  } else { const missing = document.createElement('span'); missing.textContent = t('No indexed source found'); dom.appendChild(missing); }
  return dom;
}

const peekEffect = StateEffect.define<Tooltip | null>();
const peekField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, transaction) {
    if (transaction.docChanged || transaction.selection) value = null;
    for (const effect of transaction.effects) if (effect.is(peekEffect)) value = effect.value;
    return value;
  },
  provide: field => showTooltip.from(field),
});
function lookup(view: EditorView, position: number, symbols: ProjectSymbols, file: string, readSource?: (file: string) => Promise<string>): Tooltip | null {
  const source = view.state.doc.toString(), note = footnoteAt(source, position);
  if (note) return { pos: note.from, end: note.to, above: true, create: () => {
    const dom = document.createElement('div'); dom.className = 'cm-reference-info';
    const title = document.createElement('strong'); title.textContent = t('Footnote'); dom.appendChild(title);
    const content = document.createElement('div'); content.innerHTML = renderInlineTex(note.text); dom.appendChild(content);
    return { dom };
  } };
  const line = view.state.doc.lineAt(position);
  for (const match of line.text.matchAll(/\\(ref|eqref|autoref|pageref|nameref|cref|Cref|cite\w*|parencite|textcite|includegraphics)\*?(?:\[[^\]]*\])*\{([^}]+)\}/g)) {
    const from = line.from + match.index!, to = from + match[0].length;
    if (position < from || position > to) continue;
    return { pos: from, end: to, above: true, create: () => {
      if (match[1] === 'includegraphics') {
        const dom = document.createElement('div'); dom.className = 'cm-reference-info';
        const img = symbols.images.find(item => item.path === joinPath(dirname(file), match[2]) || item.relative === match[2]);
        if (img && /\.(png|jpe?g|gif|webp|svg)$/i.test(img.path)) { const image = document.createElement('img'); image.src = assetUrl(img.path); image.alt = img.label; dom.appendChild(image); }
        const text = document.createElement('span'); text.textContent = match[2]; dom.appendChild(text); return { dom };
      }
      const dom = document.createElement('div');
      for (const key of match[2].split(',').map(value => value.trim())) dom.appendChild(referenceInfo(key, symbols, /cite/.test(match[1]), readSource));
      return { dom };
    } };
  }
  return null;
}
export function writingReferenceHover(getSymbols: () => ProjectSymbols, getFile: () => string, readSource?: (file: string) => Promise<string>) {
  return [peekField, hoverTooltip((view, position) => lookup(view, position, getSymbols(), getFile(), readSource)), keymap.of([
    { key: 'Alt-F12', run: view => { const tooltip = lookup(view, view.state.selection.main.head, getSymbols(), getFile(), readSource); if (!tooltip) return false; view.dispatch({ effects: peekEffect.of(tooltip) }); return true; } },
    { key: 'Escape', run: view => { if (!view.state.field(peekField)) return false; view.dispatch({ effects: peekEffect.of(null) }); view.focus(); return true; } },
  ])];
}
