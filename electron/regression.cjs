'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function installRegression(window, { app, ipcMain }) {
  const pause = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
  const js = (source) => window.webContents.executeJavaScript(source);
  const waitFor = async (source, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await js(source)) return; await pause(80); }
    throw new Error(`Timed out waiting for ${source}`);
  };
  const click = async (selector) => { await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`); await js(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(); };
  const input = async (selector, value) => {
    await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await pause();
  };
  const open = async (id) => { await click('[data-testid="more-menu"]'); await click(`[data-action="${id}"]`); };
  const position = () => js(`(() => { const n=document.querySelector('.schematic-node'); return { x: parseFloat(n.style.left), y: parseFloat(n.style.top) }; })()`);
  const undo = () => click('.schematic-toolbar button[title="Undo"], .schematic-toolbar button[title="撤销"]');
  const screenshot = async (name) => {
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await pause(160);
    const image = await window.webContents.capturePage();
    const output = process.env.TEXPRO_ARTIFACTS || path.join(app.getPath('userData'), 'artifacts');
    fs.mkdirSync(output, {recursive:true});
    fs.writeFileSync(path.join(output, `regression-${name}.png`), image.toPNG());
  };
  const drag = async (dx, dy, release = true) => {
    const point = await js(`(() => { const r=document.querySelector('.schematic-node').getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()`);
    window.webContents.sendInputEvent({ type: 'mouseMove', ...point });
    window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    await pause();
    window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x + dx, y: point.y + dy, movementX: dx, movementY: dy });
    await pause();
    if (release) window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x + dx, y: point.y + dy, button: 'left', clickCount: 1 });
    await pause(100);
    return { x: point.x + dx, y: point.y + dy };
  };
  window.webContents.once('did-finish-load', () => {
    (async () => {
      await waitFor(`Boolean(document.querySelector('.cm-content'))`);
      await js(`window.__regressionErrors=[]; window.addEventListener('error', e=>window.__regressionErrors.push(e.message)); window.addEventListener('unhandledrejection', e=>window.__regressionErrors.push(String(e.reason)));`);
      await open('visual');
      window.show(); window.focus();
      await pause(250);
      await js(`document.querySelector('.cm-content').focus()`);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down', modifiers: ['meta'] });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down', modifiers: ['meta'] });
      await pause(120);
      await window.webContents.insertText('\n\\sec');
      await pause(150);
      await js(`document.querySelector('.cm-content').focus(); document.querySelector('.cm-content').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',ctrlKey:true,bubbles:true,cancelable:true}))`);
      await waitFor(`Boolean(document.querySelector('.texpro-completions li[aria-selected]'))`);
      for (const theme of ['paper', 'night', 'studio']) {
        await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
        await pause(100);
        const appearance = await js(`(() => { const tip=document.querySelector('.texpro-completions'); const row=tip.querySelector('[aria-selected]'); const r=tip.getBoundingClientRect(); return { fits:r.left>=0 && r.right<=innerWidth, background:getComputedStyle(row).backgroundColor, accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), icons:tip.querySelectorAll('svg').length }; })()`);
        assert.ok(appearance.fits && appearance.icons > 0, JSON.stringify(appearance));
        await screenshot(`completion-${theme}`);
      }
      window.setSize(1000, 640); await pause(300);
      await js(`document.querySelector('.cm-content').focus()`);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down', modifiers: ['meta'] });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down', modifiers: ['meta'] });
      await pause(120);
      await js(`document.querySelector('.cm-content').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',ctrlKey:true,bubbles:true,cancelable:true}))`);
      await waitFor(`Boolean(document.querySelector('.texpro-completions li[aria-selected]'))`);
      await screenshot('completion-narrow');
      const completionBounds = await js(`(() => { const r=document.querySelector('.texpro-completions').getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}; })()`);
      assert.ok(completionBounds.left>=0 && completionBounds.right<=completionBounds.width && completionBounds.top>=0 && completionBounds.bottom<=completionBounds.height, JSON.stringify(completionBounds));
      const firstCompletion = await js(`document.querySelector('.texpro-completions li[aria-selected]').id`);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
      await pause();
      assert.notEqual(await js(`document.querySelector('.texpro-completions li[aria-selected]').id`), firstCompletion);
      const selectedCompletion = await js(`document.querySelector('.texpro-completions li[aria-selected] .cm-completionLabel').textContent`);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
      await pause();
      assert.equal(await js(`document.querySelectorAll('.texpro-completions').length`), 0);
      assert.ok(await js(`document.querySelector('.cm-content').textContent.includes(${JSON.stringify(selectedCompletion)})`));
      // Undo the inserted template and test query; the demo remains intact.
      for (let i = 0; i < 2; i++) {
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'z', modifiers: ['meta'] });
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'z', modifiers: ['meta'] });
        await pause();
      }
      await js(`document.documentElement.dataset.theme='paper'`);
      window.setSize(1440, 900); await pause();
      await open('visual');
      console.log('PASS autocomplete themes, narrow bounds, keyboard selection and insertion');
      await open('circuit-studio');
      await waitFor(`document.querySelectorAll('.schematic-node').length > 0`);
      await pause(400);
      const before = await position();
      await drag(60, 40);
      assert.deepEqual(await position(), { x: before.x + 60, y: before.y + 40 });
      await undo(); assert.deepEqual(await position(), before);
      console.log('PASS native drag and undo preserve the snapshot without crashing');
      await click('.schematic-toolbar button[title="Zoom in"], .schematic-toolbar button[title="放大"]');
      await click('.schematic-toolbar button[title="Zoom in"], .schematic-toolbar button[title="放大"]');
      await drag(60, 60);
      assert.deepEqual(await position(), { x: before.x + 50, y: before.y + 50 });
      await undo(); assert.deepEqual(await position(), before);
      console.log('PASS zoomed drag uses canvas coordinates');
      const point = await drag(48, 36, false);
      await js(`window.dispatchEvent(new Event('blur'))`);
      window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
      await pause(); await undo(); assert.deepEqual(await position(), before);
      await drag(24, 24); await undo(); assert.deepEqual(await position(), before);
      console.log('PASS interrupted drag releases capture and the next gesture works');
      await js(`document.querySelector('.schematic-node').focus()`);
      await js(`document.querySelector('.schematic-node').dispatchEvent(new KeyboardEvent('keydown',{ key:'ArrowRight', bubbles:true }))`);
      await pause(); assert.equal((await position()).x, before.x + 10); await undo();
      await screenshot('circuit');
      await click('.schematic-studio .studio-header .icon-btn');
      await click('[data-testid="more-menu"]');
      await input('.workbench-menu-search input', 'logic studio');
      assert.equal(await js(`document.querySelectorAll('.workbench-menu-list [data-action]').length`), 1);
      await click('[data-action="logic-studio"]');
      await waitFor(`Boolean(document.querySelector('[data-testid="logic-studio"] .schematic-node'))`);
      await screenshot('logic');
      await click('.schematic-studio .studio-header .icon-btn');
      await open('structure-studio');
      await waitFor(`Boolean(document.querySelector('[data-testid="structure-studio"] .schematic-node'))`);
      await screenshot('structure');
      console.log('PASS searchable tool menu and all three studios open');
      window.setSize(1000, 640); await pause(300);
      const layout = await js(`(() => { const dialog=document.querySelector('.schematic-studio').getBoundingClientRect(); const footer=document.querySelector('.schematic-studio .studio-footer').getBoundingClientRect(); const preview=document.querySelector('.schematic-preview'); return { inside:dialog.left>=0 && dialog.right<=innerWidth && footer.bottom<=innerHeight, preview:getComputedStyle(preview).display!=='none' }; })()`);
      assert.ok(layout.inside && layout.preview, JSON.stringify(layout));
      await screenshot('narrow');
      console.log('PASS minimum window retains inspector, preview and insert action');
      // Replace only this test process's IPC handler to exercise rejected previews.
      ipcMain.removeHandler('tikz:render');
      ipcMain.handle('tikz:render', async () => { throw new Error('Preview temporarily unavailable (regression)'); });
      await input('.schematic-inspector input', 'Changed');
      await waitFor(`Boolean(document.querySelector('.schematic-preview-error'))`);
      assert.equal(await js(`document.querySelectorAll('.tool-recovery').length`), 0);
      await screenshot('preview-error');
      console.log('PASS rejected preview remains recoverable inside the studio');
      await click('.schematic-studio .studio-header .icon-btn');
      await click('[data-testid="more-menu"]');
      await input('.workbench-menu-search input', 'zzzzzz');
      assert.ok(await js(`Boolean(document.querySelector('.workbench-menu-empty'))`));
      await screenshot('tools-empty');
      await js(`document.querySelector('.workbench-menu').dispatchEvent(new KeyboardEvent('keydown',{ key:'Escape', bubbles:true }))`);
      await pause(); assert.equal(await js(`document.querySelectorAll('.workbench-menu').length`), 0);
      assert.ok(await js(`document.activeElement.matches('[data-testid="more-menu"]')`));
      await screenshot('workbench');
      await require('./pdf-regression.cjs')(window, ipcMain, { js, waitFor, click, pause, screenshot, open });
      await require('./project-regression.cjs')(window, ipcMain, { js, waitFor, click, pause, screenshot, open });
      assert.deepEqual(await js('window.__regressionErrors'), []);
      console.log('PASS dismiss restores focus; no renderer errors or unhandled rejections');
      app.exit(0);
    })().catch(async (error) => { console.error('[regression]', error); try { await screenshot('failure'); } catch {} app.exit(1); });
  });
};
