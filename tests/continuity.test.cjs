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
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const context = { exports: {}, Uint32Array, Set, Map, require: name => name.endsWith('/i18n') ? { t: value => value } : name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts') : require(name) };
  modules.set(file, context.exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
const lib = name => load(path.join(__dirname, '../src/lib', name + '.ts'));

test('whole-content movement retains nested captions, labels, comments and parent boundaries', () => {
  const { moveWritingContent } = lib('writingStructure');
  const source = String.raw`\begin{document}
\section{One}
First.
% keep with the first section
\begin{figure}
\caption{A {nested} caption}\label{fig:one}
\end{figure}

\section{Two}
Second.
\subsection{Inside}
Child.
\end{document}`;
  const move = moveWritingContent(source, source.indexOf('section{Two}'), -1);
  assert.ok(move);
  const moved = source.slice(0, move.from) + move.insert + source.slice(move.to);
  assert.ok(moved.indexOf('section{Two}') < moved.indexOf('section{One}'));
  assert.ok(moved.includes('% keep with the first section\n\\begin{figure}\n\\caption{A {nested} caption}\\label{fig:one}\n\\end{figure}'));
  assert.equal(moveWritingContent(source, source.indexOf('subsection{Inside}'), -1), null);
  const titled = source.replace('\\section{Two}', '\\section[Short]{Two}');
  assert.ok(moveWritingContent(titled, titled.indexOf('section[Short]'), -1));
  assert.equal(moveWritingContent(source.replace('\\end{figure}', ''), source.indexOf('caption'), 1), null);
});

test('writing revisions reconstruct exact source including CRLF, empty files and large documents', () => {
  const { writingRevisions } = lib('writingRevisions');
  for (const [before, after] of [['', 'new'], ['gone\n', ''], ['a\r\nb\r\nc', 'a\r\nchanged\r\nc\n'], ['a\na\nb\n', 'a\nb\na\n'], ['prefix\n' + 'old\n'.repeat(1600), 'prefix\n' + 'new\n'.repeat(1600)], ['a\nb\nc', 'x\nb\ny']]) {
    const hunks = writingRevisions(before, after);
    let restored = after;
    for (const h of [...hunks].reverse()) restored = restored.slice(0, h.from) + h.before + restored.slice(h.to);
    assert.equal(restored, before);
    let accepted = before;
    for (const h of [...hunks].reverse()) accepted = accepted.slice(0, h.oldFrom) + h.after + accepted.slice(h.oldTo);
    assert.equal(accepted, after);
  }
});

test('writing notes stay portable, ignore verbatim examples, and reject stale toggles', () => {
  const { writingNotes, toggleWritingNote } = lib('writingNotes');
  const source = '% TODO: 补实验数据\n\\begin{verbatim}\n% TODO: example\n\\end{verbatim}\n% DONE: 引用齐全\n';
  const notes = writingNotes(source, 'main.tex');
  assert.equal(notes.length, 2);
  assert.equal(toggleWritingNote('% TODO: 补实验数据', notes[0]), '% DONE: 补实验数据');
  assert.equal(toggleWritingNote('% DONE: 引用齐全', notes[1]), '% TODO: 引用齐全');
  assert.equal(toggleWritingNote('% TODO: a different thought', notes[0]), null);
});

test('figure insertion uses unique labels and puts the caret inside the caption', () => {
  const { writingFigure, figureWritingRange } = lib('writingFigure');
  const figure = writingFigure('../assets/curve.png', 'curve.png', ['fig:curve', 'fig:curve-2']);
  assert.equal(figure.label, 'fig:curve-3');
  assert.equal(figure.source.slice(figure.cursor - 9, figure.cursor + 1), '\\caption{}');
  assert.ok(figure.source.includes('{../assets/curve.png}'));
  const source = '\\documentclass{article}\n\\begin{document}\n\\begin{table}\n\\begin{tabular}{l}Cell\\end{tabular}\n\\caption{Existing}\\end{table}\n\\end{document}';
  assert.equal(figureWritingRange(source, { from: 0, to: 0 }, true).from, source.indexOf('\\begin{table}') - 1);
  assert.equal(figureWritingRange(source, { from: source.indexOf('Cell'), to: source.indexOf('Cell') }, true).from, source.indexOf('\\end{table}') + '\\end{table}'.length);

});

test('project reference index includes nested captions and bibliography metadata', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'texpro-reference-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'main.tex'), '\\caption{A {nested} caption}\n\\label{fig:test}\n% TODO: cite a source\n% \\label{fake}\n\\begin{verbatim}\n% TODO: example\n\\end{verbatim}');
  fs.writeFileSync(path.join(root, 'refs.bib'), '@article{key, title={A {nested} title}, author="A. Author", year=2025}');
  const symbols = require('../electron/services/tex.cjs').collectProjectSymbols(root);
  assert.equal(symbols.references[0].text, 'A {nested} caption');
  assert.equal(symbols.references[0].line, 2);
  assert.ok(!symbols.labels.includes('fake'));
  assert.equal(symbols.bibliography[0].title, 'A {nested} title');
  assert.equal(symbols.bibliography[0].year, '2025');
  assert.equal(symbols.writingNotes[0].text, 'cite a source');
  assert.equal(symbols.writingNotes.length, 1);
});

test('open-buffer symbols remove stale labels and ignore comments and verbatim', () => {
  const { collectLocalSymbols } = lib('latex');
  const file = '/project/chapter.tex';
  const previous = { labels: ['removed', 'shared'], citations: [], environments: [], packages: [], images: [], references: [{ key: 'removed', file, line: 1, text: 'old' }, { key: 'shared', file: '/project/other.tex', line: 1, text: 'other' }] };
  const source = '\\section{New {heading}}\n\\caption{A {nested} caption}\\label{current}\n% \\label{comment}\n\\begin{verbatim}\n\\label{example}\n\\end{verbatim}';
  const current = collectLocalSymbols(source, previous, file);
  assert.deepEqual([...current.labels], ['current', 'shared']);
  assert.equal(current.references.find(item => item.key === 'current').line, 2);
  assert.equal(current.references.find(item => item.key === 'current').text, 'A nested caption');
});

test('Git review reads a selected commit without writing the file or repository', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'texpro-review-git-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'main.tex'); fs.writeFileSync(file, 'original\n');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init']); git(['add', 'main.tex']); git(['-c', 'user.name=Regression', '-c', 'user.email=regression@example.invalid', 'commit', '-m', 'Initial']);
  const revision = git(['rev-parse', 'HEAD']); fs.writeFileSync(file, 'current\n');
  const { gitReadFile } = require('../electron/services/git.cjs');
  assert.equal(await gitReadFile(root, revision, file), 'original\n');
  assert.equal(fs.readFileSync(file, 'utf8'), 'current\n');
  await assert.rejects(gitReadFile(root, '--help', file), /hash/);
  await assert.rejects(gitReadFile(root, revision, path.join(root, '../outside.tex')), /outside/);
});

test('citation completion replaces only the current key and keeps an existing closing brace', () => {
  const { EditorState } = require('@codemirror/state');
  const { CompletionContext } = require('@codemirror/autocomplete');
  const { makeLatexCompletionSource } = load(path.join(__dirname, '../src/editor/completions.ts'));
  const symbols = { labels: [], citations: ['one', 'two'], packages: [], environments: [], images: [], bibliography: [{ key: 'two', title: 'Second title', author: 'Author', year: '2025', file: '/project/ref.bib', line: 1 }] };
  const source = makeLatexCompletionSource(() => ({ symbols, filePath: '/project/chapter/part.tex', root: '/project' }));
  let state = EditorState.create({ doc: '\\cite{one, tw}' });
  const result = source(new CompletionContext(state, state.doc.length - 1, true));
  assert.equal(result.options.length, 1);
  assert.ok(result.options[0].label.includes('Second title'));
  result.options[0].apply({ get state() { return state; }, dispatch(spec) { state = state.update(spec).state; }, focus() {} }, result.options[0], result.from, state.doc.length - 1);
  assert.equal(state.doc.toString(), '\\cite{one, two}');
});


test('file tree creation stays inside its directory, starts empty and never replaces existing content', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'texpro-create-'));
  const outside = root + '-other'; fs.mkdirSync(outside);
  t.after(() => { fs.rmSync(root,{recursive:true,force:true}); fs.rmSync(outside,{recursive:true,force:true}); });
  const { createProjectFile, createProjectFolder } = require('../electron/services/tex.cjs');
  const dir = createProjectFolder(root, root, 'chapters').path;
  const file = createProjectFile(root, dir, 'draft');
  assert.equal(file.path, path.join(dir, 'draft.tex'));
  assert.equal(fs.readFileSync(file.path,'utf8'),'');
  fs.writeFileSync(file.path,'keep');
  assert.throws(() => createProjectFile(root, dir, 'draft'), /exists/);
  assert.equal(fs.readFileSync(file.path,'utf8'),'keep');
  for (const name of ['../escape','a/b','a\\b','bad:name','CON.tex','end.']) assert.throws(() => createProjectFile(root, dir, name), /Invalid/);
  assert.throws(() => createProjectFile(root, outside, 'escape'), /outside/);
  fs.symlinkSync(outside,path.join(root,'linked'),'dir');
  assert.throws(() => createProjectFile(root, path.join(root,'linked'), 'escape'), /outside/);
});
