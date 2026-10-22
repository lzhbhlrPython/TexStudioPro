import { ensureTexPackages } from './lib/texDocument';
import { writingNotes, type WritingNote } from './lib/writingNotes';
import { figureWritingRange, writingFigure } from './lib/writingFigure';
import { writingPackages, writingSnippets } from './lib/writingSnippets';
import type { WritingTarget } from './editor/writingTargets';
import type { WritingPosition, WritingSessions } from './editor/writingSession';
import { musicBlock, newScore } from './lib/music';
import { TemplateGallery, PgfplotsStudio, PluginMarket, PaperStudio, CrewPanel, CompileTheater, CommandStudio, PackageManager, GitPanel, InkStudio, SchematicStudio, BackupPanel, VersionReview, FontCoverage, ProjectGraph, ArxivPanel, McpPanel, AIAssistant, CommentsPanel, ExportStudio, ProjectDoctor, TableStudio, ImportStudio, TemplateWorkshop, ProjectStudio, BibManager, FormulaStudio, LayoutStudio, TikzStudio } from './app/lazyTools';
import { SETTINGS_KEY, RECENT_KEY, loadSettings, loadRecent } from './app/settings';
import { findFirstTex, flattenFiles, isTextPath, normalizeFile, fileFromBuild, reanchorComments } from './app/project';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookMarked,
  Bold,
  Bot,
  FolderTree,
  BookOpen,
  Columns3,
  CircuitBoard,
  Clapperboard,
  CloudUpload,
  Code2,
  Command,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileInput,
  FlaskConical,
  Gavel,
  GitBranch,
  FolderOpen,
  Focus,
  History,
  Image,
  Italic,
  LayoutTemplate,
  List,
  MessageSquare,
  Moon,
  Music2,
  Network,
  Paintbrush,
  Package,
  PanelLeft,
  Plug,
  Stethoscope,
  PanelRight,
  PenTool,
  Play,
  Save,
  Search,
  Settings2,
  ShoppingBag,
  Sigma,
  Sparkles,
  Sun,
  Table2,
  Terminal,
  Users,
  Type,
} from 'lucide-react';
import type { Extension } from '@codemirror/state';
import type {
  AssetItem,
  CompileResult,
  Diagnostic,
  OpenDoc,
  Project,
  ProjectSymbols,
  RecentProject,
  SearchResult,
  Settings,
  SyncTarget,
  SourceJump,
  ProjectConfig,
  ReviewComment,
  TemplateItem,
} from './types';
import { getLanguage, setLanguage, t as tr, useI18n } from './i18n';
import { basename, collectLocalSymbols, computeStats, dirname, emptySymbols, formatDuration, parseOutline, relativePath, stem } from './lib/latex';
import { EditorPane, type EditorHandle } from './editor/EditorPane';
import { snippetLibrary } from './editor/completions';
import { escapeLatex, fillTemplate, slugify, type TemplateMeta } from './lib/templates';
import { defaultProjectConfig, moduleInputPath, normalizeProjectConfig } from './lib/projectConfig';
import type { ImportFormat } from './lib/importers';
import { TitleBar } from './components/TitleBar';
import type { MoreAction } from './components/MoreMenu';
import { Sidebar, type SidebarTab } from './components/Sidebar';
import { ProblemsPanel } from './components/ProblemsPanel';
import { StatusBar } from './components/StatusBar';
import { PdfPane } from './components/PdfPane';
import { Welcome } from './components/Welcome';
import { CommandPalette, type PaletteAction } from './components/CommandPalette';
import { SettingsPanel } from './components/SettingsPanel';
import { Toasts, type ToastItem } from './components/Toasts';
import { FilePreview } from './components/FilePreview';
import { parseActions, defaultActions, type ProjectAction } from './lib/actions';
import { parseCwl, parseMacros, type CwlCompletion } from './lib/cwl';
import { setCustomCompletions as applyCustomCompletions } from './editor/completions';
import { CollabPanel } from './components/CollabPanel';
import { McpElicitation, type ElicitationPayload } from './components/McpElicitation';
import type { SchematicMode } from './components/SchematicStudio';
import type { LayoutResult } from './components/LayoutStudio';

const PAGE_PARAMS = new URLSearchParams(window.location.search);
const SMOKE = PAGE_PARAMS.get('smoke') === '1';
const WELCOME_ONLY = PAGE_PARAMS.get('welcome') === '1';

export default function App() {
  const { t, language } = useI18n();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Record<string, OpenDoc>>({});
  const [activePath, setActivePath] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<ProjectSymbols>(emptySymbols);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const projectRefreshId = useRef(0);
  const [userTemplates, setUserTemplates] = useState<TemplateItem[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [tikzOpen, setTikzOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [formulaSeed, setFormulaSeed] = useState('');
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [bibOpen, setBibOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig>(defaultProjectConfig);
  const projectConfigRef = useRef(projectConfig);
  const [projectStudioOpen, setProjectStudioOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [tableRequest, setTableRequest] = useState<{ source: string; focusPos: number; insert: boolean } | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [spellWords, setSpellWords] = useState<Set<string>>(new Set());
  const [arxivOpen, setArxivOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [schematicMode, setSchematicMode] = useState<SchematicMode | null>(null);
  const [inkOpen, setInkOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [collabExtension, setCollabExtension] = useState<Extension | null>(null);
  const [collabFile, setCollabFile] = useState<string | null>(null);
  const [gitOpen, setGitOpen] = useState(false);
  const [gitManaged, setGitManaged] = useState(false);
  const [elicitation, setElicitation] = useState<ElicitationPayload | null>(null);
  const gitManagedRef = useRef(false);
  gitManagedRef.current = gitManaged;
  const [packageOpen, setPackageOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [zeroMode, setZeroMode] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);
  const [pluginOpen, setPluginOpen] = useState(false);
  const [actions, setActions] = useState<ProjectAction[]>(defaultActions);
  const [customCompletions, setCustomCompletions] = useState<CwlCompletion[]>([]);
  const [tikzSource, setTikzSource] = useState<string | null>(null);
  const [outline, setOutline] = useState<ReturnType<typeof parseOutline>>([]);
  const [cursor, setCursor] = useState({ line: 1, column: 1, selected: 0 });
  const [status, setStatus] = useState('Ready');

  const [compiling, setCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [boxHotspots, setBoxHotspots] = useState<import('./types').BoxHotspot[]>([]);
  const [compileLog, setCompileLog] = useState('');
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [previousPdfBytes, setPreviousPdfBytes] = useState<Uint8Array | null>(null);
  const pdfBytesRef = useRef<Uint8Array | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [syncTarget, setSyncTarget] = useState<SyncTarget | null>(null);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('files');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recent, setRecent] = useState<RecentProject[]>(loadRecent);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [gotoRequest, setGotoRequest] = useState<SourceJump | null>(null);
  const syncGeneration = useRef(0);
  const inverseGeneration = useRef(0);
  const navigationGeneration = useRef(0);
  const syncPauseUntil = useRef(0);
  const [openingFile, setOpeningFile] = useState<string | null>(null);

  const projectRef = useRef<Project | null>(null);
  const projectGeneration = useRef(0);
  const closingProject = useRef(false);
  const [closing, setClosing] = useState(false);
  const docsRef = useRef(docs);
  const activePathRef = useRef(activePath);
  const cursorRef = useRef(cursor);
  const pdfPathRef = useRef(pdfPath);
  const compilingRef = useRef(false);
  const compileRunId = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  const editorRef = useRef<EditorHandle | null>(null);
  const writingSessions = useRef<WritingSessions>(new Map());
  const writingTrail = useRef<WritingPosition[]>([]);
  const compiledSources = useRef<Record<string, string>>({});
  const toastId = useRef(0);
  const openRequest = useRef(0);
  const autoCompileBase = useRef('');
  const autoCompilePath = useRef('');
  const demoCompileAttempted = useRef(false);
  const pendingCompile = useRef(false);
  const secretReady = useRef(false);
  const keychainErrorShown = useRef(false);
  const runCompileRef = useRef<(() => Promise<void>) | null>(null);
  const moreActionsRef = useRef<MoreAction[]>([]);

  projectRef.current = project;
  projectConfigRef.current = projectConfig;
  docsRef.current = docs;
  activePathRef.current = activePath;
  cursorRef.current = cursor;
  pdfPathRef.current = pdfPath;
  pdfBytesRef.current = pdfBytes;
  settingsRef.current = settings;

  const activeDoc = activePath ? docs[activePath] : undefined;
  const deferredContent = useDeferredValue(activeDoc?.content || '');

  const pushToast = useCallback((message: string, kind: ToastItem['kind'] = 'info', detail?: string) => {
    const id = 'toast-' + ++toastId.current;
    setToasts((current) => [...current.slice(-3), { id, message, kind, detail }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, kind === 'error' ? 6000 : 3800);
  }, []);

  useEffect(() => {
    setLanguage(settings.language);
    void window.texpro.setMenuLanguage(settings.language).catch(() => undefined);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, aiApiKey: '' }));
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty('--editor-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--editor-width', `${settings.editorWidth}px`);
  }, [settings]);

  useEffect(() => {
    if (!settings.spellcheck) {
      setSpellWords(new Set());
      return;
    }
    let cancelled = false;
    void window.texpro.getSpellWords().then((words) => {
      if (!cancelled) setSpellWords(new Set(words));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [settings.spellcheck]);

  useEffect(() => {
    void window.texpro.getSecret('aiApiKey').then((key) => {
      if (key) setSettings((current) => ({ ...current, aiApiKey: key }));
    }).finally(() => { secretReady.current = true; });
  }, []);

  useEffect(() => {
    if (!secretReady.current) return;
    const timer = window.setTimeout(() => {
      if (settings.aiApiKey.trim()) {
        void window.texpro.setSecret('aiApiKey', settings.aiApiKey.trim()).then((result) => {
          if (!result.ok && !keychainErrorShown.current) {
            keychainErrorShown.current = true;
            pushToast(tr('Could not store API key in the OS keychain'), 'error', result.error || '');
          }
        }).catch(() => undefined);
      } else {
        void window.texpro.deleteSecret('aiApiKey').catch(() => undefined);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [settings.aiApiKey, pushToast, tr]);

  useEffect(() => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8)));
  }, [recent]);

  useEffect(() => {
    document.title = activeDoc
      ? `${activeDoc.dirty ? '• ' : ''}${activeDoc.path.split('/').pop()} — TeXPro`
      : 'TeXPro — Visual LaTeX Workbench';
  }, [activeDoc]);

  useEffect(() => {
    setOutline(activeDoc ? parseOutline(deferredContent, activeDoc.path) : []);
  }, [deferredContent, activeDoc?.path]);

  useEffect(() => {
    if (!activePath || !comments.length) return;
    const timer = window.setTimeout(() => {
      let changed = false;
      const next = comments.map((comment) => {
        if (comment.file !== activePath || !comment.snippet.trim()) return comment;
        const needle = comment.snippet.trim();
        const indices: number[] = [];
        let index = deferredContent.indexOf(needle);
        while (index >= 0 && indices.length < 40) {
          indices.push(index);
          index = deferredContent.indexOf(needle, index + 1);
        }
        if (!indices.length) return comment;
        const lineOf = (position: number) => deferredContent.slice(0, position).split('\n').length;
        const best = indices.map(lineOf).sort((a, b) => Math.abs(a - comment.line) - Math.abs(b - comment.line))[0];
        if (best && best !== comment.line) {
          changed = true;
          return { ...comment, line: best };
        }
        return comment;
      });
      if (changed) {
        setComments(next);
        const currentProject = projectRef.current;
        if (currentProject) void window.texpro.writeFile(`${currentProject.root}/.texpro/comments.json`, JSON.stringify(next, null, 2));
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [deferredContent, activePath, comments]);

  const effectiveSymbols = useMemo(
    () => {
      const indexed = Object.values(docs).reduce((all, doc) => collectLocalSymbols(doc.content, all, doc.path), symbols);
      const images = new Map(indexed.images.map(image => [image.path, image]));
      for (const asset of assets) images.set(asset.path, { ...asset, label: asset.name });
      return { ...indexed, images: [...images.values()] };
    },
    [docs, symbols, assets],
  );

  const stats = useMemo(
    () => computeStats(deferredContent),
    [deferredContent],
  );

  const notes = useMemo(() => [
    ...(symbols.writingNotes || []).filter(note => !docs[note.file]),
    ...Object.values(docs).flatMap(doc => /\.(tex|ltx)$/i.test(doc.path) ? writingNotes(doc.content, doc.path) : []),
  ], [docs, symbols]);

  const bibFiles = useMemo(
    () => (project ? flattenFiles(project.tree).filter((node) => node.ext === '.bib').map((node) => node.path) : []),
    [project],
  );

  const resetBuildForMain = useCallback(() => {
    projectGeneration.current++; syncGeneration.current++; inverseGeneration.current++;
    pendingCompile.current = false;
    if (compileRunId.current) void window.texpro.cancelCompile(compileRunId.current).catch(() => undefined);
    compileRunId.current = null; compilingRef.current = false; setCompiling(false);
    setCompileResult(null); setCompileLog(''); setDiagnostics([]); setBoxHotspots([]);
    pdfPathRef.current = null; pdfBytesRef.current = null;
    setPdfPath(null); setPdfBytes(null); setPreviousPdfBytes(null); setSyncTarget(null); setPage(1);
  }, []);

  const refreshProjectData = useCallback(async () => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const generation = projectGeneration.current;
    const request = ++projectRefreshId.current;
    try {
      const [refreshed, nextSymbols, nextAssets] = await Promise.all([
        window.texpro.openProject(currentProject.root),
        window.texpro.projectSymbols(currentProject.root),
        window.texpro.listAssets(currentProject.root),
      ]);
      if (projectRef.current?.root !== currentProject.root || projectGeneration.current !== generation || request !== projectRefreshId.current) return;
      if (projectRef.current.rootFile !== refreshed.rootFile) resetBuildForMain();
      projectRef.current = refreshed;
      setProject(refreshed);
      setSymbols(nextSymbols);
      assetsRef.current = nextAssets;
      setAssets(nextAssets);
      const files = new Set([...flattenFiles(refreshed.tree), ...nextAssets].map(file => file.path));
      setPreviewFile(current => current && !files.has(current) ? null : current);
    } catch {
      // keep the existing index
    }
  }, [resetBuildForMain]);

  const rememberProject = useCallback((next: Project) => {
    setRecent((current) => {
      const entry: RecentProject = { root: next.root, name: next.name, openedAt: Date.now() };
      return [entry, ...current.filter((item) => item.root !== next.root)].slice(0, 8);
    });
  }, []);

  const openFile = useCallback(
    async (path: string, line?: number) => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      if (!isTextPath(path)) {
        pushToast(tr('This file is not editable text'), 'info', path.split('/').pop());
        return;
      }
      if (path !== activePathRef.current) setSyncTarget(null);
      const requestId = ++openRequest.current;
      setGotoRequest(null);
      setPreviewFile(null);
      setActivePath(path);
      if (!docsRef.current[path]) {
        setOpeningFile(path);
        try {
          const content = await window.texpro.readFile(path);
          if (requestId !== openRequest.current) return;
          setDocs((current) =>
            current[path]
              ? current
              : {
                  ...current,
                  [path]: { path, content, savedContent: content, dirty: false },
                },
          );
        } catch (error) {
          pushToast(tr('Could not open file'), 'error', String(error));
          setActivePath(null);
        } finally {
          if (requestId === openRequest.current) setOpeningFile(null);
        }
      }
      if (line) setGotoRequest({ file: path, line, key: Date.now() });
    },
    [pushToast],
  );

  const saveDoc = useCallback(
    async (path: string, notify: boolean) => {
      const doc = docsRef.current[path];
      if (!doc || !doc.dirty) {
        if (notify) pushToast(tr('No changes to save'), 'info');
        return true;
      }
      const snapshot = doc.content;
      try {
        await window.texpro.writeFile(path, snapshot);
        setDocs((current) => {
          const latest = current[path];
          if (!latest) return current;
          return {
            ...current,
            [path]: {
              ...latest,
              savedContent: snapshot,
              dirty: latest.content !== snapshot,
            },
          };
        });
        if (notify) {
          pushToast(tr('Saved'), 'success', path.split('/').pop());
          const currentProject = projectRef.current;
          if (currentProject && !gitManagedRef.current) void window.texpro.historyCommit(currentProject.root, 'save');
        }
        return true;
      } catch (error) {
        pushToast(tr('Save failed'), 'error', String(error));
        return false;
      }
    },
    [pushToast],
  );

  const saveAll = useCallback(async () => {
    const dirty = Object.values(docsRef.current).filter((doc) => doc.dirty);
    for (const doc of dirty) {
      const ok = await saveDoc(doc.path, false);
      if (!ok) return false;
    }
    return true;
  }, [saveDoc]);

  const saveActive = useCallback(async () => {
    const path = activePathRef.current;
    const dirty = Object.values(docsRef.current).some(doc => doc.dirty);
    if (!(await saveAll())) return;
    pushToast(tr(dirty ? 'Saved' : 'No changes to save'), dirty ? 'success' : 'info', path?.split('/').pop());
    const current = projectRef.current;
    if (dirty && current && !gitManagedRef.current) void window.texpro.historyCommit(current.root, 'save');
  }, [saveAll, pushToast]);


  const loadProject = useCallback(
    async (next: Project) => {
      if (projectRef.current && !(await saveAll())) return;
      const generation = ++projectGeneration.current;
      pendingCompile.current = false;
      if (compileRunId.current) await window.texpro.cancelCompile(compileRunId.current);
      compileRunId.current = null;
      compilingRef.current = false;
      setCompiling(false);
      syncGeneration.current++;
      inverseGeneration.current++;
      navigationGeneration.current++;
      openRequest.current++;
      activePathRef.current = null;
      projectRef.current = next;
      writingSessions.current = new Map(); writingTrail.current = []; compiledSources.current = {};
      setProject(next);
      setDocs({});
      docsRef.current = {};
      setActivePath(null);
      setPreviewFile(null);
      setOutline([]);
      setCompileResult(null);
      setCompileLog('');
      setDiagnostics([]);
      setBoxHotspots([]);
      setPdfBytes(null);
      setPreviousPdfBytes(null);
      setPdfPath(null);
      pdfPathRef.current = null;
      setSyncTarget(null);
      setProblemsOpen(false);
      setPage(1);
      setGotoRequest(null);
      setSymbols(emptySymbols);
      setAssets([]);
      autoCompileBase.current = '';
      autoCompilePath.current = '';
      demoCompileAttempted.current = false;
      rememberProject(next);

      let loadedConfig = defaultProjectConfig;
      try {
        const configPath = `${next.root}/.texpro/project.json`;
        if (await window.texpro.fileExists(configPath)) {
          const rawConfig = await window.texpro.readFile(configPath);
          loadedConfig = normalizeProjectConfig(JSON.parse(rawConfig));
        }
      } catch {
        // use defaults for projects without a config
      }
      if (generation !== projectGeneration.current) return;
      projectConfigRef.current = loadedConfig;
      setProjectConfig(loadedConfig);

      window.texpro
        .projectSymbols(next.root)
        .then((found) => { if (generation === projectGeneration.current) setSymbols(found); })
        .catch(() => undefined);
      window.texpro
        .listAssets(next.root)
        .then((found) => { if (generation === projectGeneration.current) setAssets(found); })
        .catch(() => { if (generation === projectGeneration.current) setAssets([]); });
      setComments([]);
      const commentsPath = `${next.root}/.texpro/comments.json`;
      if (await window.texpro.fileExists(commentsPath)) {
        void window.texpro
          .readFile(commentsPath)
          .then(async (raw) => {
            const parsed = JSON.parse(raw) as ReviewComment[];
            const anchored = await reanchorComments(next.root, next.tree, parsed);
            if (generation !== projectGeneration.current) return;
            setComments(anchored);
            if (JSON.stringify(anchored) !== JSON.stringify(parsed)) {
              await window.texpro.writeFile(commentsPath, JSON.stringify(anchored, null, 2));
            }
          })
          .catch(() => undefined);
      }

      if (generation !== projectGeneration.current) return;
      const target = next.rootFile || findFirstTex(next.tree);
      if (!target) {
        pushToast(tr('No .tex file found'), 'info', 'Create a file with \\documentclass to begin.');
        return;
      }
      await openFile(target);

      if (!next.rootFile || generation !== projectGeneration.current) return;
      const cached = fileFromBuild(next.root, next.rootFile, loadedConfig.directories.build);
      try {
        if (await window.texpro.fileExists(cached)) {
          const bytes = await window.texpro.readPdf(cached);
          if (generation !== projectGeneration.current) return;
          setPdfBytes(bytes);
          setPreviousPdfBytes(null);
          setPdfPath(cached);
          pdfPathRef.current = cached;
        }
      } catch {
        // a stale or unreadable build is not an error worth interrupting the user
      }
    },
    [openFile, pushToast, rememberProject, saveAll],
  );

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      window.texpro
        .listUserTemplates()
        .then((templates) => {
          if (!cancelled) setUserTemplates(templates);
        })
        .catch(() => undefined);
      if (WELCOME_ONLY) return;
      if (SMOKE) {
        try {
          const demo = await window.texpro.createDemoProject();
          if (!cancelled) await loadProject(demo);
        } catch (error) {
          pushToast(tr('Demo project failed to open'), 'error', String(error));
        }
        return;
      }
      const latest = loadRecent()[0];
      if (latest) {
        try {
          const next = await window.texpro.openProject(latest.root);
          if (!cancelled) await loadProject(next);
        } catch {
          setRecent((current) => current.filter((item) => item.root !== latest.root));
        }
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [loadProject, pushToast]);

  useEffect(() => { applyCustomCompletions(customCompletions); }, [customCompletions]);

  useEffect(() => {
    if (!collabExtension || !collabFile || !activePath) return;
    if (collabFile !== activePath) {
      setCollabExtension(null);
      setCollabFile(null);
    }
  }, [activePath, collabExtension, collabFile]);

  useEffect(() => {
    if (!zeroMode) return;
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') setZeroMode(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zeroMode]);

  useEffect(() => {
    if (!project) {
      setGitManaged(false);
      return;
    }
    let cancelled = false;
    const check = () => { void window.texpro.gitStatus(project.root).then((status) => {
      if (!cancelled) setGitManaged(Boolean(status.initialized));
    }).catch(() => { if (!cancelled) setGitManaged(false); }); };
    check();
    window.addEventListener('focus', check);
    return () => { cancelled = true; window.removeEventListener('focus', check); };
  }, [project?.root]);

  useEffect(() => {
    if (!project) {
      applyCustomCompletions([]);
      setCustomCompletions([]);
      setActions(defaultActions);
      return;
    }
    let cancelled = false;
    const root = project.root;
    const readOptional = async (file: string) => {
      try { return (await window.texpro.fileExists(file)) ? await window.texpro.readFile(file) : ''; }
      catch { return ''; }
    };
    Promise.all([
      readOptional(`${root}/.texpro/completions.cwl`),
      readOptional(`${root}/.texpro/macros.json`),
      readOptional(`${root}/.texpro/actions.json`),
      window.texpro.scanCwlSources(root).catch(() => []),
    ]).then(([cwl, macros, actionText, scanned]) => {
      if (cancelled) return;
      const cwlItems = [parseCwl(cwl), ...scanned.map((file) => parseCwl(file.content))].flat();
      const seen = new Set<string>();
      const uniqueCwl = cwlItems.filter((item) => {
        const key = `${item.label}:${item.template}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const items = [...uniqueCwl, ...parseMacros(macros)];
      setCustomCompletions(items);
      applyCustomCompletions(items);
      setActions(parseActions(actionText) || defaultActions);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [project?.root]);

  useEffect(() => {
    if (!settings.autoSave || !activeDoc?.dirty) return;
    const docPath = activeDoc.path;
    const timer = window.setTimeout(() => {
      void saveDoc(docPath, false);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [activeDoc?.content, activeDoc?.dirty, activeDoc?.path, saveDoc, settings.autoSave]);

  useEffect(() => {
    const unsubscribe = window.texpro.onMcpElicitation((payload) => setElicitation(payload));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.texpro.onCompileOutput((output) => {
      if (!compileRunId.current || output.runId !== compileRunId.current) return;
      if (output.stream === 'meta') {
        setCompileLog((current) => (current + '\n' + output.text).slice(-90000));
      } else {
        setCompileLog((current) => (current + output.text).slice(-90000));
      }
    });
    return unsubscribe;
  }, []);

  const runCompile = useCallback(async () => {
    if (compilingRef.current) {
      pendingCompile.current = true;
      return;
    }
    const currentProject = projectRef.current;
    const currentFile = activePathRef.current;
    if (!currentProject || compilingRef.current || closingProject.current) return;
    const generation = projectGeneration.current;
    compilingRef.current = true;
    setCompiling(true);
    setStatus('Typesetting');
    setCompileLog('');
    const runId = 'run-' + Date.now();
    compileRunId.current = runId;
    try {
      const saved = await saveAll();
      if (!saved || generation !== projectGeneration.current) return;
      const compileProject = await window.texpro.openProject(currentProject.root);
      if (generation !== projectGeneration.current) return;
      if (currentProject.rootFile !== compileProject.rootFile) {
        pdfPathRef.current = null; pdfBytesRef.current = null; setPdfPath(null); setPdfBytes(null); setPreviousPdfBytes(null);
        setSyncTarget(null); setCompileResult(null); setDiagnostics([]); setBoxHotspots([]);
        syncGeneration.current++; inverseGeneration.current++;
      }
      projectRef.current = compileProject; setProject(compileProject);
      if (!compileProject.rootFile) {
        setSidebarOpen(true); setSidebarTab('files'); setStatus('Ready');
        pushToast(tr('Choose main file'), 'error', compileProject.rootError || undefined);
        return;
      }
      const sourceSnapshot = Object.fromEntries(Object.values(docsRef.current).map(doc => [doc.path, doc.content]));
      const result = await window.texpro.compile({
        projectRoot: currentProject.root,
        activeFile: currentFile,
        rootFile: compileProject.rootFile,
        engine: settingsRef.current.engine,
        runId,
        buildDir: projectConfigRef.current.directories.build,
      });
      if (generation !== projectGeneration.current || compileRunId.current !== runId) return;
      setCompileResult(result);
      compiledSources.current = sourceSnapshot;
      setDiagnostics(result.diagnostics || []);
      if (result.cancelled) {
        setStatus(tr('Compilation cancelled'));
        pushToast(tr('Compilation cancelled'), 'info');
      } else if (result.ok && result.pdfPath) {
        const bytes = await window.texpro.readPdf(result.pdfPath);
        if (generation !== projectGeneration.current || compileRunId.current !== runId) return;
        if (pdfBytesRef.current?.length) setPreviousPdfBytes(pdfBytesRef.current);
        setPdfBytes(bytes);
        setPdfPath(result.pdfPath);
        pdfPathRef.current = result.pdfPath;
        setStatus(t('Compiled in {duration}', { duration: formatDuration(result.duration) }));
        pushToast(t('Compiled'), 'success', `${result.engine} · ${formatDuration(result.duration)}`);
      } else {
        setProblemsOpen(true);
        setStatus(t('Compile failed'));
        pushToast(
          t('Compile failed'),
          'error',
          result.error || `${result.errorCount || 0} errors · ${result.warningCount || 0} warnings`,
        );
      }
    } catch (error) {
      if (generation !== projectGeneration.current) return;
      setStatus('Compile failed');
      pushToast(tr('Compiler error'), 'error', String(error));
    } finally {
      if (compileRunId.current === runId) {
        compilingRef.current = false;
        compileRunId.current = null;
        setCompiling(false);
      }
    }
  }, [pushToast, saveAll]);

  const handleCloseProject = useCallback(async () => {
    if (!projectRef.current || closingProject.current) return;
    closingProject.current = true; setClosing(true);
    pendingCompile.current = false;
    try {
      if (!(await saveAll())) return;
      if (compileRunId.current) await window.texpro.cancelCompile(compileRunId.current);
      await window.texpro.stopCollab();
      projectGeneration.current++; syncGeneration.current++; inverseGeneration.current++; navigationGeneration.current++; openRequest.current++;
      compileRunId.current = null; compilingRef.current = false; setCompiling(false);
      projectRef.current = null; setProject(null);
      writingSessions.current = new Map(); writingTrail.current = []; compiledSources.current = {};
      docsRef.current = {}; setDocs({}); activePathRef.current = null; setActivePath(null); setOpeningFile(null);
      pdfPathRef.current = null; pdfBytesRef.current = null; setPdfPath(null); setPdfBytes(null); setPreviousPdfBytes(null);
      setPreviewFile(null); setOutline([]); setSymbols(emptySymbols); setAssets([]); setComments([]); setGotoRequest(null);
      setSyncTarget(null); setCompileResult(null); setCompileLog(''); setDiagnostics([]); setBoxHotspots([]); setPage(1);
      setProblemsOpen(false); setPdfOpen(false); setStatus('Ready'); setCursor({line:1,column:1,selected:0});
      projectConfigRef.current = defaultProjectConfig; setProjectConfig(defaultProjectConfig);
      setCollabExtension(null); setCollabFile(null); setCollabOpen(false); setSchematicMode(null);
      setTemplatesOpen(false); setWorkshopOpen(false); setImportOpen(false); setMcpOpen(false); setElicitation(null);
      setProjectStudioOpen(false); setLayoutOpen(false); setTableRequest(null); setTikzOpen(false); setChartOpen(false);
      setBibOpen(false); setDoctorOpen(false); setExportOpen(false); setCommentsOpen(false); setAiOpen(false);
      setArxivOpen(false); setGraphOpen(false); setFontOpen(false); setVersionOpen(false); setBackupOpen(false);
      setInkOpen(false); setGitOpen(false); setPackageOpen(false); setCommandOpen(false); setTheaterOpen(false);
      setCrewOpen(false); setPaperOpen(false); setPluginOpen(false); setPaletteOpen(false); setZeroMode(false);
    } catch (error) { pushToast(tr('Could not close project'), 'error', String(error)); }
    finally { closingProject.current = false; setClosing(false); }
  }, [saveAll, pushToast]);

  runCompileRef.current = runCompile;

  const cancelCompile = useCallback(async () => {
    pendingCompile.current = false;
    const runId = compileRunId.current;
    if (!runId) return;
    try {
      const result = await window.texpro.cancelCompile(runId);
      if (result.ok) {
        setStatus(tr('Cancelling…'));
        pushToast(tr('Cancelling…'), 'info');
      } else {
        pushToast(tr('Could not cancel compilation'), 'error', result.error);
      }
    } catch (error) {
      pushToast(tr('Could not cancel compilation'), 'error', String(error));
    }
  }, [pushToast]);

  useEffect(() => {
    syncGeneration.current++;
    inverseGeneration.current++;
    setSyncTarget(null);
  }, [project?.root, activePath, pdfBytes]);

  const forwardSync = useCallback(
    async (line = cursorRef.current.line, column = cursorRef.current.column, quiet = true) => {
      const currentProject = projectRef.current;
      const texFile = activePathRef.current;
      const currentPdf = pdfPathRef.current;
      if (!currentProject || !texFile || !currentPdf) {
        if (!quiet) pushToast(tr('Compile first to enable SyncTeX'), 'info');
        return;
      }
      if (quiet && Date.now() < syncPauseUntil.current) return;
      const request = ++syncGeneration.current;
      try {
        const result = await window.texpro.syncForward({
          projectRoot: currentProject.root,
          texFile,
          pdfFile: currentPdf,
          line,
          column: Math.max(0, column - 1),
        });
        if (request !== syncGeneration.current || currentPdf !== pdfPathRef.current || texFile !== activePathRef.current) return;
        if (result.ok && result.page) {
          setSyncTarget((previous) => quiet && previous?.sourceLine === line && previous.page === result.page ? previous : ({
            page: result.page!,
            x: result.x || 0,
            y: result.y || 0,
            width: result.width,
            height: result.height,
            bounds: result.bounds,
            manual: !quiet,
            sourceLine: line,
            key: Date.now(),
          }));
          if (!quiet) setPdfOpen(true);
        } else if (!quiet) {
          pushToast(tr('No SyncTeX result'), 'error', result.error);
        }
      } catch (error) {
        if (!quiet && request === syncGeneration.current) pushToast(tr('Forward search failed'), 'error', String(error));
      }
    },
    [pushToast],
  );

  const manualForwardSync = useCallback(() => {
    void forwardSync(cursorRef.current.line, cursorRef.current.column, false);
  }, [forwardSync]);

  useEffect(() => {
    if (!settings.followCursor || !pdfOpen || !pdfPath || !activePath || compiling) return;
    const timer = window.setTimeout(() => {
      void forwardSync(cursor.line, cursor.column, true);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [cursor.line, cursor.column, settings.followCursor, pdfOpen, pdfPath, activePath, compiling, forwardSync]);

  useEffect(() => {
    if (!settings.autoCompile || settings.compileMode === 'manual' || !activeDoc) return;
    if (settings.compileMode === 'pdfOpen' && !pdfOpen) return;
    const key = `${activeDoc.path}:${activeDoc.content}`;
    if (autoCompilePath.current !== activeDoc.path) {
      autoCompilePath.current = activeDoc.path;
      autoCompileBase.current = key;
      return;
    }
    if (autoCompileBase.current === key) return;
    autoCompileBase.current = key;
    const timer = window.setTimeout(() => {
      if (!compilingRef.current) void runCompile();
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [activeDoc?.content, activeDoc?.path, settings.autoCompile, settings.compileMode, pdfOpen, runCompile]);

  useEffect(() => {
    if (!pdfPath) {
      setBoxHotspots([]);
      return;
    }
    const boxes = diagnostics.filter((item) => item.source === 'typeset' && item.line).slice(0, 80);
    if (!boxes.length) {
      setBoxHotspots([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const spots = [];
      for (const box of boxes) {
        if (cancelled) return;
        const file = box.file || activePathRef.current;
        if (!file) continue;
        try {
          const result = await window.texpro.syncForward({
            projectRoot: projectRef.current?.root || '',
            texFile: file,
            pdfFile: pdfPath,
            line: box.line || 1,
            column: 1,
          });
          if (result.ok && result.page) {
            spots.push({
              page: result.page,
              x: result.x || 0,
              y: result.y || 0,
              width: result.width || 120,
              height: result.height || 12,
              ...(result.bounds || {}),
              message: box.message,
              severity: box.box || (/^Underfull/.test(box.message) ? 'underfull' : 'overfull'),
            });
          }
        } catch {
          // ignore unavailable SyncTeX for a box
        }
      }
      if (!cancelled) setBoxHotspots(spots as import('./types').BoxHotspot[]);
    })();
    return () => { cancelled = true; };
  }, [diagnostics, pdfPath]);

  useEffect(() => {
    if (!project || pdfBytes || compiling || demoCompileAttempted.current) return;
    if (project.name !== 'demo-project') return;
    demoCompileAttempted.current = true;
    const timer = window.setTimeout(() => void runCompile(), 1100);
    return () => window.clearTimeout(timer);
  }, [project, pdfBytes, compiling, runCompile]);

  const gotoLocation = useCallback(
    async (file: string | undefined, line: number, column?: number, flash = false, endLine?: number, select = false) => {
      const origin = editorRef.current?.getPosition();
      if (origin) { writingTrail.current.push(origin); writingTrail.current = writingTrail.current.slice(-80); }
      const navigation = ++navigationGeneration.current;
      if (file && normalizeFile(file) !== normalizeFile(activePathRef.current || '')) {
        await openFile(normalizeFile(file));
      }
      if (navigation === navigationGeneration.current) setGotoRequest({ file: file ? normalizeFile(file) : undefined, line, column, endLine, select, key: navigation, flash });
    },
    [openFile],
  );

  const returnToWriting = useCallback(async () => {
    const point = writingTrail.current.pop(); if (!point) return;
    const generation = projectGeneration.current;
    await openFile(point.file);
    for (let frame = 0; frame < 30 && editorRef.current?.getPath() !== point.file; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (generation === projectGeneration.current && editorRef.current?.getPath() === point.file) editorRef.current.restorePosition(point);
  }, [openFile]);

  useEffect(() => {
    const back = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); void returnToWriting(); } };
    window.addEventListener('keydown', back);
    return () => window.removeEventListener('keydown', back);
  }, [returnToWriting]);

  useEffect(() => {
    const jump = (event: Event) => {
      const target = (event as CustomEvent<{ file: string; line: number }>).detail;
      const root = projectRef.current?.root;
      if (root && target?.file.startsWith(root + '/')) void gotoLocation(target.file, target.line, 1, true);
    };
    window.addEventListener('texpro:writing-jump', jump);
    return () => window.removeEventListener('texpro:writing-jump', jump);
  }, [gotoLocation]);

  const toggleNote = useCallback(async (note: WritingNote) => {
    const generation = projectGeneration.current;
    await gotoLocation(note.file, note.line);
    for (let frame = 0; frame < 30 && editorRef.current?.getPath() !== note.file; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (generation !== projectGeneration.current || editorRef.current?.getPath() !== note.file) return;
    if (!editorRef.current.toggleNote(note)) { pushToast(tr('Note moved. Refreshing its location.'), 'info'); void refreshProjectData(); }
  }, [gotoLocation, pushToast, refreshProjectData]);

  const handleDiagnosticClick = useCallback(
    (diagnostic: Diagnostic) => {
      if (!diagnostic.line) {
        pushToast(diagnostic.message, 'info');
        return;
      }
      void gotoLocation(diagnostic.file, diagnostic.line, diagnostic.column);
    },
    [gotoLocation, pushToast],
  );

  const handleInverse = useCallback(
    async (pageNumber: number, x: number, y: number, points?: { x: number; y: number }[]) => {
      const currentProject = projectRef.current;
      const currentPdf = pdfPathRef.current;
      if (!currentProject || !currentPdf) return;
      const request = ++inverseGeneration.current;
      syncGeneration.current++;
      syncPauseUntil.current = Date.now() + 1800;
      try {
        const results = await Promise.all((points?.length ? points.slice(0, 7) : [{ x, y }]).map((point) => window.texpro.syncInverse({
          projectRoot: currentProject.root,
          pdfFile: currentPdf,
          page: pageNumber,
          x: point.x,
          y: point.y,
        })));
        if (request !== inverseGeneration.current || currentPdf !== pdfPathRef.current || currentProject.root !== projectRef.current?.root) return;
        const valid = results.filter((result) => result.ok && result.file && result.line);
        const groups = new Map<string, typeof valid>();
        for (const result of valid) {
          const file = normalizeFile(result.file!);
          groups.set(file, [...(groups.get(file) || []), result]);
        }
        const match = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
        if (match) {
          const [file, locations] = match;
          const lines = locations.map((result) => result.line!);
          syncPauseUntil.current = Date.now() + 1800;
          await gotoLocation(file, Math.min(...lines), locations[0].column, true, Math.max(...lines), true);
          if (groups.size > 1) pushToast(tr('Region crosses source files. Showing the largest matching range.'), 'info');
        } else {
          pushToast(tr('No source location at this point'), 'info', results[0]?.error);
        }
      } catch (error) {
        if (request === inverseGeneration.current) pushToast(tr('Inverse search failed'), 'error', String(error));
      }
    },
    [gotoLocation, pushToast],
  );

  const handleOpenFolder = useCallback(async () => {
    try {
      const next = await window.texpro.openProjectDialog();
      if (next) await loadProject(next);
    } catch (error) {
      pushToast(tr('Could not open project'), 'error', String(error));
    }
  }, [loadProject, pushToast]);

  const handleDemo = useCallback(async () => {
    try {
      const next = await window.texpro.createDemoProject();
      await loadProject(next);
    } catch (error) {
      pushToast(tr('Could not create demo project'), 'error', String(error));
    }
  }, [loadProject, pushToast]);

  useEffect(() => {
    if (!project) return;
    const root = project.root;
    let cancelled = false, checking = false;
    const check = async () => {
      if (cancelled || checking || document.hidden) return;
      checking = true;
      const generation = projectGeneration.current;
      try {
        const found = await window.texpro.listAssets(root);
        if (cancelled || projectRef.current?.root !== root || generation !== projectGeneration.current) return;
        const previous = assetsRef.current;
        if (found.length !== previous.length || found.some((asset, i) => asset.path !== previous[i]?.path || asset.modified !== previous[i]?.modified || asset.size !== previous[i]?.size)) {
          await refreshProjectData();
        }
      } catch {
        // A temporarily unavailable project must not erase the current index.
      } finally { checking = false; }
    };
    const timer = window.setInterval(() => void check(), 2500);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [project?.root, refreshProjectData]);

  const handleImportAssets = useCallback(async () => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    try {
      await window.texpro.importAssets(currentProject.root, projectConfigRef.current.directories.assets);
      if (projectRef.current?.root !== currentProject.root) return;
      await refreshProjectData();
      pushToast(t('Asset imported'), 'success', t('Asset library'));
    } catch (error) {
      pushToast(t('Could not import assets'), 'error', String(error));
    }
  }, [pushToast, refreshProjectData, t]);

  const handleDeleteAsset = useCallback(
    async (asset: AssetItem) => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      try {
        await window.texpro.deleteAsset(currentProject.root, asset.path);
        if (projectRef.current?.root !== currentProject.root) return;
        await refreshProjectData();
        pushToast(t('Asset deleted'), 'success', asset.name);
      } catch (error) {
        pushToast(t('Could not delete asset'), 'error', String(error));
      }
    },
    [pushToast, refreshProjectData, t],
  );


  const handleCreateFromTemplate = useCallback(
    async (template: TemplateItem, meta: TemplateMeta) => {
      try {
        const content = fillTemplate(template.content, meta);
        const next = await window.texpro.createProject({
          name: slugify(meta.projectName || template.name),
          engine: template.engine,
          files: [{ path: 'main.tex', content }],
        });
        if (!next) return false;
        setSettings((current) => ({ ...current, engine: template.engine }));
        await loadProject(next);
        pushToast(t('Project created'), 'success', next.name);
        return true;
      } catch (error) {
        pushToast(t('Could not create project'), 'error', String(error));
        return false;
      }
    },
    [loadProject, pushToast, t],
  );

  const handleSaveTemplate = useCallback(
    async (name: string, description: string, content: string, engine: TemplateItem['engine']) => {
      try {
        const item = await window.texpro.saveUserTemplate({ name, description, engine, content });
        setUserTemplates((current) => [...current, item].sort((a, b) => a.name.localeCompare(b.name)));
        pushToast(t('Template saved'), 'success', item.name);
      } catch (error) {
        pushToast(t('Could not save template'), 'error', String(error));
      }
    },
    [pushToast, t],
  );

  const handleDeleteTemplate = useCallback(
    async (id: string) => {
      try {
        const next = await window.texpro.deleteUserTemplate(id);
        setUserTemplates(next);
        pushToast(t('Template deleted'), 'success');
      } catch (error) {
        pushToast(t('Could not delete template'), 'error', String(error));
      }
    },
    [pushToast, t],
  );


  const handleRecent = useCallback(
    async (entry: RecentProject) => {
      try {
        const next = await window.texpro.openProject(entry.root);
        await loadProject(next);
      } catch (error) {
        setRecent((current) => current.filter((item) => item.root !== entry.root));
        pushToast(tr('Project is no longer available'), 'error', String(error));
      }
    },
    [loadProject, pushToast],
  );

  const saveComments = useCallback(async (next: ReviewComment[]) => {
    setComments(next);
    const currentProject = projectRef.current;
    if (!currentProject) return;
    await window.texpro.writeFile(`${currentProject.root}/.texpro/comments.json`, JSON.stringify(next, null, 2));
  }, []);

  const handleAddComment = useCallback((text: string, line: number, snippet: string) => {
    const file = activePathRef.current;
    if (!file) return;
    const comment: ReviewComment = {
      id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      line,
      snippet: snippet.slice(0, 160),
      text,
      author: 'You',
      createdAt: Date.now(),
      resolved: false,
    };
    void saveComments([comment, ...comments]);
  }, [comments, saveComments]);

  const handleRenameFile = useCallback(
    async (path: string) => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      const nextName = window.prompt(tr('Rename file'), basename(path));
      if (!nextName || nextName === basename(path)) return;
      try {
        if (activePathRef.current === path) await saveActive();
        const result = await window.texpro.renameProjectFile(currentProject.root, path, nextName);
        if (activePathRef.current === path) {
          const previous = path;
          setDocs((current) => {
            const doc = current[previous];
            if (!doc) return current;
            const next = { ...current };
            delete next[previous];
            next[result.path] = { ...doc, path: result.path };
            return next;
          });
          setActivePath(result.path);
          activePathRef.current = result.path;
        }
        await refreshProjectData();
        pushToast(tr('File renamed'), 'success', `${result.updated} references updated`);
      } catch (failure) {
        pushToast(tr('Could not rename file'), 'error', String(failure));
      }
    },
    [pushToast, refreshProjectData, saveActive],
  );

  const handleMoveDirectory = useCallback(
    async (dir: string) => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      const nextName = window.prompt(tr('Rename folder'), basename(dir));
      if (!nextName || nextName === basename(dir)) return;
      try {
        const impact = await window.texpro.projectImpact(currentProject.root, dir);
        if (impact.references > 0 || impact.assets > 0) {
          if (!window.confirm(`${t('Rename this folder?')}\n${basename(dir)} → ${nextName}\n\n${impact.files} ${t('files')} · ${impact.assets} ${t('assets')} · ${impact.references} ${t('references will be updated')}.`)) return;
        }
        await saveActive();
        const result = await window.texpro.moveProjectDirectory(currentProject.root, dir, nextName);
        setDocs((current) => {
          const next: Record<string, OpenDoc> = {};
          for (const [key, doc] of Object.entries(current)) {
            if (key === result.oldPath || key.startsWith(result.oldPath + '/')) {
              const moved = result.path + key.slice(result.oldPath.length);
              next[moved] = { ...doc, path: moved };
            } else {
              next[key] = doc;
            }
          }
          return next;
        });
        if (activePathRef.current && (activePathRef.current === result.oldPath || activePathRef.current.startsWith(result.oldPath + '/'))) {
          const moved = result.path + activePathRef.current.slice(result.oldPath.length);
          activePathRef.current = moved;
          setActivePath(moved);
        }
        await refreshProjectData();
        pushToast(tr('Directory moved'), 'success', `${result.updated} references updated`);
      } catch (failure) {
        pushToast(tr('Could not move directory'), 'error', String(failure));
      }
    },
    [pushToast, refreshProjectData, saveActive],
  );

  const handleCreateFile = useCallback(async (parent: string) => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const name = window.prompt(tr('New file name'), 'section.tex');
    if (!name) return;
    try {
      const created = await window.texpro.createProjectFile(currentProject.root, parent, name, `\\section{${name.replace(/\.tex$/i, '')}}\n\n`);
      await refreshProjectData();
      await openFile(created.path);
      pushToast(tr('File created'), 'success', created.relative);
    } catch (failure) {
      pushToast(tr('Could not create file'), 'error', String(failure));
    }
  }, [openFile, pushToast, refreshProjectData]);

  const handleCreateFolder = useCallback(async (parent: string) => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const name = window.prompt(tr('New folder name'), 'sections');
    if (!name) return;
    try {
      const created = await window.texpro.createProjectFolder(currentProject.root, parent, name);
      await refreshProjectData();
      pushToast(tr('Folder created'), 'success', created.relative);
    } catch (failure) {
      pushToast(tr('Could not create folder'), 'error', String(failure));
    }
  }, [pushToast, refreshProjectData]);

  const handleMoveFile = useCallback(async (file: string) => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const currentDir = relativePath(currentProject.root, dirname(file));
    const target = window.prompt(tr('Target folder (relative to project)'), currentDir);
    if (target === null) return;
    const targetDir = `${currentProject.root}/${target}`.replace(/\/+$/, '');
    try {
      const impact = await window.texpro.projectImpact(currentProject.root, file);
      if (!window.confirm(`${t('Move this file?')}\n${basename(file)} → ${target || '/'}\n\n${impact.references} ${t('references will be updated')}.`)) return;
      await saveActive();
      const result = await window.texpro.moveProjectFile(currentProject.root, file, targetDir);
      setDocs((current) => {
        const doc = current[file];
        if (!doc) return current;
        const next = { ...current };
        delete next[file];
        next[result.path] = { ...doc, path: result.path };
        return next;
      });
      if (activePathRef.current === file) {
        activePathRef.current = result.path;
        setActivePath(result.path);
      }
      await refreshProjectData();
      pushToast(tr('File moved'), 'success', `${result.updated} ${t('references updated')}`);
    } catch (failure) {
      pushToast(tr('Could not move file'), 'error', String(failure));
    }
  }, [pushToast, refreshProjectData, saveActive, t]);

  const handleDeleteFile = useCallback(async (file: string) => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    try {
      const impact = await window.texpro.projectImpact(currentProject.root, file);
      if (!window.confirm(`${t('Delete this file?')}\n${basename(file)}\n\n${impact.references} ${t('references will break')}.\n${t('The file is moved to .texpro/trash.')}`)) return;
      if (impact.assets > 0 && !window.confirm(t('This file is an asset. Delete it anyway?'))) return;
      await window.texpro.deleteProjectFile(currentProject.root, file);
      setDocs((current) => {
        if (!current[file]) return current;
        const next = { ...current };
        delete next[file];
        return next;
      });
      if (activePathRef.current === file) {
        activePathRef.current = null;
        setActivePath(null);
        const fallback = currentProject.rootFile || findFirstTex(currentProject.tree);
        if (fallback) await openFile(fallback);
      }
      await refreshProjectData();
      pushToast(tr('File moved to trash'), 'success', basename(file));
    } catch (failure) {
      pushToast(tr('Could not delete file'), 'error', String(failure));
    }
  }, [openFile, pushToast, refreshProjectData]);

  const handleDeleteFolder = useCallback(async (dir: string) => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    try {
      const impact = await window.texpro.projectImpact(currentProject.root, dir);
      if (!window.confirm(`${t('Delete this folder?')}\n${basename(dir)}\n\n${impact.files} ${t('files')} · ${impact.assets} ${t('assets')} · ${impact.references} ${t('references will break')}.`)) return;
      if (impact.assets > 0 && !window.confirm(t('This folder contains assets. Delete everything anyway?'))) return;
      if (!window.confirm(t('This will move the folder to .texpro/trash. Continue?'))) return;
      await window.texpro.deleteProjectFolder(currentProject.root, dir);
      setDocs((current) => {
        const next: Record<string, OpenDoc> = {};
        for (const [key, doc] of Object.entries(current)) {
          if (key === dir || key.startsWith(dir + '/')) continue;
          next[key] = doc;
        }
        return next;
      });
      if (activePathRef.current && (activePathRef.current === dir || activePathRef.current.startsWith(dir + '/'))) {
        activePathRef.current = null;
        setActivePath(null);
        const fallback = currentProject.rootFile || findFirstTex(currentProject.tree);
        if (fallback) await openFile(fallback);
      }
      await refreshProjectData();
      pushToast(tr('Folder moved to trash'), 'success', basename(dir));
    } catch (failure) {
      pushToast(tr('Could not delete folder'), 'error', String(failure));
    }
  }, [openFile, pushToast, refreshProjectData]);

  const handleOpenFile = useCallback(
    (path: string) => {
      if (!isTextPath(path)) {
        setPreviewFile(path);
        setSidebarTab('files');
        return;
      }
      setPreviewFile(null);
      void openFile(path);
      setSidebarTab('files');
    },
    [openFile],
  );



  const handleSearchResult = useCallback(
    (result: SearchResult) => {
      void openFile(result.file, result.line);
    },
    [openFile],
  );


  const ensureWritingPackages = useCallback(async (packages: string[]) => {
    if (!packages.length) return true;
    const current = projectRef.current, generation = projectGeneration.current;
    if (!current?.rootFile) { pushToast(tr('Choose main file'), 'error'); return false; }
    if (editorRef.current?.getPath() === current.rootFile) { editorRef.current.ensurePackages(packages); return true; }
    try {
      const saved = docsRef.current[current.rootFile]?.savedContent ?? await window.texpro.readFile(current.rootFile);
      if (generation !== projectGeneration.current || projectRef.current?.rootFile !== current.rootFile) return false;
      setDocs(latest => {
        const doc = latest[current.rootFile!] || { path: current.rootFile!, content: saved, savedContent: saved, dirty: false };
        const content = ensureTexPackages(doc.content, packages);
        const next = { ...latest, [current.rootFile!]: { ...doc, content, dirty: content !== doc.savedContent } };
        docsRef.current = next;
        return next;
      });
      return true;
    } catch (error) { pushToast(tr('Could not open file'), 'error', String(error)); return false; }
  }, [pushToast]);

  const writeAtCaret = useCallback(async (text: string, packages: string[] = writingPackages(text), cursor = text.length) => {
    const editor = editorRef.current;
    if (!editor) { pushToast(tr('Open a document first'), 'info'); return; }
    const generation = projectGeneration.current;
    let range = editor.getSelectionRange();
    if (editor.getPath() === projectRef.current?.rootFile) {
      const body = /\\begin\s*\{document\}/.exec(editor.getContent());
      if (body && range.from < body.index + body[0].length) range = { from: body.index + body[0].length, to: body.index + body[0].length };
    }
    const target = editor.captureWriting(range);
    if (!target || !(await ensureWritingPackages(packages))) return;
    if (generation !== projectGeneration.current || editorRef.current !== editor) return;
    if (!editor.applyWriting(target, text, cursor)) pushToast(tr('Writing target changed. Reopen the helper at the intended location.'), 'info');
  }, [ensureWritingPackages, pushToast]);

  const insertImageFiles = useCallback(async (input: Array<File | AssetItem>) => {
    const editor = editorRef.current, current = projectRef.current;
    if (!editor || !current) { pushToast(tr('Open a document first'), 'info'); return; }
    const generation = projectGeneration.current;
    const range = figureWritingRange(editor.getContent(), editor.getSelectionRange(), editor.getPath() === current.rootFile);
    const target = editor.captureWriting(range);
    if (!target || !(await ensureWritingPackages(['graphicx']))) return;
    const labels = new Set(effectiveSymbols.labels);
    const figures: Array<ReturnType<typeof writingFigure>> = [];
    for (const item of input) {
      try {
        let asset: AssetItem;
        if (item instanceof File) {
          const ext = (item.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
          asset = await window.texpro.saveImageBuffer(current.root, projectConfigRef.current.directories.assets, { name: item.name || 'pasted-image', ext, data: new Uint8Array(await item.arrayBuffer()) });
        } else asset = item;
        if (asset.ext === '.svg') asset = await window.texpro.rasterizeSvg(current.root, asset.path);
        const figure = writingFigure(relativePath(dirname(target.file), asset.path), asset.name, labels);
        labels.add(figure.label); figures.push(figure);
      } catch (error) { pushToast(tr('Could not save image'), 'error', String(error)); }
    }
    if (generation !== projectGeneration.current || editorRef.current !== editor) return;
    await refreshProjectData();
    if (!figures.length || generation !== projectGeneration.current || editorRef.current !== editor) return;
    if (!editor.applyWriting(target, figures.map(figure => figure.source).join(''), figures[0].cursor)) {
      pushToast(tr('Image saved to the asset library. Choose a new insertion point.'), 'info'); return;
    }
    pushToast(tr('Image added to assets'), 'success');
  }, [effectiveSymbols.labels, ensureWritingPackages, pushToast, refreshProjectData]);

  const handleInsertAsset = useCallback(async (asset: AssetItem) => { await insertImageFiles([asset]); }, [insertImageFiles]);
  const handleImageFiles = useCallback(async (files: File[]) => {
    const images = files.filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name));
    if (!images.length) { pushToast(tr('Only image files can be dropped here'), 'info'); return; }
    await insertImageFiles(images);
  }, [insertImageFiles, pushToast]);
  const handleInsertImagePath = useCallback((path: string) => {
    const asset = assetsRef.current.find(item => item.path === path);
    if (asset) void insertImageFiles([asset]);
  }, [insertImageFiles]);

  const insert = useCallback((template: string) => {
    const marker = template.indexOf('|');
    const text = marker < 0 ? template : template.slice(0, marker) + template.slice(marker + 1);
    void writeAtCaret(text, writingPackages(text), marker < 0 ? text.length : marker);
  }, [writeAtCaret]);


  const helperTargets = useRef<Record<string, { editor: EditorHandle; target: WritingTarget; generation: number }>>({});
  const beginWritingHelper = useCallback((kind: string, range?: { from: number; to: number }) => {
    const editor = editorRef.current, target = editor?.captureWriting(range);
    if (!editor || !target) { pushToast(tr('Open a document first'), 'info'); return false; }
    helperTargets.current[kind] = { editor, target, generation: projectGeneration.current };
    return true;
  }, [pushToast]);
  const closeWritingHelper = useCallback((kind: string) => {
    const session = helperTargets.current[kind]; delete helperTargets.current[kind];
    if (session && session.generation === projectGeneration.current && editorRef.current === session.editor) session.editor.restoreWriting(session.target);
  }, []);
  const applyWritingHelper = useCallback(async (kind: string, code: string, packages = writingPackages(code)) => {
    const session = helperTargets.current[kind]; delete helperTargets.current[kind];
    if (!session || session.generation !== projectGeneration.current || editorRef.current !== session.editor) {
      pushToast(tr('Writing target changed. Reopen the helper at the intended location.'), 'info'); return;
    }
    if (!(await ensureWritingPackages(packages))) return;
    if (session.generation !== projectGeneration.current || editorRef.current !== session.editor || !session.editor.applyWriting(session.target, code)) {
      pushToast(tr('Writing target changed. Reopen the helper at the intended location.'), 'info');
    }
  }, [ensureWritingPackages, pushToast]);
  const openFormula = useCallback(() => {
    if (!beginWritingHelper('formula')) return;
    const selected = editorRef.current?.getSelection() || '';
    setFormulaSeed(selected.replace(/^\$+|\$+$/g, '').replace(/^\\\[|\\\]$/g, '').trim());
    setFormulaOpen(true);
  }, [beginWritingHelper]);

  const handleInsertCite = useCallback(
    (key: string) => {
      if (!activePathRef.current) {
        pushToast(tr('Open a document first'), 'info');
        return;
      }
      editorRef.current?.insert(`\\cite{${key}}`);
      pushToast(tr('Citation inserted'), 'success', key);
    },
    [pushToast],
  );

  const handleAddBibliography = useCallback(
    (bibPath: string, mode: 'bibtex' | 'biblatex', style: string) => {
      const file = activePathRef.current;
      if (!file) {
        pushToast(tr('Open a document first'), 'info');
        return;
      }
      const relative = relativePath(dirname(file), bibPath);
      editorRef.current?.applyBibliography({
        mode,
        bibPath: mode === 'biblatex' ? relative : relative.replace(/\.bib$/i, ''),
        style,
      });
      pushToast(tr('Bibliography block inserted'), 'success', mode);
    },
    [pushToast],
  );

  const handleInsertImport = useCallback(
    (body: string, format: ImportFormat) => {
      if (!body.trim()) return;
      if (!activePathRef.current) {
        pushToast(tr('Open a document first'), 'info');
        return;
      }
      if (/\\includegraphics/.test(body)) editorRef.current?.ensurePackage('graphicx');
      if (/\\begin\{(?:equation|align|gather|multline|eqnarray)\*?\}/.test(body)) editorRef.current?.ensurePackage('amsmath');
      editorRef.current?.insert(body);
      setImportOpen(false);
      pushToast(tr('Imported into document'), 'success', format.toUpperCase());
    },
    [pushToast],
  );

  const handleCreateImport = useCallback(
    async (document: string, name: string, engine: 'pdflatex' | 'xelatex') => {
      const currentProject = projectRef.current;
      if (!currentProject) {
        pushToast(tr('Open a project first'), 'info');
        return false;
      }
      const base = slugify(name) || 'imported-document';
      let file = `${currentProject.root}/${base}.tex`;
      let index = 2;
      while (await window.texpro.fileExists(file)) {
        file = `${currentProject.root}/${base}-${index++}.tex`;
      }
      await window.texpro.writeFile(file, document);
      setSettings((current) => ({ ...current, engine }));
      await refreshProjectData();
      setPreviewFile(null);
      await openFile(file);
      setImportOpen(false);
      pushToast(tr('Imported document created'), 'success', file.split('/').pop());
      return true;
    },
    [openFile, pushToast, refreshProjectData],
  );

  const handleSaveProjectConfig = useCallback(async (config: ProjectConfig) => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const configPath = `${currentProject.root}/.texpro/project.json`;
    const raw = await window.texpro.fileExists(configPath) ? JSON.parse(await window.texpro.readFile(configPath)) : {};
    const next = { ...raw, ...config, ...(raw.rootFile ? { rootFile: raw.rootFile } : {}) };
    await window.texpro.writeFile(configPath, JSON.stringify(next, null, 2));
    if (projectRef.current?.root !== currentProject.root) return;
    projectConfigRef.current = next;
    setProjectConfig(next);
  }, []);

  const handleSelectRoot = useCallback(async (file: string) => {
    const current = projectRef.current;
    if (!current || compilingRef.current || !file || !(current.rootCandidates || []).includes(file)) return;
    if (!(await saveAll())) return;
    try {
      const configPath = `${current.root}/.texpro/project.json`;
      const raw = await window.texpro.fileExists(configPath) ? JSON.parse(await window.texpro.readFile(configPath)) : {};
      const config = { ...raw, rootFile: relativePath(current.root, file) };
      await window.texpro.writeFile(configPath, JSON.stringify(config, null, 2));
      const next = await window.texpro.openProject(current.root);
      if (projectRef.current?.root !== current.root) return;
      projectRef.current = next; setProject(next);
      const normalized = normalizeProjectConfig(config);
      projectConfigRef.current = normalized; setProjectConfig(normalized);
      syncGeneration.current++; inverseGeneration.current++;
      setSyncTarget(null); setPdfBytes(null); setPreviousPdfBytes(null);
      pdfPathRef.current = null; setPdfPath(null); setCompileResult(null); setDiagnostics([]); setCompileLog('');
      setBoxHotspots([]); setPage(1);
      pushToast(tr('Main file saved'), 'success', config.rootFile);
    } catch (error) { pushToast(tr('Could not set main file'), 'error', String(error)); }
  }, [saveAll, pushToast]);

  const openMainFile = useCallback(() => {
    const main = projectRef.current?.rootFile;
    if (main) void openFile(main);
    else { setSidebarOpen(true); setSidebarTab('files'); }
  }, [openFile]);

  const editMainFile = useCallback(async (edit: (editor: EditorHandle) => void) => {
    const current = projectRef.current;
    if (!current?.rootFile) { pushToast(tr('Choose main file'), 'error'); return false; }
    const generation = projectGeneration.current;
    await openFile(current.rootFile);
    for (let frame = 0; frame < 30; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (generation !== projectGeneration.current) return false;
      if (editorRef.current?.getPath() === current.rootFile) { edit(editorRef.current); return true; }
    }
    pushToast(tr('Could not open file'), 'error', current.rootFile);
    return false;
  }, [openFile, pushToast]);

  const handleCreateModule = useCallback(
    async (title: string, file: string) => {
      const currentProject = projectRef.current;
      if (!currentProject) return null;
      const safeFile = file.endsWith('.tex') ? file : `${file}.tex`;
      const fullPath = `${currentProject.root}/${safeFile.replace(/^\/+/, '')}`;
      if (!fullPath.startsWith(currentProject.root + '/')) return null;
      try {
        await window.texpro.writeFile(fullPath, `\\section{${escapeLatex(title)}}\n\n`);
        const refreshed = await window.texpro.openProject(currentProject.root);
        if (projectRef.current?.root !== currentProject.root) return null;
        projectRef.current = refreshed;
        setProject(refreshed);
        pushToast(tr('Module created'), 'success', safeFile);
        return safeFile;
      } catch (error) {
        pushToast(tr('Could not create module'), 'error', String(error));
        return null;
      }
    },
    [pushToast],
  );

  const handleApplyProjectConfig = useCallback(async (config: ProjectConfig) => {
    const modules = config.modules.filter(module => module.included).map(module => moduleInputPath(module.file));
    if (await editMainFile(editor => { editor.applyModules(modules); editor.applyToc(config.toc); })) {
      pushToast(tr('Project structure applied'), 'success', `${modules.length} modules`);
    }
  }, [editMainFile, pushToast]);

  const handleInsertMusic = useCallback(() => {
    const source = '\n' + musicBlock(newScore()) + '\n\n';
    void writeAtCaret(source, ['musixtex', 'tikz'], source.indexOf('\\Notes'));
  }, [writeAtCaret]);

  const handleApplyLayout = useCallback(async (layout: LayoutResult) => {
    if (await editMainFile(editor => editor.applyLayout(layout))) {
      setSettings(current => ({ ...current, engine: layout.engine }));
      pushToast(t('Layout applied'), 'success', `geometry · ${layout.engine}`);
    }
  }, [editMainFile, pushToast, t]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const toggleVisual = useCallback(() => {
    setSettings((current) => ({ ...current, visual: !current.visual }));
  }, []);

  const toggleFocus = useCallback(() => {
    setSettings((current) => ({ ...current, focus: !current.focus }));
  }, []);

  const toggleTypewriter = useCallback(() => {
    setSettings((current) => ({ ...current, typewriter: !current.typewriter }));
  }, []);

  const toggleDayNight = useCallback(() => {
    setSettings((current) => ({
      ...current,
      theme: current.theme === 'paper' ? 'night' : 'paper',
    }));
  }, []);

  const openPdf = useCallback(() => {
    const current = pdfPathRef.current;
    if (!current) return;
    void window.texpro.openPath(current);
  }, []);

  const revealPdf = useCallback(() => {
    const current = pdfPathRef.current;
    if (current) void window.texpro.reveal(current);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string; from?: number; to?: number; file?: string }>).detail;
      if (!detail?.source || detail.file !== activePathRef.current || detail.from === undefined || detail.to === undefined) return;
      if (!beginWritingHelper('tikz', { from: detail.from, to: detail.to })) return;
      setTikzSource(detail.source);
      setTikzOpen(true);
    };
    window.addEventListener('texpro:open-tikz', handler);
    return () => window.removeEventListener('texpro:open-tikz', handler);
  }, [beginWritingHelper]);


  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) {
        if (event.key === 'Escape') {
          setPaletteOpen(false);
          setSettingsOpen(false);
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'k' && !event.shiftKey) {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      } else if (key === 'enter') {
        event.preventDefault();
        void runCompile();
      } else if (key === 's') {
        event.preventDefault();
        void saveActive();
      } else if (key === 'o') {
        event.preventDefault();
        void handleOpenFolder();
      } else if (key === 'm' && event.shiftKey) {
        event.preventDefault();
        toggleVisual();
      } else if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        toggleFocus();
      } else if (key === 't' && event.shiftKey) {
        event.preventDefault();
        toggleTypewriter();
      } else if (key === 'j' && event.shiftKey) {
        event.preventDefault();
        manualForwardSync();
      } else if (key === 'l' && event.shiftKey) {
        event.preventDefault();
        toggleDayNight();
      } else if (key === '0' && event.shiftKey) {
        event.preventDefault();
        setZeroMode((value) => !value);
      } else if (key === 'p' && event.altKey) {
        event.preventDefault();
        setPdfOpen((value) => !value);
      } else if (event.code === 'Backslash') {
        event.preventDefault();
        setSidebarOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleOpenFolder, manualForwardSync, runCompile, saveActive, toggleDayNight, toggleFocus, toggleTypewriter, toggleVisual]);

  useEffect(() => {
    return window.texpro.onMenuAction((action) => {
      if (action === 'open-folder') void handleOpenFolder();
      if (action === 'close-project') void handleCloseProject();
      if (action === 'save') void saveActive();
      if (action === 'compile') void runCompile();
      if (action === 'cancel-compile') void cancelCompile();
      if (action === 'forward-sync') manualForwardSync();
      if (action === 'toggle-visual') toggleVisual();
      if (action === 'toggle-focus') toggleFocus();
      if (action === 'toggle-typewriter') toggleTypewriter();
      if (action === 'command-palette') setPaletteOpen(true);
      if (action === 'toggle-pdf') setPdfOpen((value) => !value);
      if (action === 'toggle-sidebar') setSidebarOpen((value) => !value);
      if (action.startsWith('tool:')) {
        const tool = moreActionsRef.current.find((item) => item.id === action.slice(5));
        tool?.run();
      }
    });
  }, [
    handleOpenFolder,
    handleCloseProject,
    manualForwardSync,
    runCompile,
    saveActive,
    toggleFocus,
    toggleTypewriter,
    toggleVisual,
  ]);

  const paletteActions: PaletteAction[] = useMemo(
    () => [
      { id: 'close-project', label: t('Close project and return to Welcome'), group: 'File', icon: FolderOpen, run: () => void handleCloseProject() },
      {
        id: 'compile',
        label: t('Compile document'),
        detail: project ? `Build ${project.name}` : 'Open a project first',
        shortcut: '⌘↩',
        group: 'Build',
        icon: Play,
        run: () => void runCompile(),
      },
      {
        id: 'save',
        label: t('Save current file'),
        shortcut: '⌘S',
        group: 'Build',
        icon: Save,
        run: () => void saveActive(),
      },
      {
        id: 'forward',
        label: t('Forward search PDF'),
        detail: 'Jump from the cursor to the typeset page',
        shortcut: '⌘⇧J',
        group: 'Build',
        icon: Focus,
        run: manualForwardSync,
      },
      {
        id: 'visual',
        label: settings.visual ? t('Switch to source mode') : t('Switch to visual mode'),
        detail: 'Toggle inline rendering',
        shortcut: '⌘⇧M',
        group: 'View',
        icon: settings.visual ? EyeOff : Eye,
        run: toggleVisual,
      },
      {
        id: 'focus',
        label: settings.focus ? t('Leave focus mode') : t('Enter focus mode'),
        shortcut: '⌘⇧F',
        group: 'View',
        icon: Focus,
        run: toggleFocus,
      },
      {
        id: 'typewriter',
        label: settings.typewriter ? t('Disable typewriter scrolling') : t('Enable typewriter scrolling'),
        shortcut: '⌘⇧T',
        group: 'View',
        icon: Type,
        run: toggleTypewriter,
      },
      {
        id: 'sidebar',
        label: sidebarOpen ? t('Hide sidebar') : t('Show sidebar'),
        shortcut: '⌘\\',
        group: 'View',
        icon: PanelLeft,
        run: () => setSidebarOpen((value) => !value),
      },
      {
        id: 'pdf',
        label: pdfOpen ? t('Hide PDF preview') : t('Show PDF preview'),
        shortcut: '⌘⌥P',
        group: 'View',
        icon: PanelRight,
        run: () => setPdfOpen((value) => !value),
      },
      {
        id: 'settings',
        label: t('Open settings'),
        group: 'View',
        icon: Settings2,
        run: () => setSettingsOpen(true),
      },
      {
        id: 'open-folder',
        label: t('Open another folder'),
        shortcut: '⌘O',
        group: 'Project',
        icon: FolderOpen,
        run: () => void handleOpenFolder(),
      },
      {
        id: 'demo',
        label: t('Open demo project'),
        detail: 'A complete visual LaTeX sample',
        group: 'Project',
        icon: Sparkles,
        run: () => void handleDemo(),
      },
      {
        id: 'templates',
        label: t('Open template library'),
        detail: 'Start a project from a built-in or user template',
        group: 'Project',
        icon: LayoutTemplate,
        run: () => setTemplatesOpen(true),
      },
      {
        id: 'assets',
        label: t('Open asset library'),
        detail: 'Preview, import and insert project images',
        group: 'Project',
        icon: FileImage,
        run: () => {
          setSidebarOpen(true);
          setSidebarTab('assets');
        },
      },
      {
        id: 'chart',
        label: t('Open chart studio'),
        detail: 'Edit CSV data, preview native pgfplots and insert LaTeX',
        group: 'Tools',
        icon: BarChart3,
        run: () => { if (beginWritingHelper('chart')) setChartOpen(true); },
      },
      {
        id: 'tikz',
        label: t('Open TikZ studio'),
        detail: 'Live TikZ preview with the current document preamble',
        group: 'Tools',
        icon: PenTool,
        run: () => {
          setTikzSource(null);
          if (beginWritingHelper('tikz')) setTikzOpen(true);
        },
      },
      {
        id: 'project-structure',
        label: 'Project structure',
        detail: 'Modules, directories and table of contents',
        group: 'Project',
        icon: FolderTree,
        run: () => setProjectStudioOpen(true),
      },
      {
        id: 'bibliography',
        label: 'Bibliography manager',
        detail: 'Edit .bib entries and insert citations',
        group: 'Insert',
        icon: BookMarked,
        run: () => setBibOpen(true),
      },
      {
        id: 'import',
        label: 'Import Markdown / Typst',
        detail: 'Convert a document into portable LaTeX',
        group: 'Insert',
        icon: FileInput,
        run: () => setImportOpen(true),
      },
      {
        id: 'workshop',
        label: 'Template workshop',
        detail: 'Design and save a document template',
        group: 'Project',
        icon: Paintbrush,
        run: () => setWorkshopOpen(true),
      },
      {
        id: 'formula',
        label: 'Formula editor',
        detail: 'Compose KaTeX math and insert LaTeX',
        group: 'Tools',
        icon: Sigma,
        run: openFormula,
      },
      {
        id: 'layout',
        label: 'Page layout',
        detail: 'Margins, columns, spacing, language and headers',
        group: 'Insert',
        icon: Columns3,
        run: () => void editMainFile(() => setLayoutOpen(true)),
      },
      {
        id: 'search',
        label: t('Search project'),
        group: 'Project',
        icon: Search,
        run: () => {
          setSidebarOpen(true);
          setSidebarTab('search');
        },
      },
      {
        id: 'outline',
        label: t('Show outline'),
        group: 'Project',
        icon: List,
        run: () => {
          setSidebarOpen(true);
          setSidebarTab('outline');
        },
      },
      {
        id: 'insert-equation',
        label: t('Insert display equation'),
        group: 'Insert',
        icon: Sigma,
        run: () => insert(snippetLibrary.find((item) => item.id === 'equation')?.template || ''),
      },
      { id: 'music', label: t('Insert music'), group: 'Insert', icon: Music2, run: () => void handleInsertMusic() },
      ...writingSnippets.map(item => ({ id: item.id, label: t(item.label), group: 'Insert', icon: item.id === 'circuit' ? CircuitBoard : item.id === 'logic' ? GitBranch : item.id === 'structure' || item.id === 'skeletal' ? FlaskConical : PenTool, run: () => void writeAtCaret('\n' + item.text + '\n\n', item.packages, item.cursor + 1) })),
      {
        id: 'insert-table',
        label: t('Insert table'),
        group: 'Insert',
        icon: Table2,
        run: () => insert(snippetLibrary.find((item) => item.id === 'table')?.template || ''),
      },
      {
        id: 'insert-figure',
        label: t('Insert figure'),
        group: 'Insert',
        icon: Image,
        run: () => insert(snippetLibrary.find((item) => item.id === 'figure')?.template || ''),
      },
      {
        id: 'insert-list',
        label: t('Insert itemized list'),
        group: 'Insert',
        icon: List,
        run: () => insert(snippetLibrary.find((item) => item.id === 'list')?.template || ''),
      },
      {
        id: 'theme-studio',
        label: t('Theme: Studio'),
        group: 'Appearance',
        icon: Sun,
        run: () => updateSettings({ theme: 'studio' }),
      },
      {
        id: 'theme-night',
        label: t('Theme: Night'),
        group: 'Appearance',
        icon: Moon,
        run: () => updateSettings({ theme: 'night' }),
      },
      {
        id: 'theme-paper',
        label: t('Theme: Paper'),
        group: 'Appearance',
        icon: BookOpen,
        run: () => updateSettings({ theme: 'paper' }),
      },
      {
        id: 'day-night',
        label: t('Toggle day / night'),
        detail: 'Switch between the Paper and Night themes',
        shortcut: '⌘⇧L',
        group: 'Appearance',
        icon: settings.theme === 'paper' ? Moon : Sun,
        run: toggleDayNight,
      },
      {
        id: 'language-zh',
        label: '界面语言：中文',
        detail: 'Switch the interface to Chinese',
        group: 'Appearance',
        icon: Command,
        run: () => updateSettings({ language: 'zh' }),
      },
      {
        id: 'language-en',
        label: 'Interface language: English',
        detail: 'Switch the interface to English',
        group: 'Appearance',
        icon: Command,
        run: () => updateSettings({ language: 'en' }),
      },
      {
        id: 'reveal-pdf',
        label: t('Reveal PDF in Finder'),
        group: 'Build',
        icon: FolderOpen,
        run: revealPdf,
      },
      {
        id: 'open-pdf',
        label: t('Open PDF in default viewer'),
        group: 'Build',
        icon: Command,
        run: openPdf,
      },
    ],
    [
      project,
      handleCloseProject,
      handleInsertMusic,
      writeAtCaret,
      beginWritingHelper,
      editMainFile,
      settings.visual,
      settings.focus,
      settings.typewriter,
      sidebarOpen,
      pdfOpen,
      runCompile,
      saveActive,
      manualForwardSync,
      toggleVisual,
      toggleFocus,
      toggleTypewriter,
      toggleDayNight,
      handleOpenFolder,
      t,
      handleDemo,
      insert,
      openFormula,
      updateSettings,
      revealPdf,
      openPdf,
    ],
  );

  const moreActions: MoreAction[] = useMemo(
    () => [
      { id: 'close-project', label: 'Close project and return to Welcome', group: 'File', icon: FolderOpen, run: () => void handleCloseProject() },
      { id: 'review-writing', label: 'Review in writing', group: 'Tools', icon: History, run: () => editorRef.current?.toggleReview() },
      { id: 'return-writing', label: 'Back to writing position', group: 'Edit', icon: BookOpen, run: () => void returnToWriting() },
      { id: 'writing-note', label: 'Leave a writing note', group: 'Insert', icon: MessageSquare, run: () => { editorRef.current?.leaveNote(); } },
      { id: 'writing-notes', label: 'Writing notes', group: 'Tools', icon: List, run: () => { setSidebarOpen(true); setSidebarTab('notes'); } },
      { id: 'move-content-up', label: 'Move content up', group: 'Edit', icon: List, run: () => { if (!editorRef.current?.moveContent(-1)) pushToast(tr('No complete neighboring content to move.'), 'info'); } },
      { id: 'move-content-down', label: 'Move content down', group: 'Edit', icon: List, run: () => { if (!editorRef.current?.moveContent(1)) pushToast(tr('No complete neighboring content to move.'), 'info'); } },
      { id: 'music', label: 'Insert music', group: 'Insert', icon: Music2, run: () => void handleInsertMusic() },
      ...writingSnippets.map(item => ({ id: item.id, label: item.label, group: 'Insert', icon: item.id === 'circuit' ? CircuitBoard : item.id === 'logic' ? GitBranch : item.id === 'structure' || item.id === 'skeletal' ? FlaskConical : PenTool, run: () => void writeAtCaret('\n' + item.text + '\n\n', item.packages, item.cursor + 1) })),
      { id: 'formula', label: 'Formula editor', group: 'Tools', icon: Sigma, run: openFormula },
      { id: 'import', label: 'Import Markdown / Typst', group: 'File', icon: FileInput, run: () => setImportOpen(true) },
      { id: 'equation', label: 'Insert display equation', group: 'Insert', icon: Sigma, run: () => insert(snippetLibrary.find((item) => item.id === 'equation')?.template || '') },
      { id: 'table', label: 'Insert table', group: 'Insert', icon: Table2, run: () => insert(snippetLibrary.find((item) => item.id === 'table')?.template || '') },
      { id: 'table-editor', label: 'Visual table editor', group: 'Tools', icon: Table2, run: () => beginWritingHelper('table') && setTableRequest({ source: editorRef.current?.getSelection() || '', focusPos: 0, insert: true }) },
      { id: 'figure', label: 'Insert figure', group: 'Insert', icon: Image, run: () => insert(snippetLibrary.find((item) => item.id === 'figure')?.template || '') },
      { id: 'code', label: 'Insert code block', group: 'Insert', icon: Code2, run: () => insert(snippetLibrary.find((item) => item.id === 'code')?.template || '') },
      { id: 'chart', label: 'Chart studio', group: 'Tools', icon: BarChart3, run: () => { if (beginWritingHelper('chart')) setChartOpen(true); } },
      { id: 'circuit-studio', label: 'Circuit studio', group: 'Tools', icon: CircuitBoard, run: () => beginWritingHelper('schematic') && setSchematicMode('circuit') },
      { id: 'logic-studio', label: 'Logic studio', group: 'Tools', icon: GitBranch, run: () => beginWritingHelper('schematic') && setSchematicMode('logic') },
      { id: 'structure-studio', label: 'Structure studio', group: 'Tools', icon: FlaskConical, run: () => beginWritingHelper('schematic') && setSchematicMode('structure') },
      { id: 'ink', label: 'Ink studio', group: 'Tools', icon: PenTool, run: () => beginWritingHelper('ink') && setInkOpen(true) },
      { id: 'collab', label: 'LAN collaboration', group: 'Tools', icon: Network, run: () => setCollabOpen(true) },
      { id: 'git', label: 'Version control', group: 'Tools', icon: GitBranch, run: () => setGitOpen(true) },
      { id: 'tikz', label: 'TikZ studio', group: 'Tools', icon: PenTool, run: () => { setTikzSource(null); if (beginWritingHelper('tikz')) setTikzOpen(true); } },
      { id: 'layout', label: 'Page layout', group: 'Insert', icon: Columns3, run: () => void editMainFile(() => setLayoutOpen(true)) },
      { id: 'packages', label: 'Packages & document class', group: 'Project', icon: Package, run: () => void editMainFile(() => setPackageOpen(true)) },
      { id: 'commands', label: 'Commands & completions', group: 'Project', icon: Terminal, run: () => setCommandOpen(true) },
      { id: 'compile-theater', label: 'Compile theater', group: 'Build', icon: Clapperboard, run: () => setTheaterOpen(true) },
      { id: 'zero-mode', label: 'Zero-interface mode', group: 'View', shortcut: '⌘⇧0', icon: Focus, run: () => setZeroMode(true) },
      { id: 'crew', label: 'MCP crew', group: 'Tools', icon: Users, run: () => setCrewOpen(true) },
      { id: 'paper-studio', label: 'Paper API & referee', group: 'Tools', icon: Gavel, run: () => setPaperOpen(true) },
      { id: 'plugin-market', label: 'Plugin market', group: 'Tools', icon: ShoppingBag, run: () => setPluginOpen(true) },
      { id: 'bold', label: 'Bold', group: 'Format', shortcut: '⌘B', icon: Bold, run: () => editorRef.current?.wrapSelection('\\textbf{', '}') },
      { id: 'italic', label: 'Italic', group: 'Format', shortcut: '⌘I', icon: Italic, run: () => editorRef.current?.wrapSelection('\\textit{', '}') },
      { id: 'templates', label: 'Template library', group: 'File', icon: LayoutTemplate, run: () => setTemplatesOpen(true) },
      { id: 'assets', label: 'Asset library', group: 'Project', icon: FileImage, run: () => { setSidebarOpen(true); setSidebarTab('assets'); } },
      { id: 'bibliography', label: 'Bibliography', group: 'Project', icon: BookMarked, run: () => setBibOpen(true) },
      { id: 'project-structure', label: 'Project structure', group: 'Project', icon: FolderTree, run: () => setProjectStudioOpen(true) },
      { id: 'doctor', label: 'Project doctor', group: 'Project', icon: Stethoscope, run: () => setDoctorOpen(true) },
      { id: 'convert-svgs', label: 'Convert SVG assets for LaTeX', group: 'Tools', icon: Image, run: () => { const current = projectRef.current; if (!current) return; void window.texpro.convertSvgReferences(current.root).then((result) => { pushToast(tr('SVG assets converted'), 'success', `${result.converted} images`); void refreshProjectData(); }).catch((error) => pushToast(tr('Could not convert SVG assets'), 'error', String(error))); } },
      { id: 'export', label: 'Export document', group: 'File', icon: Download, run: () => setExportOpen(true) },
      { id: 'arxiv', label: 'arXiv package', group: 'File', icon: Package, run: () => { void saveAll().then(saved => { if (saved) setArxivOpen(true); }); } },
      { id: 'backup', label: 'Project backup', group: 'File', icon: CloudUpload, run: () => setBackupOpen(true) },
      { id: 'graph', label: 'Citation & label graph', group: 'Project', icon: Network, run: () => setGraphOpen(true) },
      { id: 'font', label: 'Font coverage', group: 'Project', icon: Type, run: () => setFontOpen(true) },
      { id: 'version', label: 'Version review', group: 'Review', icon: History, run: () => setVersionOpen(true) },
      { id: 'comments', label: 'Comments', group: 'Review', icon: MessageSquare, run: () => setCommentsOpen(true) },
      { id: 'ai', label: 'AI assistant', group: 'Review', icon: Bot, run: () => setAiOpen(true) },
      { id: 'mcp', label: 'MCP server', group: 'Tools', icon: Plug, run: () => setMcpOpen(true) },
      { id: 'workshop', label: 'Template workshop', group: 'File', icon: Paintbrush, run: () => setWorkshopOpen(true) },
      { id: 'open-folder', label: 'Open another folder', group: 'File', shortcut: '⌘O', icon: FolderOpen, run: () => void handleOpenFolder() },
      { id: 'visual', label: settings.visual ? 'Switch to source mode' : 'Switch to visual mode', group: 'View', shortcut: '⌘⇧M', icon: settings.visual ? EyeOff : Eye, run: toggleVisual },
      { id: 'focus', label: settings.focus ? 'Leave focus mode' : 'Enter focus mode', group: 'View', shortcut: '⌘⇧F', icon: Focus, run: toggleFocus },
      { id: 'typewriter', label: settings.typewriter ? 'Disable typewriter scrolling' : 'Enable typewriter scrolling', group: 'View', shortcut: '⌘⇧T', icon: Type, run: toggleTypewriter },
      { id: 'day-night', label: 'Toggle day / night', group: 'View', shortcut: '⌘⇧L', icon: settings.theme === 'paper' ? Moon : Sun, run: toggleDayNight },
      { id: 'settings', label: 'Settings', group: 'Tools', icon: Settings2, run: () => setSettingsOpen(true) },
      { id: 'palette', label: 'Command palette', group: 'Tools', shortcut: '⌘K', icon: Command, run: () => setPaletteOpen(true) },
    ],
    [returnToWriting, beginWritingHelper, writeAtCaret, handleInsertMusic, editMainFile, handleCloseProject, settings.visual, settings.focus, settings.typewriter, settings.theme, openFormula, insert, toggleVisual, toggleFocus, toggleTypewriter, toggleDayNight, handleOpenFolder, saveActive, runCompile, manualForwardSync, t],
  );

  moreActionsRef.current = moreActions;

  const activeDiagnostics = diagnostics;
  const errors = activeDiagnostics.filter((item) => item.severity === 'error').length;

  return (
    <div className={`app ${settings.focus ? 'focus-mode' : ''} ${zeroMode ? 'zero-mode' : ''}`}>
      {zeroMode && <button className="zero-exit" onClick={() => setZeroMode(false)} title={t('Exit zero-interface mode')}>{t('Exit focus')}</button>}
      <TitleBar
        project={project}
        doc={activeDoc || null}
        settings={settings}
        compiling={compiling}
        compileResult={compileResult}
        hasPdf={Boolean(pdfPath)}
        sidebarOpen={sidebarOpen}
        pdfOpen={pdfOpen}
        moreActions={moreActions}
        onCloseProject={() => void handleCloseProject()}
        onOpenMain={openMainFile}
        onOpenPalette={() => setPaletteOpen(true)}
        onCompile={() => void runCompile()}
        onCancel={() => void cancelCompile()}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
        onTogglePdf={() => setPdfOpen((value) => !value)}
        onOpenFolder={() => void handleOpenFolder()}
        onShowProblems={() => setProblemsOpen(true)}
      />

      {!project ? (
        <Welcome
          recent={recent}
          onOpenFolder={() => void handleOpenFolder()}
          onDemo={() => void handleDemo()}
          onOpenRecent={(entry) => void handleRecent(entry)}
          onTemplates={() => setTemplatesOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onPalette={() => setPaletteOpen(true)}
        />
      ) : (
        <div className="workbench" inert={closing} aria-busy={closing}>
          {sidebarOpen && (
            <Sidebar
              project={project}
              compiling={compiling}
              onSelectRoot={(file) => void handleSelectRoot(file)}
              activePath={activePath}
              tab={sidebarTab}
              outline={outline}
              cursorLine={cursor.line}
              symbols={effectiveSymbols}
              assets={assets}
              writingNotes={notes}
              onOpenNote={note => void gotoLocation(note.file, note.line, 1, true)}
              onToggleNote={note => void toggleNote(note)}
              onInsertNote={() => editorRef.current?.leaveNote()}
              onTabChange={setSidebarTab}
              onOpenFile={handleOpenFile}
              onRenameFile={(path) => void handleRenameFile(path)}
              onMoveDirectory={(path) => void handleMoveDirectory(path)}
              onCreateFolder={(parent) => void handleCreateFolder(parent)}
              onCreateFile={(parent) => void handleCreateFile(parent)}
              onMoveFile={(file) => void handleMoveFile(file)}
              onDeleteFile={(file) => void handleDeleteFile(file)}
              onRenameFolder={(dir) => void handleMoveDirectory(dir)}
              onDeleteFolder={(dir) => void handleDeleteFolder(dir)}
              onOutlineClick={(item) => void gotoLocation(item.file || activePath || undefined, item.line)}
              onInsert={insert}
              onInsertAsset={handleInsertAsset}
              onPreviewAsset={(asset) => setPreviewFile(asset.path)}
              onImportAssets={handleImportAssets}
              onDeleteAsset={handleDeleteAsset}
              onOpenFolder={() => void handleOpenFolder()}
              onSearchResult={handleSearchResult}
            />
          )}

          <main className="editor-column">
            <div className="editor-surface">
              {previewFile ? (
                <FilePreview
                  path={previewFile}
                  onClose={() => setPreviewFile(null)}
                  onOpenText={(path) => {
                    setPreviewFile(null);
                    void openFile(path);
                  }}
                  onInsertImage={handleInsertImagePath}
                  onReveal={(path) => void window.texpro.reveal(path)}
                  onOpenExternal={(path) => void window.texpro.openPath(path)}
                />
              ) : activeDoc ? (
                <EditorPane
                  key={activeDoc.path}
                  ref={editorRef}
                  path={activeDoc.path}
                  value={activeDoc.content}
                  savedContent={activeDoc.savedContent}
                  sessions={writingSessions.current}
                  diagnosticsStale={Boolean(compileResult && compiledSources.current[activeDoc.path] !== activeDoc.content)}
                  root={project.root}
                  mainText={project.rootFile ? docs[project.rootFile]?.content : undefined}
                  settings={settings}
                  symbols={effectiveSymbols}
                  diagnostics={activeDiagnostics}
                  onChange={(content) => {
                    setDocs((current) => {
                      const doc = current[activeDoc.path];
                      if (!doc) return current;
                      return {
                        ...current,
                        [activeDoc.path]: {
                          ...doc,
                          content,
                          dirty: content !== doc.savedContent,
                        },
                      };
                    });
                  }}
                  onCursor={setCursor}
                  onSave={() => void saveActive()}
                  onCompile={() => void runCompile()}
                  onPalette={() => setPaletteOpen(true)}
                  onForwardSync={manualForwardSync}
                  onPasteImage={(file) => void handleImageFiles([file])}
                  onDropFiles={(files) => void handleImageFiles(files)}
                  spellWords={spellWords}
                  gotoRequest={gotoRequest}
                  collabExtension={collabExtension}
                />
              ) : (
                <div className="editor-loading">
                  {openingFile ? `Opening ${openingFile.split('/').pop()}…` : 'Select a file to start editing.'}
                </div>
              )}
            </div>
            <ProblemsPanel
              open={problemsOpen}
              compiling={compiling}
              diagnostics={activeDiagnostics}
              compileResult={compileResult}
              log={compileLog}
              onToggle={() => setProblemsOpen((value) => !value)}
              onDiagnosticClick={handleDiagnosticClick}
            />
          </main>

          {pdfOpen && (
            <PdfPane
              bytes={pdfBytes}
              previousBytes={previousPdfBytes}
              pdfPath={pdfPath}
              compiling={compiling}
              error={compileResult?.error || (errors > 0 ? `${errors} compile errors` : null)}
              syncTarget={syncTarget}
              hotspots={boxHotspots}
              onCompile={() => void runCompile()}
              onInverse={(pageNumber, x, y, points) => void handleInverse(pageNumber, x, y, points)}
              onOpenPdf={openPdf}
              onReveal={revealPdf}
              onPageChange={setPage}
            />
          )}
        </div>
      )}

      {project && (
        <StatusBar
          compileResult={compileResult}
          compiling={compiling}
          cursor={cursor}
          words={stats.words}
          diagnostics={activeDiagnostics}
          page={page}
          visual={settings.visual}
          focus={settings.focus}
          onProblems={() => setProblemsOpen(true)}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        actions={paletteActions}
        onClose={() => setPaletteOpen(false)}
      />
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
        onOpenTemplates={() => {
          setSettingsOpen(false);
          setTemplatesOpen(true);
        }}
        onOpenChart={() => {
          setSettingsOpen(false);
          if (beginWritingHelper('chart')) setChartOpen(true);
        }}
        onOpenTikz={() => {
          setSettingsOpen(false);
          setTikzSource(null);
          if (beginWritingHelper('tikz')) setTikzOpen(true);
        }}
      />
      <TemplateGallery
        open={templatesOpen}
        userTemplates={userTemplates}
        activeDoc={activeDoc || null}
        activeEngine={settings.engine}
        onClose={() => setTemplatesOpen(false)}
        onCreate={handleCreateFromTemplate}
        onSaveCurrent={handleSaveTemplate}
        onDuplicate={handleSaveTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />
      <PgfplotsStudio
        open={chartOpen}
        projectRoot={project?.root || null}
        filePath={activePath}
        onClose={() => { setChartOpen(false); closeWritingHelper('chart'); }}
        onInsert={(code) => void applyWritingHelper('chart', code, ['tikz', 'pgfplots'])}
      />
      <PluginMarket
        open={pluginOpen}
        projectRoot={project?.root || null}
        completions={customCompletions}
        onClose={() => setPluginOpen(false)}
        onCompletionsChange={setCustomCompletions}
        onOpenMcp={() => { setPluginOpen(false); setMcpOpen(true); }}
      />
      <PaperStudio
        open={paperOpen}
        projectRoot={project?.root || null}
        onClose={() => setPaperOpen(false)}
        onJump={(file, line) => { setPaperOpen(false); void gotoLocation(file, line, 1, true); }}
      />
      <CrewPanel
        open={crewOpen}
        projectRoot={project?.root || null}
        rootFile={project?.rootFile || null}
        onClose={() => setCrewOpen(false)}
        onOpenCompileTheater={() => { setCrewOpen(false); setTheaterOpen(true); }}
        onApplied={() => { const current = projectRef.current; if (current) { void refreshProjectData(); const path = activePathRef.current; if (path) void openFile(path); } }}
      />
      <CompileTheater
        open={theaterOpen}
        compileResult={compileResult}
        compiling={compiling}
        diagnostics={activeDiagnostics}
        log={compileLog}
        onClose={() => setTheaterOpen(false)}
        onCompile={() => void runCompile()}
        onJump={handleDiagnosticClick}
      />
      <CommandStudio
        open={commandOpen}
        projectRoot={project?.root || null}
        rootFile={project?.rootFile || null}
        onBeforeRun={saveAll}
        actions={actions}
        customCompletions={customCompletions}
        onClose={() => setCommandOpen(false)}
        onActionsChange={setActions}
        onCompletionsChange={setCustomCompletions}
      />
      <PackageManager
        open={packageOpen}
        documentText={project?.rootFile ? docs[project.rootFile]?.content || '' : ''}
        onClose={() => setPackageOpen(false)}
        onApply={(text, engine) => {
          void editMainFile(editor => editor.replaceAll(text));
          if (engine) setSettings((current) => ({ ...current, engine }));
          setPackageOpen(false);
          pushToast(tr('Document setup applied'), 'success');
        }}
      />
      <McpElicitation
        payload={elicitation}
        onRespond={(result) => {
          if (elicitation) void window.texpro.respondElicitation(elicitation.id, result);
          setElicitation(null);
        }}
      />
      <GitPanel
        open={gitOpen}
        projectRoot={project?.root || null}
        onClose={() => setGitOpen(false)}
        onOpenProject={(path) => { void window.texpro.openProject(path).then((next) => loadProject(next)).catch((error) => pushToast(tr('Could not open project'), 'error', String(error))); }}
        onGitChange={setGitManaged}
      />
      <CollabPanel
        open={collabOpen}
        activeFile={activePath}
        content={activeDoc?.content || ''}
        onClose={() => setCollabOpen(false)}
        onSessionChange={(extension, file) => { setCollabExtension(extension); setCollabFile(file); }}
      />
      <InkStudio
        open={inkOpen}
        projectRoot={project?.root || null}
        activeFile={activePath}
        assetsDir={projectConfig.directories.assets}
        onClose={() => { setInkOpen(false); closeWritingHelper('ink'); }}
        onInsert={(text) => void applyWritingHelper('ink', text, ['graphicx'])}
      />
      <SchematicStudio
        open={schematicMode !== null}
        mode={schematicMode || 'circuit'}
        projectRoot={project?.root || null}
        filePath={activePath}
        onClose={() => { setSchematicMode(null); closeWritingHelper('schematic'); }}
        onInsert={(code, packageName) => void applyWritingHelper('schematic', code, [packageName])}
      />
      <BackupPanel
        open={backupOpen}
        projectRoot={project?.root || null}
        onClose={() => setBackupOpen(false)}
        onReveal={(path) => void window.texpro.reveal(path)}
      />
      <VersionReview
        open={versionOpen}
        projectRoot={project?.root || null}
        activeFile={activePath}
        activeContent={activeDoc?.content || ''}
        onClose={() => setVersionOpen(false)}
        onRestored={(file) => { setVersionOpen(false); void openFile(file); }}
        gitManaged={gitManaged}
        onOpenGit={() => { setVersionOpen(false); setGitOpen(true); }}
      />
      <FontCoverage
        open={fontOpen}
        projectRoot={project?.root || null}
        onClose={() => setFontOpen(false)}
        onOpen={(path) => void window.texpro.openPath(path)}
      />
      <ProjectGraph
        open={graphOpen}
        projectRoot={project?.root || null}
        onClose={() => setGraphOpen(false)}
        onOpen={(file, line) => { setGraphOpen(false); void gotoLocation(file, line, 1, true); }}
      />
      <ArxivPanel
        open={arxivOpen}
        projectRoot={project?.root || null}
        onClose={() => setArxivOpen(false)}
        onOpen={(path) => void window.texpro.openPath(path)}
        onReveal={(path) => void window.texpro.reveal(path)}
      />
      <McpPanel
        open={mcpOpen}
        projectRoot={project?.root || null}
        onClose={() => setMcpOpen(false)}
      />
      <AIAssistant
        open={aiOpen}
        settings={{ enabled: settings.aiEnabled, apiKey: settings.aiApiKey, model: settings.aiModel, baseUrl: settings.aiBaseUrl }}
        compileError={[
          ...((compileResult?.diagnostics || []).filter((item) => item.severity === 'error').map((item) => `${item.file || ''}:${item.line || 0} ${item.message}`)),
          compileResult?.error || '',
        ].filter(Boolean).join('\n')}
        defaultContext={activeDoc
          ? activeDoc.content.split('\n').slice(Math.max(0, cursor.line - 1), Math.min(activeDoc.content.split('\n').length, cursor.line + 3)).join('\n')
          : ''}
        selection={editorRef.current?.getSelection() || ''}
        onClose={() => setAiOpen(false)}
        onInsert={(text) => {
          if (!activePathRef.current) {
            pushToast(tr('Open a document first'), 'info');
            return;
          }
          editorRef.current?.insert(text);
          pushToast(tr('AI result inserted'), 'success');
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onApplyAction={(action) => {
          if (!activePathRef.current) return;
          if (action.type === 'insert') editorRef.current?.insert(action.text);
          else if (action.type === 'replace-selection') editorRef.current?.replaceSelection(action.text);
          else if (action.type === 'replace-document') {
            if (!window.confirm(tr('Replace the entire document with this AI action?'))) return;
            const length = docsRef.current[activePathRef.current]?.content.length || 0;
            editorRef.current?.replaceRange(0, length, action.text);
          }
          pushToast(tr('AI action applied'), 'success', action.type);
        }}
      />
      <CommentsPanel
        open={commentsOpen}
        comments={comments}
        activeFile={activePath}
        currentLine={cursor.line}
        currentSnippet={(activeDoc?.content.split('\n')[Math.max(0, cursor.line - 1)] || '').trim()}
        onClose={() => setCommentsOpen(false)}
        onAdd={handleAddComment}
        onResolve={(id, resolved) => void saveComments(comments.map((comment) => (comment.id === id ? { ...comment, resolved } : comment)))}
        onDelete={(id) => void saveComments(comments.filter((comment) => comment.id !== id))}
        onOpen={(comment) => { setCommentsOpen(false); void gotoLocation(comment.file, comment.line, 1, true); }}
      />
      <ExportStudio
        open={exportOpen}
        source={activeDoc?.content || ''}
        name={activeDoc ? basename(activeDoc.path) : 'document.tex'}
        onClose={() => setExportOpen(false)}
      />
      <ProjectDoctor
        open={doctorOpen}
        projectRoot={project?.root || null}
        buildDir={projectConfig.directories.build}
        onClose={() => setDoctorOpen(false)}
        onOpenIssue={(file, line) => { setDoctorOpen(false); void gotoLocation(file, line, 1, true); }}
        onCleanBuild={async () => {
          const currentProject = projectRef.current;
          if (!currentProject) return;
          await window.texpro.cleanBuild(currentProject.root, projectConfigRef.current.directories.build);
          setPdfPath(null);
          setPdfBytes(null);
          pushToast(tr('Build artifacts removed'), 'success');
        }}
      />
      <TableStudio
        open={Boolean(tableRequest)}
        source={tableRequest?.source || ''}
        onClose={() => { setTableRequest(null); closeWritingHelper('table'); }}
        onApply={(code, useBooktabs) => {
          void applyWritingHelper('table', code, useBooktabs ? ['booktabs'] : []);
          setTableRequest(null);
        }}
      />
      <ImportStudio
        open={importOpen}
        hasProject={Boolean(project)}
        onClose={() => setImportOpen(false)}
        onInsert={handleInsertImport}
        onCreate={handleCreateImport}
      />
      <TemplateWorkshop
        open={workshopOpen}
        onClose={() => setWorkshopOpen(false)}
        onSave={handleSaveTemplate}
        onApply={(content) => {
          const doc = activePathRef.current;
          if (!doc) {
            pushToast(tr('Open a document first'), 'info');
            return;
          }
          if (!window.confirm(tr('Replace the current document with this template?'))) return;
          const filled = fillTemplate(content, {
            title: basename(doc).replace(/\.(tex|ltx)$/i, ''),
            author: '',
            projectName: project?.name || 'document',
          });
          const length = docsRef.current[doc]?.content.length || 0;
          editorRef.current?.replaceRange(0, length, filled);
          pushToast(tr('Template applied'), 'success', 'LaTeX');
        }}
      />
      <ProjectStudio
        open={projectStudioOpen}
        project={project}
        config={projectConfig}
        onClose={() => setProjectStudioOpen(false)}
        onSaveConfig={handleSaveProjectConfig}
        onCreateModule={handleCreateModule}
        onApply={handleApplyProjectConfig}
      />
      <BibManager
        open={bibOpen}
        projectRoot={project?.root || null}
        activeFile={activePath}
        activeContent={activeDoc?.content || ''}
        bibFiles={bibFiles}
        onClose={() => setBibOpen(false)}
        onInsertCite={handleInsertCite}
        onAddBibliography={handleAddBibliography}
        onChanged={() => void refreshProjectData()}
      />
      <FormulaStudio
        open={formulaOpen}
        initialLatex={formulaSeed}
        onClose={() => { setFormulaOpen(false); closeWritingHelper('formula'); }}
        onInsert={(code) => void applyWritingHelper('formula', code)}
      />
      <LayoutStudio
        open={layoutOpen}
        documentText={project?.rootFile ? docs[project.rootFile]?.content || '' : ''}
        onClose={() => setLayoutOpen(false)}
        onApply={handleApplyLayout}
      />
      <TikzStudio
        open={tikzOpen}
        projectRoot={project?.root || null}
        filePath={activePath}
        initialSource={tikzSource}
        onClose={() => { setTikzOpen(false); closeWritingHelper('tikz'); }}
        onInsert={(source) => void applyWritingHelper('tikz', source)}
      />
      {collabExtension && !collabOpen && (
        <button className="collab-live-pill" onClick={() => setCollabOpen(true)} title={t('Open writing room')}>
          <Users size={13} /> {t('Writing room live')}
        </button>
      )}
      <Toasts
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))}
      />
      <div className="status-announcer" aria-live="polite">{status}</div>
    </div>
  );
}
