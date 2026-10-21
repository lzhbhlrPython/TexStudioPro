'use strict';
const assert = require('node:assert/strict');
const tex = require('./services/tex.cjs');

module.exports = async function pdfRegression(window, ipcMain, { js, waitFor, click, pause, screenshot, open }) {
  await open('visual');
  await click('[data-testid="toggle-pdf"]');
  await waitFor(`Boolean(document.querySelector('.pdf-page[data-text-ready="true"]'))`, 60000);
  const inverseResults = [];
  ipcMain.removeHandler('sync:inverse');
  ipcMain.handle('sync:inverse', async (_event, options) => {
    const result = await tex.synctexInverse(options);
    inverseResults.push({ options, result });
    return result;
  });
  await js(`document.querySelector('.pdf-scroll').scrollTop=0`);
  await pause(200);
  const textPoint = await js(`(() => {
    const page=document.querySelector('.pdf-page[data-text-ready="true"]');
    const scroll=document.querySelector('.pdf-scroll').getBoundingClientRect();
    const spans=[...page.querySelectorAll('.pdf-text-layer span')].filter(e=>e.textContent.trim().length>35 && e.getBoundingClientRect().top>scroll.top+90 && e.getBoundingClientRect().bottom<scroll.bottom-30);
    const r=spans[Math.min(3,spans.length-1)].getBoundingClientRect();
    return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
  })()`);
  window.webContents.sendInputEvent({ type: 'mouseDown', ...textPoint, button: 'left', clickCount: 1, modifiers: ['meta'] });
  window.webContents.sendInputEvent({ type: 'mouseUp', ...textPoint, button: 'left', clickCount: 1, modifiers: ['meta'] });
  await waitFor(`Boolean(document.querySelector('.cm-flash-line'))`);
  assert.ok(inverseResults.at(-1)?.result.ok);
  assert.ok(await js(`document.querySelectorAll('.cm-selectionBackground').length>0`));
  await screenshot('pdf-inverse');
  console.log('PASS PDF modifier-click selects and highlights the mapped source line');

  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'j',metaKey:true,shiftKey:true,bubbles:true}))`);
  await waitFor(`Boolean(document.querySelector('.pdf-sync-marker'))`);
  await pause(400);
  const markerVisible = await js(`(() => { const m=document.querySelector('.pdf-sync-marker').getBoundingClientRect(); const s=document.querySelector('.pdf-scroll').getBoundingClientRect(); return m.top>=s.top && m.top<s.bottom && m.right>s.left && m.left<s.right; })()`);
  assert.ok(markerVisible);
  await screenshot('pdf-forward');
  console.log('PASS source-to-PDF scroll reveals the text box instead of the page centre');

  await click('[data-testid="pdf-region-toggle"]');
  const selection = await js(`(() => {
    const page=document.querySelector('.pdf-page[data-text-ready="true"]');
    const scroll=document.querySelector('.pdf-scroll').getBoundingClientRect();
    const spans=[...page.querySelectorAll('.pdf-text-layer span')].filter(e=>e.textContent.trim().length>35 && e.getBoundingClientRect().top>scroll.top+90 && e.getBoundingClientRect().bottom<scroll.bottom-35).slice(0,6);
    const rects=spans.map(e=>e.getBoundingClientRect());
    return {x:Math.floor(Math.min(...rects.map(r=>r.left)))-2,y:Math.floor(Math.min(...rects.map(r=>r.top)))-2,right:Math.ceil(Math.max(...rects.map(r=>r.right)))+2,bottom:Math.ceil(Math.max(...rects.map(r=>r.bottom)))+2};
  })()`);
  const previousCount = inverseResults.length;
  window.webContents.sendInputEvent({ type: 'mouseDown', x: selection.right, y: selection.bottom, button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseMove', x: selection.x, y: selection.y });
  await pause();
  window.webContents.sendInputEvent({ type: 'mouseUp', x: selection.x, y: selection.y, button: 'left', clickCount: 1 });
  await waitFor(`Boolean(document.querySelector('.pdf-region-selection')) && Boolean(document.querySelector('.cm-flash-line'))`);
  await pause(400);
  const mapped = inverseResults.slice(previousCount).filter((entry) => entry.result.ok);
  assert.ok(mapped.length >= 2 && mapped.length <= 7, JSON.stringify(mapped));
  assert.ok(await js(`document.querySelectorAll('.cm-selectionBackground').length>0`));
  await screenshot('pdf-region');
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await js(`document.querySelector('[data-testid="pdf-region-toggle"]').getAttribute('aria-pressed')`), 'false');
  assert.equal(await js(`document.querySelectorAll('.pdf-region-selection').length`), 0);
  console.log('PASS reverse drag samples PDF text, selects a source range and Escape clears it');
  await click('[data-testid="toggle-pdf"]');
  await open('visual');
};
