const MATH_MAP: Record<string, string> = {
  'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ', 'ε': '\\epsilon ',
  'θ': '\\theta ', 'λ': '\\lambda ', 'μ': '\\mu ', 'π': '\\pi ', 'σ': '\\sigma ',
  'φ': '\\phi ', 'ω': '\\omega ', 'Γ': '\\Gamma ', 'Δ': '\\Delta ', 'Σ': '\\Sigma ',
  'Ω': '\\Omega ', '≤': '\\leq ', '≥': '\\geq ', '≠': '\\neq ', '≈': '\\approx ',
  '×': '\\times ', '÷': '\\div ', '±': '\\pm ', '∞': '\\infty ', '∈': '\\in ',
  '∑': '\\sum ', '∏': '\\prod ', '∫': '\\int ', '√': '\\sqrt ', '→': '\\to ',
  '←': '\\leftarrow ', '⇒': '\\Rightarrow ', '⇔': '\\Leftrightarrow ',
  '−': '-', '–': '--', '—': '---', '…': '\\ldots{}', '“': '"', '”': '"', '‘': "'", '’': "'",
  '\u00a0': ' ', '\u200b': '', '\u200c': '', '\u200d': '', '\ufeff': '',
};

export function cleanPlainPaste(text: string): string {
  let value = text.replace(/\r\n?/g, '\n');
  for (const [from, to] of Object.entries(MATH_MAP)) value = value.split(from).join(to);
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n');
}

function escapeLatex(value: string): string {
  return value.replace(/([{}%$#&_])/g, '\\$1');
}

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
    case 'a':
      return `\\href{${escapeLatex(element.getAttribute('href') || '')}}{${inner()}}`;
    case 'br':
      return '\\\\\n';
    case 'sup':
      return `\\textsuperscript{${inner()}}`;
    case 'sub':
      return `\\textsubscript{${inner()}}`;
    case 'img':
      return `\\includegraphics[width=0.8\\linewidth]{${escapeLatex(element.getAttribute('src') || '')}}`;
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
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li');
      const env = tag === 'ol' ? 'enumerate' : 'itemize';
      parts.push(`\n\\begin{${env}}\n${items.map((item) => `  \\item ${inlineHtml(item).trim()}`).join('\n')}\n\\end{${env}}\n`);
      return;
    }
    if (tag === 'p' || tag === 'div' || tag === 'blockquote') {
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
  const plain = cleanPlainPaste(text);
  if (html && /<(table|h[1-3]|p|ul|ol|li|strong|em)\b/i.test(html)) {
    const converted = cleanHtmlPaste(html);
    if (converted.trim()) return converted;
  }
  return plain;
}
