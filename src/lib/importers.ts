export type ImportFormat = 'markdown' | 'typst';

export interface ImportOptions {
  title: string;
  author: string;
  date: string;
  documentClass: 'article' | 'ctexart';
}

export interface ImportResult {
  body: string;
  document: string;
  warnings: string[];
  engine: 'pdflatex' | 'xelatex';
  suggestedName: string;
}

export const defaultImportOptions: ImportOptions = {
  title: '',
  author: '',
  date: '\\today',
  documentClass: 'article',
};

function escapeLatex(value: string): string {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([{}%$#&_])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function hasChinese(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

interface Stash {
  values: string[];
  put(value: string): string;
}

function createStash(): Stash {
  const values: string[] = [];
  return {
    values,
    put(value: string) {
      const token = `\u0000${values.length}\u0000`;
      values.push(value);
      return token;
    },
  };
}

function restore(value: string, stash: Stash): string {
  return value.replace(/\u0000(\d+)\u0000/g, (_, index: string) => stash.values[Number(index)] || '');
}

function inlineMarkdown(input: string, warnings: string[]): string {
  const stash = createStash();
  let text = input;

  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math: string) => stash.put(`\\[${math.trim()}\\]`));
  text = text.replace(/\$([^$\n]+?)\$/g, (_, math: string) => stash.put(`$${math.trim()}$`));
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, math: string) => stash.put(`$${math.trim()}$`));
  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => stash.put(`\\texttt{${escapeLatex(code)}}`));
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt: string, src: string) => {
    if (/^https?:/i.test(src)) {
      warnings.push(`Remote image left as a link: ${src}`);
      return stash.put(`\\href{${src}}{${escapeLatex(alt || src)}}`);
    }
    return stash.put(`\\includegraphics[width=0.8\\linewidth]{${src}}`);
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label: string, href: string) => {
    if (/^https?:|^mailto:/i.test(href)) {
      return stash.put(`\\href{${href}}{${inlineMarkdown(label, warnings)}}`);
    }
    return stash.put(`\\hyperref[${href}]{${inlineMarkdown(label, warnings)}}`);
  });
  text = escapeLatex(text);
  text = text.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}');
  text = text.replace(/__([^_]+)__/g, '\\textbf{$1}');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1\\textit{$2}');
  text = text.replace(/\\_([^\\_\n]+)\\_/g, '\\emph{$1}');
  text = text.replace(/~~([^~]+)~~/g, '\\sout{$1}');
  text = text.replace(/  \n/g, '\\\\\n');
  return restore(text, stash);
}

function buildDocument(body: string, options: ImportOptions, warnings: string[]): ImportResult {
  const chinese = hasChinese(body);
  const documentClass = chinese ? 'ctexart' : options.documentClass;
  const engine: 'pdflatex' | 'xelatex' = documentClass === 'ctexart' ? 'xelatex' : 'pdflatex';
  const title = options.title.trim();
  const author = options.author.trim();
  const preamble = documentClass === 'ctexart'
    ? `\\documentclass[UTF8,fontset=fandol,11pt]{ctexart}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{booktabs}
\\usepackage{xcolor}
\\usepackage[colorlinks=true,linkcolor=blue,urlcolor=blue]{hyperref}`
    : `\\documentclass[11pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{booktabs}
\\usepackage{xcolor}
\\usepackage[colorlinks=true,linkcolor=blue,urlcolor=blue]{hyperref}`;
  const metadata = [
    title ? `\\title{${escapeLatex(title)}}` : '',
    author ? `\\author{${escapeLatex(author)}}` : '',
    options.date.trim() ? `\\date{${options.date.trim()}}` : '\\date{}',
  ].filter(Boolean).join('\n');
  const document = `${preamble}
${metadata}

\\begin{document}
${title ? '\\maketitle\n' : ''}${body.trim()}

\\end{document}
`;
  return {
    body: body.trim(),
    document,
    warnings,
    engine,
    suggestedName: title || 'imported-document',
  };
}

export function markdownToLatex(markdown: string, options: ImportOptions = defaultImportOptions): ImportResult {
  const warnings: string[] = [];
  let source = markdown.replace(/\r\n?/g, '\n');
  let title = options.title;

  const frontMatter = source.match(/^---\n([\s\S]*?)\n---\n?/);
  if (frontMatter) {
    for (const line of frontMatter[1].split('\n')) {
      const match = line.match(/^(title|author|date):\s*(.*)$/i);
      if (match) {
        const value = match[2].replace(/^['"]|['"]$/g, '');
        if (match[1].toLowerCase() === 'title') title = title || value;
        if (match[1].toLowerCase() === 'author' && !options.author) options = { ...options, author: value };
        if (match[1].toLowerCase() === 'date' && options.date === defaultImportOptions.date) options = { ...options, date: value };
      }
    }
    source = source.slice(frontMatter[0].length);
  }

  const lines = source.split('\n');
  const output: string[] = [];
  let index = 0;

  const emitParagraph = (paragraphLines: string[]) => {
    if (!paragraphLines.length) return;
    const paragraph = paragraphLines
      .map((line) => inlineMarkdown(line.trim(), warnings))
      .join('\n');
    output.push(paragraph);
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index++;
      continue;
    }

    const fence = trimmed.match(/^```([\w-]*)\s*$/);
    if (fence) {
      index++;
      const code: string[] = [];
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index++;
      }
      index++;
      if (code.some((row) => /\\end\{verbatim\}/.test(row))) {
        warnings.push('Code block contains \\end{verbatim}; imported as a quote instead.');
        output.push(`\\begin{quote}\n${escapeLatex(code.join('\n'))}\n\\end{quote}`);
      } else {
        output.push(`\\begin{verbatim}\n${code.join('\n')}\n\\end{verbatim}`);
      }
      continue;
    }

    if (/^\$\$/.test(trimmed)) {
      const math: string[] = [];
      const rest = trimmed.replace(/^\$\$\s*/, '');
      if (rest && !/\$\$\s*$/.test(rest)) math.push(rest.replace(/\$\$\s*$/, ''));
      if (!rest) {
        index++;
        while (index < lines.length && !/^\$\$\s*$/.test(lines[index].trim())) {
          math.push(lines[index]);
          index++;
        }
      }
      index++;
      output.push(`\\[\n${math.join('\n').trim()}\n\\]`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(4, heading[1].length);
      const command = ['section', 'subsection', 'subsubsection', 'paragraph'][level - 1];
      output.push(`\\${command}{${inlineMarkdown(heading[2].trim(), warnings)}}`);
      index++;
      continue;
    }

    if (/^(---+|\*\*\*+|___+)\s*$/.test(trimmed)) {
      output.push('\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par');
      index++;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoted: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoted.push(lines[index].trim().replace(/^>\s?/, ''));
        index++;
      }
      output.push(`\\begin{quote}\n${quoted.map((row) => inlineMarkdown(row, warnings)).join('\n\n')}\n\\end{quote}`);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(ordered ? /^\d+\.\s+(.*)$/ : /^[-*+]\s+(.*)$/);
        if (!item) break;
        items.push(inlineMarkdown(item[1], warnings));
        index++;
      }
      output.push(`\\begin{${ordered ? 'enumerate' : 'itemize'}}\n${items.map((item) => `  \\item ${item}`).join('\n')}\n\\end{${ordered ? 'enumerate' : 'itemize'}}`);
      continue;
    }

    if (trimmed.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1])) {
      const rows: string[][] = [];
      const parseRow = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      rows.push(parseRow(lines[index]));
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(parseRow(lines[index]));
        index++;
      }
      const columns = Math.max(...rows.map((row) => row.length));
      const body = rows
        .map((row) => Array.from({ length: columns }, (_, i) => inlineMarkdown(row[i] || '', warnings)).join(' & ') + ' \\\\')
        .join('\n\\hline\n');
      output.push(`\\begin{table}[htbp]\n\\centering\n\\begin{tabular}{${'l'.repeat(columns)}}\n\\hline\n${body}\n\\hline\n\\end{tabular}\n\\end{table}`);
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/);
    if (image) {
      output.push(`\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=0.8\\linewidth]{${image[2]}}\n\\caption{${inlineMarkdown(image[1], warnings)}}\n\\end{figure}`);
      index++;
      continue;
    }

    if (/^<[^>]+>/.test(trimmed)) {
      warnings.push('Raw HTML was escaped as plain text.');
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^```/.test(next) || /^#{1,6}\s+/.test(next) || /^[-*+]\s+/.test(next) || /^\d+\.\s+/.test(next) || /^>/.test(next) || /^\$\$/.test(next)) break;
      paragraph.push(lines[index]);
      index++;
    }
    emitParagraph(paragraph);
  }

  return buildDocument(output.join('\n\n'), { ...options, title }, warnings);
}

export function typstToLatex(typst: string, options: ImportOptions = defaultImportOptions): ImportResult {
  const warnings: string[] = [];
  let source = typst.replace(/\r\n?/g, '\n');
  let title = options.title;
  let author = options.author;

  const documentSet = source.match(/#set\s+document\s*\(([\s\S]*?)\)/);
  if (documentSet) {
    const titleMatch = documentSet[1].match(/title\s*:\s*"([^"]*)"/);
    const authorMatch = documentSet[1].match(/author\s*:\s*"([^"]*)"/);
    if (titleMatch) title = title || titleMatch[1];
    if (authorMatch) author = author || authorMatch[1];
  }

  source = source.replace(/^\s*\/\/.*$/gm, '');
  source = source.replace(/#set\s+document\s*\([\s\S]*?\)\s*/g, '');
  source = source.replace(/#set\s+(?:page|text|par|heading|figure)\s*\([\s\S]*?\)\s*/g, '');
  source = source.replace(/#(?:show|let|import|include)\b[^\n]*/g, (match) => {
    warnings.push(`Ignored Typst code: ${match.trim().slice(0, 80)}`);
    return '';
  });

  source = source.replace(/#figure\s*\(\s*image\s*\(\s*"([^"]+)"([^)]*)\)\s*(?:,\s*caption\s*:\s*\[([^\]]*)\])?\s*\)/g, (_, path: string, extra: string, caption = '') => {
    const widthMatch = extra.match(/width\s*:\s*([0-9.]+%)/);
    const width = widthMatch ? widthMatch[1].replace('%', '') : '80';
    const captionLine = caption ? `\n\\caption{${inlineMarkdown(caption, warnings)}}` : '';
    return `\n\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=${Number(width) / 100}\\linewidth]{${path}}${captionLine}\n\\end{figure}\n`;
  });

  const lines = source.split('\n');
  const output: string[] = [];
  let index = 0;

  const convertInline = (value: string): string => {
    const stash = createStash();
    let text = value;
    text = text.replace(/\$([^$\n]+?)\$/g, (_, math: string) => stash.put(`$${math.trim()}$`));
    text = text.replace(/#link\s*\(\s*"([^"]+)"\s*\)\s*\[([^\]]*)\]/g, (_, href: string, label: string) =>
      stash.put(`\\href{${href}}{${inlineMarkdown(label, warnings)}}`));
    text = text.replace(/#image\s*\(\s*"([^"]+)"[^)]*\)/g, (_, path: string) =>
      stash.put(`\\includegraphics[width=0.8\\linewidth]{${path}}`));
    text = text.replace(/#text\s*\([^)]*\)\s*\[([^\]]*)\]/g, (_, content: string) => stash.put(inlineMarkdown(content, warnings)));
    text = text.replace(/#[A-Za-z][\w-]*\s*\([^)]*\)\s*\[([^\]]*)\]/g, (_, content: string) => {
      warnings.push('A Typst function was reduced to its content.');
      return stash.put(inlineMarkdown(content, warnings));
    });
    text = text.replace(/`([^`\n]+)`/g, (_, code: string) => stash.put(`\\texttt{${escapeLatex(code)}}`));
    text = escapeLatex(text);
    text = text.replace(/\*([^*\n]+)\*/g, '\\textbf{$1}');
    text = text.replace(/\\_([^\\_\n]+)\\_/g, '\\emph{$1}');
    return restore(text, stash);
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index++;
      continue;
    }

    if (/^```/.test(trimmed)) {
      index++;
      const code: string[] = [];
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index++;
      }
      index++;
      output.push(`\\begin{verbatim}\n${code.join('\n')}\n\\end{verbatim}`);
      continue;
    }

    const heading = trimmed.match(/^(=+)\s+(.*)$/);
    if (heading) {
      const level = Math.min(4, heading[1].length);
      const command = ['section', 'subsection', 'subsubsection', 'paragraph'][level - 1];
      output.push(`\\${command}{${convertInline(heading[2].trim())}}`);
      index++;
      continue;
    }

    if (/^[-+]\s+/.test(trimmed)) {
      const ordered = /^\+\s+/.test(trimmed);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(ordered ? /^\+\s+(.*)$/ : /^-\s+(.*)$/);
        if (!item) break;
        items.push(convertInline(item[1]));
        index++;
      }
      output.push(`\\begin{${ordered ? 'enumerate' : 'itemize'}}\n${items.map((item) => `  \\item ${item}`).join('\n')}\n\\end{${ordered ? 'enumerate' : 'itemize'}}`);
      continue;
    }

    if (/^#image\s*\(/.test(trimmed)) {
      const image = trimmed.match(/#image\s*\(\s*"([^"]+)"[^)]*\)/);
      if (image) {
        output.push(`\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=0.8\\linewidth]{${image[1]}}\n\\end{figure}`);
      }
      index++;
      continue;
    }

    if (/^#align\s*\(/.test(trimmed)) {
      const content = trimmed.match(/\[([\s\S]*)\]/);
      if (content) output.push(`\\begin{center}\n${convertInline(content[1])}\n\\end{center}`);
      else warnings.push('Unsupported #align block was skipped.');
      index++;
      continue;
    }

    if (/^#/.test(trimmed)) {
      warnings.push(`Unsupported Typst line was skipped: ${trimmed.slice(0, 70)}`);
      index++;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^```/.test(next) || /^=+\s+/.test(next) || /^[-+]\s+/.test(next) || /^#/.test(next)) break;
      paragraph.push(lines[index]);
      index++;
    }
    output.push(convertInline(paragraph.join(' ')));
  }

  return buildDocument(output.join('\n\n'), { ...options, title, author }, warnings);
}

export function detectImportFormat(fileName: string): ImportFormat {
  return /\.(typ|typst)$/i.test(fileName) ? 'typst' : 'markdown';
}
