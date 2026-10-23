import { escapeProse, hasTexSource, markdownPaste, proseTable } from './writingFormats';

export function cleanPlainPaste(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}
const escapeLatex = escapeProse;

function inlineHtml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeLatex(node.textContent || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node as HTMLElement;
  const inner = () => Array.from(element.childNodes).map(inlineHtml).join('');
  switch (element.tagName.toLowerCase()) {
    case 'strong':
    case 'b':
      return `\\textbf{${inner()}}`;
    case 'em':
    case 'i':
      return `\\textit{${inner()}}`;
    case 'code':
      return `\\texttt{${escapeLatex(element.textContent || '')}}`;
    case 'a': {
      const href = element.getAttribute('href') || '';
      return /^(https?:|mailto:)/i.test(href) ? `\\href{${escapeLatex(href)}}{${inner()}}` : inner();
    }
    case 'ul': case 'ol': {
      const env = element.tagName.toLowerCase() === 'ol' ? 'enumerate' : 'itemize';
      return `\n\\begin{${env}}\n${Array.from(element.children).filter(child => child.tagName.toLowerCase() === 'li').map(child => '  \\item ' + inlineHtml(child)).join('\n')}\n\\end{${env}}\n`;
    }
    case 'br':
      return '\\\\\n';
    case 'sup':
      return `\\textsuperscript{${inner()}}`;
    case 'sub':
      return `\\textsubscript{${inner()}}`;
    case 'script': case 'style': case 'noscript': case 'iframe':
      return '';
    case 'img':
      return escapeLatex(element.getAttribute('alt') || '');
    default:
      return inner();
  }
}

function tableHtml(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return '';
  const matrix = rows.map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => inlineHtml(cell).trim()));
  const columns = Math.max(...matrix.map((row) => row.length));
  const body = matrix.map((row) => Array.from({ length: columns }, (_, index) => row[index] || '').join(' & ') + ' \\\\').join('\n');
  return `\\begin{tabular}{${'l'.repeat(columns)}}\n\\hline\n${body}\n\\hline\n\\end{tabular}`;
}

export function cleanHtmlPaste(html: string): string {
  if (!html.trim()) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,iframe').forEach(node => node.remove());
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = cleanPlainPaste(node.textContent || '').trim();
      if (text) parts.push(escapeLatex(text));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === 'table') {
      parts.push(`\n${tableHtml(element as HTMLTableElement)}\n`);
      return;
    }
    if (tag === 'h1') { parts.push(`\n\\section{${inlineHtml(element)}}\n`); return; }
    if (tag === 'h2') { parts.push(`\n\\subsection{${inlineHtml(element)}}\n`); return; }
    if (tag === 'h3') { parts.push(`\n\\subsubsection{${inlineHtml(element)}}\n`); return; }
    if (/^h[4-6]$/.test(tag)) { parts.push(`\n\\${tag === 'h4' ? 'paragraph' : 'subparagraph'}{${inlineHtml(element)}}\n`); return; }
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li');
      const env = tag === 'ol' ? 'enumerate' : 'itemize';
      parts.push(`\n\\begin{${env}}\n${items.map((item) => `  \\item ${inlineHtml(item).trim()}`).join('\n')}\n\\end{${env}}\n`);
      return;
    }
    if (tag === 'div' && Array.from(element.children).some(child => /^(p|div|h[1-6]|ul|ol|table|blockquote)$/.test(child.tagName.toLowerCase()))) { Array.from(element.childNodes).forEach(walk); return; }
    if (tag === 'blockquote') { parts.push(`\\begin{quote}\n${inlineHtml(element).trim()}\n\\end{quote}`); return; }
    if (tag === 'p' || tag === 'div') {
      parts.push(`\n${inlineHtml(element).trim()}\n`);
      return;
    }
    if (tag === 'br') { parts.push('\n'); return; }
    Array.from(element.childNodes).forEach(walk);
  };
  Array.from(doc.body.childNodes).forEach(walk);
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function smartPaste(text: string, html: string): string {
  // Code copied from an editor must never be interpreted as rich prose.
  if (hasTexSource(text)) return text;
  const plain = cleanPlainPaste(text);
  if (html && /<(table|h[1-6]|p|ul|ol|li|strong|b|em|i|code)\b/i.test(html)) {
    // Merged cells cannot be flattened without losing meaning. Preserve the clipboard text.
    if (/\b(?:rowspan|colspan)\s*=\s*["']?(?:[2-9]\d*|1\d+)/i.test(html)) return text;
    const converted = cleanHtmlPaste(html);
    if (converted.trim()) return converted;
  }
  const rows = plain.trimEnd().split('\n').map(row => row.split('\t'));
  if (rows.length > 1 && rows.length <= 500 && rows[0].length > 1 && rows[0].length <= 50 && rows.every(row => row.length === rows[0].length)) return proseTable(rows);
  if (/^\s*\|?\s*:?-{3,}:?\s*\||^#{1,6} |^[-+*] |^\d+[.)] |^> |^```|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]]+\]\(https?:/m.test(plain)) return markdownPaste(plain);
  return plain;
}
