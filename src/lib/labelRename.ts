import { skipTexSpace, texCommands, texGroup } from './texDocument';

export interface LabelUse { key: string; from: number; to: number; declaration: boolean }
const refs = new Set(['ref', 'eqref', 'pageref', 'autoref', 'nameref', 'vref', 'Vref', 'cref', 'Cref', 'cpageref', 'Cpageref', 'labelcref', 'labelcpageref', 'crefrange', 'Crefrange', 'cpagerefrange', 'Cpagerefrange']);
export function labelUses(source: string): LabelUse[] {
  const result: LabelUse[] = [];
  for (const command of texCommands(source)) {
    if (command.name !== 'label' && command.name !== 'hyperref' && !refs.has(command.name)) continue;
    let at = skipTexSpace(source, command.to);
    if (source[at] === '*') at = skipTexSpace(source, at + 1);
    const add = (from: number, to: number) => {
      const value = source.slice(from, to);
      for (const part of value.matchAll(/[^,]+/g)) {
        const key = part[0].trim();
        if (!key || /[\\{}%\s]/.test(key)) continue;
        const start = from + part.index! + part[0].indexOf(key);
        result.push({ key, from: start, to: start + key.length, declaration: command.name === 'label' });
      }
    };
    if (command.name === 'hyperref') { const group = texGroup(source, at, '[', ']'); if (group) add(group.from + 1, group.to - 1); continue; }
    if (source[at] === '[') { const option = texGroup(source, at, '[', ']'); if (!option) continue; at = skipTexSpace(source, option.to); }
    const count = /range$/.test(command.name) ? 2 : 1;
    for (let n = 0; n < count; n++) {
      const group = texGroup(source, at); if (!group) break;
      add(group.from + 1, group.to - 1); at = skipTexSpace(source, group.to);
    }
  }
  return result;
}
export function labelAt(source: string, position: number): string | null {
  return labelUses(source).find(use => position >= use.from && position <= use.to)?.key || null;
}
export function renameLabels(sources: Record<string, string>, before: string, after: string): { texts: Record<string, string>; edits: Record<string, Array<{ from: number; to: number; insert: string }>>; count: number } {
  if (!after || /[\s\\{},%#$&^~\[\]]/.test(after)) throw new Error('Use a label without spaces or TeX special characters.');
  if (before === after) throw new Error('Enter a different label.');
  const scanned = Object.entries(sources).map(([file, text]) => ({ file, text, uses: labelUses(text) }));
  const declarations = scanned.flatMap(item => item.uses.filter(use => use.declaration));
  if (declarations.filter(use => use.key === before).length !== 1) throw new Error('The original label must have exactly one declaration in this project.');
  if (declarations.some(use => use.key === after)) throw new Error('This label already exists in the project.');
  const texts: Record<string, string> = {}, edits: Record<string, Array<{ from: number; to: number; insert: string }>> = {}; let count = 0;
  for (const item of scanned) {
    const uses = item.uses.filter(use => use.key === before);
    if (!uses.length) continue;
    let text = item.text;
    for (const use of [...uses].reverse()) text = text.slice(0, use.from) + after + text.slice(use.to);
    count += uses.length; texts[item.file] = text; edits[item.file] = uses.map(use => ({ from: use.from, to: use.to, insert: after }));
  }
  return { texts, edits, count };
}

/** A single minimal change preserves mapped selections and cached undo histories. */
export function textChange(before: string, after: string) {
  let from = 0, oldEnd = before.length, newEnd = after.length;
  while (from < oldEnd && from < newEnd && before[from] === after[from]) from++;
  while (oldEnd > from && newEnd > from && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  return { from, to: oldEnd, insert: after.slice(from, newEnd) };
}
