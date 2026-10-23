'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {}, Uint8ClampedArray };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/lib/texArtwork.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);

test('theme ink retains antialiasing and transparency without changing authored color artwork', () => {
  const input = new Uint8ClampedArray([255,255,255,255, 0,0,0,255, 128,128,128,255, 0,0,0,128]);
  const before = input.slice(), ink = context.exports.monochromeInk(input);
  assert.deepEqual([...ink].filter((_, i) => i % 4 === 3), [0,255,127,128]);
  assert.deepEqual(input, before);
  const color = new Uint8ClampedArray([255,0,0,255, 0,130,0,255, 0,0,255,255, 255,255,0,255]);
  assert.equal(context.exports.monochromeInk(color), null);
});
