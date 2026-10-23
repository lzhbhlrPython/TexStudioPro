import { EditorView, WidgetType, runScopeHandlers } from '@codemirror/view';
import { Transaction } from '@codemirror/state';
import { isolateHistory, redo, undo } from '@codemirror/commands';
import { appendWritingRow, texEnvironments, writingTable, type WritingTable } from '../lib/texDocument';
import { t } from '../i18n';
import { renderInlineTex } from '../lib/texInline';
import { continueWriting, focusWriting, tableWritingField, writeTableCell } from './writing';

interface Binding { table: WritingTable; view: EditorView; composing: boolean }
const bindings = new WeakMap<HTMLElement, Binding>();
const cellAt = (dom: HTMLElement, row: number, col: number) => dom.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);

function caretOffset(cell: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection?.focusNode || !cell.contains(selection.focusNode)) return 0;
  const range = document.createRange(); range.selectNodeContents(cell);
  range.setEnd(selection.focusNode, selection.focusOffset);
  return range.toString().length;
}

function placeCaret(cell: HTMLElement, offset: number) {
  cell.focus();
  if (cell.dataset.reading === 'true') {
    const dom = cell.closest<HTMLElement>('.cm-writing-table'), table = dom && bindings.get(dom)?.table;
    const source = table?.rows[Number(cell.dataset.row)]?.[Number(cell.dataset.col)];
    if (source) showCell(cell, source.text, true);
  }
  const node = cell.firstChild || cell.appendChild(document.createTextNode(''));
  const range = document.createRange(); range.setStart(node, Math.min(offset, node.textContent?.length || 0)); range.collapse(true);
  window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
}

function literalSeparators(text: string): string {
  let output = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { output += text[i] + (text[++i] || ''); continue; }
    output += text[i] === '&' || text[i] === '%' ? '\\' + text[i] : text[i] === '\n' ? ' ' : text[i];
  }
  return output;
}

const inputText = (source: string) => source.replace(/\\([&%])/g, '$1');
function showCell(cell: HTMLElement, source: string, editing: boolean) {
  if (editing) {
    const value = inputText(source);
    if (cell.dataset.reading === 'true' || cell.textContent !== value) cell.textContent = value;
    cell.dataset.reading = 'false';
  } else if (cell.dataset.source !== source || cell.dataset.reading !== 'true') {
    cell.innerHTML = renderInlineTex(source); cell.dataset.reading = 'true'; cell.dataset.source = source;
  }
}

export function enterWritingTable(view: EditorView, pos: number) {
  const text = view.state.doc.toString();
  const block = texEnvironments(text, ['tabular', 'tabularx', 'longtable']).find(b => pos >= b.from && pos <= b.to);
  const table = block && writingTable(text, block);
  if (!table) return;
  const row = Math.max(0, table.rows.findIndex(r => r.some(c => pos >= c.from && pos <= c.to))), col = Math.max(0, table.rows[row].findIndex(c => pos >= c.from && pos <= c.to));
  view.dispatch({ selection: { anchor: table.rows[row][col].from }, effects: writeTableCell.of({ from: table.from, to: table.to, row, col }) });
  queueMicrotask(() => {
    for (const dom of view.dom.querySelectorAll<HTMLElement>('.cm-writing-table')) {
      if (bindings.get(dom)?.table.from === table.from) { const cell = cellAt(dom, row, col); if (cell) placeCaret(cell, 0); }
    }
  });
}

export class WritingTableWidget extends WidgetType {
  constructor(readonly table: WritingTable) { super(); }
  eq(other: WritingTableWidget) { return this.table === other.table; }

  toDOM(view: EditorView) {
    const dom = document.createElement('div'); dom.className = 'cm-table-widget cm-writing-table';
    bindings.set(dom, { table: this.table, view, composing: false });
    const inner = document.createElement('div'); inner.className = 'cm-table-widget-inner';
    inner.appendChild(document.createElement('table')); dom.appendChild(inner);
    const tools = document.createElement('div'); tools.className = 'cm-writing-tools';
    const source = document.createElement('button'); source.type = 'button'; source.textContent = t('Edit TeX source');
    source.addEventListener('mousedown', e => e.preventDefault());
    source.addEventListener('click', () => {
      const { table, view } = bindings.get(dom)!;
      view.dispatch({ effects: writeTableCell.of(null) }); focusWriting(view, table.rows[0][0].from);
    });
    tools.appendChild(source); dom.appendChild(tools);
    const tool = (label: string, action: (binding: Binding, row: number, col: number) => void) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = t(label);
      button.dataset.tableAction = label.toLowerCase().replaceAll(' ', '-');
      button.addEventListener('mousedown', e => e.preventDefault());
      button.addEventListener('click', () => {
        const binding = bindings.get(dom)!, active = binding.view.state.field(tableWritingField, false);
        if (active?.from === binding.table.from) action(binding, active.row, active.col);
      });
      tools.appendChild(button);
      return button;
    };
    for (const [label, align] of [['Left', 'l'], ['Center', 'c'], ['Right', 'r']]) {
      const button = tool(label, ({ table, view }, _row, col) => {
      const range = table.columns[col];
      // Width-bearing columns keep their original specification; use source for advanced formatting.
      if (range.to - range.from !== 1) return;
      view.dispatch({ changes: { ...range, insert: align }, annotations: Transaction.userEvent.of('input.table'), effects: view.scrollSnapshot() });
      });
      button.dataset.alignment = align;
    }
    tool('Add row', ({ table, view }) => view.dispatch({ changes: appendWritingRow(table), annotations: [Transaction.userEvent.of('input.table'), isolateHistory.of('full')], effects: view.scrollSnapshot() }));
    tool('Add column', ({ table, view }) => {
      if (table.aligns.length >= 24) return;
      view.dispatch({ changes: [
        { from: table.columns.at(-1)!.to, insert: 'l' },
        ...table.rows.map(row => ({ from: row.at(-1)!.to, insert: ' & ' })),
      ], annotations: [Transaction.userEvent.of('input.table'), isolateHistory.of('full')], effects: view.scrollSnapshot() });
    });
    tool('Remove row', ({ table, view }, row) => {
      if (table.rows.length <= 1) return;
      view.dispatch({ changes: { from: table.rows[row][0].from, to: table.rowEnds[row] }, effects: view.scrollSnapshot(), annotations: [Transaction.userEvent.of('input.table'), isolateHistory.of('full')] });
      queueMicrotask(() => { const target = cellAt(dom, Math.max(0, row - 1), 0); if (target?.isConnected) placeCaret(target, 0); });
    });
    tool('Remove column', ({ table, view }, _row, col) => {
      if (table.aligns.length <= 1) return;
      view.dispatch({ changes: [
        { ...table.columns[col], insert: '' },
        ...table.rows.map(row => col ? { from: row[col - 1].to, to: row[col].to } : { from: row[0].from, to: row[1].from }),
      ], effects: view.scrollSnapshot(), annotations: [Transaction.userEvent.of('input.table'), isolateHistory.of('full')] });
    });
    dom.addEventListener('focusin', event => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-row]');
      if (!cell) return;
      const { table, view } = bindings.get(dom)!, row = Number(cell.dataset.row), col = Number(cell.dataset.col);
      const range = table.rows[row]?.[col];
      if (range) {
        showCell(cell, range.text, true);
        view.dispatch({ selection: { anchor: range.from + Math.min(literalSeparators((cell.textContent || '').slice(0, caretOffset(cell))).length, range.text.length) }, effects: writeTableCell.of({ from: table.from, to: table.to, row, col }), annotations: isolateHistory.of('before') });
      }
    });
    dom.addEventListener('mousedown', event => {
      const target = event.target as HTMLElement, cell = target.closest<HTMLElement>('[data-row]');
      if (!cell || cell.dataset.reading !== 'true' || event.button !== 0) return;
      const source = bindings.get(dom)!.table.rows[Number(cell.dataset.row)]?.[Number(cell.dataset.col)]?.text;
      if (source === undefined) return;
      // Enter the exact nested fragment when clicked; the cell remains ordinary document source.
      const nested = target.closest<HTMLElement>('[data-tex-offset]');
      if (nested || /[\\$]/.test(source)) {
        event.preventDefault(); event.stopPropagation();
        const offset = nested ? Number(nested.dataset.texOffset) : source.length;
        cell.focus(); placeCaret(cell, inputText(source.slice(0, offset)).length);
      }
    });
    dom.addEventListener('focusout', () => queueMicrotask(() => {
      const { table } = bindings.get(dom)!;
      table.rows.forEach((row, r) => row.forEach((source, c) => { const cell = cellAt(dom, r, c); if (cell && document.activeElement !== cell) showCell(cell, source.text, false); }));
    }));
    dom.addEventListener('compositionstart', () => { bindings.get(dom)!.composing = true; });
    dom.addEventListener('compositionend', e => {
      bindings.get(dom)!.composing = false;
      this.writeCell(dom, e.target as HTMLElement);
    });
    dom.addEventListener('input', e => {
      if (!bindings.get(dom)!.composing) this.writeCell(dom, e.target as HTMLElement);
    });
    dom.addEventListener('beforeinput', e => {
      const event = e as InputEvent;
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault(); (event.inputType === 'historyUndo' ? undo : redo)(bindings.get(dom)!.view);
      }
    });
    dom.addEventListener('keydown', e => this.keydown(dom, e));
    this.updateDOM(dom, view);
    return dom;
  }

  updateDOM(dom: HTMLElement, view: EditorView) {
    const binding = bindings.get(dom)!;
    binding.table = this.table; binding.view = view;
    if (binding.composing) return true;
    const table = dom.querySelector('table')!, current = view.state.field(tableWritingField, false), focused = dom.contains(document.activeElement);
    const shape = this.table.rows.map(r => r.length).join(',');
    const changedShape = table.dataset.shape !== shape;
    if (changedShape) {
      table.replaceChildren(); table.dataset.shape = shape;
      this.table.rows.forEach((row, r) => {
        const tr = document.createElement('tr');
        row.forEach((_, c) => {
          const td = document.createElement(r ? 'td' : 'th'), cell = document.createElement('span');
          cell.contentEditable = 'plaintext-only'; cell.spellcheck = false; cell.className = 'cm-table-cell';
          cell.tabIndex = 0;
          cell.dataset.row = String(r); cell.dataset.col = String(c); cell.setAttribute('role', 'textbox');
          cell.setAttribute('aria-label', t('Table cell {row}, {column}', { row: r + 1, column: c + 1 }));
          td.style.textAlign = this.table.aligns[c] === 'r' ? 'right' : this.table.aligns[c] === 'c' ? 'center' : 'left';
          td.appendChild(cell); tr.appendChild(td);
        });
        table.appendChild(tr);
      });
    }
    this.table.rows.forEach((row, r) => row.forEach((source, c) => {
      const cell = cellAt(dom, r, c)!;
      cell.parentElement!.style.textAlign = this.table.aligns[c] === 'r' ? 'right' : this.table.aligns[c] === 'c' ? 'center' : 'left';
      const editing = document.activeElement === cell;
      const changed = cell.dataset.reading === 'true' || cell.textContent !== inputText(source.text);
      showCell(cell, source.text, editing);
      if (editing && changed && current?.from === this.table.from && current.row === r && current.col === c && focused && !changedShape) queueMicrotask(() => { if (cell.isConnected) placeCaret(cell, inputText(source.text.slice(0, Math.max(0, view.state.selection.main.head - source.from))).length); });
    }));
    if (changedShape && current?.from === this.table.from && focused) {
      const row = Math.min(current.row, this.table.rows.length - 1), col = Math.min(current.col, this.table.aligns.length - 1);
      queueMicrotask(() => { const cell = cellAt(dom, row, col); if (cell?.isConnected) placeCaret(cell, 0); });
    }
    dom.classList.toggle('has-writing-cell', current?.from === this.table.from);
    dom.querySelectorAll<HTMLButtonElement>('[data-alignment]').forEach(button => {
      const column = current && this.table.columns[current.col];
      button.disabled = !column || column.to - column.from !== 1;
    });
    for (const [action, disabled] of [['add-row', this.table.rows.length >= 200], ['add-column', this.table.aligns.length >= 24], ['remove-row', this.table.rows.length <= 1], ['remove-column', this.table.aligns.length <= 1]] as const) {
      const button = dom.querySelector<HTMLButtonElement>(`[data-table-action="${action}"]`);
      if (button) button.disabled = disabled;
    }
    return true;
  }

  private writeCell(dom: HTMLElement, target: HTMLElement) {
    const cell = target.closest<HTMLElement>('[data-row]');
    if (!cell) return;
    const { table, view } = bindings.get(dom)!, row = Number(cell.dataset.row), col = Number(cell.dataset.col);
    const source = table.rows[row]?.[col];
    if (!source) return;
    const insert = literalSeparators(cell.textContent || '');
    if (insert === source.text) return;
    const offset = literalSeparators((cell.textContent || '').slice(0, caretOffset(cell))).length;
    view.dispatch({
      changes: { from: source.from, to: source.to, insert },
      selection: { anchor: source.from + offset },
      effects: [view.scrollSnapshot(), writeTableCell.of({ from: table.from, to: table.to + insert.length - (source.to - source.from), row, col })],
      annotations: Transaction.userEvent.of('input.table'),
    });
    if (!dom.isConnected) focusWriting(view, source.from + offset); // Unsupported/incomplete TeX stays editable in place.
  }

  private keydown(dom: HTMLElement, e: KeyboardEvent) {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    if (!cell || e.isComposing || bindings.get(dom)!.composing) return;
    const { table, view } = bindings.get(dom)!, row = Number(cell.dataset.row), col = Number(cell.dataset.col);
    const mod = e.metaKey || e.ctrlKey;
    if ((e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) || e.key === 'Home' || e.key === 'End') {
      e.preventDefault(); e.stopPropagation();
      const offset = e.key === 'ArrowRight' || e.key === 'End' ? (cell.textContent || '').length : 0;
      if (e.shiftKey && cell.firstChild) window.getSelection()?.extend(cell.firstChild, offset);
      else placeCaret(cell, offset);
      return;
    }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); (e.shiftKey ? redo : undo)(view); return; }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault(); e.stopPropagation();
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length }, effects: writeTableCell.of(null) }); view.focus(); return;
    }
    if (e.key === 'Escape' || e.key === 'Enter' && !mod || e.key === 'ArrowDown' && row === table.rows.length - 1 || e.key === 'ArrowUp' && row === 0) {
      e.preventDefault(); e.stopPropagation(); continueWriting(view, this.outerRange(view, table), e.key === 'ArrowUp' ? -1 : 1); return;
    }
    if (e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation();
      const width = table.aligns.length, next = row * width + col + (e.shiftKey ? -1 : 1);
      if (next < 0) { continueWriting(view, this.outerRange(view, table), -1); return; }
      if (next >= table.rows.length * width) {
        if (table.rows.length >= 200) { continueWriting(view, this.outerRange(view, table)); return; }
        view.dispatch({ changes: appendWritingRow(table), annotations: [Transaction.userEvent.of('input.table'), isolateHistory.of('full')], effects: view.scrollSnapshot() });
      }
      // Run after DOM reconciliation's focus restoration when the final Tab creates a row.
      queueMicrotask(() => { const target = cellAt(dom, Math.floor(next / width), next % width); if (target?.isConnected) placeCaret(target, 0); });
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const target = cellAt(dom, row + (e.key === 'ArrowDown' ? 1 : -1), col);
      if (target) { e.preventDefault(); e.stopPropagation(); placeCaret(target, caretOffset(cell)); }
      return;
    }
    // Native caret movement, deletion and clipboard operations belong to the live cell.
    if (mod && (e.key.toLowerCase() === 's' || e.key === 'Enter') && runScopeHandlers(view, e, 'editor')) { e.preventDefault(); e.stopPropagation(); }
  }

  private outerRange(view: EditorView, table: WritingTable) {
    return texEnvironments(view.state.doc.toString(), ['table', 'table*']).find(b => b.from < table.from && b.to > table.to) || table;
  }

  ignoreEvent() { return true; }
}
