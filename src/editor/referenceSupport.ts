import { hoverTooltip } from '@codemirror/view';
import type { ProjectSymbols } from '../types';
import { assetUrl, dirname, joinPath } from '../lib/latex';
import { t } from '../i18n';

export function referenceInfo(key: string, symbols: ProjectSymbols, citation = false): HTMLElement {
  const dom = document.createElement('div'); dom.className = 'cm-reference-info';
  const target = citation ? symbols.bibliography?.find(item => item.key === key) : symbols.references?.find(item => item.key === key);
  const title = document.createElement('strong'); title.textContent = target && 'title' in target ? target.title || key : target?.text || key;
  dom.appendChild(title);
  if (target && 'author' in target) { const detail = document.createElement('span'); detail.textContent = `${target.author} ${target.year}`.trim(); dom.appendChild(detail); }
  if (target) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `${t('Go to source')} · ${target.file.split(/[\\/]/).pop()}:${target.line}`;
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('texpro:writing-jump', { detail: { file: target.file, line: target.line } })));
    dom.appendChild(button);
  } else { const missing = document.createElement('span'); missing.textContent = t('No indexed source found'); dom.appendChild(missing); }
  return dom;
}

export function writingReferenceHover(getSymbols: () => ProjectSymbols, getFile: () => string) {
  return hoverTooltip((view, position) => {
    const line = view.state.doc.lineAt(position), symbols = getSymbols();
    for (const match of line.text.matchAll(/\\(ref|eqref|autoref|pageref|cref|Cref|cite\w*|parencite|textcite|includegraphics)\*?(?:\[[^\]]*\])*\{([^}]+)\}/g)) {
      const from = line.from + match.index!, to = from + match[0].length;
      if (position < from || position > to) continue;
      return { pos: from, end: to, above: true, create: () => {
        if (match[1] === 'includegraphics') {
          const dom = document.createElement('div'); dom.className = 'cm-reference-info';
          const img = symbols.images.find(item => item.path === joinPath(dirname(getFile()), match[2]) || item.relative === match[2]);
          if (img && /\.(png|jpe?g|gif|webp|svg)$/i.test(img.path)) { const image = document.createElement('img'); image.src = assetUrl(img.path); image.alt = img.label; dom.appendChild(image); }
          const text = document.createElement('span'); text.textContent = match[2]; dom.appendChild(text); return { dom };
        }
        const dom = document.createElement('div');
        for (const key of match[2].split(',').map(value => value.trim())) dom.appendChild(referenceInfo(key, symbols, /cite/.test(match[1])));
        return { dom };
      } };
    }
    return null;
  });
}
