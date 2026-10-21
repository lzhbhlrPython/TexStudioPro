import type { Completion, autocompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';

// Small, consistently stroked icons, using the same geometry as the workbench icons.
const paths: Record<string, string[]> = {
  snippet: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6', 'm14.5 4-5 16'],
  keyword: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
  class: ['M8 3H6a2 2 0 0 0-2 2v4a3 3 0 0 1-3 3 3 3 0 0 1 3 3v4a2 2 0 0 0 2 2h2', 'M16 3h2a2 2 0 0 1 2 2v4a3 3 0 0 0 3 3 3 3 0 0 0-3 3v4a2 2 0 0 1-2 2h-2'],
  variable: ['M4 9h16', 'M4 15h16', 'm10 3-2 18', 'm16 3-2 18'],
  namespace: ['m12 3 9 5-9 5-9-5 9-5Z', 'm3 8 9 5 9-5', 'M3 8v9l9 5 9-5V8', 'M12 13v9'],
  text: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M8 13h8', 'M8 17h6'],
};

function completionIcon(completion: Completion, _state: unknown, view: EditorView) {
  const document = view.dom.ownerDocument;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('texpro-completion-icon');
  for (const d of paths[completion.type || ''] || paths.keyword) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

export const completionAppearance: Pick<NonNullable<Parameters<typeof autocompletion>[0]>, 'icons' | 'addToOptions' | 'tooltipClass'> = {
  icons: false,
  tooltipClass: () => 'texpro-completions',
  addToOptions: [{ render: completionIcon, position: 20 }],
};

export const completionTheme = EditorView.theme({
  '.cm-tooltip.texpro-completions': {
    backgroundColor: 'var(--popover)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-md)',
    padding: '4px',
    overflow: 'hidden',
  },
  '.texpro-completions > ul': {
    fontFamily: 'var(--font-ui)',
    minWidth: 'min(300px, calc(100vw - 40px))',
    maxWidth: 'min(440px, calc(100vw - 40px))',
    maxHeight: 'min(320px, 40vh)',
    padding: '0',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--border-strong) transparent',
  },
  '.texpro-completions > ul > li': {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minHeight: '34px',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '12.5px',
    lineHeight: '1.5',
    color: 'var(--text)',
  },
  '.texpro-completions > ul > li:hover': { backgroundColor: 'var(--popover-soft)' },
  '.texpro-completions > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--text)',
  },
  '.texpro-completion-icon': { width: '15px', height: '15px', flex: '0 0 15px', color: 'var(--text-muted)' },
  '.texpro-completions [aria-selected] .texpro-completion-icon': { color: 'var(--accent-strong)' },
  '.texpro-completions .cm-completionLabel': {
    fontFamily: 'var(--font-mono)',
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '.texpro-completions .cm-completionMatchedText': {
    color: 'var(--accent-strong)',
    fontWeight: '600',
    textDecoration: 'none',
  },
  '.texpro-completions .cm-completionDetail': {
    fontFamily: 'var(--font-ui)',
    fontSize: '12px',
    fontStyle: 'normal',
    color: 'var(--text-muted)',
    marginLeft: 'auto',
    paddingLeft: '10px',
    minWidth: '0',
    maxWidth: '180px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
});
