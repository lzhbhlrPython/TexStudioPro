export interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
  file: string;
}

const ENTRY_TYPES = [
  'article', 'book', 'booklet', 'conference', 'inbook', 'incollection',
  'inproceedings', 'manual', 'mastersthesis', 'misc', 'phdthesis',
  'proceedings', 'techreport', 'unpublished', 'online',
];

export const bibEntryTypes = ENTRY_TYPES;

function findEntryEnd(text: string, start: number): number {
  let depth = 0;
  let quote = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && text[i - 1] !== '\\') quote = !quote;
    if (quote) continue;
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function readValue(text: string, start: number): { value: string; end: number } {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index++;
  if (text[index] === '{') {
    let depth = 0;
    let end = index;
    for (; end < text.length; end++) {
      if (text[end] === '\\') {
        end++;
        continue;
      }
      if (text[end] === '{') depth++;
      if (text[end] === '}') {
        depth--;
        if (depth === 0) {
          return { value: text.slice(index + 1, end), end: end + 1 };
        }
      }
    }
    return { value: text.slice(index + 1), end: text.length };
  }
  if (text[index] === '"') {
    let end = index + 1;
    for (; end < text.length; end++) {
      if (text[end] === '"' && text[end - 1] !== '\\') break;
    }
    return { value: text.slice(index + 1, end), end: end + 1 };
  }
  let end = index;
  while (end < text.length && text[end] !== ',') end++;
  return { value: text.slice(index, end).trim(), end };
}

function parseFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let index = 0;
  while (index < body.length) {
    while (index < body.length && /[\s,]/.test(body[index])) index++;
    const nameMatch = body.slice(index).match(/^([A-Za-z][\w-]*)\s*=/);
    if (!nameMatch) break;
    const name = nameMatch[1].toLowerCase();
    index += nameMatch[0].length;
    const { value, end } = readValue(body, index);
    fields[name] = value.trim();
    index = end;
  }
  return fields;
}

export function parseBib(text: string, file = ''): BibEntry[] {
  const entries: BibEntry[] = [];
  const pattern = /@([A-Za-z]+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const type = match[1].toLowerCase();
    if (['comment', 'string', 'preamble'].includes(type)) {
      const end = findEntryEnd(text, pattern.lastIndex - 1);
      if (end >= 0) pattern.lastIndex = end + 1;
      continue;
    }
    const end = findEntryEnd(text, pattern.lastIndex - 1);
    if (end < 0) break;
    const body = text.slice(pattern.lastIndex, end);
    const comma = body.indexOf(',');
    if (comma < 0) {
      pattern.lastIndex = end + 1;
      continue;
    }
    const key = body.slice(0, comma).trim();
    if (!key) {
      pattern.lastIndex = end + 1;
      continue;
    }
    entries.push({ type, key, fields: parseFields(body.slice(comma + 1)), file });
    pattern.lastIndex = end + 1;
  }
  return entries;
}

export function serializeBib(entries: BibEntry[], existingText = ''): string {
  const header = existingText && !/^\s*%/.test(existingText) ? '' : '';
  return (
    header +
    entries
      .map((entry) => {
        const fields = Object.entries(entry.fields)
          .filter(([, value]) => value.trim() !== '')
          .map(([name, value]) => `  ${name} = {${value}}`)
          .join(',\n');
        return `@${entry.type}{${entry.key},\n${fields}\n}\n`;
      })
      .join('\n')
  );
}

export function newBibEntry(file: string, existingKeys: Set<string>): BibEntry {
  const base = 'reference' + (existingKeys.size + 1);
  let key = base;
  let index = 2;
  while (existingKeys.has(key)) {
    key = base + index++;
  }
  return {
    type: 'article',
    key,
    file,
    fields: {
      author: 'Last, First',
      title: 'Title',
      year: String(new Date().getFullYear()),
      journal: '',
      doi: '',
    },
  };
}

export function bibDisplayName(entry: BibEntry): string {
  return entry.fields.title || entry.fields.booktitle || entry.key;
}

export function bibAuthors(entry: BibEntry): string {
  return (entry.fields.author || '').replace(/\s+and\s+/gi, ', ');
}

export function parseRis(text: string, file = ''): BibEntry[] {
  const entries: BibEntry[] = [];
  const records = text.split(/^ER\s+-\s*$/m);
  for (const record of records) {
    if (!/^TY\s+-\s*/m.test(record)) continue;
    const fields: Record<string, string> = {};
    let type = 'article';
    for (const line of record.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9])\s+-\s*(.*)$/);
      if (!match) continue;
      const tag = match[1];
      const value = match[2].trim();
      if (tag === 'TY') {
        type = /JOUR/.test(value) ? 'article' : /BOOK/.test(value) ? 'book' : /CONF|CPAPER/.test(value) ? 'inproceedings' : /THES/.test(value) ? 'phdthesis' : /RPRT/.test(value) ? 'techreport' : 'misc';
      } else if (tag === 'AU' || tag === 'A1') fields.author = fields.author ? `${fields.author} and ${value}` : value;
      else if (tag === 'TI' || tag === 'T1') fields.title = value;
      else if (tag === 'JO' || tag === 'JF' || tag === 'T2') fields.journal = value;
      else if (tag === 'PY' || tag === 'Y1') fields.year = value.slice(0, 4);
      else if (tag === 'VL') fields.volume = value;
      else if (tag === 'IS') fields.number = value;
      else if (tag === 'SP') fields.pages = value;
      else if (tag === 'EP') fields.pages = `${fields.pages || ''}-${value}`;
      else if (tag === 'DO') fields.doi = value;
      else if (tag === 'UR') fields.url = value;
      else if (tag === 'PB') fields.publisher = value;
      else if (tag === 'AB') fields.abstract = value;
    }
    const year = fields.year || '';
    const firstAuthor = (fields.author || 'reference').split(/\s+and\s+/)[0].split(',')[0];
    const firstWord = (fields.title || 'work').split(/\s+/).find((word) => /[a-zA-Z]/.test(word)) || 'work';
    const key = `${firstAuthor}${year}${firstWord}`.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || `ris${entries.length + 1}`;
    entries.push({ type, key, fields, file });
  }
  return entries;
}

export function parseEnw(text: string, file = ''): BibEntry[] {
  const entries: BibEntry[] = [];
  for (const block of text.split(/%0\s+/).slice(1)) {
    const fields: Record<string, string> = {};
    const lines = block.split(/\r?\n/);
    const first = lines.shift() || '';
    fields.title = first.trim();
    for (const line of lines) {
      const match = line.match(/^%([A-Z0-9])\s+(.*)$/);
      if (!match) continue;
      const tag = match[1];
      if (tag === 'A') fields.author = fields.author ? `${fields.author} and ${match[2]}` : match[2];
      else if (tag === 'T') fields.title = match[2];
      else if (tag === 'J' || tag === 'B') fields.journal = match[2];
      else if (tag === 'D') fields.year = match[2].slice(0, 4);
      else if (tag === 'V') fields.volume = match[2];
      else if (tag === 'N') fields.number = match[2];
      else if (tag === 'P') fields.pages = match[2];
      else if (tag === 'R') fields.doi = match[2];
      else if (tag === 'U') fields.url = match[2];
      else if (tag === 'I') fields.publisher = match[2];
    }
    const year = fields.year || '';
    const firstAuthor = (fields.author || 'reference').split(/\s+and\s+/)[0].split(',')[0];
    const firstWord = (fields.title || 'work').split(/\s+/).find((word) => /[a-zA-Z]/.test(word)) || 'work';
    const key = `${firstAuthor}${year}${firstWord}`.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || `enw${entries.length + 1}`;
    entries.push({ type: 'article', key, fields, file });
  }
  return entries;
}
