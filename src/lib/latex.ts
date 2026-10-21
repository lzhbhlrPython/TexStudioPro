import type { Diagnostic, OutlineItem, OutlineKind, ProjectSymbols } from '../types';

const SECTION_LEVELS: Record<string, number> = {
  part: 0,
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
};

const SECTION_LABELS: Record<string, string> = {
  part: 'Part',
  chapter: 'Chapter',
  section: 'Section',
  subsection: 'Subsection',
  subsubsection: 'Subsubsection',
  paragraph: 'Paragraph',
};

export function dirname(file: string): string {
  const index = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  return index >= 0 ? file.slice(0, index) : '.';
}

export function basename(file: string): string {
  const index = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  return index >= 0 ? file.slice(index + 1) : file;
}

export function extname(file: string): string {
  const base = basename(file);
  const index = base.lastIndexOf('.');
  return index > 0 ? base.slice(index).toLowerCase() : '';
}

export function stem(file: string): string {
  const base = basename(file);
  const index = base.lastIndexOf('.');
  return index > 0 ? base.slice(0, index) : base;
}

export function joinPath(base: string, relative: string): string {
  const clean = relative.trim().replace(/^["']|["']$/g, '');
  if (/^(\/|[A-Za-z]:[\\/])/.test(clean)) return clean;
  const parts = (base + '/' + clean).replace(/\\/g, '/').split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return '/' + stack.join('/');
}

export function relativePath(from: string, to: string): string {
  const base = from.replace(/\/+$/, '').split('/');
  const target = to.split('/');
  let common = 0;
  while (common < base.length && common < target.length && base[common] === target[common]) common++;
  return [...base.slice(common).map(() => '..'), ...target.slice(common)].join('/');
}

export function assetUrl(file: string): string {
  return 'texpro-asset://asset/?path=' + encodeURIComponent(file);
}

export function cleanLatexTitle(value: string): string {
  return value
    .replace(/\\LaTeX\s*\{\}/g, 'LaTeX')
    .replace(/\\TeX\s*\{\}/g, 'TeX')
    .replace(/\\LaTeX\b/g, 'LaTeX')
    .replace(/\\TeX\b/g, 'TeX')
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\(thanks|footnote)\{[^}]*\}/g, '')
    .replace(/\\(textbf|textit|emph|textsc|texttt|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}/g, '$2')
    .replace(/\\[a-zA-Z@]+\*?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findClosingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '{') depth++;
    if (text[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseOutline(text: string, file?: string): OutlineItem[] {
  const lines = text.split('\n');
  const items: OutlineItem[] = [];
  let pendingEquation: OutlineItem | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    const section = line.match(
      /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{/,
    );
    if (section) {
      const open = line.indexOf('{', line.indexOf(section[1]) + section[1].length);
      const close = open >= 0 ? findClosingBrace(line, open) : -1;
      const raw = close > open ? line.slice(open + 1, close) : line.slice(open + 1).replace(/\}.*$/, '');
      const title = cleanLatexTitle(raw) || SECTION_LABELS[section[1]] || 'Section';
      items.push({
        id: `section-${lineNumber}`,
        kind: section[1] as OutlineKind,
        title,
        line: lineNumber,
        level: SECTION_LEVELS[section[1]] ?? 1,
        file,
      });
    }

    const label = line.match(/\\label\{([^}]+)\}/);
    if (label) {
      if (pendingEquation) {
        pendingEquation.label = label[1];
        pendingEquation.title = `${pendingEquation.title} · ${label[1]}`;
        pendingEquation = null;
      } else {
        items.push({
          id: `label-${lineNumber}-${label[1]}`,
          kind: 'label',
          title: label[1],
          line: lineNumber,
          level: 4,
          label: label[1],
          file,
        });
      }
    }

    const equation = line.match(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|eqnarray\*?)\}/);
    if (equation) {
      const next = lines
        .slice(i + 1, i + 4)
        .map((value) => value.trim())
        .find((value) => value && !value.startsWith('\\label') && !value.startsWith('%'));
      const title = next ? cleanLatexTitle(next).slice(0, 70) : equation[1];
      pendingEquation = {
        id: `equation-${lineNumber}`,
        kind: 'equation',
        title: title || equation[1],
        line: lineNumber,
        level: 4,
        file,
      };
      items.push(pendingEquation);
    }

    const todo = line.match(/^\s*%\s*(TODO|FIXME|NOTE)\b[:\s-]*(.*)$/i);
    if (todo) {
      items.push({
        id: `todo-${lineNumber}`,
        kind: 'todo',
        title: `${todo[1].toUpperCase()}: ${todo[2].trim() || 'Untitled task'}`,
        line: lineNumber,
        level: 2,
        file,
      });
    }
  }

  return items;
}

export function parseDocumentTitle(text: string): {
  title: string;
  author: string;
  date: string;
  documentClass: string;
  packages: number;
} {
  const readCommand = (name: string) => {
    const match = new RegExp('\\\\' + name + '\\s*\\{', 'm').exec(text);
    if (!match) return '';
    const open = text.indexOf('{', match.index + match[0].length - 1);
    const close = findClosingBrace(text, open);
    if (close < 0) return '';
    return cleanLatexTitle(text.slice(open + 1, close));
  };
  const cls = text.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/);
  const date = readCommand('date');
  return {
    title: readCommand('title'),
    author: readCommand('author'),
    date: date || (/\\date\s*\{\s*\\today\s*\}/.test(text) ? 'Today' : ''),
    documentClass: cls?.[1] || 'article',
    packages: (text.match(/\\usepackage(?:\[[^\]]*\])?\{/g) || []).length,
  };
}

export function computeStats(text: string): { words: number; characters: number; cjk: number } {
  const characters = text.length;
  const stripped = text
    .replace(/(^|[^\\])%.*$/gm, '$1')
    .replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/[{}$&_^~#]/g, ' ');
  const cjkMatches = stripped.match(/[\u3400-\u9fff]/g) || [];
  const latin = stripped
    .replace(/[\u3400-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter((word) => /[A-Za-z0-9]/.test(word));
  return {
    words: latin.length + cjkMatches.length,
    characters,
    cjk: cjkMatches.length,
  };
}

export function diagnosticsForFile(diagnostics: Diagnostic[], file: string): Diagnostic[] {
  const normalized = file.replace(/\/\.\//g, '/');
  return diagnostics.filter((diagnostic) => {
    if (!diagnostic.file) return true;
    return diagnostic.file.replace(/\/\.\//g, '/') === normalized;
  });
}

export function emptySymbols(): ProjectSymbols {
  return { labels: [], citations: [], environments: [], packages: [], images: [] };
}

export function collectLocalSymbols(text: string, symbols: ProjectSymbols): ProjectSymbols {
  const labels = new Set(symbols.labels);
  const citations = new Set(symbols.citations);
  for (const match of text.matchAll(/\\label\{([^}]+)\}/g)) labels.add(match[1]);
  for (const match of text.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/g)) citations.add(match[1]);
  return { ...symbols, labels: [...labels].sort(), citations: [...citations].sort() };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function truncateMiddle(value: string, max = 48): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return value.slice(0, half) + '…' + value.slice(-half);
}
