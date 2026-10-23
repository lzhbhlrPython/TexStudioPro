'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const modules = new Map();
const storage = new Map();
const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const context = { exports: {}, localStorage, Uint32Array, Set, Map, require: name => name.endsWith('/i18n') ? { t: value => value } : name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts') : require(name) };
  modules.set(file, context.exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
const lib = name => load(path.join(__dirname, '../src/lib', name + '.ts'));

test('Markdown shortcuts convert prose and place the cursor inside the new structure', () => {
  const { inputConversion } = lib('writingFormats');
  for (const [typed, expected] of [['# ', '\\section{}'], ['## ', '\\subsection{}'], ['- ', '\\begin{itemize}\n  \\item \n\\end{itemize}'], ['1. ', '\\begin{enumerate}\n  \\item \n\\end{enumerate}'], ['> ', '\\begin{quote}\n\n\\end{quote}'], ['**words**', '\\textbf{words}'], ['*words*', '\\emph{words}'], ['`x_%`', '\\texttt{x\\_\\%}']]) {
    const result = inputConversion(typed, typed.length); assert.ok(result, typed); assert.equal(result.insert, expected); assert.ok(result.anchor <= result.from + expected.length);
  }
});
test('format recognition leaves TeX, comments, formulas, preamble, code and half-written input intact', () => {
  const { inputConversion, prosePosition } = lib('writingFormats');
  for (const source of ['\\section{# ', '% # ', '$# ', '\\(# ', '\\[\n# ', '\\begin{equation}\n# ', '\\begin{tabular}{ll}\n# ', '\\begin{verbatim}\n# ', '\\verb|# ', '\\documentclass{article}\n# ', '**unfinished*']) assert.equal(inputConversion(source, source.length), null, source);
  assert.equal(prosePosition('\\begin{document}\nText', 21), true);
  assert.equal(prosePosition('\\begin{minted}{tex}\n# ', 24), false);
});
test('Markdown paste preserves nested emphasis, math, code and special characters without stash collisions', () => {
  const { markdownInline, markdownPaste } = lib('writingFormats');
  assert.equal(markdownInline('**a *nested* and $x$**'), '\\textbf{a \\emph{nested} and $x$}');
  assert.equal(markdownInline('**50%** and `a_b`'), '\\textbf{50\\%} and \\texttt{a\\_b}');
  assert.ok(markdownPaste('# Heading\n\n- first\n- second').includes('\\begin{itemize}\n  \\item first\n  \\item second'));
  assert.ok(markdownPaste('```tex\n\\frac{x}{y}\n```').includes('\\begin{verbatim}\n\\frac{x}{y}\n\\end{verbatim}'));
  assert.ok(markdownPaste('| A | B |\n| --- | --- |\n| 1 | 2 |').includes('1 & 2 \\\\'));
  assert.ok(markdownInline('[site](https://example.com/a#b)').includes('https://example.com/a\\#b'));
});
test('smart paste recognizes TSV and Markdown but preserves raw TeX and Unicode prose', () => {
  const { smartPaste } = lib('pasteCleaner');
  const tex = '\\begin{table}\nA & B \\\\\n\\end{table}';
  assert.equal(smartPaste(tex, '<p>broken wrapper</p>'), tex);
  assert.equal(smartPaste('α ≤ β — 中文', ''), 'α ≤ β — 中文');
  assert.equal(smartPaste('ordinary text', ''), 'ordinary text');
  assert.ok(smartPaste('A\tB\n1\t2', '').includes('\\begin{tabular}{ll}'));
  assert.ok(smartPaste('# Heading', '').includes('\\section{Heading}'));
  assert.equal(smartPaste('merged original', '<table><td colspan="2">Merged</td></table>'), 'merged original');
});
test('label rename touches only real label/ref keys, supports lists/ranges/hyperref, and preserves examples and citations', () => {
  const { renameLabels } = lib('labelRename');
  const source = String.raw`\section{A}\label{sec:a}
\ref{sec:a} \cref{sec:a, sec:ab} \crefrange{sec:a}{sec:ab} \hyperref[sec:a]{Title}
\cite{sec:a} \url{sec:a} % \ref{sec:a}
\verb|\ref{sec:a}| \begin{verbatim}
\label{sec:a}\ref{sec:a}
\end{verbatim}`;
  const result = renameLabels({ 'a.tex': source, 'b.tex': '\\eqref{sec:a}' }, 'sec:a', 'sec:new');
  assert.equal(result.count, 6);
  assert.ok(result.texts['a.tex'].includes('\\cref{sec:new, sec:ab}'));
  assert.ok(result.texts['a.tex'].includes('\\cite{sec:a}'));
  assert.ok(result.texts['a.tex'].includes('% \\ref{sec:a}'));
  const { ChangeSet, Text } = require('@codemirror/state');
  const changes = ChangeSet.of(result.edits['a.tex'], source.length);
  assert.equal(changes.apply(Text.of(source.split('\n'))).toString(), result.texts['a.tex']);
  assert.equal(changes.invert(Text.of(source.split('\n'))).apply(Text.of(result.texts['a.tex'].split('\n'))).toString(), source);
});
test('label rename rejects duplicate declarations, destination conflicts and invalid labels', () => {
  const { renameLabels } = lib('labelRename');
  for (const [sources, after] of [[{ a: '\\label{a}', b: '\\label{a}' }, 'b'], [{ a: '\\label{a}\\label{b}' }, 'b'], [{ a: '\\label{a}' }, 'bad name'], [{ a: '\\label{a}' }, 'a'], [{ a: '\\ref{a}' }, 'b']]) assert.throws(() => renameLabels(sources, 'a', after));
});
test('local writing resume survives reopen and relocates a unique sentence after external edits', () => {
  storage.clear(); const { rememberActiveFile, resumeFile, rememberWritingPosition, resumePosition } = lib('writingResume');
  const source = 'Paragraph before.\nContinue this sentence here.\nAfter.', head = source.indexOf(' here');
  rememberActiveFile('/project', '/project/chapter.tex');
  rememberWritingPosition('/project', { file: '/project/chapter.tex', anchor: head, head, top: 350, left: 0 }, source);
  assert.equal(resumeFile('/project'), '/project/chapter.tex');
  assert.equal(resumePosition('/project', '/project/chapter.tex', source).top, 350);
  const changed = 'Inserted introduction.\n' + source;
  assert.equal(resumePosition('/project', '/project/chapter.tex', changed).head, head + 23);
  rememberActiveFile('/project', '/outside/file.tex'); assert.equal(resumeFile('/project'), '/project/chapter.tex');
  localStorage.setItem('texpro.writing-positions.v1', '{malformed'); assert.equal(resumeFile('/project'), null);
});
test('footnote lookup balances nested TeX and ignores commented/verbatim examples', () => {
  const { footnoteAt, sourceExcerpt } = lib('referencePeek');
  const source = 'Text \\footnote{A \\textbf{nested} note with $x$.} continues.\n% \\footnote{hidden}';
  assert.equal(footnoteAt(source, source.indexOf('nested')).text, 'A \\textbf{nested} note with $x$.');
  assert.equal(footnoteAt(source, source.indexOf('hidden')), null);
  assert.ok(sourceExcerpt('first\n\\label{a}\nExplanation.\n\nnext', 2).includes('Explanation.'));
});
test('Windows writing positions stay within the project and reject corrupt persisted points', () => {
  storage.clear(); const { rememberActiveFile, resumeFile, rememberWritingPosition, resumePosition } = lib('writingResume');
  rememberActiveFile('C:\\papers', 'C:\\papers\\chapter.tex'); assert.equal(resumeFile('C:\\papers'), 'C:\\papers\\chapter.tex');
  rememberWritingPosition('C:\\papers', { file: 'C:\\papers\\chapter.tex', anchor: 3, head: 3, top: 12, left: 0 }, 'Sentence');
  assert.equal(resumePosition('C:\\papers', 'C:\\papers\\chapter.tex', 'Sentence').head, 3);
  rememberActiveFile('C:\\papers', 'C:\\papers\\..\\other.tex'); assert.equal(resumeFile('C:\\papers'), 'C:\\papers\\chapter.tex');
  localStorage.setItem('texpro.writing-positions.v1', JSON.stringify({ '/project': { active: '/project/a.tex', points: { '/project/a.tex': { file: '/project/a.tex', anchor: 0, head: 0, top: 1, left: 0, size: 1 } } } }));
  assert.equal(resumePosition('/project', '/project/a.tex', 'A'), null);
});
test('all literal interface translations and command-palette details have Chinese entries', () => {
  const source = ts.createSourceFile('i18n.ts', fs.readFileSync(path.join(__dirname,'../src/i18n.ts'),'utf8'),99,true);
  const keys = new Set();
  const visitDictionary = node => { if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='zh'&&ts.isObjectLiteralExpression(node.initializer))for(const p of node.initializer.properties)if(p.name)keys.add(p.name.text); ts.forEachChild(node,visitDictionary); }; visitDictionary(source);
  const missing=[];
  const visitFile = file => { const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),99,true); const walk=node=>{
    if(ts.isCallExpression(node)&&['t','tr'].includes(node.expression.getText(ast))&&node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0])&&!keys.has(node.arguments[0].text))missing.push(`${file}: ${node.arguments[0].text}`);
    if(file.endsWith('App.tsx')&&ts.isPropertyAssignment(node)&&node.name.getText(ast)==='detail'&&ts.isStringLiteralLike(node.initializer)&&!keys.has(node.initializer.text))missing.push(`palette: ${node.initializer.text}`);
    ts.forEachChild(node,walk);
  };walk(ast); };
  const visitDir=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())visitDir(file);else if(/\.tsx?$/.test(file)&&item.name!=='i18n.ts')visitFile(file);}};
  visitDir(path.join(__dirname,'../src')); assert.deepEqual(missing,[]);
});
