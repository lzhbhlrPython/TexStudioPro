export interface DiffLine {
  type: 'same' | 'add' | 'remove';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export function diffLines(before: string, after: string, limit = 1500): DiffLine[] {
  const a = before.split('\n').slice(0, limit);
  const b = after.split('\n').slice(0, limit);
  const n = a.length;
  const m = b.length;
  const table: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const rows: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      rows.push({ type: 'remove', text: a[i], oldLine: i + 1 });
      i++;
    } else {
      rows.push({ type: 'add', text: b[j], newLine: j + 1 });
      j++;
    }
  }
  while (i < n) rows.push({ type: 'remove', text: a[i++], oldLine: i });
  while (j < m) rows.push({ type: 'add', text: b[j++], newLine: j });
  return rows;
}
