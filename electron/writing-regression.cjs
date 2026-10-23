'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Runs only in an isolated smoke project and user-data directory, using real renderer input.
module.exports = function installWritingRegression(window, { app, ipcMain }) {
  const pause = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
  const js = source => window.webContents.executeJavaScript(source);
  const wait = async (source, timeout = 25000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await js(source)) return; await pause(); }
    throw new Error('Timed out: ' + source);
  };
  const click = async selector => {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
    await pause(180); // CodeMirror measures after scrolling; use the settled native hit target.
    const point = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw new Error('Hidden native hit target: '+${JSON.stringify(selector)});return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    for (const type of ['mouseDown', 'mouseUp']) window.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
    await pause();
  };
  const key = async (keyCode, modifiers = []) => {
    for (const type of ['keyDown', 'keyUp']) window.webContents.sendInputEvent({ type, keyCode, modifiers });
    await pause();
  };
  const type = async text => { await window.webContents.insertText(text); await pause(180); };
  const open = async id => { await click('[data-testid="more-menu"]'); await click(`[data-action="${id}"]`); };
  const save = async () => { await key('s', ['meta']); await pause(300); };
  const shot = async name => {
    await js(`document.querySelectorAll('.toast button').forEach(e=>e.click())`);
    await pause(200);
    const output = process.env.TEXPRO_ARTIFACTS || path.join(app.getPath('userData'), 'artifacts');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, `writing-${name}.png`), (await window.webContents.capturePage()).toPNG());
  };
  const noModal = () => js(`!document.querySelector('.modal-backdrop,.schematic-studio,.tikz-studio,.music-inline-controls')`);
  const contentFocus = () => js(`document.activeElement===document.querySelector('.cm-content')`);
  const bodyEnd = async () => {
    await js(`document.querySelector('.cm-content').focus()`);
    await key('Down', ['meta']); await key('Up'); await key('Right', ['meta']);
  };
  window.webContents.once('did-finish-load', () => { (async () => {
    await wait(`!!document.querySelector('.cm-content')`);
    window.show(); window.focus();
    await js(`window.__writingErrors=[];addEventListener('error',e=>__writingErrors.push(e.message));addEventListener('unhandledrejection',e=>__writingErrors.push(String(e.reason)));`);
    const main = await js(`document.querySelector('.titlebar-main-file').title`);
    await open('close-project'); await wait(`!!document.querySelector('[data-testid="welcome"]')`);
    const fixture = String.raw`\documentclass{ctexart}
\usepackage{booktabs}
\begin{document}
\section{Nested \textbf{bold \emph{writing}} $\frac{1}{2}$}
Writing before the table. Inline $a+b$ stays in the paragraph.

\begin{table}[h]
\centering
\begin{tabular}{ll}
\toprule
Heading & \textbf{Value $\frac{1}{2}$} \\
\midrule
Alpha & Beta \\
\bottomrule
\end{tabular}
\caption{Nested \textbf{$\frac{a}{b}$} caption}
\end{table}

Writing after the table.

\end{document}`;
    fs.writeFileSync(main, fixture);
    await click('.welcome-project-row'); await wait(`!!document.querySelector('.cm-content')`);
    if (!await js(`!!document.querySelector('.cm-writing-table')`)) await open('visual');
    await wait(`!!document.querySelector('.cm-heading-line .katex .mfrac')&&!!document.querySelector('.cm-caption-line .katex .mfrac')&&!!document.querySelector('.cm-table-cell[data-row="0"][data-col="1"] .katex .mfrac')`);
    await click('.cm-table-cell[data-row="0"][data-col="1"] .cm-math-inline');
    await type('3'); await save();
    assert.ok(fs.readFileSync(main, 'utf8').includes('Value $3\\frac{1}{2}$'));
    await key('z', ['meta']); await key('Escape');
    await wait(`!!document.querySelector('.cm-table-cell[data-row="0"][data-col="1"] .katex .mfrac')`);
    console.log('PASS nested formula rendering in headings, captions, formatted table cells and exact source entry');
    await click('.cm-table-cell[data-row="1"][data-col="0"]');
    assert.equal(await js(`document.activeElement?.dataset.row+':'+document.activeElement?.dataset.col`), '1:0', 'Click must enter the requested cell');
    await key('Right', ['meta']);
    assert.equal(await js(`document.activeElement?.dataset.row+':'+document.activeElement?.dataset.col`), '1:0', 'End-of-cell navigation must retain focus');
    await type(' revised');
    assert.equal(await js(`document.activeElement?.dataset.row+':'+document.activeElement?.dataset.col`), '1:0', 'Typing must retain cell focus');
    await key('Tab'); await key('Right', ['meta']); await type(' & 50%');
    assert.equal(await js(`document.activeElement?.dataset.row+':'+document.activeElement?.dataset.col`), '1:1', 'Tab and typing must retain the next cell');
    await key('Tab');
    await wait(`!!document.querySelector('.cm-table-cell[data-row="2"][data-col="0"]')`);
    assert.equal(await js(`document.activeElement.dataset.row`), '2');
    await type('Gamma'); await key('Tab'); await type('Delta');
    await save();
    let saved = fs.readFileSync(main, 'utf8');
    assert.ok(saved.includes('Alpha revised & Beta \\& 50\\%'), saved);
    assert.ok(saved.indexOf('Gamma') < saved.indexOf('\\bottomrule'));
    assert.match(saved, /Gamma\s*&\s*Delta/);
    await key('z', ['meta']); await save();
    assert.ok(!fs.readFileSync(main, 'utf8').includes('Delta'));
    await key('z', ['meta', 'shift']); await save();
    assert.ok(fs.readFileSync(main, 'utf8').includes('Delta'));
    await key('Right', ['meta']); // Place the composition explicitly after the restored text.
    await js(`document.activeElement.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}))`);
    await type(' 中文');
    await js(`document.activeElement.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:' 中文'}))`);
    await save(); assert.ok(fs.readFileSync(main, 'utf8').includes('Delta 中文'));
    await click('[data-table-action="add-column"]');
    await wait(`!!document.querySelector('.cm-table-cell[data-col="2"]')`);
    await click('.cm-table-cell[data-row="2"][data-col="2"]'); await type('Extra');
    await click('[data-table-action="remove-column"]');
    assert.equal(await js(`document.querySelectorAll('.cm-table-cell[data-col="2"]').length`), 0);
    await click('[data-table-action="add-row"]');
    await wait(`!!document.querySelector('.cm-table-cell[data-row="3"]')`);
    await click('.cm-table-cell[data-row="3"][data-col="0"]'); await type('Temporary');
    await click('[data-table-action="remove-row"]');
    assert.equal(await js(`document.querySelectorAll('.cm-table-cell[data-row="3"]').length`), 0);
    for (const theme of ['paper', 'studio', 'night']) {
      await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      await shot(`table-${theme}`);
    }
    window.setSize(1000, 720); await pause(200); await shot('table-narrow');
    assert.ok(await js(`(()=>{const r=document.querySelector('.cm-writing-table').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`));
    await key('Escape'); assert.ok(await contentFocus());
    await type('Continuous prose. '); await save();
    saved = fs.readFileSync(main, 'utf8');
    assert.ok(saved.indexOf('Continuous prose. ') > saved.indexOf('\\end{tabular}') && saved.indexOf('Continuous prose. ') < saved.indexOf('Writing after the table.'));
    assert.ok(await noModal());
    console.log('PASS native table text, escaping, final Tab continuation, undo/redo and prose exit');
    // Ordinary insert enters the first cell directly, without opening the table editor.
    await bodyEnd(); await open('table');
    await wait(`document.activeElement?.classList.contains('cm-table-cell')`);
    await type('New table text'); await key('Escape'); await save();
    assert.ok(fs.readFileSync(main, 'utf8').includes('New table text'));
    assert.ok(await noModal());
    console.log('PASS table insertion enters direct writing');
    await bodyEnd(); await open('music');
    assert.ok(await contentFocus()); assert.ok(await noModal());
    await wait(`!!document.querySelector('.cm-writing-preview .music-typeset canvas')`, 45000);
    await js(`document.querySelector('.cm-writing-preview .music-typeset').scrollIntoView({block:'center'})`);
    await shot('music-source');
    await key('Escape'); await wait(`!!document.querySelector('[data-testid="music-block"]')`);
    await wait(`!!document.querySelector('.music-typeset [data-artwork="monochrome"]')`);
    const mask = await js(`document.querySelector('.music-typeset [data-artwork="monochrome"]').style.getPropertyValue('--tex-ink-mask')`);
    for (const theme of ['paper', 'studio', 'night']) {
      await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.querySelector('.music-paper').scrollIntoView({block:'center'})`);
      assert.ok(await js(`(()=>{const e=document.querySelector('.music-typeset [data-artwork="monochrome"]');return getComputedStyle(e,'::after').backgroundColor===getComputedStyle(document.querySelector('.cm-content')).color})()`));
      assert.equal(await js(`document.querySelector('.music-typeset [data-artwork="monochrome"]').style.getPropertyValue('--tex-ink-mask')`), mask);
      await shot(`music-${theme}`);
    }
    await click('.music-paper');
    assert.ok(await contentFocus());
    assert.equal(await js(`document.querySelectorAll('.music-inline-controls').length`), 0);
    await type('% native music writing\n'); await key('Escape'); await type('After music. '); await save();
    saved = fs.readFileSync(main, 'utf8');
    assert.ok(saved.includes('% native music writing'));
    assert.ok(saved.includes('After music. '));
    assert.ok(saved.includes('\\usepackage{musixtex}'));
    console.log('PASS music primary interaction is document writing with auxiliary live engraving');
    for (const id of ['circuit', 'logic', 'structure', 'skeletal', 'tikz-writing', 'chart-writing']) {
      await bodyEnd(); await open(id);
      assert.ok(await contentFocus(), id + ' lost the document caret');
      assert.ok(await noModal(), id + ' opened a studio');
      await key('Escape'); await type(`After ${id}. `);
    }
    await save(); saved = fs.readFileSync(main, 'utf8');
    for (const name of ['circuitikz', 'chemfig', 'tikz', 'pgfplots']) assert.ok(saved.includes(`\\usepackage{${name}}`));
    for (const id of ['circuit', 'logic', 'structure', 'skeletal', 'tikz-writing', 'chart-writing']) assert.ok(saved.includes(`After ${id}. `));
    await wait(`!!document.querySelector('.cm-tikz-body img')`, 45000);
    await wait(`!!document.querySelector('.cm-tikz-body [data-artwork="monochrome"]')`);
    const diagramSize = await js(`(()=>{const img=document.querySelector('.cm-tikz-body [data-artwork="monochrome"] img');return {width:img.getBoundingClientRect().width,pixels:img.naturalWidth}})()`);
    assert.ok(diagramSize.width > 30 && diagramSize.width < 450, 'A small authored diagram must not fill the writing column');
    assert.ok(diagramSize.pixels >= diagramSize.width * 1.8, 'Diagram strokes must render at display density');
    const diagramPos = await js(`document.querySelector('.cm-tikz-body [data-artwork="monochrome"]').closest('[data-texpro-pos]').dataset.texproPos`);
    for (const theme of ['paper', 'studio', 'night']) {
      await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.querySelector('.cm-tikz-body[data-texpro-pos="${diagramPos}"]').scrollIntoView({block:'center'})`);
      await wait(`![...document.querySelectorAll('.cm-tikz-spinner')].some(e=>e.getBoundingClientRect().height)`);
      await pause(300);
      await shot(`diagram-${theme}`);
    }
    await bodyEnd();
    await type('\n\\begin{tikzpicture}\n\\draw[red,line width=2pt] (0,0) -- (2,0) node[right] {Red annotation};\n\\end{tikzpicture}\n\n');
    await wait(`(()=>{const last=[...document.querySelectorAll('.cm-tikz-widget')].at(-1);return !!last?.querySelector('[data-artwork="document-color"] img')?.naturalWidth})()`);
    assert.ok(await js(`(()=>{const img=[...document.querySelectorAll('.cm-tikz-widget')].at(-1).querySelector('img');return img.naturalWidth>=img.getBoundingClientRect().width*1.8})()`), 'Authored color artwork must stay sharp too');
    for (const theme of ['paper', 'studio', 'night']) {
      await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)};[...document.querySelectorAll('.cm-tikz-body [data-artwork="document-color"]')].at(-1).scrollIntoView({block:'center'})`);
      assert.ok(await js(`(()=>{const e=[...document.querySelectorAll('.cm-tikz-body [data-artwork="document-color"]')].at(-1);return getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(e.querySelector('img')).opacity==='1'})()`));
      await shot(`color-${theme}`);
    }
    await shot('mixed-content');
    console.log('PASS circuits, logic, chemistry, skeletal formulas and charts insert directly into the document');
    // Chapter insertion changes main dependencies in the background and saves both buffers.
    await open('close-project'); await wait(`!!document.querySelector('[data-testid="welcome"]')`);
    const child = path.join(path.dirname(main), 'writing-chapter.tex');
    fs.writeFileSync(main, String.raw`\documentclass{article}
\begin{document}
\input{writing-chapter}
\end{document}`);
    fs.writeFileSync(child, 'Chapter writing.\n\n');
    await click('.welcome-project-row'); await wait(`!!document.querySelector('.tree-file[title^="writing-chapter.tex"]')`);
    await click('.tree-file[title^="writing-chapter.tex"]');
    await wait(`document.querySelector('.titlebar-file-name').textContent==='writing-chapter.tex'`);
    await open('structure'); assert.ok(await contentFocus());
    assert.equal(await js(`document.querySelector('.titlebar-file-name').textContent`), 'writing-chapter.tex');
    assert.equal(await js(`document.querySelector('.titlebar-main-file').title`), main);
    await key('Escape'); await type('Still writing.'); await save();
    assert.ok(fs.readFileSync(main, 'utf8').includes('\\usepackage{chemfig}'));
    assert.ok(fs.readFileSync(child, 'utf8').includes('Still writing.'));
    const childSaved = fs.readFileSync(child, 'utf8');
    await open('close-project'); await wait(`!!document.querySelector('[data-testid="welcome"]')`);
    await click('.welcome-project-row'); await wait(`!!document.querySelector('.cm-content')`);
    assert.equal(fs.readFileSync(child, 'utf8'), childSaved);
    assert.deepEqual(await js('window.__writingErrors'), []);
    console.log('PASS chapter identity, background main-file dependencies, save and reopen');
    app.exit(0);
  })().catch(async error => { console.error('[writing regression]', error); try { await shot('failure'); } catch {} app.exit(1); }); });
};
