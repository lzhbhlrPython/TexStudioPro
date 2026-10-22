import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compartment, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
  crosshairCursor,
  Decoration,
  type DecorationSet,
} from '@codemirror/view';
import { cursorLineDown, cursorLineUp, defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory, redo, selectLineDown, selectLineUp, undo } from '@codemirror/commands';
import { moveWritingContent } from '../lib/writingStructure';
import { writingReview, reviewWriting } from './writingReview';
import { WritingReviewBar } from '../components/WritingReviewBar';
import { writingFeedback, writingDiagnostics } from './writingFeedback';
import { writingPosition, restoreWritingPosition, type WritingPosition, type WritingSessions } from './writingSession';
import { toggleWritingNote, type WritingNote } from '../lib/writingNotes';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { Bold, Code2, Italic, Link2, Quote, Sigma } from 'lucide-react';
import {
  autocompletion,
  acceptCompletion,
  closeBrackets,
  completionStatus,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from '@codemirror/language';
import { linter, lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint';
import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { latexLanguage } from './latexLanguage';
import { makeLatexCompletionSource } from './completions';
import { editorHighlighting, editorTheme } from './theme';
import { writingReferenceHover } from './referenceSupport';
import { completionAppearance, completionTheme } from './completionAppearance';
import { composingWriting, leaveWritingBlock, stableWritingInput } from './writing';
import { enterWritingTable } from './tableWidget';
import { applyWriting, rememberWriting, restoreWriting, writingTargets, type WritingTarget } from './writingTargets';
import { ensureTexPackages, texDocumentStart } from '../lib/texDocument';
import { focusMode, typewriterMode, visualLatex, refreshWritingPreview, type VisualContext } from './visual';
import type { CursorInfo, Diagnostic, ProjectSymbols, Settings, SourceJump } from '../types';
import { dirname } from '../lib/latex';
import { findSpellingIssues } from '../lib/spellcheck';
import { smartPaste } from '../lib/pasteCleaner';

export interface EditorHandle {
  leaveNote: () => void;
  toggleNote: (note: WritingNote) => boolean;
  moveContent: (direction: -1 | 1) => boolean;
  toggleReview: () => void;
  getPosition: () => WritingPosition | null;
  restorePosition: (point: WritingPosition) => void;
  getPath: () => string;
  getContent: () => string;
  gotoLine: (line: number, column?: number) => void;
  insert: (template: string) => void;
  insertLiteral: (text: string, range?: { from: number; to: number }) => void;
  getSelectionRange: () => { from: number; to: number };
  captureWriting: (range?: { from: number; to: number }) => WritingTarget | null;
  applyWriting: (target: WritingTarget, text: string, cursor?: number) => boolean;
  restoreWriting: (target: WritingTarget) => void;
  ensurePackages: (packages: string[]) => void;
  wrapSelection: (before: string, after: string) => void;
  getSelection: () => string;
  focus: () => void;
  undo: () => void;
  redo: () => void;
  scrollToBottom: () => void;
  ensurePackage: (name: string) => void;
  applyLayout: (options: { documentClassOptions: string; preambleBlock: string }) => void;
  insertBeforeEndDocument: (text: string) => void;
  replaceRange: (from: number, to: number, text: string) => void;
  replaceAll: (text: string) => void;
  replaceSelection: (text: string) => void;
  applyBibliography: (options: { mode: 'bibtex' | 'biblatex'; bibPath: string; style: string }) => void;
  applyModules: (files: string[]) => void;
  applyToc: (options: { enabled: boolean; depth: number; numbered: boolean }) => void;
}

interface Props {
  path: string;
  value: string;
  savedContent: string;
  sessions: WritingSessions;
  diagnosticsStale: boolean;
  root: string;
  mainText?: string;
  settings: Settings;
  symbols: ProjectSymbols;
  diagnostics: Diagnostic[];
  onChange: (value: string) => void;
  onCursor: (cursor: CursorInfo) => void;
  onSave: () => void;
  onCompile: () => void;
  onPalette: () => void;
  onForwardSync: () => void;
  onPasteImage?: (file: File) => void;
  onDropFiles?: (files: File[]) => void;
  spellWords?: Set<string>;
  gotoRequest?: SourceJump | null;
  collabExtension?: Extension | null;
}

function insertText(view: EditorView, template: string) {
  const marker = template.indexOf('|');
  const text = marker >= 0 ? template.slice(0, marker) + template.slice(marker + 1) : template;
  const selection = view.state.selection.main;
  const anchor = selection.from + (marker >= 0 ? marker : text.length);
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: text },
    selection: { anchor },
    scrollIntoView: true,
  });
  view.focus();
}

function wrapText(view: EditorView, before: string, after: string) {
  const selection = view.state.selection.main;
  if (selection.empty) {
    const text = before + after;
    view.dispatch({
      changes: { from: selection.from, insert: text },
      selection: { anchor: selection.from + before.length },
      scrollIntoView: true,
    });
  } else {
    const selected = view.state.sliceDoc(selection.from, selection.to);
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: before + selected + after },
      selection: { anchor: selection.from + before.length, head: selection.from + before.length + selected.length },
      scrollIntoView: true,
    });
  }
  view.focus();
}

function moveContent(view: EditorView, direction: -1 | 1) {
  if (view.composing) return false;
  const change = moveWritingContent(view.state.doc.toString(), view.state.selection.main.head, direction);
  if (!change) return false;
  view.dispatch({ changes: { from: change.from, to: change.to, insert: change.insert }, selection: { anchor: change.anchor }, annotations: isolateHistory.of('full'), scrollIntoView: true });
  view.focus(); return true;
}

function moveLogicalLine(view: EditorView, direction: 1 | -1, select: boolean): boolean {
  if (view.composing) return false;
  const status = completionStatus(view.state);
  if (status === 'active' || status === 'pending') return false;
  const before = view.state.selection.main;
  const beforeLine = view.state.doc.lineAt(before.head);
  const command = select
    ? direction > 0 ? selectLineDown : selectLineUp
    : direction > 0 ? cursorLineDown : cursorLineUp;
  if (!command(view)) return false;
  const after = view.state.selection.main;
  const afterLine = view.state.doc.lineAt(after.head);
  const skipped = Math.abs(afterLine.number - beforeLine.number) > 1;
  if (!skipped) return true;
  const targetNumber = Math.max(1, Math.min(view.state.doc.lines, beforeLine.number + direction));
  const target = view.state.doc.line(targetNumber);
  const column = before.head - beforeLine.from;
  const head = Math.min(target.to, target.from + Math.min(column, target.length));
  view.dispatch({
    selection: select ? { anchor: before.anchor, head } : { anchor: head },
    scrollIntoView: true,
  });
  return true;
}

const flashEffect = StateEffect.define<number>();

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(flashEffect)) continue;
      if (effect.value < 1) {
        next = Decoration.none;
      } else {
        const line = transaction.state.doc.line(
          Math.max(1, Math.min(transaction.state.doc.lines, effect.value)),
        );
        next = Decoration.set([Decoration.line({ class: 'cm-flash-line' }).range(line.from)]);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const EditorPane = forwardRef<EditorHandle, Props>(function EditorPane(props, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const mainPreamble = props.mainText?.slice(0, texDocumentStart(props.mainText)?.to ?? props.mainText.length);
  const visualRef = useRef<VisualContext>({
    filePath: props.path,
    projectRoot: props.root,
    collapsePreamble: props.settings.collapsePreamble,
    preamble: mainPreamble,
  });
  visualRef.current = {
    filePath: props.path,
    projectRoot: props.root,
    collapsePreamble: props.settings.collapsePreamble,
    preamble: mainPreamble,
  };
  const symbolsRef = useRef({
    symbols: props.symbols,
    filePath: props.path,
    root: props.root,
  });
  symbolsRef.current = {
    symbols: props.symbols,
    filePath: props.path,
    root: props.root,
  };
  const spellWordsRef = useRef(props.spellWords || new Set<string>());
  spellWordsRef.current = props.spellWords || new Set<string>();

  const compartments = useRef({
    visual: new Compartment(),
    focus: new Compartment(),
    typewriter: new Compartment(),
    lineNumbers: new Compartment(),
    collab: new Compartment(),
  }).current;
  const completionSource = useRef(makeLatexCompletionSource(() => symbolsRef.current)).current;
  const lastCursorEmit = useRef(0);
  const [selectionBubble, setSelectionBubble] = useState<{ from: number; to: number; left: number; top: number } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const bubbleFrame = useRef(0);
  const scheduleBubble = (view: EditorView) => {
    if (bubbleFrame.current) cancelAnimationFrame(bubbleFrame.current);
    bubbleFrame.current = requestAnimationFrame(() => {
      bubbleFrame.current = 0;
      const selection = view.state.selection.main;
      if (selection.empty || !view.hasFocus) {
        setSelectionBubble(null);
        return;
      }
      const start = view.coordsAtPos(selection.from);
      const end = view.coordsAtPos(selection.to);
      if (!start || !end) {
        setSelectionBubble(null);
        return;
      }
      setSelectionBubble({
        from: selection.from,
        to: selection.to,
        left: Math.max(12, Math.min(window.innerWidth - 286, (start.left + end.right) / 2 - 132)),
        top: Math.max(10, start.top - 40),
      });
    });
  };
  const [state] = useState(() => {
    const extensions: Extension[] = [
        compartments.lineNumbers.of(props.settings.showLineNumbers ? lineNumbers() : []),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        writingTargets,
        stableWritingInput,
        writingReview,
        writingFeedback,
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        autocompletion({
          ...completionAppearance,
          override: [completionSource],
          activateOnTyping: true,
          maxRenderedOptions: 80,
          defaultKeymap: false,
        }),
        completionTheme,
        foldGutter({ openText: '⌄', closedText: '›' }),
        highlightSelectionMatches(),
        keymap.of([
          ...completionKeymap,
          { key: 'Tab', run: view => !view.composing && acceptCompletion(view) },
          { key: 'Escape', run: leaveWritingBlock },
          { key: 'Alt-Enter', run: leaveWritingBlock },
          { key: 'Alt-Shift-ArrowUp', run: view => moveContent(view, -1) },
          { key: 'Alt-Shift-ArrowDown', run: view => moveContent(view, 1) },
          {
            key: 'ArrowDown',
            run: (view) => moveLogicalLine(view, 1, false),
          },
          {
            key: 'ArrowUp',
            run: (view) => moveLogicalLine(view, -1, false),
          },
          {
            key: 'Shift-ArrowDown',
            run: (view) => moveLogicalLine(view, 1, true),
          },
          {
            key: 'Shift-ArrowUp',
            run: (view) => moveLogicalLine(view, -1, true),
          },
          {
            key: 'Mod-Enter',
            run: () => {
              propsRef.current.onCompile();
              return true;
            },
          },
          {
            key: 'Mod-s',
            run: () => {
              propsRef.current.onSave();
              return true;
            },
          },
          {
            key: 'Mod-k',
            run: () => {
              propsRef.current.onPalette();
              return true;
            },
          },
          {
            key: 'Mod-b',
            run: (view) => {
              wrapText(view, '\\textbf{', '}');
              return true;
            },
          },
          {
            key: 'Mod-i',
            run: (view) => {
              wrapText(view, '\\textit{', '}');
              return true;
            },
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        latexLanguage(),
        editorHighlighting,
        editorTheme,
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        indentUnit.of('  '),
        EditorView.scrollMargins.of(() => ({ top: 80, bottom: 120 })),
        EditorView.contentAttributes.of({
          spellcheck: 'false',
          autocorrect: 'off',
          autocapitalize: 'off',
          'aria-label': 'LaTeX source editor',
        }),
        placeholder('Start writing, or open a .tex file from the project…'),
        lintGutter(),
        linter((view) => findSpellingIssues(view.state.doc.toString(), spellWordsRef.current).map((issue) => ({
          from: issue.from,
          to: issue.to,
          severity: 'info' as const,
          message: `Possible spelling: ${issue.word}`,
          source: 'spellcheck',
        })), { delay: 900 }),

        flashField,
        writingReferenceHover(() => symbolsRef.current.symbols, () => symbolsRef.current.filePath),
        compartments.collab.of(props.collabExtension || []),
        compartments.visual.of(
          props.settings.visual
            ? visualLatex({ get: () => visualRef.current })
            : [],
        ),
        compartments.focus.of(props.settings.focus ? focusMode() : []),
        compartments.typewriter.of(props.settings.typewriter ? typewriterMode() : []),
        EditorView.domEventHandlers({
          paste(event, view) {
            const items = event.clipboardData?.items;
            if (items && propsRef.current.onPasteImage) {
              for (const item of Array.from(items)) {
                if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
                const file = item.getAsFile();
                if (!file) continue;
                event.preventDefault();
                propsRef.current.onPasteImage(file);
                return true;
              }
            }
            if (!propsRef.current.settings.smartPaste || !event.clipboardData) return false;
            const raw = event.clipboardData.getData('text/plain');
            const html = event.clipboardData.getData('text/html');
            if (!raw && !html) return false;
            try {
              const cleaned = smartPaste(raw, html);
              if (!cleaned || cleaned === raw) return false;
              event.preventDefault();
              const selection = view.state.selection.main;
              view.dispatch({
                changes: { from: selection.from, to: selection.to, insert: cleaned },
                selection: { anchor: selection.from + cleaned.length },
                scrollIntoView: true,
              });
              return true;
            } catch {
              return false;
            }
          },
          dragover(event) {
            if (event.dataTransfer?.files?.length) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          drop(event, view) {
            const files = Array.from(event.dataTransfer?.files || []);
            if (!files.length || !propsRef.current.onDropFiles) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos !== null) view.dispatch({ selection: { anchor: pos } });
            propsRef.current.onDropFiles(files);
            return true;
          },
          mousedown(event) {
            if ((event.metaKey || event.ctrlKey) && event.button === 0) {
              event.preventDefault();
              propsRef.current.onForwardSync();
              return true;
            }
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            propsRef.current.onChange(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged || update.focusChanged) {
            scheduleBubble(update.view);
          }
          if (update.docChanged || update.selectionSet) {
            const now = performance.now();
            if (now - lastCursorEmit.current < 32) return;
            lastCursorEmit.current = now;
            const selection = update.state.selection.main;
            const line = update.state.doc.lineAt(selection.head);
            propsRef.current.onCursor({
              line: line.number,
              column: selection.head - line.from + 1,
              selected: Math.abs(selection.head - selection.from),
            });
          }
        }),
      ];
    const cached = props.sessions.get(props.path);
    return cached && cached.state.doc.toString() === props.value
      ? cached.state.update({ effects: [StateEffect.reconfigure.of(extensions), composingWriting.of(false)] }).state
      : EditorState.create({ doc: props.value, extensions });
  });

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    const cached = props.sessions.get(props.path);
    if (cached) view.requestMeasure({ read: () => null, write: () => { view.scrollDOM.scrollTop = cached.top; view.scrollDOM.scrollLeft = cached.left; } });
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head);
    propsRef.current.onCursor({
      line: line.number,
      column: selection.head - line.from + 1,
      selected: 0,
    });
    return () => {
      props.sessions.set(props.path, { state: view.state, top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft });
      view.destroy();
      viewRef.current = null;
    };
  }, [state]);

  useEffect(() => { viewRef.current?.dispatch({ effects: refreshWritingPreview.of(null) }); }, [mainPreamble]);
  useEffect(() => { if (!reviewing) viewRef.current?.dispatch({ effects: reviewWriting.of(null) }); }, [reviewing]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        compartments.visual.reconfigure(
          props.settings.visual
            ? visualLatex({ get: () => visualRef.current })
            : [],
        ),
        compartments.focus.reconfigure(props.settings.focus ? focusMode() : []),
        compartments.typewriter.reconfigure(
          props.settings.typewriter ? typewriterMode() : [],
        ),
        compartments.lineNumbers.reconfigure(
          props.settings.showLineNumbers ? lineNumbers() : [],
        ),
      ],
    });
  }, [
    compartments,
    props.settings.visual,
    props.settings.focus,
    props.settings.typewriter,
    props.settings.showLineNumbers,
    props.settings.collapsePreamble,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: compartments.collab.reconfigure(props.collabExtension || []) });
  }, [compartments, props.collabExtension]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (props.value === view.state.doc.toString()) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: props.value },
    });
  }, [props.value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !props.gotoRequest) return;
    if (props.gotoRequest.file && props.gotoRequest.file.replaceAll('\\', '/') !== props.path.replaceAll('\\', '/')) return;
    const lineNumber = Math.max(1, Math.min(view.state.doc.lines, props.gotoRequest.line));
    const info = view.state.doc.line(lineNumber);
    const column = Math.max(1, props.gotoRequest.column || 1);
    const pos = Math.min(info.to, info.from + column - 1);
    const end = view.state.doc.line(Math.max(lineNumber, Math.min(view.state.doc.lines, props.gotoRequest.endLine || lineNumber)));
    const selection = props.gotoRequest.select ? { anchor: info.from, head: end.to } : { anchor: pos };
    view.dispatch({
      selection,
      effects: [
        EditorView.scrollIntoView(pos, { y: 'center' }),
        ...(props.gotoRequest.flash ? [flashEffect.of(lineNumber)] : []),
      ],
    });
    view.focus();
    if (props.gotoRequest.flash) {
      const timer = window.setTimeout(() => { if (viewRef.current === view) view.dispatch({ effects: flashEffect.of(-1) }); }, 1600);
      return () => window.clearTimeout(timer);
    }
  }, [props.gotoRequest?.key, props.path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const file = props.path.replace(/\/\.\//g, '/');
    const diagnostics: CmDiagnostic[] = props.diagnostics
      .filter((diagnostic) => !diagnostic.file || diagnostic.file.replace(/\/\.\//g, '/') === file)
      .map((diagnostic) => {
        const lineNumber = Math.max(1, Math.min(view.state.doc.lines, diagnostic.line || 1));
        const line = view.state.doc.line(lineNumber);
        const column = Math.max(0, Math.min(line.length, (diagnostic.column || 1) - 1));
        return {
          from: line.from + column,
          to: Math.min(line.to, line.from + column + 1),
          severity: diagnostic.severity,
          message: diagnostic.message,
          source: diagnostic.source || 'latex',
        };
      });
    view.dispatch(setDiagnostics(view.state, diagnostics));
    view.dispatch({ effects: writingDiagnostics.of({ items: props.diagnostics.filter(item => !item.file || item.file.replaceAll('\\', '/') === file), stale: props.diagnosticsStale }) });
  }, [props.diagnostics, props.path, props.diagnosticsStale]);

  useImperativeHandle(
    ref,
    () => ({
      toggleReview() { setReviewing(current => !current); },
      getPosition() { const view = viewRef.current; return view ? writingPosition(view, props.path) : null; },
      restorePosition(point) { const view = viewRef.current; if (view && point.file === props.path) restoreWritingPosition(view, point); },
      leaveNote() {
        const view = viewRef.current; if (!view || view.composing) return;
        leaveWritingBlock(view);
        const at = view.state.doc.lineAt(view.state.selection.main.head).to;
        view.dispatch({ changes: { from: at, insert: '\n% TODO: \n' }, selection: { anchor: at + 9 }, annotations: isolateHistory.of('full'), scrollIntoView: true });
        view.focus();
      },
      toggleNote(note) {
        const view = viewRef.current; if (!view || note.file !== props.path || note.line > view.state.doc.lines) return false;
        const line = view.state.doc.line(note.line), next = toggleWritingNote(line.text, note);
        if (next === null) return false;
        view.dispatch({ changes: { from: line.from, to: line.to, insert: next }, annotations: isolateHistory.of('full'), effects: view.scrollSnapshot() });
        view.focus(); return true;
      },
      moveContent(direction) { const view = viewRef.current; return view ? moveContent(view, direction) : false; },
      getPath: () => props.path,
      gotoLine(line: number, column = 1) {
        const view = viewRef.current;
        if (!view) return;
        const lineNumber = Math.max(1, Math.min(view.state.doc.lines, line));
        const info = view.state.doc.line(lineNumber);
        const pos = Math.min(info.to, info.from + Math.max(0, column - 1));
        view.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: 'center' }),
        });
        view.focus();
      },
      getContent() { return viewRef.current?.state.doc.toString() || ''; },
      getSelectionRange() { const s = viewRef.current?.state.selection.main; return { from: s?.from || 0, to: s?.to || 0 }; },
      captureWriting(range) { const view = viewRef.current; return view ? rememberWriting(view, props.path, range) : null; },
      applyWriting(target, text, cursor) {
        const view = viewRef.current;
        if (!view || target.file !== props.path || !applyWriting(view, target, text, cursor)) return false;
        if (propsRef.current.settings.visual) enterWritingTable(view, view.state.selection.main.head);
        return true;
      },
      restoreWriting(target) { const view = viewRef.current; if (view && target.file === props.path) restoreWriting(view, target); },
      ensurePackages(packages) {
        const view = viewRef.current;
        if (!view) return;
        const before = view.state.doc.toString(), next = ensureTexPackages(before, packages);
        if (before === next) return;
        let from = 0;
        while (from < before.length && before[from] === next[from]) from++;
        view.dispatch({ changes: { from, insert: next.slice(from, from + next.length - before.length) }, effects: view.scrollSnapshot() });
      },
      insertLiteral(text, range) {
        const view = viewRef.current;
        if (!view) return;
        const s = range || view.state.selection.main;
        view.dispatch({ changes: { from: s.from, to: s.to, insert: text }, selection: { anchor: s.from + text.length }, scrollIntoView: true });
        view.focus();
      },
      insert(template: string) {
        const view = viewRef.current;
        if (view) insertText(view, template);
      },
      wrapSelection(before: string, after: string) {
        const view = viewRef.current;
        if (view) wrapText(view, before, after);
      },
      getSelection() {
        const view = viewRef.current;
        if (!view) return '';
        const selection = view.state.selection.main;
        return view.state.sliceDoc(selection.from, selection.to);
      },
      focus() {
        viewRef.current?.focus();
      },
      undo() {
        if (viewRef.current) undo(viewRef.current);
      },
      redo() {
        if (viewRef.current) redo(viewRef.current);
      },
      scrollToBottom() {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length, { y: 'end' }) });
      },
      ensurePackage(name: string) {
        const view = viewRef.current;
        if (!view) return;
        const text = view.state.doc.toString();
        const packagePattern = new RegExp('\\\\usepackage(?:\\[[^\\]]*\\])?\\{[^}]*\\b' + name + '\\b');
        if (packagePattern.test(text)) return;
        const marker = text.indexOf('\\begin{document}');
        if (marker < 0) return;
        view.dispatch({
          changes: { from: marker, insert: `\\usepackage{${name}}\n` },
        });
      },
      applyModules(files: string[]) {
        const view = viewRef.current;
        if (!view) return;
        let text = view.state.doc.toString();
        text = text.replace(/\n?% TeXPro modules begin[\s\S]*?% TeXPro modules end\n?/g, '\n');
        if (files.length > 0) {
          const block = `% TeXPro modules begin\n${files.map((file) => `\\input{${file}}`).join('\n')}\n% TeXPro modules end\n`;
          const marker = text.indexOf('\\end{document}');
          const position = marker >= 0 ? marker : text.length;
          text = text.slice(0, position) + block + text.slice(position);
        }
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      },
      applyToc(options) {
        const view = viewRef.current;
        if (!view) return;
        let text = view.state.doc.toString();
        text = text.replace(/\n?% TeXPro toc begin[\s\S]*?% TeXPro toc end\n?/g, '\n');
        if (options.enabled) {
          const marker = text.indexOf('\\begin{document}');
          if (marker >= 0) {
            const titleMarker = text.indexOf('\\maketitle', marker);
            const anchor = titleMarker >= 0 ? titleMarker : marker;
            const lineEnd = text.indexOf('\n', anchor);
            const position = lineEnd >= 0 ? lineEnd + 1 : anchor;
            const block = `% TeXPro toc begin\n\\setcounter{tocdepth}{${options.depth}}\n\\setcounter{secnumdepth}{${options.numbered ? options.depth : 0}}\n\\tableofcontents\n% TeXPro toc end\n`;
            text = text.slice(0, position) + block + text.slice(position);
          }
        }
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      },
      applyBibliography(options) {
        const view = viewRef.current;
        if (!view) return;
        let text = view.state.doc.toString();
        text = text.replace(/\n?% TeXPro bibliography begin[\s\S]*?% TeXPro bibliography end\n?/g, '\n');
        const begin = text.indexOf('\\begin{document}');
        const preambleEnd = begin >= 0 ? begin : text.length;
        if (options.mode === 'biblatex') {
          const packageLine = `\\usepackage[style=${options.style},backend=biber]{biblatex}`;
          const resource = `\\addbibresource{${options.bibPath}}`;
          if (/\\usepackage(?:\[[^\]]*\])?\{biblatex\}/.test(text)) {
            text = text.replace(/\\usepackage(?:\[[^\]]*\])?\{biblatex\}/, packageLine);
          } else {
            text = text.slice(0, preambleEnd) + packageLine + '\n' + text.slice(preambleEnd);
          }
          const newBegin = text.indexOf('\\begin{document}');
          const resourceEnd = newBegin >= 0 ? newBegin : text.length;
          if (!text.includes('\\addbibresource')) {
            text = text.slice(0, resourceEnd) + resource + '\n' + text.slice(resourceEnd);
          }
          const endMarker = text.indexOf('\\end{document}');
          const position = endMarker >= 0 ? endMarker : text.length;
          text = text.slice(0, position) + '% TeXPro bibliography begin\n\\printbibliography\n% TeXPro bibliography end\n' + text.slice(position);
        } else {
          const endMarker = text.indexOf('\\end{document}');
          const position = endMarker >= 0 ? endMarker : text.length;
          const clean = options.bibPath.replace(/\.bib$/i, '');
          const block = `% TeXPro bibliography begin\n\\bibliographystyle{${options.style}}\n\\bibliography{${clean}}\n% TeXPro bibliography end\n`;
          text = text.slice(0, position) + block + text.slice(position);
        }
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      },
      replaceSelection(text: string) {
        const view = viewRef.current;
        if (!view) return;
        const selection = view.state.selection.main;
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text },
          selection: { anchor: selection.from + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      replaceRange(from: number, to: number, text: string) {
        const view = viewRef.current;
        if (!view) return;
        const start = Math.max(0, Math.min(view.state.doc.length, from));
        const end = Math.max(start, Math.min(view.state.doc.length, to));
        view.dispatch({
          changes: { from: start, to: end, insert: text },
          selection: { anchor: start + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      replaceAll(text: string) {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      insertBeforeEndDocument(text: string) {
        const view = viewRef.current;
        if (!view) return;
        const doc = view.state.doc.toString();
        const marker = doc.indexOf('\\end{document}');
        const position = marker >= 0 ? marker : view.state.doc.length;
        const prefix = marker >= 0 ? '\n' : '\n\n';
        view.dispatch({
          changes: { from: position, insert: `${prefix}${text}\n` },
          selection: { anchor: position + prefix.length + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      applyLayout({ documentClassOptions, preambleBlock }) {
        const view = viewRef.current;
        if (!view) return;
        let text = view.state.doc.toString();
        text = text.replace(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/, (_match, className) => {
          return `\\documentclass[${documentClassOptions}]{${className}}`;
        });
        text = text.replace(/\n?% TeXPro layout begin[\s\S]*?% TeXPro layout end\n?/g, '\n');
        const managed = ['geometry', 'setspace', 'fancyhdr', 'ctex', 'luatexja', 'polyglossia', 'titling', 'microtype'];
        for (const pkg of managed) {
          const pattern = new RegExp('\\\\usepackage(?:\\[[^\\]]*\\])?\\{' + pkg + '\\}\\s*\\n?', 'g');
          text = text.replace(pattern, '');
        }
        const marker = text.indexOf('\\begin{document}');
        if (marker < 0) return;
        const block = `% TeXPro layout begin\n${preambleBlock}\n% TeXPro layout end\n`;
        text = text.slice(0, marker) + block + text.slice(marker);
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        });
      },
    }),
    [props.path],
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const hide = () => setSelectionBubble(null);
    view.scrollDOM.addEventListener('scroll', hide, { passive: true });
    return () => {
      view.scrollDOM.removeEventListener('scroll', hide);
      if (bubbleFrame.current) cancelAnimationFrame(bubbleFrame.current);
    };
  }, [state]);

  const applyBubble = (before: string, after: string) => {
    const view = viewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const selected = view.state.doc.sliceString(selection.from, selection.to);
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: before + selected + after },
      selection: { anchor: selection.from + before.length + selected.length },
    });
    setSelectionBubble(null);
    view.focus();
  };

  return (
    <>
      {reviewing && <WritingReviewBar root={props.root} file={props.path} saved={props.savedContent} onCompare={(source, label) => viewRef.current?.dispatch({ effects: reviewWriting.of({ source, label }) })} onClose={() => { setReviewing(false); viewRef.current?.dispatch({ effects: reviewWriting.of(null) }); viewRef.current?.focus(); }} />}
      <div className="editor-host" ref={hostRef} data-file={props.path} />
      {selectionBubble && createPortal(
        <div
          className="selection-bubble"
          style={{ left: selectionBubble.left, top: selectionBubble.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button onClick={() => applyBubble('\\textbf{', '}')} title="Bold"><Bold size={12} /></button>
          <button onClick={() => applyBubble('\\textit{', '}')} title="Italic"><Italic size={12} /></button>
          <button onClick={() => applyBubble('\\texttt{', '}')} title="Code"><Code2 size={12} /></button>
          <span />
          <button onClick={() => applyBubble('$', '$')} title="Inline math"><Sigma size={12} /></button>
          <button onClick={() => applyBubble('\\cite{', '}')} title="Citation"><Quote size={12} /></button>
          <button onClick={() => applyBubble('\\ref{', '}')} title="Reference"><Link2 size={12} /></button>
        </div>,
        document.body,
      )}
    </>
  );
});
