import { skipTexSpace, texCommands, texGroup } from './texDocument';
export function footnoteAt(source: string, position: number): { from: number; to: number; text: string } | null {
  for (const command of texCommands(source)) {
    if (!['footnote', 'footnotetext'].includes(command.name)) continue;
    let at = skipTexSpace(source, command.to);
    if (source[at] === '[') { const option = texGroup(source, at, '[', ']'); if (!option) continue; at = skipTexSpace(source, option.to); }
    const group = texGroup(source, at);
    if (group && position >= command.from && position <= group.to) return { from: command.from, to: group.to, text: source.slice(group.from + 1, group.to - 1) };
  }
  return null;
}
export function sourceExcerpt(source: string, line: number): string {
  const lines = source.split(/\r?\n/), at = Math.max(0, Math.min(lines.length - 1, line - 1));
  let from = at, to = at;
  while (from > 0 && at - from < 4 && lines[from - 1].trim()) from--;
  while (to + 1 < lines.length && to - at < 5 && lines[to + 1].trim()) to++;
  return lines.slice(from, to + 1).join('\n').slice(0, 1800);
}
