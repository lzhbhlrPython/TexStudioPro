import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'texpro-import-build-'));
execFileSync(process.execPath, [
  path.join(root, 'node_modules/typescript/bin/tsc'),
  path.join(root, 'src/lib/importers.ts'),
  path.join(root, 'src/lib/templateDesigner.ts'),
  path.join(root, 'src/lib/ai.ts'),
  path.join(root, 'src/lib/pdfDiff.ts'),
  '--module', 'commonjs',
  '--target', 'es2020',
  '--outDir', outDir,
  '--skipLibCheck',
], { stdio: 'inherit' });

const { markdownToLatex, typstToLatex } = await import(path.join(outDir, 'importers.js'));
const { designTemplate, defaultTemplateDesign } = await import(path.join(outDir, 'templateDesigner.js'));
const { aiChatStream, parseAgentActions } = await import(path.join(outDir, 'ai.js'));
const { buildPdfDiff } = await import(path.join(outDir, 'pdfDiff.js'));
const tex = await import(path.join(root, 'electron/services/tex.cjs'));
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const texService = require(path.join(root, 'electron/services/tex.cjs'));

const checks = [];
const record = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

async function compileSource(label, source, engine = 'pdflatex') {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), `texpro-import-${label}-`));
  try {
    fs.writeFileSync(path.join(project, 'main.tex'), source, 'utf8');
    const result = await texService.runCompile({
      projectRoot: project,
      activeFile: path.join(project, 'main.tex'),
      fallbackRoot: path.join(project, 'main.tex'),
      engine,
    });
    record(`${label} compiles`, result.ok === true, result.error || '');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
}

await compileSource('markdown import', markdownToLatex(
  '# Intro\n\nThis is **bold** and _italic_ with $x^2$.\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n',
  { title: 'Markdown Demo', author: 'TeXPro', date: '\\today', documentClass: 'article' },
).document);

await compileSource('typst import', typstToLatex(
  '#set document(title: "Typst Demo", author: "TeXPro")\n\n= Intro\n\nThis is *bold* and _italic_ with $x^2$.\n\n- one\n- two\n',
  { title: '', author: '', date: '\\today', documentClass: 'article' },
).document);

const makeDesign = (base) => designTemplate({
  ...defaultTemplateDesign,
  base,
  engine: base === 'ctexart' ? 'xelatex' : 'pdflatex',
  name: `Design ${base}`,
}).replace(/\{\{\s*title\s*\}\}/g, 'Designed title').replace(/\{\{\s*author\s*\}\}/g, 'TeXPro');

await compileSource('article design', makeDesign('article'));
await compileSource('ctex design', makeDesign('ctexart'), 'xelatex');
await compileSource('beamer design', makeDesign('beamer'));

const project = fs.mkdtempSync(path.join(os.tmpdir(), 'texpro-project-tools-'));
try {
  fs.mkdirSync(path.join(project, 'sections'), { recursive: true });
  fs.mkdirSync(path.join(project, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(project, 'main.tex'), '\\documentclass{article}\n\\begin{document}\n\\input{sections/intro}\n\\end{document}\n', 'utf8');
  fs.writeFileSync(path.join(project, 'sections', 'intro.tex'), '\\section{Intro}\n', 'utf8');
  fs.copyFileSync(path.join(root, 'demo/assets/curve.png'), path.join(project, 'assets', 'curve.png'));
  const image = texService.saveImageBuffer(project, 'assets', {
    name: 'pasted screenshot',
    ext: 'png',
    data: fs.readFileSync(path.join(project, 'assets', 'curve.png')),
  });
  record('image buffer is saved as an asset', fs.existsSync(image.path) && image.relative === 'assets/pasted-screenshot.png');

  const renamed = texService.renameProjectFile(project, path.join(project, 'sections', 'intro.tex'), 'chapter');
  const main = fs.readFileSync(path.join(project, 'main.tex'), 'utf8');
  record('rename updates \\input references', renamed.updated === 1 && main.includes('sections/chapter'));

  const moved = texService.moveProjectDirectory(project, path.join(project, 'sections'), 'chapters');
  const movedMain = fs.readFileSync(path.join(project, 'main.tex'), 'utf8');
  record('directory move updates references', moved.updated >= 1 && movedMain.includes('chapters/chapter'));

  fs.writeFileSync(path.join(project, 'orphan.tex'), '\\section{Orphan}\n', 'utf8');
  const diagnosis = await texService.diagnoseProject(project);
  record('orphan TeX file is detected', diagnosis.issues.some((issue) => issue.kind === 'orphan-file'));
} finally {
  fs.rmSync(project, { recursive: true, force: true });
}

const actions = parseAgentActions('```json\n{"actions":[{"type":"insert","text":"AI text"}]}\n```');
record('agent actions are parsed safely', actions.length === 1 && actions[0].type === 'insert');

const previousPixels = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
const currentPixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
const pixelDiff = buildPdfDiff(previousPixels, currentPixels);
record('PDF pixel diff marks red/green', pixelDiff.removed === 1 && pixelDiff.added === 1 && pixelDiff.changed === 2);

const server = (await import('node:http')).createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  response.write('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n');
  response.write('data: {"choices":[{"delta":{"content":"stream"}}]}\n\n');
  response.end('data: [DONE]\n\n');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
let streamed = '';
const streamedText = await aiChatStream(
  { enabled: true, apiKey: 'test', model: 'test', baseUrl: `http://127.0.0.1:${address.port}/v1` },
  'system',
  'user',
  (_delta, full) => { streamed = full; },
);
server.close();
record('AI streaming assembles deltas', streamedText === 'Hello stream' && streamed === 'Hello stream');

fs.rmSync(outDir, { recursive: true, force: true });
if (checks.some((check) => !check.ok)) process.exit(1);
console.log(`\n${checks.length}/${checks.length} checks passed`);
