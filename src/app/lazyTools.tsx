import { Component, Suspense, lazy, useRef, useState, type ComponentType, type ComponentProps, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RotateCcw, X } from 'lucide-react';
import { useI18n } from '../i18n';

type ToolProps = { open: boolean; onClose: () => void };

class RecoveryBoundary extends Component<{ children: ReactNode; open: boolean; fallback: (retry: () => void) => ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('[tool]', error); }
  componentDidUpdate(previous: { open: boolean }) {
    if (previous.open !== this.props.open && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? (this.props.open ? this.props.fallback(() => this.setState({ failed: false })) : null) : this.props.children;
  }
}

/** Load tools on first use, retain their state when closed, isolate render errors. */
function deferredTool<P extends ToolProps>(load: () => Promise<{ default: ComponentType<P> }>) {
  return function DeferredTool(props: P) {
    const { t } = useI18n();
    const loaded = useRef(false);
    const [generation, setGeneration] = useState(0);
    const [Tool, setTool] = useState(() => lazy(load));
    loaded.current ||= props.open;
    if (!loaded.current) return null;
    const recovery = (retry?: () => void) => (
      <div className="modal-scrim">
        <section className="tool-recovery" role="dialog" aria-modal="true" aria-label={t('Tool status')}>
          <button className="icon-btn tool-recovery-close" onClick={props.onClose} aria-label={t('Close')}><X size={18} /></button>
          {retry ? <AlertTriangle size={24} /> : <Loader2 size={24} className="spin" />}
          <h2>{t(retry ? 'This tool stopped unexpectedly.' : 'Opening tool…')}</h2>
          {retry && <><p>{t('Your document is still open. Reopen the tool or return to writing.')}</p><div><button className="secondary-btn" onClick={props.onClose}>{t('Return to writing')}</button><button className="primary-btn" onClick={() => { setTool(() => lazy(load)); setGeneration((value) => value + 1); retry(); }}><RotateCcw size={14} />{t('Reopen tool')}</button></div></>}
        </section>
      </div>
    );
    return <RecoveryBoundary open={props.open} fallback={recovery}><Suspense fallback={props.open ? recovery() : null}><Tool key={generation} {...props} /></Suspense></RecoveryBoundary>;
  };
}

export const TemplateGallery = deferredTool<ComponentProps<typeof import('../components/TemplateGallery')['TemplateGallery']>>(() => import('../components/TemplateGallery').then((m) => ({ default: m.TemplateGallery })));
export const PgfplotsStudio = deferredTool<ComponentProps<typeof import('../components/PgfplotsStudio')['PgfplotsStudio']>>(() => import('../components/PgfplotsStudio').then((m) => ({ default: m.PgfplotsStudio })));
export const PluginMarket = deferredTool<ComponentProps<typeof import('../components/PluginMarket')['PluginMarket']>>(() => import('../components/PluginMarket').then((m) => ({ default: m.PluginMarket })));
export const PaperStudio = deferredTool<ComponentProps<typeof import('../components/PaperStudio')['PaperStudio']>>(() => import('../components/PaperStudio').then((m) => ({ default: m.PaperStudio })));
export const CrewPanel = deferredTool<ComponentProps<typeof import('../components/CrewPanel')['CrewPanel']>>(() => import('../components/CrewPanel').then((m) => ({ default: m.CrewPanel })));
export const CompileTheater = deferredTool<ComponentProps<typeof import('../components/CompileTheater')['CompileTheater']>>(() => import('../components/CompileTheater').then((m) => ({ default: m.CompileTheater })));
export const CommandStudio = deferredTool<ComponentProps<typeof import('../components/CommandStudio')['CommandStudio']>>(() => import('../components/CommandStudio').then((m) => ({ default: m.CommandStudio })));
export const PackageManager = deferredTool<ComponentProps<typeof import('../components/PackageManager')['PackageManager']>>(() => import('../components/PackageManager').then((m) => ({ default: m.PackageManager })));
export const GitPanel = deferredTool<ComponentProps<typeof import('../components/GitPanel')['GitPanel']>>(() => import('../components/GitPanel').then((m) => ({ default: m.GitPanel })));
export const InkStudio = deferredTool<ComponentProps<typeof import('../components/InkStudio')['InkStudio']>>(() => import('../components/InkStudio').then((m) => ({ default: m.InkStudio })));
export const SchematicStudio = deferredTool<ComponentProps<typeof import('../components/SchematicStudio')['SchematicStudio']>>(() => import('../components/SchematicStudio').then((m) => ({ default: m.SchematicStudio })));
export const BackupPanel = deferredTool<ComponentProps<typeof import('../components/BackupPanel')['BackupPanel']>>(() => import('../components/BackupPanel').then((m) => ({ default: m.BackupPanel })));
export const VersionReview = deferredTool<ComponentProps<typeof import('../components/VersionReview')['VersionReview']>>(() => import('../components/VersionReview').then((m) => ({ default: m.VersionReview })));
export const FontCoverage = deferredTool<ComponentProps<typeof import('../components/FontCoverage')['FontCoverage']>>(() => import('../components/FontCoverage').then((m) => ({ default: m.FontCoverage })));
export const ProjectGraph = deferredTool<ComponentProps<typeof import('../components/ProjectGraph')['ProjectGraph']>>(() => import('../components/ProjectGraph').then((m) => ({ default: m.ProjectGraph })));
export const ArxivPanel = deferredTool<ComponentProps<typeof import('../components/ArxivPanel')['ArxivPanel']>>(() => import('../components/ArxivPanel').then((m) => ({ default: m.ArxivPanel })));
export const McpPanel = deferredTool<ComponentProps<typeof import('../components/McpPanel')['McpPanel']>>(() => import('../components/McpPanel').then((m) => ({ default: m.McpPanel })));
export const AIAssistant = deferredTool<ComponentProps<typeof import('../components/AIAssistant')['AIAssistant']>>(() => import('../components/AIAssistant').then((m) => ({ default: m.AIAssistant })));
export const CommentsPanel = deferredTool<ComponentProps<typeof import('../components/CommentsPanel')['CommentsPanel']>>(() => import('../components/CommentsPanel').then((m) => ({ default: m.CommentsPanel })));
export const ExportStudio = deferredTool<ComponentProps<typeof import('../components/ExportStudio')['ExportStudio']>>(() => import('../components/ExportStudio').then((m) => ({ default: m.ExportStudio })));
export const ProjectDoctor = deferredTool<ComponentProps<typeof import('../components/ProjectDoctor')['ProjectDoctor']>>(() => import('../components/ProjectDoctor').then((m) => ({ default: m.ProjectDoctor })));
export const TableStudio = deferredTool<ComponentProps<typeof import('../components/TableStudio')['TableStudio']>>(() => import('../components/TableStudio').then((m) => ({ default: m.TableStudio })));
export const ImportStudio = deferredTool<ComponentProps<typeof import('../components/ImportStudio')['ImportStudio']>>(() => import('../components/ImportStudio').then((m) => ({ default: m.ImportStudio })));
export const TemplateWorkshop = deferredTool<ComponentProps<typeof import('../components/TemplateWorkshop')['TemplateWorkshop']>>(() => import('../components/TemplateWorkshop').then((m) => ({ default: m.TemplateWorkshop })));
export const ProjectStudio = deferredTool<ComponentProps<typeof import('../components/ProjectStudio')['ProjectStudio']>>(() => import('../components/ProjectStudio').then((m) => ({ default: m.ProjectStudio })));
export const BibManager = deferredTool<ComponentProps<typeof import('../components/BibManager')['BibManager']>>(() => import('../components/BibManager').then((m) => ({ default: m.BibManager })));
export const FormulaStudio = deferredTool<ComponentProps<typeof import('../components/FormulaStudio')['FormulaStudio']>>(() => import('../components/FormulaStudio').then((m) => ({ default: m.FormulaStudio })));
export const LayoutStudio = deferredTool<ComponentProps<typeof import('../components/LayoutStudio')['LayoutStudio']>>(() => import('../components/LayoutStudio').then((m) => ({ default: m.LayoutStudio })));
export const TikzStudio = deferredTool<ComponentProps<typeof import('../components/TikzStudio')['TikzStudio']>>(() => import('../components/TikzStudio').then((m) => ({ default: m.TikzStudio })));
