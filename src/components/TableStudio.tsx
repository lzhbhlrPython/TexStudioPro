import { useEffect, useMemo, useState } from 'react';
import { Grid2X2, Minus, Plus, Table2, X } from 'lucide-react';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  source: string;
  onClose: () => void;
  onApply: (code: string, useBooktabs: boolean) => void;
}

type Align = 'l' | 'c' | 'r';

function parseTable(source: string): { rows: string[][]; aligns: Align[]; booktabs: boolean } {
  const match = source.match(/\\begin\{(tabular|tabularx|longtable)\}(?:\[[^\]]*\])?\{([^}]*)\}([\s\S]*?)\\end\{\1\}/);
  if (!match) {
    return { rows: [['Header 1', 'Header 2'], ['Cell', 'Cell']], aligns: ['l', 'l'], booktabs: true };
  }
  const spec = match[2];
  const aligns: Align[] = [];
  for (const char of spec.replace(/\|[lcrp@{}]+/g, '')) {
    if (char === 'l' || char === 'c' || char === 'r') aligns.push(char);
  }
  const body = match[3]
    .replace(/\\(?:toprule|midrule|bottomrule|hline|endhead|endfirsthead|endfoot)\b/g, '')
    .trim();
  const rows = body
    .split(/\\\\/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split('&').map((cell) => cell.trim()));
  const width = Math.max(1, ...rows.map((row) => row.length), aligns.length);
  return {
    rows: rows.length ? rows.map((row) => Array.from({ length: width }, (_, i) => row[i] || '')) : [['Header 1', 'Header 2']],
    aligns: Array.from({ length: width }, (_, i) => aligns[i] || 'l'),
    booktabs: /\\(toprule|midrule|bottomrule)/.test(match[3]),
  };
}

export function TableStudio({ open, source, onClose, onApply }: Props) {
  const { t } = useI18n();
  const parsed = useMemo(() => parseTable(source), [source]);
  const [rows, setRows] = useState<string[][]>(parsed.rows);
  const [aligns, setAligns] = useState<Align[]>(parsed.aligns);
  const [booktabs, setBooktabs] = useState(parsed.booktabs);
  const [caption, setCaption] = useState('');
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = parseTable(source);
    setRows(next.rows);
    setAligns(next.aligns);
    setBooktabs(next.booktabs);
    setCaption('');
    setLabel('');
  }, [open, source]);

  const width = Math.max(1, ...rows.map((row) => row.length));
  const code = useMemo(() => {
    const spec = Array.from({ length: width }, (_, i) => aligns[i] || 'l').join('');
    const bodyRows = rows.map((row) => Array.from({ length: width }, (_, i) => row[i] || '').join(' & ') + ' \\\\');
    const lines = [`\\begin{tabular}{${spec}}`];
    if (booktabs) {
      lines.push('\\toprule');
      if (bodyRows.length > 1) lines.push(bodyRows[0], '\\midrule', ...bodyRows.slice(1));
      else lines.push(...bodyRows);
      lines.push('\\bottomrule');
    } else {
      lines.push('\\hline', ...bodyRows, '\\hline');
    }
    lines.push('\\end{tabular}');
    const table = lines.join('\n');
    if (!caption && !label) return table;
    return `\\begin{table}[htbp]\n\\centering\n${table}\n${caption ? `\\caption{${caption}}\n` : ''}${label ? `\\label{${label}}\n` : ''}\\end{table}`;
  }, [rows, aligns, booktabs, caption, label, width]);

  if (!open) return null;

  const setCell = (row: number, col: number, value: string) => {
    setRows((current) => current.map((cells, r) => (r === row ? cells.map((cell, c) => (c === col ? value : cell)) : cells)));
  };

  const addRow = () => setRows((current) => [...current, Array.from({ length: width }, () => '')]);
  const removeRow = () => setRows((current) => (current.length > 1 ? current.slice(0, -1) : current));
  const addColumn = () => {
    setRows((current) => current.map((cells) => [...cells, '']));
    setAligns((current) => [...current, 'l']);
  };
  const removeColumn = () => {
    if (width <= 1) return;
    setRows((current) => current.map((cells) => cells.slice(0, -1)));
    setAligns((current) => current.slice(0, -1));
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="table-studio" data-testid="table-studio" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Table2 size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Table editor')}</span>
              <h2>{t('Edit table visually')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok"><Grid2X2 size={11} /> {rows.length} × {width}</span>
            <button className="icon-btn" onClick={onClose} title={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="table-studio-body">
          <div className="table-studio-grid-pane">
            <div className="table-toolbar">
              <button className="mini-btn" onClick={addRow} title={t('Add row')}><Plus size={11} /> {t('Row')}</button>
              <button className="mini-btn" onClick={removeRow} title={t('Remove row')}><Minus size={11} /> {t('Row')}</button>
              <button className="mini-btn" onClick={addColumn} title={t('Add column')}><Plus size={11} /> {t('Column')}</button>
              <button className="mini-btn" onClick={removeColumn} title={t('Remove column')}><Minus size={11} /> {t('Column')}</button>
              <div className="spacer" />
              <label className="chart-check"><input type="checkbox" checked={booktabs} onChange={(event) => setBooktabs(event.target.checked)} /> booktabs</label>
            </div>

            <div className="table-grid-scroll">
              <table className="table-grid">
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: width }, (_, col) => (
                      <th key={col}>
                        <select value={aligns[col] || 'l'} onChange={(event) => setAligns((current) => current.map((value, i) => (i === col ? event.target.value as Align : value)))}>
                          <option value="l">{t('Left')}</option>
                          <option value="c">{t('Center')}</option>
                          <option value="r">{t('Right')}</option>
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((cells, row) => (
                    <tr key={row}>
                      <th>{row + 1}</th>
                      {Array.from({ length: width }, (_, col) => (
                        <td key={col}>
                          <input value={cells[col] || ''} onChange={(event) => setCell(row, col, event.target.value)} spellCheck={false} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-caption-row">
              <label><span>{t('Caption')}</span><input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder={t('Optional caption')} /></label>
              <label><span>{t('Label')}</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="tab:results" /></label>
            </div>
          </div>

          <div className="table-studio-preview">
            <div className="workshop-preview-head"><span>{t('Generated LaTeX')}</span></div>
            <pre className="workshop-code">{code}</pre>
          </div>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('Edits replace the selected tabular block. The source stays ordinary LaTeX.')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="primary-btn" onClick={() => onApply(code, booktabs)}>{t('Apply table')}</button>
        </footer>
      </section>
    </div>
  );
}
