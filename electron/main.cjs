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

let menuLanguage = 'en';
const zhMenu = {
  'Close Project': '关闭工程', File: '文件', Edit: '编辑', Insert: '插入', Project: '项目', Build: '构建', Navigate: '导航', View: '视图',
  'Open Folder…': '打开文件夹…', Save: '保存',
  'Import Markdown / Typst…': '导入 Markdown / Typst…', 'Export Document…': '导出文档…',
  'Create arXiv Package…': '创建 arXiv 包…', 'Project Backup…': '项目备份…',
  'Template Library…': '模板库…', 'Template Workshop…': '模板工坊…',
  'Insert Music': '插入乐谱', 'Formula Editor…': '公式编辑器…', 'Display Equation': '独立公式', Table: '表格',
  'Visual Table Editor…': '可视化表格…', Figure: '图片', 'Code Block': '代码块',
  'Chart Studio…': '图表工作室…', 'Circuit Studio…': '电路工作室…',
  'Logic Studio…': '逻辑门工作室…', 'Structure Studio…': '结构式工作室…',
  'Ink Studio…': '手绘工作室…', 'TikZ Studio…': 'TikZ 工作室…', 'Page Layout…': '页面布局…',
  'Packages & Document Class…': '宏包与文档类…', 'Commands & Completions…': '命令与补全…',
  'Project Structure…': '项目结构…', 'Asset Library': '素材库', 'Bibliography…': '参考文献…',
  'Citation & Label Graph…': '引用与标签图…', 'Font Coverage…': '字体覆盖…',
  'Project Doctor…': '项目医生…', 'Version Review…': '版本审阅…',
  'LAN Collaboration…': '局域网协作…', 'Version Control…': '版本控制…',
  'Convert SVG Assets…': '转换 SVG 素材…', 'Comments…': '评论…', 'AI Assistant…': 'AI 助手…',
  'MCP Server…': 'MCP 服务器…', Compile: '编译', 'Cancel Compile': '取消编译',
  'Forward Search': '正向搜索', 'Command Palette…': '命令面板…', 'Toggle PDF Preview': '切换 PDF 预览',
  'Toggle Sidebar': '切换侧栏', 'Toggle Visual Mode': '切换可视模式',
  'Toggle Focus Mode': '切换专注模式', 'Typewriter Mode': '打字机模式',
  'Toggle Day / Night': '切换日间 / 夜间', 'Compile Theater…': '编译剧场…',
  'MCP Crew…': 'MCP 剧组…', 'Paper API…': '论文 API…', 'Plugin Market…': '插件市场…',
};

function localizeMenu(items) {
  return items.map((item) => {
    const next = { ...item };
    if (menuLanguage === 'zh' && next.label && zhMenu[next.label]) next.label = zhMenu[next.label];
    if (next.submenu) next.submenu = localizeMenu(next.submenu);
    return next;
  });
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
        { label: 'Close Project', accelerator: 'CmdOrCtrl+Shift+W', click: () => sendMenu('close-project') },
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
        tool('Insert Music', 'music'),
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
  Menu.setApplicationMenu(Menu.buildFromTemplate(localizeMenu(template)));
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
    if (process.env.TEXPRO_ASSETS_REGRESSION === '1') require('./assets-regression.cjs')(mainWindow, { app, ipcMain });
    else if (process.env.TEXPRO_MUSIC_REGRESSION === '1') require('./music-regression.cjs')(mainWindow, { app, ipcMain });
    else if (process.env.TEXPRO_REGRESSION === '1') require('./regression.cjs')(mainWindow, { app, ipcMain });
    else require('./smoke.cjs')(mainWindow, { app, isSmokeWelcome });
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

  ipcMain.handle('music:preview', async (_event, payload) => {
    if (!payload || typeof payload.projectRoot !== 'string' || !isAllowed(payload.projectRoot) || typeof payload.runId !== 'string' || !/^music-[a-f0-9-]{36}$/.test(payload.runId)) throw new Error('Project is not open');
    return tex.renderMusicPreview(payload);
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
  ipcMain.handle('menu:set-language', async (_event, language) => {
    menuLanguage = language === 'zh' ? 'zh' : 'en';
    buildMenu();
    return { ok: true, language: menuLanguage };
  });

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
    mcpPath: app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'mcp', 'server.mjs') : path.join(__dirname, '..', 'mcp', 'server.mjs'),
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

app.on('before-quit', () => { mcpClient.disconnectAll(); paperApi.stop(); collab.stopCollab(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || isSmoke) app.quit();
});

process.on('uncaughtException', (error) => {
  console.error('[main] uncaught exception', error);
});
