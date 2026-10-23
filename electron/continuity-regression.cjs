'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = function installContinuityRegression(window, { app, ipcMain }) {
  const pause = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
  const js = source => window.webContents.executeJavaScript(source);
  const wait = async source => {
    const start = Date.now();
    while (Date.now() - start < 20000) { if (await js(source)) return; await pause(); }
    throw new Error('Timed out: ' + source);
  };
  const el = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const line = text => `[...document.querySelectorAll('.cm-line')].find(e=>e.textContent.includes(${JSON.stringify(text)}))`;
  const click = async expression => {
    await wait(`!!(${expression})`);
    const point = await js(`(()=>{const e=${expression};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+Math.min(r.width/2,120)),y:Math.round(r.y+r.height/2)}})()`);
    for (const type of ['mouseDown', 'mouseUp']) window.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
    await pause();
  };
  const key = async (keyCode, modifiers = []) => { for (const type of ['keyDown', 'keyUp']) window.webContents.sendInputEvent({ type, keyCode, modifiers }); await pause(60); };
  const type = async text => { await window.webContents.insertText(text); await pause(120); };
  const endLine = async text => { await click(line(text)); await key('Right', ['meta']); };
  const open = async id => { await click(el('[data-testid="more-menu"]')); await click(el(`[data-action="${id}"]`)); };
  const save = async () => { await key('s', ['meta']); await pause(180); };
  const shot = async name => {
    await js(`document.querySelectorAll('.toast button').forEach(e=>e.click())`);
    await pause(150);
    const dir = process.env.TEXPRO_ARTIFACTS || path.join(app.getPath('userData'), 'artifacts'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `continuity-${name}.png`), (await window.webContents.capturePage()).toPNG());
  };
  window.webContents.once('did-finish-load', () => { (async () => {
    await wait(`!!document.querySelector('.cm-content')`); window.show(); window.focus();
    // Configure only this temporary renderer profile, then boot normally with those preferences.
    await js(`localStorage.setItem('texpro.settings.v1',JSON.stringify({...JSON.parse(localStorage.getItem('texpro.settings.v1')||'{}'),visual:false,autoSave:false,autoCompile:false,compileMode:'manual',spellcheck:false,language:'zh'}))`);
    const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve)); window.webContents.reload(); await loaded;
    await wait(`!!document.querySelector('.cm-content')`);
    const main = await js(`document.querySelector('.titlebar-main-file').title`), root = path.dirname(main), child = path.join(root, 'chapter.tex');
    await open('close-project'); await wait(`!!document.querySelector('[data-testid="welcome"]')`);
    fs.writeFileSync(main, String.raw`\documentclass{article}
\begin{document}
\section{First}
Writing anchor.
\ref{sec:child}
\section{Second}
Second paragraph.
\end{document}`);
    fs.writeFileSync(child, '\\section{Child}\\label{sec:child}\nChapter writing.\n% TODO: Existing thought\n');
    fs.writeFileSync(path.join(root, 'writing.bib'), '@article{alpha, title={An inline reference}, author={A. Writer}, year={2026}}');
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git(['init']); git(['add', 'main.tex', 'chapter.tex', 'writing.bib']); git(['-c', 'user.name=Regression', '-c', 'user.email=regression@example.invalid', 'commit', '-m', 'Writing baseline']);
    await click(el('.welcome-project-row')); await wait(`!!document.querySelector('.cm-content')`);
    await js(`window.__continuityErrors=[];addEventListener('error',e=>__continuityErrors.push(e.message));addEventListener('unhandledrejection',e=>__continuityErrors.push(String(e.reason)));true`);

    // Real native input: no browser prompt, correct parent, no clobber, immediate writing.
    await js(`window.prompt=()=>{throw new Error('Browser prompt must not be used for tree creation')};true`);
    await click(el('[data-testid="new-file"]')); await type('direct'); await key('Enter');
    await wait(`document.querySelector('.titlebar-file-name').textContent==='direct.tex'&&!document.querySelector('[data-testid="tree-create"]')`);
    assert.equal(fs.readFileSync(path.join(root, 'direct.tex'), 'utf8'), '');
    await wait(`document.activeElement===document.querySelector('.cm-content')`); await type('Direct writing.'); await save();
    assert.equal(fs.readFileSync(path.join(root, 'direct.tex'), 'utf8'), 'Direct writing.');
    assert.equal(await js(`document.querySelector('.titlebar-main-file').title`), main);
    await click(el('[data-testid="new-file"]')); await type('direct.tex'); await key('Enter');
    await wait(`!!document.querySelector('#tree-create-error')`);
    assert.equal(fs.readFileSync(path.join(root, 'direct.tex'), 'utf8'), 'Direct writing.');
    for (const theme of ['paper','studio','night']) { await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`); await shot(`tree-create-${theme}`); }
    await key('Escape'); await wait(`!document.querySelector('[data-testid="tree-create"]')`);
    await click(el('[data-testid="new-folder"]')); await type('chapters'); await key('Enter');
    await wait(`!document.querySelector('[data-testid="tree-create"]')`);
    const folder = `[...document.querySelectorAll('.tree-dir>.tree-row')].find(e=>e.textContent.includes('chapters'))`;
    const folderPoint = await js(`(()=>{const r=(${folder}).getBoundingClientRect();return{x:Math.round(r.x+50),y:Math.round(r.y+r.height/2)}})()`);
    for (const type of ['mouseDown','mouseUp']) window.webContents.sendInputEvent({type,...folderPoint,button:'right',clickCount:1});
    await click(el('.tree-menu button')); await type('child.tex'); await key('Enter');
    await wait(`document.querySelector('.titlebar-file-name').textContent==='child.tex'&&!document.querySelector('[data-testid="tree-create"]')`);
    assert.ok(fs.existsSync(path.join(root, 'chapters/child.tex')));
    await click(el('[data-testid="new-file"]')); await type('notes.bib'); await key('Enter');
    await wait(`document.querySelector('.titlebar-file-name').textContent==='notes.bib'&&!document.querySelector('[data-testid="tree-create"]')`);
    assert.equal(fs.readFileSync(path.join(root,'notes.bib'),'utf8'),'');
    await click(el('.tree-file[title^="main.tex"]'));
    console.log('PASS inline file-tree creation, folder targeting, duplicate recovery, cancellation and main-file preservation');

    // Half-written math remains source through composition and becomes renderable only when valid.
    await endLine('Writing anchor.'); await type(' $\\frac{1}{');
    await js(`document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))`);
    await type('中文');
    await js(`document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}))`);
    await save(); assert.ok(fs.readFileSync(main, 'utf8').includes('$\\frac{1}{中文'));
    assert.equal(await js(`document.querySelectorAll('.katex-error').length`), 0);
    await key('z', ['meta']); await key('z', ['meta']); await save();
    console.log('PASS incomplete input and composition retain exact editable source');

    // Citation completion includes searchable title metadata and closes once.
    await endLine('Writing anchor.'); await type(' \\cite{alp');
    await wait(`!!document.querySelector('.cm-tooltip-autocomplete')`);
    assert.ok(await js(`document.querySelector('.cm-tooltip-autocomplete').textContent.includes('An inline reference')`));
    await pause(300); await key('Tab'); await save(); assert.ok(fs.readFileSync(main, 'utf8').includes('\\cite{alpha}'), fs.readFileSync(main, 'utf8'));
    console.log('PASS inline bibliography completion exposes metadata without opening a manager');

    await endLine('Writing anchor.'); await open('writing-note'); await type('补充实验数据');
    await click(el('[data-testid="tab-notes"]')); await wait(`document.querySelector('.writing-notes').textContent.includes('补充实验数据')`);
    await click(`[...document.querySelectorAll('.writing-note')].find(e=>e.textContent.includes('补充实验数据')).querySelector('button')`);
    await save(); assert.ok(fs.readFileSync(main, 'utf8').includes('% DONE: 补充实验数据'));
    await key('z', ['meta']); await save(); assert.ok(fs.readFileSync(main, 'utf8').includes('% TODO: 补充实验数据'));
    console.log('PASS portable writing notes, completion and undo');

    await click(el('[data-testid="tab-files"]'));
    await endLine('\\section{Second}'); await open('move-content-up'); await save();
    assert.ok(fs.readFileSync(main, 'utf8').indexOf('section{Second}') < fs.readFileSync(main, 'utf8').indexOf('section{First}'));
    await key('z', ['meta']); await save();
    assert.ok(fs.readFileSync(main, 'utf8').indexOf('section{First}') < fs.readFileSync(main, 'utf8').indexOf('section{Second}'));
    console.log('PASS complete section movement and single-step undo');

    await endLine('Writing anchor.'); await type(' revised'); await open('review-writing');
    await wait(`!!document.querySelector('.cm-writing-revision')`);
    await click(el('.cm-revision-tools button:nth-child(2)')); await save();
    assert.ok(!fs.readFileSync(main, 'utf8').includes(' revised'));
    await key('z', ['meta']); await save(); assert.ok(fs.readFileSync(main, 'utf8').includes(' revised'));
    await click(el('.cm-revision-tools button:first-child'));
    await wait(`!document.querySelector('.cm-writing-revision')`);
    await wait(`document.querySelector('.writing-review-bar select').options.length>1`);
    await js(`(()=>{const s=document.querySelector('.writing-review-bar select');s.value=[...s.options].find(o=>o.value.startsWith('git:')).value;s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    await wait(`!!document.querySelector('.cm-writing-revision')`);
    for (const theme of ['paper', 'studio', 'night']) { await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`); await shot(`review-${theme}`); }
    await click(el('.writing-review-bar .icon-btn'));
    console.log('PASS inline passage restoration, acceptance, undo and Git baseline');

    // A real reference tooltip jumps across files; return restores the original caret.
    await endLine('\\ref{sec:child}');
    const origin = await js(`document.querySelector('.statusbar').textContent`);
    const point = await js(`(()=>{const e=${line('\\ref{sec:child}')};const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    window.webContents.sendInputEvent({ type: 'mouseMove', ...point });
    await wait(`!!document.querySelector('.cm-reference-info button')`);
    await click(el('.cm-reference-info button'));
    await wait(`document.querySelector('.titlebar-file-name').textContent==='chapter.tex'`);
    await open('return-writing'); await wait(`document.querySelector('.titlebar-file-name').textContent==='main.tex'`);
    await wait(`document.querySelector('.statusbar').textContent===${JSON.stringify(origin)}`);
    assert.equal(await js(`document.querySelector('.statusbar').textContent`), origin);
    await endLine('Writing anchor.'); await type(' session-marker');
    await click(el('.tree-file[title^="chapter.tex"]')); await click(el('.tree-file[title^="main.tex"]'));
    await js(`document.querySelector('.cm-content').focus()`); await type(' continues'); await save();
    assert.ok(fs.readFileSync(main, 'utf8').includes('session-marker continues'));
    await key('z', ['meta']); await save(); assert.ok(!fs.readFileSync(main, 'utf8').includes('session-marker continues'));
    console.log('PASS cross-file reference return, per-file caret and undo history');

    const channel = 'compile:run', original = ipcMain._invokeHandlers.get(channel);
    ipcMain.removeHandler(channel);
    const errorLine = fs.readFileSync(main, 'utf8').split('\n').findIndex(text => text.includes('Writing anchor.')) + 1;
    ipcMain.handle(channel, async () => ({ ok: false, duration: 1, diagnostics: [{ severity: 'error', file: main, line: errorLine, source: 'latex', message: 'Missing $ inserted' }], error: 'Fixture math error' }));
    await endLine('Writing anchor.'); await key('Enter', ['meta']);
    await wait(`!!document.querySelector('.cm-writing-feedback')`);
    assert.ok(await js(`document.querySelector('.cm-writing-feedback').textContent.includes('$...$')`));
    assert.ok(await js(`document.activeElement===document.querySelector('.cm-content')`));
    await type(' corrected'); await wait(`document.querySelector('.cm-writing-feedback').textContent.includes('正文已有修改')`);
    await shot('feedback'); ipcMain.removeHandler(channel); ipcMain.handle(channel, original);
    console.log('PASS compile feedback explains the current line, preserves focus and marks stale messages');

    await endLine('Second paragraph.');
    await js(`(()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'writing-image.png',{type:'image/png'}));const e=${line('Second paragraph.')};const r=e.getBoundingClientRect();e.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.x+20,clientY:r.y+r.height/2}));return true})()`);
    await wait(`document.querySelector('.cm-content').textContent.includes('\\caption{}')`);
    await type('直接编写题注'); await save();
    const source = fs.readFileSync(main, 'utf8');
    assert.ok(source.includes('\\caption{直接编写题注}'));
    assert.ok(source.includes('\\label{fig:writing-image}'));
    assert.ok(source.includes('\\usepackage{graphicx}'));
    const image = path.join(root, 'assets/writing-image.png'); assert.ok(fs.existsSync(image));
    await key('z', ['meta']); await key('z', ['meta']); await save();
    assert.ok(!fs.readFileSync(main, 'utf8').includes('\\label{fig:writing-image}'));
    assert.ok(fs.existsSync(image));
    console.log('PASS image drop uses document placement, caption caret, unique label and non-destructive undo');
    window.setSize(1000, 720); await pause(200); await click(el('[data-testid="tab-notes"]'));
    for (const theme of ['paper', 'studio', 'night']) { await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`); await shot(`notes-${theme}`); }
    assert.deepEqual(await js('__continuityErrors'), []);
    app.exit(0);
  })().catch(async error => { console.error('[continuity regression]', error); try { await shot('failure'); } catch {} app.exit(1); }); });
};
