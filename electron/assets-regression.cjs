'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// All fixture changes and confirmations are confined to the isolated smoke project.
module.exports = function installAssetsRegression(window, { app }) {
  const pause = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
  const js = source => window.webContents.executeJavaScript(source);
  const wait = async source => {
    const start = Date.now();
    while (Date.now() - start < 15000) { if (await js(source)) return; await pause(); }
    throw new Error('Timed out: ' + source);
  };
  const row = name => `[...document.querySelectorAll('.tree-row')].find(e=>e.querySelector('span')?.textContent===${JSON.stringify(name)})`;
  const card = name => `[...document.querySelectorAll('.asset-card')].find(e=>e.querySelector('strong')?.textContent===${JSON.stringify(name)})`;
  const click = async (expression, button = 'left') => {
    await wait(`!!(${expression})`);
    const point = await js(`(()=>{const e=${expression};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    for (const type of ['mouseDown', 'mouseUp']) window.webContents.sendInputEvent({ type, ...point, button, clickCount: 1 });
    await pause();
  };
  const selector = value => `document.querySelector(${JSON.stringify(value)})`;
  window.webContents.once('did-finish-load', () => { (async () => {
    await wait(`!!document.querySelector('.cm-content')`);
    window.show(); window.focus();
    const main = await js(`document.querySelector('.titlebar-main-file').title`);
    const root = path.dirname(main), original = fs.readFileSync(main, 'utf8');
    await js(`window.__assetConfirmations=[];window.__allowAssetDelete=false;window.confirm=text=>{__assetConfirmations.push(text);return __allowAssetDelete};true`);
    for (const name of ['library-delete.svg', 'tree-delete.svg', 'external-delete.svg', 'batch/child.svg']) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M0 0L20 20"/></svg>');
    }
    await click(selector('[data-testid="tab-assets"]'));
    await wait(`!!(${card('library-delete.svg')})`);
    await click(`(${card('library-delete.svg')}).querySelector('.asset-thumb')`);
    await wait(`!!document.querySelector('.file-preview')`);
    await click(`(${card('library-delete.svg')}).querySelector('.asset-delete')`);
    assert.equal(fs.existsSync(path.join(root, 'library-delete.svg')), true);
    assert.ok(await js(`!!(${card('library-delete.svg')})&&!!document.querySelector('.file-preview')`));
    await js(`window.__allowAssetDelete=true`);
    await click(`(${card('library-delete.svg')}).querySelector('.asset-delete')`);
    await wait(`!(${card('library-delete.svg')})&&!document.querySelector('.file-preview')&&!!document.querySelector('.cm-content')`);
    assert.equal(fs.existsSync(path.join(root, 'library-delete.svg')), false);
    await click(selector('[data-testid="tab-files"]'));
    assert.equal(await js(`!!(${row('library-delete.svg')})`), false);
    assert.ok(fs.readdirSync(path.join(root, '.texpro/trash')).some(name => name.endsWith('library-delete.svg')));
    console.log('PASS library deletion updates file tree, closes preview and retains recoverable bytes');

    await click(row('tree-delete.svg'), 'right');
    await click(selector('.tree-menu .danger'));
    await wait(`!(${row('tree-delete.svg')})`);
    await click(selector('[data-testid="tab-assets"]'));
    assert.equal(await js(`!!(${card('tree-delete.svg')})`), false);
    await click(selector('[data-testid="tab-files"]'));
    await click(row('batch'), 'right');
    await click(selector('.tree-menu .danger'));
    await wait(`!(${row('batch')})`);
    await click(selector('[data-testid="tab-assets"]'));
    assert.equal(await js(`!!(${card('child.svg')})`), false);
    console.log('PASS file and containing-folder deletion remove matching library entries');

    await click(`(${card('external-delete.svg')}).querySelector('.asset-thumb')`);
    await wait(`!!document.querySelector('.file-preview')`);
    fs.unlinkSync(path.join(root, 'external-delete.svg'));
    await wait(`!(${card('external-delete.svg')})&&!document.querySelector('.file-preview')`);
    await click(selector('[data-testid="tab-files"]'));
    assert.equal(await js(`!!(${row('external-delete.svg')})`), false);
    assert.equal(fs.readFileSync(main, 'utf8'), original);
    assert.ok(await js(`__assetConfirmations.some(text=>text.includes('.texpro/trash'))`));
    console.log('PASS external deletion refreshes both views without changing TeX source');
    app.exit(0);
  })().catch(error => { console.error('[assets regression]', error); app.exit(1); }); });
};
