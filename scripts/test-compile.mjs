import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tex = require('../electron/services/tex.cjs');

const cwd = process.cwd();
const demo = path.join(cwd, 'demo');
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}

const demoResult = await tex.runCompile({
  projectRoot: demo,
  activeFile: path.join(demo, 'main.tex'),
  fallbackRoot: path.join(demo, 'main.tex'),
});
record('demo compiles', demoResult.ok, `${demoResult.duration} ms`);
record('demo produces PDF', Boolean(demoResult.pdfPath && fs.existsSync(demoResult.pdfPath)), demoResult.pdfPath || 'none');
record('demo has no errors', (demoResult.errorCount || 0) === 0, `${demoResult.errorCount || 0} errors`);

const forward = await tex.synctexForward({
  projectRoot: demo,
  texFile: path.join(demo, 'main.tex'),
  pdfFile: demoResult.pdfPath,
  line: 33,
  column: 0,
});
record('forward SyncTeX resolves page and coordinates', forward.ok, forward.ok ? `page ${forward.page}, y ${forward.y}` : forward.error);

if (forward.ok) {
  const inverse = await tex.synctexInverse({
    projectRoot: demo,
    pdfFile: demoResult.pdfPath,
    page: forward.page,
    x: forward.x,
    y: forward.y,
  });
  record('inverse SyncTeX returns the matching area', inverse.ok && Math.abs((inverse.line || 0) - 33) <= 2, inverse.ok ? `line ${inverse.line}` : inverse.error);
}

const symbols = tex.collectProjectSymbols(demo);
record('project labels are indexed', symbols.labels.includes('eq:energy'), `${symbols.labels.length} labels`);
record('bibliography keys are indexed', symbols.citations.includes('knuth1984'), `${symbols.citations.length} citations`);
record('figure assets are indexed', symbols.images.some((image) => image.relative.endsWith('curve.png')), `${symbols.images.length} images`);
const search = tex.searchProject(demo, 'nabla', false);
record('project search finds source matches', search.length > 0, `${search.length} matches`);

const tikz = await tex.renderTikz({
  projectRoot: demo,
  filePath: path.join(demo, 'main.tex'),
  source: String.raw`\begin{tikzpicture}
  \draw[->] (0,0) -- (2,0);
  \draw[->] (0,0) -- (0,1.5);
  \draw[thick,blue] (0.2,0.2) .. controls (0.8,1.4) and (1.2,0.1) .. (1.9,1.1);
\end{tikzpicture}`,
});
record('TikZ renders to an image', Boolean(tikz.ok && tikz.svgPath && fs.existsSync(tikz.svgPath)), tikz.ok ? `${fs.statSync(tikz.svgPath).size} bytes` : tikz.error);
record('TikZ output is a readable PNG', Boolean(tikz.svgPath && fs.readFileSync(tikz.svgPath).subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))), tikz.svgPath || 'none');

async function compileSample(name, text) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `texpro-${name}-`));
  try {
    fs.writeFileSync(path.join(root, 'main.tex'), text, 'utf8');
    const result = await tex.runCompile({
      projectRoot: root,
      activeFile: path.join(root, 'main.tex'),
      fallbackRoot: path.join(root, 'main.tex'),
    });
    record(`${name} compiles with detected engine`, result.ok, `${result.engine || 'unknown'}${result.ok ? '' : ' / ' + (result.error || 'failed')}`);
    return result;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

await compileSample('ctex', String.raw`\documentclass[UTF8,11pt]{ctexart}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb}
\begin{document}
\section{引言}
中文排版测试，公式 $e^{i\pi}+1=0$。
\end{document}`);

await compileSample('japanese', String.raw`\documentclass[11pt]{ltjsarticle}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb}
\begin{document}
\section{はじめに}
日本語の組版テストです。$e^{i\pi}+1=0$
\end{document}`);

await compileSample('arabic', String.raw`\documentclass[11pt]{article}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{fontspec}
\setmainfont{Arial}
\newfontfamily\arabicfont[Script=Arabic]{Al Nile}
\usepackage{polyglossia}
\setmainlanguage{arabic}
\setotherlanguage{english}
\begin{document}
\section{مقدمة}
هذا اختبار للطباعة العربية. $e^{i\pi}+1=0$
\end{document}`);

const cancelRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'texpro-cancel-'));
try {
  fs.writeFileSync(
    path.join(cancelRoot, 'main.tex'),
    String.raw`\documentclass{article}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}
\foreach \i in {1,...,4000} { \draw (\i,0) -- (\i,1); }
\end{tikzpicture}
\end{document}`,
    'utf8',
  );
  const running = tex.runCompile({
    projectRoot: cancelRoot,
    activeFile: path.join(cancelRoot, 'main.tex'),
    fallbackRoot: path.join(cancelRoot, 'main.tex'),
    runId: 'cancel-smoke',
  });
  await new Promise((resolve) => setTimeout(resolve, 180));
  const cancelled = tex.cancelCompilation('cancel-smoke');
  record('compile cancellation is accepted', cancelled.ok, cancelled.error || 'SIGTERM sent');
  const result = await running;
  record('cancelled compile reports cancelled', result.cancelled === true, result.error || 'no error');
  record('no compilation remains active', tex.cancelCompilation('cancel-smoke').ok === false);
} finally {
  fs.rmSync(cancelRoot, { recursive: true, force: true });
}

const brokenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'texpro-broken-'));
try {
  fs.writeFileSync(
    path.join(brokenRoot, 'bad.tex'),
    [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\thiscommanddoesnotexist',
      '\\end{document}',
      '',
    ].join('\n'),
    'utf8',
  );
  const broken = await tex.runCompile({
    projectRoot: brokenRoot,
    activeFile: path.join(brokenRoot, 'bad.tex'),
    fallbackRoot: path.join(brokenRoot, 'bad.tex'),
  });
  record('broken document fails cleanly', broken.ok === false);
  const error = broken.diagnostics.find((item) => item.severity === 'error');
  record('broken document reports an error with a line', Boolean(error && error.line), error ? `line ${error.line}: ${error.message}` : 'no diagnostic');
} finally {
  fs.rmSync(brokenRoot, { recursive: true, force: true });
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
