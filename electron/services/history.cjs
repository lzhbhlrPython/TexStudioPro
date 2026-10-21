'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { IGNORED_DIRS } = require('./project-files.cjs');

function historyDir(root) { return path.join(root, '.texpro', 'history'); }
function historyChunks(text) {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  const chunks = [];
  let current = '';
  for (const line of lines) {
    current += line;
    if (current.length >= 4096) {
      chunks.push(current);
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
}

function listHistory(root) {
  const dir = path.join(historyDir(root), 'manifests');
  let files = [];
  try { files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')); } catch { return []; }
  const versions = [];
  for (const name of files) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      versions.push({
        id: manifest.id,
        time: manifest.time,
        reason: manifest.reason,
        files: Object.keys(manifest.files || {}),
        size: Object.values(manifest.files || {}).reduce((sum, item) => sum + (item.size || 0), 0),
      });
    } catch { /* skip broken manifest */ }
  }
  return versions.sort((a, b) => b.time - a.time);
}

function isGitManaged(root) {
  let current = path.resolve(root);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function commitHistory(root, reason = 'manual') {
  if (isGitManaged(root)) return { ok: true, skipped: true, reason: 'git', version: null };
  const dir = historyDir(root);
  fs.mkdirSync(path.join(dir, 'objects'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'manifests'), { recursive: true });
  const files = {};
  const visit = (current, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { visit(full, depth + 1); continue; }
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.tex', '.ltx', '.bib', '.sty', '.cls', '.md', '.txt'].includes(ext)) continue;
      const stat = fs.statSync(full);
      if (stat.size > 2_000_000) continue;
      const text = fs.readFileSync(full, 'utf8');
      const contentHash = crypto.createHash('sha256').update(text).digest('hex');
      const chunks = historyChunks(text).map((chunk) => {
        const hash = crypto.createHash('sha256').update(chunk).digest('hex');
        const object = path.join(dir, 'objects', hash.slice(0, 2), hash + '.br');
        if (!fs.existsSync(object)) {
          fs.mkdirSync(path.dirname(object), { recursive: true });
          fs.writeFileSync(object, zlib.brotliCompressSync(Buffer.from(chunk, 'utf8'), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }));
        }
        return hash;
      });
      files[path.relative(root, full).replace(/\\/g, '/')] = { hash: contentHash, chunks, size: stat.size };
    }
  };
  visit(root, 0);
  const previous = listHistory(root)[0];
  if (previous) {
    const prev = JSON.parse(fs.readFileSync(path.join(dir, 'manifests', previous.id + '.json'), 'utf8'));
    const same = Object.keys(files).length === Object.keys(prev.files || {}).length && Object.entries(files).every(([file, item]) => prev.files?.[file]?.hash === item.hash);
    if (same) return { ok: true, skipped: true, version: previous };
  }
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(2).toString('hex');
  const manifest = { id, time: Date.now(), reason, files };
  fs.writeFileSync(path.join(dir, 'manifests', id + '.json'), JSON.stringify(manifest));
  const versions = listHistory(root);
  const keep = 80;
  for (const old of versions.slice(keep)) {
    try { fs.unlinkSync(path.join(dir, 'manifests', old.id + '.json')); } catch { /* ignore */ }
  }
  return { ok: true, skipped: false, version: { id, time: manifest.time, reason, files: Object.keys(files), size: Object.values(files).reduce((sum, item) => sum + item.size, 0) } };
}

function readHistoryFile(root, versionId, file) {
  const dir = historyDir(root);
  if (!/^[\w.-]+$/.test(versionId)) throw new Error('Invalid version id');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifests', versionId + '.json'), 'utf8'));
  const entry = manifest.files?.[file];
  if (!entry) throw new Error('File is not in this version');
  let text = '';
  for (const hash of entry.chunks) {
    const object = path.join(dir, 'objects', hash.slice(0, 2), hash + '.br');
    text += zlib.brotliDecompressSync(fs.readFileSync(object)).toString('utf8');
  }
  return text;
}

function restoreHistoryFile(root, versionId, file) {
  const content = readHistoryFile(root, versionId, file);
  const target = path.resolve(root, file);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('File is outside the project');
  fs.writeFileSync(target, content, 'utf8');
  return { ok: true, file, bytes: Buffer.byteLength(content) };
}


function historyGc(root) {
  const dir = historyDir(root);
  const manifestsDir = path.join(dir, 'manifests');
  const used = new Set();
  let manifests = [];
  try { manifests = fs.readdirSync(manifestsDir).filter((name) => name.endsWith('.json')); } catch { /* empty */ }
  for (const name of manifests) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(manifestsDir, name), 'utf8'));
      for (const entry of Object.values(manifest.files || {})) {
        for (const hash of entry.chunks || []) used.add(hash);
      }
    } catch { /* ignore */ }
  }
  let removed = 0;
  let bytes = 0;
  const visit = (current) => {
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { visit(full); continue; }
      if (!entry.name.endsWith('.br')) continue;
      const hash = entry.name.slice(0, -3);
      if (!used.has(hash)) {
        try { bytes += fs.statSync(full).size; fs.unlinkSync(full); removed += 1; } catch { /* ignore */ }
      }
    }
  };
  visit(path.join(dir, 'objects'));
  return { removed, bytes };
}

function deleteHistoryVersion(root, versionId) {
  if (!/^[\w.-]+$/.test(String(versionId))) throw new Error('Invalid version id');
  const file = path.join(historyDir(root), 'manifests', versionId + '.json');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { ok: true, deleted: versionId, ...historyGc(root) };
}

function clearHistory(root) {
  const dir = historyDir(root);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true };
}


module.exports = { commitHistory, listHistory, readHistoryFile, restoreHistoryFile, deleteHistoryVersion, clearHistory };
