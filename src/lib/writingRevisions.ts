export interface WritingRevision { from: number; to: number; oldFrom: number; oldTo: number; before: string; after: string }

/** Exact newline-preserving hunks. Large changes fall back to one safe splice, never truncated data. */
export function writingRevisions(before: string, after: string): WritingRevision[] {
  if (before === after) return [];
  const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) || [];
  const a = lines(before), b = lines(after);
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const oldStart = a.slice(0, prefix).join('').length, newStart = b.slice(0, prefix).join('').length;
  const aa = a.slice(prefix, a.length - suffix), bb = b.slice(prefix, b.length - suffix);
  if (aa.length * bb.length > 1000000) return [{ from: newStart, to: after.length - b.slice(b.length - suffix).join('').length, oldFrom: oldStart, oldTo: before.length - a.slice(a.length - suffix).join('').length, before: aa.join(''), after: bb.join('') }];
  const lcs = Array.from({ length: aa.length + 1 }, () => new Uint32Array(bb.length + 1));
  for (let i = aa.length - 1; i >= 0; i--) for (let j = bb.length - 1; j >= 0; j--) lcs[i][j] = aa[i] === bb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const result: WritingRevision[] = [];
  let i = 0, j = 0, oldAt = oldStart, at = newStart, hunk: WritingRevision | null = null;
  const flush = () => { if (hunk) result.push(hunk); hunk = null; };
  while (i < aa.length || j < bb.length) {
    if (i < aa.length && j < bb.length && aa[i] === bb[j]) { flush(); oldAt += aa[i++].length; at += bb[j++].length; continue; }
    hunk ||= { from: at, to: at, oldFrom: oldAt, oldTo: oldAt, before: '', after: '' };
    if (i < aa.length && (j === bb.length || lcs[i + 1][j] >= lcs[i][j + 1])) { const text = aa[i++]; hunk.before += text; oldAt += text.length; hunk.oldTo = oldAt; }
    else { const text = bb[j++]; hunk.after += text; at += text.length; hunk.to = at; }
  }
  flush(); return result;
}
