'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const tex = require('./services/tex.cjs');
const collab = require('./services/collab.cjs');
const mcpClient = require('./services/mcp-client.cjs');
const paperApi = require('./services/paper-api.cjs');
const elicitationRequests = new Map();
let elicitationSeq = 0;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isSmoke = process.env.TEXPRO_SMOKE === '1';
const isSmokeWelcome = process.env.TEXPRO_SMOKE_WELCOME === '1';
if (process.env.TEXPRO_SMOKE === '1' || process.env.TEXPRO_NO_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  const userData = process.env.TEXPRO_USER_DATA || path.join(process.cwd(), '.texpro-userdata');
  app.setPath('userData', userData);
  app.setPath('cache', path.join(userData, 'cache'));
}

const allowedRoots = new Set();
let mainWindow = null;
let demoSource = path.join(__dirname, '..', 'demo');
const appIconPath = path.join(__dirname, '..', 'build', 'icon.png');
let menuActionHandlerReady = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'texpro-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function isAllowed(file) {
  const resolved = path.resolve(file);
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(root + path.sep)) return true;
  }
  return false;
}

function rememberRoot(root) {
  allowedRoots.add(path.resolve(root));
}

function userTemplateDir() {
  return path.join(app.getPath('userData'), 'templates');
}

function sendMenu(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu:action', action);
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const tool = (label, id, accelerator) => ({
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => sendMenu('tool:' + id),
  });
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open-folder') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save') },
        { type: 'separator' },
        tool('Import Markdown / Typst…', 'import'),
        tool('Export Document…', 'export'),
        tool('Create arXiv Package…', 'arxiv'),
        tool('Project Backup…', 'backup'),
        { type: 'separator' },
        tool('Template Library…', 'templates'),
        tool('Template Workshop…', 'workshop'),
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Insert',
      submenu: [
        tool('Formula Editor…', 'formula', 'CmdOrCtrl+Shift+E'),
        tool('Display Equation', 'equation'),
        { type: 'separator' },
        tool('Table', 'table'),
        tool('Visual Table Editor…', 'table-editor'),
        tool('Figure', 'figure'),
        tool('Code Block', 'code'),
        { type: 'separator' },
        tool('Chart Studio…', 'chart'),
        tool('Circuit Studio…', 'circuit-studio'),
        tool('Logic Studio…', 'logic-studio'),
        tool('Structure Studio…', 'structure-studio'),
        tool('Ink Studio…', 'ink'),
        tool('TikZ Studio…', 'tikz'),
        tool('Page Layout…', 'layout'),
        tool('Packages & Document Class…', 'packages'),
        tool('Commands & Completions…', 'commands'),
      ],
    },
    {
      label: 'Project',
      submenu: [
        tool('Project Structure…', 'project-structure'),
        tool('Asset Library', 'assets'),
        tool('Bibliography…', 'bibliography'),
        { type: 'separator' },
        tool('Citation & Label Graph…', 'graph'),
        tool('Font Coverage…', 'font'),
        tool('Project Doctor…', 'doctor'),
        { type: 'separator' },
        tool('Version Review…', 'version'),
        tool('LAN Collaboration…', 'collab'),
        tool('Version Control…', 'git'),
        tool('Convert SVG Assets…', 'convert-svgs'),
        tool('Comments…', 'comments'),
        tool('AI Assistant…', 'ai'),
        tool('MCP Server…', 'mcp'),
      ],
    },
    {
      label: 'Build',
      submenu: [
        { label: 'Compile', accelerator: 'CmdOrCtrl+Enter', click: () => sendMenu('compile') },
        { label: 'Cancel Compile', click: () => sendMenu('cancel-compile') },
        { label: 'Forward Search', accelerator: 'CmdOrCtrl+Shift+J', click: () => sendMenu('forward-sync') },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Command Palette…', accelerator: 'CmdOrCtrl+K', click: () => sendMenu('command-palette') },
        { label: 'Toggle PDF Preview', accelerator: 'CmdOrCtrl+Alt+P', click: () => sendMenu('toggle-pdf') },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+\\', click: () => sendMenu('toggle-sidebar') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Visual Mode', accelerator: 'CmdOrCtrl+Shift+M', click: () => sendMenu('toggle-visual') },
        { label: 'Toggle Focus Mode', accelerator: 'CmdOrCtrl+Shift+F', click: () => sendMenu('toggle-focus') },
        { label: 'Typewriter Mode', accelerator: 'CmdOrCtrl+Shift+T', click: () => sendMenu('toggle-typewriter') },
        { type: 'separator' },
        { label: 'Toggle Day / Night', accelerator: 'CmdOrCtrl+Shift+L', click: () => sendMenu('tool:day-night') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}


function mcpConfigPath() {
  return path.join(app.getPath('userData'), 'mcp-servers.json');
}

function readMcpConfigs() {
  try {
    const value = JSON.parse(fs.readFileSync(mcpConfigPath(), 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeMcpConfigs(configs) {
  const file = mcpConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(configs, null, 2));
}


function installElicitationBridge() {
  mcpClient.setElicitationHandler((params) => new Promise((resolve) => {
    const id = ++elicitationSeq;
    const timer = setTimeout(() => {
      elicitationRequests.delete(id);
      resolve({ action: 'decline' });
    }, 120000);
    elicitationRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timer);
        elicitationRequests.delete(id);
        resolve(result || { action: 'decline' });
      },
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mcp:elicitation', { id, request: params });
    } else {
      elicitationRequests.get(id)?.resolve({ action: 'decline' });
    }
  }));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    icon: appIconPath,
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#161618',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 15, y: 16 },
    ...(process.platform === 'darwin'
      ? { vibrancy: 'sidebar', visualEffectState: 'active' }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const query = new URLSearchParams();
    if (isSmoke) query.set('smoke', '1');
    if (isSmokeWelcome) query.set('welcome', '1');
    mainWindow.loadURL(devUrl + (query.toString() ? '?' + query.toString() : ''));
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      query: {
        ...(isSmoke ? { smoke: '1' } : {}),
        ...(isSmokeWelcome ? { welcome: '1' } : {}),
      },
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isSmoke) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const artifacts = path.join(__dirname, '..', 'artifacts');
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
        } finally {
          app.quit();
        }
      }, 9000);
    });
  }
}

function registerIpc() {
  ipcMain.handle('dialog:openProject', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open a LaTeX project',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Open Project',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const project = tex.openProject(result.filePaths[0]);
    rememberRoot(project.root);
    return project;
  });

  ipcMain.handle('project:open', async (_event, root) => {
    if (typeof root !== 'string' || !root) throw new Error('Invalid project path');
    const project = tex.openProject(root);
    rememberRoot(project.root);
    return project;
  });

  ipcMain.handle('project:demo', async () => {
    const project = tex.ensureDemoProject(demoSource, app.getPath('userData'));
    rememberRoot(project.root);
    return project;
  });

  ipcMain.handle('project:create', async (_event, options) => {
    if (!options || typeof options.name !== 'string' || !Array.isArray(options.files)) {
      throw new Error('Invalid project options');
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose where to create the project',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Create Here',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const parent = result.filePaths[0];
    const safeName = options.name.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'untitled';
    let target = path.join(parent, safeName);
    let index = 2;
    while (fs.existsSync(target)) {
      target = path.join(parent, `${safeName}-${index}`);
      index++;
    }
    fs.mkdirSync(target, { recursive: true });
    for (const file of options.files) {
      if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') continue;
      const resolved = path.resolve(target, file.path);
      if (!resolved.startsWith(target + path.sep)) continue;
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, file.content, 'utf8');
    }
    const project = tex.openProject(target);
    rememberRoot(project.root);
    return project;
  });

  ipcMain.handle('assets:list', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.collectAssets(root);
  });

  ipcMain.handle('assets:import', async (_event, root, assetsDir) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import images',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images and PDF', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'eps'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return tex.collectAssets(root);
    return tex.importAssets(root, result.filePaths, assetsDir || 'assets');
  });

  ipcMain.handle('assets:save-buffer', async (_event, root, assetsDir, payload) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    if (!payload || !payload.data) throw new Error('Invalid image data');
    return tex.saveImageBuffer(root, assetsDir || 'assets', payload);
  });

  ipcMain.handle('assets:delete', async (_event, root, file) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    if (typeof file !== 'string' || !isAllowed(file)) throw new Error('Asset is outside the project');
    return tex.deleteAsset(root, file);
  });

  const secretFile = () => path.join(app.getPath('userData'), 'secrets.json');
  const readSecrets = () => {
    try { return JSON.parse(fs.readFileSync(secretFile(), 'utf8')); } catch { return {}; }
  };
  ipcMain.handle('secret:set', async (_event, name, value) => {
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'OS keychain encryption is not available' };
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid secret name');
    const secrets = readSecrets();
    secrets[name] = safeStorage.encryptString(String(value || '')).toString('base64');
    fs.mkdirSync(path.dirname(secretFile()), { recursive: true });
    fs.writeFileSync(secretFile(), JSON.stringify(secrets, null, 2), { mode: 0o600 });
    return { ok: true };
  });
  ipcMain.handle('secret:get', async (_event, name) => {
    const secrets = readSecrets();
    if (!secrets[name] || !safeStorage.isEncryptionAvailable()) return null;
    try { return safeStorage.decryptString(Buffer.from(secrets[name], 'base64')); } catch { return null; }
  });
  ipcMain.handle('secret:delete', async (_event, name) => {
    const secrets = readSecrets();
    delete secrets[name];
    fs.writeFileSync(secretFile(), JSON.stringify(secrets, null, 2), { mode: 0o600 });
    return { ok: true };
  });

  ipcMain.handle('dialog:open-import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown and Typst', extensions: ['md', 'markdown', 'mdown', 'typ', 'typst', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const file = result.filePaths[0];
    const content = fs.readFileSync(file, 'utf8');
    return { path: file, content, name: path.basename(file) };
  });

  ipcMain.handle('bib:lookup', async (_event, identifier) => tex.lookupBibtex(identifier));

  ipcMain.handle('bib:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Bibliography', extensions: ['ris', 'enw', 'bib'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const file = result.filePaths[0];
    return { path: file, name: path.basename(file), content: fs.readFileSync(file, 'utf8') };
  });

  ipcMain.handle('templates:preview', async (_event, payload) => {
    if (!payload || typeof payload.source !== 'string') throw new Error('Invalid template');
    return tex.renderTemplatePreview({
      source: payload.source,
      engine: payload.engine,
      cacheDir: path.join(app.getPath('userData'), 'template-previews'),
    });
  });

  ipcMain.handle('templates:list', async () => tex.listUserTemplates(userTemplateDir()));

  ipcMain.handle('templates:save', async (_event, payload) => {
    if (!payload || typeof payload.content !== 'string') throw new Error('Invalid template');
    return tex.saveUserTemplate(userTemplateDir(), payload);
  });

  ipcMain.handle('templates:delete', async (_event, id) => tex.deleteUserTemplate(userTemplateDir(), id));

  ipcMain.handle('project:symbols', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.collectProjectSymbols(root);
  });

  ipcMain.handle('tikz:render', async (_event, options) => {
    if (!options || typeof options.projectRoot !== 'string' || !isAllowed(options.projectRoot)) {
      throw new Error('Project is not open');
    }
    if (options.filePath && !isAllowed(options.filePath)) throw new Error('File is outside the project');
    return tex.renderTikz(options);
  });

  ipcMain.handle('project:impact', async (_event, root, target) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.projectImpact(root, target);
  });

  ipcMain.handle('project:create-folder', async (_event, root, parent, name) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.createProjectFolder(root, parent, name);
  });

  ipcMain.handle('project:create-file', async (_event, root, parent, name, content) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.createProjectFile(root, parent, name, content || '');
  });

  ipcMain.handle('project:move-file', async (_event, root, file, targetDir) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.moveProjectFile(root, file, targetDir);
  });

  ipcMain.handle('project:delete-file', async (_event, root, file) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.deleteProjectFile(root, file);
  });

  ipcMain.handle('project:delete-folder', async (_event, root, dir) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.deleteProjectFolder(root, dir);
  });

  ipcMain.handle('project:move-dir', async (_event, root, dir, name) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    if (typeof dir !== 'string' || !isAllowed(dir)) throw new Error('Directory is outside the project');
    return tex.moveProjectDirectory(root, dir, name);
  });

  ipcMain.handle('project:rename', async (_event, root, file, name) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    if (typeof file !== 'string' || !isAllowed(file)) throw new Error('File is outside the project');
    return tex.renameProjectFile(root, file, name);
  });

  ipcMain.handle('collab:start', async (_event, options) => collab.startCollab(options || {}));
  ipcMain.handle('collab:stop', async () => collab.stopCollab());
  ipcMain.handle('collab:status', async () => collab.status());

  ipcMain.handle('backup:run', async (_event, root, options) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.backupProject(root, options || {});
  });

  ipcMain.handle('mcp:respond-elicitation', async (_event, id, result) => {
    const pending = elicitationRequests.get(Number(id));
    if (pending) pending.resolve(result);
    return { ok: Boolean(pending) };
  });

  ipcMain.handle('mcp:client-connect', async (_event, id, options) => mcpClient.connectClient(String(id), options || {}));
  ipcMain.handle('mcp:client-call', async (_event, id, name, args) => mcpClient.callClient(String(id), String(name), args || {}));
  ipcMain.handle('mcp:client-disconnect', async (_event, id) => mcpClient.disconnectClient(String(id)));
  ipcMain.handle('mcp:client-list', async () => mcpClient.listClients());
  ipcMain.handle('mcp:configs', async () => readMcpConfigs());
  ipcMain.handle('mcp:config-save', async (_event, config) => {
    const configs = readMcpConfigs().filter((item) => item.id !== config?.id);
    if (!config?.id || !config?.command) throw new Error('Invalid MCP configuration');
    configs.push({ id: String(config.id), name: String(config.name || config.id), command: String(config.command), args: Array.isArray(config.args) ? config.args.map(String) : [] });
    writeMcpConfigs(configs);
    return configs;
  });
  ipcMain.handle('mcp:config-remove', async (_event, id) => {
    const configs = readMcpConfigs().filter((item) => item.id !== id);
    writeMcpConfigs(configs);
    return configs;
  });

  ipcMain.handle('tex:check-assets', async (_event, packages, classes) => tex.checkTexAssets(packages || [], classes || []));
  ipcMain.handle('paper-api:start', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return paperApi.start(root);
  });
  ipcMain.handle('paper-api:stop', async () => paperApi.stop());
  ipcMain.handle('paper-api:status', async () => paperApi.status());

  ipcMain.handle('tex:scan-cwl', async (_event, root) => tex.scanCwlSources(root || null));

  ipcMain.handle('tex:run-action', async (_event, root, action, rootFile) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.runProjectAction(root, action, rootFile);
  });

  ipcMain.handle('git:status', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.gitStatus(root);
  });
  ipcMain.handle('git:init', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.gitInit(root);
  });
  ipcMain.handle('git:commit', async (_event, root, message) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.gitCommit(root, message);
  });
  ipcMain.handle('git:pull', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.gitPull(root);
  });
  ipcMain.handle('git:push', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.gitPush(root);
  });
  ipcMain.handle('git:overleaf-clone', async (_event, url) => tex.overleafClone(url));
  ipcMain.handle('zotero:library', async () => tex.zoteroLibrary());
  ipcMain.handle('zotero:search', async (_event, query) => tex.zoteroSearch(query));
  ipcMain.handle('zotero:bibtex', async (_event, key) => tex.zoteroBibtex(key));

  ipcMain.handle('project:convert-svgs', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.convertSvgReferences(root);
  });

  ipcMain.handle('assets:rasterize-svg', async (_event, root, file) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    if (typeof file !== 'string' || !isAllowed(file)) throw new Error('File is outside the project');
    return tex.rasterizeSvg(root, file);
  });

  ipcMain.handle('project:arxiv', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.createArxivPackage(root);
  });

  ipcMain.handle('history:list', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.listHistory(root);
  });
  ipcMain.handle('history:commit', async (_event, root, reason) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.commitHistory(root, String(reason || 'manual'));
  });
  ipcMain.handle('history:read', async (_event, root, version, file) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.readHistoryFile(root, String(version), String(file));
  });
  ipcMain.handle('history:delete', async (_event, root, version) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.deleteHistoryVersion(root, String(version));
  });
  ipcMain.handle('history:clear', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.clearHistory(root);
  });

  ipcMain.handle('history:restore', async (_event, root, version, file) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.restoreHistoryFile(root, String(version), String(file));
  });

  ipcMain.handle('project:graph', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.collectProjectGraph(root);
  });

  ipcMain.handle('project:font-coverage', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.fontCoverage(root);
  });

  ipcMain.handle('project:diagnose', async (_event, root) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.diagnoseProject(root);
  });

  ipcMain.handle('project:clean-build', async (_event, root, buildDir) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.cleanBuild(root, buildDir);
  });

  ipcMain.handle('project:search', async (_event, root, query, caseSensitive) => {
    if (typeof root !== 'string' || !isAllowed(root)) throw new Error('Project is not open');
    return tex.searchProject(root, String(query || ''), Boolean(caseSensitive));
  });

  ipcMain.handle('file:stat', async (_event, file) => {
    if (typeof file !== 'string' || !isAllowed(file)) throw new Error('File is outside the open project');
    return tex.statFile(file);
  });

  ipcMain.handle('file:read', async (_event, file) => {
    if (typeof file !== 'string' || !isAllowed(file)) throw new Error('File is outside the open project');
    return tex.readTextFile(file);
  });

  ipcMain.handle('file:write', async (_event, file, content) => {
    if (typeof file !== 'string' || !isAllowed(file)) throw new Error('File is outside the open project');
    tex.writeTextFile(file, String(content ?? ''));
    return { ok: true, savedAt: Date.now() };
  });

  ipcMain.handle('file:exists', async (_event, file) => {
    if (typeof file !== 'string' || !isAllowed(file)) return false;
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  });

  ipcMain.handle('compile:run', async (event, options) => {
    if (!options || typeof options.projectRoot !== 'string' || !isAllowed(options.projectRoot)) {
      throw new Error('Project is not open');
    }
    const runId = options.runId || String(Date.now());
    const sender = event.sender;
    try {
      return await tex.runCompile({
        projectRoot: options.projectRoot,
        activeFile: options.activeFile || null,
        fallbackRoot: options.rootFile || null,
        engine: options.engine || null,
        timeoutMs: options.timeoutMs || 180000,
        runId,
        buildDir: options.buildDir || null,
        onData: (data) => {
          if (!sender.isDestroyed()) sender.send('compile:output', { runId, ...data });
        },
      });
    } catch (error) {
      return {
        ok: false,
        diagnostics: [],
        error: String(error.message || error),
        duration: 0,
      };
    }
  });

  ipcMain.handle('compile:cancel', async (_event, runId) => tex.cancelCompilation(runId));

  ipcMain.handle('pdf:read', async (_event, file) => {
    if (typeof file !== 'string' || !isAllowed(file)) throw new Error('PDF is outside the open project');
    const buffer = fs.readFileSync(file);
    return new Uint8Array(buffer);
  });

  ipcMain.handle('sync:forward', async (_event, options) => {
    if (!options || !isAllowed(options.projectRoot) || !isAllowed(options.pdfFile)) {
      throw new Error('Project is not open');
    }
    return tex.synctexForward(options);
  });

  ipcMain.handle('sync:inverse', async (_event, options) => {
    if (!options || !isAllowed(options.projectRoot) || !isAllowed(options.pdfFile)) {
      throw new Error('Project is not open');
    }
    return tex.synctexInverse(options);
  });

  ipcMain.handle('shell:openExternal', async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:/i.test(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('shell:openPath', async (_event, file) => {
    if (typeof file !== 'string' || !isAllowed(file)) return { ok: false };
    const error = await shell.openPath(file);
    return { ok: !error, error: error || null };
  });

  ipcMain.handle('shell:reveal', async (_event, file) => {
    if (typeof file !== 'string' || !isAllowed(file)) return { ok: false };
    shell.showItemInFolder(file);
    return { ok: true };
  });

  let spellWordsCache = null;
  ipcMain.handle('spell:words', async () => {
    if (spellWordsCache) return spellWordsCache;
    try {
      spellWordsCache = fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').map((word) => word.trim().toLowerCase()).filter(Boolean);
    } catch {
      spellWordsCache = [];
    }
    return spellWordsCache;
  });

  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    home: app.getPath('home'),
    documents: app.getPath('documents'),
    userData: app.getPath('userData'),
    isDev,
    appPath: app.getAppPath(),
    mcpPath: app.isPackaged ? path.join(process.resourcesPath, 'mcp', 'server.mjs') : path.join(__dirname, '..', 'mcp', 'server.mjs'),
  }));

  ipcMain.handle('app:assetUrl', async (_event, file) => {
    if (typeof file !== 'string' || !isAllowed(file)) return null;
    return 'texpro-asset://asset/?path=' + encodeURIComponent(path.resolve(file));
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock && fs.existsSync(appIconPath)) app.dock.setIcon(appIconPath);
  if (!fs.existsSync(path.join(demoSource, 'main.tex'))) {
    demoSource = path.join(app.getAppPath(), 'demo');
  }
  protocol.handle('texpro-asset', async (request) => {
    try {
      const url = new URL(request.url);
      const file = url.searchParams.get('path');
      if (!file) return new Response('Missing path', { status: 400 });
      if (!isAllowed(file)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    } catch (error) {
      return new Response(String(error), { status: 500 });
    }
  });

  registerIpc();
  buildMenu();
  menuActionHandlerReady = true;
  installElicitationBridge();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => { mcpClient.disconnectAll(); paperApi.stop(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || isSmoke) app.quit();
});

process.on('uncaughtException', (error) => {
  console.error('[main] uncaught exception', error);
});
