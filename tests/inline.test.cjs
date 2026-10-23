'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const compile = name => ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/', name + '.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const documentContext = { exports: {} };
vm.runInNewContext(compile('texDocument'), documentContext);
const context = { exports: {}, require: name => name === './texDocument' ? documentContext.exports : require(name) };
vm.runInNewContext(compile('texInline'), context);
const { renderInlineTex } = context.exports;

test('nested table formatting preserves braced math and exact source entry offsets', () => {
  const source = String.raw`2.4 \textbf{Value \emph{nested $\frac{1}{\sqrt{2}}$}}`;
  const html = renderInlineTex(source, 10);
  assert.ok(html.includes('class="cm-bold"'));
  assert.ok(html.includes('class="cm-italic"'));
  assert.ok(html.includes('class="mfrac"'));
  assert.ok(html.includes(`data-tex-offset="${10 + source.indexOf('\\frac')}"`));
  assert.ok(!html.includes('\\textbf'));
});

test('inline preview respects escaped delimiters and retains invalid or unknown source', () => {
  assert.ok(renderInlineTex(String.raw`\(\frac{1}{2}\)`).includes('class="mfrac"'));
  assert.equal(renderInlineTex(String.raw`2.4 \frac{1}{2}`), String.raw`2.4 \frac{1}{2}`);
  assert.ok(!renderInlineTex(String.raw`\$5 \& 50\%`).includes('katex'));
  assert.equal(renderInlineTex('<script>\n'), '&lt;script&gt;\n');
  assert.ok(renderInlineTex('\\textbf{incomplete').includes('\\textbf'));
  assert.equal(renderInlineTex(String.raw`$\frac{1}{$`), String.raw`$\frac{1}{$`);
  assert.equal(renderInlineTex('$unfinished'), '$unfinished');
});
