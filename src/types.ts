export type ThemeName = 'studio' | 'night' | 'paper';
export type Language = 'zh' | 'en';
export type Engine = 'pdflatex' | 'xelatex' | 'lualatex';

export interface FileNode {
  type: 'dir' | 'file';
  name: string;
  path: string;
  relative: string;
  ext?: string;
  text?: boolean;
  size?: number;
  children?: FileNode[];
}

export interface Project {
  root: string;
  name: string;
  tree: FileNode[];
  rootFile: string | null;
  rootCandidates?: string[];
  rootSource?: 'configured' | 'detected' | 'ambiguous' | 'missing' | 'invalid';
  rootError?: string | null;
}

export interface BoxHotspot {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  message: string;
  severity: 'overfull' | 'underfull';
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  source?: string;
  box?: 'overfull' | 'underfull';
  amount?: number;
}

export interface CompileResult {
  ok: boolean;
  cancelled?: boolean;
  rootFile?: string;
  pdfPath?: string | null;
  logPath?: string;
  log?: string;
  diagnostics: Diagnostic[];
  engine?: Engine;
  duration: number;
  exitCode?: number | null;
  error?: string | null;
  warningCount?: number;
  errorCount?: number;
  command?: string;
  stdout?: string;
  stderr?: string;
}

export interface ProjectSymbols {
  labels: string[];
  citations: string[];
  environments: string[];
  packages: string[];
  images: Array<{ label: string; path: string; relative: string }>;
  references?: Array<{ key: string; file: string; line: number; text: string }>;
  bibliography?: Array<{ key: string; file: string; line: number; title: string; author: string; year: string }>;
  writingNotes?: Array<{ file: string; line: number; text: string; done: boolean }>;
}

export type OutlineKind =
  | 'part'
  | 'chapter'
  | 'section'
  | 'subsection'
  | 'subsubsection'
  | 'paragraph'
  | 'label'
  | 'equation'
  | 'todo';

export interface OutlineItem {
  id: string;
  kind: OutlineKind;
  title: string;
  line: number;
  level: number;
  label?: string;
  file?: string;
}

export interface CursorInfo {
  line: number;
  column: number;
  selected: number;
}

export interface SyncTarget {
  page: number;
  sourceLine?: number;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  bounds?: { x: number; y: number; width: number; height: number };
  manual?: boolean;
  key: number;
}

export interface SourceJump {
  file?: string;
  line: number;
  column?: number;
  endLine?: number;
  select?: boolean;
  key: number;
  flash?: boolean;
}

export interface AppInfo {
  version: string;
  name: string;
  platform: string;
  home: string;
  documents: string;
  userData: string;
  isDev: boolean;
  appPath: string;
  mcpPath: string;
}

export interface SearchResult {
  file: string;
  relative: string;
  line: number;
  text: string;
}

export interface Settings {
  theme: ThemeName;
  language: Language;
  fontSize: number;
  editorWidth: number;
  engine: Engine;
  autoCompile: boolean;
  compileMode: 'manual' | 'idle' | 'pdfOpen';
  aiEnabled: boolean;
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
  autoSave: boolean;
  followCursor: boolean;
  typewriter: boolean;
  focus: boolean;
  visual: boolean;
  collapsePreamble: boolean;
  showLineNumbers: boolean;
  spellcheck: boolean;
  smartPaste: boolean;
  pdfZoom: number;
}

export interface AssetItem {
  path: string;
  relative: string;
  name: string;
  ext: string;
  size: number;
  modified: number;
}

export interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  engine: Engine;
  content: string;
  builtin?: boolean;
}

export interface ReviewComment {
  id: string;
  file: string;
  line: number;
  snippet: string;
  text: string;
  author: string;
  createdAt: number;
  resolved: boolean;
}

export interface ProjectModule {
  file: string;
  title: string;
  included: boolean;
}

export interface ProjectConfig {
  rootFile?: string;
  directories: {
    modules: string;
    assets: string;
    build: string;
  };
  toc: {
    enabled: boolean;
    depth: number;
    numbered: boolean;
  };
  modules: ProjectModule[];
}

export interface RecentProject {
  root: string;
  name: string;
  openedAt: number;
}

export interface OpenDoc {
  path: string;
  content: string;
  savedContent: string;
  dirty: boolean;
}

export interface CompileOutput {
  runId: string;
  stream: 'stdout' | 'stderr' | 'meta';
  text: string;
  engine?: Engine;
  rootFile?: string;
}
