'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { IGNORED_DIRS, isTextFile } = require('./project-files.cjs');
const history = require('./history.cjs');
const git = require('./git.cjs');
const { musicSpacing } = require('./music.cjs');
const { readConfig, resolveProjectRoot, resolveCompileRoot, rebaseConfiguredRoot } = require('./project-root.cjs');

function walk(root, current = root, depth = 0, budget = { left: 1200 }) {
  if (depth > 8 || budget.left <= 0) return [];
  let entries;
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name, 'en', { numeric: true });
  });
  const nodes = [];
  for (const entry of entries) {
    if (budget.left <= 0) break;
    if (entry.name.startsWith('.') && entry.name !== '.latexmkrc') continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const children = walk(root, full, depth + 1, budget);
      nodes.push({
        type: 'dir',
        name: entry.name,
        path: full,
        relative: path.relative(root, full),
        children,
      });
    } else if (entry.isFile()) {
      budget.left -= 1;
      const ext = path.extname(entry.name).toLowerCase();
      nodes.push({
        type: 'file',
        name: entry.name,
        path: full,
        relative: path.relative(root, full),
        ext,
        text: isTextFile(full),
        size: safeSize(full),
      });
    }
  }
  return nodes;
}

function safeSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function findRootFile(root) { return resolveProjectRoot(root).rootFile; }

function openProject(root) {
  const resolved = path.resolve(root);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error('Not a directory: ' + resolved);
  const tree = walk(resolved);
  const rootInfo = resolveProjectRoot(resolved);
  return {
    root: resolved,
    name: path.basename(resolved),
    tree,
    ...rootInfo,
  };
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === '.texpro' || entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.DS_Store') continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function ensureDemoProject(demoSource, userData) {
  const destination = path.join(userData, 'demo-project');
  const marker = path.join(destination, 'main.tex');
  if (!fs.existsSync(marker)) {
    fs.rmSync(destination, { recursive: true, force: true });
    copyDirectory(demoSource, destination);
  }
  return openProject(destination);
}

function statFile(file) {
  const stat = fs.statSync(file);
  return {
    size: stat.size,
    modified: stat.mtimeMs,
    name: path.basename(file),
    ext: path.extname(file).toLowerCase(),
    directory: stat.isDirectory(),
  };
}

function readTextFile(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeTextFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function collectProjectSymbols(root) {
  const labels = new Set();
  const citations = new Set();
  const environments = new Set();
  const packages = new Set();
  const images = [];
  const references = [], bibliography = [], writingNotes = [];
  const group = (text, at) => {
    if (text[at] !== '{') return '';
    let depth = 1, end = at + 1;
    for (; end < text.length && depth; end++) {
      if (text[end] === '\\') { end++; continue; }
      if (text[end] === '{') depth++; else if (text[end] === '}') depth--;
    }
    return depth ? '' : text.slice(at + 1, end - 1);
  };
  const visit = (dir, depth) => {
    if (depth > 5) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full, depth + 1);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.tex' || ext === '.ltx') {
        let text = '';
        try {
          text = fs.readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        // Keep source locations and context so writing completion needs no separate manager.
        const uncommented = text.replace(/(^|[^\\])%[^\n]*/gm, match => match.replace(/[^\n]/g, ' '));
        for (const m of uncommented.matchAll(/\\label\{([^}]+)\}/g)) {
          labels.add(m[1]);
          const before = uncommented.slice(Math.max(0, m.index - 1800), m.index);
          const heading = [...before.matchAll(/\\(?:caption|(?:sub)*section|chapter|part)\*?(?:\[[^\]]*\])?\s*\{/g)].at(-1);
          const context = heading ? group(before, heading.index + heading[0].length - 1) : text.slice(Math.max(0, text.lastIndexOf('\n', m.index - 1) + 1), m.index);
          references.push({ key: m[1], file: full, line: text.slice(0, m.index).split('\n').length, text: context.trim().slice(0, 300) });
        }
        let noteVerbatim = '';
        text.split('\n').forEach((line, i) => {
          if (noteVerbatim) { if (line.includes(`\\end{${noteVerbatim}}`)) noteVerbatim = ''; return; }
          const begin = /^\s*\\begin\{(verbatim\*?|lstlisting|minted)\}/.exec(line);
          if (begin) { noteVerbatim = begin[1]; return; }
          const note = /^\s*%\s*(TODO|FIXME|NOTE|DONE)\s*:\s*(.*)$/i.exec(line);
          if (note) writingNotes.push({ file: full, line: i + 1, text: note[2], done: note[1].toUpperCase() === 'DONE' });
        });
        for (const m of text.matchAll(/\\begin\{([^}]+)\}/g)) environments.add(m[1]);
        for (const m of text.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/g)) citations.add(m[1]);
        for (const m of text.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
          for (const p of m[1].split(',')) packages.add(p.trim());
        }
        for (const m of text.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
          const rel = m[1];
          const abs = path.resolve(path.dirname(full), rel);
          for (const ext of ['', '.png', '.jpg', '.jpeg', '.pdf']) {
            if (fs.existsSync(abs + ext)) {
              images.push({ label: path.basename(abs + ext), path: abs + ext, relative: path.relative(root, abs + ext) });
              break;
            }
          }
        }
      } else if (ext === '.bib') {
        let text = '';
        try {
          text = fs.readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        for (const m of text.matchAll(/@(?!comment\b|string\b|preamble\b)\w+\s*\{\s*([^,\s]+)\s*,/gi)) {
          citations.add(m[1]);
          const entry = group(text, m.index + m[0].indexOf('{'));
          const field = name => {
            const value = new RegExp('\\b' + name + '\\s*=\\s*([{"]|[^,\\s}]+)', 'i').exec(entry);
            if (!value) return '';
            const at = value.index + value[0].length - 1;
            return value[1] === '{' ? group(entry, at) : value[1] === '"' ? entry.slice(at + 1).split('"')[0] : value[1];
          };
          bibliography.push({ key: m[1], file: full, line: text.slice(0, m.index).split('\n').length, title: field('title'), author: field('author'), year: field('year') });
        }
      }
    }
  };
  visit(root, 0);
  return {
    labels: [...labels].sort(),
    citations: [...citations].sort(),
    environments: [...environments].sort(),
    packages: [...packages].sort(),
    images,
    references, bibliography, writingNotes,
  };
}


function removeLatexCommand(text, command) {
  let output = text;
  const token = '\\' + command;
  let index = output.indexOf(token);
  while (index >= 0) {
    let cursor = index + token.length;
    while (cursor < output.length && /\s/.test(output[cursor])) cursor++;
    if (output[cursor] !== '{') {
      index = output.indexOf(token, cursor);
      continue;
    }
    let depth = 0;
    let end = cursor;
    for (; end < output.length; end++) {
      if (output[end] === '\\') {
        end++;
        continue;
      }
      if (output[end] === '{') depth++;
      if (output[end] === '}') {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }
    output = output.slice(0, index) + output.slice(end);
    index = output.indexOf(token, index);
  }
  return output;
}

function extractTikzPreamble(text) {
  const start = text.indexOf('\\documentclass');
  const end = text.indexOf('\\begin{document}');
  if (start < 0 || end < 0 || end <= start) return '';
  let preamble = text.slice(start, end);
  preamble = preamble.replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/g, '');
  for (const command of ['title', 'author', 'date', 'thanks', 'maketitle']) {
    preamble = removeLatexCommand(preamble, command);
  }
  preamble = preamble.replace(/\\maketitle\b/g, '').replace(/\\tableofcontents\b/g, '')
    .replace(/\\usepackage(?:\[[^\]]*\])?\{geometry\}/g, '')
    .replace(/\\usepackage(?:\[[^\]]*\])?\{hyperref\}/g, '')
    .replace(/\\usepackage(?:\[[^\]]*\])?\{microtype\}/g, '')
    .replace(/\\usepackage(?:\[[^\]]*\])?\{fancyhdr\}/g, '')
    .replace(/\\usepackage(?:\[[^\]]*\])?\{setspace\}/g, '')
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '');
  return preamble.trim();
}

async function runLatexOnce(engine, args, cwd, timeoutMs) {
  const bin = resolveTexBinary(engine);
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    let child;
    try {
      child = spawn(bin, args, { cwd, env: texEnvironment(cwd), stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: String(error), error });
      return;
    }
    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      finish(null);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      stderr += '\n' + String(error);
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}

async function renderTikz({ projectRoot, filePath, source, preamble: documentBuffer }) {
  const root = path.resolve(projectRoot || '');
  if (!fs.existsSync(root)) return { ok: false, error: 'Project is not open' };
  const cleanSource = String(source || '').trim();
  if (!cleanSource || cleanSource.length > 250000) return { ok: false, error: 'Empty or oversized TikZ source' };
  let documentText = '';
  try {
    const main = resolveProjectRoot(root).rootFile || filePath;
    if (typeof documentBuffer === 'string' && documentBuffer.length <= 2000000) documentText = documentBuffer;
    else if (main && fs.existsSync(main)) documentText = fs.readFileSync(main, 'utf8');
  } catch {
    // use empty preamble
  }
  const preamble = extractTikzPreamble(documentText);
  const usesPgfplots = /\\(?:begin\{axis\}|addplot|pgfplotsset)\b/.test(cleanSource) || /\\(?:begin\{axis\}|addplot|pgfplotsset)\b/.test(preamble);
  const extras = [];
  if (!/\\usepackage(?:\[[^\]]*\])?\{[^}]*\btikz\b/.test(preamble)) extras.push('\\usepackage{tikz}');
  if (usesPgfplots && !/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bpgfplots\b/.test(preamble)) extras.push('\\usepackage{pgfplots}');
  if (usesPgfplots && !/\\pgfplotsset\s*\{/.test(preamble + cleanSource)) extras.push('\\pgfplotsset{compat=1.18}');
  if (!/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bxcolor\b/.test(preamble)) extras.push('\\usepackage{xcolor}');
  if (!/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bamsmath\b/.test(preamble)) extras.push('\\usepackage{amsmath,amssymb}');
  const packageHints = [
    [/\\(?:SI|si|num|qty)\b/, '\\usepackage{siunitx}'],
    [/\\ce\{/, '\\usepackage[version=4]{mhchem}'],
    [/\\chemfig\b/, '\\usepackage{chemfig}'],
    [/\\begin\{circuitikz\}|\\draw[^\n]*\bto\[(?:R|C|L|V|I|short|open)/, '\\usepackage{circuitikz}'],
    [/\\begin\{tikzcd\}|\\arrow\[/, '\\usepackage{tikz-cd}'],
    [/\\(?:dv|pdv|grad|div|curl)\b/, '\\usepackage{physics}'],
    [/\\(?:coloneqq|DeclarePairedDelimiter|xrightarrow)\b/, '\\usepackage{mathtools}'],
    [/\\bm\{/, '\\usepackage{bm}'],
  ];
  for (const [pattern, packageLine] of packageHints) {
    if (pattern.test(cleanSource) && !preamble.includes(packageLine)) extras.push(packageLine);
  }
  extras.push('\\usetikzlibrary{arrows.meta,positioning,calc,shapes.geometric,shapes.misc,patterns,decorations.pathmorphing,decorations.markings,fit,backgrounds,chains,matrix,quotes,angles,intersections,circuits.logic.US,circuits.logic.IEC}');
  const ctexClass = /\\documentclass(?:\[[^\]]*\])?\{ctex(?:art|book|rep|beamer)?\}/.test(documentText);
  const magicEngine = /^\s*%\s*!TEX\s+program\s*=\s*(xelatex|lualatex|pdflatex)/im.exec(documentText)?.[1];
  const useLua = /\\documentclass(?:\[[^\]]*\])?\{(?:ltjs|luatexja)|\\usepackage(?:\[[^\]]*\])?\{luatexja\}/.test(documentText + '\n' + preamble);
  const useXe = magicEngine === 'xelatex' || ctexClass || /\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:fontspec|ctex|polyglossia)\b|\\setCJKmainfont/.test(preamble);
  const engine = useLua ? 'lualatex' : useXe ? 'xelatex' : 'pdflatex';
  const document = [
    '\\documentclass[border=2pt]{standalone}',
    preamble,
    ...extras,
    '\\begin{document}',
    cleanSource,
    '\\end{document}',
    '',
  ].join('\n');

  const cacheKey = crypto.createHash('sha256').update(document).digest('hex').slice(0, 24);
  const dir = path.join(root, '.texpro', 'tikz');
  fs.mkdirSync(dir, { recursive: true });
  const base = 'tikz-' + cacheKey;
  const texPath = path.join(dir, base + '.tex');
  const pdfPath = path.join(dir, base + '.pdf');
  const pngPath = path.join(dir, base + '.png');
  const svgPath = path.join(dir, base + '.svg');
  if (fs.existsSync(pngPath)) {
    return { ok: true, svgPath: pngPath, engine, cacheKey, cached: true, format: 'png' };
  }
  fs.writeFileSync(texPath, document, 'utf8');
  const compile = await runLatexOnce(
    engine,
    ['-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', '-output-directory=' + dir, texPath],
    root,
    30000,
  );
  if (compile.code !== 0 || !fs.existsSync(pdfPath)) {
    let log = compile.stdout + '\n' + compile.stderr;
    try {
      log = fs.readFileSync(path.join(dir, base + '.log'), 'utf8');
    } catch {
      // keep stdout
    }
    const firstError = log.split('\n').find((line) => line.startsWith('!') || /^.*:\d+:/.test(line));
    // If the project preamble is the problem, try a minimal standalone fallback.
    const fallbackSource = [
      '\\documentclass[border=2pt]{standalone}',
      ...extras,
      '\\begin{document}',
      cleanSource,
      '\\end{document}',
      '',
    ].join('\n');
    const fallbackBase = base + '-fallback';
    const fallbackTex = path.join(dir, fallbackBase + '.tex');
    const fallbackPdf = path.join(dir, fallbackBase + '.pdf');
    const fallbackPng = path.join(dir, fallbackBase + '.png');
    fs.writeFileSync(fallbackTex, fallbackSource, 'utf8');
    const fallbackCompile = await runLatexOnce(
      engine,
      ['-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', '-output-directory=' + dir, fallbackTex],
      root,
      30000,
    );
    if (fallbackCompile.code === 0 && fs.existsSync(fallbackPdf)) {
      const fallbackRaster = await runLatexOnce(
        'sips',
        ['-s', 'format', 'png', '--resampleWidth', '1800', fallbackPdf, '--out', fallbackPng],
        root,
        20000,
      );
      if (fallbackRaster.code === 0 && fs.existsSync(fallbackPng)) {
        return {
          ok: true,
          svgPath: fallbackPng,
          engine,
          cacheKey,
          cached: false,
          format: 'png',
          fallback: true,
          warning: firstError || 'Rendered with a minimal preamble because the project preamble failed.',
          log: log.slice(-4000),
        };
      }
    }
    return {
      ok: false,
      error: firstError || 'TikZ compilation failed',
      log: log.slice(-6000),
      engine,
    };
  }
  const raster = await runLatexOnce(
    'sips',
    ['-s', 'format', 'png', '--resampleWidth', '1800', pdfPath, '--out', pngPath],
    root,
    20000,
  );
  if (raster.code === 0 && fs.existsSync(pngPath)) {
    return { ok: true, svgPath: pngPath, engine, cacheKey, cached: false, format: 'png' };
  }
  return {
    ok: false,
    error: 'Could not convert TikZ output to an image',
    log: (raster.stdout + raster.stderr).slice(-4000),
  };
}

function searchProject(root, query, caseSensitive = false, limit = 120) {
  if (!query || query.length < 2) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const results = [];
  const visit = (dir, depth) => {
    if (depth > 5 || results.length >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= limit) break;
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full, depth + 1);
        continue;
      }
      if (!isTextFile(full)) continue;
      let text = '';
      try {
        const stat = fs.statSync(full);
        if (stat.size > 2_000_000) continue;
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length && results.length < limit; i++) {
        const haystack = caseSensitive ? lines[i] : lines[i].toLowerCase();
        if (haystack.includes(needle)) {
          results.push({
            file: full,
            relative: path.relative(root, full),
            line: i + 1,
            text: lines[i].trim().slice(0, 180),
          });
        }
      }
    }
  };
  visit(root, 0);
  return results;
}


const ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.eps']);

function collectAssets(root) {
  const assets = [];
  const visit = (dir, depth) => {
    if (depth > 6 || assets.length >= 500) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full, depth + 1);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!ASSET_EXTENSIONS.has(ext)) continue;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      assets.push({
        path: full,
        relative: path.relative(root, full),
        name: entry.name,
        ext,
        size: stat.size,
        modified: stat.mtimeMs,
      });
    }
  };
  visit(root, 0);
  return assets.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
}

function uniqueAssetName(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext).replace(/[\\/:*?"<>|]/g, '-').slice(0, 120) || 'asset';
  let candidate = base + ext.toLowerCase();
  let index = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}-${index}${ext.toLowerCase()}`;
    index++;
  }
  return candidate;
}

function saveImageBuffer(projectRoot, assetsDir, payload) {
  const root = path.resolve(projectRoot);
  const targetDir = path.resolve(root, assetsDir || 'assets');
  if (!targetDir.startsWith(root + path.sep)) throw new Error('Assets directory must stay inside the project');
  fs.mkdirSync(targetDir, { recursive: true });
  const ext = String(payload.ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  const base = String(payload.name || 'pasted-image').replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '') || 'pasted-image';
  let file = path.join(targetDir, `${base}.${ext}`);
  let index = 2;
  while (fs.existsSync(file)) file = path.join(targetDir, `${base}-${index++}.${ext}`);
  fs.writeFileSync(file, Buffer.from(payload.data));
  const stat = fs.statSync(file);
  return {
    path: file,
    relative: path.relative(root, file),
    name: path.basename(file),
    ext,
    size: stat.size,
    modified: stat.mtimeMs,
  };
}

function importAssets(projectRoot, sourceFiles, assetsDir = 'assets') {
  const root = path.resolve(projectRoot);
  const targetDir = path.resolve(root, assetsDir || 'assets');
  if (!targetDir.startsWith(root + path.sep)) throw new Error('Assets directory must stay inside the project');
  fs.mkdirSync(targetDir, { recursive: true });
  for (const source of sourceFiles) {
    const stat = fs.statSync(source);
    if (!stat.isFile()) continue;
    const ext = path.extname(source).toLowerCase();
    if (!ASSET_EXTENSIONS.has(ext)) continue;
    const target = path.join(targetDir, uniqueAssetName(targetDir, path.basename(source)));
    fs.copyFileSync(source, target);
  }
  return collectAssets(projectRoot);
}

function deleteAsset(projectRoot, file) {
  const resolved = path.resolve(file);
  const root = path.resolve(projectRoot);
  if (!resolved.startsWith(root + path.sep)) throw new Error('Asset is outside the project');
  const ext = path.extname(resolved).toLowerCase();
  if (!ASSET_EXTENSIONS.has(ext)) throw new Error('Not an asset file');
  deleteProjectFile(root, resolved);
  return collectAssets(root);
}

function sanitizeTemplateId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
}

function listUserTemplates(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        try {
          const item = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
          if (!item || !item.content || !item.name) return null;
          return {
            id: String(item.id || path.basename(name, '.json')),
            name: String(item.name).slice(0, 120),
            description: String(item.description || '').slice(0, 300),
            category: String(item.category || 'User'),
            engine: ['pdflatex', 'xelatex', 'lualatex'].includes(item.engine) ? item.engine : 'pdflatex',
            content: String(item.content),
            builtin: false,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function saveUserTemplate(dir, payload) {
  fs.mkdirSync(dir, { recursive: true });
  const id = 'user-' + Date.now().toString(36);
  const item = {
    id,
    name: String(payload.name || 'Untitled template').trim().slice(0, 120) || 'Untitled template',
    description: String(payload.description || '').trim().slice(0, 300),
    category: 'User',
    engine: ['pdflatex', 'xelatex', 'lualatex'].includes(payload.engine) ? payload.engine : 'pdflatex',
    content: String(payload.content || '').slice(0, 2_000_000),
    createdAt: Date.now(),
  };
  fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(item, null, 2), 'utf8');
  return { ...item, builtin: false };
}

function deleteUserTemplate(dir, id) {
  const safe = sanitizeTemplateId(id);
  if (!safe) throw new Error('Invalid template id');
  const file = path.join(dir, safe + '.json');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return listUserTemplates(dir);
}


async function diagnoseProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const toolNames = ['latexmk', 'pdflatex', 'xelatex', 'lualatex', 'biber', 'bibtex', 'synctex', 'kpsewhich', 'dvisvgm'];
  const tools = await Promise.all(toolNames.map(async (name) => {
    let found = '';
    try {
      const result = await execFileAsync('/usr/bin/which', [name], { encoding: 'utf8', timeout: 3000 });
      found = result.stdout.trim();
    } catch {
      found = '';
    }
    return { name, ok: Boolean(found), path: found, required: ['latexmk', 'pdflatex'].includes(name) };
  }));

  const issues = [];
  const textFiles = [];
  const visit = (dir, depth) => {
    if (depth > 6 || textFiles.length >= 120) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full, depth + 1);
      else if (entry.isFile() && /\.(tex|ltx|bib)$/i.test(entry.name)) textFiles.push(full);
    }
  };
  visit(root, 0);

  const labels = new Map();
  const refs = [];
  const cites = [];
  const bibKeys = new Set();
  const includes = [];
  const images = [];
  const packages = new Set();

  const read = (file) => {
    try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
  };

  for (const file of textFiles) {
    const text = read(file);
    if (file.endsWith('.bib')) {
      for (const match of text.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)) bibKeys.add(match[1]);
      continue;
    }
    const lineOf = (index) => text.slice(0, index).split('\n').length;
    const scanText = text
      .replace(/%.*$/gm, '')
      .replace(/\\begin\{verbatim\}[\s\S]*?\\end\{verbatim\}/g, '')
      .replace(/\\begin\{lstlisting\}[\s\S]*?\\end\{lstlisting\}/g, '')
      .replace(/\\verb\|([^|]*)\|/g, '')
      .replace(/\\verb(.)(.*?)\1/g, '');
    for (const match of scanText.matchAll(/\\label\{([^}]+)\}/g)) {
      const label = match[1].trim();
      if (!labels.has(label)) labels.set(label, []);
      labels.get(label).push({ file, line: lineOf(match.index || 0) });
    }
    for (const match of scanText.matchAll(/\\(?:ref|eqref|autoref|pageref|cref|Cref)\{([^}]+)\}/g)) {
      refs.push({ key: match[1].trim(), file, line: lineOf(match.index || 0) });
    }
    for (const match of scanText.matchAll(/\\(?:cite|citep|citet|parencite|textcite|autocite|footcite)\*?(?:\[[^\]]*\])*\{([^}]+)\}/g)) {
      for (const key of match[1].split(',').map((item) => item.trim()).filter(Boolean)) {
        cites.push({ key, file, line: lineOf(match.index || 0) });
      }
    }
    for (const match of scanText.matchAll(/\\(?:input|include)\{([^}]+)\}/g)) {
      const raw = match[1].trim();
      const target = path.resolve(path.dirname(file), raw.endsWith('.tex') ? raw : raw + '.tex');
      includes.push({ raw, file, line: lineOf(match.index || 0), target, exists: fs.existsSync(target) });
    }
    for (const match of scanText.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
      const raw = match[1].trim();
      const target = path.resolve(path.dirname(file), raw);
      const exists = fs.existsSync(target) || ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg'].some((ext) => fs.existsSync(target + ext));
      images.push({ raw, file, line: lineOf(match.index || 0), target, exists });
    }
    for (const match of scanText.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
      for (const name of match[1].split(',').map((item) => item.trim())) if (name) packages.add(name);
    }
  }

  for (const [label, spots] of labels) {
    if (spots.length > 1) {
      for (const spot of spots) issues.push({ severity: 'warning', kind: 'duplicate-label', message: `Duplicate label: ${label}`, file: spot.file, line: spot.line });
    }
  }
  for (const ref of refs) {
    if (!labels.has(ref.key)) issues.push({ severity: 'warning', kind: 'undefined-ref', message: `Undefined reference: ${ref.key}`, file: ref.file, line: ref.line });
  }
  for (const cite of cites) {
    if (!bibKeys.has(cite.key)) issues.push({ severity: 'warning', kind: 'undefined-cite', message: `Missing bibliography key: ${cite.key}`, file: cite.file, line: cite.line });
  }
  for (const include of includes) {
    if (!include.exists) issues.push({ severity: 'error', kind: 'missing-include', message: `Missing included file: ${include.raw}`, file: include.file, line: include.line });
  }

  const texFiles = textFiles.filter((file) => /\.(tex|ltx)$/i.test(file));
  const rootInfo = resolveProjectRoot(root);
  const rootFile = rootInfo.rootFile;
  if (!rootFile) issues.push({ severity: 'error', kind: 'main-file', message: rootInfo.rootError, file: '', line: 0 });
  if (rootFile) {
    const reachable = new Set([path.resolve(rootFile)]);
    let added = true;
    while (added) {
      added = false;
      for (const include of includes) {
        if (!include.exists) continue;
        if (reachable.has(path.resolve(include.file)) && !reachable.has(path.resolve(include.target))) {
          reachable.add(path.resolve(include.target));
          added = true;
        }
      }
    }
    for (const file of texFiles) {
      if (!reachable.has(path.resolve(file))) {
        issues.push({ severity: 'warning', kind: 'orphan-file', message: `Orphan TeX file: ${path.relative(root, file)}`, file, line: 0 });
      }
    }
  }
  for (const image of images) {
    if (!image.exists) issues.push({ severity: 'warning', kind: 'missing-image', message: `Missing image: ${image.raw}`, file: image.file, line: image.line });
  }

  const kpsewhich = tools.find((tool) => tool.name === 'kpsewhich')?.path;
  if (kpsewhich) {
    const missing = await Promise.all([...packages].slice(0, 40).map(async (name) => {
      try {
        await execFileAsync(kpsewhich, [name + '.sty'], { encoding: 'utf8', timeout: 2500 });
        return null;
      } catch {
        return name;
      }
    }));
    for (const name of missing) {
      if (name) issues.push({ severity: 'warning', kind: 'missing-package', message: `Package not found: ${name}`, file: '', line: 0 });
    }
  }

  if (packages.has('biblatex') && !tools.find((tool) => tool.name === 'biber')?.ok) {
    issues.push({ severity: 'warning', kind: 'missing-biber', message: 'biblatex is used but biber is not available', file: '', line: 0 });
  }
  const unused = [...labels.keys()].filter((label) => !refs.some((ref) => ref.key === label));
  return {
    tools,
    issues: issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1)),
    stats: {
      files: textFiles.length,
      labels: labels.size,
      refs: refs.length,
      bibKeys: bibKeys.size,
      cites: cites.length,
      packages: packages.size,
      unusedLabels: unused.length,
    },
  };
}

function cleanBuild(projectRoot, buildDirOption) {
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, buildDirOption || '.texpro/build');
  if (!target.startsWith(root + path.sep)) throw new Error('Build directory must stay inside the project');
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  return { ok: true, removed: target };
}


function bibKey(author, year, title) {
  const family = String(author || 'reference').split(/[,\s]/)[0].replace(/[^a-zA-Z]/g, '').toLowerCase() || 'reference';
  const word = String(title || '').split(/\s+/).find((item) => /[a-zA-Z]/.test(item))?.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'work';
  return `${family}${year || ''}${word}`.slice(0, 40);
}

async function lookupBibtex(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) throw new Error('Enter a DOI or arXiv ID');
  const doiMatch = raw.match(/(?:doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[^\s]+)/i);
  const arxivMatch = raw.match(/(?:arxiv[:/\s]*)?(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  if (doiMatch) {
    const doi = doiMatch[1];
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': 'TeXPro/0.1 (mailto:texpro@example.com)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Crossref returned ${response.status}`);
    const payload = await response.json();
    const item = payload.message || {};
    const authors = (item.author || []).map((author) => [author.family, author.given].filter(Boolean).join(', ')).join(' and ');
    const year = item.issued?.['date-parts']?.[0]?.[0] || '';
    const title = Array.isArray(item.title) ? item.title[0] : item.title || '';
    const container = Array.isArray(item['container-title']) ? item['container-title'][0] : '';
    const entry = {
      type: item.type === 'proceedings-article' ? 'inproceedings' : item.type === 'book' ? 'book' : 'article',
      key: bibKey(authors, year, title),
      fields: {
        author: authors,
        title,
        year: String(year),
        journal: container,
        volume: item.volume || '',
        number: item.issue || '',
        pages: item.page || '',
        doi,
        url: item.URL || `https://doi.org/${doi}`,
      },
    };
    return { entry, source: 'Crossref' };
  }
  if (arxivMatch) {
    const id = arxivMatch[1];
    const response = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`arXiv returned ${response.status}`);
    const xml = await response.text();
    const title = (xml.match(/<title>([\s\S]*?)<\/title>/g)?.pop() || '').replace(/<\/?title>/g, '').replace(/\s+/g, ' ').trim();
    const authors = [...xml.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((match) => match[1].trim()).join(' and ');
    const published = xml.match(/<published>(\d{4})/)?.[1] || '';
    return {
      entry: {
        type: 'misc',
        key: `arxiv${id.replace(/[^0-9]/g, '').slice(0, 12)}`,
        fields: { author: authors, title, year: published, eprint: id, archiveprefix: 'arXiv', url: `https://arxiv.org/abs/${id}` },
      },
      source: 'arXiv',
    };
  }
  throw new Error('Expected a DOI (10.xxxx/...) or arXiv ID');
}



function moveProjectDirectory(projectRoot, dir, nextName) {
  const root = path.resolve(projectRoot);
  const oldDir = path.resolve(dir);
  if (!oldDir.startsWith(root + path.sep)) throw new Error('Directory is outside the project');
  const safeName = String(nextName || '').trim();
  if (!safeName || /[\\/]/.test(safeName) || safeName === '.' || safeName === '..') throw new Error('Invalid directory name');
  const newDir = path.join(path.dirname(oldDir), safeName);
  if (fs.existsSync(newDir)) throw new Error('A directory with that name already exists');
  fs.renameSync(oldDir, newDir);
  rebaseConfiguredRoot(root, oldDir, newDir);

  const oldRel = path.relative(root, oldDir).replace(/\\/g, '/');
  const newRel = path.relative(root, newDir).replace(/\\/g, '/');
  let updated = 0;
  const visit = (current, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { visit(full, depth + 1); continue; }
      if (!isTextFile(full) || path.extname(full).toLowerCase() === '.bib') continue;
      let text = fs.readFileSync(full, 'utf8');
      const before = text;
      text = text.replace(/\\(input|include|includegraphics|bibliography|addbibresource)(\[[^\]]*\])?\{([^}]+)\}/g, (whole, command, options, argument) => {
        const raw = argument.trim().replace(/^\.\//, '').replace(/\\/g, '/');
        if (!(raw === oldRel || raw.startsWith(oldRel + '/'))) return whole;
        const suffix = raw.slice(oldRel.length);
        return `\\${command}${options || ''}{${newRel}${suffix}}`;
      });
      text = text.replace(/\\(?:input|include)\{([^}]+)\}/g, (whole, argument) => {
        const raw = argument.trim().replace(/^\.\//, '').replace(/\\/g, '/');
        if (!(raw === oldRel || raw.startsWith(oldRel + '/'))) return whole;
        return `\\input{${newRel}${raw.slice(oldRel.length)}}`;
      });
      if (text !== before) {
        fs.writeFileSync(full, text, 'utf8');
        updated += 1;
      }
    }
  };
  visit(root, 0);
  return { path: newDir, oldPath: oldDir, updated, oldRelative: oldRel, newRelative: newRel };
}

function renameProjectFile(projectRoot, file, nextName) {
  const root = path.resolve(projectRoot);
  const oldPath = path.resolve(file);
  if (!oldPath.startsWith(root + path.sep)) throw new Error('File is outside the project');
  const safeName = String(nextName || '').trim();
  if (!safeName || /[\\/]/.test(safeName) || safeName === '.' || safeName === '..') throw new Error('Invalid file name');
  let name = safeName;
  if (!path.extname(name)) name += path.extname(oldPath);
  const newPath = path.join(path.dirname(oldPath), name);
  if (fs.existsSync(newPath)) throw new Error('A file with that name already exists');
  fs.renameSync(oldPath, newPath);
  rebaseConfiguredRoot(root, oldPath, newPath);

  const oldRelative = path.relative(root, oldPath).replace(/\\/g, '/');
  const newRelative = path.relative(root, newPath).replace(/\\/g, '/');
  const oldBase = oldRelative.replace(/\.(tex|ltx|bib)$/i, '');
  const newBase = newRelative.replace(/\.(tex|ltx|bib)$/i, '');
  let updated = 0;

  const visit = (dir, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { visit(full, depth + 1); continue; }
      if (!isTextFile(full) || path.extname(full).toLowerCase() === '.bib') continue;
      let text = fs.readFileSync(full, 'utf8');
      const before = text;
      text = text.replace(/\\(input|include|includegraphics|bibliography|addbibresource)(\[[^\]]*\])?\{([^}]+)\}/g, (whole, command, options, argument) => {
        const raw = argument.trim();
        const candidate = path.resolve(path.dirname(full), raw.endsWith('.tex') ? raw : raw);
        const candidateWithExt = path.extname(candidate) ? candidate : candidate + '.tex';
        const isTarget = candidateWithExt === oldPath || candidate === oldPath || path.resolve(path.dirname(full), raw) === oldPath;
        if (!isTarget) return whole;
        const extension = path.extname(oldPath);
        const nextRel = path.relative(path.dirname(full), newPath).replace(/\\/g, '/');
        const nextArg = command === 'bibliography' || command === 'addbibresource'
          ? nextRel.replace(/\.bib$/i, '')
          : nextRel;
        return `\\${command}${options || ''}{${nextArg}}`;
      });
      if (text !== before) {
        fs.writeFileSync(full, text, 'utf8');
        updated += 1;
      }
    }
  };
  visit(root, 0);
  return { path: newPath, oldPath, updated, oldRelative, newRelative };
}


async function renderTemplatePreview({ source, engine, cacheDir }) {
  const text = String(source || '');
  if (!/\\documentclass\b/.test(text) || text.length > 400000) return { ok: false, error: 'Invalid template source' };
  const dir = path.resolve(cacheDir || path.join(require('node:os').tmpdir(), 'texpro-template-previews'));
  fs.mkdirSync(dir, { recursive: true });
  const hash = crypto.createHash('sha256').update(text + '\n' + engine).digest('hex').slice(0, 24);
  const pngPath = path.join(dir, hash + '.png');
  if (fs.existsSync(pngPath)) return { ok: true, path: pngPath, cached: true, dataUrl: 'data:image/png;base64,' + fs.readFileSync(pngPath).toString('base64') };
  const work = path.join(dir, 'build-' + hash);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const texPath = path.join(work, 'main.tex');
  fs.writeFileSync(texPath, text, 'utf8');
  const resolvedEngine = ['pdflatex', 'xelatex', 'lualatex'].includes(engine) ? engine : 'pdflatex';
  const compile = await runLatexOnce(
    resolvedEngine,
    ['-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', '-output-directory=' + work, texPath],
    work,
    90000,
  );
  const pdfPath = path.join(work, 'main.pdf');
  if (compile.code !== 0 || !fs.existsSync(pdfPath)) {
    let log = compile.stdout + '\n' + compile.stderr;
    try { log = fs.readFileSync(path.join(work, 'main.log'), 'utf8'); } catch { /* keep stdout */ }
    return { ok: false, error: log.split('\n').find((line) => line.startsWith('!')) || 'Template compile failed', log: log.slice(-5000), engine: resolvedEngine };
  }
  const raster = await runLatexOnce(
    'sips',
    ['-s', 'format', 'png', '--resampleWidth', '900', pdfPath, '--out', pngPath],
    work,
    30000,
  );
  if (raster.code !== 0 || !fs.existsSync(pngPath)) {
    return { ok: false, error: 'Could not rasterize template preview', log: (raster.stdout + raster.stderr).slice(-3000) };
  }
  return { ok: true, path: pngPath, cached: false, engine: resolvedEngine, dataUrl: 'data:image/png;base64,' + fs.readFileSync(pngPath).toString('base64') };
}


async function createArxivPackage(projectRoot) {
  const root = path.resolve(projectRoot);
  const rootFile = findRootFile(root);
  if (!rootFile) throw new Error(resolveProjectRoot(root).rootError);
  const exportsDir = path.join(root, '.texpro', 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'texpro-arxiv-'));
  const skip = new Set(['.texpro', '.git', '.hg', '.svn', 'node_modules', 'build', 'out', 'dist']);
  const aux = /\.(aux|log|out|toc|lof|lot|fls|fdb_latexmk|synctex|synctex\.gz|synctex\(busy\)|bcf|run\.xml|blg|nav|snm|vrb)$/i;
  let files = 0;
  const visit = (dir, target) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || skip.has(entry.name) || aux.test(entry.name)) continue;
      const from = path.join(dir, entry.name);
      const to = path.join(target, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        visit(from, to);
      } else if (entry.isFile()) {
        fs.copyFileSync(from, to);
        files += 1;
      }
    }
  };
  visit(root, work);
  const rootName = path.relative(root, rootFile).replaceAll('\\', '/');
  const engine = detectEngine(fs.readFileSync(rootFile, 'utf8'));
  fs.writeFileSync(path.join(work, 'README.txt'), `TeXPro arXiv package\nRoot: ${rootName}\nCompile from the project folder: latexmk -${engine === 'xelatex' ? 'xelatex' : engine === 'lualatex' ? 'lualatex' : 'pdf'} "${rootName}"\nEngine: ${engine}\nCreated: ${new Date().toISOString()}\n`, 'utf8');
  const zipName = `arxiv-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  const zipPath = path.join(exportsDir, zipName);
  try {
    await execFileAsync('/usr/bin/zip', ['-r', '-X', zipPath, '.'], { cwd: work, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return { ok: true, zipPath, files, engine, rootFile: rootName, size: fs.statSync(zipPath).size };
}


function collectProjectGraph(projectRoot) {
  const root = path.resolve(projectRoot);
  const nodes = new Map();
  const edges = [];
  const files = [];
  const visit = (dir, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full, depth + 1);
      else if (entry.isFile() && /\.(tex|ltx)$/i.test(entry.name)) files.push(full);
    }
  };
  visit(root, 0);
  const fileId = (file) => 'file:' + path.relative(root, file).replace(/\\/g, '/');
  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    nodes.set(fileId(file), { id: fileId(file), type: 'file', label: rel, file, line: 1 });
  }
  const addNode = (id, type, label, file, line) => {
    if (!nodes.has(id)) nodes.set(id, { id, type, label, file, line });
  };
  for (const file of files) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const lineOf = (index) => text.slice(0, index).split('\n').length;
    for (const match of text.matchAll(/\\label\{([^}]+)\}/g)) {
      const key = match[1].trim();
      const id = 'label:' + key;
      addNode(id, 'label', key, file, lineOf(match.index || 0));
      edges.push({ from: fileId(file), to: id, type: 'defines' });
    }
    for (const match of text.matchAll(/\\(?:ref|eqref|autoref|pageref|cref|Cref)\{([^}]+)\}/g)) {
      const key = match[1].trim();
      const id = 'label:' + key;
      addNode(id, 'label', key, file, lineOf(match.index || 0));
      edges.push({ from: fileId(file), to: id, type: 'references' });
    }
    for (const match of text.matchAll(/\\(?:cite|citep|citet|parencite|textcite|autocite)\*?(?:\[[^\]]*\])*\{([^}]+)\}/g)) {
      for (const key of match[1].split(',').map((item) => item.trim()).filter(Boolean)) {
        const id = 'cite:' + key;
        addNode(id, 'citation', key, file, lineOf(match.index || 0));
        edges.push({ from: fileId(file), to: id, type: 'cites' });
      }
    }
    for (const match of text.matchAll(/\\(?:input|include)\{([^}]+)\}/g)) {
      const raw = match[1].trim();
      const target = path.resolve(path.dirname(file), raw.endsWith('.tex') ? raw : raw + '.tex');
      if (nodes.has(fileId(target))) edges.push({ from: fileId(file), to: fileId(target), type: 'includes' });
    }
  }
  for (const node of nodes.values()) {
    if (node.type === 'label' && !edges.some((edge) => edge.to === node.id && edge.type === 'references')) {
      node.orphan = true;
    }
  }
  return { nodes: [...nodes.values()], edges };
}


async function fontCoverage(projectRoot) {
  const root = path.resolve(projectRoot);
  const files = [];
  const visit = (dir, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full, depth + 1);
      else if (entry.isFile() && /\.(tex|ltx)$/i.test(entry.name)) files.push(full);
    }
  };
  visit(root, 0);
  let text = '';
  for (const file of files) { try { text += '\n' + fs.readFileSync(file, 'utf8'); } catch { /* ignore */ } }
  const scripts = {
    latin: (text.match(/[A-Za-z]/g) || []).length,
    cjk: (text.match(/[\u3400-\u9fff]/g) || []).length,
    greek: (text.match(/[\u0370-\u03ff]/g) || []).length,
    cyrillic: (text.match(/[\u0400-\u04ff]/g) || []).length,
    arabic: (text.match(/[\u0600-\u06ff]/g) || []).length,
    hebrew: (text.match(/[\u0590-\u05ff]/g) || []).length,
  };
  const declared = new Set();
  for (const match of text.matchAll(/\\(?:setmainfont|setsansfont|setmonofont|setCJKmainfont|setCJKsansfont|setCJKmonofont|newfontfamily\w*)(?:\[[^\]]*\])?\{([^}]+)\}/g)) declared.add(match[1].trim());
  const issues = [];
  const hasCjkSupport = /\\(?:documentclass(?:\[[^\]]*\])?\{ctex|usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:ctex|xeCJK)\b)/.test(text);
  const hasArabicSupport = /\\(?:usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:polyglossia|bidi)\b|setmainlanguage\{arabic\})/.test(text);
  if (scripts.cjk > 0 && !hasCjkSupport) issues.push({ severity: 'error', message: 'CJK text detected without ctex/xeCJK.', file: files[0] || '', line: 0 });
  if (scripts.arabic > 0 && !hasArabicSupport) issues.push({ severity: 'error', message: 'Arabic text detected without polyglossia/bidi.', file: files[0] || '', line: 0 });
  if (scripts.cjk > 0 && scripts.latin > 0 && hasCjkSupport) issues.push({ severity: 'info', message: 'Mixed CJK/Latin text; verify CJK font and Latin fallback.', file: files[0] || '', line: 0 });

  const fontChecks = [];
  for (const font of declared) {
    let resolved = '';
    try {
      const result = await execFileAsync('fc-match', ['--format=%{family}', font], { timeout: 3000, encoding: 'utf8' });
      resolved = result.stdout.trim();
    } catch { /* fc-match may not exist */ }
    const ok = !resolved || resolved.toLowerCase().includes(font.toLowerCase().split(' ')[0]) || resolved.toLowerCase().includes(font.toLowerCase());
    fontChecks.push({ name: font, resolved: resolved || 'unknown', ok });
    if (!ok) issues.push({ severity: 'warning', message: `Font may not match: ${font} -> ${resolved}`, file: files[0] || '', line: 0 });
  }

  const rootFile = findRootFile(root);
  const pdfPath = rootFile ? path.resolve(root, readConfig(root).directories?.build || '.texpro/build', path.basename(rootFile, path.extname(rootFile)) + '.pdf') : null;
  const pdfFonts = [];
  if (pdfPath && fs.existsSync(pdfPath)) {
    try {
      const result = await execFileAsync('pdffonts', [pdfPath], { timeout: 5000, encoding: 'utf8' });
      const lines = result.stdout.split('\n');
      for (const line of lines.slice(2)) {
        const match = line.match(/^(.+?)\s{2,}(\S+)\s+(yes|no)\s+(yes|no)\s+(yes|no)/i);
        if (match) pdfFonts.push({ name: match[1].trim(), type: match[2], embedded: match[3].toLowerCase() === 'yes', unicode: match[5].toLowerCase() === 'yes' });
      }
    } catch { /* pdffonts missing */ }
  }
  for (const font of pdfFonts) {
    if (!font.embedded) issues.push({ severity: 'warning', message: `PDF font not embedded: ${font.name}`, file: pdfPath || '', line: 0 });
  }
  return { scripts, declared: [...declared], fontChecks, pdfFonts, issues, pdfPath };
}


async function backupProject(projectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const type = String(options.type || 'icloud');
  const work = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'texpro-backup-'));
  const skip = new Set(['.git', '.hg', '.svn', 'node_modules', 'build', 'out', 'dist']);
  const copy = (current, target) => {
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || skip.has(entry.name)) continue;
      const from = path.join(current, entry.name);
      const to = path.join(target, entry.name);
      if (entry.isDirectory()) { fs.mkdirSync(to, { recursive: true }); copy(from, to); }
      else if (entry.isFile()) fs.copyFileSync(from, to);
    }
  };
  copy(root, work);
  const metaDir = path.join(work, '.texpro');
  fs.mkdirSync(metaDir, { recursive: true });
  for (const name of ['project.json', 'comments.json']) {
    const source = path.join(root, '.texpro', name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(metaDir, name));
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipPath = path.join(work, `${path.basename(root)}-${stamp}.zip`);
  await execFileAsync('/usr/bin/zip', ['-r', '-X', zipPath, '.'], { cwd: work, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const size = fs.statSync(zipPath).size;
  if (type === 'icloud') {
    const destination = String(options.destination || path.join(require('node:os').homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'TeXPro Backups')).replace(/^~(?=$|\/)/, require('node:os').homedir());
    fs.mkdirSync(destination, { recursive: true });
    const target = path.join(destination, path.basename(zipPath));
    fs.copyFileSync(zipPath, target);
    fs.rmSync(work, { recursive: true, force: true });
    return { ok: true, target, kind: 'icloud', size };
  }
  if (type === 'webdav') {
    const url = String(options.url || '');
    if (!/^https?:\/\//i.test(url)) throw new Error('WebDAV URL must start with http(s)://');
    const headers = { 'Content-Type': 'application/zip' };
    if (options.username) headers.Authorization = 'Basic ' + Buffer.from(`${options.username}:${options.password || ''}`).toString('base64');
    const response = await fetch(url, { method: 'PUT', headers, body: fs.readFileSync(zipPath), signal: AbortSignal.timeout(120000) });
    fs.rmSync(work, { recursive: true, force: true });
    if (!response.ok) throw new Error(`WebDAV returned ${response.status}`);
    return { ok: true, target: url, kind: 'webdav', size };
  }
  if (type === 'ssh') {
    const host = String(options.host || '').trim();
    const user = String(options.user || '').trim();
    const remote = String(options.remotePath || '').trim();
    if (!host || !remote) throw new Error('SSH host and remote path are required');
    const destination = `${user ? user + '@' : ''}${host}`;
    const port = String(options.port || '22');
    const key = String(options.keyPath || '').trim();
    const remoteForShell = remote.startsWith('~/') ? '$HOME/' + remote.slice(2) : remote;
    const sshArgs = ['-p', port, ...(key ? ['-i', key] : []), destination, `mkdir -p ${JSON.stringify(remoteForShell)}`];
    await execFileAsync('ssh', sshArgs, { timeout: 30000 });
    const scpArgs = ['-P', port, ...(key ? ['-i', key] : []), zipPath, `${destination}:${remote.replace(/\/$/, '')}/`];
    await execFileAsync('scp', scpArgs, { timeout: 120000 });
    fs.rmSync(work, { recursive: true, force: true });
    return { ok: true, target: `${destination}:${remote}`, kind: 'ssh', size };
  }
  throw new Error('Unknown backup type: ' + type);
}


function projectImpact(root, target) {
  const resolved = path.resolve(root, target);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('Path is outside the project');
  const stat = fs.statSync(resolved);
  const affected = [];
  if (stat.isDirectory()) {
    const visit = (dir, depth) => {
      if (depth > 6) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(full, depth + 1);
        else if (entry.isFile()) affected.push(full);
      }
    };
    visit(resolved, 0);
  } else {
    affected.push(resolved);
  }
  const assets = affected.filter((file) => ASSET_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const textFiles = [];
  const collect = (dir, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full, depth + 1);
      else if (entry.isFile() && isTextFile(full) && path.extname(full).toLowerCase() !== '.bib') textFiles.push(full);
    }
  };
  collect(root, 0);
  let references = 0;
  for (const file of textFiles) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const match of text.matchAll(/\\(?:input|include|includegraphics|bibliography|addbibresource|lstinputlisting|includepdf)(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
      const raw = match[1].trim().replace(/^\.\//, '');
      const candidate = path.resolve(path.dirname(file), raw.endsWith('.tex') ? raw : raw);
      const withExt = path.extname(candidate) ? candidate : candidate + '.tex';
      if (affected.some((item) => item === candidate || item === withExt || item.startsWith(resolved + path.sep))) references += 1;
    }
  }
  return { files: affected.length, assets: assets.length, references };
}

function moveProjectFile(projectRoot, file, targetDir) {
  const root = path.resolve(projectRoot);
  const oldPath = path.resolve(file);
  const destinationDir = path.resolve(targetDir);
  if (!oldPath.startsWith(root + path.sep)) throw new Error('File is outside the project');
  if (!destinationDir.startsWith(root)) throw new Error('Target folder is outside the project');
  if (!fs.existsSync(destinationDir) || !fs.statSync(destinationDir).isDirectory()) throw new Error('Target folder does not exist');
  const newPath = path.join(destinationDir, path.basename(oldPath));
  if (fs.existsSync(newPath)) throw new Error('A file with that name already exists in the target folder');
  fs.renameSync(oldPath, newPath);
  rebaseConfiguredRoot(root, oldPath, newPath);
  let updated = 0;
  const visit = (dir, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { visit(full, depth + 1); continue; }
      if (!isTextFile(full) || path.extname(full).toLowerCase() === '.bib') continue;
      let text = fs.readFileSync(full, 'utf8');
      const before = text;
      text = text.replace(/\\(input|include|includegraphics|bibliography|addbibresource|lstinputlisting|includepdf)(\[[^\]]*\])?\{([^}]+)\}/g, (whole, command, options, argument) => {
        const raw = argument.trim().replace(/^\.\//, '');
        const candidate = path.resolve(path.dirname(full), raw.endsWith('.tex') ? raw : raw);
        const withExt = path.extname(candidate) ? candidate : candidate + '.tex';
        if (candidate !== oldPath && withExt !== oldPath) return whole;
        let nextArg = path.relative(path.dirname(full), newPath).replace(/\\/g, '/');
        if (!path.extname(raw) && (command === 'input' || command === 'include')) nextArg = nextArg.replace(/\.tex$/i, '');
        return `\\${command}${options || ''}{${nextArg}}`;
      });
      if (text !== before) { fs.writeFileSync(full, text, 'utf8'); updated += 1; }
    }
  };
  visit(root, 0);
  return { path: newPath, oldPath, updated, oldRelative: path.relative(root, oldPath), newRelative: path.relative(root, newPath) };
}

function projectCreationParent(projectRoot, parent) {
  const root = path.resolve(projectRoot), dir = path.resolve(root, parent || '.');
  if (dir !== root && !dir.startsWith(root + path.sep)) throw new Error('Parent is outside the project');
  const realRoot = fs.realpathSync(root), realDir = fs.realpathSync(dir);
  if (realDir !== realRoot && !realDir.startsWith(realRoot + path.sep)) throw new Error('Parent is outside the project');
  if (!fs.statSync(realDir).isDirectory()) throw new Error('Parent is not a directory');
  return dir;
}

function validCreationName(name) {
  const safe = String(name || '').trim();
  if (!safe || /[\\/<>:"|?*\x00-\x1f]/.test(safe) || safe === '.' || safe === '..' || safe.endsWith('.') || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(safe)) throw new Error('Invalid file or folder name');
  return safe;
}

function createProjectFolder(projectRoot, parent, name) {
  const root = path.resolve(projectRoot), parentDir = projectCreationParent(root, parent);
  const target = path.join(parentDir, validCreationName(name));
  if (fs.existsSync(target)) throw new Error('Folder already exists');
  fs.mkdirSync(target, { recursive: false });
  return { path: target, relative: path.relative(root, target) };
}

function createProjectFile(projectRoot, parent, name, content = '') {
  const root = path.resolve(projectRoot), parentDir = projectCreationParent(root, parent);
  let safe = validCreationName(name);
  if (!path.extname(safe)) safe += '.tex';
  const target = path.join(parentDir, safe);
  if (fs.existsSync(target)) throw new Error('File already exists');
  fs.writeFileSync(target, content, { encoding: 'utf8', flag: 'wx' });
  return { path: target, relative: path.relative(root, target) };
}

function trashPath(root, source) {
  const trash = path.join(root, '.texpro', 'trash');
  fs.mkdirSync(trash, { recursive: true });
  return path.join(trash, `${new Date().toISOString().replace(/[:.]/g, '-')}-${path.basename(source)}`);
}

function deleteProjectFile(projectRoot, file) {
  const root = path.resolve(projectRoot);
  const target = path.resolve(file);
  if (!target.startsWith(root + path.sep)) throw new Error('File is outside the project');
  const destination = trashPath(root, target);
  fs.renameSync(target, destination);
  return { ok: true, destination, relative: path.relative(root, target) };
}

function deleteProjectFolder(projectRoot, dir) {
  const root = path.resolve(projectRoot);
  const target = path.resolve(dir);
  if (!target.startsWith(root + path.sep)) throw new Error('Folder is outside the project');
  const destination = trashPath(root, target);
  fs.renameSync(target, destination);
  return { ok: true, destination };
}


async function rasterizeSvg(projectRoot, file) {
  const root = path.resolve(projectRoot);
  const source = path.resolve(file);
  if (!source.startsWith(root + path.sep)) throw new Error('SVG is outside the project');
  if (path.extname(source).toLowerCase() !== '.svg') throw new Error('Not an SVG file');
  const cache = path.join(root, '.texpro', 'svg-cache');
  fs.mkdirSync(cache, { recursive: true });
  const hash = crypto.createHash('sha256').update(source).update(String(fs.statSync(source).mtimeMs)).digest('hex').slice(0, 20);
  const target = path.join(cache, hash + '.png');
  if (!fs.existsSync(target)) {
    const result = await runLatexOnce('sips', ['-s', 'format', 'png', '--resampleWidth', '1800', source, '--out', target], root, 30000);
    if (result.code !== 0 || !fs.existsSync(target)) throw new Error('Could not rasterize SVG');
  }
  const stat = fs.statSync(target);
  return {
    path: target,
    relative: path.relative(root, target),
    name: path.basename(source, path.extname(source)) + '.png',
    ext: '.png',
    size: stat.size,
    modified: stat.mtimeMs,
  };
}


async function convertSvgReferences(projectRoot) {
  const root = path.resolve(projectRoot);
  let converted = 0;
  let updatedFiles = 0;
  const visit = async (dir, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await visit(full, depth + 1); continue; }
      if (!isTextFile(full) || path.extname(full).toLowerCase() === '.bib') continue;
      let text = fs.readFileSync(full, 'utf8');
      const before = text;
      const matches = [...text.matchAll(/\\(?:includegraphics|includesvg)(?:\[[^\]]*\])?\{([^}]+)\}/g)];
      for (const match of matches) {
        const argument = match[1].trim();
        const resolved = path.resolve(path.dirname(full), argument);
        if (path.extname(resolved).toLowerCase() !== '.svg' || !fs.existsSync(resolved)) continue;
        const png = await rasterizeSvg(root, resolved);
        const replacement = path.relative(path.dirname(full), png.path).replace(/\\/g, '/');
        text = text.replace(match[0], `\\includegraphics${match[0].includes('[') ? match[0].slice(match[0].indexOf('['), match[0].indexOf(']') + 1) : ''}{${replacement}}`);
        converted += 1;
      }
      if (text !== before) { fs.writeFileSync(full, text, 'utf8'); updatedFiles += 1; }
    }
  };
  await visit(root, 0);
  return { converted, updatedFiles };
}


async function zoteroLibrary() {
  const response = await fetch('http://127.0.0.1:23119/better-bibtex/export/library?/1/library.bibtex', {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Zotero / Better BibTeX returned ${response.status}`);
  const text = await response.text();
  if (!text.includes('@')) throw new Error('Zotero did not return BibTeX. Is Better BibTeX installed and running?');
  return { content: text, bytes: Buffer.byteLength(text) };
}


async function zoteroSearch(query) {
  const term = String(query || '').trim();
  if (!term) return { results: [] };
  const response = await fetch('http://127.0.0.1:23119/better-bibtex/json-rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'item.search', params: [term], id: 1 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Zotero / Better BibTeX returned ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'Zotero search failed');
  const results = (payload.result || []).slice(0, 25).map((item) => ({
    key: item['citation-key'] || item.citekey || item.key || '',
    title: item.title || item['title'] || '(untitled)',
    doi: item.DOI || item.doi || '',
    author: Array.isArray(item.author) ? item.author.map((author) => `${author.family || ''} ${author.given || ''}`.trim()).join(', ') : String(item.author || ''),
    year: item.year || item.date || '',
  })).filter((item) => item.key);
  return { results };
}


async function zoteroBibtex(key) {
  const wanted = String(key || '').trim();
  if (!wanted) throw new Error('Citation key is required');
  const library = await zoteroLibrary();
  const text = library.content;
  const startMatch = new RegExp('@[A-Za-z]+\\{\\s*' + wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*,').exec(text);
  if (!startMatch) throw new Error('Zotero entry not found: ' + wanted);
  let depth = 0;
  let started = false;
  for (let index = startMatch.index; index < text.length; index++) {
    if (text[index] === '{') { depth += 1; started = true; }
    if (text[index] === '}') {
      depth -= 1;
      if (started && depth === 0) return { key: wanted, content: text.slice(startMatch.index, index + 1) };
    }
  }
  throw new Error('Could not parse Zotero entry');
}


async function checkTexAssets(packages = [], classes = []) {
  const results = { packages: {}, classes: {} };
  const files = [
    ...packages.map((name) => ({ name, file: name + '.sty', bucket: 'packages' })),
    ...classes.map((name) => ({ name, file: name + '.cls', bucket: 'classes' })),
  ];
  for (const item of files) results[item.bucket][item.name] = { installed: false, path: '' };
  try {
    const result = await execFileAsync(resolveTexBinary('kpsewhich'), files.map((item) => item.file), { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    const found = new Map(result.stdout.split('\n').filter(Boolean).map((line) => [path.basename(line.trim()), line.trim()]));
    for (const item of files) {
      const file = found.get(item.file);
      if (file) results[item.bucket][item.name] = { installed: true, path: file };
    }
  } catch {
    // Keep the per-file fallback for TeX distributions with unusual kpsewhich behavior.
    const lookup = async (name, extension) => {
      try {
        const result = await execFileAsync(resolveTexBinary('kpsewhich'), [name + extension], { timeout: 5000 });
        const found = result.stdout.trim();
        return found ? { installed: true, path: found } : { installed: false, path: '' };
      } catch {
        return { installed: false, path: '' };
      }
    };
    await Promise.all(files.map(async (item) => { results[item.bucket][item.name] = await lookup(item.name, path.extname(item.file)); }));
  }
  return results;
}


async function runProjectAction(projectRoot, action, rootFile) {
  const root = path.resolve(projectRoot);
  if (!action || typeof action.command !== 'string' || !action.command.trim()) throw new Error('Action command is empty');
  const command = String(action.command).replace(/^txs:\/\/\//, '');
  const args = Array.isArray(action.args) ? action.args.map(String) : [];
  const cwd = action.cwd ? path.resolve(root, String(action.cwd)) : root;
  if (cwd !== root && !cwd.startsWith(root + path.sep)) throw new Error('Action working directory must stay inside the project');
  const rootPath = resolveCompileRoot(projectRoot, null, rootFile);
  const rootName = path.basename(rootPath, path.extname(rootPath));
  const buildPath = path.resolve(root, readConfig(root).directories?.build || '.texpro/build');
  if (!buildPath.startsWith(root + path.sep)) throw new Error('Build directory must stay inside the project');
  fs.mkdirSync(buildPath, { recursive: true });
  const expanded = args.map((arg) => arg
    .replaceAll('{rootFile}', path.relative(cwd, rootPath))
    .replaceAll('{rootName}', rootName)
    .replaceAll('{buildDir}', path.relative(cwd, buildPath))
    .replaceAll('{projectRoot}', path.relative(cwd, root) || '.'));
  const texBinaries = new Set(['latexmk', 'pdflatex', 'xelatex', 'lualatex', 'bibtex', 'biber', 'makeindex']);
  const executable = texBinaries.has(command) ? resolveTexBinary(command) : command;
  return new Promise((resolve) => {
    const child = spawn(executable, expanded, {
      cwd,
      env: { ...process.env, ...(action.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 180000);
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-200000); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-200000); });
    child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, code: null, stdout, stderr: stderr + String(error), timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0 && !timedOut, code, stdout, stderr, timedOut }); });
  });
}


async function scanCwlSources(projectRoot) {
  const roots = [];
  if (projectRoot) roots.push(path.join(projectRoot, '.texpro'));
  const home = require('node:os').homedir();
  if (process.platform === 'darwin') {
    roots.push(path.join(home, 'Library', 'Application Support', 'texstudio', 'completion'));
  } else if (process.platform === 'win32') {
    roots.push(path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'texstudio', 'completion'));
  } else {
    roots.push(path.join(home, '.config', 'texstudio', 'completion'));
  }
  const files = [];
  const visit = (dir, depth) => {
    if (depth > 4 || files.length >= 80) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (files.length >= 80) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { visit(full, depth + 1); continue; }
      if (!entry.name.toLowerCase().endsWith('.cwl')) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.size > 2_000_000) continue;
        files.push({ path: full, name: entry.name, content: fs.readFileSync(full, 'utf8') });
      } catch { /* ignore unreadable */ }
    }
  };
  for (const root of roots) visit(root, 0);
  return files;
}

function resolveTexBinary(name) {
  const candidates = [
    '/Library/TeX/texbin/' + name,
    '/usr/local/texlive/2025/bin/universal-darwin/' + name,
    '/usr/local/texlive/2024/bin/universal-darwin/' + name,
    '/opt/homebrew/bin/' + name,
    '/usr/local/bin/' + name,
    name,
  ];
  for (const candidate of candidates) {
    if (candidate === name) return candidate;
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // continue
    }
  }
  return name;
}

function texEnvironment(projectRoot) {
  const pathEntries = [
    '/Library/TeX/texbin',
    '/usr/local/texlive/2025/bin/universal-darwin',
    '/usr/local/texlive/2024/bin/universal-darwin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ];
  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const merged = [...new Set([...pathEntries, ...current])].join(path.delimiter);
  const env = {
    ...process.env,
    PATH: merged,
    LC_ALL: 'en_US.UTF-8',
    LANG: 'en_US.UTF-8',
    max_print_line: '10000',
  };
  if (projectRoot) {
    const cache = path.join(projectRoot, '.texpro', 'texmf-cache');
    try {
      fs.mkdirSync(cache, { recursive: true });
      env.TEXMFCACHE = cache;
      env.TEXMFVAR = cache;
    } catch {
      // keep the inherited cache settings
    }
  }
  return env;
}

function detectEngine(text, requested) {
  const magic = text.match(/^\s*%\s*!TEX\s+program\s*=\s*(\w+)/im);
  const value = (magic?.[1] || '').toLowerCase();
  if (value === 'xelatex' || value === 'lualatex' || value === 'pdflatex') return value;
  if (/\\documentclass(?:\[[^\]]*\])?\{(?:ltjs|luatexja)|\\usepackage(?:\[[^\]]*\])?\{luatexja\}/.test(text)) return 'lualatex';
  if (/\\documentclass(?:\[[^\]]*\])?\{ctex|\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:ctex|xeCJK|fontspec|polyglossia)\b|\\setCJKmainfont/.test(text)) return 'xelatex';
  if (requested && ['pdflatex', 'xelatex', 'lualatex'].includes(requested)) return requested;
  return 'pdflatex';
}


function cleanLogText(text) {
  return text.replace(/\r\n/g, '\n').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

function parseDiagnostics(logText, rootFile, projectRoot) {
  const text = cleanLogText(logText || '');
  const diagnostics = [];
  const seen = new Set();
  const push = (item) => {
    const key = `${item.severity}:${item.line || 0}:${item.message}`;
    if (seen.has(key) || diagnostics.length > 250) return;
    seen.add(key);
    diagnostics.push(item);
  };

  const fileLineError = /^(?:\.\/)?([^:\n]+\.(?:tex|ltx|sty|cls|bib)):(\d+):\s*(?:LaTeX Error:\s*)?(.+)$/gm;
  for (const m of text.matchAll(fileLineError)) {
    const message = m[3].trim();
    if (/^LaTeX Warning/.test(message)) continue;
    push({
      severity: 'error',
      file: path.isAbsolute(m[1]) ? m[1] : path.resolve(projectRoot, m[1]),
      line: Number(m[2]),
      message,
      source: 'latex',
    });
  }

  const bangBlocks = text.split(/\n(?=!\s)/);
  for (const block of bangBlocks) {
    if (!/^!\s/.test(block)) continue;
    const first = block.split('\n')[0].replace(/^!\s*/, '').trim();
    if (!first || /^==>/.test(first)) continue;
    const lineMatch = block.match(/^l\.(\d+)/m);
    let file = rootFile;
    const fileMatch = block.match(/^([^\n:]+\.(?:tex|ltx))(?::|\s)/m);
    if (fileMatch) {
      const candidate = path.isAbsolute(fileMatch[1]) ? fileMatch[1] : path.resolve(projectRoot, fileMatch[1]);
      if (fs.existsSync(candidate)) file = candidate;
    }
    push({
      severity: 'error',
      file,
      line: lineMatch ? Number(lineMatch[1]) : undefined,
      message: first,
      source: 'latex',
    });
  }

  const warnings = /(?:LaTeX|Package|Class)\s+(?:[^\n]*?)\s*Warning:\s*([^\n]+)(?:\s+on input line\s+(\d+))?/g;
  for (const m of text.matchAll(warnings)) {
    push({
      severity: 'warning',
      file: rootFile,
      line: m[2] ? Number(m[2]) : undefined,
      message: m[1].trim(),
      source: 'latex',
    });
  }

  const boxes = /(Overfull|Underfull)\s+\\[hv]box\s+\(([^)]*)\)[^\n]*?(?:at lines?\s+(\d+)(?:--(\d+))?)?/g;
  for (const m of text.matchAll(boxes)) {
    const amount = Number((m[2].match(/([\d.]+)pt/) || [])[1] || 0) || undefined;
    push({
      severity: 'info',
      file: rootFile,
      line: m[3] ? Number(m[3]) : undefined,
      message: `${m[1]} ${m[2]}`,
      source: 'typeset',
      box: m[1].toLowerCase(),
      amount,
    });
  }

  const missing = /File `([^']+)' not found/g;
  for (const m of text.matchAll(missing)) {
    push({
      severity: 'error',
      file: rootFile,
      message: `File not found: ${m[1]}`,
      source: 'latex',
    });
  }

  return diagnostics.sort((a, b) => (a.line || 1e9) - (b.line || 1e9));
}

function parseWarningsFromStdout(stdout) {
  const diagnostics = [];
  for (const line of cleanLogText(stdout).split('\n')) {
    if (/^!|^.*:\d+:/.test(line)) {
      diagnostics.push({ severity: 'error', message: line.trim(), source: 'latex' });
    }
  }
  return diagnostics;
}

let activeCompilation = null;
const compilations = new Map();

function killProcessTree(child, signal) {
  if (!child) return;
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // fall back to the direct child
    }
  }
  try {
    child.kill(signal);
  } catch {
    // already gone
  }
}

function cancelCompilation(runId) {
  const controller = runId ? compilations.get(runId) : activeCompilation;
  if (!controller) return { ok: false, error: 'No matching compilation is running' };
  controller.cancelled = true;
  killProcessTree(controller.child, 'SIGTERM');
  const child = controller.child;
  setTimeout(() => killProcessTree(child, 'SIGKILL'), 2200);
  return { ok: true };
}

async function runCompile({ projectRoot, activeFile, fallbackRoot, engine, timeoutMs = 180000, runId, buildDir: buildDirOption, onData, isolated = false }) {
  const started = Date.now();
  let rootFile;
  try { rootFile = resolveCompileRoot(projectRoot, activeFile, fallbackRoot); }
  catch (error) { return { ok: false, error: error.message, diagnostics: [], duration: 0 }; }
  if (!rootFile) {
    return {
      ok: false,
      error: 'No LaTeX root file found. Add a file containing \\documentclass or a % !TeX root comment.',
      diagnostics: [],
      duration: 0,
    };
  }
  let rootText = '';
  try {
    rootText = fs.readFileSync(rootFile, 'utf8');
  } catch {
    // ignore
  }
  const selectedEngine = detectEngine(rootText, engine);
  const buildDir = path.resolve(projectRoot, readConfig(projectRoot).directories?.build || buildDirOption || '.texpro/build');
  if (!buildDir.startsWith(path.resolve(projectRoot) + path.sep)) {
    return { ok: false, error: 'Build directory must stay inside the project', diagnostics: [], duration: 0 };
  }
  fs.mkdirSync(buildDir, { recursive: true });
  const pdfPath = path.join(buildDir, path.basename(rootFile, path.extname(rootFile)) + '.pdf');
  const logPath = path.join(buildDir, path.basename(rootFile, path.extname(rootFile)) + '.log');
  const latexmk = resolveTexBinary('latexmk');
  const engineFlag = selectedEngine === 'xelatex' ? '-xelatex' : selectedEngine === 'lualatex' ? '-lualatex' : '-pdf';
  const args = [
    engineFlag,
    '-synctex=1',
    '-interaction=nonstopmode',
    '-file-line-error',
    '-outdir=' + buildDir,
    path.relative(projectRoot, rootFile),
  ];

  if (onData) {
    onData({ stream: 'meta', text: `$ ${latexmk} ${args.join(' ')}\n`, engine: selectedEngine, rootFile });
  }

  const controller = { runId: runId || String(Date.now()), child: null, cancelled: false };
  if (!isolated) activeCompilation = controller;
  compilations.set(controller.runId, controller);
  const mx1Path = path.join(buildDir, path.basename(rootFile, path.extname(rootFile)) + '.mx1');
  let beforeMx1 = null;
  try { beforeMx1 = fs.readFileSync(mx1Path, 'utf8'); } catch { /* first music build */ }
  const runStage = (command, stageArgs, cwd) => new Promise((resolve) => {
    let child;
    let timer = null;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (code, signal, error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, error, timedOut, cancelled: controller.cancelled });
    };
    try {
      if (controller.cancelled) { finish(null, null, null); return; }
      child = spawn(resolveTexBinary(command), stageArgs, {
        cwd,
        env: texEnvironment(projectRoot),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
    } catch (error) {
      finish(null, null, error);
      return;
    }
    controller.child = child;
    if (controller.cancelled) killProcessTree(child, 'SIGTERM');
    timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child, 'SIGTERM');
      setTimeout(() => killProcessTree(child, 'SIGKILL'), 2500);
    }, Math.max(1, timeoutMs - (Date.now() - started)));

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onData) onData({ stream: 'stdout', text });
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onData) onData({ stream: 'stderr', text });
    });
    child.on('error', (error) => finish(null, null, error));
    child.on('close', (code, signal) => finish(code, signal, null));
  });

  let result;
  try {
    result = await runStage(latexmk, args, projectRoot);
    if (result.code === 0 && !result.cancelled && !result.timedOut) {
      const spacing = await musicSpacing({ buildDir, jobName: path.basename(rootFile, path.extname(rootFile)), before: beforeMx1,
        resolveScript: async () => {
          const found = await runLatexOnce('kpsewhich', ['musixflx.lua'], projectRoot, 10000);
          return found.code === 0 ? found.stdout.trim() : '';
        },
        run: (command, stageArgs, cwd) => {
          onData?.({ stream: 'meta', text: '$ texlua musixflx.lua — music spacing\n', rootFile });
          return runStage(command, stageArgs, cwd);
        },
      });
      if (spacing) {
        const firstOutput = result.stdout + '\n' + (spacing.stdout || '');
        if (spacing.code === 0 && !controller.cancelled && !spacing.timedOut) {
          onData?.({ stream: 'meta', text: '$ latexmk -g — apply music spacing\n', rootFile });
          result = await runStage(latexmk, ['-g', ...args], projectRoot);
          result.stdout = firstOutput + '\n' + result.stdout;
        } else result = { ...result, ...spacing, stdout: firstOutput, cancelled: controller.cancelled };
      }
    }
  } finally {
    compilations.delete(controller.runId);
    if (activeCompilation === controller) activeCompilation = null;
  }

  let log = '';
  try {
    log = fs.readFileSync(logPath, 'utf8');
  } catch {
    log = [result.stdout, result.stderr].filter(Boolean).join('\n');
  }
  let diagnostics = parseDiagnostics(log, rootFile, projectRoot);
  if (diagnostics.length === 0 && result.code !== 0) {
    diagnostics = parseWarningsFromStdout([result.stdout, result.stderr].join('\n'));
  }
  const pdfExists = fs.existsSync(pdfPath);
  const ok = result.code === 0 && pdfExists && !result.timedOut && !result.cancelled;
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const duration = Date.now() - started;

  return {
    ok,
    rootFile,
    pdfPath: pdfExists ? pdfPath : null,
    logPath,
    log,
    diagnostics,
    engine: selectedEngine,
    duration,
    exitCode: result.code,
    cancelled: Boolean(result.cancelled),
    error: result.cancelled
      ? 'Compilation cancelled.'
      : result.error
        ? String(result.error.message || result.error)
        : result.timedOut
          ? `Compilation timed out after ${Math.round(timeoutMs / 1000)}s`
          : !pdfExists && result.code === 0
            ? 'latexmk finished but no PDF was produced.'
            : null,
    warningCount: diagnostics.filter((d) => d.severity === 'warning').length,
    errorCount: errors.length,
    command: [latexmk, ...args].join(' '),
    stdout: result.stdout.slice(-12000),
    stderr: result.stderr.slice(-4000),
  };
}

async function renderMusicPreview({ projectRoot, source, runId }) {
  if (typeof source !== 'string' || source.length > 200000 || !/\\documentclass\b/.test(source)) throw new Error('Invalid music preview source');
  const key = crypto.createHash('sha256').update(source).digest('hex').slice(0, 24);
  const cache = path.join(projectRoot, '.texpro', 'music-previews');
  fs.mkdirSync(cache, { recursive: true });
  const pdf = path.join(cache, key + '.pdf');
  if (fs.existsSync(pdf)) return { ok: true, bytes: new Uint8Array(fs.readFileSync(pdf)) };
  // Separate jobs never share auxiliary files. Publish only successfully completed PDFs.
  const work = fs.mkdtempSync(path.join(cache, 'build-'));
  try {
    fs.writeFileSync(path.join(work, 'main.tex'), source, 'utf8');
    const result = await runCompile({ projectRoot: work, engine: /[\u3400-\u9fff]/.test(source) ? 'xelatex' : 'pdflatex', runId, timeoutMs: 45000, isolated: true });
    if (!result.ok) return { ok: false, error: result.error || result.diagnostics.find(d => d.severity === 'error')?.message || 'Music typesetting failed', log: result.log.slice(-6000) };
    const completed = path.join(work, 'complete.pdf');
    fs.copyFileSync(result.pdfPath, completed);
    fs.renameSync(completed, pdf);
    return { ok: true, bytes: new Uint8Array(fs.readFileSync(pdf)) };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function parseSynctexValue(text, key) {
  const re = new RegExp('^' + key + ':(.*)$', 'm');
  const match = text.match(re);
  return match ? match[1].trim() : null;
}

async function synctexForward({ projectRoot, texFile, pdfFile, line, column = 0 }) {
  const synctex = resolveTexBinary('synctex');
  const args = ['view', '-i', `${line}:${column}:${texFile}`, '-o', pdfFile];
  try {
    const { stdout } = await execFileAsync(synctex, args, {
      cwd: projectRoot,
      env: texEnvironment(),
      maxBuffer: 4 * 1024 * 1024,
      timeout: 12000,
    });
    const page = parseSynctexValue(stdout, 'Page');
    const x = parseSynctexValue(stdout, 'x');
    const y = parseSynctexValue(stdout, 'y');
    const h = parseSynctexValue(stdout, 'h');
    const v = parseSynctexValue(stdout, 'v');
    const width = parseSynctexValue(stdout, 'W');
    const height = parseSynctexValue(stdout, 'H');
    if (!page || !x || !y) return { ok: false, error: 'No SyncTeX result', raw: stdout };
    const box = { x: Number(h), y: Number(v) - Number(height), width: Number(width), height: Number(height) };
    const bounds = h !== null && v !== null && width !== null && height !== null && Object.values(box).every(Number.isFinite) && box.width > 0 && box.height > 0 ? box : undefined;
    return {
      ok: true,
      page: Number(page),
      x: Number(x),
      y: Number(y),
      h: h ? Number(h) : null,
      v: v ? Number(v) : null,
      width: width ? Number(width) : null,
      height: height ? Number(height) : null,
      bounds,
      raw: stdout,
    };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}

async function synctexInverse({ projectRoot, pdfFile, page, x, y }) {
  const synctex = resolveTexBinary('synctex');
  const args = ['edit', '-o', `${page}:${x}:${y}:${pdfFile}`];
  try {
    const { stdout } = await execFileAsync(synctex, args, {
      cwd: projectRoot,
      env: texEnvironment(),
      maxBuffer: 4 * 1024 * 1024,
      timeout: 12000,
    });
    const input = parseSynctexValue(stdout, 'Input');
    const line = parseSynctexValue(stdout, 'Line');
    const column = parseSynctexValue(stdout, 'Column');
    if (!input || !line) return { ok: false, error: 'No SyncTeX source result', raw: stdout };
    const realRoot = fs.realpathSync(projectRoot);
    const realInput = fs.realpathSync(path.resolve(projectRoot, input));
    if (!realInput.startsWith(realRoot + path.sep)) return { ok: false, error: 'SyncTeX source is outside the project' };
    const sourceFile = path.join(path.resolve(projectRoot), path.relative(realRoot, realInput));
    return {
      ok: true,
      file: sourceFile,
      line: Number(line),
      column: column && Number(column) > 0 ? Number(column) : 1,
      raw: stdout,
    };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}

module.exports = {
  renderMusicPreview,
  ...history,
  ...git,
  openProject,
  ensureDemoProject,
  readTextFile,
  statFile,
  writeTextFile,
  collectProjectSymbols,
  searchProject,
  cancelCompilation,
  diagnoseProject,
  lookupBibtex,
  renderTemplatePreview,
  createArxivPackage,
  rasterizeSvg,
  convertSvgReferences,
  zoteroLibrary,
  zoteroSearch,
  zoteroBibtex,
  checkTexAssets,
  runProjectAction,
  scanCwlSources,
  collectProjectGraph,
  projectImpact,
  moveProjectFile,
  createProjectFolder,
  createProjectFile,
  deleteProjectFile,
  deleteProjectFolder,
  fontCoverage,
  backupProject,
  renameProjectFile,
  moveProjectDirectory,
  cleanBuild,
  collectAssets,
  importAssets,
  saveImageBuffer,
  renderTikz,
  deleteAsset,
  listUserTemplates,
  saveUserTemplate,
  deleteUserTemplate,
  runCompile,
  resolveRoot: resolveCompileRoot,
  synctexForward,
  synctexInverse,
  findRootFile,
  isTextFile,
  resolveTexBinary,
};
