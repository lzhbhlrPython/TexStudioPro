import { skipTexSpace, texDocumentStart, texGroup } from './texDocument';

export const TEX_CLIPBOARD = 'application/x-texpro-latex';
export function escapeProse(text: string): string {
  return text.replace(/[\\{}%$#&_~^]/g, ch => ({ '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' }[ch] || '\\' + ch));
}

/** Conservative eligibility: commands, code, math and incomplete groups stay literal. */
export function prosePosition(source: string, position: number): boolean {
  const before = source.slice(0, position), start = texDocumentStart(source);
  if (start && position < start.to || !start && /\\documentclass\b/.test(source)) return false;
  const line = before.slice(before.lastIndexOf('\n') + 1);
  if (/(^|[^\\])%/.test(line)) return false;
  const stack: string[] = [];
  let braces = 0, dollars = 0, math = false;
  // Scan the prefix, including incomplete environments which a balanced-range parser omits.
  for (let at = 0; at < before.length; at++) {
    const ch = before[at];
    if (ch === '%') { const end = before.indexOf('\n', at); if (end < 0) break; at = end; continue; }
    if (ch === '\\') {
      const token = before.slice(at).match(/^\\(begin|end)\{([^}]+)\}/);
      if (token) {
        if (token[1] === 'begin') stack.push(token[2]);
        else if (stack.at(-1) === token[2]) stack.pop();
        at += token[0].length - 1; continue;
      }
      if ('(['.includes(before[at + 1] || '\0')) math = true;
      if (')]'.includes(before[at + 1] || '\0')) math = false;
      if (before.slice(at).match(/^\\verb\*?[^a-zA-Z]/)) {
        const verb = before.slice(at).match(/^\\verb\*?(.)/)!;
        const end = before.indexOf(verb[1], at + verb[0].length);
        if (end < 0) return false;
        at = end; continue;
      }
      at++; continue;
    }
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '$') dollars++;
  }
  return braces === 0 && dollars % 2 === 0 && !math && stack.every(name => ['document', 'itemize', 'enumerate', 'description', 'quote', 'quotation', 'center', 'flushleft', 'flushright'].includes(name));
}

export function hasTexSource(text: string): boolean {
  return /\\(?:[a-zA-Z@]+|[()[\]])/.test(text);
}

/** Inline Markdown with protected math, code and balanced TeX fragments. */
export function markdownInline(text: string, depth = 0): string {
  if (depth > 20) return escapeProse(text);
  let result = '';
  for (let at = 0; at < text.length;) {
    const rest = text.slice(at);
    const code = rest.match(/^`([^`\n]+)`/);
    if (code) { result += `\\texttt{${escapeProse(code[1])}}`; at += code[0].length; continue; }
    const math = rest.match(/^\$\$([\s\S]+?)\$\$|^\$([^$\n]+)\$/);
    if (math) { result += math[0]; at += math[0].length; continue; }
    const link = rest.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/);
    if (link) { result += `\\href{${link[2].replace(/[{}%#]/g, ch => '\\' + ch)}}{${markdownInline(link[1], depth + 1)}}`; at += link[0].length; continue; }
    const delimiter = rest.startsWith('**') ? '**' : rest.startsWith('*') ? '*' : '';
    if (delimiter) {
      const end = text.indexOf(delimiter, at + delimiter.length);
      if (end > at + delimiter.length && !text.slice(at, end).includes('\n')) {
        result += `\\${delimiter === '**' ? 'textbf' : 'emph'}{${markdownInline(text.slice(at + delimiter.length, end), depth + 1)}}`;
        at = end + delimiter.length; continue;
      }
    }
    const command = rest.match(/^\\(?:[a-zA-Z@]+|.)/);
    if (command) {
      let end = at + command[0].length, next = skipTexSpace(text, end);
      while (text[next] === '{') { const group = texGroup(text, next); if (!group) break; end = group.to; next = skipTexSpace(text, end); }
      result += text.slice(at, end); at = end; continue;
    }
    result += escapeProse(text[at++]);
  }
  return result;
}

export function proseTable(rows: string[][]): string {
  const width = rows[0].length;
  return `\\begin{tabular}{${'l'.repeat(width)}}\n\\hline\n${rows.map(row => row.map(markdownInline).join(' & ') + ' \\\\').join('\n')}\n\\hline\n\\end{tabular}`;
}

export function markdownPaste(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'), result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```[\w-]*\s*$/);
    if (fence) {
      let end = i + 1;
      while (end < lines.length && !/^\s*```\s*$/.test(lines[end])) end++;
      const code = lines.slice(i + 1, end).join('\n');
      if (end === lines.length || code.includes('\\end{verbatim}')) { result.push(escapeProse(lines.slice(i, end).join('\n'))); i = end; continue; }
      result.push(`\\begin{verbatim}\n${code}\n\\end{verbatim}`); i = end; continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { result.push(`\\${['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'subparagraph'][heading[1].length - 1]}{${markdownInline(heading[2])}}`); continue; }
    if (/^\s*\|?.+\|.+/.test(line) && /^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[i + 1] || '')) {
      const row = (value: string) => value.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim());
      const rows = [row(line)]; i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(row(lines[i])); i++; }
      i--;
      if (rows.every(r => r.length === rows[0].length)) result.push(proseTable(rows));
      else result.push(rows.map(r => r.join(' | ')).map(escapeProse).join('\n'));
      continue;
    }
    const list = line.match(/^\s*([-+*]|\d+[.)])\s+(.*)$/);
    if (list) {
      const env = /^\d/.test(list[1]) ? 'enumerate' : 'itemize';
      const items = [list[2]];
      while (i + 1 < lines.length) {
        const next = lines[i + 1].match(env === 'enumerate' ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-+*]\s+(.*)$/);
        if (!next) break;
        items.push(next[1]); i++;
      }
      result.push(`\\begin{${env}}\n${items.map(item => '  \\item ' + markdownInline(item)).join('\n')}\n\\end{${env}}`); continue;
    }
    if (/^>\s?/.test(line)) {
      const rows = [line.replace(/^>\s?/, '')];
      while (/^>\s?/.test(lines[i + 1] || '')) rows.push(lines[++i].replace(/^>\s?/, ''));
      result.push(`\\begin{quote}\n${rows.map(markdownInline).join('\n')}\n\\end{quote}`); continue;
    }
    result.push(markdownInline(line));
  }
  return result.join('\n');
}

export interface InputConversion { from: number; to: number; insert: string; anchor: number }
export function inputConversion(source: string, position: number): InputConversion | null {
  const from = source.lastIndexOf('\n', position - 1) + 1, line = source.slice(from, position);
  if (!/^(?:#{1,6} |[-+*>] |1[.)] )$/.test(line) && !/(?:^|\s)(?:\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)$/.test(line)) return null;
  if (!prosePosition(source, from) || hasTexSource(line)) return null;
  const heading = line.match(/^(#{1,6}) $/);
  if (heading) {
    const command = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'subparagraph'][heading[1].length - 1];
    return { from, to: position, insert: `\\${command}{}`, anchor: from + command.length + 2 };
  }
  const list = line.match(/^([-+*]|1[.)]|>) $/);
  if (list) {
    const env = list[1] === '>' ? 'quote' : /^1/.test(list[1]) ? 'enumerate' : 'itemize';
    const prefix = `\\begin{${env}}\n${env === 'quote' ? '' : '  \\item '}`;
    return { from, to: position, insert: `${prefix}\n\\end{${env}}`, anchor: from + prefix.length };
  }
  const inline = line.match(/(?:^|\s)(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)$/);
  if (!inline) return null;
  const start = position - inline[1].length;
  if (!prosePosition(source, start)) return null;
  const insert = markdownInline(inline[1]);
  return { from: start, to: position, insert, anchor: start + insert.length };
}
