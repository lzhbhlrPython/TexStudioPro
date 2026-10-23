import { MusicWidget, musicSourceField, revealMusicSource } from './musicWidget';
import { findMusicBlocks } from '../lib/music';
import { diagramBlocks, skipTexSpace, texCommands, texDocumentStart, texEnvironments, texGroup, writingTable, type TexCommand } from '../lib/texDocument';
import { WritingTableWidget } from './tableWidget';
import { focusWriting, selectionTouches, writingComposition, tableWritingField, writeTableCell } from './writing';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import katex from 'katex';
import { assetUrl, dirname, joinPath, parseDocumentTitle } from '../lib/latex';
import { getLanguage, t } from '../i18n';
import { themeTexArtwork } from '../lib/texArtwork';
import { rasterizeTexPdf } from '../lib/texPdfArtwork';
import { reviewedRanges } from './writingReview';

export const refreshWritingPreview = StateEffect.define<null>();

export interface VisualContext {
  filePath: string;
  projectRoot: string;
  collapsePreamble: boolean;
  preamble?: string;
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
      throwOnError: true,
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
  focusWriting(view, pos);
}

abstract class LatexWidget extends WidgetType {
  readonly locale = getLanguage();
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
    return other.locale === this.locale && other.tex === this.tex;
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
    return other.locale === this.locale && other.tex === this.tex && other.label === this.label;
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
    readonly command: string,
    focusPos: number,
  ) {
    super(focusPos);
  }

  eq(other: SectionBadgeWidget) {
    return other.locale === this.locale && other.level === this.level && other.command === this.command;
  }

  toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.className = `cm-section-badge cm-section-badge-${this.level}`;
    const labels: Record<string, string> = { part: 'Part', chapter: 'Chapter', section: 'Section', subsection: 'Subsection', subsubsection: 'Subsubsection', paragraph: 'Paragraph' };
    span.textContent = t(labels[this.command] || 'Section');
    this.bind(span, view);
    return span;
  }
}

class BulletWidget extends LatexWidget {
  constructor(focusPos: number) {
    super(focusPos);
  }

  eq(other: BulletWidget) {
    return other.locale === this.locale;
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
    return other.locale === this.locale && other.src === this.src && other.block === this.block;
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
    return other.locale === this.locale && other.html === this.html && other.source === this.source;
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
    return other.locale === this.locale && other.code === this.code && other.language === this.language;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-code-widget';
    const head = document.createElement('div');
    head.className = 'cm-code-head';
    const dot = document.createElement('i');
    const label = document.createElement('span');
    label.textContent = this.language === 'code' || !this.language ? t('Code') : this.language;
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
    return other.locale === this.locale && other.documentClass === this.documentClass && other.packages === this.packages && other.lines === this.lines;
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
    return other.locale === this.locale && other.title === this.title && other.author === this.author && other.date === this.date;
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
    meta.textContent = [this.author, this.date === '\\today' ? t('Resolved at compile time') : this.date].filter(Boolean).join('  ·  ');
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
    return other.locale === this.locale && other.kind === this.kind && other.target === this.target;
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

  eq(other: TexLogoWidget) {
    return other.locale === this.locale;
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
  pdfPath?: string;
  error?: string;
  log?: string;
  engine?: string;
  cached?: boolean;
}

const tikzRequests = new Map<string, Promise<TikzResult>>();

function requestTikz(source: string, projectRoot: string, filePath: string, preamble?: string) {
  const key = JSON.stringify([projectRoot, filePath, preamble, source]);
  const cached = tikzRequests.get(key);
  if (cached) return cached;
  const request: Promise<TikzResult> = window.texpro
    .renderTikz({ projectRoot, filePath, source, preamble, preferPdf: true })
    .catch((error): TikzResult => ({ ok: false, error: String(error) }))
    .then(result => { if (!result.ok) tikzRequests.delete(key); return result; });
  if (tikzRequests.size >= 128) tikzRequests.delete(tikzRequests.keys().next().value!);
  tikzRequests.set(key, request);
  return request;
}

class TikzWidget extends LatexWidget {
  private timer?: ReturnType<typeof setTimeout>;
  private previewAbort?: AbortController;
  constructor(
    readonly source: string,
    readonly projectRoot: string,
    readonly filePath: string,
    focusPos: number,
    readonly kind = 'tikz',
    readonly inline = false,
    readonly previewOnly = false,
    readonly preamble?: string,
  ) {
    super(focusPos);
  }

  eq(other: TikzWidget) {
    return other.locale === this.locale && other.source === this.source && other.filePath === this.filePath && other.preamble === this.preamble && other.inline === this.inline && other.previewOnly === this.previewOnly && other.focusPos === this.focusPos;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement(this.inline ? 'span' : 'div');
    wrap.className = `cm-tikz-widget${this.inline ? ' cm-diagram-inline' : ''}${this.previewOnly ? ' cm-writing-preview' : ''}`;
    wrap.dataset.diagramKind = this.kind;

    const header = document.createElement('div');
    header.className = 'cm-tikz-header';
    const label = document.createElement('span');
    label.className = 'cm-tikz-label';
    label.textContent = this.kind === 'chemistry' ? t('Chemical structure') : this.kind === 'circuit' ? t('Circuit / logic') : 'TikZ';
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
      window.dispatchEvent(new CustomEvent('texpro:open-tikz', { detail: { source: this.source, from: this.focusPos - 1, to: this.focusPos - 1 + this.source.length, file: this.filePath } }));
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

    const abort = new AbortController(); this.previewAbort = abort;
    const showFailure = (result: TikzResult) => {
      if (abort.signal.aborted || !body.isConnected) return;
      const message = document.createElement('div');
      message.className = 'cm-tikz-error';
      message.textContent = result.error || t('TikZ rendering failed');
      body.replaceChildren(message);
      status.textContent = t('Render error'); status.classList.add('failed');
      if (result.log) {
        const details = document.createElement('details'); details.className = 'cm-tikz-log';
        const summary = document.createElement('summary'); summary.textContent = t('Show log');
        const pre = document.createElement('pre'); pre.textContent = result.log.slice(-3000);
        details.append(summary, pre); wrap.appendChild(details);
      }
      view.requestMeasure();
    };
    this.timer = setTimeout(() => { void requestTikz(this.source, this.projectRoot, this.filePath, this.preamble).then(async (result) => {
      if (abort.signal.aborted || !body.isConnected) return;
      if (result.ok && (result.pdfPath || result.svgPath)) {
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        const frame = document.createElement('span'); frame.className = 'tex-artwork'; frame.dataset.artwork = 'document-color';
        if (result.pdfPath) {
          const style = getComputedStyle(view.contentDOM);
          const writingWidth = view.contentDOM.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          const rendered = await rasterizeTexPdf(result.pdfPath, { width: Math.min(this.inline ? 360 : Infinity, writingWidth || 650), height: this.inline ? 150 : this.previewOnly ? 250 : 340 }, abort.signal);
          if (abort.signal.aborted || !body.isConnected) return;
          img.style.width = `${rendered.width}px`;
          img.src = rendered.src;
        } else img.src = assetUrl(result.svgPath!);
        img.addEventListener('load', () => { if (!abort.signal.aborted && body.isConnected) { themeTexArtwork(frame, img); view.requestMeasure(); } });
        img.alt = 'TikZ diagram';
        img.loading = 'lazy';
        img.addEventListener('error', () => showFailure({ ok: false, error: t('Could not load the rendered diagram.') }));
        frame.appendChild(img); body.replaceChildren(frame);
        status.textContent = result.cached ? t('Cached') : result.engine || t('Rendered');
        status.classList.add('ready');
      } else {
        showFailure(result);
      }
      view.requestMeasure();
    }).catch(error => showFailure({ ok: false, error: String(error) })); }, 600);

    return wrap;
  }

  ignoreEvent() {
    return false;
  }
  destroy() { clearTimeout(this.timer); this.previewAbort?.abort(); }
}

class ClearWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    return document.createElement('span');
  }
}

class MusicDataWidget extends WidgetType {
  readonly locale = getLanguage();
  eq(other: MusicDataWidget) { return other.locale === this.locale; }
  toDOM() {
    const dom = document.createElement('div'); dom.className = 'cm-music-data'; dom.textContent = t('Music data · preserved');
    return dom;
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
    return other.locale === this.locale && other.name === this.name && other.closing === this.closing;
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
    return other.locale === this.locale && other.label === this.label;
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

  eq(other: CaptionBadgeWidget) {
    return other.locale === this.locale;
  }

  toDOM(view: EditorView) {
    const element = document.createElement('span');
    element.className = 'cm-caption-badge';
    element.textContent = t('Caption');
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

function textArgument(text: string, command: TexCommand) {
  let at = command.to;
  if (text[at] === '*') at++;
  at = skipTexSpace(text, at);
  if (text[at] === '[') {
    const option = texGroup(text, at, '[', ']');
    if (!option) return null;
    at = skipTexSpace(text, option.to);
  }
  return texGroup(text, at);
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
  const revisions = state.field(reviewedRanges, false) || [];
  const touched = (from: number, to: number) => selectionTouches(state, { from, to }) || revisions.some(hunk => hunk.from <= to && hunk.to >= from);

  const addBlock = (from: number, to: number, widget: WidgetType) => {
    ranges.push(Decoration.replace({ widget, block: true }).range(from, to));
    occupied.push({ from, to });
  };

  for (const block of findMusicBlocks(text)) {
    // Reserve the entire block before math/TikZ scanners see generated TeX or metadata.
    if (state.field(musicSourceField, false) === block.id || touched(block.from, block.to)) {
      occupied.push({ from: block.from, to: block.to });
      ranges.push(Decoration.widget({ widget: new MusicWidget(block, context.projectRoot, true), block: true, side: 1 }).range(block.to));
      const metadata = /^% texpro-music-data:.*$/m.exec(block.source);
      if (metadata) {
        const from = block.from + metadata.index, to = from + metadata[0].length;
        if (!touched(from, to)) ranges.push(Decoration.replace({ widget: new MusicDataWidget(), block: true }).range(from, to));
      }
    }
    else addBlock(block.from, block.to, new MusicWidget(block, context.projectRoot));
  }

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
      if (!tex || !renderMath(tex, false)) continue;
      if (pattern.environment) {
        const environment = match[1];
        const wrapper = /^(align|eqnarray)/.test(environment) ? 'aligned' : 'gathered';
        tex = `\\begin{${wrapper}}${tex}\\end{${wrapper}}`;
      }
      const label = match[0].match(/\\label\{([^}]+)\}/)?.[1] ?? null;
      if (renderMath(tex, true)) addBlock(startLine.from, endLine.to, new DisplayMathWidget(tex, label, startLine.from + 1));
    }
  }

  for (const block of texEnvironments(text, ['tabular', 'tabularx', 'longtable'])) {
    const { from, to } = block;
    if (overlaps(from, to, occupied)) continue;
    const parsed = writingTable(text, block);
    const active = state.field(tableWritingField, false);
    if (touched(from, to) && (!parsed || active?.from !== from || revisions.some(hunk => hunk.from <= to && hunk.to >= from))) continue;
    const startLine = state.doc.lineAt(from), endLine = state.doc.lineAt(to);
    if (startLine.text.slice(0, from - startLine.from).trim() || endLine.text.slice(to - endLine.from).trim()) continue;
    if (parsed) addBlock(startLine.from, endLine.to, new WritingTableWidget(parsed));
    else {
      // Complex tables remain losslessly editable as TeX; no simplified model writes them back.
      const source = text.slice(from, to), spec = source.match(/\\begin\{[^}]+\}(?:\[[^\]]*\])?\{([^}]*)\}/);
      const html = spec && parseTabular(source.slice(spec[0].length, source.lastIndexOf('\\end')), spec[1]);
      if (html) addBlock(startLine.from, endLine.to, new TableWidget(html, from + 1, (html.match(/<tr>/g) || []).length, source));
    }
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

  for (const block of diagramBlocks(text)) {
    const { from, to } = block;
    if (overlaps(from, to, occupied)) continue;
    const startLine = state.doc.lineAt(from), endLine = state.doc.lineAt(to);
    const active = touched(from, to), inline = !!startLine.text.slice(0, from - startLine.from).trim() || !!endLine.text.slice(to - endLine.from).trim();
    const widget = new TikzWidget(block.source, context.projectRoot, context.filePath, from + 1, block.kind, inline, active, context.preamble);
    if (active) {
      occupied.push({ from, to });
      if (!inline) ranges.push(Decoration.widget({ widget, block: true, side: 1 }).range(to));
      continue;
    }
    if (!startLine.text.slice(0, from - startLine.from).trim() && !endLine.text.slice(to - endLine.from).trim()) addBlock(startLine.from, endLine.to, widget);
    else {
      ranges.push(Decoration.replace({ widget }).range(from, to));
      occupied.push({ from, to });
    }
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

  const bodyStart = texDocumentStart(text)?.to ?? 0;
  const inlineCommands = [...texCommands(text)].filter(c => c.from >= bodyStart);
  const headingLevels: Record<string, number> = { part: 1, chapter: 1, section: 1, subsection: 2, subsubsection: 3, paragraph: 4 };
  for (const command of inlineCommands) {
    const level = headingLevels[command.name];
    if (!level) continue;
    const group = textArgument(text, command);
    if (!group || touched(command.from, group.to) || overlaps(command.from, group.to, occupied)) continue;
    const line = state.doc.lineAt(command.from);
    if (text.slice(line.from, command.from).trim()) continue;
    for (let n = line.number; n <= state.doc.lineAt(group.to).number; n++) ranges.push(Decoration.line({ class: `cm-heading-line cm-heading-${level}` }).range(state.doc.line(n).from));
    ranges.push(Decoration.replace({ widget: new SectionBadgeWidget(level, command.name, command.from + 1) }).range(command.from, group.from + 1));
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(group.to - 1, group.to));
    occupied.push({ from: command.from, to: group.from + 1 }, { from: group.to - 1, to: group.to });
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

  for (const command of inlineCommands) {
    if (command.name !== 'caption') continue;
    const group = textArgument(text, command);
    if (!group || touched(command.from, group.to) || overlaps(command.from, group.to, occupied)) continue;
    ranges.push(Decoration.line({ class: 'cm-caption-line' }).range(state.doc.lineAt(command.from).from));
    ranges.push(Decoration.replace({ widget: new CaptionBadgeWidget(command.from + 1) }).range(command.from, group.from + 1));
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(group.to - 1, group.to));
    occupied.push({ from: command.from, to: group.from + 1 }, { from: group.to - 1, to: group.to });
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

  const formats: Record<string, string> = { textbf: 'cm-bold', texttt: 'cm-inline-code', underline: 'cm-underline', textsc: 'cm-smallcaps', textit: 'cm-italic', emph: 'cm-italic', textsl: 'cm-italic' };
  for (const command of inlineCommands) {
    const cls = formats[command.name];
    if (!cls && command.name !== 'href') continue;
    const first = textArgument(text, command);
    const group = command.name === 'href' && first ? texGroup(text, skipTexSpace(text, first.to)) : first;
    if (!group || group.to <= group.from + 2 || touched(command.from, group.to) || overlaps(command.from, group.to, occupied)) continue;
    const contentStart = group.from + 1, contentEnd = group.to - 1;
    const mark = cls ? { class: cls } : { class: 'cm-link', attributes: { 'data-href': text.slice(first!.from + 1, first!.to - 1), title: text.slice(first!.from + 1, first!.to - 1) } };
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(command.from, contentStart));
    ranges.push(Decoration.mark(mark).range(contentStart, contentEnd));
    ranges.push(Decoration.replace({ widget: new ClearWidget() }).range(contentEnd, group.to));
    // Only syntax occupies source; nested formatting and math still render inside its body.
    occupied.push({ from: command.from, to: contentStart }, { from: contentEnd, to: group.to });
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
      if (!tex || !renderMath(tex, false)) continue;
      ranges.push(Decoration.replace({ widget: new InlineMathWidget(tex, from + 1) }).range(from, to));
      occupied.push({ from, to });
    }
    const parenPattern = /\\\(([\s\S]*?)\\\)/g;
    for (const match of line.text.matchAll(parenPattern)) {
      if (match.index === undefined) continue;
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (touched(from, to) || overlaps(from, to, occupied)) continue;
      if (!renderMath(match[1].trim(), false)) continue;
      ranges.push(Decoration.replace({ widget: new InlineMathWidget(match[1].trim(), from + 2) }).range(from, to));
      occupied.push({ from, to });
    }
  }

  return Decoration.set(ranges, true);
}

export function visualLatex(config: VisualConfig): Extension {
  const field = StateField.define<DecorationSet>({
    create(state) { return buildDecorations(state, config.get()); },
    update(value, tr) {
      if (tr.state.field(writingComposition)) return value.map(tr.changes);
      if (tr.docChanged || tr.selection || tr.effects.length) return buildDecorations(tr.state, config.get());
      return value;
    },
    provide: candidate => EditorView.decorations.from(candidate),
  });
  return [
    musicSourceField,
    tableWritingField,
    field,
    EditorView.domEventHandlers({
      mousedown(event, view) {
        const target = event.target as HTMLElement | null;
        const rendered = target?.closest<HTMLElement>('[data-texpro-pos]');
        if (rendered && event.button === 0) {
          event.preventDefault();
          event.stopPropagation();
          const pos = Number(rendered.dataset.texproPos);
          if (Number.isFinite(pos)) {
            focusWriting(view, pos);
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
