import { texDocumentStart, texEnvironments, type TexRange } from './texDocument';

export function writingFigure(relative: string, name: string, labels: Iterable<string>) {
  const existing = new Set(labels);
  const base = 'fig:' + (name.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^a-zA-Z0-9\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '') || 'image');
  let label = base, index = 2;
  while (existing.has(label)) label = `${base}-${index++}`;
  const file = relative.replace(/\\/g, '/').replace(/([%#&{}])/g, '\\$1');
  const source = `\n\n\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${file}}\n  \\caption{}\n  \\label{${label}}\n\\end{figure}\n\n`;
  return { source, cursor: source.indexOf('\\caption{') + '\\caption{'.length, label };
}

/** Floats enter between content blocks, never inside another float or the preamble. */
export function figureWritingRange(text: string, range: TexRange, main: boolean): TexRange {
  const body = main ? texDocumentStart(text) : null;
  if (body && range.from < body.to) return { from: body.to, to: body.to };
  const blocks = texEnvironments(text, ['figure', 'figure*', 'table', 'table*', 'tabular', 'tabularx', 'longtable', 'music', 'tikzpicture', 'circuitikz', 'equation', 'equation*', 'align', 'align*']);
  const enclosing = blocks.filter(block => range.from > block.from && range.from < block.to).sort((a, b) => a.from - b.from || b.to - a.to)[0];
  return enclosing ? { from: enclosing.to, to: enclosing.to } : range;
}
