'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const history = require('../electron/services/history.cjs');
const tex = require('../electron/services/tex.cjs');
const { verifyDirectory, verifyArchive, verifyExternalResources } = require('../scripts/verify-release.cjs');

function temp(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

for (const text of ['no trailing newline', '中文\nwith a newline\n', 'windows\r\nline endings\r\n', '', 'long '.repeat(3000)]) {
  test(`history restores exact source bytes (${text.length} characters)`, (t) => {
    const root = temp(t, 'texpro-history-test-');
    fs.writeFileSync(path.join(root, 'main.tex'), text);
    const first = history.commitHistory(root);
    assert.equal(first.skipped, false);
    assert.equal(history.readHistoryFile(root, first.version.id, 'main.tex'), text);
    assert.equal(history.commitHistory(root).skipped, true);
    fs.writeFileSync(path.join(root, 'main.tex'), 'changed');
    history.restoreHistoryFile(root, first.version.id, 'main.tex');
    assert.equal(fs.readFileSync(path.join(root, 'main.tex'), 'utf8'), text);
  });
}

test('Git init/removal and worktree markers immediately control history writes', (t) => {
  const root = temp(t, 'texpro-history-git-');
  fs.writeFileSync(path.join(root, 'main.tex'), 'initial');
  assert.equal(history.commitHistory(root).skipped, false);
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'main.tex'), 'changed');
  assert.equal(history.commitHistory(root).reason, 'git');
  assert.equal(history.listHistory(root).length, 1);
  fs.rmSync(path.join(root, '.git'), { recursive: true });
  assert.equal(history.commitHistory(root).skipped, false);
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: /some/worktree');
  assert.equal(history.commitHistory(root).reason, 'git');
  const nested = path.join(root, 'chapter'); fs.mkdirSync(nested);
  assert.equal(history.commitHistory(nested).reason, 'git');
});

test('extracted services retain the main TeX service API', () => {
  assert.equal(tex.commitHistory, history.commitHistory);
  assert.equal(typeof tex.gitStatus, 'function');
  assert.equal(typeof tex.runCompile, 'function');
});

function fixture(root) {
  for (const [name, content] of Object.entries({
    'package.json': '{}', 'electron/main.cjs': '', 'electron/preload.cjs': '', 'mcp/server.mjs': '',
    'electron/services/tex.cjs': '', 'electron/services/history.cjs': '', 'electron/services/git.cjs': '', 'electron/services/project-files.cjs': '', 'electron/services/project-root.cjs': '',
    'dist/index.html': '<script src="./assets/index-a.js"></script><link href="./assets/index-a.css" rel="stylesheet">',
    'dist/assets/index-a.js': '', 'dist/assets/index-a.css': '', 'dist/assets/pdf.worker-a.mjs': '',
  })) { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), content); }
}

test('release preflight rejects a fresh checkout without dist', (t) => {
  const root = temp(t, 'texpro-release-test-'); fixture(root);
  assert.equal(verifyDirectory(root).entryAssets, 2);
  fs.rmSync(path.join(root, 'dist'), { recursive: true });
  assert.throws(() => verifyDirectory(root), /dist\/index.html/);
});

test('release preflight rejects missing JS, CSS and PDF workers', (t) => {
  for (const file of ['index-a.js', 'index-a.css', 'pdf.worker-a.mjs']) {
    const root = temp(t, 'texpro-release-assets-'); fixture(root);
    fs.unlinkSync(path.join(root, 'dist/assets', file));
    assert.throws(() => verifyDirectory(root), /missing/i);
  }
});

test('packaged ASAR is inspected rather than trusting the source build', async (t) => {
  const root = temp(t, 'texpro-release-asar-');
  const app = path.join(root, 'app'); fs.mkdirSync(app); fixture(app);
  const asar = require('@electron/asar');
  const archive = path.join(root, 'app.asar');
  await asar.createPackage(app, archive);
  assert.equal(verifyArchive(archive).entryAssets, 2);
});

test('packaged MCP must include every service dependency outside ASAR', (t) => {
  const root = temp(t, 'texpro-mcp-resources-'); fixture(root);
  verifyExternalResources(root);
  fs.unlinkSync(path.join(root, 'electron/services/history.cjs'));
  assert.throws(() => verifyExternalResources(root), /history\.cjs/);
});

const source = fs.readFileSync(path.join(__dirname, '../src/lib/schematic.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, crypto: require('node:crypto') };
vm.runInNewContext(compiled, context);
const model = context.exports;
const snapshot = () => ({ nodes: [{ id: 'n1', kind: 'resistor', x: 40, y: 80, label: 'R', value: '' }], edges: [] });

test('diagram restore rejects malformed storage, invalid coordinates and dangling edges', () => {
  assert.ok(model.restoreSchematic(snapshot(), 'circuit'));
  for (const value of [null, { nodes: {}, edges: [] }, { nodes: [null], edges: [] },
    { nodes: [{ ...snapshot().nodes[0], x: NaN }], edges: [] },
    { nodes: [...snapshot().nodes, ...snapshot().nodes], edges: [] },
    { ...snapshot(), edges: [{ id: 'e1', from: 'n1', to: 'missing', order: 1 }] }]) {
    assert.equal(model.restoreSchematic(value, 'circuit'), null);
  }
  assert.equal(model.restoreSchematic(snapshot(), 'logic'), null);
});

test('restored node IDs cannot collide with new nodes after a restart', () => {
  const ids = new Set(Array.from({ length: 100 }, () => model.nextId('n')));
  assert.equal(ids.size, 100);
  assert.ok(!ids.has('n11'));
});

for (const mode of ['circuit', 'logic', 'structure']) {
  test(`${mode} templates generate native editable LaTeX`, () => {
    for (const template of model.configs[mode].templates) {
      const nodes = template.nodes.map(([kind, x, y, label], index) => ({ id: `n${index}`, kind, x, y, label, value: '' }));
      const edges = template.edges.map(([from, to, order], index) => ({ id: `e${index}`, from: nodes[from].id, to: nodes[to].id, order }));
      const code = model.generateSchematic(mode, nodes, edges);
      assert.match(code, mode === 'structure' ? /\\chemfig\{/ : /\\begin\{circuitikz\}/);
      assert.ok(!/[\u0000-\u0008]/.test(code));
    }
  });
}
