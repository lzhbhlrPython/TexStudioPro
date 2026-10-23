'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tex = require('../electron/services/tex.cjs');

test('asset and project deletions share recoverable storage and exclude trash from both indexes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'texpro-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, text) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
    return file;
  };
  const main = write('main.tex', '\\documentclass{article}\n\\begin{document}\\includegraphics{library.svg}\\end{document}');
  const fromLibrary = write('library.svg', '<svg>recover library bytes</svg>');
  const fromTree = write('tree.svg', '<svg>recover tree bytes</svg>');
  write('figures/child.svg', '<svg>recover folder bytes</svg>');
  const keep = write('keep.svg', '<svg>keep</svg>');
  const source = fs.readFileSync(main, 'utf8');
  assert.equal(tex.collectAssets(root).length, 4);
  assert.equal(tex.deleteAsset(root, fromLibrary).length, 3);
  tex.deleteProjectFile(root, fromTree);
  tex.deleteProjectFolder(root, path.join(root, 'figures'));
  assert.deepEqual(tex.collectAssets(root).map(asset => asset.path), [keep]);
  const files = JSON.stringify(tex.openProject(root).tree);
  for (const name of ['library.svg', 'tree.svg', 'child.svg', '.texpro']) assert.ok(!files.includes(name));
  const trash = path.join(root, '.texpro/trash');
  const recovered = fs.readdirSync(trash).map(name => path.join(trash, name));
  assert.ok(recovered.some(file => fs.statSync(file).isFile() && fs.readFileSync(file, 'utf8').includes('recover library bytes')));
  assert.ok(recovered.some(file => fs.statSync(file).isFile() && fs.readFileSync(file, 'utf8').includes('recover tree bytes')));
  assert.ok(recovered.some(file => fs.statSync(file).isDirectory() && fs.existsSync(path.join(file, 'child.svg'))));
  assert.equal(fs.readFileSync(main, 'utf8'), source, 'deletion must not rewrite existing TeX references');
  assert.throws(() => tex.deleteAsset(root, main), /Not an asset/);
  assert.throws(() => tex.deleteAsset(root, path.join(root, '../outside.svg')), /outside/);
});
