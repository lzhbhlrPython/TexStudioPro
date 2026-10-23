'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { clipboard, ClipboardItem } = require('electron');

module.exports = function installFlowRegression(window, { app, ipcMain }) {
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
    await js(`(${expression}).scrollIntoView({block:'center'})`); await pause(100);
    const point = await js(`(()=>{const e=${expression};const r=e.getBoundingClientRect();return {x:Math.round(r.x+Math.min(r.width/2,120)),y:Math.round(r.y+r.height/2)}})()`);
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
    await pause(450);
    const dir = process.env.TEXPRO_ARTIFACTS || path.join(app.getPath('userData'), 'artifacts'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `flow-${name}.png`), (await window.webContents.capturePage()).toPNG());
  };
  window.webContents.once('did-finish-load', () => { (async () => {
    await wait(`!!document.querySelector('.cm-content')`); window.show(); window.focus();
    // Configure only this temporary renderer profile, then boot normally with those preferences.
    await js(`localStorage.setItem('texpro.settings.v1',JSON.stringify({...JSON.parse(localStorage.getItem('texpro.settings.v1')||'{}'),visual:false,autoSave:false,autoCompile:false,compileMode:'manual',spellcheck:false,language:'zh'}))`);
    const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve)); window.webContents.reload(); await loaded;
    await wait(`!!document.querySelector('.cm-content')`);
    const main = await js(`document.querySelector('.titlebar-main-file').title`), root = path.dirname(main), chapter = path.join(root, 'chapter.tex');
    await open('close-project'); await wait(`!!document.querySelector('[data-testid="welcome"]')`);
    fs.writeFileSync(main, '\\documentclass{article}\n\\begin{document}\n\\section{Start}\\label{sec:start}\nWriting anchor.\n\\ref{sec:child}\nA footnote \\footnote{Nested \\textbf{note} with $x^2$.} stays here.\n\\end{document}\n');
    fs.writeFileSync(chapter, '\\section{Child}\\label{sec:child}\nChapter writing.\n\\ref{sec:start} and \\cref{sec:child,sec:start}.\n');
    await click(el('.welcome-project-row')); await wait(`!!document.querySelector('.cm-content')`);
    await js(`window.__flowErrors=[];addEventListener('error',e=>__flowErrors.push(e.message));addEventListener('unhandledrejection',e=>__flowErrors.push(String(e.reason)));true`);
    await endLine('Writing anchor.'); await key('Enter'); await type('# ');
    await wait(`document.querySelector('.cm-content').textContent.includes('\\section{}')`);
    await type('智能标题'); await save(); assert.ok(fs.readFileSync(main,'utf8').includes('\\section{智能标题}'));
    await key('z',['meta']); await key('z',['meta']); await save(); assert.ok(fs.readFileSync(main,'utf8').includes('\n# '));
    await key('z',['meta']); await key('z',['meta']);
    console.log('PASS Markdown heading conversion, correct brace caret and literal syntax undo');

    await endLine('Writing anchor.');
    await clipboard.writeText('# Pasted heading\n\n**Bold** and $x$.'); window.webContents.paste(); await pause(200); await save();
    assert.ok(fs.readFileSync(main,'utf8').includes('\\section{Pasted heading}'), fs.readFileSync(main,'utf8'));
    assert.ok(fs.readFileSync(main,'utf8').includes('\\textbf{Bold} and $x$.'));
    await key('z',['meta']); await save(); assert.ok(!fs.readFileSync(main,'utf8').includes('Pasted heading'));
    await clipboard.write([new ClipboardItem({ 'text/plain': 'Title\nFormatted & prose', 'text/html': '<h2>Title</h2><p><strong>Formatted</strong> &amp; prose</p>' })]); window.webContents.paste(); await pause(200); await save();
    assert.ok(fs.readFileSync(main,'utf8').includes('\\subsection{Title}'));
    assert.ok(fs.readFileSync(main,'utf8').includes('\\textbf{Formatted} \\& prose'));
    await key('z',['meta']);
    await clipboard.writeText('A\tB\n1\t2'); window.webContents.paste(); await pause(200); await save(); assert.ok(fs.readFileSync(main,'utf8').includes('\\begin{tabular}{ll}'));
    await key('z',['meta']);
    await clipboard.write([new ClipboardItem({ 'text/plain': '\\textbf{Keep TeX}', 'text/html': '<p>Keep TeX</p>' })]); window.webContents.paste(); await pause(200); await save(); assert.ok(fs.readFileSync(main,'utf8').includes('\\textbf{Keep TeX}'));
    await key('z',['meta']); await save();
    console.log('PASS Markdown, rich HTML and spreadsheet paste; raw TeX preserved; atomic undo');

    await endLine('\\ref{sec:child}'); await key('Left'); await key('F12',['alt']);
    await wait(`!!document.querySelector('.cm-reference-excerpt')&&document.querySelector('.cm-reference-excerpt').textContent.includes('Chapter writing.')`);
    assert.equal(await js(`document.activeElement===document.querySelector('.cm-content')`), true);
    await shot('reference-zh'); await key('Escape');
    await endLine('A footnote'); await key('Left');
    // Click inside the nested footnote source then use the keyboard lookup.
    await click(line('A footnote')); await key('Right',['meta']); for(let n=0;n<17;n++) await key('Left'); await key('F12',['alt']);
    await wait(`!!document.querySelector('.cm-reference-info')&&document.querySelector('.cm-reference-info').textContent.includes('Nested')`); await shot('footnote-zh'); await key('Escape');
    console.log('PASS reference and nested footnote lookup keep the active paragraph and focus');

    await endLine('\\ref{sec:child}'); await key('Left'); await key('F2');
    await wait(`!!document.querySelector('.writing-rename input')`); window.webContents.selectAll(); await type('sec:start'); await key('Enter');
    await wait(`!!document.querySelector('.writing-rename [role=alert]')`);
    for(const theme of ['paper','studio','night']) { await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`); await shot(`rename-error-${theme}`); }
    window.setSize(1000,720); await pause(200); await shot('rename-narrow'); window.setSize(1380,960); await pause(200);
    await click(el('.writing-rename input')); window.webContents.selectAll(); await type('sec:renamed'); await key('Enter');
    await wait(`!document.querySelector('.writing-rename')`); await save();
    assert.ok(fs.readFileSync(main,'utf8').includes('\\ref{sec:renamed}'));
    assert.ok(fs.readFileSync(chapter,'utf8').includes('\\label{sec:renamed}'));
    assert.ok(fs.readFileSync(chapter,'utf8').includes('\\cref{sec:renamed,sec:start}'));
    await key('z',['meta']); await save(); assert.ok(fs.readFileSync(chapter,'utf8').includes('\\label{sec:child}'));
    await key('z',['meta','shift']); await save(); assert.ok(fs.readFileSync(chapter,'utf8').includes('\\label{sec:renamed}'));
    assert.equal(await js(`document.querySelector('.titlebar-main-file').title`), main);
    console.log('PASS project label rename across closed files with grouped undo/redo and stable main identity');

    await click(el('.tree-file[title^="chapter.tex"]')); await wait(`document.querySelector('.titlebar-file-name').textContent==='chapter.tex'`);
    await endLine('Chapter writing.'); await type('接着写'); await save();
    await open('close-project'); await wait(`!!document.querySelector('[data-testid="welcome"]')`);
    await click(el('.welcome-project-row')); await wait(`document.querySelector('.titlebar-file-name').textContent==='chapter.tex'`);
    await wait(`document.activeElement===document.querySelector('.cm-content')`); await type('不中断'); await save();
    assert.ok(fs.readFileSync(chapter,'utf8').includes('Chapter writing.接着写不中断'));
    assert.equal(await js(`document.querySelector('.titlebar-main-file').title`), main);
    // A renderer restart restores the same file and caret using the persisted local record.
    assert.deepEqual(await js('__flowErrors'), []);
    const loadedAgain=new Promise(resolve=>window.webContents.once('did-finish-load',resolve)); window.webContents.reload(); await loadedAgain;
    await wait(`document.querySelector('.titlebar-file-name')?.textContent==='chapter.tex'`); await type('重开'); await save();
    assert.ok(fs.readFileSync(chapter,'utf8').includes('Chapter writing.接着写不中断重开'));
    console.log('PASS project reopen and renderer restart restore the last sentence without changing the main file');

    for(const language of ['zh','en']) {
      await key('k',['meta']); await wait(`!!document.querySelector('.palette')`);
      await type(language==='en'?'language: English':'主题');
      if(language==='en') { await key('Enter'); await key('k',['meta']); }
      window.webContents.selectAll(); await key('Backspace');
      for(const theme of ['paper','studio','night']) { await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`); await shot(`palette-${language}-${theme}`); }
      const content=await js(`document.querySelector('.palette').textContent`);
      if(language==='zh') { assert.ok(!content.includes('Toggle inline rendering')); assert.ok(!content.includes('Jump from the cursor')); }
      else { assert.ok(content.includes('Toggle inline rendering')); assert.ok(!content.includes('Interface language: 中文')); }
      await key('Escape');
    }
    console.log('PASS Chinese/English palette details across Paper, Studio and Night');
    const chapterRow = await js(`(()=>{const r=document.querySelector('.tree-file[title^="chapter.tex"]').getBoundingClientRect();return{x:Math.round(r.x+60),y:Math.round(r.y+r.height/2)}})()`);
    for(const type of ['mouseDown','mouseUp']) window.webContents.sendInputEvent({type,...chapterRow,button:'right',clickCount:1});
    await click(`[...document.querySelectorAll('.tree-menu button')].find(e=>e.textContent.includes('Rename file'))`);
    await wait(`!!document.querySelector('.text-request input')`);
    for(const theme of ['paper','studio','night']) { await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`); await shot(`text-request-${theme}`); }
    await type('not-applied.tex'); await key('Escape'); await wait(`!document.querySelector('.text-request')`); assert.ok(fs.existsSync(chapter));
    console.log('PASS app-owned text request, theme consistency and Escape cancellation');

    await open('close-project'); await wait(`!!document.querySelector('[data-testid="welcome"]')`);
    const prefix = Array.from({length:24},(_,i)=>`Paragraph ${i}.\n`).join('\n');
    const suffix = Array.from({length:30},(_,i)=>`Following ${i}.\n`).join('\n');
    const fixture = '\\documentclass{article}\n\\begin{document}\n'+prefix+'\\begin{tikzpicture}\n\\draw (0,0) rectangle (3,2);\n\\end{tikzpicture}\nStable writing paragraph.\n'+suffix+'\\end{document}';
    fs.writeFileSync(main, fixture);
    const svg = path.join(root,'assets/late-layout.svg'); fs.writeFileSync(svg,'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect x="1" y="1" width="598" height="298" fill="white" stroke="black"/><text x="40" y="150" font-size="30">Delayed diagram</text></svg>');
    const originalRender = ipcMain._invokeHandlers.get('tikz:render'); let release;
    ipcMain.removeHandler('tikz:render'); ipcMain.handle('tikz:render',()=>new Promise(resolve=>{release=resolve}));
    await click(el('.welcome-project-row')); await wait(`!!document.querySelector('.cm-content')`); await click(el('.tree-file[title^="main.tex"]'));
    const stableLine = fixture.split('\n').findIndex(row=>row.includes('Stable writing paragraph.'))+1;
    await js(`window.dispatchEvent(new CustomEvent('texpro:writing-jump',{detail:{file:${JSON.stringify(main)},line:${stableLine}}}));true`);
    await open('visual'); await wait(`!!document.querySelector('.cm-tikz-spinner')`);
    await js(`window.dispatchEvent(new CustomEvent('texpro:writing-jump',{detail:{file:${JSON.stringify(main)},line:${stableLine}}}));true`);
    for(let n=0;n<40&&!release;n++) await pause(100); assert.ok(release);
    await pause(250);
    assert.ok(await js(`getSelection()?.anchorNode?.textContent?.includes('Stable writing paragraph.')`), 'Caret must be on the target sentence before layout');
    const beforeTop=await js(`(${line('Stable writing paragraph.')}).getBoundingClientRect().top`);
    release({ok:true,svgPath:svg,engine:'fixture'});
    await wait(`!!document.querySelector('.cm-tikz-body img')&&document.querySelector('.cm-tikz-body img').complete`); await pause(400);
    const afterTop=await js(`(${line('Stable writing paragraph.')}).getBoundingClientRect().top`);
    assert.ok(await js(`getSelection()?.anchorNode?.textContent?.includes('Stable writing paragraph.')`), 'Layout must preserve the native caret sentence');
    assert.ok(Math.abs(afterTop-beforeTop)<=2,`Paragraph shifted ${afterTop-beforeTop}px`);
    assert.equal(await js(`document.activeElement===document.querySelector('.cm-content')`),true);
    await type('Continue. '); await save(); assert.ok(fs.readFileSync(main,'utf8').includes('Continue. Stable writing paragraph.'));
    await shot('stable-render');
    ipcMain.removeHandler('tikz:render'); ipcMain.handle('tikz:render',originalRender);
    console.log('PASS delayed diagram layout keeps the active paragraph within two CSS pixels and typing continues');
    assert.deepEqual(await js('window.__flowErrors || []'), []);
    app.exit(0);
  })().catch(async error=>{console.error('[flow regression]',error);try{await shot('failure')}catch{}app.exit(1)}); });
};
