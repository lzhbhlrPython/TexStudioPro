import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import katex from 'katex';
import { assetUrl, dirname, joinPath, parseDocumentTitle } from '../lib/latex';
import { t } from '../i18n';

export interface VisualContext {
  filePath: string;
  projectRoot: string;
  collapsePreamble: boolean;
}

export interface VisualConfig {
  get: () => VisualContext;
}

const MATH_ENVIRONMENTS = 'equation\\*?|align\\*?|gather\\*?|multline\\*?|eqnarray\\*?';
const mathHtmlCache = new Map<string, string>();

function renderMath(tex: string, displayMode: boolean): string {
  const cacheKey = `${displayMode ? 'd' : 'i'}:${tex}`;
  const cached = mathHtmlCache.get(cacheKey);
  if (cached) {
    mathHtmlCache.delete(cacheKey);
    mathHtmlCache.set(cacheKey, cached);
    return cached;
  }
  try {
    const html = katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      errorColor: 'var(--danger)',
      strict: 'ignore',
      trust: false,
      maxExpand: 500,
      macros: {
        '\\R': '\\mathbb{R}',
        '\\N': '\\mathbb{N}',
        '\\Z': '\\mathbb{Z}',
        '\\C': '\\mathbb{C}',
        '\\dd': '\\mathrm{d}',
      },
    });
    mathHtmlCache.set(cacheKey, html);
    if (mathHtmlCache.size > 800) {
      const oldest = mathHtmlCache.keys().next().value;
      if (oldest) mathHtmlCache.delete(oldest);
    }
    return html;
  } catch {
    return '';
  }
}

function activate(view: EditorView, pos: number) {
  view.dispatch({
    selection: { anchor: pos },
    scrollIntoView: true,
  });
  view.focus();
}

abstract class LatexWidget extends WidgetType {
  constructor(readonly focusPos: number) {
    super();
  }

  protected bind(dom: HTMLElement, view: EditorView) {
    dom.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      activate(view, this.focusPos);
    });
    dom.setAttribute('title', t('Click to edit LaTeX source'));
    dom.setAttribute('data-texpro-pos', String(this.focusPos));
  }
}

class InlineMathWidget extends LatexWidget {
  constructor(readonly tex: string, focusPos: number) {
    super(focusPos);
  }

  eq(other: InlineMathWidget) {
    return other.tex === this.tex;
  }

  toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.className = 'cm-math-inline';
    span.innerHTML = renderMath(this.tex, false);
    this.bind(span, view);
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

class DisplayMathWidget extends LatexWidget {
  constructor(
    readonly tex: string,
    readonly label: string | null,
    focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: DisplayMathWidget) {
    return other.tex === this.tex && other.label === this.label;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-math-block';
    const body = document.createElement('div');
    body.className = 'cm-math-block-body';
    body.innerHTML = renderMath(this.tex, true);
    wrap.appendChild(body);
    if (this.label) {
      const tag = document.createElement('span');
      tag.className = 'cm-math-label';
      tag.textContent = this.label;
      wrap.appendChild(tag);
    }
    this.bind(wrap, view);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

class SectionBadgeWidget extends LatexWidget {
  constructor(
    readonly level: number,
    focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: SectionBadgeWidget) {
    return other.level === this.level;
  }

  toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.className = `cm-section-badge cm-section-badge-${this.level}`;
    span.textContent = 'H' + this.level;
    this.bind(span, view);
    return span;
  }
}

class BulletWidget extends LatexWidget {
  constructor(focusPos: number) {
    super(focusPos);
  }

  eq() {
    return true;
  }

  toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.className = 'cm-list-bullet';
    span.textContent = '•';
    this.bind(span, view);
    return span;
  }
}

class ImageWidget extends LatexWidget {
  constructor(
    readonly src: string,
    readonly label: string,
    readonly block: boolean,
    focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.block === this.block;
  }

  toDOM(view: EditorView) {
    const figure = document.createElement('figure');
    figure.className = this.block ? 'cm-image-figure cm-image-block' : 'cm-image-figure';
    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.label;
    img.loading = 'eager';
    img.addEventListener('error', () => {
      figure.classList.add('cm-image-missing');
      img.remove();
      const fallback = document.createElement('span');
      fallback.className = 'cm-image-fallback';
      fallback.textContent = t('Missing image: {name}', { name: this.label });
      figure.appendChild(fallback);
    });
    figure.appendChild(img);
    if (this.block) {
      const caption = document.createElement('figcaption');
      caption.textContent = this.label;
      figure.appendChild(caption);
    }
    this.bind(figure, view);
    return figure;
  }

  ignoreEvent() {
    return false;
  }
}

class TableWidget extends LatexWidget {
  constructor(
    readonly html: string,
    readonly focusPos: number,
    readonly rows: number,
    readonly source: string,
  ) {
    super(focusPos);
  }

  eq(other: TableWidget) {
    return other.html === this.html && other.source === this.source;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-table-widget';
    const table = document.createElement('div');
    table.className = 'cm-table-widget-inner';
    table.innerHTML = this.html;
    wrap.appendChild(table);
    const hint = document.createElement('div');
    hint.className = 'cm-table-hint';
    hint.textContent = `${t('n rows', { n: this.rows })} · ${t('click to edit source')}`;
    wrap.appendChild(hint);
    this.bind(wrap, view);
    wrap.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent('texpro:open-table', {
        detail: { source: this.source, focusPos: this.focusPos },
      }));
    }, true);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

class CodeBlockWidget extends LatexWidget {
  constructor(
    readonly code: string,
    readonly language: string,
    readonly focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: CodeBlockWidget) {
    return other.code === this.code && other.language === this.language;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-code-widget';
    const head = document.createElement('div');
    head.className = 'cm-code-head';
    const dot = document.createElement('i');
    const label = document.createElement('span');
    label.textContent = this.language || 'code';
    head.append(dot, label);
    const pre = document.createElement('pre');
    pre.textContent = this.code;
    wrap.append(head, pre);
    this.bind(wrap, view);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

class PreambleWidget extends LatexWidget {
  constructor(
    readonly documentClass: string,
    readonly packages: number,
    readonly lines: number,
    focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: PreambleWidget) {
    return other.documentClass === this.documentClass && other.packages === this.packages && other.lines === this.lines;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-preamble';
    const icon = document.createElement('div');
    icon.className = 'cm-preamble-icon';
    icon.textContent = 'P';
    const text = document.createElement('div');
    text.className = 'cm-preamble-text';
    const strong = document.createElement('strong');
    strong.textContent = t('Preamble');
    const detail = document.createElement('span');
    detail.textContent = `${this.documentClass} · ${t('n packages', { n: this.packages })} · ${t('n lines hidden', { n: this.lines })}`;
    text.append(strong, detail);
    const action = document.createElement('div');
    action.className = 'cm-preamble-action';
    action.textContent = t('Reveal');
    wrap.append(icon, text, action);
    this.bind(wrap, view);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

class TitleWidget extends LatexWidget {
  constructor(
    readonly title: string,
    readonly author: string,
    readonly date: string,
    focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: TitleWidget) {
    return other.title === this.title && other.author === this.author && other.date === this.date;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-title-widget';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'cm-title-eyebrow';
    eyebrow.textContent = t('TITLE PAGE');
    const h1 = document.createElement('h1');
    h1.textContent = this.title || 'Untitled document';
    const meta = document.createElement('div');
    meta.className = 'cm-title-meta';
    meta.textContent = [this.author, this.date].filter(Boolean).join('  ·  ');
    wrap.append(eyebrow, h1);
    if (meta.textContent) wrap.appendChild(meta);
    this.bind(wrap, view);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

class ReferenceWidget extends LatexWidget {
  constructor(
    readonly kind: string,
    readonly target: string,
    focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: ReferenceWidget) {
    return other.kind === this.kind && other.target === this.target;
  }

  toDOM(view: EditorView) {
    const element = document.createElement('span');
    const cite = this.kind.startsWith('cite') || this.kind === 'parencite' || this.kind === 'textcite';
    element.className = `cm-ref-pill ${cite ? 'cite' : 'ref'}`;
    element.textContent = cite
      ? `[${this.target}]`
      : this.kind === 'eqref'
        ? `(${this.target})`
        : `→ ${this.target}`;
    this.bind(element, view);
    return element;
  }
}

class TexLogoWidget extends LatexWidget {
  constructor(focusPos: number) {
    super(focusPos);
  }

  eq() {
    return true;
  }

  toDOM(view: EditorView) {
    const element = document.createElement('span');
    element.className = 'cm-tex-logo';
    element.textContent = 'LaTeX';
    this.bind(element, view);
    return element;
  }
}

interface TikzResult {
  ok: boolean;
  svgPath?: string;
  error?: string;
  log?: string;
  engine?: string;
  cached?: boolean;
}

const tikzRequests = new Map<string, Promise<TikzResult>>();

function requestTikz(source: string, projectRoot: string, filePath: string) {
  const key = projectRoot + '::' + source;
  const cached = tikzRequests.get(key);
  if (cached) return cached;
  const request: Promise<TikzResult> = window.texpro
    .renderTikz({ projectRoot, filePath, source })
    .catch((error): TikzResult => ({ ok: false, error: String(error) }));
  tikzRequests.set(key, request);
  return request;
}

class TikzWidget extends LatexWidget {
  constructor(
    readonly source: string,
    readonly projectRoot: string,
    readonly filePath: string,
    focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: TikzWidget) {
    return other.source === this.source && other.filePath === this.filePath;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-tikz-widget';

    const header = document.createElement('div');
    header.className = 'cm-tikz-header';
    const label = document.createElement('span');
    label.className = 'cm-tikz-label';
    label.textContent = 'TikZ';
    const status = document.createElement('span');
    status.className = 'cm-tikz-status';
    status.textContent = t('rendering…');
    const studio = document.createElement('button');
    studio.type = 'button';
    studio.className = 'cm-tikz-studio';
    studio.textContent = t('Studio');
    studio.title = t('Open TikZ studio');
    studio.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent('texpro:open-tikz', { detail: { source: this.source } }));
    });
    header.append(label, status, studio);

    const body = document.createElement('div');
    body.className = 'cm-tikz-body';
    const spinner = document.createElement('div');
    spinner.className = 'cm-tikz-spinner';
    spinner.textContent = t('Typesetting diagram…');
    body.appendChild(spinner);
    wrap.append(header, body);
    this.bind(body, view);

    requestTikz(this.source, this.projectRoot, this.filePath).then((result) => {
      if (!body.isConnected) return;
      if (result.ok && result.svgPath) {
        const img = document.createElement('img');
        img.src = assetUrl(result.svgPath);
        img.alt = 'TikZ diagram';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          body.innerHTML = `<div class="cm-tikz-error">${t('Could not load the rendered diagram.')}</div>`;
        });
        body.replaceChildren(img);
        status.textContent = result.cached ? 'cached' : result.engine || 'ready';
        status.classList.add('ready');
      } else {
        const message = document.createElement('div');
        message.className = 'cm-tikz-error';
        message.textContent = result.error || t('TikZ rendering failed');
        body.replaceChildren(message);
        status.textContent = 'error';
        status.classList.add('failed');
        if (result.log) {
          const details = document.createElement('details');
          details.className = 'cm-tikz-log';
          const summary = document.createElement('summary');
          summary.textContent = t('Show log');
          const pre = document.createElement('pre');
          pre.textContent = result.log.slice(-3000);
          details.append(summary, pre);
          wrap.appendChild(details);
        }
      }
    });

    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

class ClearWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    return document.createElement('span');
  }
}

class HiddenBlockWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const element = document.createElement('div');
    element.className = 'cm-hidden-block';
    return element;
  }
}

class EnvironmentWidget extends LatexWidget {
  constructor(
    readonly name: string,
    readonly closing: boolean,
    focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: EnvironmentWidget) {
    return other.name === this.name && other.closing === this.closing;
  }

  toDOM(view: EditorView) {
    const element = document.createElement('div');
    element.className = `cm-env-marker ${this.closing ? 'closing' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'cm-env-icon';
    icon.textContent = this.closing ? '/' : '▸';
    const label = document.createElement('span');
    label.textContent = this.name;
    element.append(icon, label);
    this.bind(element, view);
    return element;
  }

  ignoreEvent() {
    return false;
  }
}

class LabelWidget extends LatexWidget {
  constructor(
    readonly label: string,
    focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: LabelWidget) {
    return other.label === this.label;
  }

  toDOM(view: EditorView) {
    const element = document.createElement('span');
    element.className = 'cm-label-pill';
    element.textContent = '#' + this.label;
    this.bind(element, view);
    return element;
  }
}

class CaptionBadgeWidget extends LatexWidget {
  constructor(focusPos: number) {
    super(focusPos);
  }

  eq() {
    return true;
  }

  toDOM(view: EditorView) {
    const element = document.createElement('span');
    element.className = 'cm-caption-badge';
    element.textContent = 'CAPTION';
    this.bind(element, view);
    return element;
  }
}

interface Occupied {
  from: number;
  to: number;
}

function overlaps(from: number, to: number, ranges: Occupied[]) {
  return ranges.some((range) => from < range.to && to > range.from);
}

function makeMarkerRange(from: number, to: number, classes: string[]): Range<Decoration> {
  return Decoration.mark({ class: classes.join(' ') }).range(from, to);
}

function parseTabular(body: string, spec: string): string | null {
  const cleaned = body
    .replace(/\\(?:toprule|midrule|bottomrule|hline|endhead|endfirsthead|endfoot|endlastfoot)\b/g, '')
    .replace(/\\cmidrule(?:\([^)]*\))?\{[^}]*\}/g, '')
    .replace(/\\addlinespace(?:\[[^\]]*\])?/g, '')
    .replace(/\\(?:tiny|small|footnotesize|scriptsize|normalsize|large)\b/g, '');
  const rawRows = cleaned
    .split(/\\\\/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0 && !/^\\(?:caption|label|centering)/.test(row));
  if (rawRows.length === 0) return null;
  const alignments: string[] = [];
  const specText = spec.replace(/p\{[^}]*\}|m\{[^}]*\}|b\{[^}]*\}/g, 'l');
  for (const char of specText) {
    if (char === 'l' || char === 'c' || char === 'r') alignments.push(char);
  }
  const rows = rawRows.slice(0, 40).map((row) =>
    row
      .replace(/^\s*&/, '')
      .split('&')
      .map((cell) => cell.trim())
      .slice(0, 12),
  );
  const header = rows.shift();
  const escape = (value: string) => value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] || char);
  const td = (cell: string, index: number) => {
    const tag = header ? 'td' : 'td';
    const align = alignments[index] || 'l';
    return `<${tag} style="text-align:${align === 'l' ? 'left' : align === 'r' ? 'right' : 'center'}">${escape(cell) || '&nbsp;'}</${tag}>`;
  };
  return `<table><thead><tr>${(header || []).map((cell, index) => `<th style="text-align:${alignments[index] === 'r' ? 'right' : alignments[index] === 'c' ? 'center' : 'left'}">${escape(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map(td).join('')}</tr>`).join('')}</tbody></table>`;
}

function buildDecorations(state: EditorState, context: VisualContext): DecorationSet {
  const text = state.doc.toString();
  const ranges: Range<Decoration>[] = [];
  const occupied: Occupied[] = [];
  const selection = state.selection.main;
  const touched = (from: number, to: number) => selection.from < to && selection.to > from;

  const addBlock = (from: number, to: number, widget: WidgetType) => {
    ranges.push(Decoration.replace({ widget, block: true }).range(from, to));
    occupied.push({ from, to });
  };

  const preamble = text.match(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/);
  const documentStart = text.match(/\\begin\{document\}/);
  if (context.collapsePreamble && preamble && documentStart && !touched(0, documentStart.index! + documentStart[0].length)) {
    const startLine = state.doc.lineAt(preamble.index!);
    const endLine = state.doc.lineAt(documentStart.index! + documentStart[0].length);
    const info = parseDocumentTitle(text);
    addBlock(
      startLine.from,
      endLine.to,
      new PreambleWidget(info.documentClass, info.packages, endLine.number - startLine.number + 1, startLine.from + 1),
    );
  }

  for (const match of text.matchAll(/\\maketitle\b/g)) {
    if (match.index === undefined) continue;
    if (!preamble || match.index < (documentStart?.index ?? 0)) continue;
    if (touched(match.index, match.index + match[0].length)) continue;
    if (overlaps(match.index, match.index + match[0].length, occupied)) continue;
    const info = parseDocumentTitle(text);
    const titleLine = state.doc.lineAt(match.index);
    if (titleLine.text.trim() !== '\\maketitle') continue;
    ranges.push(
      Decoration.replace({
        widget: new TitleWidget(info.title, info.author, info.date, titleLine.from + 1),
        block: true,
      }).range(titleLine.from, titleLine.to),
    );
    occupied.push({ from: titleLine.from, to: titleLine.to });
  }

  const displayPatterns: Array<{
    regex: RegExp;
    body: (match: RegExpMatchArray) => string;
    environment?: boolean;
  }> = [
    { regex: /\$\$([\s\S]*?)\$\$/g, body: (match) => match[1] },
    { regex: /\\\[([\s\S]*?)\\\]/g, body: (match) => match[1] },
    {
      regex: new RegExp(`\\\\begin\\{(${MATH_ENVIRONMENTS})\\}([\\s\\S]*?)\\\\end\\{\\1\\}`, 'g'),
      body: (match) => match[2],
      environment: true,
    },
  ];

  for (const pattern of displayPatterns) {
    for (const match of text.matchAll(pattern.regex)) {
      if (match.index === undefined) continue;
      const from = match.index;
      const to = from + match[0].length;
      if (touched(from, to) || overlaps(from, to, occupied)) continue;
      const startLine = state.doc.lineAt(from);
      const endLine = state.doc.lineAt(to);
      const before = startLine.text.slice(0, from - startLine.from);
      const after = endLine.text.slice(to - endLine.from);
      if (before.trim() || after.trim()) continue;
      let tex = pattern.body(match)
        .replace(/\\label\{[^}]*\}/g, '')
        .replace(/\\(?:nonumber|notag)\b/g, '')
        .trim();
      if (!tex) continue;
      if (pattern.environment) {
        const environment = match[1];
        const wrapper = /^(align|eqnarray)/.test(environment) ? 'aligned' : 'gathered';
        tex = `\\begin{${wrapper}}${tex}\\end{${wrapper}}`;
      }
      const label = match[0].match(/\\label\{([^}]+)\}/)?.[1] ?? null;
      addBlock(startLine.from, endLine.to, new DisplayMathWidget(tex, label, startLine.from + 1));
    }
  }

  for (const match of text.matchAll(/\\begin\{(tabular|tabularx|longtable)\}(?:\[[^\]]*\])?\{([^}]*)\}([\s\S]*?)\\end\{\1\}/g)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    const html = parseTabular(match[3], match[2]);
    if (!html) continue;
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    if (startLine.text.slice(0, from - startLine.from).trim() || endLine.text.slice(to - endLine.from).trim()) continue;
    const rows = (html.match(/<tr>/g) || []).length;
    addBlock(startLine.from, endLine.to, new TableWidget(html, startLine.from + 1, rows, match[0]));
  }

  for (const match of text.matchAll(/\\begin\{(verbatim|lstlisting|minted)\}(?:\[([^\]]*)\])?(?:\{([^}]*)\})?([\s\S]*?)\\end\{\1\}/g)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    if (startLine.text.slice(0, from - startLine.from).trim() || endLine.text.slice(to - endLine.from).trim()) continue;
    const language = match[2]?.match(/language\s*=\s*([\w+-]+)/)?.[1] || match[3] || 'code';
    const code = match[4].trim();
    if (!code) continue;
    addBlock(startLine.from, endLine.to, new CodeBlockWidget(code, language, startLine.from + 1));
  }

  for (const match of text.matchAll(/\\begin\{tikzpicture\}(?:\[[^\]]*\])?[\s\S]*?\\end\{tikzpicture\}/g)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    if (startLine.text.slice(0, from - startLine.from).trim() || endLine.text.slice(to - endLine.from).trim()) continue;
    addBlock(
      startLine.from,
      endLine.to,
      new TikzWidget(match[0], context.projectRoot, context.filePath, startLine.from + 1),
    );
  }

  for (const match of text.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    const line = state.doc.lineAt(from);
    const isBlock = line.text.trim() === match[0].trim();
    const target = joinPath(dirname(context.filePath), match[1].trim());
    const widget = new ImageWidget(assetUrl(target), match[1].trim(), isBlock, from + 1);
    if (isBlock) {
      ranges.push(Decoration.replace({ widget, block: true }).range(line.from, line.to));
      occupied.push({ from: line.from, to: line.to });
    } else {
      ranges.push(Decoration.replace({ widget }).range(from, to));
      occupied.push({ from, to });
    }
  }

  const headingPattern = /^(\s*)\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{/;
  const levelMap: Record<string, number> = {
    part: 1,
    chapter: 1,
    section: 1,
    subsection: 2,
    subsubsection: 3,
    paragraph: 4,
  };
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const match = headingPattern.exec(line.text);
    if (!match) continue;
    if (touched(line.from, line.to)) continue;
    const level = levelMap[match[2]] || 1;
    ranges.push(Decoration.line({ class: `cm-heading-line cm-heading-${level}` }).range(line.from));
    const open = line.from + match[0].length - 1;
    if (!overlaps(line.from, open + 1, occupied)) {
      ranges.push(Decoration.replace({ widget: new SectionBadgeWidget(level, line.from + 1) }).range(line.from, open + 1));
      occupied.push({ from: line.from, to: open + 1 });
    }
    const close = line.text.lastIndexOf('}');
    if (close > match[0].length - 1 && close === line.text.length - 1) {
      const closePos = line.from + close;
      if (!overlaps(closePos, closePos + 1, occupied)) {
        ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(closePos, closePos + 1));
        occupied.push({ from: closePos, to: closePos + 1 });
      }
    }
  }

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const match = /^\s*\\item\s+/.exec(line.text);
    if (!match) continue;
    if (touched(line.from, line.to)) continue;
    const from = line.from + match[0].indexOf('\\item');
    const to = from + '\\item'.length;
    if (overlaps(from, to, occupied)) continue;
    ranges.push(Decoration.line({ class: 'cm-list-line' }).range(line.from));
    ranges.push(Decoration.replace({ widget: new BulletWidget(from + 1) }).range(from, to));
    occupied.push({ from, to });
  }

  const environmentPattern = /^\s*\\(begin|end)\{(abstract|itemize|enumerate|description|figure|figure\*|table|table\*|center|quote|theorem|proof|lemma)\}(?:\[[^\]]*\])?\s*$/;
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const match = environmentPattern.exec(line.text);
    if (!match) continue;
    if (touched(line.from, line.to)) continue;
    if (overlaps(line.from, line.to, occupied)) continue;
    addBlock(
      line.from,
      line.to,
      new EnvironmentWidget(match[2], match[1] === 'end', line.from + 1),
    );
  }

  let abstractStart = -1;
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    if (/^\s*\\begin\{abstract\}/.test(line.text)) abstractStart = lineNumber;
    if (/^\s*\\end\{abstract\}/.test(line.text) && abstractStart > 0) {
      for (let inner = abstractStart + 1; inner < lineNumber; inner++) {
        ranges.push(Decoration.line({ class: 'cm-abstract-line' }).range(state.doc.line(inner).from));
      }
      abstractStart = -1;
    }
  }

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    if (!/^\s*\\centering\s*$/.test(line.text)) continue;
    if (touched(line.from, line.to) || overlaps(line.from, line.to, occupied)) continue;
    ranges.push(Decoration.replace({ widget: new HiddenBlockWidget(), block: true }).range(line.from, line.to));
    occupied.push({ from: line.from, to: line.to });
  }

  for (const match of text.matchAll(/\\label\{([^}]+)\}/g)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    ranges.push(Decoration.replace({ widget: new LabelWidget(match[1], from + 1) }).range(from, to));
    occupied.push({ from, to });
  }

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const caption = /^(\s*)\\caption\s*\{/.exec(line.text);
    if (!caption) continue;
    if (touched(line.from, line.to) || overlaps(line.from, line.to, occupied)) continue;
    const open = line.from + caption[0].length - 1;
    const close = line.text.lastIndexOf('}');
    if (close > caption[0].length - 1) {
      ranges.push(Decoration.line({ class: 'cm-caption-line' }).range(line.from));
      ranges.push(Decoration.replace({ widget: new CaptionBadgeWidget(line.from + 1) }).range(line.from, open + 1));
      if (close === line.text.length - 1) {
        ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(line.from + close, line.from + close + 1));
      }
      occupied.push({ from: line.from, to: line.to });
    }
  }

  for (const match of text.matchAll(/\\LaTeX\s*\{\}/g)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    ranges.push(Decoration.replace({ widget: new TexLogoWidget(from + 1) }).range(from, to));
    occupied.push({ from, to });
  }

  for (const match of text.matchAll(/~(?=\\(?:ref|eqref|pageref|autoref|cite|citep|citet|parencite|textcite)\*?(?:\[[^\]]*\])?\{)/g)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + 1;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(from, to));
    occupied.push({ from, to });
  }

  for (const match of text.matchAll(/\\(ref|eqref|pageref|autoref|cite|citep|citet|parencite|textcite)\*?(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    ranges.push(Decoration.replace({ widget: new ReferenceWidget(match[1], match[2], from + 1) }).range(from, to));
    occupied.push({ from, to });
  }

  const commentPattern = /(^|[^\\])%.*$/gm;
  for (const match of text.matchAll(commentPattern)) {
    if (match.index === undefined) continue;
    const offset = match[1] ? match[1].length : 0;
    const from = match.index + offset;
    const to = match.index + match[0].length;
    if (overlaps(from, to, occupied)) continue;
    const isTodo = /^\s*%\s*(TODO|FIXME|NOTE)\b/i.test(match[0].slice(offset));
    ranges.push(makeMarkerRange(from, to, ['cm-comment', isTodo ? 'cm-todo-comment' : '']));
  }

  const hrefPattern = /\\href\{([^}]*)\}\{([^{}]*)\}/g;
  for (const match of text.matchAll(hrefPattern)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    const textStart = from + match[0].indexOf('{', match[0].indexOf('}') + 1) + 1;
    const textEnd = textStart + match[2].length;
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(from, textStart));
    ranges.push(
      Decoration.mark({
        class: 'cm-link',
        attributes: { 'data-href': match[1], title: match[1] },
      }).range(textStart, textEnd),
    );
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(textEnd, to));
    occupied.push({ from, to });
  }

  const formatPattern = /\\(textbf|textit|emph|textsl|underline|texttt|textsc)\{([^{}\n]*)\}/g;
  for (const match of text.matchAll(formatPattern)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    const contentStart = from + match[0].indexOf('{') + 1;
    const contentEnd = contentStart + match[2].length;
    if (contentEnd <= contentStart) continue;
    const cls =
      match[1] === 'textbf'
        ? 'cm-bold'
        : match[1] === 'texttt'
          ? 'cm-inline-code'
          : match[1] === 'underline'
            ? 'cm-underline'
            : match[1] === 'textsc'
              ? 'cm-smallcaps'
              : 'cm-italic';
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(from, contentStart));
    ranges.push(Decoration.mark({ class: cls }).range(contentStart, contentEnd));
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(contentEnd, to));
    occupied.push({ from, to });
  }

  const verbPattern = /\\verb(.)([^\\n]*?)\1/g;
  for (const match of text.matchAll(verbPattern)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (touched(from, to) || overlaps(from, to, occupied)) continue;
    const contentStart = from + 5;
    const contentEnd = contentStart + match[2].length;
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(from, contentStart));
    ranges.push(Decoration.mark({ class: 'cm-inline-code' }).range(contentStart, contentEnd));
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(contentEnd, to));
    occupied.push({ from, to });
  }

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const inlinePattern = /(?<!\\)(?<!\$)\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\$)/g;
    for (const match of line.text.matchAll(inlinePattern)) {
      if (match.index === undefined) continue;
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (touched(from, to) || overlaps(from, to, occupied)) continue;
      const tex = match[1].trim();
      if (!tex) continue;
      ranges.push(Decoration.replace({ widget: new InlineMathWidget(tex, from + 1) }).range(from, to));
      occupied.push({ from, to });
    }
    const parenPattern = /\\\(([\s\S]*?)\\\)/g;
    for (const match of line.text.matchAll(parenPattern)) {
      if (match.index === undefined) continue;
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (overlaps(from, to, occupied)) continue;
      ranges.push(Decoration.replace({ widget: new InlineMathWidget(match[1].trim(), from + 2) }).range(from, to));
      occupied.push({ from, to });
    }
  }

  return Decoration.set(ranges, true);
}

const setVisualDecorations = StateEffect.define<DecorationSet>();

export function visualLatex(config: VisualConfig): Extension {
  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, config.get());
    },
    update(value, transaction) {
      let next = value.map(transaction.changes);
      for (const effect of transaction.effects) {
        if (effect.is(setVisualDecorations)) next = effect.value;
      }
      return next;
    },
    provide: (candidate) => EditorView.decorations.from(candidate),
  });

  const renderer = ViewPlugin.fromClass(
    class {
      private frame = 0;

      constructor(private readonly view: EditorView) {}

      update(update: ViewUpdate) {
        if (!update.docChanged && !update.selectionSet) return;
        if (this.frame) return;
        this.frame = window.requestAnimationFrame(() => {
          this.frame = 0;
          if (!this.view.dom.isConnected) return;
          this.view.dispatch({
            effects: setVisualDecorations.of(buildDecorations(this.view.state, config.get())),
          });
        });
      }

      destroy() {
        if (this.frame) window.cancelAnimationFrame(this.frame);
      }
    },
  );

  return [
    field,
    renderer,
    EditorView.domEventHandlers({
      mousedown(event, view) {
        const target = event.target as HTMLElement | null;
        const rendered = target?.closest<HTMLElement>('[data-texpro-pos]');
        if (rendered && event.button === 0) {
          event.preventDefault();
          event.stopPropagation();
          const pos = Number(rendered.dataset.texproPos);
          if (Number.isFinite(pos)) {
            view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
            view.focus();
          }
          return true;
        }
        const link = target?.closest<HTMLElement>('.cm-link');
        if (link && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          const href = link.dataset.href;
          if (href) window.texpro.openExternal(href);
        }
        return false;
      },
    }),
  ];
}

class FocusPlugin {
  decorations: DecorationSet;
  private frame = 0;

  constructor(private readonly view: EditorView) {
    this.decorations = this.build();
  }

  private build(): DecorationSet {
    const state = this.view.state;
    const ranges: Range<Decoration>[] = [];
    const cursorLine = state.doc.lineAt(state.selection.main.head).number;
    let start = cursorLine;
    let end = cursorLine;
    while (start > 1 && state.doc.line(start - 1).text.trim() !== '') start--;
    while (end < state.doc.lines && state.doc.line(end + 1).text.trim() !== '') end++;
    for (let line = 1; line <= state.doc.lines; line++) {
      const info = state.doc.line(line);
      if (line >= start && line <= end) {
        ranges.push(Decoration.line({ class: 'cm-focus-active' }).range(info.from));
      } else {
        ranges.push(Decoration.line({ class: 'cm-focus-dim' }).range(info.from));
      }
    }
    return Decoration.set(ranges, true);
  }

  update(update: ViewUpdate) {
    if (!update.docChanged && !update.selectionSet && !update.viewportChanged) return;
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.view.dom.isConnected) return;
      this.decorations = this.build();
      this.view.requestMeasure();
    });
  }

  destroy() {
    if (this.frame) window.cancelAnimationFrame(this.frame);
  }
}

export function focusMode() {
  const plugin = ViewPlugin.fromClass(FocusPlugin, {
    decorations: (value) => value.decorations,
  });
  return plugin;
}

export function typewriterMode() {
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet || !update.view.hasFocus) return;
    const head = update.state.selection.main.head;
    window.setTimeout(() => {
      if (!update.view.hasFocus) return;
      update.view.dispatch({
        effects: EditorView.scrollIntoView(head, { y: 'center' }),
      });
    }, 20);
  });
}
