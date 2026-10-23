import { texCommands, texDocumentStart, texEnvironments, texGroup, skipTexSpace, type TexRange } from './texDocument';

const levels: Record<string, number> = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5 };

/** A conservative source splice: no TeX regeneration and no crossing parent-section boundaries. */
export function moveWritingContent(text: string, pos: number, direction: -1 | 1): { from: number; to: number; insert: string; anchor: number } | null {
  const start = texDocumentStart(text)?.to ?? 0;
  const end = text.indexOf('\\end{document}', start) < 0 ? text.length : text.indexOf('\\end{document}', start);
  const floats = texEnvironments(text, ['figure', 'figure*', 'table', 'table*']).filter(range => range.from >= start);
  const commands = [...texCommands(text)];
  for (const command of commands.filter(command => command.from >= start && command.from <= pos)) {
    if (command.name === 'begin') {
      const group = texGroup(text, skipTexSpace(text, command.to));
      if (group && /^(figure\*?|table\*?)$/.test(text.slice(group.from + 1, group.to - 1)) && !floats.some(block => block.from === command.from)) return null;
    }
    if (levels[command.name] !== undefined) {
      let at = skipTexSpace(text, command.to + (text[command.to] === '*' ? 1 : 0));
      if (text[at] === '[') { const short = texGroup(text, at, '[', ']'); if (!short) return null; at = skipTexSpace(text, short.to); }
      if (!texGroup(text, at)) return null;
    }
  }
  let siblings: TexRange[] = [], index = -1;
  const floating = floats.find(block => block.from <= pos && pos <= block.to);
  if (floating) {
    // Paragraphs and complete floats share the flow, but incomplete environments are never sliced.
    let at = start;
    for (const block of [...floats, { from: end, to: end }]) {
      const prose = text.slice(at, block.from);
      for (const match of prose.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g)) {
        const from = at + match.index!, to = from + match[0].trimEnd().length;
        if (from < to) siblings.push({ from, to });
      }
      if (block.from < end) siblings.push(block);
      at = block.to;
    }
    index = siblings.findIndex(block => block.from === floating.from);
  } else {
    const headings = commands.filter(command => command.from >= start && command.from < end && levels[command.name] !== undefined).filter(command => {
      let at = skipTexSpace(text, command.to + (text[command.to] === '*' ? 1 : 0));
      if (text[at] === '[') { const short = texGroup(text, at, '[', ']'); if (!short) return false; at = skipTexSpace(text, short.to); }
      return !!texGroup(text, at);
    });
    const heading = headings.filter(command => command.from <= pos).at(-1);
    if (!heading) return null;
    const level = levels[heading.name];
    const parentStart = headings.filter(command => command.from < heading.from && levels[command.name] < level).at(-1)?.from ?? start;
    const parentEnd = headings.find(command => command.from > heading.from && levels[command.name] < level)?.from ?? end;
    siblings = headings.filter(command => command.from > parentStart && command.from < parentEnd && levels[command.name] === level).map(command => ({ from: command.from, to: headings.find(next => next.from > command.from && levels[next.name] <= level)?.from ?? end }));
    index = siblings.findIndex(block => block.from === heading.from);
  }
  const current = siblings[index], other = siblings[index + direction];
  if (!current || !other) return null;
  const first = direction < 0 ? other : current, second = direction < 0 ? current : other;
  const a = text.slice(first.from, first.to), gap = text.slice(first.to, second.from), b = text.slice(second.from, second.to);
  // Do not carry half a surrounding environment across a figure or table.
  if (floating && /\\(?:begin|end)\{|\\(?:sub)*section\b|\\chapter\b/.test(direction < 0 ? a : b)) return null;
  return { from: first.from, to: second.to, insert: b + gap + a, anchor: direction < 0 ? first.from + pos - current.from : first.from + b.length + gap.length + pos - current.from };
}
