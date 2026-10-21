import { useEffect, useMemo, useState } from 'react';
import { Columns3, LayoutTemplate, Ruler, Sparkles, X } from 'lucide-react';
import type { Engine } from '../types';
import { useI18n } from '../i18n';

type Paper = 'a4paper' | 'letterpaper' | 'a5paper';
type LanguageProfile = 'latin' | 'chinese' | 'japanese' | 'arabic' | 'russian';

interface LayoutState {
  paper: Paper;
  fontSize: 10 | 11 | 12;
  top: number;
  bottom: number;
  left: number;
  right: number;
  lineSpacing: number;
  twoColumn: boolean;
  pageNumbers: boolean;
  runningHeader: string;
  language: LanguageProfile;
  titleStyle: 'classic' | 'minimal';
}

export interface LayoutResult {
  documentClassOptions: string;
  preambleBlock: string;
  engine: Engine;
}

interface Props {
  open: boolean;
  documentText: string;
  onClose: () => void;
  onApply: (layout: LayoutResult) => void;
}

const defaults: LayoutState = {
  paper: 'a4paper',
  fontSize: 11,
  top: 2.5,
  bottom: 2.5,
  left: 2.5,
  right: 2.5,
  lineSpacing: 1.15,
  twoColumn: false,
  pageNumbers: true,
  runningHeader: '',
  language: 'latin',
  titleStyle: 'classic',
};

const presets: Array<{ id: string; label: string; state: Partial<LayoutState> }> = [
  { id: 'manuscript', label: 'Manuscript', state: { ...defaults } },
  {
    id: 'compact',
    label: 'Compact',
    state: { top: 1.8, bottom: 1.8, left: 1.8, right: 1.8, fontSize: 10, lineSpacing: 1.0 },
  },
  {
    id: 'two-column',
    label: 'Two columns',
    state: { twoColumn: true, top: 2.0, bottom: 2.0, left: 1.8, right: 1.8, fontSize: 10, lineSpacing: 1.0 },
  },
  {
    id: 'thesis',
    label: 'Thesis',
    state: { top: 3.0, bottom: 2.8, left: 3.2, right: 2.6, lineSpacing: 1.5, fontSize: 12 },
  },
  {
    id: 'chinese',
    label: 'Chinese ctex',
    state: {
      language: 'chinese',
      top: 2.5,
      bottom: 2.5,
      left: 2.5,
      right: 2.5,
      lineSpacing: 1.5,
      fontSize: 12,
    },
  },
];

function generate(state: LayoutState, documentText: string): LayoutResult {
  const classMatch = documentText.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/);
  const className = classMatch?.[1] || 'article';
  const isCtexClass = /^ctex/.test(className);
  const languageLines: string[] = [];
  let engine: Engine = 'pdflatex';

  if (state.language === 'chinese') {
    if (!isCtexClass) languageLines.push('\\usepackage[UTF8]{ctex}');
    engine = 'xelatex';
  } else if (state.language === 'japanese') {
    languageLines.push('\\usepackage{luatexja}');
    engine = 'lualatex';
  } else if (state.language === 'arabic') {
    languageLines.push('\\usepackage{polyglossia}', '\\setmainlanguage{arabic}', '\\setotherlanguage{english}');
    engine = 'xelatex';
  } else if (state.language === 'russian') {
    languageLines.push('\\usepackage[T2A]{fontenc}', '\\usepackage[english,russian]{babel}');
  }

  const headerLines: string[] = [];
  if (state.pageNumbers || state.runningHeader.trim()) {
    headerLines.push('\\usepackage{fancyhdr}', '\\pagestyle{fancy}', '\\fancyhf{}');
    if (state.runningHeader.trim()) headerLines.push(`\\fancyhead[L]{${state.runningHeader.trim()}}`);
    if (state.pageNumbers) headerLines.push('\\fancyfoot[C]{\\thepage}');
    headerLines.push('\\renewcommand{\\headrulewidth}{0.4pt}');
  }

  const titleLines =
    state.titleStyle === 'minimal'
      ? ['\\usepackage{titling}', '\\pretitle{\\begin{flushleft}\\LARGE\\bfseries}', '\\posttitle{\\par\\end{flushleft}\\vspace{0.8em}}']
      : ['\\usepackage{titling}', '\\pretitle{\\begin{center}\\LARGE\\bfseries}', '\\posttitle{\\par\\end{center}\\vspace{0.8em}}'];

  const block = [
    `\\usepackage[${state.paper},top=${state.top}cm,bottom=${state.bottom}cm,left=${state.left}cm,right=${state.right}cm]{geometry}`,
    '\\usepackage{setspace}',
    `\\setstretch{${state.lineSpacing}}`,
    '\\usepackage{microtype}',
    ...languageLines,
    ...headerLines,
    ...titleLines,
  ].join('\n');

  const options = [`${state.fontSize}pt`, state.paper, state.twoColumn ? 'twocolumn' : ''].filter(Boolean).join(',');
  return { documentClassOptions: options, preambleBlock: block, engine };
}

export function LayoutStudio({ open, documentText, onClose, onApply }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<LayoutState>(defaults);

  useEffect(() => {
    if (!open) return;
    const classMatch = documentText.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/);
    if (classMatch && /^ctex/.test(classMatch[1])) {
      setState({ ...defaults, language: 'chinese', lineSpacing: 1.5, fontSize: 12 });
    } else {
      setState(defaults);
    }
  }, [open, documentText]);

  const result = useMemo(() => generate(state, documentText), [state, documentText]);
  if (!open) return null;

  const update = (patch: Partial<LayoutState>) => setState((current) => ({ ...current, ...patch }));
  const previewWidth = state.paper === 'a5paper' ? 420 : state.paper === 'letterpaper' ? 520 : 500;
  const previewHeight = state.paper === 'a5paper' ? 560 : state.paper === 'letterpaper' ? 660 : 690;

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="layout-studio" data-testid="layout-studio" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><LayoutTemplate size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Page layout')}</span>
              <h2>{t('Design the page')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok"><Ruler size={11} /> geometry</span>
            <button className="icon-btn" onClick={onClose} title={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="layout-body">
          <aside className="layout-controls">
            <div className="layout-presets">
              {presets.map((preset) => (
                <button key={preset.id} onClick={() => setState({ ...state, ...preset.state })}>
                  {t(preset.label)}
                </button>
              ))}
            </div>

            <div className="layout-section">
              <div className="layout-section-title">{t('Page')}</div>
              <label className="layout-row">
                <span>{t('Paper size')}</span>
                <select value={state.paper} onChange={(event) => update({ paper: event.target.value as Paper })}>
                  <option value="a4paper">A4</option>
                  <option value="letterpaper">Letter</option>
                  <option value="a5paper">A5</option>
                </select>
              </label>
              <div className="layout-four">
                {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                  <label key={side}>
                    <span>{t(side)}</span>
                    <input
                      type="number"
                      min={0.5}
                      max={6}
                      step={0.1}
                      value={state[side]}
                      onChange={(event) => update({ [side]: Number(event.target.value) } as Partial<LayoutState>)}
                    />
                  </label>
                ))}
              </div>
              <div className="layout-hint">{t('Margins in cm')}</div>
            </div>

            <div className="layout-section">
              <div className="layout-section-title">{t('Typography')}</div>
              <label className="layout-row">
                <span>{t('Base font size')}</span>
                <select value={state.fontSize} onChange={(event) => update({ fontSize: Number(event.target.value) as LayoutState['fontSize'] })}>
                  <option value={10}>10 pt</option>
                  <option value={11}>11 pt</option>
                  <option value={12}>12 pt</option>
                </select>
              </label>
              <label className="layout-row">
                <span>{t('Line spacing')}</span>
                <select value={state.lineSpacing} onChange={(event) => update({ lineSpacing: Number(event.target.value) })}>
                  <option value={1}>1.0</option>
                  <option value={1.15}>1.15</option>
                  <option value={1.5}>1.5</option>
                  <option value={2}>2.0</option>
                </select>
              </label>
              <label className="layout-row">
                <span>{t('Title style')}</span>
                <select value={state.titleStyle} onChange={(event) => update({ titleStyle: event.target.value as LayoutState['titleStyle'] })}>
                  <option value="classic">{t('Classic centered')}</option>
                  <option value="minimal">{t('Minimal left')}</option>
                </select>
              </label>
              <label className="chart-check"><input type="checkbox" checked={state.twoColumn} onChange={(event) => update({ twoColumn: event.target.checked })} /> {t('Two-column body')}</label>
            </div>

            <div className="layout-section">
              <div className="layout-section-title">{t('Language & typesetting')}</div>
              <label className="layout-row">
                <span>{t('Document language')}</span>
                <select value={state.language} onChange={(event) => update({ language: event.target.value as LanguageProfile })}>
                  <option value="latin">{t('Latin / English')}</option>
                  <option value="chinese">{t('Chinese (ctex)')}</option>
                  <option value="japanese">{t('Japanese (luatexja)')}</option>
                  <option value="arabic">{t('Arabic (polyglossia)')}</option>
                  <option value="russian">{t('Russian (babel)')}</option>
                </select>
              </label>
              <div className="layout-engine-note">
                {t('Compile engine')}: <strong>{result.engine}</strong>
              </div>
            </div>

            <div className="layout-section">
              <div className="layout-section-title">{t('Header & footer')}</div>
              <label className="chart-check"><input type="checkbox" checked={state.pageNumbers} onChange={(event) => update({ pageNumbers: event.target.checked })} /> {t('Page numbers')}</label>
              <label className="layout-field">
                <span>{t('Running header')}</span>
                <input value={state.runningHeader} onChange={(event) => update({ runningHeader: event.target.value })} placeholder={t('Optional')} />
              </label>
            </div>
          </aside>

          <div className="layout-preview-pane">
            <div className="layout-preview-label"><Columns3 size={12} /> {t('Live page preview')}</div>
            <div
              className="layout-page"
              style={{
                width: previewWidth,
                height: previewHeight,
                paddingTop: `${state.top * 12}px`,
                paddingBottom: `${state.bottom * 12}px`,
                paddingLeft: `${state.left * 12}px`,
                paddingRight: `${state.right * 12}px`,
              }}
            >
              <div className="layout-page-header">
                {state.runningHeader || ''}
                {state.pageNumbers && <span>1</span>}
              </div>
              <div className={`layout-page-body ${state.twoColumn ? 'two-col' : ''}`} style={{ lineHeight: state.lineSpacing }}>
                <div className="layout-page-title" style={{ textAlign: state.titleStyle === 'minimal' ? 'left' : 'center' }}>
                  {t('A Visual LaTeX Document')}
                </div>
                <div className="layout-page-byline">{t('Author · 2026')}</div>
                {Array.from({ length: state.twoColumn ? 2 : 1 }, (_, column) => (
                  <div className="layout-column" key={column}>
                    <span className="layout-para" />
                    <span className="layout-para wide" />
                    <span className="layout-para" />
                    <span className="layout-para short" />
                    <div className="layout-formula">E = mc²</div>
                    <span className="layout-para wide" />
                    <span className="layout-para" />
                    <span className="layout-para short" />
                  </div>
                ))}
              </div>
            </div>
            <div className="layout-footer-note">
              <Sparkles size={11} /> {t('The layout is applied as a clean, editable preamble block.')}
            </div>
          </div>

          <aside className="layout-code-pane">
            <div className="pane-label"><Ruler size={12} /> {t('Generated preamble')}</div>
            <pre>{`\\documentclass[${result.documentClassOptions}]{...}\n\n${result.preambleBlock}`}</pre>
          </aside>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('Existing TeXPro layout blocks are replaced; your content is untouched.')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="primary-btn" onClick={() => { onApply(result); onClose(); }}>
            <LayoutTemplate size={13} /> {t('Apply layout')}
          </button>
        </footer>
      </section>
    </div>
  );
}
