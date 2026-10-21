import katex from 'katex';

export type ExportFormat = 'markdown' | 'typst' | 'html';

interface DocumentParts {
  body: string;
  title: string;
  author: string;
  date: string;
}

function readBraced(text: string, command: string): string {
  const match = new RegExp(`\\\\${command}\\s*\\{`).exec(text);
  if (!match) return '';
  let index = match.index + match[0].length;
  let depth = 1;
  const start = index;
  while (index < text.length && depth > 0) {
    if (text[index] === '\\') { index += 2; continue; }
    if (text[index] === '{') depth++;
    if (text[index] === '}') depth--;
    index++;
  }
  return depth === 0 ? text.slice(start, index - 1).trim() : '';
}

function documentParts(latex: string): DocumentParts {
  const title = readBraced(latex, 'title');
  const author = readBraced(latex, 'author');
  const date = readBraced(latex, 'date');
  const begin = latex.indexOf('\\begin{document}');
  const end = latex.lastIndexOf('\\end{document}');
  let body = begin >= 0 ? latex.slice(begin + '\\begin{document}'.length) : latex;
  if (begin >= 0 && end > begin) body = latex.slice(begin + '\\begin{document}'.length, end);
  body = body.replace(/\\maketitle\b/g, '').replace(/\\tableofcontents\b/g, '');
  return { body, title, author, date };
}

function cleanInline(value: string): string {
  return value
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\(?:nonumber|notag|noindent|centering|small|large|Large)\b/g, '')
    .replace(/\\,|\\;|\\!|\\quad|\\qquad/g, ' ')
    .replace(/~+/g, ' ')
    .replace(/\\LaTeX\s*\{\}/g, 'LaTeX')
    .replace(/\\TeX\s*\{\}/g, 'TeX')
    .replace(/\\ldots/g, '...')
    .trim();
}

function plainTitle(value: string): string {
  return value
    .replace(/\\(?:textbf|textit|emph|texttt)\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:LaTeX|TeX)\s*\{\}/g, (match) => (match.includes('LaTeX') ? 'LaTeX' : 'TeX'))
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inlineLatexToMarkdown(input: string): string {
  let text = input;
  text = text.replace(/\\textbf\{([^{}]*)\}/g, '**$1**');
  text = text.replace(/\\textit\{([^{}]*)\}/g, '*$1*');
  text = text.replace(/\\emph\{([^{}]*)\}/g, '*$1*');
  text = text.replace(/\\texttt\{([^{}]*)\}/g, '`$1`');
  text = text.replace(/\\href\{([^{}]+)\}\{([^{}]*)\}/g, '[$2]($1)');
  text = text.replace(/\\cite\{([^{}]+)\}/g, '[@$1]');
  text = text.replace(/\\ref\{([^{}]+)\}/g, '[$1](#$1)');
  text = text.replace(/\\eqref\{([^{}]+)\}/g, '($1)');
  text = text.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/g, '![]($1)');
  text = text.replace(/\$([^$]+)\$/g, (_, math: string) => `$${math}$`);
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, math: string) => `$${math.trim()}$`);
  text = cleanInline(text);
  return text.replace(/[ \t]+/g, ' ');
}

function inlineLatexToTypst(input: string): string {
  let text = input;
  text = text.replace(/\\textbf\{([^{}]*)\}/g, '*$1*');
  text = text.replace(/\\textit\{([^{}]*)\}/g, '_$1_');
  text = text.replace(/\\emph\{([^{}]*)\}/g, '_$1_');
  text = text.replace(/\\texttt\{([^{}]*)\}/g, '`$1`');
  text = text.replace(/\\href\{([^{}]+)\}\{([^{}]*)\}/g, '#link("$1")[$2]');
  text = text.replace(/\\cite\{([^{}]+)\}/g, '@$1');
  text = text.replace(/\\ref\{([^{}]+)\}/g, '@$1');
  text = text.replace(/\\eqref\{([^{}]+)\}/g, '@$1');
  text = text.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/g, '#image("$1")');
  text = text.replace(/\$([^$]+)\$/g, (_, math: string) => `$${math}$`);
  text = cleanInline(text);
  return text.replace(/[ \t]+/g, ' ');
}

function replaceEnvironment(body: string, name: string, replacement: (content: string) => string): string {
  const pattern = new RegExp(`\\\\begin\\{${name}\\}(?:\\[[^\\]]*\\])?([\\s\\S]*?)\\\\end\\{${name}\\}`, 'g');
  return body.replace(pattern, (_, content: string) => replacement(content));
}

function markdownBody(body: string): string {
  let text = body.replace(/\\begin\{document\}/g, '').replace(/\\end\{document\}/g, '');
  text = replaceEnvironment(text, 'verbatim', (content) => `\n\`\`\`\n${content.trim()}\n\`\`\`\n`);
  text = replaceEnvironment(text, 'lstlisting', (content) => `\n\`\`\`\n${content.trim()}\n\`\`\`\n`);
  text = replaceEnvironment(text, 'abstract', (content) => `\n**Abstract**\n\n${inlineLatexToMarkdown(content)}\n`);
  text = replaceEnvironment(text, 'quote', (content) => `\n> ${inlineLatexToMarkdown(content).replace(/\n/g, '\n> ')}\n`);
  text = replaceEnvironment(text, 'itemize', (content) => {
    const items = [...content.matchAll(/\\item\s+([\s\S]*?)(?=\\item|$)/g)].map((match) => `- ${inlineLatexToMarkdown(match[1]).trim()}`);
    return `\n${items.join('\n')}\n`;
  });
  text = replaceEnvironment(text, 'enumerate', (content) => {
    const items = [...content.matchAll(/\\item\s+([\s\S]*?)(?=\\item|$)/g)].map((match, index) => `${index + 1}. ${inlineLatexToMarkdown(match[1]).trim()}`);
    return `\n${items.join('\n')}\n`;
  });
  for (const env of ['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*']) {
    text = replaceEnvironment(text, env, (content) => `\n$$\n${cleanInline(content)}\n$$\n`);
  }
  text = replaceEnvironment(text, 'figure', (content) => {
    const image = content.match(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/);
    const caption = content.match(/\\caption\{([^{}]*)\}/);
    if (!image) return '';
    return `\n![${inlineLatexToMarkdown(caption?.[1] || '')}](${image[1]})\n`;
  });
  text = replaceEnvironment(text, 'table', (content) => {
    const tabular = content.match(/\\begin\{tabular\}(?:\{[^}]*\})?([\s\S]*?)\\end\{tabular\}/);
    if (!tabular) return inlineLatexToMarkdown(content);
    const rows = tabular[1]
      .replace(/\\(?:hline|toprule|midrule|bottomrule)\b/g, '')
      .split(/\\\\/)
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row) => row.split('&').map((cell) => inlineLatexToMarkdown(cell)));
    if (!rows.length) return '';
    const header = rows[0];
    return `\n| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n${rows.slice(1).map((row) => `| ${row.join(' | ')} |`).join('\n')}\n`;
  });

  text = text.replace(/\\(?:sub)?section\*?\{([^{}]*)\}/g, (_, title: string) => `\n## ${inlineLatexToMarkdown(title)}\n`);
  text = text.replace(/\\(?:chapter|part)\*?\{([^{}]*)\}/g, (_, title: string) => `\n# ${inlineLatexToMarkdown(title)}\n`);
  text = text.replace(/\\paragraph\*?\{([^{}]*)\}/g, (_, title: string) => `\n**${inlineLatexToMarkdown(title)}**\n`);
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `\n$$\n${math.trim()}\n$$\n`);
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.split('\n').map((line) => (line.trim().startsWith('\\') ? '' : inlineLatexToMarkdown(line))).join('\n').trim();
}

function typstBody(body: string): string {
  let text = body.replace(/\\begin\{document\}/g, '').replace(/\\end\{document\}/g, '');
  text = replaceEnvironment(text, 'verbatim', (content) => `\n\`\`\`\n${content.trim()}\n\`\`\`\n`);
  text = replaceEnvironment(text, 'abstract', (content) => `\n*Abstract*\n\n${inlineLatexToTypst(content)}\n`);
  text = replaceEnvironment(text, 'itemize', (content) => {
    const items = [...content.matchAll(/\\item\s+([\s\S]*?)(?=\\item|$)/g)].map((match) => `- ${inlineLatexToTypst(match[1]).trim()}`);
    return `\n${items.join('\n')}\n`;
  });
  text = replaceEnvironment(text, 'enumerate', (content) => {
    const items = [...content.matchAll(/\\item\s+([\s\S]*?)(?=\\item|$)/g)].map((match) => `+ ${inlineLatexToTypst(match[1]).trim()}`);
    return `\n${items.join('\n')}\n`;
  });
  for (const env of ['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*']) {
    text = replaceEnvironment(text, env, (content) => `\n$ ${cleanInline(content)} $\n`);
  }
  text = replaceEnvironment(text, 'figure', (content) => {
    const image = content.match(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/);
    const caption = content.match(/\\caption\{([^{}]*)\}/);
    if (!image) return '';
    return caption
      ? `\n#figure(image("${image[1]}"), caption: [${inlineLatexToTypst(caption[1])}])\n`
      : `\n#image("${image[1]}")\n`;
  });
  text = text.replace(/\\(?:sub)?section\*?\{([^{}]*)\}/g, (_, title: string) => `\n== ${inlineLatexToTypst(title)}\n`);
  text = text.replace(/\\(?:chapter|part)\*?\{([^{}]*)\}/g, (_, title: string) => `\n= ${inlineLatexToTypst(title)}\n`);
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `\n$ ${math.trim()} $\n`);
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.split('\n').map((line) => (line.trim().startsWith('\\') ? '' : inlineLatexToTypst(line))).join('\n').trim();
}

function inlineHtml(input: string): string {
  const stash: string[] = [];
  const put = (html: string) => {
    const token = `\u0000${stash.length}\u0000`;
    stash.push(html);
    return token;
  };
  let text = input;
  text = text.replace(/\$([^$]+)\$/g, (_, math: string) => {
    try { return put(katex.renderToString(math.trim(), { throwOnError: false, displayMode: false })); } catch { return put(`<code>${math}</code>`); }
  });
  text = text.replace(/\\textbf\{([^{}]*)\}/g, (_, value: string) => put(`<strong>${value}</strong>`));
  text = text.replace(/\\textit\{([^{}]*)\}/g, (_, value: string) => put(`<em>${value}</em>`));
  text = text.replace(/\\emph\{([^{}]*)\}/g, (_, value: string) => put(`<em>${value}</em>`));
  text = text.replace(/\\texttt\{([^{}]*)\}/g, (_, value: string) => put(`<code>${value}</code>`));
  text = text.replace(/\\href\{([^{}]+)\}\{([^{}]*)\}/g, (_, href: string, value: string) => put(`<a href="${href}">${value}</a>`));
  text = text.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/g, (_, src: string) => put(`<img src="${src}" alt="" />`));
  text = text.replace(/\\cite\{([^{}]+)\}/g, (_, key: string) => put(`<span class="cite">[${key}]</span>`));
  text = cleanInline(text);
  text = text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
  return text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => stash[Number(index)] || '');
}

function htmlBody(body: string): string {
  const blocks: string[] = [];
  const block = (html: string) => {
    const token = `\u0000B${blocks.length}\u0000`;
    blocks.push(html);
    return token;
  };
  let text = body.replace(/\\begin\{document\}/g, '').replace(/\\end\{document\}/g, '');
  text = replaceEnvironment(text, 'abstract', (content) => block(`<blockquote>${inlineHtml(content)}</blockquote>`));
  text = replaceEnvironment(text, 'quote', (content) => block(`<blockquote>${inlineHtml(content)}</blockquote>`));
  text = replaceEnvironment(text, 'equation', (content) => block(`<div class="math">${katex.renderToString(cleanInline(content), { throwOnError: false, displayMode: true })}</div>`));
  text = replaceEnvironment(text, 'equation*', (content) => block(`<div class="math">${katex.renderToString(cleanInline(content), { throwOnError: false, displayMode: true })}</div>`));
  text = replaceEnvironment(text, 'itemize', (content) => block(`<ul>${[...content.matchAll(/\\item\s+([\s\S]*?)(?=\\item|$)/g)].map((match) => `<li>${inlineHtml(match[1])}</li>`).join('')}</ul>`));
  text = replaceEnvironment(text, 'enumerate', (content) => block(`<ol>${[...content.matchAll(/\\item\s+([\s\S]*?)(?=\\item|$)/g)].map((match) => `<li>${inlineHtml(match[1])}</li>`).join('')}</ol>`));
  text = replaceEnvironment(text, 'figure', (content) => {
    const image = content.match(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/);
    const caption = content.match(/\\caption\{([^{}]*)\}/);
    if (!image) return '';
    return block(`<figure><img src="${image[1]}" alt="" />${caption ? `<figcaption>${inlineHtml(caption[1])}</figcaption>` : ''}</figure>`);
  });
  text = text.replace(/\\(?:sub)?section\*?\{([^{}]*)\}/g, (_, title: string) => block(`<h2>${inlineHtml(title)}</h2>`));
  text = text.replace(/\\(?:chapter|part)\*?\{([^{}]*)\}/g, (_, title: string) => block(`<h1>${inlineHtml(title)}</h1>`));
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => block(`<div class="math">${katex.renderToString(math.trim(), { throwOnError: false, displayMode: true })}</div>`));
  text = text.replace(/\n{2,}/g, `\u0000P\u0000`);
  let html = text
    .split('\u0000P\u0000')
    .map((paragraph) => {
      const trimmed = paragraph.trim();
      if (!trimmed) return '';
      if (/^\u0000B\d+\u0000$/.test(trimmed)) return trimmed;
      return `<p>${inlineHtml(trimmed).replace(/\n/g, ' ')}</p>`;
    })
    .join('\n');
  html = html.replace(/\u0000B(\d+)\u0000/g, (_, index: string) => blocks[Number(index)] || '');
  return html;
}

export function exportLatex(latex: string, format: ExportFormat): string {
  const { body, title: rawTitle, author: rawAuthor, date } = documentParts(latex);
  const title = plainTitle(rawTitle);
  const author = plainTitle(rawAuthor);
  if (format === 'markdown') {
    const front = ['---', title ? `title: "${title.replace(/"/g, '\\"')}"` : '', author ? `author: "${author.replace(/"/g, '\\"')}"` : '', date && date !== '\\today' ? `date: "${date}"` : '', '---', ''].filter(Boolean).join('\n');
    return `${front}\n# ${title || 'Document'}\n\n${markdownBody(body)}\n`;
  }
  if (format === 'typst') {
    const meta = [title ? `title: "${title}"` : '', author ? `author: "${author}"` : ''].filter(Boolean).join(', ');
    return `${meta ? `#set document(${meta})\n\n` : ''}= ${title || 'Document'}\n\n${typstBody(body)}\n`;
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title || 'Document'}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
<style>
body{max-width:760px;margin:48px auto;padding:0 24px;font:17px/1.7 Georgia,serif;color:#29241f}
h1,h2{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.25}
code{background:#f4f0e8;padding:1px 4px;border-radius:3px}
.math{margin:1.2em 0;text-align:center}
.cite{color:#a34b2a}
</style>
</head>
<body>
<h1>${inlineHtml(rawTitle) || 'Document'}</h1>
${author ? `<p><em>${author}</em></p>` : ''}
${htmlBody(body)}
</body>
</html>`;
}
