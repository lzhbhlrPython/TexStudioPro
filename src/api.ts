import type {
  AppInfo,
  AssetItem,
  CompileOutput,
  CompileResult,
  Engine,
  Project,
  ProjectSymbols,
  SearchResult,
  TemplateItem,
} from './types';

export interface TexProApi {
  openProjectDialog: () => Promise<Project | null>;
  openProject: (root: string) => Promise<Project>;
  createDemoProject: () => Promise<Project>;
  createProject: (options: {
    name: string;
    engine: Engine;
    files: Array<{ path: string; content: string }>;
  }) => Promise<Project | null>;
  listAssets: (root: string) => Promise<AssetItem[]>;
  importAssets: (root: string, assetsDir?: string) => Promise<AssetItem[]>;
  saveImageBuffer: (root: string, assetsDir: string, payload: { name: string; ext: string; data: Uint8Array }) => Promise<AssetItem>;
  rasterizeSvg: (root: string, file: string) => Promise<AssetItem>;
  convertSvgReferences: (root: string) => Promise<{ converted: number; updatedFiles: number }>;
  mcpConnect: (id: string, options: { command: string; args?: string[]; cwd?: string; env?: Record<string,string> }) => Promise<{ id: string; serverInfo: { name?: string; version?: string } | null; tools: Array<{ name: string; description?: string }> }>;
  mcpCall: (id: string, name: string, args: Record<string, unknown>) => Promise<unknown>;
  mcpDisconnect: (id: string) => Promise<{ ok: boolean }>;
  mcpClients: () => Promise<Array<{ id: string; pid: number; tools: Array<{ name: string; description?: string }> }>>;
  mcpConfigs: () => Promise<Array<{ id: string; name: string; command: string; args: string[] }>>;
  mcpSaveConfig: (config: { id: string; name: string; command: string; args: string[] }) => Promise<Array<{ id: string; name: string; command: string; args: string[] }>>;
  mcpRemoveConfig: (id: string) => Promise<Array<{ id: string; name: string; command: string; args: string[] }>>;
  onMcpElicitation: (callback: (payload: { id: number; request: { message?: string; requestedSchema?: { properties?: Record<string, { type?: string; title?: string; description?: string; enum?: string[]; default?: unknown }>; required?: string[] } } }) => void) => () => void;
  respondElicitation: (id: number, result: { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> }) => Promise<{ ok: boolean }>;
  scanCwlSources: (root: string | null) => Promise<Array<{ path: string; name: string; content: string }>>;
  setMenuLanguage: (language: string) => Promise<{ ok: boolean; language: string }>;
  startPaperApi: (root: string) => Promise<{ running: boolean; root: string; token: string; port: number; baseUrl: string }>;
  stopPaperApi: () => Promise<{ ok: boolean }>;
  paperApiStatus: () => Promise<{ running: boolean; root?: string; token?: string; port?: number; baseUrl?: string }>;
  runProjectAction: (root: string, action: { command: string; args: string[]; cwd?: string; env?: Record<string,string> }, rootFile: string) => Promise<{ ok: boolean; code: number | null; stdout: string; stderr: string; timedOut: boolean }>;
  checkTexAssets: (packages: string[], classes: string[]) => Promise<{ packages: Record<string, { installed: boolean; path: string }>; classes: Record<string, { installed: boolean; path: string }> }>;
  gitStatus: (root: string) => Promise<{ initialized: boolean; branch: string; changes: Array<{ status: string; file: string }>; ahead: number; behind: number; commits: Array<{ hash: string; subject: string }> }>;
  gitReadFile: (root: string, revision: string, file: string) => Promise<string>;
  gitInit: (root: string) => Promise<{ ok: boolean }>;
  gitCommit: (root: string, message: string) => Promise<{ ok: boolean; output: string }>;
  gitPull: (root: string) => Promise<{ ok: boolean; output: string }>;
  gitPush: (root: string) => Promise<{ ok: boolean; output: string }>;
  overleafClone: (url: string) => Promise<{ path: string }>;
  zoteroLibrary: () => Promise<{ content: string; bytes: number }>;
  zoteroSearch: (query: string) => Promise<{ results: Array<{ key: string; title: string; doi: string; author: string; year: string }> }>;
  zoteroBibtex: (key: string) => Promise<{ key: string; content: string }>;
  deleteAsset: (root: string, file: string) => Promise<AssetItem[]>;
  listUserTemplates: () => Promise<TemplateItem[]>;
  chooseImportFile: () => Promise<{ path: string; content: string; name: string } | null>;
  setSecret: (name: string, value: string) => Promise<{ ok: boolean; error?: string }>;
  getSecret: (name: string) => Promise<string | null>;
  deleteSecret: (name: string) => Promise<{ ok: boolean }>;
  lookupBibtex: (identifier: string) => Promise<{ entry: { type: string; key: string; fields: Record<string, string> }; source: string }>;
  chooseBibFile: () => Promise<{ path: string; content: string; name: string } | null>;
  renderMusicPreview: (payload: { projectRoot: string; source: string; runId: string }) => Promise<{ ok: boolean; bytes?: Uint8Array; error?: string; log?: string }>;
  renderTemplatePreview: (payload: { source: string; engine: string }) => Promise<{ ok: boolean; path?: string; cached?: boolean; dataUrl?: string; error?: string }>;
  saveUserTemplate: (payload: {
    name: string;
    description: string;
    engine: Engine;
    content: string;
  }) => Promise<TemplateItem>;
  deleteUserTemplate: (id: string) => Promise<TemplateItem[]>;
  projectSymbols: (root: string) => Promise<ProjectSymbols>;
  renderTikz: (options: {
    projectRoot: string;
    filePath: string;
    source: string;
    preamble?: string;
  }) => Promise<{
    ok: boolean;
    svgPath?: string;
    engine?: string;
    cacheKey?: string;
    cached?: boolean;
    error?: string;
    log?: string;
  }>;
  renameProjectFile: (root: string, file: string, name: string) => Promise<{ path: string; oldPath: string; updated: number; oldRelative: string; newRelative: string }>;
  moveProjectDirectory: (root: string, dir: string, name: string) => Promise<{ path: string; oldPath: string; updated: number; oldRelative: string; newRelative: string }>;
  projectImpact: (root: string, target: string) => Promise<{ files: number; assets: number; references: number }>;
  createProjectFolder: (root: string, parent: string, name: string) => Promise<{ path: string; relative: string }>;
  createProjectFile: (root: string, parent: string, name: string, content?: string) => Promise<{ path: string; relative: string }>;
  moveProjectFile: (root: string, file: string, targetDir: string) => Promise<{ path: string; oldPath: string; updated: number; oldRelative: string; newRelative: string }>;
  deleteProjectFile: (root: string, file: string) => Promise<{ ok: boolean; destination: string; relative: string }>;
  deleteProjectFolder: (root: string, dir: string) => Promise<{ ok: boolean; destination: string }>;
  startCollab: (options?: { port?: number }) => Promise<{ running: boolean; port?: number; room?: string; host?: string; url?: string }>;
  stopCollab: () => Promise<{ ok: boolean }>;
  collabStatus: () => Promise<{ running: boolean; port?: number; room?: string; host?: string; url?: string }>;
  backupProject: (root: string, options: { type: 'icloud' | 'webdav' | 'ssh'; destination?: string; url?: string; username?: string; password?: string; host?: string; user?: string; remotePath?: string; port?: string; keyPath?: string }) => Promise<{ ok: boolean; target: string; kind: string; size: number }>;
  createArxivPackage: (root: string) => Promise<{ ok: boolean; zipPath: string; files: number; engine: string; rootFile: string; size: number }>;
  fontCoverage: (root: string) => Promise<{
    scripts: Record<string, number>;
    declared: string[];
    fontChecks: Array<{ name: string; resolved: string; ok: boolean }>;
    pdfFonts: Array<{ name: string; type: string; embedded: boolean; unicode: boolean }>;
    issues: Array<{ severity: string; message: string; file: string; line: number }>;
    pdfPath: string | null;
  }>;
  historyList: (root: string) => Promise<Array<{ id: string; time: number; reason: string; files: string[]; size: number }>>;
  historyCommit: (root: string, reason: string) => Promise<{ ok: boolean; skipped?: boolean; reason?: string; version: { id: string; time: number; reason: string; files: string[]; size: number } | null }>;
  historyRead: (root: string, version: string, file: string) => Promise<string>;
  historyRestore: (root: string, version: string, file: string) => Promise<{ ok: boolean; file: string; bytes: number }>;
  historyDelete: (root: string, version: string) => Promise<{ ok: boolean; deleted: string; removed: number; bytes: number }>;
  historyClear: (root: string) => Promise<{ ok: boolean }>;
  projectGraph: (root: string) => Promise<{
    nodes: Array<{ id: string; type: 'file' | 'label' | 'citation'; label: string; file: string; line: number; orphan?: boolean }>;
    edges: Array<{ from: string; to: string; type: string }>;
  }>;
  diagnoseProject: (root: string) => Promise<{
    tools: Array<{ name: string; ok: boolean; path: string; required: boolean }>;
    issues: Array<{ severity: 'error' | 'warning'; kind: string; message: string; file: string; line: number }>;
    stats: { files: number; labels: number; refs: number; bibKeys: number; cites: number; packages: number; unusedLabels: number };
  }>;
  cleanBuild: (root: string, buildDir: string) => Promise<{ ok: boolean; removed: string }>;
  searchProject: (
    root: string,
    query: string,
    caseSensitive: boolean,
  ) => Promise<SearchResult[]>;
  readFile: (file: string) => Promise<string>;
  statFile: (file: string) => Promise<{ size: number; modified: number; name: string; ext: string; directory: boolean }>;
  writeFile: (file: string, content: string) => Promise<{ ok: boolean; savedAt: number }>;
  fileExists: (file: string) => Promise<boolean>;
  compile: (options: {
    projectRoot: string;
    activeFile?: string | null;
    rootFile?: string | null;
    engine?: Engine | null;
    runId?: string;
    buildDir?: string | null;
    timeoutMs?: number;
  }) => Promise<CompileResult>;
  onCompileOutput: (callback: (output: CompileOutput) => void) => () => void;
  cancelCompile: (runId: string) => Promise<{ ok: boolean; error?: string }>;
  readPdf: (file: string) => Promise<Uint8Array>;
  syncForward: (options: {
    projectRoot: string;
    texFile: string;
    pdfFile: string;
    line: number;
    column?: number;
  }) => Promise<{
    ok: boolean;
    page?: number;
    x?: number;
    y?: number;
    width?: number | null;
    height?: number | null;
    bounds?: { x: number; y: number; width: number; height: number };
    error?: string;
  }>;
  syncInverse: (options: {
    projectRoot: string;
    pdfFile: string;
    page: number;
    x: number;
    y: number;
  }) => Promise<{
    ok: boolean;
    file?: string;
    line?: number;
    column?: number;
    error?: string;
  }>;
  openExternal: (url: string) => Promise<{ ok: boolean }>;
  openPath: (file: string) => Promise<{ ok: boolean; error?: string | null }>;
  reveal: (file: string) => Promise<{ ok: boolean }>;
  assetUrl: (file: string) => Promise<string | null>;
  getInfo: () => Promise<AppInfo>;
  getSpellWords: () => Promise<string[]>;
  onMenuAction: (callback: (action: string) => void) => () => void;
}

declare global {
  interface Window {
    texpro: TexProApi;
  }
}
