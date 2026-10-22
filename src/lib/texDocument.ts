/** Source ranges for local writing. Unknown TeX stays source rather than being regenerated. */
export interface TexRange { from: number; to: number }
export interface TexEnvironment extends TexRange { name: string; bodyFrom: number; bodyTo: number }
export interface TexCommand extends TexRange { name: string }

export function skipTexSpace(text: string, from: number): number {
  let at = from;
  while (at < text.length) {
    if (/\s/.test(text[at])) at++;
    else if (text[at] === '%') { const end = text.indexOf('\n', at); at = end < 0 ? text.length : end + 1; }
    else break;
  }
  return at;
}

export function texGroup(text: string, from: number, open = '{', close = '}'): TexRange | null {
  if (text[from] !== open) return null;
  let depth = 1;
  for (let at = from + 1; at < text.length; at++) {
    if (text[at] === '\\') { at++; continue; }
    if (text[at] === '%') { const end = text.indexOf('\n', at); if (end < 0) return null; at = end; continue; }
    if (text[at] === open) depth++;
    if (text[at] === close && --depth === 0) return { from, to: at + 1 };
  }
  return null;
}

/** TeX control sequences outside comments, verbatim environments and inline \verb. */
export function* texCommands(text: string): Generator<TexCommand> {
  for (let at = 0; at < text.length;) {
    if (text[at] === '%') { const end = text.indexOf('\n', at); at = end < 0 ? text.length : end + 1; continue; }
    if (text[at] !== '\\') { at++; continue; }
    const from = at++;
    if (/[a-zA-Z@]/.test(text[at] || '')) while (/[a-zA-Z@]/.test(text[at] || '')) at++;
    else at++;
    const name = text.slice(from + 1, at);
    if (name === 'verb') {
      if (text[at] === '*') at++;
      const delimiter = text[at++], end = text.indexOf(delimiter, at);
      at = end < 0 ? text.length : end + 1;
      continue;
    }
    yield { from, to: at, name };
    if (name === 'begin') {
      const group = texGroup(text, skipTexSpace(text, at));
      const env = group && text.slice(group.from + 1, group.to - 1);
      if (env && ['verbatim', 'verbatim*', 'lstlisting', 'minted'].includes(env)) {
        const close = `\\end{${env}}`, end = text.indexOf(close, group!.to);
        at = end < 0 ? text.length : end + close.length;
      }
    }
  }
}

export function texEnvironments(text: string, names: readonly string[]): TexEnvironment[] {
  const stack: Array<{ name: string; from: number; bodyFrom: number }> = [], blocks: TexEnvironment[] = [];
  for (const command of texCommands(text)) {
    if (command.name !== 'begin' && command.name !== 'end') continue;
    const group = texGroup(text, skipTexSpace(text, command.to));
    if (!group) continue;
    const name = text.slice(group.from + 1, group.to - 1);
    if (['verbatim', 'verbatim*', 'lstlisting', 'minted'].includes(name)) continue;
    if (command.name === 'begin') stack.push({ name, from: command.from, bodyFrom: group.to });
    else if (stack.at(-1)?.name === name) {
      const start = stack.pop()!;
      if (names.includes(name)) blocks.push({ ...start, to: group.to, bodyTo: command.from });
    }
  }
  return blocks.sort((a, b) => a.from - b.from || b.to - a.to);
}

export function texDocumentStart(text: string): TexRange | null {
  for (const command of texCommands(text)) {
    if (command.name !== 'begin') continue;
    const group = texGroup(text, skipTexSpace(text, command.to));
    if (group && text.slice(group.from + 1, group.to - 1) === 'document') return { from: command.from, to: group.to };
  }
  return null;
}

export interface DiagramBlock extends TexRange { source: string; kind: 'tikz' | 'circuit' | 'chemistry' }
export function diagramBlocks(text: string): DiagramBlock[] {
  const bodyStart = texDocumentStart(text)?.to ?? 0;
  const blocks: DiagramBlock[] = texEnvironments(text, ['tikzpicture', 'circuitikz']).map(b => ({
    ...b, source: text.slice(b.from, b.to), kind: b.name === 'circuitikz' ? 'circuit' : 'tikz',
  }));
  for (const command of texCommands(text)) {
    if (command.name !== 'chemfig') continue;
    let at = skipTexSpace(text, command.to);
    if (text[at] === '[') { const options = texGroup(text, at, '[', ']'); if (!options) continue; at = skipTexSpace(text, options.to); }
    const group = texGroup(text, at);
    if (group) blocks.push({ from: command.from, to: group.to, source: text.slice(command.from, group.to), kind: 'chemistry' });
  }
  const result: DiagramBlock[] = [];
  for (const block of blocks.sort((a, b) => a.from - b.from || b.to - a.to)) {
    if (block.from < bodyStart) continue;
    if (!result.some(b => block.from >= b.from && block.to <= b.to)) result.push(block);
  }
  return result;
}

export interface TableCell extends TexRange { text: string }
export interface WritingTable extends TexEnvironment { rows: TableCell[][]; aligns: string[]; columns: TexRange[]; rowEnds: number[]; rowEnd: number; terminated: boolean }

/** Only expose cells when their source is unambiguous and every surrounding token can survive. */
export function writingTable(text: string, block: TexEnvironment): WritingTable | null {
  let at = skipTexSpace(text, block.bodyFrom);
  if (text[at] === '[') { const option = texGroup(text, at, '[', ']'); if (!option) return null; at = skipTexSpace(text, option.to); }
  if (block.name === 'tabularx') { const width = texGroup(text, at); if (!width) return null; at = skipTexSpace(text, width.to); }
  const spec = texGroup(text, at);
  if (!spec) return null;
  const aligns: string[] = [];
  const columns: TexRange[] = [];
  for (let i = spec.from + 1; i < spec.to - 1; i++) {
    const c = text[i];
    if (/\s|\|/.test(c)) continue;
    if (/[lcrX]/.test(c)) { aligns.push(c === 'X' ? 'l' : c); columns.push({ from: i, to: i + 1 }); }
    else if (/[pmb@!><]/.test(c)) {
      const group = texGroup(text, skipTexSpace(text, i + 1));
      if (!group || group.to >= spec.to) return null;
      if (/[pmb]/.test(c)) { aligns.push('l'); columns.push({ from: i, to: group.to }); }
      i = group.to - 1;
    } else return null;
  }
  if (!aligns.length || aligns.length > 24) return null;
  at = spec.to;
  let cellFrom = at, depth = 0, row: TableCell[] = [], rowEnd = at;
  const rows: TableCell[][] = [];
  const rowEnds: number[] = [];
  let terminated = true;
  const cell = (to: number) => {
    const raw = text.slice(cellFrom, to), leading = raw.length - raw.trimStart().length;
    const from = cellFrom + leading, end = Math.max(from, to - (raw.length - raw.trimEnd().length));
    return { from, to: end, text: text.slice(from, end) };
  };
  while (at < block.bodyTo) {
    const c = text[at];
    if (c === '%') return null; // Comments can change row semantics; keep them in the source editor.
    if (c === '{') depth++;
    if (c === '}' && --depth < 0) return null;
    if (c === '\\') {
      const command = /^\\([a-zA-Z@]+|.)/.exec(text.slice(at));
      if (!command) return null;
      const name = command[1];
      if (['multicolumn', 'multirow', 'begin', 'end', 'verb', 'catcode', 'omit', 'span', 'endhead', 'endfirsthead', 'endfoot', 'endlastfoot'].includes(name)) return null;
      if (!depth && ['toprule', 'midrule', 'bottomrule', 'hline', 'addlinespace'].includes(name)) {
        if (row.length || text.slice(cellFrom, at).trim()) return null;
        at += command[0].length;
        const optionAt = skipTexSpace(text, at);
        if (text[optionAt] === '[') { const option = texGroup(text, optionAt, '[', ']'); if (!option) return null; at = option.to; }
        cellFrom = at;
        continue;
      }
      if (!depth && name === '\\') {
        row.push(cell(at));
        if (row.length !== aligns.length) return null;
        rows.push(row); row = [];
        at += 2;
        if (text[at] === '*') at++;
        if (text[at] === '[') { const option = texGroup(text, at, '[', ']'); if (!option) return null; at = option.to; }
        rowEnd = at;
        rowEnds.push(at);
        cellFrom = at;
        continue;
      }
      at += command[0].length;
      continue;
    }
    if (!depth && c === '&') { row.push(cell(at)); cellFrom = at + 1; }
    at++;
  }
  if (depth) return null;
  if (row.length || text.slice(cellFrom, block.bodyTo).trim()) {
    row.push(cell(block.bodyTo));
    if (row.length !== aligns.length) return null;
    rows.push(row); rowEnd = block.bodyTo; rowEnds.push(rowEnd); terminated = false;
  }
  if (!rows.length || rows.length > 200) return null;
  return { ...block, rows, aligns, columns, rowEnds, rowEnd, terminated };
}

export function appendWritingRow(table: WritingTable) {
  return { from: table.rowEnd, insert: (table.terminated ? '' : ' \\\\') + '\n' + Array.from({ length: table.aligns.length }, () => ' ').join('&') + ' \\\\' };
}

export function ensureTexPackages(text: string, packages: string[]): string {
  const document = [...texCommands(text)].find(c => c.name === 'begin' && text.slice(c.to).match(/^\s*\{document\}/));
  if (!document) return text;
  const installed = new Set<string>();
  for (const command of texCommands(text.slice(0, document.from))) {
    if (command.name !== 'usepackage' && command.name !== 'RequirePackage') continue;
    let at = skipTexSpace(text, command.to);
    if (text[at] === '[') { const option = texGroup(text, at, '[', ']'); if (!option) continue; at = skipTexSpace(text, option.to); }
    const group = texGroup(text, at);
    if (group) text.slice(group.from + 1, group.to - 1).split(',').forEach(p => installed.add(p.trim()));
  }
  const missing = [...new Set(packages)].filter(p => /^[a-zA-Z0-9-]+$/.test(p) && !installed.has(p));
  return text.slice(0, document.from) + missing.map(p => `\\usepackage{${p}}\n`).join('') + text.slice(document.from);
}
