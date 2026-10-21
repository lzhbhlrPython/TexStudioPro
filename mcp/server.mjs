#!/usr/bin/env node
/**
 * TeXPro MCP server.
 *
 * MCP stdio transport: one JSON-RPC message per line on stdin/stdout.
 * Logs go to stderr.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tex = require('../electron/services/tex.cjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '0.1.0';
const IGNORED = new Set(['.git', '.texpro', 'node_modules', 'dist', 'build', 'out', '.DS_Store']);
const projectState = { root: null, tree: null, rootFile: null, rootCandidates: [], rootSource: null, rootError: null, lastCompile: null, lastCompilePdf: null };

function log(...args) {
  process.stderr.write('[texpro-mcp] ' + args.join(' ') + '\n');
}

function setProject(root) {
  const resolved = path.resolve(String(root || ''));
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error('Project root is not a directory: ' + resolved);
  const opened = tex.openProject(resolved);
  if (projectState.root !== resolved || projectState.rootFile !== opened.rootFile) {
    projectState.lastCompile = null; projectState.lastCompilePdf = null;
  }
  projectState.rootCandidates = opened.rootCandidates;
  projectState.rootSource = opened.rootSource;
  projectState.rootError = opened.rootError;
  projectState.root = resolved;
  projectState.tree = opened.tree;
  projectState.rootFile = opened.rootFile;
  return opened;
}

function inside(file) {
  if (!projectState.root) throw new Error('No project is open. Call texpro_open_project first.');
  const resolved = path.resolve(projectState.root, file || '.');
  if (resolved !== projectState.root && !resolved.startsWith(projectState.root + path.sep)) {
    throw new Error('Path is outside the project: ' + file);
  }
  try {
    const realRoot = fs.realpathSync(projectState.root);
    const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : fs.realpathSync(path.dirname(resolved));
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      throw new Error('Path escapes the project through a symlink: ' + file);
    }
  } catch (error) {
    if (String(error.message).includes('escapes')) throw error;
    // A not-yet-created parent is allowed; write_file creates it below the root.
  }
  return resolved;
}

function rel(file) {
  return path.relative(projectState.root, file).replace(/\\/g, '/');
}

function configBuildDir() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(projectState.root, '.texpro', 'project.json'), 'utf8'));
    const value = config?.directories?.build;
    return typeof value === 'string' && value ? value : '.texpro/build';
  } catch {
    return '.texpro/build';
  }
}

function walk(dir, depth = 0, maxDepth = 4) {
  if (depth > maxDepth) return [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const nodes = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) nodes.push({ type: 'dir', name: entry.name, path: rel(full), children: walk(full, depth + 1, maxDepth) });
    else if (entry.isFile()) nodes.push({ type: 'file', name: entry.name, path: rel(full), ext: path.extname(entry.name).toLowerCase() });
  }
  return nodes;
}

function textFile(file) {
  const ext = path.extname(file).toLowerCase();
  return ['.tex', '.ltx', '.bib', '.sty', '.cls', '.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.lua', '.cfg'].includes(ext);
}

const tool = (name, description, properties = {}, required = [], annotations = {}) => ({
  name,
  description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
  annotations,
});

const TOOLS = [
  tool('texpro_open_project', 'Open a TeX project directory and return its root file and file tree.', {
    root: { type: 'string', description: 'Absolute path to a project directory.' },
  }, ['root'], { readOnlyHint: true }),
  tool('texpro_project_info', 'Return current project root, detected root file and summary.', {}, [], { readOnlyHint: true }),
  tool('texpro_list_files', 'List project files and directories.', {
    path: { type: 'string', description: 'Relative directory, defaults to project root.' },
    depth: { type: 'number', description: 'Maximum depth, default 4.' },
  }, [], { readOnlyHint: true }),
  tool('texpro_read_file', 'Read a UTF-8 text file from the project.', {
    path: { type: 'string', description: 'Relative file path.' },
  }, ['path'], { readOnlyHint: true }),
  tool('texpro_write_file', 'Write a UTF-8 text file inside the project. Use only with explicit user intent.', {
    path: { type: 'string' },
    content: { type: 'string' },
  }, ['path', 'content']),
  tool('texpro_search', 'Search source files in the project.', {
    query: { type: 'string' },
    caseSensitive: { type: 'boolean' },
    limit: { type: 'number' },
  }, ['query'], { readOnlyHint: true }),
  tool('texpro_project_symbols', 'Return labels, citation keys, environments, packages and images.', {}, [], { readOnlyHint: true }),
  tool('texpro_diagnose', 'Check TeX tools, missing packages, broken includes, undefined refs/cites, duplicate labels and orphan files.', {}, [], { readOnlyHint: true }),
  tool('texpro_compile', 'Compile the project with latexmk and return diagnostics.', {
    engine: { type: 'string', enum: ['pdflatex', 'xelatex', 'lualatex'] },
    file: { type: 'string', description: 'Optional active file relative to project root.' },
    buildDir: { type: 'string', description: 'Optional build directory relative to project root.' },
  }, [], {}),
  tool('texpro_cancel_compile', 'Cancel the active MCP compile if one is running.', {}, [], {}),
  tool('texpro_synctex_forward', 'Map a source line to the last compiled PDF page and coordinates.', {
    file: { type: 'string' },
    line: { type: 'number' },
    column: { type: 'number' },
  }, ['file', 'line'], { readOnlyHint: true }),
  tool('texpro_synctex_inverse', 'Map PDF page coordinates back to a source file and line.', {
    page: { type: 'number' },
    x: { type: 'number' },
    y: { type: 'number' },
  }, ['page', 'x', 'y'], { readOnlyHint: true }),
  tool('texpro_render_tikz', 'Render a TikZ/pgfplots snippet using the project preamble.', {
    source: { type: 'string' },
    file: { type: 'string', description: 'Optional file whose preamble is reused.' },
  }, ['source'], {}),
  tool('texpro_list_assets', 'List images and PDF assets in the project.', {}, [], { readOnlyHint: true }),
  tool('texpro_bib_lookup', 'Resolve a DOI or arXiv ID to a BibTeX entry.', {
    identifier: { type: 'string' },
  }, ['identifier'], { readOnlyHint: true }),
  tool('texpro_template_preview', 'Compile a LaTeX template and return a PNG preview as a data URL.', {
    source: { type: 'string' },
    engine: { type: 'string', enum: ['pdflatex', 'xelatex', 'lualatex'] },
  }, ['source'], { readOnlyHint: true }),
];

let activeCompile = null;

async function callTool(name, args = {}) {
  if (name === 'texpro_open_project') {
    const opened = setProject(args.root);
    return { content: [{ type: 'text', text: JSON.stringify({ root: opened.root, name: opened.name, rootFile: opened.rootFile, rootCandidates: opened.rootCandidates, rootSource: opened.rootSource, rootError: opened.rootError, tree: opened.tree }, null, 2) }] };
  }
  if (!projectState.root) throw new Error('No project is open. Call texpro_open_project first.');

  setProject(projectState.root);
  switch (name) {
    case 'texpro_project_info':
      return { content: [{ type: 'text', text: JSON.stringify({ root: projectState.root, name: path.basename(projectState.root), rootFile: projectState.rootFile, rootCandidates: projectState.rootCandidates, rootSource: projectState.rootSource, rootError: projectState.rootError, buildDir: configBuildDir() }, null, 2) }] };
    case 'texpro_list_files': {
      const dir = inside(args.path || '.');
      const tree = walk(dir, 0, Math.min(8, Number(args.depth) || 4));
      return { content: [{ type: 'text', text: JSON.stringify({ path: rel(dir), tree }, null, 2) }] };
    }
    case 'texpro_read_file': {
      const file = inside(args.path);
      if (!textFile(file)) throw new Error('Not a supported text file: ' + args.path);
      const content = fs.readFileSync(file, 'utf8');
      return { content: [{ type: 'text', text: content }] };
    }
    case 'texpro_write_file': {
      const file = inside(args.path);
      if (!textFile(file)) throw new Error('Refusing to write a non-text file: ' + args.path);
      const content = String(args.content ?? '');
      if (content.length > 2_000_000) throw new Error('File is too large');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
      projectState.tree = tex.openProject(projectState.root).tree;
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: rel(file), bytes: Buffer.byteLength(content) }, null, 2) }] };
    }
    case 'texpro_search': {
      const results = tex.searchProject(projectState.root, String(args.query || ''), Boolean(args.caseSensitive), Math.min(200, Number(args.limit) || 60));
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
    case 'texpro_project_symbols':
      return { content: [{ type: 'text', text: JSON.stringify(tex.collectProjectSymbols(projectState.root), null, 2) }] };
    case 'texpro_diagnose':
      return { content: [{ type: 'text', text: JSON.stringify(await tex.diagnoseProject(projectState.root), null, 2) }] };
    case 'texpro_compile': {
      const engine = ['pdflatex', 'xelatex', 'lualatex'].includes(args.engine) ? args.engine : undefined;
      const active = args.file ? inside(args.file) : projectState.rootFile || undefined;
      const runId = 'mcp-' + crypto.randomBytes(4).toString('hex');
      activeCompile = runId;
      const result = await tex.runCompile({
        projectRoot: projectState.root,
        activeFile: active,
        fallbackRoot: projectState.rootFile,
        engine: engine || null,
        buildDir: args.buildDir || configBuildDir(),
        runId,
      });
      activeCompile = null;
      projectState.lastCompile = result;
      projectState.lastCompilePdf = result.pdfPath || null;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: result.ok,
            cancelled: result.cancelled || false,
            engine: result.engine,
            duration: result.duration,
            pdfPath: result.pdfPath,
            errorCount: result.errorCount,
            warningCount: result.warningCount,
            diagnostics: result.diagnostics?.slice(0, 200),
            error: result.error,
          }, null, 2),
        }],
      };
    }
    case 'texpro_cancel_compile':
      if (!activeCompile) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'No active compile' }) }] };
      return { content: [{ type: 'text', text: JSON.stringify(tex.cancelCompilation(activeCompile), null, 2) }] };
    case 'texpro_synctex_forward': {
      const file = inside(args.file);
      const pdf = projectState.lastCompilePdf || path.join(projectState.root, configBuildDir(), `${path.basename(projectState.rootFile || 'main', path.extname(projectState.rootFile || 'main'))}.pdf`);
      return { content: [{ type: 'text', text: JSON.stringify(await tex.synctexForward({ projectRoot: projectState.root, texFile: file, pdfFile: pdf, line: Number(args.line), column: Number(args.column) || 1 }), null, 2) }] };
    }
    case 'texpro_synctex_inverse': {
      const pdf = projectState.lastCompilePdf || path.join(projectState.root, configBuildDir(), `${path.basename(projectState.rootFile || 'main', path.extname(projectState.rootFile || 'main'))}.pdf`);
      return { content: [{ type: 'text', text: JSON.stringify(await tex.synctexInverse({ projectRoot: projectState.root, pdfFile: pdf, page: Number(args.page), x: Number(args.x), y: Number(args.y) }), null, 2) }] };
    }
    case 'texpro_render_tikz': {
      const file = args.file ? inside(args.file) : projectState.rootFile || undefined;
      return { content: [{ type: 'text', text: JSON.stringify(await tex.renderTikz({ projectRoot: projectState.root, filePath: file, source: String(args.source || '') }), null, 2) }] };
    }
    case 'texpro_list_assets':
      return { content: [{ type: 'text', text: JSON.stringify(tex.collectAssets(projectState.root), null, 2) }] };
    case 'texpro_bib_lookup':
      return { content: [{ type: 'text', text: JSON.stringify(await tex.lookupBibtex(String(args.identifier || '')), null, 2) }] };
    case 'texpro_template_preview': {
      const preview = await tex.renderTemplatePreview({ source: String(args.source || ''), engine: args.engine, cacheDir: path.join(os.tmpdir(), 'texpro-mcp-template-previews') });
      return { content: [{ type: 'text', text: JSON.stringify({ ...preview, dataUrl: undefined }, null, 2) }, ...(preview.dataUrl ? [{ type: 'image', data: preview.dataUrl.split(',')[1], mimeType: 'image/png' }] : [])] };
    }
    default:
      throw new Error('Unknown tool: ' + name);
  }
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function errorResponse(id, code, message) {
  send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    errorResponse(message?.id, -32600, 'Invalid Request');
    return;
  }
  if (message.id === undefined) {
    // request from client without id is a notification; nothing to do
    return;
  }
  try {
    switch (message.method) {
      case 'initialize':
        send({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: message.params?.protocolVersion || '2024-11-05',
            capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } },
            serverInfo: { name: 'texpro', version: VERSION },
          },
        });
        break;
      case 'ping':
        send({ jsonrpc: '2.0', id: message.id, result: {} });
        break;
      case 'tools/list':
        send({ jsonrpc: '2.0', id: message.id, result: { tools: TOOLS } });
        break;
      case 'tools/call': {
        const name = message.params?.name;
        if (!name) throw new Error('Missing tool name');
        const result = await callTool(name, message.params?.arguments || {});
        send({ jsonrpc: '2.0', id: message.id, result });
        break;
      }
      case 'resources/list': {
        const resources = [];
        const walk = (node) => {
          if (node.type === 'file') {
            if (/\.(tex|ltx|bib|md|txt|sty|cls)$/i.test(node.path)) {
              resources.push({
                uri: 'texpro://project/' + encodeURIComponent(node.relative),
                name: node.name,
                description: 'Project file · ' + node.relative,
                mimeType: /\.bib$/i.test(node.path) ? 'text/x-bibtex' : 'text/x-tex',
              });
            }
            return;
          }
          for (const child of node.children || []) walk(child);
        };
        if (Array.isArray(projectState.tree)) for (const node of projectState.tree) walk(node);
        else if (projectState.tree) walk(projectState.tree);
        send({ jsonrpc: '2.0', id: message.id, result: { resources } });
        break;
      }
      case 'resources/read': {
        const uri = message.params?.uri || '';
        const relative = decodeURIComponent(String(uri).replace(/^texpro:\/\/project\//, ''));
        const file = inside(relative);
        const text = fs.readFileSync(file, 'utf8');
        send({
          jsonrpc: '2.0',
          id: message.id,
          result: { contents: [{ uri, mimeType: /\.bib$/i.test(file) ? 'text/x-bibtex' : 'text/x-tex', text }] },
        });
        break;
      }
      case 'prompts/list':
        send({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            prompts: [
              { name: 'fix-latex-error', description: 'Diagnose a LaTeX error and propose a minimal fix', arguments: [{ name: 'error', required: true }, { name: 'file', required: false }] },
              { name: 'summarize-project', description: 'Summarize the current TeX project structure and build state' },
              { name: 'write-section', description: 'Draft a new section in the current project style', arguments: [{ name: 'topic', required: true }] },
            ],
          },
        });
        break;
      case 'prompts/get': {
        const name = message.params?.name;
        const args = message.params?.arguments || {};
        if (name === 'fix-latex-error') {
          send({ jsonrpc: '2.0', id: message.id, result: { description: 'Fix a LaTeX error', messages: [{ role: 'user', content: { type: 'text', text: `The LaTeX project failed with:\n${args.error || '(no log supplied)'}\n\nInspect ${args.file || 'the project'}, identify the smallest correct fix, and explain it before editing.` } }] } });
        } else if (name === 'summarize-project') {
          send({ jsonrpc: '2.0', id: message.id, result: { description: 'Summarize project', messages: [{ role: 'user', content: { type: 'text', text: 'Use texpro_project_info and texpro_project_symbols to summarize this project: main file, engine, sections, labels, citations, and any build problems.' } }] } });
        } else if (name === 'write-section') {
          send({ jsonrpc: '2.0', id: message.id, result: { description: 'Write a section', messages: [{ role: 'user', content: { type: 'text', text: `Write a new LaTeX section about: ${args.topic || 'the requested topic'}. Follow the project's existing macros and citation style; do not invent citations.` } }] } });
        } else {
          throw new Error('Unknown prompt: ' + name);
        }
        break;
      }
      case 'shutdown':
        send({ jsonrpc: '2.0', id: message.id, result: null });
        break;
      default:
        errorResponse(message.id, -32601, 'Method not found: ' + message.method);
    }
  } catch (error) {
    if (message.method === 'tools/call') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: { content: [{ type: 'text', text: error?.message || String(error) }], isError: true },
      });
    } else {
      errorResponse(message.id, -32000, error?.message || String(error));
    }
  }
}

let inputBuffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputBuffer += chunk;
  let index;
  while ((index = inputBuffer.indexOf('\n')) >= 0) {
    const line = inputBuffer.slice(0, index).trim();
    inputBuffer = inputBuffer.slice(index + 1);
    if (!line) continue;
    try {
      void handleMessage(JSON.parse(line));
    } catch (error) {
      errorResponse(null, -32700, 'Parse error: ' + (error?.message || error));
    }
  }
});
process.stdin.on('end', () => process.exit(0));

const argIndex = process.argv.indexOf('--project');
const initialRoot = process.env.TEXPRO_PROJECT_ROOT || (argIndex >= 0 ? process.argv[argIndex + 1] : null);
if (initialRoot) {
  try {
    setProject(initialRoot);
    log('project', projectState.root, 'rootFile', projectState.rootFile);
  } catch (error) {
    log('could not open initial project:', error.message);
  }
}
log('server ready', VERSION);
