import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookMarked,
  BookOpen,
  Copy,
  Eye,
  FileImage as FileImageIcon,
  ImagePlus,
  Trash2,
  Upload,
  Braces,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderInput,
  Hash,
  ListTree,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shapes,
  Sigma,
  SlidersHorizontal,
  Tag,
} from 'lucide-react';
import type { AssetItem, FileNode, OutlineItem, Project, ProjectSymbols, SearchResult } from '../types';
import { snippetLibrary } from '../editor/completions';
import { allSymbols, renderSymbolHtml, symbolModules, type SymbolItem } from '../lib/symbols';
import { assetUrl, basename, dirname, extname, relativePath } from '../lib/latex';
import { useI18n } from '../i18n';

type SidebarTab = 'files' | 'outline' | 'assets' | 'symbols' | 'search';

interface Props {
  project: Project | null;
  activePath: string | null;
  tab: SidebarTab;
  outline: OutlineItem[];
  cursorLine: number;
  symbols: ProjectSymbols;
  assets: AssetItem[];
  onTabChange: (tab: SidebarTab) => void;
  onOpenFile: (path: string) => void;
  onRenameFile: (path: string) => void;
  onMoveDirectory: (path: string) => void;
  onCreateFolder: (parent: string) => void;
  onCreateFile: (parent: string) => void;
  onMoveFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onRenameFolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onOutlineClick: (item: OutlineItem) => void;
  onInsert: (text: string) => void;
  onInsertAsset: (asset: AssetItem) => void;
  onPreviewAsset: (asset: AssetItem) => void;
  onImportAssets: () => Promise<void>;
  onDeleteAsset: (asset: AssetItem) => Promise<void>;
  onOpenFolder: () => void;
  onSearchResult: (result: SearchResult) => void;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(node: FileNode) {
  const ext = node.ext || extname(node.name);
  if (ext === '.tex' || ext === '.ltx') return <FileText size={13} className="file-icon tex" />;
  if (ext === '.bib') return <BookMarked size={13} className="file-icon bib" />;
  if (['.png', '.jpg', '.jpeg', '.pdf', '.svg', '.eps'].includes(ext)) return <FileImage size={13} className="file-icon img" />;
  if (['.sty', '.cls', '.def', '.clo'].includes(ext)) return <FileCode2 size={13} className="file-icon sty" />;
  return <File size={13} className="file-icon" />;
}

function containsPath(node: FileNode, path: string): boolean {
  if (node.path === path) return true;
  if (!node.children) return false;
  return node.children.some((child) => containsPath(child, path));
}

function TreeItem({
  node,
  depth,
  activePath,
  onOpenFile,
  onNodeContextMenu,
}: {
  node: FileNode;
  depth: number;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onNodeContextMenu: (node: FileNode, event: React.MouseEvent) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => Boolean(activePath && containsPath(node, activePath)));
  useEffect(() => {
    if (node.type === 'dir' && activePath && containsPath(node, activePath)) setOpen(true);
  }, [activePath, node]);
  if (node.type === 'dir') {
    return (
      <div className="tree-dir">
        <button
          className="tree-row"
          style={{ paddingLeft: 9 + depth * 13 }}
          onClick={() => setOpen((value) => !value)}
          onContextMenu={(event) => { event.preventDefault(); onNodeContextMenu(node, event); }}
          title={t('Right-click for file actions')}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {open ? <FolderOpen size={13} className="folder-icon" /> : <Folder size={13} className="folder-icon" />}
          <span>{node.name}</span>
          <span className="tree-count">{node.children?.length || 0}</span>
        </button>
        {open && node.children?.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            onOpenFile={onOpenFile}
            onNodeContextMenu={onNodeContextMenu}
          />
        ))}
      </div>
    );
  }
  const active = node.path === activePath;
  return (
    <button
      className={`tree-row tree-file ${active ? 'active' : ''}`}
      style={{ paddingLeft: 21 + depth * 13 }}
      onClick={() => onOpenFile(node.path)}
      onContextMenu={(event) => { event.preventDefault(); onNodeContextMenu(node, event); }}
      title={`${node.relative} · ${t('Right-click for file actions')}`}
    >
      {fileIcon(node)}
      <span>{node.name}</span>
    </button>
  );
}

function outlineIcon(item: OutlineItem) {
  if (item.kind === 'label') return <Tag size={12} className="outline-icon label" />;
  if (item.kind === 'equation') return <Sigma size={12} className="outline-icon equation" />;
  if (item.kind === 'todo') return <CheckSquare size={12} className="outline-icon todo" />;
  return <Hash size={12} className="outline-icon" />;
}

export function Sidebar({
  project,
  activePath,
  tab,
  outline,
  cursorLine,
  symbols,
  assets,
  onTabChange,
  onOpenFile,
  onRenameFile,
  onMoveDirectory,
  onCreateFolder,
  onCreateFile,
  onMoveFile,
  onDeleteFile,
  onRenameFolder,
  onDeleteFolder,
  onOutlineClick,
  onInsert,
  onInsertAsset,
  onPreviewAsset,
  onImportAssets,
  onDeleteAsset,
  onOpenFolder,
  onSearchResult,
}: Props) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [symbolConfigOpen, setSymbolConfigOpen] = useState(false);
  const [treeMenu, setTreeMenu] = useState<{ node: FileNode; x: number; y: number } | null>(null);
  const [enabledModules, setEnabledModules] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('texpro.symbolModules') || 'null');
      if (Array.isArray(stored) && stored.length) return stored;
    } catch {
      // ignore
    }
    return symbolModules.map((module) => module.id);
  });
  const [recentSymbols, setRecentSymbols] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('texpro.recentSymbols') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  const [assetFilter, setAssetFilter] = useState('');
  const { t } = useI18n();

  useEffect(() => {
    if (tab !== 'search' || !project || query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await window.texpro.searchProject(project.root, query.trim(), caseSensitive);
        if (!cancelled) {
          setResults(found);
          setSearchError(null);
        }
      } catch (error) {
        if (!cancelled) setSearchError(String(error));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, caseSensitive, tab, project]);

  const catalog = useMemo(() => allSymbols(), []);
  const filteredModules = useMemo(() => {
    const needle = symbolFilter.toLowerCase().replace(/^\\/, '');
    return symbolModules
      .filter((module) => enabledModules.includes(module.id))
      .map((module) => ({
        ...module,
        symbols: module.symbols.filter((symbol) => {
          if (!needle) return true;
          return [symbol.name, symbol.latex, ...(symbol.aliases || [])]
            .join(' ')
            .toLowerCase()
            .includes(needle);
        }),
      }))
      .filter((module) => module.symbols.length > 0);
  }, [symbolFilter, enabledModules]);
  const recentItems = useMemo(
    () => recentSymbols.map((id) => catalog.find((symbol) => symbol.id === id)).filter(Boolean).slice(0, 16) as SymbolItem[],
    [recentSymbols, catalog],
  );

  useEffect(() => {
    localStorage.setItem('texpro.symbolModules', JSON.stringify(enabledModules));
  }, [enabledModules]);
  useEffect(() => {
    localStorage.setItem('texpro.recentSymbols', JSON.stringify(recentSymbols));
  }, [recentSymbols]);

  const insertSymbol = (symbol: SymbolItem) => {
    onInsert(symbol.latex);
    setRecentSymbols((current) => [symbol.id, ...current.filter((id) => id !== symbol.id)].slice(0, 24));
  };

  return (
    <aside className="sidebar" data-tree-menu={treeMenu ? treeMenu.node.name : ""}>
      <nav className="sidebar-rail" aria-label="Sidebar sections">
        <button className={tab === 'files' ? 'active' : ''} data-testid="tab-files"
          onClick={() => onTabChange('files')} title={t('Project files')} aria-label={t('Project files')}>
          <Files size={17} />
        </button>
        <button className={tab === 'outline' ? 'active' : ''} onClick={() => onTabChange('outline')} title={t('Outline')} aria-label={t('Outline')}>
          <ListTree size={17} />
        </button>
        <button className={tab === 'assets' ? 'active' : ''} data-testid="tab-assets"
          onClick={() => onTabChange('assets')} title={t('Asset library')} aria-label={t('Asset library')}>
          <FileImageIcon size={17} />
        </button>
        <button className={tab === 'symbols' ? 'active' : ''} data-testid="tab-symbols"
          onClick={() => onTabChange('symbols')} title={t('Symbols')} aria-label={t('Symbols')}>
          <Shapes size={17} />
        </button>
        <button className={tab === 'search' ? 'active' : ''} onClick={() => onTabChange('search')} title={t('Search project')} aria-label={t('Search project')}>
          <Search size={17} />
        </button>
        <div className="rail-spacer" />
        <button onClick={onOpenFolder} title={t('Open another project')} aria-label={t('Open another project')}>
          <Plus size={17} />
        </button>
      </nav>

      <div className="sidebar-panel">
        {tab === 'files' && (
          <>
            <div className="panel-heading">
              <span>{t('Project')}</span>
              <div className="panel-heading-actions">
                <button className="mini-btn" onClick={() => onCreateFile(project?.root || '')} title={t('New file')}><Plus size={11} /></button>
                <button className="mini-btn" onClick={() => onCreateFolder(project?.root || '')} title={t('New folder')}><FolderPlus size={11} /></button>
                <button className="mini-btn" onClick={onOpenFolder} title={t('Open another project (⌘O)')} aria-label={t('Open another project (⌘O)')}><FolderOpen size={11} /></button>
              </div>
            </div>
            <div className="project-card">
              <div className="project-card-icon"><BookOpen size={15} /></div>
              <div className="project-card-text">
                <strong>{project?.name || 'No project'}</strong>
                <span>{project ? project.root.replace(/^.*\/(?=[^/]+\/[^/]+$)/, '…/') : 'Open a folder to begin'}</span>
              </div>
            </div>
            <div className="file-tree">
              {project ? (
                project.tree.length ? (
                  project.tree.map((node) => (
                    <TreeItem
                      key={node.path}
                      node={node}
                      depth={0}
                      activePath={activePath}
                      onOpenFile={onOpenFile}
                      onNodeContextMenu={(node, event) => setTreeMenu({ node, x: event.clientX, y: event.clientY })}
                    />
                  ))
                ) : (
                  <div className="panel-empty">This folder is empty.</div>
                )
              ) : (
                <div className="panel-empty">No project open.</div>
              )}
            </div>
          </>
        )}

        {tab === 'outline' && (
          <>
            <div className="panel-heading">
              <span>{t('Outline')}</span>
              <span className="panel-badge">{outline.length}</span>
            </div>
            <div className="outline-list">
              {outline.length === 0 && (
                <div className="panel-empty">{t('outline empty')}</div>
              )}
              {outline.map((item) => {
                const active = Math.abs(cursorLine - item.line) <= 1;
                return (
                  <button
                    key={item.id}
                    className={`outline-row ${active ? 'active' : ''} outline-level-${Math.min(item.level, 4)}`}
                    style={{ paddingLeft: 10 + Math.min(item.level, 4) * 13 }}
                    onClick={() => onOutlineClick(item)}
                    title={`Line ${item.line}`}
                  >
                    {outlineIcon(item)}
                    <span>{item.title}</span>
                    <span className="outline-line">{item.line}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {tab === 'assets' && (
          <>
            <div className="panel-heading">
              <span>{t('Assets')}</span>
              <span className="panel-badge">{assets.length}</span>
            </div>
            <div className="asset-toolbar">
              <button className="asset-import" onClick={() => void onImportAssets()}>
                <Upload size={12} /> {t('Import images')}
              </button>
            </div>
            <div className="sidebar-search">
              <Search size={12} />
              <input
                value={assetFilter}
                onChange={(event) => setAssetFilter(event.target.value)}
                placeholder={t('Filter assets…')}
              />
            </div>
            <div className="asset-grid">
              {assets
                .filter((asset) => asset.name.toLowerCase().includes(assetFilter.toLowerCase()))
                .map((asset) => (
                  <div className="asset-card" key={asset.path}>
                    <button className="asset-thumb" onClick={() => onPreviewAsset(asset)} title={t('Preview file')}>
                      {['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(asset.ext) ? (
                        <img src={assetUrl(asset.path)} alt={asset.name} loading="lazy" />
                      ) : (
                        <FileImageIcon size={22} />
                      )}
                    </button>
                    <div className="asset-meta">
                      <strong title={asset.relative}>{asset.name}</strong>
                      <small>{formatBytes(asset.size)} · {asset.ext.replace('.', '').toUpperCase()}</small>
                    </div>
                    <div className="asset-actions">
                      <button onClick={() => onInsertAsset(asset)} title={t('Insert into document')}><ImagePlus size={11} /></button>
                      <button onClick={() => onPreviewAsset(asset)} title={t('Preview file')}><Eye size={11} /></button>
                      <button
                        onClick={() => {
                          void navigator.clipboard?.writeText(asset.relative);
                        }}
                        title={t('Copy path')}
                      >
                        <Copy size={11} />
                      </button>
                      <button onClick={() => void window.texpro.reveal(asset.path)} title={t('Reveal in Finder')}>
                        <FileImageIcon size={11} />
                      </button>
                      <button
                        className="asset-delete"
                        onClick={() => {
                          if (window.confirm(`${t('Delete asset?')}\n${asset.name}`)) void onDeleteAsset(asset);
                        }}
                        title={t('Delete')}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              {assets.length === 0 && (
                <div className="asset-empty">
                  <ImagePlus size={22} />
                  <strong>{t('No assets yet')}</strong>
                  <span>{t('Import an image to preview and insert it here.')}</span>
                  <button className="primary-btn" onClick={() => void onImportAssets()}>
                    <Upload size={12} /> {t('Import assets')}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'symbols' && (
          <>
            <div className="panel-heading">
              <span>{t('Symbols')}</span>
              <div className="symbol-heading-actions">
                <span className="panel-badge">{catalog.length}</span>
                <button
                  className={`mini-btn ${symbolConfigOpen ? 'active' : ''}`}
                  onClick={() => setSymbolConfigOpen((value) => !value)}
                  title={t('Configure symbol modules')}
                >
                  <SlidersHorizontal size={12} />
                </button>
              </div>
            </div>
            {symbolConfigOpen && (
              <div className="symbol-config">
                <div className="symbol-config-title">{t('Symbol modules')}</div>
                <div className="symbol-config-list">
                  {symbolModules.map((module) => {
                    const enabled = enabledModules.includes(module.id);
                    return (
                      <label key={module.id} className="symbol-config-row">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => {
                            setEnabledModules((current) =>
                              enabled ? current.filter((id) => id !== module.id) : [...current, module.id],
                            );
                          }}
                        />
                        <span>{t(module.name)}</span>
                        <em>{module.symbols.length}</em>
                      </label>
                    );
                  })}
                </div>
                <button
                  className="symbol-config-reset"
                  onClick={() => setEnabledModules(symbolModules.map((module) => module.id))}
                >
                  {t('Enable all')}
                </button>
              </div>
            )}
            <div className="sidebar-search">
              <Search size={12} />
              <input
                value={symbolFilter}
                onChange={(event) => setSymbolFilter(event.target.value)}
                placeholder={t('Filter symbols…')}
              />
            </div>
            <div className="symbol-scroll">
              {recentItems.length > 0 && !symbolFilter && (
                <div className="symbol-group">
                  <div className="symbol-title">{t('Recently used')}</div>
                  <div className="symbol-grid rendered">
                    {recentItems.map((symbol) => (
                      <button
                        key={`recent-${symbol.id}`}
                        onClick={() => insertSymbol(symbol)}
                        title={`${symbol.name} · ${symbol.latex}`}
                      >
                        <span className="symbol-render" dangerouslySetInnerHTML={{ __html: renderSymbolHtml(symbol) }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {filteredModules.map((module) => (
                <div className="symbol-group" key={module.id}>
                  <div className="symbol-title">
                    {t(module.name)}
                    <span>{module.symbols.length}</span>
                  </div>
                  <div className="symbol-grid rendered">
                    {module.symbols.map((symbol) => (
                      <button
                        key={symbol.id}
                        onClick={() => insertSymbol(symbol)}
                        title={`${symbol.name} · ${symbol.latex}`}
                      >
                        <span className="symbol-render" dangerouslySetInnerHTML={{ __html: renderSymbolHtml(symbol) }} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {enabledModules.length === 0 && <div className="panel-empty">{t('No symbol modules enabled.')}</div>}
              {filteredModules.length === 0 && enabledModules.length > 0 && (
                <div className="panel-empty">{t('No symbols match this filter.')}</div>
              )}
              <div className="symbol-group">
                <div className="symbol-title">{t('Structures')}</div>
                <div className="snippet-list">
                  {snippetLibrary.map((item) => (
                    <button key={item.id} className="snippet-row" onClick={() => onInsert(item.template)}>
                      <Braces size={13} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.description}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'search' && (
          <>
            <div className="panel-heading">
              <span>{t('Search project')}</span>
              <button
                className={`mini-btn ${caseSensitive ? 'active' : ''}`}
                onClick={() => setCaseSensitive((value) => !value)}
                title="Match case"
              >
                Aa
              </button>
            </div>
            <div className="sidebar-search">
              <Search size={12} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('Search .tex, .bib, .sty…')}
              />
              {searching && <Loader2 size={12} className="spin" />}
            </div>
            <div className="search-meta">
              {query.length >= 2 && !searching ? `${results.length} result${results.length === 1 ? '' : 's'}` : t('Type at least 2 characters')}
            </div>
            <div className="search-results">
              {searchError && <div className="panel-empty danger-text">{searchError}</div>}
              {results.map((result) => (
                <button
                  key={`${result.file}-${result.line}`}
                  className="search-result"
                  onClick={() => onSearchResult(result)}
                >
                  <div className="search-result-head">
                    <span>{basename(result.file)}</span>
                    <em>:{result.line}</em>
                  </div>
                  <div className="search-result-text">{result.text}</div>
                  <div className="search-result-path">{result.relative}</div>
                </button>
              ))}
              {!searching && query.length >= 2 && results.length === 0 && !searchError && (
                <div className="panel-empty">{t('No matches found.')}</div>
              )}
            </div>
          </>
        )}
      </div>
      {treeMenu && createPortal(
        <>
          <div className="tree-menu-scrim" onMouseDown={() => setTreeMenu(null)} onContextMenu={(event) => { event.preventDefault(); setTreeMenu(null); }} />
          <div className="tree-menu" style={{ left: treeMenu.x, top: treeMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
            <div className="tree-menu-title">{treeMenu.node.type === 'dir' ? treeMenu.node.name : basename(treeMenu.node.path)}</div>
            {treeMenu.node.type === 'dir' ? (
              <>
                <button onClick={() => { onCreateFile(treeMenu.node.path); setTreeMenu(null); }}><FilePlus2 size={12} /> {t('New file')}</button>
                <button onClick={() => { onCreateFolder(treeMenu.node.path); setTreeMenu(null); }}><FolderPlus size={12} /> {t('New folder')}</button>
                <button onClick={() => { onRenameFolder(treeMenu.node.path); setTreeMenu(null); }}><Pencil size={12} /> {t('Rename folder')}</button>
                <button className="danger" onClick={() => { onDeleteFolder(treeMenu.node.path); setTreeMenu(null); }}><Trash2 size={12} /> {t('Delete folder')}</button>
              </>
            ) : (
              <>
                <button onClick={() => { onRenameFile(treeMenu.node.path); setTreeMenu(null); }}><Pencil size={12} /> {t('Rename file')}</button>
                <button onClick={() => { onMoveFile(treeMenu.node.path); setTreeMenu(null); }}><FolderInput size={12} /> {t('Move file')}</button>
                <button className="danger" onClick={() => { onDeleteFile(treeMenu.node.path); setTreeMenu(null); }}><Trash2 size={12} /> {t('Delete file')}</button>
              </>
            )}
          </div>
        </>,
        document.body,
      )}
    </aside>
  );
}

export type { SidebarTab };
