'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/lib/texDocument.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const d = context.exports;

test('diagram ranges balance nested chemistry and skip commented and verbatim examples', () => {
  const text = String.raw`% \chemfig{not-content}
\verb|\chemfig{example}|
\begin{verbatim}
\begin{circuitikz}example\end{circuitikz}
\end{verbatim}
Text \chemfig{H_3C-[:30]C(=[2]O)-O-{CH_3}} after.
\begin{circuitikz}\draw (0,0) to[R,l={$R_1$}] (2,0);\end{circuitikz}
\begin{tikzpicture}\node {outer {nested}};\end{tikzpicture}`;
  const blocks = d.diagramBlocks(text);
  assert.equal(blocks.length, 3);
  assert.equal(d.diagramBlocks(String.raw`\documentclass{article}
\newcommand{\example}{\chemfig{H-O-H}}
\begin{document}
\chemfig{C-C}
\end{document}`).length, 1);
  assert.equal(blocks[0].source, String.raw`\chemfig{H_3C-[:30]C(=[2]O)-O-{CH_3}}`);
  assert.equal(blocks[1].kind, 'circuit');
  for (const b of blocks) assert.equal(text.slice(b.from, b.to), b.source);
  assert.equal(d.diagramBlocks(String.raw`\chemfig{unfinished {group}`).length, 0);
});

test('table cell updates preserve escaping, macros, rules and spacing exactly', () => {
  const source = String.raw`\begin{tabular}{lc}
\toprule
  Name & Value \\[2pt]
\midrule
  A\&B & \textbf{a {nested} & b} \\
\bottomrule
\end{tabular}`;
  const table = d.writingTable(source, d.texEnvironments(source, ['tabular'])[0]);
  assert.ok(table); assert.equal(table.rows.length, 2);
  assert.equal(table.rows[1][0].text, String.raw`A\&B`);
  assert.equal(table.rows[1][1].text, String.raw`\textbf{a {nested} & b}`);
  const cell = table.rows[0][1], next = source.slice(0, cell.from) + 'New value' + source.slice(cell.to);
  assert.equal(next.replace('New value', 'Value'), source);
  assert.equal(d.writingTable(next, d.texEnvironments(next, ['tabular'])[0]).rows[0][1].text, 'New value');
});

test('unknown and merged tables remain source instead of entering a lossy visual model', () => {
  for (const body of [String.raw`\multicolumn{2}{c}{span} \\`, String.raw`A & \begin{matrix} a&b \end{matrix} \\`, 'A & B % comment\n', String.raw`A & B & C \\`]) {
    const source = `\\begin{tabular}{lc}\n${body}\n\\end{tabular}`;
    assert.equal(d.writingTable(source, d.texEnvironments(source, ['tabular'])[0]), null);
  }
});

test('continuing a table adds a row before the bottom rule without rewriting existing cells', () => {
  for (const source of [String.raw`\begin{tabular}{lc} A & B \\ \bottomrule \end{tabular}`, String.raw`\begin{tabular}{lc} A & B \end{tabular}`]) {
    const table = d.writingTable(source, d.texEnvironments(source, ['tabular'])[0]);
    const change = d.appendWritingRow(table), next = source.slice(0, change.from) + change.insert + source.slice(change.from);
    const parsed = d.writingTable(next, d.texEnvironments(next, ['tabular'])[0]);
    assert.ok(parsed); assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0][0].text, 'A'); assert.equal(parsed.rows[0][1].text, 'B');
    assert.equal(parsed.rows[1][0].text, '');
  }
});

test('auxiliary edits follow surrounding changes and reject changed content even when restored', () => {
  const targetContext = { exports: {}, crypto: require('node:crypto').webcrypto, require: name => name === './writing' ? { focusWriting: () => {} } : require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/editor/writingTargets.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, targetContext);
  const targets = targetContext.exports, { EditorState } = require('@codemirror/state');
  const view = { state: EditorState.create({ doc: 'before [original] after', extensions: targets.writingTargets }), dispatch(spec) { this.state = this.state.update(spec).state; }, focus() {} };
  const target = targets.rememberWriting(view, '/project/chapter.tex', { from: 7, to: 17 });
  view.dispatch({ changes: { from: 0, insert: 'New paragraph. ' } });
  assert.equal(targets.applyWriting(view, target, '[updated]'), true);
  assert.equal(view.state.doc.toString(), 'New paragraph. before [updated] after');
  const stale = targets.rememberWriting(view, '/project/chapter.tex', { from: 0, to: 3 });
  view.dispatch({ changes: { from: 0, to: 3, insert: 'Other' } });
  assert.equal(targets.applyWriting(view, stale, 'Overwrite'), false);
  assert.ok(view.state.doc.toString().startsWith('Other'));
  view.dispatch({ changes: { from: 0, to: 5, insert: 'New' } });
  assert.equal(targets.applyWriting(view, stale, 'Overwrite'), false);
});

test('package insertion respects comments, grouped existing imports and the selected source', () => {
  const source = String.raw`\documentclass{article}
% \usepackage{chemfig}
\usepackage[american]{circuitikz,tikz}
\begin{document}
Text
\end{document}`;
  const next = d.ensureTexPackages(source, ['circuitikz', 'tikz', 'chemfig', 'chemfig']);
  assert.equal(next.split('\\usepackage{chemfig}').length, 3); // One commented example and one actual import.
  assert.equal(d.ensureTexPackages(next, ['chemfig', 'tikz']), next);
  assert.equal(next.slice(next.indexOf('\\begin{document}')), source.slice(source.indexOf('\\begin{document}')));
});
