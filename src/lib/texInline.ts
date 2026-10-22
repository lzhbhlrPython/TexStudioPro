import katex from 'katex';
import { skipTexSpace, texGroup } from './texDocument';

export const escapeInlineHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const formats: Record<string, string> = { textbf: 'cm-bold', textit: 'cm-italic', emph: 'cm-italic', textsl: 'cm-italic', underline: 'cm-underline', texttt: 'cm-inline-code', textsc: 'cm-smallcaps' };

/** Nested inline content, without expanding arbitrary TeX or losing its source coordinates. */
export function renderInlineTex(text: string, base = 0, depth = 0): string {
  if (depth > 20) return escapeInlineHtml(text);
  let html = '';
  const math = (source: string, from: number): string | null => {
    try { return `<span class="cm-math-inline" data-tex-offset="${base + from}">${katex.renderToString(source, { throwOnError: true, strict: 'ignore', trust: false, maxExpand: 500 })}</span>`; }
    catch { return null; }
  };
  for (let at = 0; at < text.length;) {
    const start = at;
    if (text[at] === '$' || text.startsWith('\\(', at)) {
      const delimiter = text[at] === '$' ? '$' : '\\)', width = delimiter.length;
      let end = at + width;
      while (end < text.length) {
        if (text.startsWith(delimiter, end)) break;
        if (text[end] === '\\') end++;
        end++;
      }
      if (end < text.length && end > at + width) {
        const rendered = math(text.slice(at + width, end), at + width);
        html += rendered ?? escapeInlineHtml(text.slice(at, end + width)); at = end + width; continue;
      }
    }
    if (text[at] === '\\') {
      const command = /^\\([a-zA-Z@]+|.)/.exec(text.slice(at));
      if (command) {
        const name = command[1], end = at + command[0].length;
        if (name.length === 1 && /[&%_$#{}]/.test(name)) { html += escapeInlineHtml(name); at = end; continue; }
        if (formats[name]) {
          const group = texGroup(text, skipTexSpace(text, end));
          if (group) {
            html += `<span class="${formats[name]}" data-tex-offset="${base + group.from + 1}">${renderInlineTex(text.slice(group.from + 1, group.to - 1), base + group.from + 1, depth + 1)}</span>`;
            at = group.to; continue;
          }
        }
      }
    }
    html += escapeInlineHtml(text[start]); at++;
  }
  return html;
}
