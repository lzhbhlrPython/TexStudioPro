'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

module.exports = function installSmoke(mainWindow, { app, isSmokeWelcome }) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const artifacts = process.env.TEXPRO_ARTIFACTS || (app.isPackaged ? path.join(app.getPath('userData'), 'artifacts') : path.join(__dirname, '..', 'artifacts'));
          fs.mkdirSync(artifacts, { recursive: true });
          if (isSmokeWelcome) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            const welcomeImage = await mainWindow.webContents.capturePage();
            fs.writeFileSync(path.join(artifacts, 'smoke-welcome.png'), welcomeImage.toPNG());
            console.log('[smoke] welcome screenshot written');
            return;
          }
          const debug = await mainWindow.webContents.executeJavaScript(`(() => {
            if (!document.querySelector('.pdf-page')) document.querySelector('[data-testid="toggle-pdf"]')?.click();
            document.querySelector('button[title="Project files"]')?.click();
            const scroller = document.querySelector('.cm-scroller');
            const active = document.querySelector('.cm-activeLine');
            if (scroller) scroller.scrollTop = 0;
            return {
              scrollTop: scroller ? scroller.scrollTop : null,
              activeLine: active ? active.textContent.slice(0, 120) : null,
              pages: document.querySelectorAll('.pdf-page').length,
              math: document.querySelectorAll('.cm-math-inline, .cm-math-block').length,
              tables: document.querySelectorAll('.cm-table-widget').length,
              images: document.querySelectorAll('.cm-image-figure').length,
              preamble: document.querySelectorAll('.cm-preamble').length,
              title: document.querySelectorAll('.cm-title-widget').length,
            };
          })()`);
          console.log('[smoke] dom', JSON.stringify(debug));
          const keychainState = await mainWindow.webContents.executeJavaScript(`(async () => {
            try {
              await window.texpro.setSecret('smoke-test', 'value');
              const value = await window.texpro.getSecret('smoke-test');
              await window.texpro.deleteSecret('smoke-test');
              return { ok: value === 'value' };
            } catch (error) {
              return { ok: false, error: String(error) };
            }
          })()`);
          console.log('[smoke] keychain', JSON.stringify(keychainState));
          assert.ok(keychainState.ok, 'keychainState failed');
          await new Promise((resolve) => setTimeout(resolve, 700));
          const image = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke.png'), image.toPNG());
          const lower = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const scroller = document.querySelector('.cm-scroller');
            if (scroller) scroller.scrollTop = 1700;
            setTimeout(() => resolve({
              scrollTop: scroller ? scroller.scrollTop : null,
              tables: document.querySelectorAll('.cm-table-widget').length,
              images: document.querySelectorAll('.cm-image-figure').length,
              math: document.querySelectorAll('.cm-math-block').length,
              labels: document.querySelectorAll('.cm-label-pill').length,
            }), 700);
          })`);
          console.log('[smoke] lower', JSON.stringify(lower));
          const lowerImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-lower.png'), lowerImage.toPNG());

          const tableState = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const table = document.querySelector('.cm-table-widget');
            if (table) table.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            setTimeout(() => resolve({ hasTable: Boolean(table), open: Boolean(document.querySelector('[data-testid="table-studio"]')) }), 350);
          })`);
          console.log('[smoke] table-editor', JSON.stringify(tableState));
          assert.ok(tableState.hasTable && tableState.open, 'tableState failed');
          const tableImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-table.png'), tableImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="table-studio"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const scroller = document.querySelector('.cm-scroller');
            if (scroller) scroller.scrollTop = 620;
            setTimeout(resolve, 450);
          })`);
          const inlineImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-inline.png'), inlineImage.toPNG());

          await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const scroller = document.querySelector('.cm-scroller');
            if (scroller) scroller.scrollTop = 930;
            setTimeout(resolve, 500);
          })`);
          const mathBeforeImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-math-before.png'), mathBeforeImage.toPNG());
          const mathState = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const block = document.querySelector('.cm-math-block');
            const before = document.querySelectorAll('.cm-math-block, .cm-math-inline').length;
            if (block) {
              block.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            }
            setTimeout(() => resolve({
              before,
              after: document.querySelectorAll('.cm-math-block, .cm-math-inline').length,
              hasBlock: Boolean(block),
            }), 250);
          })`);
          console.log('[smoke] math-widget', JSON.stringify(mathState));
          const mathImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-math.png'), mathImage.toPNG());

          await mainWindow.webContents.executeJavaScript(`document.querySelector('.compile-btn')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 6500));
          const compiled = await mainWindow.webContents.executeJavaScript(`({
            status: document.querySelector('.compile-status')?.textContent?.trim(),
            problems: document.querySelector('.status-button')?.textContent?.trim(),
            pages: document.querySelectorAll('.pdf-page').length,
            toast: document.querySelector('.toast-copy strong')?.textContent || null,
          })`);
          console.log('[smoke] compiled', JSON.stringify(compiled));
          assert.ok(compiled.pages > 0, 'Compiled PDF did not render');
          const compiledImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-compiled.png'), compiledImage.toPNG());

          const pdfTools = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            document.querySelector('[data-testid="pdf-search-toggle"]')?.click();
            setTimeout(() => {
              const input = document.querySelector('[data-testid="pdf-search-input"]');
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
              if (input && setter) { setter.call(input, 'equation'); input.dispatchEvent(new Event('input', { bubbles: true })); }
              setTimeout(() => resolve({
                searchOpen: Boolean(document.querySelector('[data-testid="pdf-search-input"]')),
                hits: document.querySelector('.pdf-search-count')?.textContent?.trim() || null,
              }), 900);
            }, 200);
          })`);
          console.log('[smoke] pdf-search', JSON.stringify(pdfTools));
          const pdfSearchImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-pdf-search.png'), pdfSearchImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="pdf-search-toggle"]')?.click(); document.querySelector('[data-testid="pdf-thumb-toggle"]')?.click();`);
          await new Promise((resolve) => setTimeout(resolve, 700));
          const pdfThumbs = await mainWindow.webContents.executeJavaScript(`({
            rails: document.querySelectorAll('.pdf-thumb-rail').length,
            thumbs: document.querySelectorAll('.pdf-thumb').length,
          })`);
          console.log('[smoke] pdf-thumbs', JSON.stringify(pdfThumbs));
          const pdfThumbImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-pdf-thumbs.png'), pdfThumbImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="pdf-thumb-toggle"]')?.click(); document.querySelector('[data-testid="pdf-spread-toggle"]')?.click();`);
          await new Promise((resolve) => setTimeout(resolve, 400));
          const pdfFeatures = await mainWindow.webContents.executeJavaScript(`({
            textSpans: document.querySelectorAll('.pdf-text-layer span').length,
            spread: Boolean(document.querySelector('.pdf-pages.spread')),
            diffEnabled: !document.querySelector('[data-testid="pdf-diff-toggle"]')?.disabled,
          })`);
          console.log('[smoke] pdf-features', JSON.stringify(pdfFeatures));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="pdf-diff-toggle"]')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 900));
          const pdfDiff = await mainWindow.webContents.executeJavaScript(`({ diffVisible: Boolean(document.querySelector('.pdf-diff-canvas.visible')) })`);
          console.log('[smoke] pdf-diff', JSON.stringify(pdfDiff));
          const pdfDiffImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-pdf-diff.png'), pdfDiffImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="pdf-diff-toggle"]')?.click(); document.querySelector('[data-testid="pdf-spread-toggle"]')?.click();`);

          const inverseState = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const page = document.querySelector('.pdf-page');
            if (!page) return resolve({ ok: false });
            const rect = page.getBoundingClientRect();
            page.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              clientX: rect.left + 120,
              clientY: rect.top + 120,
              metaKey: true,
            }));
            setTimeout(() => resolve({
              ok: true,
              cursor: document.querySelector('.status-center')?.textContent?.trim() || null,
              active: document.querySelector('.cm-activeLine')?.textContent?.slice(0, 80) || null,
            }), 1400);
          })`);
          console.log('[smoke] inverse', JSON.stringify(inverseState));

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="templates"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 3200));
          const templateState = await mainWindow.webContents.executeJavaScript(`({
            thumb: Boolean(document.querySelector('.template-thumb img')),
            busy: Boolean(document.querySelector('.template-thumb-placeholder')),
          })`);
          console.log('[smoke] template-preview', JSON.stringify(templateState));
          const templateImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-templates.png'), templateImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="template-modal"] .template-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="chart"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 900));
          await new Promise((resolve) => setTimeout(resolve, 5200));
          const chartImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-chart.png'), chartImage.toPNG());
          const chartState = await mainWindow.webContents.executeJavaScript(`({ preview: Boolean(document.querySelector('[data-testid="chart-studio"] .pgf-preview img')), busy: Boolean(document.querySelector('[data-testid="chart-studio"] .spin')) })`);
          console.log('[smoke] chart', JSON.stringify(chartState));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="chart-studio"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="layout"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const layoutImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-layout.png'), layoutImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="layout-studio"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="packages"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 900));
          const packageState = await mainWindow.webContents.executeJavaScript(`({ open: Boolean(document.querySelector('[data-testid="package-manager"]')), cards: document.querySelectorAll('.package-card').length, rows: document.querySelectorAll('.package-row').length })`);
          console.log('[smoke] packages', JSON.stringify(packageState));
          const packageImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-packages.png'), packageImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="package-manager"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="commands"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const commandState = await mainWindow.webContents.executeJavaScript(`({ open: Boolean(document.querySelector('[data-testid="command-studio"]')), actionRows: document.querySelectorAll('.action-list > button').length })`);
          console.log('[smoke] commands', JSON.stringify(commandState));
          const commandImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-commands.png'), commandImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('[data-testid="command-studio"] .command-tabs button')[1]?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 250));
          const completionsState = await mainWindow.webContents.executeJavaScript(`({ cards: document.querySelectorAll('.completion-card').length, textareas: document.querySelectorAll('.completion-card textarea').length })`);
          console.log('[smoke] completions', JSON.stringify(completionsState));
          const completionsImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-completions.png'), completionsImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="command-studio"] .studio-header .icon-btn')?.click()`);

          for (const [action, testid, file] of [['compile-theater', 'compile-theater', 'smoke-theater'], ['crew', 'crew-panel', 'smoke-crew'], ['paper-studio', 'paper-studio', 'smoke-paper']]) {
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="${action}"]')?.click(), 80);`);
            await new Promise((resolve) => setTimeout(resolve, 500));
            const state = await mainWindow.webContents.executeJavaScript(`({ open: Boolean(document.querySelector('[data-testid="${testid}"]')) })`);
            console.log('[smoke] ' + action, JSON.stringify(state));
            const image = await mainWindow.webContents.capturePage();
            fs.writeFileSync(path.join(artifacts, file + '.png'), image.toPNG());
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="${testid}"] .studio-header .icon-btn')?.click()`);
          }

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="crew"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 350));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('.crew-actions .primary-btn')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 2800));
          const crewRun = await mainWindow.webContents.executeJavaScript(`({ roles: document.querySelectorAll('.crew-status > div').length, failed: Boolean(document.querySelector('.crew-role.failed')) })`);
          console.log('[smoke] crew-run', JSON.stringify(crewRun));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="crew-panel"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="paper-studio"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 350));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('.referee-summary .primary-btn')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          const referee = await mainWindow.webContents.executeJavaScript(`({ issues: document.querySelectorAll('.referee-issue').length, report: Boolean(document.querySelector('.referee-summary .secondary-btn')) })`);
          console.log('[smoke] referee', JSON.stringify(referee));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="paper-studio"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="zero-mode"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 350));
          const zeroState = await mainWindow.webContents.executeJavaScript(`({ zero: document.querySelector('.app')?.classList.contains('zero-mode'), titlebar: Boolean(document.querySelector('.titlebar')?.offsetParent) })`);
          console.log('[smoke] zero', JSON.stringify(zeroState));
          const zeroImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-zero.png'), zeroImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('.zero-exit')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="formula"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('[data-testid="formula-studio"] .formula-template-row button')[0]?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 350));
          const formulaImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-formula.png'), formulaImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.formula-editor-switch button')[1]?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          const formulaAst = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const before = document.querySelectorAll('.formula-tree .ast-leaf, .formula-tree .ast-container').length;
            document.querySelector('.formula-symbol-grid button')?.click();
            setTimeout(() => resolve({
              tree: Boolean(document.querySelector('.formula-tree')),
              before,
              after: document.querySelectorAll('.formula-tree .ast-leaf, .formula-tree .ast-container').length,
            }), 300);
          })`);
          console.log('[smoke] formula-ast', JSON.stringify(formulaAst));
          const formulaAstImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-formula-ast.png'), formulaAstImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="formula-studio"] .studio-header .icon-btn')?.click()`);

          const tikzModalState = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            document.querySelector('[data-testid="open-templates"]')?.blur();
            const chart = document.querySelector('[data-testid="chart-studio"]');
            const openTikz = () => {
              document.querySelector('[data-testid="more-menu"]')?.click();
              setTimeout(() => document.querySelector('[data-action="tikz"]')?.click(), 80);
            };
            openTikz();
            setTimeout(() => resolve({
              open: Boolean(document.querySelector('[data-testid="tikz-studio"]')),
              preview: Boolean(document.querySelector('[data-testid="tikz-studio"] img')),
            }), 5200);
          })`);
          console.log('[smoke] tikz-modal', JSON.stringify(tikzModalState));
          const tikzImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-tikz.png'), tikzImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="tikz-studio"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="tab-assets"]')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          const assetsImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-assets.png'), assetsImage.toPNG());

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="tab-symbols"]')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const symbolState = await mainWindow.webContents.executeJavaScript(`({
            modules: document.querySelectorAll('.symbol-group').length,
            rendered: document.querySelectorAll('.symbol-render .katex').length,
          })`);
          console.log('[smoke] symbols', JSON.stringify(symbolState));
          const symbolsImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-symbols.png'), symbolsImage.toPNG());

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="tab-assets"]')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 350));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('.asset-thumb')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 900));
          const previewState = await mainWindow.webContents.executeJavaScript(`({
            open: Boolean(document.querySelector('.file-preview')),
            image: Boolean(document.querySelector('.file-preview img')),
            name: document.querySelector('.file-preview-title > span')?.textContent || null,
          })`);
          console.log('[smoke] file-preview', JSON.stringify(previewState));
          const previewImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-file-preview.png'), previewImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="close-preview"]')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="bibliography"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 600));
          const bibState = await mainWindow.webContents.executeJavaScript(`({
            open: Boolean(document.querySelector('[data-testid="bib-manager"]')),
            entries: document.querySelectorAll('.bib-entry').length,
          })`);
          console.log('[smoke] bib', JSON.stringify(bibState));
          await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.bib-toolbar .mini-btn')[2]?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 200));
          const zoteroState = await mainWindow.webContents.executeJavaScript(`({ open: Boolean(document.querySelector('.zotero-search')), error: document.querySelector('.zotero-error')?.textContent || '' })`);
          console.log('[smoke] zotero-search', JSON.stringify(zoteroState));
          const bibImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-bib.png'), bibImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="bib-manager"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="project-structure"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const projectState = await mainWindow.webContents.executeJavaScript(`({
            open: Boolean(document.querySelector('[data-testid="project-studio"]')),
            modules: document.querySelectorAll('.project-module-row').length,
          })`);
          console.log('[smoke] project-studio', JSON.stringify(projectState));
          const projectImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-project.png'), projectImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="project-studio"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="comments"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          const commentsState = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const area = document.querySelector('.comment-compose textarea');
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (area && setter) { setter.call(area, 'Review this paragraph.'); area.dispatchEvent(new Event('input', { bubbles: true })); }
            setTimeout(() => {
              document.querySelector('.comment-compose .primary-btn')?.click();
              setTimeout(() => resolve({
                open: Boolean(document.querySelector('[data-testid="comments-studio"]')),
                items: document.querySelectorAll('.comment-item').length,
                canExport: !document.querySelector('[data-testid="comments-studio"] .studio-footer .secondary-btn')?.disabled,
              }), 500);
            }, 150);
          })`);
          console.log('[smoke] comments', JSON.stringify(commentsState));
          const commentsImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-comments.png'), commentsImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="comments-studio"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="ai"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          const aiState = await mainWindow.webContents.executeJavaScript(`({ open: Boolean(document.querySelector('[data-testid="ai-assistant"]')) })`);
          console.log('[smoke] ai', JSON.stringify(aiState));
          const aiImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-ai.png'), aiImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="ai-assistant"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="tab-files"]')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 250));
          await mainWindow.webContents.executeJavaScript(`(() => { const row = document.querySelector('.tree-file'); row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 250 })); })()`);
          await new Promise((resolve) => setTimeout(resolve, 250));
          const treeMenu = await mainWindow.webContents.executeJavaScript(`({ open: Boolean(document.querySelector('.tree-menu')), rows: document.querySelectorAll('.tree-file').length, state: document.querySelector('.sidebar')?.dataset.treeMenu || '', text: document.querySelector('.tree-menu')?.innerText || '' })`);
          console.log('[smoke] tree-menu', JSON.stringify(treeMenu));
          const treeImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-tree-menu.png'), treeImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('.tree-menu-scrim')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);

          for (const [action, testid, file] of [['version', 'version-review', 'smoke-version'], ['backup', 'backup-panel', 'smoke-backup'], ['git', 'git-panel', 'smoke-git']]) {
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="${action}"]')?.click(), 80);`);
            await new Promise((resolve) => setTimeout(resolve, 450));
            const state = await mainWindow.webContents.executeJavaScript(`({ open: Boolean(document.querySelector('[data-testid="${testid}"]')) })`);
            console.log('[smoke] ' + action, JSON.stringify(state));
            const image = await mainWindow.webContents.capturePage();
            fs.writeFileSync(path.join(artifacts, file + '.png'), image.toPNG());
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="${testid}"] .studio-header .icon-btn')?.click()`);
          }

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="collab"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 400));
          const collabState = await mainWindow.webContents.executeJavaScript(`({ open: Boolean(document.querySelector('[data-testid="collab-panel"]')) })`);
          console.log('[smoke] collab', JSON.stringify(collabState));
          const collabImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-collab.png'), collabImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('.collab-side .primary-btn')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 900));
          const collabHost = await mainWindow.webContents.executeJavaScript(`({ connected: document.querySelector('.collab-studio .studio-engine')?.textContent, shared: Boolean(document.querySelector('.collab-editor-state')) })`);
          console.log('[smoke] collab-host', JSON.stringify(collabHost));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('.collab-side .danger-btn')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 250));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="collab-panel"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="ink"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          await mainWindow.webContents.executeJavaScript(`(() => { const canvas = document.querySelector('.ink-canvas'); if (!canvas) return; const r = canvas.getBoundingClientRect(); const fire = (type, x, y, pressure, buttons) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'pen', pressure, buttons, clientX: r.left + x, clientY: r.top + y })); fire('pointerdown', 80, 80, 0.25, 1); fire('pointermove', 160, 120, 0.55, 1); fire('pointermove', 260, 90, 0.85, 1); fire('pointermove', 360, 150, 0.4, 1); fire('pointerup', 360, 150, 0, 0); })()`);
          await new Promise((resolve) => setTimeout(resolve, 600));
          const inkState = await mainWindow.webContents.executeJavaScript(`({ open: Boolean(document.querySelector('[data-testid="ink-studio"]')), canvas: Boolean(document.querySelector('.ink-canvas')), strokes: Number(document.querySelector('[data-testid="ink-studio"]')?.dataset.strokes || 0) })`);
          console.log('[smoke] ink', JSON.stringify(inkState));
          const inkImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-ink.png'), inkImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="ink-studio"] .studio-header .icon-btn')?.click()`);

          for (const mode of ['circuit', 'logic', 'structure']) {
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="${mode}-studio"]')?.click(), 80);`);
            await new Promise((resolve) => setTimeout(resolve, 5200));
            const state = await mainWindow.webContents.executeJavaScript(`({ open: Boolean(document.querySelector('[data-testid="${mode}-studio"]')), preview: Boolean(document.querySelector('.schematic-preview-canvas img')) })`);
            console.log('[smoke] ' + mode + '-studio', JSON.stringify(state));
            const image = await mainWindow.webContents.capturePage();
            fs.writeFileSync(path.join(artifacts, `smoke-${mode}-studio.png`), image.toPNG());
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="${mode}-studio"] .studio-header .icon-btn')?.click()`);
          }

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="mcp"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          const mcpState = await mainWindow.webContents.executeJavaScript(`({
            open: Boolean(document.querySelector('[data-testid="mcp-panel"]')),
            configured: (document.querySelector('.mcp-code')?.textContent || '').includes('mcpServers'),
            tools: document.querySelectorAll('.mcp-tool-list span').length,
          })`);
          console.log('[smoke] mcp', JSON.stringify(mcpState));
          await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.mcp-tabs button')[1]?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 200));
          await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.mcp-market-card .mini-btn')[0]?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 2500));
          const mcpConnected = await mainWindow.webContents.executeJavaScript(`({ tools: document.querySelectorAll('.mcp-call select option').length, active: Boolean(document.querySelector('.mcp-call select')) })`);
          console.log('[smoke] mcp-client', JSON.stringify(mcpConnected));
          assert.ok(mcpConnected.active && mcpConnected.tools > 0, 'mcpConnected failed');
          if (mcpConnected.tools) {
            await mainWindow.webContents.executeJavaScript(`(() => { const select = document.querySelector('.mcp-call select'); if (select) { select.value = 'texpro_project_info'; select.dispatchEvent(new Event('change', { bubbles: true })); } document.querySelector('.mcp-call .secondary-btn')?.click(); })()`);
            await new Promise((resolve) => setTimeout(resolve, 1800));
            const result = await mainWindow.webContents.executeJavaScript(`(document.querySelector('.mcp-call-result')?.textContent || '').includes('root')`);
            console.log('[smoke] mcp-call', JSON.stringify({ result }));
          }
          const mcpImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-mcp.png'), mcpImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="mcp-panel"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="export"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          const exportState = await mainWindow.webContents.executeJavaScript(`({
            open: Boolean(document.querySelector('[data-testid="export-studio"]')),
            preview: Boolean(document.querySelector('.export-preview')?.textContent?.includes('#')),
          })`);
          console.log('[smoke] export', JSON.stringify(exportState));
          const exportImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-export.png'), exportImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="export-studio"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="doctor"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 1800));
          const doctorState = await mainWindow.webContents.executeJavaScript(`({
            open: Boolean(document.querySelector('[data-testid="project-doctor"]')),
            tools: document.querySelectorAll('.doctor-tool').length,
            issues: document.querySelectorAll('.doctor-issue').length,
          })`);
          console.log('[smoke] doctor', JSON.stringify(doctorState));
          const doctorImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-doctor.png'), doctorImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="project-doctor"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="import"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const importState = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const area = document.querySelector('.import-source');
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (area && setter) {
              setter.call(area, '# Hello world\\n\\nThis is **bold** and _italic_ with $x^2$.\\n\\n- one\\n- two\\n');
              area.dispatchEvent(new Event('input', { bubbles: true }));
            }
            setTimeout(() => resolve({
              open: Boolean(document.querySelector('[data-testid="import-studio"]')),
              generated: Boolean(document.querySelector('.import-preview')),
              hasSection: document.querySelector('.import-preview')?.textContent?.includes('\\\\section{Hello world}') || false,
            }), 350);
          })`);
          console.log('[smoke] import', JSON.stringify(importState));
          const importImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-import.png'), importImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="import-studio"] .studio-header .icon-btn')?.click()`);

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="workshop"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const workshopState = await mainWindow.webContents.executeJavaScript(`({
            open: Boolean(document.querySelector('[data-testid="template-workshop"]')),
            code: document.querySelector('.workshop-code')?.textContent?.includes('\\\\documentclass') || false,
          })`);
          console.log('[smoke] workshop', JSON.stringify(workshopState));
          const workshopImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-workshop.png'), workshopImage.toPNG());
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="template-workshop"] .studio-footer .primary-btn')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          const workshopSaved = await mainWindow.webContents.executeJavaScript(`({
            closed: !document.querySelector('[data-testid="template-workshop"]'),
            toast: document.querySelector('.toast-copy strong')?.textContent || null,
          })`);
          console.log('[smoke] workshop-save', JSON.stringify(workshopSaved));

          const tikzWidgetState = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const scroller = document.querySelector('.cm-scroller');
            if (scroller) scroller.scrollTop = 2700;
            setTimeout(() => {
              const widget = document.querySelector('.cm-tikz-widget');
              if (widget) widget.scrollIntoView({ block: 'center' });
              setTimeout(() => resolve({
                hasWidget: Boolean(widget),
                image: Boolean(document.querySelector('.cm-tikz-widget img')),
                count: document.querySelectorAll('.cm-tikz-widget').length,
              }), 2200);
            }, 500);
          })`);
          console.log('[smoke] tikz-widget', JSON.stringify(tikzWidgetState));
          const tikzWidgetImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-tikz-widget.png'), tikzWidgetImage.toPNG());

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="palette"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 300));
          const paletteImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-palette.png'), paletteImage.toPNG());

          await mainWindow.webContents.executeJavaScript(`
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            document.querySelector('[data-testid="more-menu"]')?.click();
            setTimeout(() => document.querySelector('[data-action="settings"]')?.click(), 80);
          `);
          await new Promise((resolve) => setTimeout(resolve, 350));
          const settingsImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-settings.png'), settingsImage.toPNG());

          await mainWindow.webContents.executeJavaScript(`
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            document.querySelector('[data-testid="more-menu"]')?.click();
            setTimeout(() => document.querySelector('[data-action="focus"]')?.click(), 80);
          `);
          await new Promise((resolve) => setTimeout(resolve, 350));
          const focusImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-focus.png'), focusImage.toPNG());

          const sourceState = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            document.querySelector('[data-testid="more-menu"]')?.click();
            setTimeout(() => document.querySelector('[data-action="focus"]')?.click(), 80);
            setTimeout(() => {
              document.querySelector('[data-testid="more-menu"]')?.click();
              setTimeout(() => document.querySelector('[data-action="visual"]')?.click(), 80);
            }, 250);
            setTimeout(() => resolve({
              widgets: document.querySelectorAll('.cm-math-block, .cm-math-inline, .cm-table-widget, .cm-image-figure, .cm-tikz-widget').length,
              active: document.querySelector('.status-right')?.textContent?.trim() || null,
            }), 850);
          })`);
          console.log('[smoke] source', JSON.stringify(sourceState));
          const sourceImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-source.png'), sourceImage.toPNG());

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="layout"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="layout-studio"] .primary-btn')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 700));
          const layoutApplied = await mainWindow.webContents.executeJavaScript(`({
            toast: document.querySelector('.toast-copy strong')?.textContent || null,
            layoutClosed: !document.querySelector('[data-testid="layout-studio"]'),
          })`);
          console.log('[smoke] layout-applied', JSON.stringify(layoutApplied));

          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="settings"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          const englishState = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const selects = document.querySelectorAll('.settings-panel select');
            const language = selects[0];
            if (language) {
              language.value = 'en';
              language.dispatchEvent(new Event('change', { bubbles: true }));
            }
            setTimeout(() => resolve({
              language: document.documentElement.lang,
              label: document.querySelector('.settings-eyebrow')?.textContent || null,
            }), 500);
          })`);
          console.log('[smoke] english', JSON.stringify(englishState));
          const englishImage = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(artifacts, 'smoke-english.png'), englishImage.toPNG());

          await mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
          await new Promise((resolve) => setTimeout(resolve, 200));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="project-structure"]')?.click(), 80);`);
          await new Promise((resolve) => setTimeout(resolve, 450));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('.project-module-add .primary-btn')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 900));
          await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="project-studio"] .studio-footer .primary-btn')?.click()`);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          const projectApply = await mainWindow.webContents.executeJavaScript(`({
            toast: document.querySelector('.toast-copy strong')?.textContent || null,
            closed: !document.querySelector('[data-testid="project-studio"]'),
            line: document.querySelector('.status-center')?.textContent?.trim() || null,
          })`);
          console.log('[smoke] project-apply', JSON.stringify(projectApply));

          if (process.env.TEXPRO_PERF === '1') {
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="more-menu"]')?.click(); setTimeout(() => document.querySelector('[data-action="visual"]')?.click(), 80);`);
            await new Promise((resolve) => setTimeout(resolve, 500));
            await mainWindow.webContents.executeJavaScript(`document.querySelector('.cm-content')?.focus()`);
            const started = Date.now();
            mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Home', modifiers: ['meta'] });
            mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Home', modifiers: ['meta'] });
            await new Promise((resolve) => setTimeout(resolve, 200));
            const lines = [];
            for (let i = 0; i < 12; i++) {
              mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
              mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
              await new Promise((resolve) => setTimeout(resolve, 90));
              const line = await mainWindow.webContents.executeJavaScript(`document.querySelector('.status-center')?.textContent?.trim() || ''`);
              lines.push(line);
            }
            console.log('[smoke] perf-arrows', JSON.stringify({ elapsed: Date.now() - started, lines }));
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
          console.log('[smoke] screenshot written to artifacts/smoke.png');
        } catch (error) {
          console.error('[smoke] capture failed', error);
          process.exitCode = 1;
        } finally {
          app.exit(process.exitCode || 0);
        }
      }, 9000);
    });
};
