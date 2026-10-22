export interface WritingNote { file: string; line: number; text: string; done: boolean }

export function writingNotes(text: string, file: string): WritingNote[] {
  const notes: WritingNote[] = [];
  let verbatim = '';
  text.split('\n').forEach((line, i) => {
    if (verbatim) { if (line.includes(`\\end{${verbatim}}`)) verbatim = ''; return; }
    const begin = /^\s*\\begin\{(verbatim\*?|lstlisting|minted)\}/.exec(line);
    if (begin) { verbatim = begin[1]; return; }
    const match = /^\s*%\s*(TODO|FIXME|NOTE|DONE)\s*:\s*(.*)$/i.exec(line);
    if (match) notes.push({ file, line: i + 1, text: match[2], done: match[1].toUpperCase() === 'DONE' });
  });
  return notes;
}

export function toggleWritingNote(line: string, expected: WritingNote): string | null {
  const match = /^(\s*%\s*)(TODO|FIXME|NOTE|DONE)(\s*:\s*)(.*)$/i.exec(line);
  if (!match || match[4].trim() !== expected.text.trim() || (match[2].toUpperCase() === 'DONE') !== expected.done) return null;
  return match[1] + (expected.done ? 'TODO' : 'DONE') + match[3] + match[4];
}
